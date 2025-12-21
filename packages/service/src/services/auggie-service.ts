/**
 * Auggie SDK service for AI-powered policy generation
 * 
 * This service runs server-side and uses the Auggie SDK to generate
 * RLS policy expressions and test cases from natural language prompts.
 */

import { Auggie } from '@augmentcode/auggie-sdk';
import { tool, zodSchema } from 'ai';
import { z } from 'zod';

type ToolCallSnapshot = {
  toolCallId: string;
  title?: string;
  status?: string;
  kind?: string;
  rawInput?: unknown;
  rawOutput?: unknown;
};

const generatePolicyToolArgsSchema = z.object({
  expression: z
    .record(z.string(), z.unknown())
    .describe(
      'The complete PermissionExpression JSON object with operators like _eq, _and, _or, _exists, _session_var, _column, etc. This must be a valid JSON object, not a string.'
    ),
  explanation: z
    .string()
    .describe(
      'Clear explanation of what this policy does, which conditions it checks, and how the access control works'
    ),
});

const generateFullPolicyToolArgsSchema = z
  .object({
    name: z
      .string()
      .describe('Policy name following convention: {table}_{command}_{purpose}, e.g., users_select_own'),
    command: z
      .array(z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL']))
      .describe('SQL command(s) this policy applies to'),
    description: z
      .string()
      .describe('Human-readable explanation of what this policy does'),
    roles: z
      .array(z.string())
      .optional()
      .describe('PostgreSQL roles this policy applies to (e.g., authenticated, public)'),

    // NOTE: INSERT policies do not use a USING clause, but our wire format expects a `usingExpression`.
    // To avoid tool-call validation failures (and subsequent plain-text fallbacks), we allow it to be
    // omitted and default it later to `{}` for INSERT-only policies.
    usingExpression: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('JSON expression for USING clause (for SELECT, UPDATE, DELETE). Use {} for INSERT-only.'),
    withCheckExpression: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('JSON expression for WITH CHECK clause (for INSERT, UPDATE)'),
  })
  .superRefine((value, ctx) => {
    const cmd = Array.isArray(value.command) ? value.command : [];
    const needsUsing = cmd.some((c) => c === 'SELECT' || c === 'UPDATE' || c === 'DELETE' || c === 'ALL');

    if (needsUsing && !value.usingExpression) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['usingExpression'],
        message: 'usingExpression is required for SELECT/UPDATE/DELETE/ALL policies',
      });
    }
  });

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
  inputSchema: zodSchema(generatePolicyToolArgsSchema),
  execute: async ({ expression, explanation }: z.infer<typeof generatePolicyToolArgsSchema>) => {
    // Store the result so we can return it from generatePolicyExpression
    return JSON.stringify({ expression, explanation }, null, 2);
  },
});

/**
 * Tool for generating complete policy definitions
 *
 * This tool generates a complete PolicyDefinition with all fields:
 * name, command, description, roles, usingExpression, withCheckExpression
 */
const generateFullPolicyTool = tool({
  description: `Generate a complete RLS policy definition with all fields from a natural language description.

  This tool generates:
  - Policy name following convention: {table}_{command}_{purpose}
  - Appropriate command(s) based on the description
  - Human-readable description
  - Suitable roles (authenticated, public, service_role, etc.)
  - Complete USING and WITH CHECK expressions

  Call this tool with all fields populated based on the user's natural language request.`,
  inputSchema: zodSchema(generateFullPolicyToolArgsSchema),
  execute: async (input: z.infer<typeof generateFullPolicyToolArgsSchema>) => {
    // Keep the tool output structured so it can be parsed from the model response.
    return JSON.stringify(input, null, 2);
  },
});

/**
 * Tool for generating test cases
 */
const generateTestTool = tool({
  description: 'Generate a test case for an RLS policy',
  inputSchema: zodSchema(
    z.object({
    testName: z.string().describe('Descriptive name for the test'),
    description: z.string().optional().describe('What this test validates'),
    userId: z.string().describe('User ID for the test context'),
    role: z.string().optional().describe('User role'),
    claims: z.record(z.string(), z.any()).optional().describe('Additional JWT claims'),
    operation: z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL']).describe('SQL operation to test'),
    expectedResult: z.enum(['allowed', 'denied']).describe('Expected test outcome'),
    testData: z.record(z.string(), z.any()).optional().describe('Row data for the test'),
    })
  ),
  execute: async (input: unknown) => JSON.stringify(input, null, 2),
});

