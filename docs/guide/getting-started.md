# Getting Started

This guide will help you set up RLSify and create your first Row-Level Security policy.

## Prerequisites

- Node.js 18+
- pnpm 9+
- PostgreSQL 14+ (or use Docker)

## Installation

### Option 1: Docker (Recommended)

The fastest way to get started with a complete environment:

```bash
# Clone the repository
git clone https://github.com/speajus/rlsify.git
cd rlsify

# Setup environment
npm run docker:setup

# Start PostgreSQL and UI
npm run docker:up

# Open the visual builder
open http://localhost:5174
```

This gives you:
- PostgreSQL 16 with RLS enabled
- Sample multi-tenant schema
- Visual policy builder UI
- Test data for experimentation

### Option 2: Install Packages

Add RLSify packages to your existing project:

```bash
pnpm add @speajus/rlsify-core @speajus/rlsify-types
```

For Supabase projects:

```bash
pnpm add @speajus/rlsify-supabase
```

## Your First Policy

### 1. Define a Policy Configuration

```typescript
import { createContainer } from '@speajus/rlsify-core';
import type { RLSPolicyConfig } from '@speajus/rlsify-types';

const container = createContainer();
const generator = container.getPolicyGenerator();

const config: RLSPolicyConfig = {
  version: '1.0',
  table: 'posts',
  enableRLS: true,
  policies: [
    {
      name: 'users_read_own_posts',
      command: 'SELECT',
      using: 'user_id = auth.uid()'
    },
    {
      name: 'users_insert_own_posts',
      command: 'INSERT',
      checkExpression: 'user_id = auth.uid()'
    }
  ]
};
```

### 2. Generate SQL

```typescript
const result = await generator.generate(config);

console.log(result.statements.map(s => s.sql).join('\n'));
```

Output:
```sql
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_read_own_posts ON posts
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY users_insert_own_posts ON posts
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
```

### 3. Using JSON Expressions

For complex policies, use the JSON expression language:

```typescript
const config: RLSPolicyConfig = {
  version: '1.0',
  table: 'documents',
  enableRLS: true,
  policies: [
    {
      name: 'team_members_access',
      command: 'SELECT',
      usingExpression: {
        _or: [
          { is_public: { _eq: true } },
          {
            _exists: {
              _table: 'team_members',
              _where: {
                team_id: { _eq: { column: 'documents.team_id' } },
                user_id: { _eq: { var: 'auth.uid()' } }
              }
            }
          }
        ]
      }
    }
  ]
};
```

## With Supabase

```typescript
import { SupabaseAdapter } from '@speajus/rlsify-supabase';

const adapter = new SupabaseAdapter({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY!
});

// Generate a migration file
await adapter.writeMigration(config, 'add_posts_rls', './supabase/migrations');

// Or apply directly
await adapter.apply(config);
```

## Next Steps

- [Docker Setup](/guide/docker-setup) - Full environment with sample data
- [Expression Language](/guide/expression-language) - Learn JSON policy syntax
- [Policy Types](/guide/policy-types) - Understand SELECT, INSERT, UPDATE, DELETE policies
- [Testing Policies](/guide/testing-policies) - Write tests for your policies

