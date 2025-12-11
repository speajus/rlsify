/**
 * RLSify API Client - Connect-Web client for gRPC services
 */

import { createClient, type Client } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import {
  SchemaServiceProto,
  PolicyServiceProto,
  HealthServiceProto,
} from '@speajus/rlsify-types';

// Create the transport - uses Connect protocol over HTTP
// Use empty baseUrl to use the same origin (goes through Vite proxy in dev)
const transport = createConnectTransport({
  baseUrl: '',
});

// Create typed clients
export const schemaClient: Client<typeof SchemaServiceProto> = createClient(SchemaServiceProto, transport);
export const policyClient: Client<typeof PolicyServiceProto> = createClient(PolicyServiceProto, transport);
export const healthClient: Client<typeof HealthServiceProto> = createClient(HealthServiceProto, transport);

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
} from '@speajus/rlsify-types';

