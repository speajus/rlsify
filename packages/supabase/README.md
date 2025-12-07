# @speajus/rlsify-supabase

Supabase adapter for rlsify - simplifies PostgreSQL Row-Level Security policy generation for Supabase projects.

## Features

- 🔐 **Supabase Auth Integration**: Built-in support for `auth.uid()` and `auth.jwt()`
- 📦 **Migration Generation**: Create Supabase-compatible migration files
- 🔄 **Auto-apply Policies**: Apply policies directly to your Supabase database
- 📝 **Supabase Templates**: Pre-built templates optimized for Supabase auth
- 🔍 **Schema Introspection**: Automatic foreign key detection using Supabase client

## Installation

```bash
pnpm add @speajus/rlsify-supabase @supabase/supabase-js
```

## Quick Start

```typescript
import { SupabaseAdapter } from '@speajus/rlsify-supabase';

// Create adapter
const adapter = new SupabaseAdapter({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY!,
});

// Define policy configuration
const config = {
  version: '1.0',
  table: 'posts',
  useAuthHelpers: true,
  policies: [
    {
      name: 'posts_select_own',
      command: 'SELECT',
      using: 'user_id = auth.uid()',
    },
  ],
};

// Generate and apply policies
await adapter.applyPolicies(config);
```

## Generate Migration Files

```typescript
// Generate Supabase migration
const migrationPath = await adapter.writeMigration(
  config,
  'add_posts_rls',
  './supabase/migrations'
);

console.log(`Migration created: ${migrationPath}`);
```

## Using with Supabase CLI

```bash
# After generating migration
supabase db reset

# Or apply specific migration
supabase migration up
```

## License

MIT

