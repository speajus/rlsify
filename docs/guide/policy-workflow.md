# Policy Creation and Update Workflow

This document explains the complete workflow for creating, saving, updating, and applying RLS policies in RLSify.

## Overview

RLSify provides multiple interfaces for working with policies:

| Interface | Use Case |
|-----------|----------|
| **Web UI** | Visual policy building with point-and-click |
| **TypeScript API** | Programmatic policy generation |
| **CLI / Migration** | CI/CD integration and version control |

## Policy Lifecycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Create    │ ──▶ │    Save     │ ──▶ │   Preview   │ ──▶ │    Apply    │
│   Policy    │     │   Config    │     │    SQL      │     │   to DB     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
   UI / API           saved_policies      rls.generate_     rls.apply_
   Builder            table (JSONB)       policy_sql()      policy()
```

## Creating a Policy

### 1. Define the Policy Configuration

Every policy starts with a `RLSPolicyConfig` object:

```typescript
const config: RLSPolicyConfig = {
  version: '1.0',
  table: 'posts',              // Target table
  schema: 'public',            // Optional, defaults to 'public'
  enableRLS: true,             // Enable RLS on the table
  policies: [
    {
      name: 'users_own_posts',
      command: 'SELECT',       // SELECT, INSERT, UPDATE, DELETE, or ALL
      usingExpression: {       // JSON expression (preferred)
        user_id: { _eq: { var: 'auth.uid()' } }
      }
    }
  ]
};
```

### 2. Expression Formats

Policies support two expression formats:

#### SQL String (Legacy)
```typescript
{
  name: 'owner_access',
  command: 'SELECT',
  using: 'user_id = auth.uid()'  // Raw SQL
}
```

#### JSON Expression (Preferred)
```typescript
{
  name: 'owner_access',
  command: 'SELECT',
  usingExpression: {
    user_id: { _eq: { var: 'auth.uid()' } }
  }
}
```

The JSON format is preferred because it:
- Is validated at save time
- Can be visually edited in the UI
- Is portable across databases
- Supports complex nested conditions

## Saving a Policy

### Via the UI

1. Click **Save Policy** button
2. Policy is stored in the `saved_policies` table
3. Returns a UUID for the saved policy

### Via the API

```typescript
const response = await policyClient.savePolicy({
  config: config,
  description: 'Allow users to read their own posts'
});

console.log('Saved with ID:', response.policy.id);
```

### Storage Schema

Policies are stored in PostgreSQL:

```sql
CREATE TABLE saved_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config JSONB NOT NULL,           -- Full policy configuration
    description TEXT,                 -- Human-readable description
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ           -- Auto-updated on changes
);
```

## Updating a Policy

### Via the UI

1. Load an existing policy from **Saved Policies** dropdown
2. Make changes (table, conditions, etc.)
3. Click **Update Policy** (button changes from "Save" after loading)
4. Changes are saved with the same UUID

### Via the API

```typescript
// Include the existing ID to update
const response = await policyClient.savePolicy({
  id: existingPolicyId,              // UUID of policy to update
  config: updatedConfig,
  description: 'Updated description'
});
```

### Change Detection

The UI tracks unsaved changes:
- Compares current config to last saved version
- Shows visual indicator when changes exist
- Prompts before discarding unsaved work

## Previewing SQL

Before applying, preview the generated SQL:

### Via UI
Click **Show SQL Preview** to see generated statements.

### Via API
```typescript
const preview = await policyClient.previewPolicies({
  config: config
});

console.log(preview.sql);
// Output:
// ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
// DROP POLICY IF EXISTS users_own_posts ON posts;
// CREATE POLICY users_own_posts ON posts FOR SELECT USING (user_id = auth.uid());
```

### Via PostgreSQL Function
```sql
SELECT rls.generate_policy_sql('{
  "table": "posts",
  "enableRLS": true,
  "policies": [...]
}'::jsonb);
```

## Applying a Policy

### Via the API (with database connection)

```typescript
const result = await policyClient.applyPolicies({
  config: config,
  dryRun: false           // Set true to preview without applying
});

console.log('Applied:', result.applied);
```

### Via PostgreSQL Function

```sql
SELECT rls.apply_policy('{
  "table": "posts",
  "enableRLS": true,
  "policies": [{
    "name": "users_own_posts",
    "command": "SELECT",
    "usingExpression": {"user_id": {"_eq": {"var": "auth.uid()"}}}
  }]
}'::jsonb);
```

### What Apply Does

1. **Enables RLS** on the target table
2. **Drops existing policies** with the same names (idempotent)
3. **Creates new policies** from the configuration
4. All executed in a transaction (atomic)

## Generating Migrations

For version-controlled deployments, generate migration files:

```typescript
const container = createContainer();
const migrationGenerator = container.getMigrationGenerator();

const migration = await migrationGenerator.generate(config, {
  name: 'add_posts_rls',
  outputDir: './migrations'
});
```

## Workflow Examples

### Example 1: New Policy (UI)

1. Open UI at `http://localhost:5174`
2. Select table from dropdown
3. Click **Add Policy**
4. Configure name, command, conditions
5. Click **Save Policy**
6. Review SQL in preview
7. Apply when ready

### Example 2: Update Existing Policy (API)

```typescript
// 1. Fetch existing policy
const existing = await policyClient.getPolicy({ id: policyId });

// 2. Modify the configuration
const updated = {
  ...existing.policy.config,
  policies: [
    ...existing.policy.config.policies,
    { name: 'new_policy', command: 'INSERT', using: 'user_id = auth.uid()' }
  ]
};

// 3. Save updates
await policyClient.savePolicy({
  id: policyId,
  config: updated
});

// 4. Apply to database
await policyClient.applyPolicies({
  config: updated,
  dryRun: false
});
```

### Example 3: CI/CD Pipeline

```bash
# Generate migration from config
rlsify generate --config ./policies/posts.json --output ./migrations/

# Apply in staging
rlsify apply --config ./policies/posts.json --db $STAGING_DB_URL

# Apply in production (after review)
rlsify apply --config ./policies/posts.json --db $PROD_DB_URL
```

## Best Practices

| Practice | Description |
|----------|-------------|
| **Use JSON expressions** | Prefer `usingExpression` over raw SQL strings |
| **Version your configs** | Store policy configs in version control |
| **Test before applying** | Use the Policy Tester or dry-run mode |
| **Name policies consistently** | Use `{table}_{command}_{scope}` pattern |
| **Document policies** | Use the description field for context |

## Related Documentation

- [Visual Step-by-Step Guide](./visual-step-by-step.md) - UI walkthrough with screenshots
- [Expression Language](./expression-language.md) - JSON expression syntax
- [Testing Policies](./testing-policies.md) - How to test before deployment
- [Security Best Practices](./security-best-practices.md) - Security considerations

