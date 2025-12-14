/**
 * Configuration schema and loader for RLSify Service
 * Uses @speajus/diblob-config with Zod for validation
 */

import { z } from 'zod';
import { loadConfig, registerConfigBlob } from '@speajus/diblob-config';
import { createBlob, type Container } from '@speajus/diblob';

// ============================================================================
// Configuration Schemas
// ============================================================================

export const DatabaseConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.coerce.number().int().min(1).max(65535).default(5432),
  database: z.string().default('rlsify'),
  user: z.string().default('rlsify'),
  password: z.string().default('rlsify_dev_password'),
});

export const GrpcConfigSchema = z.object({
  host: z.string().default('0.0.0.0'),
  port: z.coerce.number().int().min(1).max(65535).default(50051),
});

export const ServiceConfigSchema = z.object({
  database: DatabaseConfigSchema,
  grpc: GrpcConfigSchema,
});

// ============================================================================
// Configuration Types (inferred from schemas)
// ============================================================================

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type GrpcConfig = z.infer<typeof GrpcConfigSchema>;
export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;

// ============================================================================
// Configuration Blobs
// ============================================================================

export const serviceConfigBlob = createBlob<ServiceConfig>('ServiceConfig');
export const databaseConfigBlob = createBlob<DatabaseConfig>('DatabaseConfig');
export const grpcConfigBlob = createBlob<GrpcConfig>('GrpcConfig');

// ============================================================================
// Configuration Loader
// ============================================================================

/**
 * Load service configuration from environment variables
 * 
 * Environment variable mapping:
 * - RLSIFY_DATABASE_HOST -> database.host
 * - RLSIFY_DATABASE_PORT -> database.port
 * - RLSIFY_DATABASE_DATABASE -> database.database
 * - RLSIFY_DATABASE_USER -> database.user
 * - RLSIFY_DATABASE_PASSWORD -> database.password
 * - RLSIFY_GRPC_HOST -> grpc.host
 * - RLSIFY_GRPC_PORT -> grpc.port
 * 
 * Also supports legacy env vars without prefix:
 * - POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
 * - GRPC_HOST, GRPC_PORT
 */
export function loadServiceConfig(): ServiceConfig {
  // Build file config from legacy environment variables for backwards compatibility
  const legacyFileConfig = {
    database: {
      host: process.env.POSTGRES_HOST,
      port: process.env.POSTGRES_PORT,
      database: process.env.POSTGRES_DB,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
    },
    grpc: {
      host: process.env.GRPC_HOST,
      port: process.env.GRPC_PORT,
    },
  };

  // Remove undefined values
  const cleanLegacyConfig = JSON.parse(JSON.stringify(legacyFileConfig));

  return loadConfig({
    schema: ServiceConfigSchema,
    env: process.env as Record<string, string | undefined>,
    envPrefix: 'RLSIFY_',
    fileConfig: cleanLegacyConfig,
    defaults: {
      database: {
        host: 'localhost',
        port: 5432,
        database: 'rlsify',
        user: 'rlsify',
        password: 'rlsify_dev_password',
      },
      grpc: {
        host: '0.0.0.0',
        port: 50051,
      },
    },
  });
}

// ============================================================================
// Container Registration
// ============================================================================

/**
 * Register configuration blobs with the DI container
 */
export function registerConfigBlobs(container: Container): ServiceConfig {
  const config = loadServiceConfig();

  // Register full config
  registerConfigBlob(container, serviceConfigBlob, {
    schema: ServiceConfigSchema,
    env: process.env as Record<string, string | undefined>,
    envPrefix: 'RLSIFY_',
    fileConfig: {
      database: {
        host: process.env.POSTGRES_HOST,
        port: process.env.POSTGRES_PORT,
        database: process.env.POSTGRES_DB,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
      },
      grpc: {
        host: process.env.GRPC_HOST,
        port: process.env.GRPC_PORT,
      },
    },
  });

  // Register individual config sections for convenience
  container.register(databaseConfigBlob, () => config.database);
  container.register(grpcConfigBlob, () => config.grpc);

  return config;
}

