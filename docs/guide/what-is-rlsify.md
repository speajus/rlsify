# What is RLSify?

RLSify is a **visual policy builder** for PostgreSQL Row-Level Security (RLS). Create, test, and deploy access control policies without writing SQL.

![RLSify Visual UI](/images/guide-step-10.png)

## The Problem

PostgreSQL Row-Level Security is powerful but challenging to work with:

- **Complex SQL syntax** - RLS policies require understanding PostgreSQL's policy syntax
- **No type safety** - Raw SQL strings offer no compile-time checking
- **Difficult to test** - Testing RLS policies typically requires complex database setups
- **Hard to maintain** - As policies grow, they become difficult to understand and modify
- **No visual tools** - Most developers must write SQL by hand

## The Solution

### 🎨 Visual Policy Builder

Build RLS policies with a point-and-click interface:

- **Select tables** from your database schema
- **Build conditions** using dropdowns and form inputs
- **Preview SQL** generated in real-time
- **Test policies** before deploying

::: tip Try It Now
```bash
git clone https://github.com/speajus/rlsify.git
cd rlsify && pnpm install
pnpm docker:setup && pnpm docker:up
open http://localhost:5174
```
:::

### TypeScript API

For programmatic policy generation, use the TypeScript packages:

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

### JSON Expression Language

Define policies using structured JSON that compiles to SQL:

```json
{
  "user_id": {
    "_eq": { "var": "auth.uid()", "type": "uuid" }
  }
}
```

Compiles to: `user_id = auth.uid()`

### Built-in Policy Testing

Test policies against real data before deploying to production.

## Packages

| Package | Description |
|---------|-------------|
| `@speajus/rlsify-ui` | Visual policy builder (Svelte) |
| `@speajus/rlsify-core` | Core library for policy generation |
| `@speajus/rlsify-types` | TypeScript type definitions |
| `@speajus/rlsify-supabase` | Supabase adapter with auth helpers |

## Use Cases

- **Multi-tenant SaaS** - Isolate data between organizations
- **Team collaboration** - Control access based on team membership
- **Role-based access** - Grant permissions based on user roles
- **Document security** - Protect sensitive documents with fine-grained policies
- **Audit compliance** - Enforce data access rules for regulatory requirements

## Next Steps

- [Visual Step-by-Step Guide](/guide/visual-step-by-step) - Create your first policy with the UI
- [Getting Started](/guide/getting-started) - Quick start guide
- [Docker Setup](/guide/docker-setup) - Run the complete environment
- [Expression Language](/guide/expression-language) - Learn the JSON policy syntax