// ============================================================================
// Auggie Client Management
// ============================================================================

export type AuggieModel = 'haiku4.5' | 'sonnet4.5' | 'sonnet4' | 'gpt5';

export interface AuggieConfig {
  apiKey: string;
  apiUrl?: string; // Optional tenant URL
  model?: AuggieModel;
  forceToolUse?: boolean; // Force the AI to use tools

  /**
   * Limit which tools are exposed to the model.
   * This helps avoid cases where the model calls the wrong tool and then produces no text.
   */
  enabledTools?: Array<'generate_rls_policy' | 'generate_full_policy' | 'generate_policy_test'>;
}

/**
 * Create an Auggie client with custom tools
 */
async function createAuggieClient(config: AuggieConfig): Promise<Auggie> {
  // Set environment variables for Auggie SDK
  // The SDK reads AUGMENT_API_TOKEN and AUGMENT_API_URL from env
  // Prefer explicit config over environment variables.
  // This matters for callers (UI/desktop/tests) that pass per-request tokens/tenant URLs.
  const apiKey = config.apiKey ?? process.env.AUGMENT_API_TOKEN;
  const apiUrl = config.apiUrl ?? process.env.AUGMENT_API_URL;

  if (!apiKey) {
    throw new Error('Auggie SDK requires an API key. Provide `apiKey` or set AUGMENT_API_TOKEN.');
  }

  const availableTools = {
    generate_rls_policy: generatePolicyTool,
    generate_full_policy: generateFullPolicyTool,
    generate_policy_test: generateTestTool,
  } as const;

  const enabledToolNames = (config.enabledTools?.length
    ? config.enabledTools
    : (Object.keys(availableTools) as Array<keyof typeof availableTools>)) as Array<
    keyof typeof availableTools
  >;

  const tools = Object.fromEntries(
    enabledToolNames
      .map((name) => {
        const tool = availableTools[name];
        return tool ? [name, tool] : null;
      })
      .filter(Boolean) as Array<[string, any]>
  );

  const clientConfig = {
    tools,
    apiKey,
    ...(apiUrl ? { apiUrl } : {}),
    model: config.model ?? 'sonnet4.5',
  };

  // Avoid logging secrets. Log only non-sensitive info.
  console.log('Creating Auggie client with config:', {
    hasApiKey: Boolean(apiKey),
    apiUrl: apiUrl ?? '(default)',
    model: clientConfig.model,
    toolNames: Object.keys(clientConfig.tools ?? {}),
  });

  const client = await Auggie.create(clientConfig);
  return client;
}

function createToolCallCollector(client: Auggie): {
  stop: () => void;
  list: () => ToolCallSnapshot[];
  waitForIdle: (options?: { idleMs?: number; timeoutMs?: number }) => Promise<void>;
} {
  const toolCallsById = new Map<string, ToolCallSnapshot>();
  let active = true;
  let updateCount = 0;
  let lastUpdateAt = 0;

  client.onSessionUpdate((notification: any) => {
    if (!active) return;

    const update = notification?.update;
    if (!update) return;

    if (update.sessionUpdate !== 'tool_call' && update.sessionUpdate !== 'tool_call_update') return;
    if (!update.toolCallId) return;

    updateCount += 1;
    lastUpdateAt = Date.now();

    const existing = toolCallsById.get(update.toolCallId) ?? {
      toolCallId: update.toolCallId,
    };

    const next: ToolCallSnapshot = { ...existing };
    if (typeof update.title === 'string') next.title = update.title;
    if (typeof update.status === 'string') next.status = update.status;
    if (typeof update.kind === 'string') next.kind = update.kind;
    if (update.rawInput !== undefined) next.rawInput = update.rawInput;
    if (update.rawOutput !== undefined) next.rawOutput = update.rawOutput;

    toolCallsById.set(update.toolCallId, next);
  });

  return {
    stop: () => {
      active = false;
    },
    list: () => Array.from(toolCallsById.values()),
    waitForIdle: async (options) => {
      const idleMs = Math.max(0, options?.idleMs ?? 15);
      const timeoutMs = Math.max(idleMs, options?.timeoutMs ?? 250);

      // Even if we haven't seen updates yet, give a short grace period for the first tool-call
      // notification to arrive after prompt() resolves.
      const start = Date.now();
      const initialGraceMs = Math.min(timeoutMs, Math.max(idleMs, 25));

      // Wait until either:
      // 1) we receive *no* tool-call updates for `initialGraceMs` (nothing to collect), or
      // 2) after we've seen updates, we haven't received any for `idleMs`, or
      // 3) `timeoutMs` elapses.
      while (Date.now() - start < timeoutMs) {
        if (updateCount === 0) {
          if (Date.now() - start >= initialGraceMs) return;
        } else {
          const sinceLast = Date.now() - lastUpdateAt;
          if (sinceLast >= idleMs) return;
        }

        await new Promise<void>((resolve) => setTimeout(resolve, idleMs));
      }
    },
  };
}

