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
export const schemaClient = createBlob<Client<typeof SchemaService>>('SchemaClient');
export const policyClient = createBlob<Client<typeof PolicyService>>('PolicyClient');
export const healthClient = createBlob<Client<typeof HealthService>>('HealthClient');
export const connectionClient = createBlob<Client<typeof ConnectionServiceProto>>('ConnectionClient');


/**
 * Configure custom clients (e.g., IPC-based clients for Electron).
 * This replaces the singleton instances with custom ones.
 */
export function configureClients(container: Container, transport: Transport = createConnectTransport({
  baseUrl: '',
})): void {
  // Register with container for DI
  container.register(schemaClient, createClient, SchemaService, transport);
  container.register(policyClient, createClient, PolicyService, transport);
  container.register(healthClient, createClient, HealthService, transport);
  container.register(connectionClient, createClient, ConnectionServiceProto, transport);


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
