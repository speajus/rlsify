/**
 * Supabase DI Container
 */

import { createBlob, createContainer as createDiblobContainer } from '@speajus/diblob';
import { SupabasePolicyGenerator } from './supabase-policy-generator.js';
import { SupabaseMigrationGenerator } from './supabase-migration-generator.js';

// Create blobs for Supabase services
export const supabasePolicyGeneratorBlob = createBlob<SupabasePolicyGenerator>('SupabasePolicyGenerator');
export const supabaseMigrationGeneratorBlob = createBlob<SupabaseMigrationGenerator>('SupabaseMigrationGenerator');

/**
 * Create a new Supabase container instance with all services registered
 */
export function createSupabaseContainer() {
  const container = createDiblobContainer();

  // Register Supabase services
  container.register(supabasePolicyGeneratorBlob, SupabasePolicyGenerator);
  container.register(supabaseMigrationGeneratorBlob, SupabaseMigrationGenerator);

  return container;
}