function normalizeIdentifier(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeCommandList(commands: unknown): Array<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL'> {
  const list = Array.isArray(commands) ? commands : commands != null ? [commands] : [];
  const normalized = list
    .map((c) => (typeof c === 'string' ? c.toUpperCase().trim() : ''))
    .filter(Boolean);
  const allowed = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL']);
  const filtered = normalized.filter((c) => allowed.has(c));
  return (filtered.length > 0 ? filtered : ['SELECT']) as Array<
    'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL'
  >;
}

function ensurePolicyNameConvention(params: {
  name: unknown;
  tableName: string;
  command: Array<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL'>;
  fallbackPurpose: string;
}): string {
  const table = normalizeIdentifier(params.tableName);
  const cmd = normalizeIdentifier(params.command[0] ?? 'select');

  const inferKnownPurposeFromText = (text: string): string => {
    const lower = text.toLowerCase();
    // Keep this intentionally small and predictable — naming convention prefers short purposes.
    if (/(\btheir\s+own\b|\byour\s+own\b|\bown\b)/.test(lower)) return 'own';
    if (/\badmin\b/.test(lower)) return 'admin';
    if (/(\bauthenticated\b|\blogged\s*in\b|\bsigned\s*in\b)/.test(lower)) return 'authenticated';
    if (/(\bpublic\b|\banon\b|\banonymous\b|\bunauthenticated\b)/.test(lower)) return 'public';
    if (/(\bservice\b|\bservice_role\b)/.test(lower)) return 'service';
    return '';
  };

  const normalizePurposeToken = (text: string): string => {
    const normalized = normalizeIdentifier(text);
    if (!normalized) return '';

    // Purposes can be arbitrary, but keep them reasonably sized to avoid gigantic identifiers.
    const tokens = normalized.split('_').filter(Boolean);
    const limited = tokens.slice(0, 6).join('_');
    return limited.length > 60 ? limited.slice(0, 60) : limited;
  };

  const fallbackPurpose =
    inferKnownPurposeFromText(params.fallbackPurpose) || normalizePurposeToken(params.fallbackPurpose) || 'policy';

  const rawName = typeof params.name === 'string' ? params.name : '';
  const normalizedName = normalizeIdentifier(rawName);

  // Enforce {table}_{command}_{purpose}. If it already matches the prefix, keep it.
  const requiredPrefix = `${table}_${cmd}_`;
  if (normalizedName.startsWith(requiredPrefix) && normalizedName.length > requiredPrefix.length) {
    return normalizedName;
  }

  // If the model produced a non-conforming name, try to salvage a reasonable purpose token.
  // e.g., "select_posts_own" -> purpose "own".
  const purposeFromName = (() => {
    if (!normalizedName) return '';
    const parts = normalizedName.split('_').filter(Boolean);
    const last = parts[parts.length - 1] ?? '';
    if (!last) return '';

    // Avoid choosing table/command as purpose.
    if (last === table || last === cmd) return '';

    // Allow arbitrary purposes; normalize/truncate to keep identifiers manageable.
    return normalizePurposeToken(last);
  })();

  const purpose = purposeFromName || fallbackPurpose;

  return `${table}_${cmd}_${purpose}`;
}

