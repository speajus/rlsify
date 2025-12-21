/**
 * Auggie service client for AI-powered policy generation
 *
 * This is a client-side wrapper that calls the backend AI service via RPC.
 * The actual Auggie SDK integration runs server-side.
 */

import type { PermissionExpression, PolicyTest, TableInfo } from '@speajus/rlsify-types';
import { policyClient } from '$lib/api/client.js';

// ============================================================================
// Token Management
// ============================================================================

const STORAGE_KEY = 'rlsify_auggie_token';

export interface AuggieTokenData {
  accessToken: string;
  tenantURL: string;
}

/**
 * Retrieve the stored Auggie token data
 * Supports both old format (plain string) and new format (JSON with accessToken and tenantURL)
 */
export function retrieveAuggieToken(): AuggieTokenData | null {
  if (typeof localStorage === 'undefined') return null;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;

  // Try to parse as JSON first (new format)
  try {
    const parsed = JSON.parse(stored);
    if (parsed.accessToken && parsed.tenantURL) {
      return parsed;
    }
  } catch {
    // Not JSON, treat as old format (plain accessToken)
  }

  // Old format: plain string is just the accessToken
  // Use a default tenantURL
  return {
    accessToken: stored,
    tenantURL: 'https://staging-shard-0.api.augmentcode.com/',
  };
}

/**
 * Store Auggie token data
 * Can accept either a plain string (accessToken) or the full token data
 */
export function storeAuggieToken(token: string | AuggieTokenData): void {
  if (typeof localStorage === 'undefined') return;

  if (typeof token === 'string') {
    // Try to parse as JSON first
    try {
      const parsed = JSON.parse(token);
      if (parsed.accessToken && parsed.tenantURL) {
        localStorage.setItem(STORAGE_KEY, token);
        return;
      }
    } catch {
      // Not JSON, treat as plain accessToken
    }

    // Plain string: store as-is for backward compatibility
    localStorage.setItem(STORAGE_KEY, token);
  } else {
    // Store as JSON
    localStorage.setItem(STORAGE_KEY, JSON.stringify(token));
  }
}

export function clearAuggieToken(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}



// ============================================================================
// Policy Generation
// ============================================================================

export interface GeneratePolicyOptions {
  prompt: string;
  tableName: string;
  tableSchema?: TableInfo;
  existingPolicies?: string[];
  model?: string;
}

export interface GeneratePolicyResult {
  expression: PermissionExpression;
  explanation: string;
}

/**
 * Generate a policy expression from a natural language prompt
 *
 * This calls the backend AI service via RPC.
 */
export async function generatePolicyExpression(
  options: GeneratePolicyOptions
): Promise<GeneratePolicyResult> {
  const tokenData = retrieveAuggieToken();

  if (!tokenData) {
    throw new Error('No Auggie API token found. Please provide a token.');
  }

  const response = await policyClient.generatePolicy({
    apiKey: tokenData.accessToken,
    apiUrl: tokenData.tenantURL,
    prompt: options.prompt,
    tableName: options.tableName,
    tableSchema: options.tableSchema as any,
    existingPolicies: options.existingPolicies || [],
    model: options.model,
  });

  return {
    expression: (response.expression as any) as PermissionExpression,
    explanation: response.explanation,
  };
}

// ============================================================================
// Test Generation
// ============================================================================

export interface GenerateTestsOptions {
  prompt: string;
  tableName: string;
  policyName: string;
  policyExpression?: PermissionExpression;
  tableSchema?: TableInfo;
  model?: string;
}

/**
 * Generate test cases for a policy
 *
 * This calls the backend AI service via RPC.
 */
export async function generatePolicyTests(
  options: GenerateTestsOptions
): Promise<PolicyTest[]> {
  const tokenData = retrieveAuggieToken();

  if (!tokenData) {
    throw new Error('No Auggie API token found. Please provide a token.');
  }

  const response = await policyClient.generateTests({
    apiKey: tokenData.accessToken,
    apiUrl: tokenData.tenantURL,
    prompt: options.prompt,
    tableName: options.tableName,
    policyName: options.policyName,
    policyExpression: options.policyExpression as any,
    tableSchema: options.tableSchema as any,
    model: options.model,
  });

  // Convert generated test cases to PolicyTest format
  return response.tests.map((test, index) => ({
    id: `ai-generated-${Date.now()}-${index}`,
    policyName: options.policyName,
    testName: test.testName,
    description: test.description,
    userContext: {
      userId: test.userId,
      role: test.role,
      claims: test.claims as any,
    },
    operation: test.operation as any,
    expectedResult: test.expectedResult as 'allowed' | 'denied',
    testData: test.testData as any,
    generatedBy: 'ai' as const,
    createdAt: new Date().toISOString(),
  }));
}

