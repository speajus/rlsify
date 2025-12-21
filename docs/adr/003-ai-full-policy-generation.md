# ADR 003: AI-Powered Full Policy Generation

**Status:** Proposed  
**Date:** 2025-12-21  
**Deciders:** Project Team  
**Context:** Extending AI capabilities to generate complete policies from natural language  
**Supersedes:** Extends [ADR 002: AI-Powered Policy Generation](./002-ai-powered-policy-generation.md)

## Context and Problem Statement

ADR 002 introduced AI-powered policy generation via `AIExpressionBuilder.svelte`, which generates JSON expressions (USING/WITH CHECK clauses) from natural language prompts. However, users must still manually:

1. Create a new policy entry
2. Name the policy (e.g., `users_select_own_posts`)
3. Select the command (SELECT, INSERT, UPDATE, DELETE, ALL)
4. Assign roles (e.g., `authenticated`, `public`)
5. Add a description
6. Then use AI to generate the expression

This multi-step process is still cumbersome for users who want to quickly describe their access control requirements and get a complete, ready-to-use policy.

**User Request:** "Create a plan to use AI to create a full policy when a user simply describes what they want the policy to be in the Policy Configuration tab. It can generate the name, command, description and roles. Keep the current AI using Expression thing for refining."

## Decision Drivers

- **Simplicity**: Reduce policy creation from 6+ steps to a single natural language description
- **Completeness**: Generate all policy fields (name, command, description, roles, expressions) in one operation
- **Consistency**: Follow naming conventions and best practices automatically
- **Flexibility**: Allow users to refine AI-generated policies using existing tools
- **Coexistence**: Maintain the existing `AIExpressionBuilder` for expression-level refinement
- **Discoverability**: Make AI generation prominent in the Policy Configuration tab

## Decision

### Add AI Full Policy Generator to Policy Configuration Tab

We will create a new component `AIFullPolicyGenerator.svelte` that appears at the top of the Policy Configuration section in `PolicyEditor.svelte`, allowing users to generate complete policies before manually adding individual policies.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              PolicyEditor.svelte (Policy Configuration)          │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │      AIFullPolicyGenerator.svelte (NEW)                   │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ "Describe your access control policy..."           │  │  │
│  │  │ Example: "Users can only see their own posts"      │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │  [Generate Complete Policy] [Advanced Options ▼]          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Generated Policy Preview (conditionally shown)           │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ Name: users_select_own_posts                        │  │  │
│  │  │ Command: SELECT                                     │  │  │
│  │  │ Description: Allow users to view their own posts   │  │  │
│  │  │ Roles: authenticated                                │  │  │
│  │  │ Expression: { user_id: { _eq: {...} } }            │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │  [✓ Accept & Add] [✏️ Edit Fields] [🔄 Regenerate]       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Existing Policies:                                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  PolicyItem #1 - users_select_own_posts                   │  │
│  │  [Visual] [Source] [SQL] [AI] ← AIExpressionBuilder      │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| `AIFullPolicyGenerator.svelte` | Natural language input, policy generation, preview UI |
| `AIExpressionBuilder.svelte` | Expression-level refinement (existing, unchanged) |
| `PolicyEditor.svelte` | Host both components, manage policy list |
| `policy-store.ts` | Add `addGeneratedPolicy()` function |
| `auggie-service.ts` (backend) | Implement `generateFullPolicy()` with new tool |
| `auggie-service.ts` (frontend) | Client wrapper for RPC call |

### New Auggie Tool: `generate_full_policy`

```typescript
const generateFullPolicyTool = tool({
  name: 'generate_full_policy',
  description: `Generate a complete RLS policy definition with all fields from a natural language description.
  
  This tool generates:
  - Policy name following convention: {table}_{command}_{purpose}
  - Appropriate command(s) based on the description
  - Human-readable description
  - Suitable roles (authenticated, public, service_role, etc.)
  - Complete USING and WITH CHECK expressions
  
  Call this tool with all fields populated based on the user's natural language request.`,
  parameters: z.object({
    name: z.string().describe('Policy name following convention: {table}_{command}_{purpose}, e.g., users_select_own'),
    command: z.array(z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL']))
      .describe('SQL command(s) this policy applies to'),
    description: z.string().describe('Human-readable explanation of what this policy does'),
    roles: z.array(z.string()).optional()
      .describe('PostgreSQL roles this policy applies to (e.g., authenticated, public)'),
    usingExpression: z.record(z.any())
      .describe('JSON expression for USING clause (for SELECT, UPDATE, DELETE)'),
    withCheckExpression: z.record(z.any()).optional()
      .describe('JSON expression for WITH CHECK clause (for INSERT, UPDATE)'),
  }),
  execute: async (input) => JSON.stringify(input, null, 2),
});
```

### Backend Implementation

**File:** `packages/service/src/services/auggie-service.ts`

```typescript
export interface GenerateFullPolicyOptions {
  apiKey: string;
  apiUrl?: string;
  prompt: string;
  tableName: string;
  tableSchema?: Record<string, unknown>;
  existingPolicies?: string[];
  model?: string;
}

