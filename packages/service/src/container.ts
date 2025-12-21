/**
 * RLSify Service DI Container using @speajus/diblob
 */

import { createBlob, createContainer as createDiblobContainer } from '@speajus/diblob';
import type { Pool as PgPool } from 'pg';
import { Pool } from 'pg';

import { SchemaServiceImpl } from './services/schema-service.js';
import { PolicyServiceImpl } from './services/policy-service.js';
import { HealthServiceImpl } from './services/health-service.js';
import { registerConfigBlobs, serviceConfig } from './config.js';
import { policyValidator } from '@speajus/rlsify-core';

// Re-export config types and blobs for convenience
export { databaseConfig as databaseConfigBlob, grpcConfig as grpcConfigBlob } from './config.js';
export type { DatabaseConfig, GrpcConfig, ServiceConfig } from './config.js';

// ============================================================================
// Infrastructure Blobs
// ============================================================================

export const databasePool = createBlob<PgPool>('DatabasePool');

// ============================================================================
// Service Implementation Blobs
// ============================================================================

export const schemaService = createBlob<SchemaServiceImpl>('SchemaService');
export const policyService = createBlob<PolicyServiceImpl>('PolicyService');
export const healthService = createBlob<HealthServiceImpl>('HealthService');

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
export function registerService(container = createDiblobContainer()){
  // Register configuration blobs using @speajus/diblob-config
  registerConfigBlobs(container);

  // Create infrastructure instances eagerly
  // Register database pool
  container.register(databasePool, Pool, {
    host: serviceConfig.database.host,
    port: serviceConfig.database.port,
    database: serviceConfig.database.database,
    user: serviceConfig.database.user,
    password: serviceConfig.database.password,
  });

  // Register service implementations
  container.register(schemaService, SchemaServiceImpl, databasePool);
  container.register(policyService, PolicyServiceImpl, databasePool, policyValidator);
  container.register(healthService, HealthServiceImpl, databasePool);

  return container;
}

