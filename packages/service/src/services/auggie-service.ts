/**
 * Auggie SDK service for AI-powered policy generation
 * 
 * This service runs server-side and uses the Auggie SDK to generate
 * RLS policy expressions and test cases from natural language prompts.
 */

import { Auggie } from '@augmentcode/auggie-sdk';
import { tool } from 'ai';
import { z } from 'zod';

// ============================================================================
// Custom Tools for Auggie
// ============================================================================

/**
 * Tool for generating RLS policy expressions
 *
 * This tool MUST be called by the AI to return a structured RLS policy.
 * The AI will provide the expression and explanation as parameters.
 */
const generatePolicyTool = tool({
  description: `Generate a JSON RLS policy expression for PostgreSQL Row-Level Security using rlsify's query language.

  IMPORTANT: You must call this tool with the complete policy expression as a JSON object.

  The expression uses these operators:
  - Comparison: _eq, _neq, _gt, _gte, _lt, _lte, _in, _nin, _like, _ilike, _is_null
  - Logical: _and (array), _or (array), _not (object)
  - Special: _exists (for table joins), _session_var (for JWT claims), _column (for parent table refs in _exists)

  Example expression for "creator OR team member":
  {
    "_or": [
      { "creator_id": { "_eq": { "_session_var": "user_id" } } },
      {
        "_exists": {
          "table": "team_members",
          "where": {
            "_and": [
              { "team_id": { "_eq": { "_column": "team_id" } } },
              { "user_id": { "_eq": { "_session_var": "user_id" } } }
            ]
          }
        }
      }
    ]
  }

  Call this tool with:
  - expression: The complete PermissionExpression JSON object (not a string)
  - explanation: Clear explanation of what the policy does`,
  parameters: z.object({
    expression: z.record(z.any()).describe('The complete PermissionExpression JSON object with operators like _eq, _and, _or, _exists, _session_var, _column, etc. This must be a valid JSON object, not a string.'),
    explanation: z.string().describe('Clear explanation of what this policy does, which conditions it checks, and how the access control works'),
  }),
  execute: async ({ expression, explanation }) => {
    // Store the result so we can return it from generatePolicyExpression
    return JSON.stringify({ expression, explanation }, null, 2);
  },
});

/**
 * Tool for generating test cases
 */
const generateTestTool = tool({
  name: 'generate_policy_test',
  description: 'Generate a test case for an RLS policy',
  inputSchema: z.object({
    testName: z.string().describe('Descriptive name for the test'),
    description: z.string().optional().describe('What this test validates'),
    userId: z.string().describe('User ID for the test context'),
    role: z.string().optional().describe('User role'),
    claims: z.object({}).passthrough().optional().describe('Additional JWT claims'),
    operation: z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL']).describe('SQL operation to test'),
    expectedResult: z.enum(['allowed', 'denied']).describe('Expected test outcome'),
    testData: z.object({}).passthrough().optional().describe('Row data for the test'),
  }),
  execute: async (input) => JSON.stringify(input, null, 2),
});

// ============================================================================
// Auggie Client Management
// ============================================================================

export interface AuggieConfig {
  apiKey: string;
  apiUrl?: string; // Optional tenant URL
  model?: string;
}

/**
 * Create an Auggie client with custom tools
 */
