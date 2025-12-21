/**
 * Connection store - manages database connection state
 * Uses Connect-Web client to communicate with gRPC backend
 * Persists connection info to localStorage
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

// LocalStorage keys
const STORAGE_KEY_CONNECTIONS = 'rlsify_connections';
const STORAGE_KEY_LAST_CONNECTION = 'rlsify_last_connection_id';

// Helper functions for localStorage
function loadConnectionsFromStorage(): DatabaseConnection[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_CONNECTIONS);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load connections from localStorage:', error);
    return [];
  }
}

function saveConnectionsToStorage(connections: DatabaseConnection[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_CONNECTIONS, JSON.stringify(connections));
  } catch (error) {
    console.error('Failed to save connections to localStorage:', error);
  }
}

function loadLastConnectionIdFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY_LAST_CONNECTION);
  } catch (error) {
    console.error('Failed to load last connection ID from localStorage:', error);
    return null;
  }
}

function saveLastConnectionIdToStorage(id: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEY_LAST_CONNECTION, id);
    } else {
      localStorage.removeItem(STORAGE_KEY_LAST_CONNECTION);
    }
  } catch (error) {
    console.error('Failed to save last connection ID to localStorage:', error);
  }
}

// Initialize state with data from localStorage
const state = writable<ConnectionState>({
  connected: false,
  currentConnection: null,
  savedConnections: loadConnectionsFromStorage(),
  lastConnectionId: loadLastConnectionIdFromStorage(),
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
 * Load saved connections from localStorage
 */
export async function loadSavedConnections(): Promise<void> {
  try {
    // Load from localStorage (primary source for web UI)
    const connections = loadConnectionsFromStorage();
    const lastConnectionId = loadLastConnectionIdFromStorage();

    state.update(s => ({
      ...s,
      savedConnections: connections,
      lastConnectionId,
    }));
  } catch (error) {
    console.error('Failed to load saved connections:', error);
  }
}

/**
 * Save a connection to localStorage
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
    const connections = loadConnectionsFromStorage();
    const now = BigInt(Date.now());

    let connection: DatabaseConnection;

    if (params.id) {
      // Update existing connection
      const index = connections.findIndex(c => c.id === params.id);
      if (index >= 0) {
        connection = {
          ...connections[index],
          name: params.name,
          host: params.host,
          port: params.port,
          database: params.database,
          user: params.user,
          password: params.password,
          ssl: params.ssl ?? false,
          lastUsedAt: now,
        };
        connections[index] = connection;
      } else {
        // ID provided but not found, create new
        connection = {
          id: params.id,
          name: params.name,
          host: params.host,
          port: params.port,
          database: params.database,
          user: params.user,
          password: params.password,
          ssl: params.ssl ?? false,
          createdAt: now,
          lastUsedAt: now,
        };
        connections.push(connection);
      }
    } else {
      // Create new connection
      connection = {
        id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: params.name,
        host: params.host,
        port: params.port,
        database: params.database,
        user: params.user,
        password: params.password,
        ssl: params.ssl ?? false,
        createdAt: now,
        lastUsedAt: now,
      };
      connections.push(connection);
    }

    // Save to localStorage
    saveConnectionsToStorage(connections);
    saveLastConnectionIdToStorage(connection.id);

    // Update state
    state.update(s => ({
      ...s,
      savedConnections: connections,
      lastConnectionId: connection.id,
    }));

    return connection;
  } catch (error) {
    console.error('Failed to save connection:', error);
    return null;
  }
}

/**
 * Delete a saved connection from localStorage
 */
export async function deleteConnection(id: string): Promise<boolean> {
  try {
    const connections = loadConnectionsFromStorage();
    const filtered = connections.filter(c => c.id !== id);

    if (filtered.length < connections.length) {
      saveConnectionsToStorage(filtered);

      // Clear last connection ID if it was deleted
      const lastConnectionId = loadLastConnectionIdFromStorage();
      if (lastConnectionId === id) {
        saveLastConnectionIdToStorage(null);
      }

      // Update state
      state.update(s => ({
        ...s,
        savedConnections: filtered,
        lastConnectionId: s.lastConnectionId === id ? null : s.lastConnectionId,
      }));

      return true;
    }
    return false;
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

/**
 * Retrieve the last used connection from localStorage
 */
export function retrieveLastConnection(): DatabaseConnection | null {
  const connections = loadConnectionsFromStorage();
  const lastConnectionId = loadLastConnectionIdFromStorage();

  if (lastConnectionId && connections.length > 0) {
    return connections.find(c => c.id === lastConnectionId) ?? null;
  }

  return null;
}
