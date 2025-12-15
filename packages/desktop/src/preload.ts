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
  getDatabaseStatus(): Promise<{
    connected: boolean;
    database?: string;
    host?: string;
    port?: number;
    user?: string;
  }> {
    return ipcRenderer.invoke('database:status');
  },

  /**
   * List all saved connections
   */
  listConnections(): Promise<SavedConnection[]> {
    return ipcRenderer.invoke('database:listConnections');
  },

  /**
   * Save a new connection or update existing one
   */
  saveConnection(connection: Omit<SavedConnection, 'id' | 'createdAt'> & { id?: string }): Promise<SavedConnection> {
    return ipcRenderer.invoke('database:saveConnection', connection);
  },

  /**
   * Delete a saved connection
   */
  deleteConnection(connectionId: string): Promise<void> {
    return ipcRenderer.invoke('database:deleteConnection', connectionId);
  },

  /**
   * Get the last used connection ID
   */
  getLastConnectionId(): Promise<string | null> {
    return ipcRenderer.invoke('database:getLastConnectionId');
  },

  /**
   * Set the last used connection ID
   */
  setLastConnectionId(connectionId: string): Promise<void> {
    return ipcRenderer.invoke('database:setLastConnectionId', connectionId);
  },

  /**
   * Open a new window (optionally with a specific connection)
   */
  openNewWindow(connectionId?: string): Promise<{ success: boolean }> {
    return ipcRenderer.invoke('database:openNewWindow', connectionId);
  },

  /**
   * Listen for connect-to-database event (for new windows)
   */
  onConnectToDatabase(callback: (connectionId: string) => void): void {
    ipcRenderer.on('connect-to-database', (_event, connectionId: string) => {
      callback(connectionId);
    });
  },
};

// Type for saved connection (mirrors main process type)
interface SavedConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for the renderer process
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}