async function createAuggieClient(config: AuggieConfig): Promise<Auggie> {
  // Set environment variables for Auggie SDK
  // The SDK reads AUGMENT_API_TOKEN and AUGMENT_API_URL from env
  const originalToken = process.env.AUGMENT_API_TOKEN;
  const originalUrl = process.env.AUGMENT_API_URL;

  try {
    // Set the token and URL as environment variables
    process.env.AUGMENT_API_TOKEN = config.apiKey;
    if (config.apiUrl) {
      process.env.AUGMENT_API_URL = config.apiUrl;
    }

    const clientConfig: any = {
      tools: {
        generate_rls_policy: generatePolicyTool,
        generate_policy_test: generateTestTool,
      },
      // Let the AI decide when to use tools
      toolChoice: 'auto',
    };

    // Only add model if explicitly provided
    if (config.model) {
      clientConfig.model = config.model;
    }

    console.log('Creating Auggie client with config:', {
      AUGMENT_API_TOKEN: '***',
      AUGMENT_API_URL: process.env.AUGMENT_API_URL,
      model: config.model || 'default',
      toolChoice: clientConfig.toolChoice,
      tools: Object.keys(clientConfig.tools),
    });

    const client = await Auggie.create(clientConfig);

    return client;
  } finally {
    // Restore original environment variables
    if (originalToken !== undefined) {
      process.env.AUGMENT_API_TOKEN = originalToken;
    } else {
      delete process.env.AUGMENT_API_TOKEN;
    }
    if (originalUrl !== undefined) {
      process.env.AUGMENT_API_URL = originalUrl;
    } else {
      delete process.env.AUGMENT_API_URL;
    }
  }
}

// ============================================================================
// Policy Generation
// ============================================================================

export interface GeneratePolicyOptions {
  apiKey: string;
  apiUrl?: string;
  prompt: string;
  tableName: string;
  tableSchema?: Record<string, unknown>;
  existingPolicies?: string[];
  model?: string;
}

export interface GeneratePolicyResult {
  expression: Record<string, unknown>;
  explanation: string;
}

/**
 * Generate a policy expression from a natural language prompt
 */
export async function generatePolicyExpression(
  options: GeneratePolicyOptions
): Promise<GeneratePolicyResult> {
  const client = await createAuggieClient({
    apiKey: options.apiKey,
    apiUrl: options.apiUrl,
    model: options.model
  });

  try {
    // Build context for the AI
    const context = buildPolicyContext(options);
    const fullPrompt = `${context}

## User Request
${options.prompt}

Generate the policy expression as a JSON object and call the generate_rls_policy tool.`;

    console.log('Sending prompt to Auggie:', fullPrompt.substring(0, 300) + '...');

    const response = await client.prompt(fullPrompt);

    console.log('Auggie raw response:', response);
    console.log('Auggie response type:', typeof response);

    // The Auggie SDK should have called our tool and the response should contain the tool result
    // The tool returns JSON, so try to parse it from the response
    try {
      // First, try to parse the entire response as JSON
      const parsed = JSON.parse(response);
      if (parsed.expression && parsed.explanation) {
        console.log('Successfully parsed policy from response');
        return {
          expression: parsed.expression,
          explanation: parsed.explanation,
        };
      }
    } catch (e) {
      // Not valid JSON, try to extract JSON from the response
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.expression && parsed.explanation) {
            console.log('Successfully extracted policy from response');
            return {
              expression: parsed.expression,
              explanation: parsed.explanation,
            };
          }
        }
      } catch (parseError) {
        console.error('Failed to parse JSON from response:', parseError);
      }
    }

    // Fallback: Try to manually construct the policy from the description
    // Based on the user's request, generate a reasonable policy
    console.warn('AI did not call the tool properly, attempting to construct policy from description');

    const policy = constructPolicyFromDescription(options.prompt, response);
    if (policy) {
      console.log('Successfully constructed policy from description');
      return policy;
    }

    // Last resort: return the raw response as explanation
    console.warn('Could not construct policy, returning raw response');
    console.warn('Response was:', response);
    return {
      expression: {},
      explanation: `The AI did not generate a valid policy. Response: ${response}`,
    };
  } catch (error) {
    console.error('Error generating policy:', error);
    throw error;
  } finally {
    await client.close();
  }
}

// ============================================================================
// Test Generation
// ============================================================================

export interface GenerateTestsOptions {
  apiKey: string;
  apiUrl?: string;
  prompt: string;
  tableName: string;
  policyName: string;
  policyExpression?: Record<string, unknown>;
  tableSchema?: Record<string, unknown>;
  model?: string;
}

