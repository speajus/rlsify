# What is RLSify?

RLSify is a TypeScript monorepo that simplifies the creation and management of PostgreSQL Row-Level Security (RLS) policies. It provides tools for defining policies through code, templates, and a visual UI.

## The Problem

PostgreSQL Row-Level Security is a powerful feature that allows you to restrict which rows users can access or modify based on policies you define. However, writing and managing RLS policies can be challenging:

- **Complex SQL syntax** - RLS policies require understanding PostgreSQL's policy syntax
- **No type safety** - Raw SQL strings offer no compile-time checking
- **Difficult to test** - Testing RLS policies typically requires complex database setups
- **Hard to maintain** - As policies grow, they become difficult to understand and modify
- **No visual tools** - Most developers must write SQL by hand

## The Solution

RLSify addresses these challenges with:

### 1. JSON Expression Language

Instead of writing raw SQL, define policies using structured JSON that's easy to read and validate:

```json
{
  "user_id": {
    "_eq": { "var": "auth.uid()", "type": "uuid" }
  }
}
```

Compiles to: `user_id = auth.uid()`

### 2. TypeScript Support

Full type definitions for policies, expressions, and configurations:

```typescript
import type { PolicyDefinition } from '@speajus/rlsify-types';

const policy: PolicyDefinition = {
  name: 'users_own_posts',
  command: 'SELECT',
  usingExpression: {
    user_id: { _eq: { var: 'auth.uid()' } }
  }
};
```

### 3. Visual Builder

A Svelte-based web UI that lets you build policies visually without writing code.

### 4. PostgreSQL Stored Procedures

Server-side functions that compile JSON expressions to SQL and apply policies directly in the database.

### 5. Test Containers

Integration with `@testcontainers/postgresql` for realistic testing of RLS policies.

## Packages

| Package | Description |
|---------|-------------|
| `@speajus/rlsify-types` | TypeScript type definitions |
| `@speajus/rlsify-core` | Core library for policy generation |
| `@speajus/rlsify-supabase` | Supabase adapter with auth helpers |
| `@speajus/rlsify-ui` | Svelte-based visual builder |

## Use Cases

- **Multi-tenant SaaS** - Isolate data between organizations
- **Team collaboration** - Control access based on team membership
- **Role-based access** - Grant permissions based on user roles
- **Document security** - Protect sensitive documents with fine-grained policies
- **Audit compliance** - Enforce data access rules for regulatory requirements

## Next Steps

- [Getting Started](/guide/getting-started) - Set up RLSify in 5 minutes
- [Docker Setup](/guide/docker-setup) - Try the complete environment with Docker
- [Expression Language](/guide/expression-language) - Learn the JSON policy syntax

