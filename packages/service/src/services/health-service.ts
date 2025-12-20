/**
 * Health Service Implementation - gRPC service for health checks
 */

import type { Pool } from 'pg';
import { create } from '@bufbuild/protobuf';
import type { ServiceImpl } from '@connectrpc/connect';
import {
  HealthServiceProto,
  HealthCheckResponseSchema,
  HealthCheckResponse_ServingStatus,
  ReadinessCheckResponseSchema,
  type HealthCheckRequest,
  type ReadinessCheckRequest,
} from '@speajus/rlsify-types';

const VERSION = '0.1.0';

export class HealthServiceImpl implements ServiceImpl<typeof HealthServiceProto> {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  setPool(pool: Pool) {
    this.pool = pool;
  }

  async check(_request: HealthCheckRequest) {
    return create(HealthCheckResponseSchema, {
      status: HealthCheckResponse_ServingStatus.SERVING,
      version: VERSION,
    });
  }

  async ready(_request: ReadinessCheckRequest) {
    try {
      // Test database connection
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        return create(ReadinessCheckResponseSchema, {
          ready: true,
          databaseStatus: 'connected',
        });
      } finally {
        client.release();
      }
    } catch (error) {
      return create(ReadinessCheckResponseSchema, {
        ready: false,
        databaseStatus: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

