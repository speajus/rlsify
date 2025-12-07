/**
 * @speajus/rlsify-supabase
 * Supabase adapter for rlsify
 */

// Re-export core types
export * from '@speajus/rlsify-types';

// Export Supabase-specific services
export { SupabaseAdapter } from './supabase-adapter.js';
export { SupabasePolicyGenerator } from './supabase-policy-generator.js';
export { SupabaseMigrationGenerator } from './supabase-migration-generator.js';
export { SupabaseSchemaIntrospector } from './supabase-schema-introspector.js';

// Export DI container
export { createSupabaseContainer } from './container.js';
export * from './container.js';

// Export auth templates
export * from './templates/index.js';

