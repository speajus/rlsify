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

export const databasePoolBlob = createBlob<PgPool>('DatabasePool');

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
export function createDesktopContainer(dbConfig: DatabaseConfig): {
  container: ReturnType<typeof createDiblobContainer>;
  config: DatabaseConfig;
  policyValidator: PolicyValidator;
} {
  const container = createDiblobContainer();

  // Register database pool with the provided configuration
  container.register(databasePoolBlob, Pool, dbConfig);

  // Create core service dependencies directly (avoid diblob version mismatch)
  const joinResolver = new JoinResolver();
  const policyValidator = new PolicyValidator(joinResolver);

  return { container, config: dbConfig, policyValidator };
}

