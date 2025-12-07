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

### Option 1: Docker (Recommended) 🐳

The fastest way to try RLSify with a complete working environment including PostgreSQL and sample data:

```bash
# 1. Copy environment variables
cp .env.example .env

# 2. Start PostgreSQL and UI
make up
# Or: docker-compose up -d

# 3. Open the UI
open http://localhost:5174

# 4. Run the interactive demo
./docker/scripts/demo-workflow.sh
```

**What you get:**
- ✅ PostgreSQL 16 with Row-Level Security enabled
- ✅ Multi-tenant schema (organizations → teams → users)
- ✅ Sample data (3 orgs, 7 users, 4 teams)
- ✅ RLSify UI with Visual Builder, Templates, and SQL editor
- ✅ Auth helpers for testing RLS policies
- ✅ Interactive demo and test scripts

**Documentation:**
- [Getting Started Guide](./GETTING_STARTED_DOCKER.md) - 5-minute setup
- [Complete Docker Guide](./DOCKER.md) - Detailed documentation
- [Quick Reference](./docker/QUICK_REFERENCE.md) - Common commands

### Option 2: Local Development

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

