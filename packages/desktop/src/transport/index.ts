/**
 * IPC Transport Module
 *
 * Exports the IPC transport for Connect-RPC communication over Electron IPC.
 */

export {
  createIpcTransport,
  type IpcRendererApi,
  type IpcStreamRequest,
  type IpcUnaryRequest,
  type IpcStreamStartResponse,
} from './ipc-transport.js';

