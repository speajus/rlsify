/**
 * RLSify Service DI Container using @speajus/diblob
 */

import { createBlob, createContainer as createDiblobContainer } from '@speajus/diblob';
import type { Pool as PgPool } from 'pg';
import { Pool } from 'pg';

import { SchemaServiceImpl } from './services/schema-service.js';
import { PolicyServiceImpl } from './services/policy-service.js';
import { HealthServiceImpl } from './services/health-service.js';
import { registerConfigBlobs, type ServiceConfig } from './config.js';

// Re-export config types and blobs for convenience
export { databaseConfigBlob, grpcConfigBlob } from './config.js';
export type { DatabaseConfig, GrpcConfig, ServiceConfig } from './config.js';

// ============================================================================
// Infrastructure Blobs
// ============================================================================

export const databasePoolBlob = createBlob<PgPool>('DatabasePool');

// ============================================================================
// Service Implementation Blobs
// ============================================================================

export const schemaServiceBlob = createBlob<SchemaServiceImpl>('SchemaService');
export const policyServiceBlob = createBlob<PolicyServiceImpl>('PolicyService');
export const healthServiceBlob = createBlob<HealthServiceImpl>('HealthService');

// ============================================================================
// Container Factory
// ============================================================================

/**
 * Create a new RLSify service container with all dependencies registered.
 * Configuration is loaded automatically from environment variables using
 * @speajus/diblob-config.
 *
 * Environment variables (with RLSIFY_ prefix):
 * - RLSIFY_DATABASE_HOST, RLSIFY_DATABASE_PORT, etc.
 *
 * Legacy environment variables (also supported):
 * - POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
 * - GRPC_HOST, GRPC_PORT
 */
export function createServiceContainer(): { container: ReturnType<typeof createDiblobContainer>; config: ServiceConfig } {
  const container = createDiblobContainer();

  // Register configuration blobs using @speajus/diblob-config
  const config = registerConfigBlobs(container);

  // Create infrastructure instances eagerly
  const dbPool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
  });

  // Register database pool
  container.register(databasePoolBlob, () => dbPool);

  // Register service implementations
  container.register(schemaServiceBlob, () => new SchemaServiceImpl(dbPool));
  container.register(policyServiceBlob, () => new PolicyServiceImpl(dbPool));
  container.register(healthServiceBlob, () => new HealthServiceImpl(dbPool));

  return { container, config };
}

