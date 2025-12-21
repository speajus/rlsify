/**
 * RLSify Desktop DI Container using @speajus/diblob
 *
 * This container is specifically for the Electron desktop application.
 * Unlike the service container, it receives database configuration at runtime
 * from the user via the connection UI.
 */

import { createBlob, createContainer as createDiblobContainer } from '@speajus/diblob';
import type { Pool as PgPool } from 'pg';
import { Pool } from 'pg';
import {
  PolicyValidator,
  JoinResolver,
} from '@speajus/rlsify-core';

// ============================================================================
// Configuration Types
// ============================================================================

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

// ============================================================================
// Infrastructure Blobs
// ============================================================================

export const pool = createBlob<PgPool>('DatabasePool');
export const dbConfig = createBlob<DatabaseConfig>('DatabaseConfig');
export const policyValidator = createBlob<PolicyValidator>('PolicyValidator');
// ============================================================================
// Container Factory
// ============================================================================

/**
 * Create a new RLSify desktop container with database configuration.
 * Unlike the service container, this receives configuration at runtime
 * from the user via the connection UI.
 *
 * @param dbConfig - Database connection configuration from user input
 */
export function registerDatabaseConfig( config: DatabaseConfig, container = createDiblobContainer()) {
  container.register(dbConfig, () => ({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ?? false,
  }));

  // Register database pool with the provided configuration
  // Construct the Pool config explicitly to ensure proper types
  container.register(pool, Pool, dbConfig);
  container.register(policyValidator, PolicyValidator, new JoinResolver());

  return container;
}

