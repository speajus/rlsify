/**
 * Schema store - manages database schema information
 */

import { writable, derived } from 'svelte/store';
import type { SchemaInfo, TableInfo, ForeignKeyRelation } from '@speajus/rlsify-types';
import { multiTenantSchema } from '../examples/multi-tenant-schema.js';

interface SchemaState {
  schema: SchemaInfo | null;
  loading: boolean;
  error: string | null;
  connectionString: string;
}

// Create a writable store
const state = writable<SchemaState>({
  schema: null,
  loading: false,
  error: null,
  connectionString: '',
});

// Export derived stores for easy access
export const schemaStore = {
  subscribe: state.subscribe,
};

export const schema = derived(state, $state => $state.schema);
export const loading = derived(state, $state => $state.loading);
export const error = derived(state, $state => $state.error);
export const connectionString = derived(state, $state => $state.connectionString);
export const tables = derived(state, $state => $state.schema?.tables || []);
export const foreignKeys = derived(state, $state => $state.schema?.foreignKeys || []);

/**
 * Load schema from database
 */
export async function loadSchema(connectionString: string): Promise<void> {
  state.update(s => ({ ...s, loading: true, error: null, connectionString }));

  try {
    // In a real implementation, this would call the backend API
    // For now, we'll simulate with a mock
    const response = await fetch('/api/schema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionString }),
    });

    if (!response.ok) {
      throw new Error(`Failed to load schema: ${response.statusText}`);
    }

    const schemaData: SchemaInfo = await response.json();
    state.update(s => ({ ...s, schema: schemaData, error: null, loading: false }));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    state.update(s => ({ ...s, error: errorMessage, schema: null, loading: false }));
  }
}

/**
 * Load schema from mock data (for development)
 *
 * This loads a comprehensive multi-tenant schema example with:
 * - Organizations (top-level tenant isolation)
 * - Teams (within organizations)
 * - Users (with org and team memberships)
 * - Projects and Documents (team-scoped resources)
 * - Role-based access control
 */
export function loadMockSchema(): void {
  state.update(s => ({ ...s, loading: true, error: null }));

  // Simulate async loading
  setTimeout(() => {
    state.update(s => ({ ...s, schema: multiTenantSchema, loading: false }));
  }, 500);
}

/**
 * Clear schema
 */
export function clearSchema(): void {
  state.set({
    schema: null,
    error: null,
    connectionString: '',
    loading: false,
  });
}

