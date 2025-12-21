/**
 * ConnectionServiceImpl - Manages database connections dynamically
 *
 * This service allows the web UI to connect to different databases,
 * save connection configurations, and switch between connections.
 */

import { create } from '@bufbuild/protobuf';
import type { ServiceImpl } from '@connectrpc/connect';
import { Pool } from 'pg';
import {
  ConnectionServiceProto,
  ConnectDatabaseResponseSchema,
  DisconnectDatabaseResponseSchema,
  GetConnectionStatusResponseSchema,
  SaveConnectionResponseSchema,
  ListConnectionsResponseSchema,
  DeleteConnectionResponseSchema,
  type ConnectDatabaseRequest,
  type DisconnectDatabaseRequest,
  type GetConnectionStatusRequest,
  type SaveConnectionRequest,
  type ListConnectionsRequest,
  type DeleteConnectionRequest,
} from '@speajus/rlsify-types';

// Connection management has been moved to localStorage on the client side
// The service now only handles active database connections, not saved connection configs

export class ConnectionServiceImpl implements ServiceImpl<typeof ConnectionServiceProto> {
  private currentPool: Pool | null = null;
  private currentConfig: {
    host: string;
    port: number;
    database: string;
    user: string;
    connectionId?: string;
  } | null = null;


  constructor(initialPool?: Pool, private readonly onPoolChange?: (pool?: Pool | null) => void) {
    this.currentPool = initialPool ?? null;
  }

  /** Get the current pool for use by other services */
  getPool(): Pool | null {
    return this.currentPool;
  }

  async connect(request: ConnectDatabaseRequest) {
    const { host, port, database, user, password, ssl } = request;

    // Clean up existing connection
    if (this.currentPool) {
      try {
        await this.currentPool.end();
      } catch (error){
        console.warn('Failed to end current pool:', error);
        // Ignore cleanup errors
      }
    }

    try {
      // Create new pool
      const pool = new Pool({
        host,
        port,
        database,
        user,
        password,
        ssl: ssl ? { rejectUnauthorized: false } : undefined,
      });

      // Test the connection
      let client
      try {
        client = await pool.connect();
        await client.query('SELECT 1');
      } catch(error) {
        console.error('Connection test failed:', error);
        throw error;
      } finally {
        client?.release();
      }

      // Connection successful
      this.currentPool = pool;
      const connectionId = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      this.currentConfig = { host, port, database, user, connectionId };

      // Notify about pool change
      this.onPoolChange?.(pool);

      return create(ConnectDatabaseResponseSchema, {
        success: true,
        connectionId,
      });
    } catch (error) {
      this.currentPool = null;
      this.currentConfig = null;
      this.onPoolChange?.(null);

      // Extract error message, handling AggregateError for connection failures
      let errorMessage = 'Unknown connection error';
      if (error instanceof AggregateError && error.errors?.length > 0) {
        // AggregateError from pg when connection fails (e.g., ECONNREFUSED)
        const firstError = error.errors[0];
        errorMessage = firstError instanceof Error ? firstError.message : String(firstError);
      } else if (error instanceof Error) {
        errorMessage = error.message || error.toString();
      }

      return create(ConnectDatabaseResponseSchema, {
        success: false,
        error: errorMessage,
      });
    }
  }

  async disconnect(_request: DisconnectDatabaseRequest) {
    if (this.currentPool) {
      try {
        await this.currentPool.end();
      } catch {
        // Ignore cleanup errors
      }
      this.currentPool = null;
      this.currentConfig = null;
      this.onPoolChange?.(null);
    }

    return create(DisconnectDatabaseResponseSchema, {
      success: true,
    });
  }

  async getStatus(_request: GetConnectionStatusRequest) {
    if (!this.currentPool || !this.currentConfig) {
      return create(GetConnectionStatusResponseSchema, {
        connected: false,
      });
    }

    // Test the connection is still alive
    try {
      const client = await this.currentPool.connect();
      try {
        await client.query('SELECT 1');
      } catch (error) {
        console.error('Connection test failed:', error);
        throw error;
      } finally {
        client.release();
      }

      return create(GetConnectionStatusResponseSchema, {
        connected: true,
        host: this.currentConfig.host,
        port: this.currentConfig.port,
        database: this.currentConfig.database,
        user: this.currentConfig.user,
        connectionId: this.currentConfig.connectionId!,
      });
    } catch (error) {
      // Extract error message, handling AggregateError for connection failures
      let errorMessage = 'Connection test failed';
      if (error instanceof AggregateError && error.errors?.length > 0) {
        const firstError = error.errors[0];
        errorMessage = firstError instanceof Error ? firstError.message : String(firstError);
      } else if (error instanceof Error) {
        errorMessage = error.message || error.toString();
      }

      return create(GetConnectionStatusResponseSchema, {
        connected: false,
        error: errorMessage,
      });
    }
  }

  // Connection management methods (saveConnection, listConnections, deleteConnection)
  // are deprecated as they are now handled client-side via localStorage.
  // The service only manages active database connections.
  // These methods are kept for backward compatibility but return empty/error responses.

  async saveConnection(_request: SaveConnectionRequest) {
    // Return empty response - connection management is now client-side
    return create(SaveConnectionResponseSchema, {});
  }

  async listConnections(_request: ListConnectionsRequest) {
    // Return empty list - connection management is now client-side
    return create(ListConnectionsResponseSchema, {
      connections: [],
    });
  }

  async deleteConnection(_request: DeleteConnectionRequest) {
    // Return false - connection management is now client-side
    return create(DeleteConnectionResponseSchema, {
      deleted: false,
    });
  }
}
