/**
 * Connection store - manages database connection state
 * Uses Connect-Web client to communicate with gRPC backend
 */

import { writable, derived } from 'svelte/store';
import type { DatabaseConnection } from '@speajus/rlsify-types';
import { connectionClient } from '../api/client.js';

interface ConnectionState {
  connected: boolean;
  currentConnection: {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    connectionId?: string;
  } | null;
  savedConnections: DatabaseConnection[];
  lastConnectionId: string | null;
  loading: boolean;
  error: string | null;
}

const state = writable<ConnectionState>({
  connected: false,
  currentConnection: null,
  savedConnections: [],
  lastConnectionId: null,
  loading: false,
  error: null,
});

// Derived stores for easy access
export const connected = derived(state, $state => $state.connected);
export const currentConnection = derived(state, $state => $state.currentConnection);
export const savedConnections = derived(state, $state => $state.savedConnections);
export const connectionLoading = derived(state, $state => $state.loading);
export const connectionError = derived(state, $state => $state.error);

/**
 * Check connection status
 */
export async function checkConnectionStatus(): Promise<void> {
  try {
    const response = await connectionClient.getStatus({});
    state.update(s => ({
      ...s,
      connected: response.connected,
      currentConnection: response.connected ? {
        host: response.host,
        port: response.port,
        database: response.database,
        user: response.user,
        connectionId: response.connectionId,
      } : null,
      // Capture any error returned from the service (e.g., database connection failed)
      error: response.error ?? null,
    }));
  } catch (error) {
    state.update(s => ({
      ...s,
      connected: false,
      currentConnection: null,
      error: error instanceof Error ? error.message : 'Failed to check connection status',
    }));
  }
}

/**
 * Connect to a database
 */
export async function connect(params: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  state.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await connectionClient.connect({
      host: params.host,
      port: params.port,
      database: params.database,
      user: params.user,
      password: params.password,
      ssl: params.ssl ?? false,
    });

    if (response.success) {
      state.update(s => ({
        ...s,
        connected: true,
        currentConnection: {
          host: params.host,
          port: params.port,
          database: params.database,
          user: params.user,
          connectionId: response.connectionId,
        },
        loading: false,
        error: null,
      }));
      return { success: true };
    } else {
      state.update(s => ({
        ...s,
        loading: false,
        error: response.error ?? 'Connection failed',
      }));
      return { success: false, error: response.error };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Connection failed';
    state.update(s => ({
      ...s,
      loading: false,
      error: errorMsg,
    }));
    return { success: false, error: errorMsg };
  }
}

/**
 * Disconnect from the current database
 */
export async function disconnect(): Promise<void> {
  try {
    await connectionClient.disconnect({});
    state.update(s => ({
      ...s,
      connected: false,
      currentConnection: null,
    }));
  } catch (error) {
    state.update(s => ({
      ...s,
      error: error instanceof Error ? error.message : 'Disconnect failed',
    }));
  }
}

/**
 * Load saved connections
 */
export async function loadSavedConnections(): Promise<void> {
  try {
    const response = await connectionClient.listConnections({});
    state.update(s => ({
      ...s,
      savedConnections: response.connections as DatabaseConnection[],
      lastConnectionId: response.lastConnectionId ?? null,
    }));
  } catch (error) {
    console.error('Failed to load saved connections:', error);
  }
}

/**
 * Save a connection
 */
export async function saveConnection(params: {
  id?: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}): Promise<DatabaseConnection | null> {
  try {
    const response = await connectionClient.saveConnection({
      id: params.id,
      name: params.name,
      host: params.host,
      port: params.port,
      database: params.database,
      user: params.user,
      password: params.password,
      ssl: params.ssl ?? false,
    });

    if (response.connection) {
      await loadSavedConnections();
      return response.connection as DatabaseConnection;
    }
    return null;
  } catch (error) {
    console.error('Failed to save connection:', error);
    return null;
  }
}

/**
 * Delete a saved connection
 */
export async function deleteConnection(id: string): Promise<boolean> {
  try {
    const response = await connectionClient.deleteConnection({ id });
    if (response.deleted) {
      await loadSavedConnections();
    }
    return response.deleted;
  } catch (error) {
    console.error('Failed to delete connection:', error);
    return false;
  }
}

/**
 * Clear connection error
 */
export function clearConnectionError(): void {
  state.update(s => ({ ...s, error: null }));
}
