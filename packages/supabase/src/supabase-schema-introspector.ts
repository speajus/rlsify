/**
 * SupabaseSchemaIntrospector - Schema introspection using Supabase client
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SchemaIntrospector, DatabaseConnection } from '@speajus/rlsify-core';

export class SupabaseSchemaIntrospector extends SchemaIntrospector {
  constructor(private supabaseClient: SupabaseClient) {
    // Create database connection adapter for Supabase
    const connection: DatabaseConnection = {
      async query<T = any>(sql: string, params?: any[]) {
        const { data, error } = await supabaseClient.rpc('exec_query', {
          query: sql,
          params: params || [],
        });

        if (error) {
          throw new Error(`Query failed: ${error.message}`);
        }

        return { rows: (data || []) as T[] };
      },
    };

    super(connection);
  }

  /**
   * Get Supabase client
   */
  getClient(): SupabaseClient {
    return this.supabaseClient;
  }
}

