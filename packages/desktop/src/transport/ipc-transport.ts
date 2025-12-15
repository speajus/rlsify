/**
 * IPC Transport for Connect-RPC
 *
 * Creates a Connect transport that uses Electron IPC for communication.
 * This transport handles both unary and streaming calls by sending messages over IPC.
 *
 * Based on the pattern from gazel: https://github.com/jspears/gazel
 */

import type {
  DescMessage,
  MessageInitShape,
  MessageShape,
  DescMethodStreaming,
  DescMethodUnary,
} from '@bufbuild/protobuf';
import { fromBinary } from '@bufbuild/protobuf';
import type { Transport, StreamResponse, UnaryResponse } from '@connectrpc/connect';
import { Code, ConnectError } from '@connectrpc/connect';

/**
 * IPC request for streaming gRPC calls
 */
export interface IpcStreamRequest {
  streamId: string;
  service: string;
  method: string;
  message: unknown;
}

/**
 * IPC request for unary gRPC calls
 */
export interface IpcUnaryRequest {
  service: string;
  method: string;
  message: unknown;
}

/**
 * Response from starting a stream
 */
export interface IpcStreamStartResponse {
  success: boolean;
}

/**
 * Interface for the IPC renderer API exposed via preload
 */
export interface IpcRendererApi {
  /** Start a streaming gRPC call */
  stream(request: IpcStreamRequest): Promise<IpcStreamStartResponse>;

  /** Make a unary gRPC call */
  unary(request: IpcUnaryRequest): Promise<unknown>;

  /** Listen for events on a specific channel */
  onEvent(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;

  /** Remove an event listener from a channel */
  removeEventListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;

  /** Cancel a streaming call */
  cancelStream?(streamId: string): void;
}

/**
 * Creates an async iterable from IPC events.
 * This is similar to createAsyncIterable from Connect but implemented manually.
 */
function createAsyncIterableFromIpc<T>(
  setup: (push: (value: T) => void, complete: () => void, error: (err: Error) => void) => () => void
): AsyncIterable<T> {
  const queue: Array<{ type: 'value'; value: T } | { type: 'complete' } | { type: 'error'; error: Error }> = [];
  const resolvers: Array<(result: IteratorResult<T>) => void> = [];
  let cleanup: (() => void) | null = null;
  let isDone = false;

  const push = (value: T) => {
    if (resolvers.length > 0) {
      const resolve = resolvers.shift();
      if (resolve) resolve({ value, done: false });
    } else {
      queue.push({ type: 'value', value });
    }
  };

  const complete = () => {
    isDone = true;
    while (resolvers.length > 0) {
      const resolve = resolvers.shift();
      if (resolve) resolve({ value: undefined as unknown as T, done: true });
    }
    if (cleanup) cleanup();
  };

  const error = (err: Error) => {
    queue.push({ type: 'error', error: err });
    isDone = true;
    if (cleanup) cleanup();
  };

  cleanup = setup(push, complete, error);

  return {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<T>> {
          // Process queued items first
          while (queue.length > 0) {
            const item = queue.shift();
            if (!item) continue;

            if (item.type === 'error') {
              throw item.error;
            }
            if (item.type === 'complete') {
              return { value: undefined as unknown as T, done: true };
            }
            return { value: item.value, done: false };
          }

          // If done and no queued items, return done
          if (isDone) {
            return { value: undefined as unknown as T, done: true };
          }

          // Wait for next item
          return new Promise<IteratorResult<T>>((resolve) => {
            resolvers.push(resolve);
          });
        },
        async return(): Promise<IteratorResult<T>> {
          if (cleanup) cleanup();
          isDone = true;
          return { value: undefined as unknown as T, done: true };
        },
        async throw(err: unknown): Promise<IteratorResult<T>> {
          if (cleanup) cleanup();
          throw err;
        },
      };
    },
  };
}

/**
 * Creates a Connect transport that uses Electron IPC for communication.
 * This transport handles both unary and streaming calls by sending messages over IPC.
 *
 * @param ipcRenderer - The IPC renderer API exposed via preload script
 * @returns A Connect Transport implementation
 */
export function createIpcTransport(ipcRenderer: IpcRendererApi): Transport {
  return {
    async unary<I extends DescMessage, O extends DescMessage>(
      method: DescMethodUnary<I, O>,
      _signal: AbortSignal | undefined,
      _timeoutMs: number | undefined,
      _header: HeadersInit | undefined,
      message: MessageInitShape<I>
    ): Promise<UnaryResponse<I, O>> {
      try {
        const methodName = method.localName;
        const service = method.parent;
        const response = await ipcRenderer.unary({
          service: service.typeName,
          method: methodName,
          message,
        });

        return {
          stream: false,
          service,
          method,
          header: new Headers(),
          message: response as MessageShape<O>,
          trailer: new Headers(),
        };
      } catch (error) {
        console.error('Unary call error:', error);
        throw new ConnectError(
          error instanceof Error ? error.message : String(error),
          Code.Unknown
        );
      }
    },

    async stream<I extends DescMessage, O extends DescMessage>(
      method: DescMethodStreaming<I, O>,
      signal: AbortSignal | undefined,
      _timeoutMs: number | undefined,
      _header: HeadersInit | undefined,
      message: AsyncIterable<MessageInitShape<I>>
    ): Promise<StreamResponse<I, O>> {
      const methodName = method.localName;
      const service = method.parent;
      const streamId = `stream_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      // For client streaming, collect all messages first
      const messages: MessageInitShape<I>[] = [];
      for await (const msg of message) {
        messages.push(msg);
      }

      // Create async iterable for response messages
      const responseMessages = createAsyncIterableFromIpc<MessageShape<O>>((push, complete, error) => {
        const dataChannel = `grpc:stream:${streamId}:data`;
        const completeChannel = `grpc:stream:${streamId}:complete`;
        const errorChannel = `grpc:stream:${streamId}:error`;

        // Use wrapper types for event listeners to match IPC API
        const dataListener = (_event: unknown, ...args: unknown[]) => {
          try {
            const data = args[0] as Uint8Array;
            const msg = fromBinary(method.output, data);
            push(msg as MessageShape<O>);
          } catch (err) {
            error(err instanceof Error ? err : new Error(String(err)));
          }
        };

        const completeListener = () => {
          complete();
        };

        const errorListener = (_event: unknown, ...args: unknown[]) => {
          const errMsg = args[0] as string;
          error(new ConnectError(errMsg, Code.Unknown));
        };

        ipcRenderer.onEvent(dataChannel, dataListener);
        ipcRenderer.onEvent(completeChannel, completeListener);
        ipcRenderer.onEvent(errorChannel, errorListener);

        // Start the stream
        ipcRenderer.stream({
          streamId,
          service: service.typeName,
          method: methodName,
          message: messages.length === 1 ? messages[0] : messages,
        }).catch((err) => {
          error(err instanceof Error ? err : new Error(String(err)));
        });

        // Return cleanup function
        return () => {
          ipcRenderer.removeEventListener(dataChannel, dataListener);
          ipcRenderer.removeEventListener(completeChannel, completeListener);
          ipcRenderer.removeEventListener(errorChannel, errorListener);
          if (ipcRenderer.cancelStream) {
            ipcRenderer.cancelStream(streamId);
          }
        };
      });

      // Handle abort signal
      if (signal) {
        signal.addEventListener('abort', () => {
          if (ipcRenderer.cancelStream) {
            ipcRenderer.cancelStream(streamId);
          }
        });
      }

      return {
        stream: true,
        service,
        method,
        header: new Headers(),
        message: responseMessages,
        trailer: new Headers(),
      };
    },
  };
}

