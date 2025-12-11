/**
 * RLSify Service DI Container using @speajus/diblob
 */

import { createBlob, createContainer as createDiblobContainer } from '@speajus/diblob';
import type { Pool as PgPool } from 'pg';
import { Pool } from 'pg';

import { SchemaServiceImpl } from './services/schema-service.js';
import { PolicyServiceImpl } from './services/policy-service.js';
import { HealthServiceImpl } from './services/health-service.js';

// ============================================================================
// Configuration Blobs
// ============================================================================

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface GrpcConfig {
  host: string;
  port: number;
}

export const databaseConfigBlob = createBlob<DatabaseConfig>('DatabaseConfig');
export const grpcConfigBlob = createBlob<GrpcConfig>('GrpcConfig');

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

export interface ServiceContainerOptions {
  database: DatabaseConfig;
  grpc: GrpcConfig;
}

/**
 * Create a new RLSify service container with all dependencies registered
 */
export function createServiceContainer(options: ServiceContainerOptions) {
  const container = createDiblobContainer();

  // Create infrastructure instances eagerly
  const dbPool = new Pool({
    host: options.database.host,
    port: options.database.port,
    database: options.database.database,
    user: options.database.user,
    password: options.database.password,
  });

  // Register configuration
  container.register(databaseConfigBlob, () => options.database);
  container.register(grpcConfigBlob, () => options.grpc);

  // Register database pool
  container.register(databasePoolBlob, () => dbPool);

  // Register service implementations
  container.register(schemaServiceBlob, () => new SchemaServiceImpl(dbPool));
  container.register(policyServiceBlob, () => new PolicyServiceImpl(dbPool));
  container.register(healthServiceBlob, () => new HealthServiceImpl(dbPool));

  return container;
}

/**
 * Load configuration from environment variables
 */
export function loadConfigFromEnv(): ServiceContainerOptions {
  return {
    database: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DB || 'rlsify',
      user: process.env.POSTGRES_USER || 'rlsify',
      password: process.env.POSTGRES_PASSWORD || 'rlsify_dev_password',
    },
    grpc: {
      host: process.env.GRPC_HOST || '0.0.0.0',
      port: parseInt(process.env.GRPC_PORT || '50051', 10),
    },
  };
}

