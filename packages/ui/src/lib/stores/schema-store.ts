/**
 * Schema store - manages database schema information
 * Uses Connect-Web client to communicate with gRPC backend
 */

import { writable, derived } from 'svelte/store';
import type { SchemaInfo } from '@speajus/rlsify-types';
import { schemaClient } from '../api/client.js';
import { multiTenantSchema } from '../examples/multi-tenant-schema.js';

interface SchemaState {
  schema: SchemaInfo | null;
  currentSchema: string;
  availableSchemas: string[];
  loading: boolean;
  error: string | null;
}

// Common PostgreSQL schemas - can be expanded when we add a listSchemas API
const DEFAULT_SCHEMAS = ['public', 'auth', 'storage', 'extensions', 'graphql', 'graphql_public', 'realtime', 'supabase_functions'];

// Create a writable store
const state = writable<SchemaState>({
  schema: null,
  currentSchema: 'public',
  availableSchemas: DEFAULT_SCHEMAS,
  loading: false,
  error: null,
});

// Export derived stores for easy access
export const schemaStore = {
  subscribe: state.subscribe,
};

export const schema = derived(state, $state => $state.schema);
export const loading = derived(state, $state => $state.loading);
export const error = derived(state, $state => $state.error);
export const tables = derived(state, $state => $state.schema?.tables || []);
export const foreignKeys = derived(state, $state => $state.schema?.foreignKeys || []);
export const currentSchema = derived(state, $state => $state.currentSchema);
export const availableSchemas = derived(state, $state => $state.availableSchemas);

/**
 * Load schema from database via the RLSify gRPC service
 */
export async function loadSchema(schemaName: string = 'public'): Promise<void> {
  state.update(s => ({ ...s, loading: true, error: null, currentSchema: schemaName }));

  try {
    // Call the gRPC service via Connect-Web
    const response = await schemaClient.getSchema({ schema: schemaName });

    if (response.schema) {
      // Convert proto types to local types
      const schemaData: SchemaInfo = {
        tables: response.schema.tables.map(t => ({
          schema: t.schema,
          name: t.name,
          columns: t.columns.map(c => ({
            name: c.name,
            type: c.type,
            nullable: c.nullable,
            defaultValue: c.defaultValue,
            isPrimaryKey: c.isPrimaryKey,
            isForeignKey: c.isForeignKey,
          })),
          foreignKeys: t.foreignKeys.map(fk => ({
            sourceTable: fk.sourceTable,
            sourceColumn: fk.sourceColumn,
            targetTable: fk.targetTable,
            targetColumn: fk.targetColumn,
            constraintName: fk.constraintName,
          })),
          primaryKeys: [...t.primaryKeys],
        })),
        foreignKeys: response.schema.foreignKeys.map(fk => ({
          sourceTable: fk.sourceTable,
          sourceColumn: fk.sourceColumn,
          targetTable: fk.targetTable,
          targetColumn: fk.targetColumn,
          constraintName: fk.constraintName,
        })),
      };
      state.update(s => ({ ...s, schema: schemaData, error: null, loading: false }));
    }
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
    loading: false,
  });
}

