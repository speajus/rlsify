/**
 * Electron Preload Script
 *
 * Exposes IPC methods to the renderer process via contextBridge.
 * This script runs in a sandboxed environment with access to Node.js APIs.
 *
 * Based on the pattern from gazel: https://github.com/jspears/gazel
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { IpcStreamRequest, IpcUnaryRequest, IpcStreamStartResponse } from './transport/ipc-transport.js';

/**
 * Electron API exposed to the renderer process
 */
const electronAPI = {
  /**
   * Start a streaming gRPC call
   */
  stream(request: IpcStreamRequest): Promise<IpcStreamStartResponse> {
    return ipcRenderer.invoke('grpc:stream:start', request);
  },

  /**
   * Make a unary gRPC call
   */
  unary(request: IpcUnaryRequest): Promise<unknown> {
    return ipcRenderer.invoke('grpc:unary', request);
  },

  /**
   * Listen for events on a specific channel
   */
  onEvent(channel: string, listener: (...args: unknown[]) => void): void {
    // Wrap the listener to match Electron's expected signature
    const wrappedListener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
      listener(_event, ...args);
    };
    ipcRenderer.on(channel, wrappedListener);
  },

  /**
   * Remove an event listener from a channel
   */
  removeEventListener(channel: string, listener: (...args: unknown[]) => void): void {
    ipcRenderer.removeListener(channel, listener as (...args: unknown[]) => void);
  },

  /**
   * Cancel a streaming call
   */
  cancelStream(streamId: string): void {
    ipcRenderer.send('grpc:stream:cancel', streamId);
  },

  /**
   * Connect to a database
   */
  connectDatabase(config: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    return ipcRenderer.invoke('database:connect', config);
  },

  /**
   * Disconnect from the database
   */
  disconnectDatabase(): Promise<void> {
    return ipcRenderer.invoke('database:disconnect');
  },

  /**
   * Get current database connection status
   */
  getDatabaseStatus(): Promise<{ connected: boolean; database?: string; host?: string }> {
    return ipcRenderer.invoke('database:status');
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for the renderer process
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}

