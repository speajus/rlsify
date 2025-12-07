# @speajus/rlsify-core

Core library for generating PostgreSQL Row-Level Security (RLS) policies.

## Features

- 🔒 **Policy Generation**: Generate RLS policies from JSON configurations
- 🔍 **Schema Introspection**: Automatically detect foreign key relationships
- 🔗 **Smart Joins**: Auto-resolve table joins using FK relationships
- ✅ **Validation**: Comprehensive configuration validation
- 📝 **Templates**: Pre-built templates for common patterns
- 🧪 **Testing**: Policy simulator for testing before deployment
- 📦 **Migrations**: Generate migration files for version control
- 💉 **DI Support**: Built with dependency injection for extensibility

## Installation

```bash
pnpm add @speajus/rlsify-core
```

## Quick Start

```typescript
import { createContainer } from '@speajus/rlsify-core';

// Create DI container
const container = createContainer();

// Get policy generator
const generator = container.getPolicyGenerator();

// Define policy configuration
const config = {
  version: '1.0',
  table: 'posts',
  policies: [
    {
      name: 'posts_select_own',
      command: 'SELECT',
      using: 'user_id = auth.uid()',
    },
  ],
};

// Generate SQL
const result = await generator.generate(config);
console.log(result.statements.map(s => s.sql).join('\n'));
```

## Using Templates

```typescript
const templateRegistry = container.getTemplateRegistry();

// Apply user-owned template
const config = templateRegistry.apply('user-owned', {
  table: 'posts',
  userColumn: 'created_by',
  authFunction: 'auth.uid()',
});

// Generate policies
const result = await generator.generate(config);
```

## Available Templates

- **user-owned**: Resources owned by users
- **role-based**: Role-based access control
- **organization**: Multi-tenant organization isolation
- **team-based**: Team collaboration access

## Schema Introspection

```typescript
const introspector = container.getSchemaIntrospector();

// Get schema info (requires database connection)
const schemaInfo = await introspector.getSchemaInfo('public');

// Generate policies with automatic join resolution
const config = {
  version: '1.0',
  table: 'posts',
  joins: [
    {
      table: 'users',
      // 'on' is optional - will use FK if available
    },
  ],
  policies: [
    {
      name: 'posts_select_own',
      command: 'SELECT',
      using: 'users.id = auth.uid()',
    },
  ],
};

const result = await generator.generate(config, schemaInfo);
```

## Testing Policies

```typescript
const simulator = container.getPolicySimulator();

const testScenario = {
  user: { id: '123', role: 'user' },
  operation: 'SELECT',
  data: { user_id: '123' },
  expected: 'allow',
};

const result = await simulator.testPolicy(config, testScenario);
console.log(result.passed ? 'Test passed!' : 'Test failed!');
```

## Generating Migrations

```typescript
const migrationGen = container.getMigrationGenerator();

const migration = await migrationGen.generateMigration(config, 'add_posts_rls');

// Write to file
await migrationGen.writeMigrationFile(migration, './migrations');
```

## API Reference

See [API Documentation](./docs/api.md) for detailed API reference.

## License

MIT