function extractJsonValuesFromText(text: string): unknown[] {
  // Extract balanced JSON substrings (objects/arrays) and parse them.
  // Handles nested braces and ignores braces inside JSON strings.
  const results: unknown[] = [];
  const seen = new Set<string>();

  const openToClose: Record<string, string> = { '{': '}', '[': ']' };
  const closeSet = new Set(['}', ']']);

  for (let start = 0; start < text.length; start++) {
    const ch = text.charAt(start);
    if (ch !== '{' && ch !== '[') continue;

    const stack: string[] = [ch];
    let inString = false;
    let escaped = false;

    for (let i = start + 1; i < text.length; i++) {
      const c = text.charAt(i);

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (c === '\\') {
          escaped = true;
          continue;
        }
        if (c === '"') {
          inString = false;
        }
        continue;
      }

      if (c === '"') {
        inString = true;
        continue;
      }

      if (c === '{' || c === '[') {
        stack.push(c);
        continue;
      }

      if (closeSet.has(c)) {
        const open = stack[stack.length - 1];
        if (!open) break;
        const expectedClose = openToClose[open];
        if (c !== expectedClose) {
          // Not valid JSON for this start.
          break;
        }
        stack.pop();
        if (stack.length === 0) {
          const candidate = text.slice(start, i + 1);
          if (!seen.has(candidate)) {
            seen.add(candidate);
            try {
              results.push(JSON.parse(candidate));
            } catch {
              // ignore
            }
          }
          break;
        }
      }
    }
  }

  return results;
}

function tryParseFullPoliciesFromUnknown(
  input: unknown,
  options: Pick<GenerateFullPolicyOptions, 'tableName' | 'prompt'>
): Array<z.infer<typeof generateFullPolicyToolArgsSchema>> | null {
  const candidates = Array.isArray(input) ? input : [input];
  const parsedPolicies: Array<z.infer<typeof generateFullPolicyToolArgsSchema>> = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const c: any = candidate;
    const command = normalizeCommandList(c.command);

    const coerced: any = {
      ...c,
      command,
      roles: Array.isArray(c.roles) ? c.roles : c.roles ? [c.roles] : c.roles,
    };
    coerced.name = ensurePolicyNameConvention({
      name: coerced.name,
      tableName: options.tableName,
      command,
      fallbackPurpose: coerced.description || options.prompt,
    });

    const parsed = generateFullPolicyToolArgsSchema.safeParse(coerced);
    if (parsed.success) parsedPolicies.push(parsed.data);
  }

  return parsedPolicies.length > 0 ? parsedPolicies : null;
}

function tryParseFullPoliciesFromTextResponse(
  responseStr: string,
  options: Pick<GenerateFullPolicyOptions, 'tableName' | 'prompt'>
): GenerateFullPolicyResult | null {
  const trimmed = responseStr.trim();

  // 1) Strict JSON response
  try {
    const direct = JSON.parse(trimmed);
    const parsed = tryParseFullPoliciesFromUnknown(direct, options);
    if (parsed) {
      return {
        policies: parsed.map((p) => ({
          name: p.name,
          command: p.command,
          description: p.description,
          roles: p.roles ?? [],
	          usingExpression: p.usingExpression ?? {},
          ...(p.withCheckExpression ? { withCheckExpression: p.withCheckExpression } : {}),
        })),
        explanation: deriveExplanationFromText(responseStr),
      };
    }
  } catch {
    // ignore
  }

  // 2) Extract embedded JSON objects/arrays from prose/markdown
  const extractedValues = extractJsonValuesFromText(responseStr);
  for (const value of extractedValues) {
    const parsed = tryParseFullPoliciesFromUnknown(value, options);
    if (parsed) {
      return {
        policies: parsed.map((p) => ({
          name: p.name,
          command: p.command,
          description: p.description,
          roles: p.roles ?? [],
	          usingExpression: p.usingExpression ?? {},
          ...(p.withCheckExpression ? { withCheckExpression: p.withCheckExpression } : {}),
        })),
        explanation: deriveExplanationFromText(responseStr),
      };
    }
  }

  return null;
}

function extractArgsFromRawInput<T>(rawInput: unknown, schema: z.ZodType<T>): T | null {
  const candidates: unknown[] = [];

  if (rawInput !== undefined) candidates.push(rawInput);

  if (rawInput && typeof rawInput === 'object') {
    const ri: any = rawInput;
    if (ri.args !== undefined) candidates.push(ri.args);
    if (ri.arguments !== undefined) candidates.push(ri.arguments);
    if (ri.input !== undefined) candidates.push(ri.input);
    if (ri.parameters !== undefined) candidates.push(ri.parameters);
  }

  for (const candidate of candidates) {
    const maybeObj =
      typeof candidate === 'string'
        ? (() => {
            try {
              return JSON.parse(candidate);
            } catch {
              return null;
            }
          })()
        : candidate;

    const parsed = schema.safeParse(maybeObj);
    if (parsed.success) return parsed.data;
  }

  return null;
}

