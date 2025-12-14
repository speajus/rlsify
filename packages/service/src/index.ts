/**
 * RLSify Service - gRPC/Connect Backend for RLSify UI
 *
 * Provides:
 * - Schema introspection via gRPC
 * - Policy generation and validation via gRPC
 * - Policy application to database via gRPC
 *
 * Uses @speajus/diblob for dependency injection,
 * @speajus/diblob-config for configuration management, and
 * @speajus/diblob-connect for gRPC server integration.
 */

import type { Pool } from 'pg';
import {
  registerGrpcBlobs,
  grpcServer,
  grpcServiceRegistry,
} from '@speajus/diblob-connect';
import { registerLoggerBlobs } from '@speajus/diblob-logger';
import {
  SchemaServiceProto,
  PolicyServiceProto,
  HealthServiceProto,
} from '@speajus/rlsify-types';

import {
  createServiceContainer,
  databasePoolBlob,
} from './container.js';
import { SchemaServiceImpl } from './services/schema-service.js';
import { PolicyServiceImpl } from './services/policy-service.js';
import { HealthServiceImpl } from './services/health-service.js';

// Create container with configuration loaded via @speajus/diblob-config
const { container, config } = createServiceContainer();

// Register logger blobs (required by diblob-connect)
registerLoggerBlobs(container);

// Graceful shutdown
async function shutdown() {
  console.log('\nShutting down gracefully...');
  const pool = container.resolve(databasePoolBlob) as Pool;
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
async function start() {
  try {
    console.log(`Connecting to database at ${config.database.host}:${config.database.port}/${config.database.database}...`);

    // Get the database pool
    const dbPool = container.resolve(databasePoolBlob) as Pool;

    // Register gRPC server with diblob-connect
    registerGrpcBlobs(container, {
      host: config.grpc.host,
      port: config.grpc.port,
    });

    // Register gRPC services - create service instances directly
    grpcServiceRegistry.registerService(SchemaServiceProto, new SchemaServiceImpl(dbPool));
    grpcServiceRegistry.registerService(PolicyServiceProto, new PolicyServiceImpl(dbPool));
    grpcServiceRegistry.registerService(HealthServiceProto, new HealthServiceImpl(dbPool));

    // Resolve the gRPC server to start it
    await container.resolve(grpcServer);

    console.log(`\n🔒 RLSify gRPC Service running at ${config.grpc.host}:${config.grpc.port}`);
    console.log('\ngRPC Services:');
    console.log(`  rlsify.v1.SchemaService  - Database schema introspection`);
    console.log(`  rlsify.v1.PolicyService  - Policy generation and validation`);
    console.log(`  rlsify.v1.HealthService  - Health checks`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export { container, config };

