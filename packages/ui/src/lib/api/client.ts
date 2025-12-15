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
} from '@speajus/rlsify-types';
import { type Container, createBlob } from '@speajus/diblob';

export const schemaClient = createBlob<Client<typeof SchemaService>>('SchemaClient');
export const policyClient = createBlob<Client<typeof PolicyService>>('PolicyClient');
export const healthClient = createBlob<Client<typeof HealthService>>('HealthClient');
/**
 * Configure custom clients (e.g., IPC-based clients for Electron).
 * Must be called before accessing any client.
 */
export function configureClients(container:Container, transport:Transport = createConnectTransport({
    baseUrl: '',
  })): void {
  container.register(schemaClient, createClient, SchemaService, transport);
  container.register(policyClient, createClient, PolicyService, transport);   
  container.register(healthClient, createClient, HealthService, transport);

}


// Export types for convenience
export type {
  GetSchemaRequest,
  GetSchemaResponse,
  GetTableRequest,
  GetTableResponse,
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
} from '@speajus/rlsify-types';