function deriveExplanationFromText(text: string | undefined): string {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return 'Policy generated successfully';
  const firstLine = trimmed.split('\n').map((l) => l.trim()).find(Boolean);
  return firstLine || 'Policy generated successfully';
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
  model?: AuggieModel;
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
    ...(options.apiUrl ? { apiUrl: options.apiUrl } : {}),
    ...(options.model ? { model: options.model } : {}),
    enabledTools: ['generate_rls_policy'],
  });

  try {
    // Build context for the AI
    const context = buildPolicyContext(options);
    const fullPrompt = `${context}

## User Request
${options.prompt}

Generate the policy expression as a JSON object and call the generate_rls_policy tool.`;

    const collector = createToolCallCollector(client);
    const responseText = await client.prompt(fullPrompt);
		await collector.waitForIdle();
		const toolCalls = collector.list();
		collector.stop();

    // Preferred: parse structured tool-call args from session updates.
		for (const call of toolCalls) {
			const args = extractArgsFromRawInput(call.rawInput ?? call.rawOutput, generatePolicyToolArgsSchema);
			if (!args) continue;

			return {
				expression: args.expression,
				explanation: args.explanation,
			};
		}

    // Fallback: parse JSON (either full JSON response or embedded JSON).
    try {
      const parsed = JSON.parse(responseText);
      const candidate = generatePolicyToolArgsSchema.safeParse(parsed);
      if (candidate.success) {
        return {
          expression: candidate.data.expression,
          explanation: candidate.data.explanation,
        };
      }
    } catch {
      // ignore
    }

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const candidate = generatePolicyToolArgsSchema.safeParse(parsed);
        if (candidate.success) {
          return {
            expression: candidate.data.expression,
            explanation: candidate.data.explanation,
          };
        }
      }
    } catch (parseError) {
      console.error('Failed to parse JSON from response:', parseError);
    }

    // Fallback: Try to manually construct the policy from the description
    // Based on the user's request, generate a reasonable policy
    console.warn('AI did not call the tool properly, attempting to construct policy from description');

    const policy = constructPolicyFromDescription(options.prompt, responseText);
    if (policy) {
      console.log('Successfully constructed policy from description');
      return policy;
    }

    // Last resort: return the raw response as explanation
    console.warn('Could not construct policy, returning raw response');
    console.warn('Response was:', responseText);
    return {
      expression: {},
      explanation: `The AI did not generate a valid policy. Response: ${responseText}`,
    };
  } catch (error) {
    console.error('Error generating policy:', error);
    throw error;
  } finally {
    await client.close();
  }
}

// ============================================================================
// Full Policy Generation
// ============================================================================

export interface GenerateFullPolicyOptions {
  apiKey: string;
  apiUrl?: string;
  prompt: string;
  tableName: string;
  tableSchema?: Record<string, unknown>;
  existingPolicies?: string[];
  model?: AuggieModel;
}

export interface GeneratedPolicyDefinition {
  name: string;
  command: string[];
  description: string;
  roles?: string[];
  usingExpression: Record<string, unknown>;
  withCheckExpression?: Record<string, unknown>;
}

export interface GenerateFullPolicyResult {
  policies: GeneratedPolicyDefinition[];
  explanation: string;
}

/**
 * Generate a complete policy definition from a natural language prompt
 */
