/**
 * RLSify API Client - Connect-Web client for gRPC services
 */

import { createConnectTransport } from '@connectrpc/connect-web';
import { createClient } from '@connectrpc/connect';
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
export const schemaClient = createClient(SchemaServiceProto, transport);
export const policyClient = createClient(PolicyServiceProto, transport);
export const healthClient = createClient(HealthServiceProto, transport);

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

