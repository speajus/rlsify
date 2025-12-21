/**
 * RLSify API Client - Connect-Web client for gRPC services
 *
 * Supports both HTTP transport (for web) and injectable clients (for Electron IPC).
 */

import { createConnectTransport } from '@connectrpc/connect-web';
import { createClient, type Client, type Transport } from '@connectrpc/connect';
import {
  SchemaService,
  PolicyService,
  HealthService,
  ConnectionServiceProto,
} from '@speajus/rlsify-types';
import { type Container, createBlob } from '@speajus/diblob';

// Blob definitions for DI container usage
export const schemaClientBlob = createBlob<Client<typeof SchemaService>>('SchemaClient');
export const policyClientBlob = createBlob<Client<typeof PolicyService>>('PolicyClient');
export const healthClientBlob = createBlob<Client<typeof HealthService>>('HealthClient');
export const connectionClientBlob = createBlob<Client<typeof ConnectionServiceProto>>('ConnectionClient');

// Default transport for web
const defaultTransport = createConnectTransport({
  baseUrl: '',
});

// Singleton client instances for direct usage by stores
export let schemaClient: Client<typeof SchemaService> = createClient(SchemaService, defaultTransport);
export let policyClient: Client<typeof PolicyService> = createClient(PolicyService, defaultTransport);
export let healthClient: Client<typeof HealthService> = createClient(HealthService, defaultTransport);
export let connectionClient: Client<typeof ConnectionServiceProto> = createClient(ConnectionServiceProto, defaultTransport);

/**
 * Configure custom clients (e.g., IPC-based clients for Electron).
 * This replaces the singleton instances with custom ones.
 */
export function configureClients(container: Container, transport: Transport = defaultTransport): void {
  // Register with container for DI
  container.register(schemaClientBlob, createClient, SchemaService, transport);
  container.register(policyClientBlob, createClient, PolicyService, transport);
  container.register(healthClientBlob, createClient, HealthService, transport);
  container.register(connectionClientBlob, createClient, ConnectionServiceProto, transport);

  // Also update the singleton instances
  schemaClient = createClient(SchemaService, transport);
  policyClient = createClient(PolicyService, transport);
  healthClient = createClient(HealthService, transport);
  connectionClient = createClient(ConnectionServiceProto, transport);
}


// Export types for convenience
export type {
  GetSchemaRequest,
  GetSchemaResponse,
  GetTableRequest,
  GetTableResponse,
  GetTableDataRequest,
  GetTableDataResponse,
  TableRow,
  PreviewPoliciesRequest,
  PreviewPoliciesResponse,
  ValidateConfigRequest,
  ValidateConfigResponse,
  ApplyPoliciesRequest,
  ApplyPoliciesResponse,
  HealthCheckRequest,
  HealthCheckResponse,
  ReadinessCheckRequest,
  ReadinessCheckResponse,
  TestPoliciesRequest,
  TestPoliciesResponse,
  SessionContextProto,
  PolicyTestResult,
  ExpressionResult,
  // Connection types
  DatabaseConnection,
  ConnectDatabaseRequest,
  ConnectDatabaseResponse,
  GetConnectionStatusRequest,
  GetConnectionStatusResponse,
  SaveConnectionRequest,
  SaveConnectionResponse,
  ListConnectionsRequest,
  ListConnectionsResponse,
  DeleteConnectionRequest,
  DeleteConnectionResponse,
} from '@speajus/rlsify-types';
