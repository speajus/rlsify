# 🔒 RLSify

**Simplify PostgreSQL Row-Level Security (RLS) policy creation with a modern TypeScript toolkit.**

RLSify is a monorepo containing tools for defining, generating, and managing PostgreSQL RLS policies through code, templates, and a visual UI.

## 📦 Packages

### Core Libraries

- **[@speajus/rlsify-types](./packages/types)** - TypeScript type definitions
- **[@speajus/rlsify-core](./packages/core)** - Core library for policy generation
- **[@speajus/rlsify-supabase](./packages/supabase)** - Supabase adapter with auth helpers

### UI & Tools

- **[@speajus/rlsify-ui](./packages/ui)** - Svelte-based web UI for visual policy building

### Examples

- **[@speajus/rlsify-examples](./packages/examples)** - General usage examples
- **[@speajus/rlsify-supabase-example](./packages/supabase-example)** - Supabase-specific examples

## 🚀 Quick Start

### Installation

```bash
# Install pnpm if you haven't already
npm install -g pnpm

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Basic Usage

```typescript
import { createContainer } from '@speajus/rlsify-core';
import type { RLSPolicyConfig } from '@speajus/rlsify-types';

const container = createContainer();
const generator = container.getPolicyGenerator();

const config: RLSPolicyConfig = {
  version: '1.0',
  table: 'posts',
  policies: [
    {
      name: 'posts_select_own',
      command: 'SELECT',
      using: 'user_id = auth.uid()',
    },
  ],
  enableRLS: true,
};

const result = await generator.generate(config);
console.log(result.statements.map(s => s.sql).join('\n'));
```

### With Supabase

```typescript
import { SupabaseAdapter } from '@speajus/rlsify-supabase';

const adapter = new SupabaseAdapter({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY!,
});

await adapter.writeMigration(config, 'add_posts_rls', './supabase/migrations');
```

## ✨ Features

- 🎯 **Type-Safe**: Full TypeScript support with comprehensive type definitions
- 🔗 **Auto-Join Detection**: Automatically resolves foreign key relationships
- 📝 **Templates**: Pre-built templates for common patterns (user-owned, role-based, multi-tenant)
- 🎨 **Visual UI**: Svelte-based web interface for building policies
- 🔄 **Migration Generation**: Create version-controlled migration files
- ✅ **Policy Simulation**: Test policies before deployment
- 🔐 **Supabase Integration**: First-class support for Supabase auth helpers
- 🏗️ **Dependency Injection**: Clean architecture with @speajus/diblob

## 📚 Documentation

See individual package READMEs for detailed documentation:

- [Core Library](./packages/core/README.md)
- [Supabase Adapter](./packages/supabase/README.md)
- [UI](./packages/ui/README.md)
- [Examples](./packages/examples/README.md)

## 🏗️ Architecture

See [Architecture Decision Record](./docs/adr/001-project-architecture.md) for detailed architectural decisions.

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in development mode
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Run examples
cd packages/examples
pnpm basic
pnpm templates
pnpm joins
```

## 📄 License

MIT © Justin Spears

