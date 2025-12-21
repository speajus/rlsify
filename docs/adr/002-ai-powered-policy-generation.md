# ADR 002: AI-Powered Policy Generation with Auggie SDK

**Status:** Implemented
**Date:** 2025-12-21
**Deciders:** Project Team
**Context:** Adding AI-powered rule definition and test generation to rlsify

> **Note:** This ADR describes the AI Expression Builder for refining individual USING/WITH CHECK expressions.
> For the AI Full Policy Generator that creates complete policies from scratch, see [ADR 003](./003-ai-full-policy-generation.md).

## Context and Problem Statement

The rlsify UI currently supports three modes for defining RLS policy expressions:
- **Visual** - Template-based condition builder (`VisualQueryBuilder.svelte`)
- **Source/JSON** - Direct JSON editing (`PermissionBuilder.svelte`)
- **SQL** - Raw SQL expression input

While these modes work well for developers familiar with RLS concepts, there's an opportunity to leverage AI to:
1. Allow users to describe access control requirements in natural language
2. Automatically generate JSON policy definitions that conform to rlsify's schema
3. Generate test cases to validate policies work as intended

The [Auggie SDK](https://docs.augmentcode.com/cli/sdk) provides a TypeScript API for building AI-powered integrations with custom tools and typed responses.

## Decision Drivers

- **Accessibility**: Lower the barrier for non-expert users to create correct RLS policies
- **Productivity**: Speed up policy creation for experienced users
- **Quality**: AI-generated test cases can improve policy coverage
- **Consistency**: Ensure AI output conforms to rlsify's JSON expression schema
- **Integration**: Seamless integration with existing Visual/Source/SQL modes

## Proposed Solution

### Add a Fourth Editor Mode: AI

Extend `PolicyItem.svelte` to include an AI mode alongside the existing modes:

| Mode | Component | Description |
|------|-----------|-------------|
| Visual | `VisualQueryBuilder.svelte` | Drag-and-drop condition builder |
| Source | `PermissionBuilder.svelte` | Direct JSON editing |
| SQL | `<Textarea>` | Raw SQL expression |
| **AI** | `AIExpressionBuilder.svelte` | Natural language → JSON generation |

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         PolicyItem.svelte                        │
├─────────────┬─────────────┬─────────────┬─────────────────────────┤
│   Visual    │   Source    │    SQL      │          AI             │
│             │             │             │                         │
│ VisualQuery │ Permission  │  Textarea   │  AIExpressionBuilder    │
│  Builder    │  Builder    │             │                         │
└─────────────┴─────────────┴─────────────┴──────────┬──────────────┘
                                                      │
                                          ┌───────────▼───────────┐
                                          │   auggie-service.ts   │
                                          │  (Auggie SDK wrapper) │
                                          └───────────┬───────────┘
                                                      │
                                          ┌───────────▼───────────┐
                                          │  @augmentcode/        │
                                          │   auggie-sdk          │
                                          │                       │
                                          │  Custom Tools:        │
                                          │  - generate_policy    │
                                          │  - generate_tests     │
                                          └───────────────────────┘
```

## Implementation Phases

### Phase 1: Dependencies & Infrastructure

**Install SDK:**
```bash
pnpm --filter @speajus/rlsify-ui add @augmentcode/auggie-sdk ai zod
```

**Create service wrapper:**
- `packages/ui/src/lib/services/auggie-service.ts`
- Handle Auggie client lifecycle
- Authentication via environment variables or `auggie token print`

### Phase 2: Custom Auggie Tools

Define ai-sdk compatible tools for structured output:

```typescript
// generate_rls_policy tool
const generate_rls_policy = tool({
  name: "generate_rls_policy",
  description: "Generate a JSON RLS policy definition",
  inputSchema: z.object({
    tableName: z.string(),
    policyName: z.string(),
    command: z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL']),
    usingExpression: z.object({}).passthrough(),  // PermissionExpression
    withCheckExpression: z.object({}).passthrough().optional(),
    description: z.string().optional()
  }),
  execute: async (input) => JSON.stringify(input, null, 2)
});

// generate_policy_test tool  
const generate_policy_test = tool({
  name: "generate_policy_test",
  description: "Generate a test case for an RLS policy",
  inputSchema: z.object({
    policyName: z.string(),
    testName: z.string(),
    asUser: z.string(),
    expectedResult: z.enum(['allowed', 'denied']),
    testQuery: z.object({
      operation: z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
      testData: z.object({}).passthrough().optional()
    })
  }),
  execute: async (input) => JSON.stringify(input, null, 2)
});
```

### Phase 3: UI Components

**New component: `AIExpressionBuilder.svelte`**

```svelte
<script lang="ts">
  import { generatePolicyFromPrompt } from './services/auggie-service.js';

  interface Props {
    baseTable: string;
    expression?: PermissionExpression;
    onUpdate: (expr: PermissionExpression) => void;
    onGenerateTests?: (tests: PolicyTest[]) => void;
  }

  let prompt = $state('');
  let isGenerating = $state(false);
</script>

<div class="ai-builder">
  <textarea
    bind:value={prompt}
    placeholder="Describe your access control requirement...
Example: 'Users can only see their own posts, admins can see all'"
  />

  <div class="flex gap-2">
    <Button onclick={generatePolicy} disabled={isGenerating}>
      Generate Policy
    </Button>
    <Button variant="outline" onclick={generateTests}>
      Generate Tests
    </Button>
  </div>
</div>
```

### Phase 4: Prompt Engineering

Provide schema context to Auggie for accurate generation:

```typescript
const SYSTEM_PROMPT = `
You generate PostgreSQL RLS policies in rlsify's JSON expression format.

## Available Operators
- _eq, _ne: Equality comparisons
- _gt, _gte, _lt, _lte: Numeric comparisons
- _in, _nin: Array membership
- _like, _ilike: Pattern matching
- _and, _or, _not: Logical operators
- _exists: Subquery existence check

## Variable References
- { var: "auth.uid()" } - Current user ID
- { column: "table.column" } - Reference another column

## Table Schema
${JSON.stringify(tableInfo, null, 2)}
`;
```

### Phase 5: Type Definitions

Add to `packages/types/src/index.ts`:

```typescript
export interface PolicyTest {
  id: string;
  policyName: string;
  testName: string;
  description?: string;
  userContext: {
    userId: string;
    role?: string;
    claims?: Record<string, unknown>;
  };
  operation: PolicyCommand;
  expectedResult: 'allowed' | 'denied';
  testData?: Record<string, unknown>;
  generatedBy?: 'ai' | 'manual';
}
```

## Open Questions

### 1. Client-Side vs Server-Side AI Execution

**Option A: Client-Side (Browser)**
- Simpler architecture
- User's Auggie credentials used directly
- Limited by browser environment

**Recommendation:** Start with client-side for MVP, migrate to server-side if needed.

**Questions:**
- What would trigger a move to server-side execution later (rate limits, team/shared tokens, audit logging, etc.)?
- Do we need an explicit “AI disabled” setting for environments where external calls are not allowed?

### 2. Authentication Strategy

- How should users authenticate with Auggie?
  - Environment variables (`AUGMENT_API_TOKEN`, `AUGMENT_API_URL`)
  - `auggie token print` output
  - Add a UI for entering the token and saving it to local storage. If there is no
    token, then prompt the user to enter it when they select AI mode, and guide them
    to get the token from the Auggie CLI.

**Questions:**
- Should the UI token be considered the primary auth method, with env vars as dev-only?
- Should we provide a “Clear token” action and a quick “Validate token” check?
- Should the token be stored per-project (per DB connection) or globally in the browser?
- What localStorage key name should we standardize on?

### 3. Streaming vs Batch Responses

- Should generation stream results for better UX?
- Auggie SDK supports streaming mode

**Questions:**
- For v1, do we want streaming output, or is a non-streaming “Generate” action acceptable?
- If streaming, should we stream explanation text and only output JSON in the final tool call?

### 4. Test Integration with PolicyTester

- Should AI-generated tests integrate with existing `PolicyTester.svelte`?
  - Yes.  The AI generated tests should be able to be run in the PolicyTester.
  - Perhaps a Test All interface that will run all the tests and show failures. Allow Auggie to suggest improvements to the policy.

**Questions:**
- Where should AI-generated tests live (embedded in the policy config JSON, stored separately in the DB, or UI-only and ephemeral)?  
Answer: Stored in the db, the way they current are.
- Should tests be exportable as Vitest/Jest code in addition to being runnable in the UI?
Answer: out of scope, for now use the existing test ui within the app.
- Should the PolicyTester run tests inside a transaction and rollback by default (especially for INSERT/UPDATE/DELETE)?
Answer: Yes.  The policy tester should run tests in a transaction and rollback by default.
- How should “run as user” be represented (user_id only, role, JWT claims, all of the above)?
Answer: Use the existing JWT infrastructure.  The policy tester should be able to set the JWT claims, id, orgId and role.

### 5. Model Selection

- Allow users to choose model? (sonnet4.5, opus4.5, etc.)
- Allow the user to select the model and have the model persisted in the policy config.  Have a way to override the model for a single generation.

**Questions:**
- Which model should be the default (if any), and should the user’s choice be persisted?
- Should we allow only a curated list of models, or a free-form model name?

### 6. Scope: “rule definitions in JSON, for each of the tables”

- Should AI generation be per-table (one table at a time) or allow “generate for all tables”?
- If “all tables” is supported, should it generate a full `RLSPolicyConfig` (multiple policies), or a set of per-table policies that the user reviews/accepts incrementally?
- What schema context will we provide to Auggie (columns, FKs, relationships, existing policies)?
Answer: It should be per table.  The user will be able to select multiple tables and generate policies for each table.  The output will be a set of per-table policies that the user reviews/accepts incrementally.  The schema context will be provided to Auggie.  The existing policies for the table will also be provided to Auggie.

### 7. Output Contract and Validation

- Should AI output only `PermissionExpression` (USING/WITH CHECK), or full `PolicyDefinition` (name, command, roles, etc.)?
- Do we want strict schema validation for `PermissionExpression`, or accept a permissive object and validate later?
- If the model produces invalid JSON/schema, should we automatically re-prompt the model to fix it (“self-heal loop”), or show errors to the user and let them edit?

### 8. Policy Improvement Suggestions

- When tests fail, should Auggie propose changes as a diff/suggestion that the user must explicitly apply?
- Answer: Yes.  Auggie should propose changes as a diff/suggestion that the user must explicitly apply.  The user should be able to accept the changes or make further edits.
- Should we keep a “conversation history” per policy so the user can iterate with context?
- Answer: Yes.  We should keep a conversation history per policy so the user can iterate with context.  The conversation history should be stored in the policy config.  The user should be able to view the history and see the changes that were made.

## Consequences

### Positive

1. **Lower Barrier**: Natural language makes RLS accessible to non-experts
2. **Faster Iteration**: Generate policies in seconds instead of minutes
3. **Better Coverage**: AI can suggest edge cases for test generation
4. **Type Safety**: Custom tools ensure output matches rlsify schemas
5. **Seamless Integration**: AI-generated JSON works with existing modes

### Negative

1. **External Dependency**: Requires Auggie/Augment subscription
2. **Latency**: AI calls add network latency
3. **Non-Deterministic**: Same prompt may produce different outputs
4. **Cost**: API calls incur usage costs

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Incorrect policy generation | Validate output against schema, show preview before applying |
| API unavailability | Graceful fallback to manual modes |
| Prompt injection | Sanitize user input, use structured tools |
| Cost overruns | Rate limiting, usage tracking |

## File Structure

```
packages/ui/src/lib/
├── services/
│   └── auggie-service.ts        # Auggie SDK wrapper
├── AIExpressionBuilder.svelte   # AI mode component
├── AITestGenerator.svelte       # Test generation component
├── PolicyItem.svelte            # Updated with AI mode tab
└── stores/
    └── policy-store.ts          # Updated with AI state
```

## Next Steps

1. [x] Resolve open questions (client/server, auth strategy)
2. [ ] Install `@augmentcode/auggie-sdk` dependency
3. [ ] Create `auggie-service.ts` wrapper
4. [ ] Implement `AIExpressionBuilder.svelte`
5. [ ] Add AI mode tab to `PolicyItem.svelte`
6. [ ] Add `PolicyTest` type to `@speajus/rlsify-types`
7. [ ] Implement test generation and integration
8. [ ] Add tests for AI service layer

## References

- [Auggie SDK Documentation](https://docs.augmentcode.com/cli/sdk)
- [Auggie TypeScript SDK](https://docs.augmentcode.com/cli/sdk-typescript)
- [Vercel AI SDK Tools](https://sdk.vercel.ai/docs)
- [ADR 001: Project Architecture](./001-project-architecture.md)

---

**Document History:**
- 2025-12-21: Initial ADR created