export interface GenerateFullPolicyResult {
  policy: {
    name: string;
    command: string[];
    description: string;
    roles?: string[];
    usingExpression: Record<string, unknown>;
    withCheckExpression?: Record<string, unknown>;
  };
  explanation: string;
}

export async function generateFullPolicy(
  options: GenerateFullPolicyOptions
): Promise<GenerateFullPolicyResult> {
  const client = await createAuggieClient({
    apiKey: options.apiKey,
    apiUrl: options.apiUrl,
    model: options.model
  });

  try {
    const context = buildFullPolicyContext(options);
    const fullPrompt = `${context}\n\n## User Request\n${options.prompt}\n\nGenerate a complete policy and call the generate_full_policy tool.`;

    const response = await client.prompt(fullPrompt);

    // Parse and validate the tool response
    const parsed = JSON.parse(response);

    return {
      policy: {
        name: parsed.name,
        command: parsed.command,
        description: parsed.description,
        roles: parsed.roles,
        usingExpression: parsed.usingExpression,
        withCheckExpression: parsed.withCheckExpression,
      },
      explanation: parsed.explanation || parsed.description,
    };
  } finally {
    await client.close();
  }
}
```

### Frontend Implementation

**File:** `packages/ui/src/lib/services/auggie-service.ts`

```typescript
export interface GenerateFullPolicyOptions {
  prompt: string;
  tableName: string;
  tableSchema?: TableInfo;
  existingPolicies?: string[];
  model?: string;
}

export interface GenerateFullPolicyResult {
  policy: PolicyDefinition;
  explanation: string;
}

export async function generateFullPolicy(
  options: GenerateFullPolicyOptions
): Promise<GenerateFullPolicyResult> {
  const tokenData = retrieveAuggieToken();

  if (!tokenData) {
    throw new Error('No Auggie API token found. Please provide a token.');
  }

  const response = await policyClient.generateFullPolicy({
    apiKey: tokenData.accessToken,
    apiUrl: tokenData.tenantURL,
    prompt: options.prompt,
    tableName: options.tableName,
    tableSchema: options.tableSchema as any,
    existingPolicies: options.existingPolicies || [],
    model: options.model,
  });

  return {
    policy: response.policy as PolicyDefinition,
    explanation: response.explanation,
  };
}
```

### Policy Store Enhancement

**File:** `packages/ui/src/lib/stores/policy-store.ts`

```typescript
/**
 * Add an AI-generated complete policy to the configuration
 */