export interface GeneratedTest {
  testName: string;
  description?: string;
  userId: string;
  role?: string;
  claims?: Record<string, unknown>;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  expectedResult: 'allowed' | 'denied';
  testData?: Record<string, unknown>;
}

/**
 * Generate test cases for a policy
 */
export async function generatePolicyTests(
  options: GenerateTestsOptions
): Promise<GeneratedTest[]> {
  const client = await createAuggieClient({
    apiKey: options.apiKey,
    apiUrl: options.apiUrl,
    model: options.model
  });

  try {
    const context = buildTestContext(options);
    const fullPrompt = `${context}\n\nGenerate test cases: ${options.prompt}`;

    const response = await client.prompt(fullPrompt);

    // Parse response and convert to GeneratedTest[]
    // Placeholder for now
    return [];
  } finally {
    await client.close();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Attempt to construct a policy from the AI's text description
 * This is a fallback when the AI doesn't call the tool properly
 */
function constructPolicyFromDescription(
  prompt: string,
  response: string
): GeneratePolicyResult | null {
  // Look for common patterns in the prompt to generate a reasonable policy
  const lowerPrompt = prompt.toLowerCase();
  const lowerResponse = response.toLowerCase();

  // Pattern 1: Creator/owner access with team members
  if ((lowerPrompt.includes('creator') || lowerPrompt.includes('owner')) &&
      (lowerPrompt.includes('team') || lowerPrompt.includes('member'))) {
    // Creator OR team member pattern
    // Extract table name from response if mentioned
    let teamTable = 'team_members';
    const teamTableMatch = response.match(/`(\w+_members)`/);
    if (teamTableMatch && teamTableMatch[1]) {
      teamTable = teamTableMatch[1];
    }

    return {
      expression: {
        _or: [
          {
            creator_id: { _eq: { _session_var: 'user_id' } }
          },
          {
            _exists: {
              table: teamTable,
              where: {
                _and: [
                  { team_id: { _eq: { _column: 'team_id' } } },
                  { user_id: { _eq: { _session_var: 'user_id' } } }
                ]
              }
            }
          }
        ]
      },
      explanation: response || 'Policy allows document creators and team members to access documents. The policy checks if the user is either the creator (creator_id matches session user_id) or a member of the team (verified through the team_members table).'
    };
  }

  // Pattern 2: Simple user_id match
  if (lowerPrompt.includes('own') || lowerPrompt.includes('user_id')) {
    return {
      expression: {
        user_id: { _eq: { _session_var: 'user_id' } }
      },
      explanation: response || 'Policy allows users to access only their own records.'
    };
  }

  // Pattern 3: Role-based access
  if (lowerPrompt.includes('role')) {
    return {
      expression: {
        _or: [
          { user_id: { _eq: { _session_var: 'user_id' } } },
          { _session_var: 'role', _eq: 'admin' }
        ]
      },
      explanation: response || 'Policy allows users to access their own records or admins to access all records.'
    };
  }

  return null;
}

function buildPolicyContext(options: GeneratePolicyOptions): string {
  let context = `You are an expert at generating PostgreSQL Row-Level Security (RLS) policies using rlsify's JSON expression format.

Your task is to generate a policy expression for table "${options.tableName}".

IMPORTANT: You MUST call the generate_rls_policy tool with your generated policy. Do not just describe it in text.

## rlsify JSON Expression Format

The expression format is inspired by Hasura's permission system and uses a JSON-based query language.

### Core Concepts

**1. Session Variables (_session_var)**
Session variables reference values from the user's JWT token or session context:
- { "_session_var": "user_id" } - Gets the current user's ID from the session
- { "_session_var": "role" } - Gets the user's role (e.g., "admin", "user")
- { "_session_var": "org_id" } - Gets the user's organization ID
- { "_session_var": "team_id" } - Gets the user's team ID

**2. Column References (_column)**
Used in _exists subqueries to reference columns from the PARENT table (the table being queried):
- { "_column": "team_id" } - References the team_id column from the parent table
- { "_column": "id" } - References the id column from the parent table
- { "_column": "creator_id" } - References the creator_id column from the parent table

**3. Table Joins with _exists**
The _exists operator performs a subquery to check if related rows exist in another table.
It's like a SQL JOIN but expressed as a boolean check.

Structure:
{
  "_exists": {
    "table": "related_table_name",
    "where": { /* conditions that must be true in the related table */ }
  }
}

The "where" clause can reference:
- Columns from the related table (direct column names)
- Columns from the parent table using { "_column": "column_name" }
- Session variables using { "_session_var": "var_name" }

### Comparison Operators
- _eq: equals
- _neq: not equals
- _gt: greater than
- _gte: greater than or equal
- _lt: less than
- _lte: less than or equal
- _in: in array
- _nin: not in array
- _like: SQL LIKE pattern matching
- _ilike: case-insensitive LIKE
- _is_null: is NULL (value is true or false)

### Logical Operators
- _and: [expr1, expr2, ...] - All conditions must be true
- _or: [expr1, expr2, ...] - At least one condition must be true
- _not: expr - Negates the expression

### Complete Examples

**Example 1: Simple ownership check**
User can only see their own rows:
{
  "user_id": { "_eq": { "_session_var": "user_id" } }
}

**Example 2: Organization membership**
User can see rows in their organization:
{
  "org_id": { "_eq": { "_session_var": "org_id" } }
}

**Example 3: Creator OR Team Member (using _exists for join)**
User can see documents they created OR documents their team has access to:
{
  "_or": [
    { "creator_id": { "_eq": { "_session_var": "user_id" } } },
    {
      "_exists": {
        "table": "team_members",
        "where": {
          "_and": [
            { "team_id": { "_eq": { "_column": "team_id" } } },
            { "user_id": { "_eq": { "_session_var": "user_id" } } }
          ]
        }
      }
    }
  ]
}

Explanation of Example 3:
- First condition: creator_id (from documents table) equals session user_id
- Second condition: Check if a row exists in team_members where:
  - team_id (from team_members) equals team_id from the parent documents table (using _column)
  - user_id (from team_members) equals the session user_id

**Example 4: Role-based access with ownership fallback**
Admins see everything, users see only their own:
{
  "_or": [
    { "_session_var": "role", "_eq": "admin" },
    { "user_id": { "_eq": { "_session_var": "user_id" } } }
  ]
}

**Example 5: Complex multi-table relationship**
User can see projects if they're a member of the project's organization:
{
  "_exists": {
    "table": "organization_members",
    "where": {
      "_and": [
        { "org_id": { "_eq": { "_column": "org_id" } } },
        { "user_id": { "_eq": { "_session_var": "user_id" } } },
        { "status": { "_eq": "active" } }
      ]
    }
  }
}

**Example 6: Public OR owned**
User can see public items or items they own:
{
  "_or": [
    { "is_public": { "_eq": true } },
    { "owner_id": { "_eq": { "_session_var": "user_id" } } }
  ]
}

### Key Rules to Remember

1. **_session_var** always references the user's session/JWT claims
2. **_column** is ONLY used inside _exists to reference the parent table's columns
3. **_exists** is how you do table joins - it checks if related rows exist
4. Direct column names (without _column) reference the current table being queried
5. Use _and for ALL conditions, _or for ANY condition
6. Nest logical operators as needed for complex logic`;

  if (options.tableSchema) {
    context += `\n\n## Table Schema\n${JSON.stringify(options.tableSchema, null, 2)}`;
  }

  if (options.existingPolicies && options.existingPolicies.length > 0) {
    context += `\n\n## Existing Policies\n${options.existingPolicies.join('\n')}`;
  }

  context += `\n\n## Step-by-Step Instructions

1. **Analyze the user's request** - Identify:
   - What table columns are involved?
   - What session variables are needed (user_id, role, org_id, team_id)?
   - Are there related tables that need to be checked (use _exists)?
   - What are the access conditions (ownership, membership, role)?

2. **Design the expression** - Choose the right structure:
   - Simple ownership: { "column": { "_eq": { "_session_var": "var" } } }
   - Multiple conditions: Use _and or _or arrays
   - Table relationships: Use _exists with proper _column references

3. **Build the JSON** - Follow these patterns:
   - For "user owns the record": { "user_id": { "_eq": { "_session_var": "user_id" } } }
   - For "user is in a team": Use _exists to check team_members table
   - For "creator OR team member": Use _or with both conditions
   - For "admin OR owner": Use _or with role check and ownership check

4. **CALL the generate_rls_policy tool** with:
   - expression: The complete PermissionExpression JSON object
   - explanation: Clear explanation of the logic and what each part does

### Common Patterns for Reference

**Pattern: Creator OR Team Member**
{
  "_or": [
    { "creator_id": { "_eq": { "_session_var": "user_id" } } },
    {
      "_exists": {
        "table": "team_members",
        "where": {
          "_and": [
            { "team_id": { "_eq": { "_column": "team_id" } } },
            { "user_id": { "_eq": { "_session_var": "user_id" } } }
          ]
        }
      }
    }
  ]
}

**Pattern: Organization Member**
{
  "_exists": {
    "table": "org_members",
    "where": {
      "_and": [
        { "org_id": { "_eq": { "_column": "org_id" } } },
        { "user_id": { "_eq": { "_session_var": "user_id" } } }
      ]
    }
  }
}

**Pattern: Admin OR Owner**
{
  "_or": [
    { "_session_var": "role", "_eq": "admin" },
    { "owner_id": { "_eq": { "_session_var": "user_id" } } }
  ]
}

CRITICAL: You must actually CALL the generate_rls_policy tool with the JSON expression. Do not just describe the policy in text.`;

  return context;
}

function buildTestContext(options: GenerateTestsOptions): string {
  let context = `You are an expert at testing PostgreSQL Row-Level Security (RLS) policies.

Your task is to generate comprehensive test cases for the policy "${options.policyName}" on table "${options.tableName}".`;

  if (options.policyExpression) {
    context += `\n\n## Policy Expression\n${JSON.stringify(options.policyExpression, null, 2)}`;
  }

  if (options.tableSchema) {
    context += `\n\n## Table Schema\n${JSON.stringify(options.tableSchema, null, 2)}`;
  }

  context += `\n\n## Test Case Requirements

Generate test cases that cover:

1. **Positive cases** - Scenarios where access SHOULD be allowed
2. **Negative cases** - Scenarios where access SHOULD be denied
3. **Edge cases** - Boundary conditions, null values, empty strings, etc.
4. **Different user contexts** - Various combinations of user_id, role, org_id, etc.

For each test case, use the generate_policy_test tool with:
- testName: Descriptive name (e.g., "user_can_access_own_rows")
- description: What this test validates
- userId: User ID for the test context
- role: User role (if applicable)
- claims: Additional JWT claims as needed (org_id, team_id, etc.)
- operation: SELECT, INSERT, UPDATE, DELETE, or ALL
- expectedResult: "allowed" or "denied"
- testData: Sample row data that matches the table schema

## Example Test Cases

For a policy that allows users to see their own rows:

Test 1 (Positive):
- testName: "user_can_see_own_row"
- userId: "user-123"
- expectedResult: "allowed"
- testData: { "id": 1, "user_id": "user-123", "content": "test" }

Test 2 (Negative):
- testName: "user_cannot_see_other_user_row"
- userId: "user-123"
- expectedResult: "denied"
- testData: { "id": 2, "user_id": "user-456", "content": "test" }

Generate 3-5 test cases that thoroughly validate the policy.`;

  return context;
}