export async function generateFullPolicy(
  options: GenerateFullPolicyOptions
): Promise<GenerateFullPolicyResult> {
  const client = await createAuggieClient({
    apiKey: options.apiKey,
    ...(options.apiUrl && { apiUrl: options.apiUrl }),
    ...(options.model && { model: options.model }),
    forceToolUse: false, // (Not currently enforced by the SDK) Let the model decide.
    enabledTools: ['generate_full_policy'],
  });

  try {
    // Build context for the AI
    const context = buildFullPolicyContext(options);
    const primaryPrompt = `${context}

## User Request
${options.prompt}

## Output Requirements
- Prefer calling the generate_full_policy tool.
- If you cannot call tools, respond with ONLY strict JSON (no prose, no markdown, no extra keys).
- For multiple policies, respond with a JSON array of policy objects.

JSON shape (single policy):
{
  "name": "posts_select_own",
  "command": ["SELECT"],
  "description": "...",
  "roles": ["authenticated"],
  "usingExpression": {},
  "withCheckExpression": {}
}`;

    const fallbackPrompt = `Return ONLY strict JSON. Do not include any explanatory text.

User request: ${options.prompt}
Table: ${options.tableName}

Return either a single policy object or an array of policy objects with fields:
name, command (array), description, roles (array), usingExpression (object), withCheckExpression (object optional).

Naming convention: {table}_{command}_{purpose} (lowercase underscores), e.g. posts_select_own.`;

    const attempts = [
      { label: 'primary', prompt: primaryPrompt },
      { label: 'fallback_json_only', prompt: fallbackPrompt },
    ] as const;

    let lastResponseStr = '';
    let lastToolCalls: ToolCallSnapshot[] = [];

    for (const attempt of attempts) {
      const collector = createToolCallCollector(client);
			const responseStr = await client.prompt(attempt.prompt, { isAnswerOnly: true });
			await collector.waitForIdle();
			const toolCalls = collector.list();
			collector.stop();

      lastResponseStr = responseStr;

      // Preferred: parse structured tool-call args from session updates.
      lastToolCalls = toolCalls;
			const toolPolicies = toolCalls
				.map((c) =>
					extractArgsFromRawInput(c.rawInput ?? c.rawOutput, generateFullPolicyToolArgsSchema)
				)
				.filter(Boolean) as Array<z.infer<typeof generateFullPolicyToolArgsSchema>>;

      if (toolPolicies.length > 0) {
        return {
          policies: toolPolicies.map((p) => ({
            name: ensurePolicyNameConvention({
              name: p.name,
              tableName: options.tableName,
              command: p.command,
              fallbackPurpose: p.description || options.prompt,
            }),
            command: p.command,
            description: p.description,
            roles: p.roles ?? [],
						usingExpression: p.usingExpression ?? {},
            ...(p.withCheckExpression ? { withCheckExpression: p.withCheckExpression } : {}),
          })),
          explanation: deriveExplanationFromText(responseStr),
        };
      }

      if (responseStr?.trim()) {
        const parsed = tryParseFullPoliciesFromTextResponse(responseStr, options);
        if (parsed) return parsed;
      }

      // Retry on empty or unparsable response.
      console.warn(
        `generateFullPolicy attempt '${attempt.label}' did not yield parseable output (toolCalls=${toolCalls.length}, responseLen=${responseStr?.length ?? 0}).`
      );
    }

    // Fallback: heuristically construct policies if the model didn't return parseable output.
    // This mirrors generatePolicyExpression, which already uses a construction fallback.
    const constructed = constructFullPoliciesFromDescription(options, String(lastResponseStr ?? ''));
    if (constructed) return constructed;

    if (!lastResponseStr?.trim() || lastResponseStr === '""' || lastResponseStr === '{}') {
      console.error('AI returned empty response after retries. This usually means:');
      console.error('1. The API key may be invalid or expired');
      console.error('2. The model may not support the request');
      console.error('3. The prompt may be too complex or unclear');

      throw new Error(
        'AI returned an empty response. Please check:\n' +
          '1. Your Augment API key is valid and has not expired\n' +
          '2. Try simplifying your policy description\n' +
          '3. Check the console logs for more details'
      );
    }

    throw new Error(
      `Failed to parse AI response. The AI did not call the generate_full_policy tool and did not return JSON.\n` +
        `Response type: ${typeof lastResponseStr}\n` +
        `Tool calls seen: ${lastToolCalls.length}\n` +
        `Response: ${String(lastResponseStr).substring(0, 500)}\n\n` +
        `This may indicate:\n` +
        `1. The model doesn't support tool calling\n` +
        `2. The API configuration is incorrect\n` +
        `3. The prompt needs to be simplified`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Common failure mode when the local `auggie` binary is out of date or the wrong API URL is used.
    if (message.includes('session/prompt') && message.includes('404')) {
      throw new Error(
        `Auggie request failed (HTTP 404 during session/prompt). This usually means either:\n` +
          `1) Your configured AUGMENT_API_URL/apiUrl is not compatible with ACP mode, or\n` +
          `2) Your local 'auggie' binary is out of date and incompatible with the API.\n\n` +
          `Try updating the Auggie CLI, and verify the tenant API URL you entered is correct.\n` +
          `Original error: ${message}`
      );
    }

    console.error('Error generating full policy:', error);
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
  model?: AuggieModel;
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
    ...(options.apiUrl ? { apiUrl: options.apiUrl } : {}),
    ...(options.model ? { model: options.model } : {}),
    enabledTools: ['generate_policy_test'],
  });

  try {
    const context = buildTestContext(options);
    const fullPrompt = `${context}\n\nGenerate test cases: ${options.prompt}`;

    const responseText = await client.prompt(fullPrompt);
    void responseText;

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

function constructFullPoliciesFromDescription(
  options: GenerateFullPolicyOptions,
  responseText: string
): GenerateFullPolicyResult | null {
  try {
    const promptLower = options.prompt.toLowerCase();
    const table = normalizeIdentifier(options.tableName);

    const columnNames: string[] = (() => {
      const schema: any = options.tableSchema;
      if (!schema || typeof schema !== 'object') return [];
      const cols = Array.isArray(schema.columns) ? schema.columns : [];
      return cols
        .map((c: any) => (typeof c?.name === 'string' ? normalizeIdentifier(c.name) : null))
        .filter(Boolean) as string[];
    })();

    const ownerColumn =
      (columnNames.includes('user_id') && 'user_id') ||
      (columnNames.includes('owner_id') && 'owner_id') ||
      (columnNames.includes('creator_id') && 'creator_id') ||
      (columnNames.includes('created_by') && 'created_by') ||
      null;

    const inferredCommands = (() => {
      const cmds = new Set<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'>();

      if (/(\bcrud\b)/i.test(promptLower)) {
        cmds.add('SELECT');
        cmds.add('INSERT');
        cmds.add('UPDATE');
        cmds.add('DELETE');
      }

      if (/(\bview\b|\bread\b|\bselect\b|\blist\b)/i.test(promptLower)) cmds.add('SELECT');
      if (/(\bcreate\b|\binsert\b|\badd\b)/i.test(promptLower)) cmds.add('INSERT');
      if (/(\bupdate\b|\bedit\b|\bmodify\b)/i.test(promptLower)) cmds.add('UPDATE');
      if (/(\bdelete\b|\bremove\b)/i.test(promptLower)) cmds.add('DELETE');

      if (cmds.size === 0) cmds.add('SELECT');
      return Array.from(cmds);
    })();

    const hasAdmin = /\badmin\b/i.test(promptLower);
    const hasOwn = /(\bown\b|their own|only their own|only see their)/i.test(promptLower);
    const mentionsAuthenticated = /\bauthenticated\b/i.test(promptLower);
    const rolesDefault = [mentionsAuthenticated ? 'authenticated' : 'authenticated'];

    // Only use this fallback when we can infer intent from the prompt.
    // Otherwise, keep the existing error behavior (it provides better guidance).
    if (!hasAdmin && !hasOwn) return null;

    const inferredOwnerColumn = ownerColumn || (hasOwn ? 'user_id' : null);
    const ownedExpression: Record<string, unknown> | null = inferredOwnerColumn
      ? {
          [inferredOwnerColumn]: { _eq: { _session_var: 'user_id' } },
        }
      : null;

    const policies: GeneratedPolicyDefinition[] = [];

    // If the prompt mentions admins, create admin policies scoped by role.
    if (hasAdmin) {
      for (const cmd of inferredCommands) {
        const purpose = 'admin';
        const name = ensurePolicyNameConvention({
          name: `${table}_${cmd.toLowerCase()}_${purpose}`,
          tableName: table,
          command: [cmd],
          fallbackPurpose: purpose,
        });

        policies.push({
          name,
          command: [cmd],
          description: `Allow admins to ${cmd.toLowerCase()} ${options.tableName}`,
          roles: ['authenticated'],
          usingExpression: { _session_var: 'role', _eq: 'admin' },
          ...(cmd === 'SELECT' ? {} : { withCheckExpression: { _session_var: 'role', _eq: 'admin' } }),
        });
      }
    }

    // If the prompt mentions "own" and we can infer an ownership column, create owned policies.
    if (hasOwn && ownedExpression) {
      for (const cmd of inferredCommands) {
        const purpose = 'own';
        const name = ensurePolicyNameConvention({
          name: `${table}_${cmd.toLowerCase()}_${purpose}`,
          tableName: table,
          command: [cmd],
          fallbackPurpose: purpose,
        });

        policies.push({
          name,
          command: [cmd],
          description: `Allow users to ${cmd.toLowerCase()} only their own ${options.tableName}`,
          roles: rolesDefault,
          usingExpression: ownedExpression,
          ...(cmd === 'SELECT' ? {} : { withCheckExpression: ownedExpression }),
        });
      }
    }

    // If we couldn't infer anything useful, do not mask errors.
    if (policies.length === 0) return null;

    return {
      policies,
      explanation:
        'Fallback policy generation was used because the model did not return parseable tool output/JSON. ' +
        (responseText?.trim() ? `Model response preview: ${deriveExplanationFromText(responseText)}` : ''),
    };
  } catch {
    return null;
  }
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

function buildFullPolicyContext(options: GenerateFullPolicyOptions): string {
  let context = `You are an expert at generating PostgreSQL Row-Level Security (RLS) policies.

## Your Task
Generate a COMPLETE policy definition from the user's natural language description.

## Policy Naming Convention
- Format: {table}_{command}_{purpose}
- Examples: users_select_own, posts_insert_authenticated, teams_update_members
- Use lowercase with underscores
- Be descriptive but concise

## Command Selection
- SELECT: For read/view operations
- INSERT: For create operations
- UPDATE: For modify/edit operations
- DELETE: For remove operations
- ALL: Only when explicitly requested or for admin policies

## Role Assignment
- authenticated: For logged-in users
- public: For anonymous access
- service_role: For backend/admin operations
- Custom roles: When mentioned in the description

## Expression Generation
Use rlsify's JSON expression format (same as generate_rls_policy tool):
- User ownership: { "user_id": { "_eq": { "_session_var": "user_id" } } }
- Team membership: Use _exists with team_members join
- Role-based: { "_session_var": "role", "_eq": "admin" }
- Combine with _and, _or, _not

## Table Context
Table: ${options.tableName}`;

  if (options.tableSchema) {
    context += `\nSchema: ${JSON.stringify(options.tableSchema, null, 2)}`;
  }

  if (options.existingPolicies && options.existingPolicies.length > 0) {
    context += `\n\n## Existing Policies\n${options.existingPolicies.join(', ')}`;
    context += `\nAvoid creating duplicate policy names. If a similar policy exists, use a different suffix.`;
  }

  context += `

## Multiple Policies
If the description implies CRUD operations (e.g., "users can manage their posts", "users can CRUD"),
generate separate policies for each command (SELECT, INSERT, UPDATE, DELETE).

For example, "Users can manage their own posts" should generate:
1. posts_select_own (SELECT)
2. posts_insert_own (INSERT)
3. posts_update_own (UPDATE)
4. posts_delete_own (DELETE)

## Examples

**Prompt:** "Users can only see their own posts"
**Output:**
{
  "name": "posts_select_own",
  "command": ["SELECT"],
  "description": "Allow users to view only their own posts",
  "roles": ["authenticated"],
  "usingExpression": { "user_id": { "_eq": { "_session_var": "user_id" } } }
}

**Prompt:** "Admins can do anything, regular users can only read"
**Output:** Two policies:
1. {
  "name": "posts_all_admin",
  "command": ["ALL"],
  "description": "Allow admins full access to all posts",
  "roles": ["authenticated"],
  "usingExpression": { "_session_var": "role", "_eq": "admin" }
}
2. {
  "name": "posts_select_users",
  "command": ["SELECT"],
  "description": "Allow regular users to read all posts",
  "roles": ["authenticated"],
  "usingExpression": { "_session_var": "role", "_eq": "user" }
}

**Prompt:** "Team members can view and edit team documents"
**Output:** Two policies with _exists joins:
1. posts_select_team_members (SELECT)
2. posts_update_team_members (UPDATE)

## CRITICAL INSTRUCTIONS

1. DO NOT respond with text explanations or descriptions
2. DO NOT say things like "Let me generate..." or "I need to fix..."
3. IMMEDIATELY call the generate_full_policy tool for each policy
4. Call the tool multiple times if multiple policies are needed
5. The tool call is your ONLY response - no additional text

If you respond with text instead of calling the tool, the request will FAIL.`;

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