export function addGeneratedPolicy(policy: PolicyDefinition) {
  state.update((s) => ({
    ...s,
    config: {
      ...s.config,
      policies: [...s.config.policies, policy],
    },
  }));
}
```

## Decisions Made

### 1. Placement and UX Flow

**Decision:** Collapsible section at the top of PolicyEditor (Option C)

**Rationale:**
- Always visible but not intrusive
- Users can collapse it after generating policies
- Maintains focus on the policy list as the primary interface
- Consistent with existing UI patterns in rlsify

### 2. Multiple Policy Generation

**Decision:** Generate separate policies for each command (Option A)

**Rationale:**
- Aligns with PostgreSQL RLS best practices (separate policies per command)
- Easier to manage and modify individual policies
- Better granularity for testing and debugging
- Users can still manually create multi-command policies if needed

**Example:** "Users can CRUD their own posts" generates:
- `users_select_own_posts` (SELECT)
- `users_insert_own_posts` (INSERT)
- `users_update_own_posts` (UPDATE)
- `users_delete_own_posts` (DELETE)

### 3. Integration with Existing Policies

**Decision:** AI is aware of existing policies to avoid duplicates

**Rationale:**
- Prevents accidental duplicate policy creation
- AI can suggest complementary policies
- Existing policy names are passed in the prompt context
- Users can still override if they want similar policies

### 4. Preview and Editing

**Decision:** Preview card with [Accept] [Edit] [Regenerate] buttons (Option A)

**Rationale:**
- Gives users control before committing
- "Edit" opens inline editing of fields before accepting
- "Regenerate" allows iteration without losing context
- Clear visual separation between preview and accepted policies

### 5. Conversation History

**Decision:** Defer to future enhancement

**Rationale:**
- MVP focuses on single-shot generation
- Conversation history adds complexity to storage and UI
- Can be added in a future ADR when iterative refinement is needed
- Current approach: each generation is independent

### 6. Error Handling

**Decision:** Show error and let user refine description

**Rationale:**
- Transparent to the user
- Avoids infinite retry loops
- Educates users on what makes a good prompt
- Fallback: accept partial results and let user fill in missing fields manually

### 7. Scope of Initial Implementation

**Decision:** MVP includes:
- ✅ Single policy generation
- ✅ Preview/review interface
- ✅ Multiple policy generation (when description implies CRUD)
- ❌ Conversation history (deferred)
- ❌ Iterative refinement (deferred)

## Implementation Plan

### Phase 1: Backend Infrastructure (Tasks 2-3)

1. **Define `generate_full_policy` tool** in `packages/service/src/services/auggie-service.ts`
2. **Implement `generateFullPolicy()` function** with prompt engineering
3. **Add gRPC endpoint** `GenerateFullPolicy` to `proto/rlsify/v1/policy.proto`
4. **Implement RPC handler** in `PolicyServiceImpl`

### Phase 2: Frontend Service Layer (Task 6-7)

1. **Add client-side wrapper** in `packages/ui/src/lib/services/auggie-service.ts`
2. **Update policy store** with `addGeneratedPolicy()` function
3. **Add TypeScript types** for full policy generation

### Phase 3: UI Components (Tasks 4-5, 9)

1. **Create `AIFullPolicyGenerator.svelte`**
   - Natural language textarea
   - Generate button with loading state
   - Advanced options (model selection, etc.)
2. **Create preview interface**
   - Display all generated fields
   - Inline editing capability
   - Accept/Regenerate actions
3. **Integrate into `PolicyEditor.svelte`**
   - Position at top of Policy Configuration section
   - Collapsible section with clear heading

### Phase 4: Prompt Engineering (Task 8, 11)

1. **Build comprehensive system prompt** including:
   - Table schema and column information
   - Existing policy names to avoid duplicates
   - Naming conventions and best practices
   - Common patterns (user ownership, team membership, role-based)
   - Examples of good policy definitions
2. **Add context awareness**
   - Detect CRUD operations in prompt
   - Suggest appropriate roles based on table name
   - Infer relationships from foreign keys

### Phase 5: Multiple Policy Support (Task 10)

1. **Detect CRUD keywords** in prompt (create, read, update, delete, CRUD, manage)
2. **Generate array of policies** instead of single policy
3. **Update preview UI** to show multiple policies
4. **Add "Accept All" and "Accept Selected" options**

### Phase 6: Testing & Documentation (Tasks 13-14)

1. **Unit tests** for `generateFullPolicy()` backend function
2. **Integration tests** for RPC endpoint
3. **Component tests** for `AIFullPolicyGenerator.svelte`
4. **Update ADR 002** to reference this ADR
5. **Create user documentation** with examples and best practices

## Prompt Engineering Strategy

### System Prompt Structure

```typescript
function buildFullPolicyContext(options: GenerateFullPolicyOptions): string {
  return `You are an expert at generating PostgreSQL Row-Level Security (RLS) policies.

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
Use rlsify's JSON expression format:
- User ownership: { "user_id": { "_eq": { "_session_var": "user_id" } } }
- Team membership: Use _exists with team_members join
- Role-based: { "_session_var": "role", "_eq": "admin" }
- Combine with _and, _or, _not

## Table Context
Table: ${options.tableName}
Schema: ${JSON.stringify(options.tableSchema, null, 2)}

## Existing Policies
${options.existingPolicies?.join(', ') || 'None'}

## Multiple Policies
If the description implies CRUD operations (e.g., "users can manage their posts"),
generate separate policies for each command (SELECT, INSERT, UPDATE, DELETE).

CRITICAL: Call the generate_full_policy tool with ALL fields populated.`;
}
```

### Example Prompts and Expected Output

| User Prompt | Generated Policy |
|-------------|------------------|
| "Users can only see their own posts" | `name: "users_select_own_posts"`<br>`command: ["SELECT"]`<br>`roles: ["authenticated"]`<br>`usingExpression: { user_id: { _eq: { _session_var: "user_id" } } }` |
| "Admins can do anything, regular users can only read" | Two policies:<br>1. `admins_all_posts` (ALL, role=admin)<br>2. `users_select_posts` (SELECT, role=authenticated) |
| "Team members can view and edit team documents" | Two policies:<br>1. `team_members_select_documents` (SELECT)<br>2. `team_members_update_documents` (UPDATE)<br>Both with `_exists` checking team_members table |
| "Users can CRUD their own posts" | Four policies:<br>`users_select_own_posts`<br>`users_insert_own_posts`<br>`users_update_own_posts`<br>`users_delete_own_posts` |

## Consequences

### Positive

1. **Dramatically Reduced Friction**: Policy creation goes from 6+ steps to 1 natural language description
2. **Consistency**: AI follows naming conventions and best practices automatically
3. **Completeness**: All fields generated together, reducing errors from missing fields
4. **Discoverability**: Prominent placement in Policy Configuration tab makes AI features obvious
5. **Flexibility**: Users can still refine using existing tools (Visual, Source, SQL, AI Expression)
6. **Smart Defaults**: AI suggests appropriate roles and commands based on context
7. **Multiple Policy Support**: Handles CRUD operations intelligently

### Negative

1. **Increased Complexity**: More code to maintain (new tool, RPC endpoint, UI component)
2. **Potential Confusion**: Two AI features (full policy vs expression) might confuse users
3. **Preview Overhead**: Preview/accept flow adds an extra step vs direct addition
4. **Naming Conflicts**: AI might generate names that conflict with existing policies

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| AI generates incorrect policy names | Validate against naming convention, show preview before accepting |
| Duplicate policy names | Check existing policies, append suffix if needed |
| Invalid expressions | Validate against schema, show errors, allow manual editing |
| User confusion between two AI features | Clear labeling: "Generate Complete Policy" vs "Refine Expression" |
| Over-reliance on AI | Provide examples and documentation for manual creation |

## Alternatives Considered

### Alternative 1: Extend AIExpressionBuilder Instead of New Component

**Rejected because:**
- Mixing two different use cases (full policy vs expression refinement)
- Would make AIExpressionBuilder too complex
- Different placement needs (top of editor vs inside policy item)

### Alternative 2: Modal Dialog for Policy Generation

**Rejected because:**
- Adds extra click to open modal
- Hides the feature from immediate view
- Breaks flow of policy configuration

### Alternative 3: Generate Single Multi-Command Policy

**Rejected because:**
- Goes against PostgreSQL RLS best practices
- Harder to manage and test individual operations
- Less flexible for users who want different expressions per command

## Open Questions

### 1. Should we support "regenerate all policies for this table"?

**Context:** User has existing policies but wants to start fresh with AI

**Options:**
- Require manual deletion first
- Generate with different names to avoid conflicts

**Decision:** Defer to user feedback after MVP

### 2. Should we support policy templates/presets?

**Context:** Common patterns like "user ownership", "team membership", "role-based"

**Options:**
- Add template buttons that pre-fill the prompt
- Create a separate templates feature
- Let AI learn from existing policies

**Decision:** Defer to future enhancement

### 3. How should we handle ambiguous prompts?

**Context:** "Users can access posts" - does this mean SELECT only or CRUD?

**Options:**
- AI makes best guess (SELECT only)
- AI asks clarifying questions
- Generate multiple options and let user choose

**Decision:** AI makes best guess, user can regenerate with more specific prompt

## Success Metrics

- **Adoption Rate**: % of policies created using AI Full Policy Generator vs manual
- **Time to Policy**: Average time from opening Policy Configuration to saving a policy
- **Regeneration Rate**: How often users regenerate vs accept first result
- **Edit Rate**: How often users edit generated policies before accepting
- **Error Rate**: % of generated policies that fail validation

## File Structure

```
packages/
├── service/src/services/
│   └── auggie-service.ts          # Add generateFullPolicy(), generate_full_policy tool
├── ui/src/lib/
│   ├── AIFullPolicyGenerator.svelte   # NEW: Full policy generation component
│   ├── AIExpressionBuilder.svelte     # EXISTING: Expression refinement
│   ├── PolicyEditor.svelte            # UPDATED: Add AIFullPolicyGenerator
│   ├── services/
│   │   └── auggie-service.ts          # Add generateFullPolicy() client wrapper
│   └── stores/
│       └── policy-store.ts            # Add addGeneratedPolicy()
└── types/src/
    └── gen/rlsify/v1/
        └── policy_pb.ts               # Add GenerateFullPolicyRequest/Response
proto/rlsify/v1/
└── policy.proto                       # Add GenerateFullPolicy RPC
```

## Next Steps

1. ✅ Create ADR 003 (this document)
2. [ ] Review and approve ADR with team
3. [ ] Implement Phase 1: Backend infrastructure
4. [ ] Implement Phase 2: Frontend service layer
5. [ ] Implement Phase 3: UI components
6. [ ] Implement Phase 4: Prompt engineering
7. [ ] Implement Phase 5: Multiple policy support
8. [ ] Implement Phase 6: Testing & documentation
9. [ ] User testing and feedback
10. [ ] Iterate based on metrics and feedback

## References

- [ADR 002: AI-Powered Policy Generation](./002-ai-powered-policy-generation.md)
- [ADR 001: Project Architecture](./001-project-architecture.md)
- [Auggie SDK Documentation](https://docs.augmentcode.com/cli/sdk)
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

---

**Document History:**
- 2025-12-21: Initial ADR created

