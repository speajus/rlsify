# Test Containers

Use `@testcontainers/postgresql` to run RLS tests against a real PostgreSQL database in Docker.

## Why Test Containers?

- **Real PostgreSQL** - No mocking, actual RLS behavior
- **Isolated** - Each test run gets a fresh database
- **Reproducible** - Same environment locally and in CI
- **Fast** - Containers start in seconds

## Setup

### Install Dependencies

```bash
pnpm add -D @testcontainers/postgresql pg @types/pg vitest
```

### Basic Configuration

```typescript
// tests/setup.ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';

let container: StartedPostgreSqlContainer;
let client: Client;

export async function setupTestDatabase() {
  container = await new PostgreSqlContainer('postgres:16')
    .withDatabase('test_db')
    .withUsername('test')
    .withPassword('test')
    .start();

  client = new Client({
    connectionString: container.getConnectionUri()
  });
  await client.connect();

  return { container, client };
}

export async function teardownTestDatabase() {
  await client?.end();
  await container?.stop();
}
```

## Complete Test Example

```typescript
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';

describe('RLS Policies', () => {
  let container: StartedPostgreSqlContainer;
  let adminClient: Client;
  let userClient: Client;

  const TIMEOUT = 60000;

  beforeAll(async () => {
    // Start PostgreSQL container
    container = await new PostgreSqlContainer('postgres:16')
      .withDatabase('rlsify_test')
      .withUsername('admin')
      .withPassword('admin')
      .start();

    // Admin connection (superuser, bypasses RLS)
    adminClient = new Client({
      connectionString: container.getConnectionUri()
    });
    await adminClient.connect();

    // Load schema and RLS functions
    const schema = fs.readFileSync('docker/postgres/init/01-schema.sql', 'utf8');
    const rlsFunctions = fs.readFileSync('docker/postgres/init/05-rls-functions.sql', 'utf8');
    
    await adminClient.query(schema);
    await adminClient.query(rlsFunctions);

    // Create test role for RLS testing
    await adminClient.query(`
      CREATE ROLE test_user WITH LOGIN PASSWORD 'test_user';
      GRANT USAGE ON SCHEMA public TO test_user;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO test_user;
    `);

    // User connection (subject to RLS)
    const userUri = container.getConnectionUri()
      .replace('admin:admin', 'test_user:test_user');
    userClient = new Client({ connectionString: userUri });
    await userClient.connect();
  }, TIMEOUT);

  afterAll(async () => {
    await userClient?.end();
    await adminClient?.end();
    await container?.stop();
  });

  describe('Owner-based access', () => {
    beforeAll(async () => {
      // Create test table and data
      await adminClient.query(`
        CREATE TABLE posts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          title TEXT NOT NULL
        );

        INSERT INTO posts (user_id, title) VALUES
          ('aaaa-aaaa-aaaa-aaaa', 'Alice Post'),
          ('bbbb-bbbb-bbbb-bbbb', 'Bob Post');

        ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      `);

      // Apply RLS policy using RLSify functions
      const config = JSON.stringify({
        table: 'posts',
        enableRLS: true,
        policies: [{
          name: 'owner_access',
          command: 'SELECT',
          usingExpression: {
            user_id: { _eq: { var: 'auth.uid()' } }
          }
        }]
      });

      await adminClient.query(`SELECT rls.apply_policy('${config}'::jsonb)`);
    });

    it('user sees only their own posts', async () => {
      // Set user context
      await userClient.query(`SELECT auth.set_user('aaaa-aaaa-aaaa-aaaa')`);

      const result = await userClient.query('SELECT * FROM posts');

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].title).toBe('Alice Post');
    });

    it('user cannot see other users posts', async () => {
      await userClient.query(`SELECT auth.set_user('aaaa-aaaa-aaaa-aaaa')`);

      const result = await userClient.query(
        `SELECT * FROM posts WHERE user_id = 'bbbb-bbbb-bbbb-bbbb'`
      );

      expect(result.rows).toHaveLength(0);
    });
  });
});
```

## Dual-Client Pattern

For proper RLS testing, use two connections:

```typescript
// Superuser connection - for DDL and policy management
const adminClient = new Client({ connectionString: superuserUri });

// Regular user connection - for testing RLS enforcement
const userClient = new Client({ connectionString: regularUserUri });
```

**Why?**
- Superusers bypass RLS by default
- Regular users are subject to policies
- Use admin for setup, user for tests

## Performance Tips

### Reuse Containers

```typescript
// vitest.config.ts
export default {
  test: {
    globalSetup: './tests/global-setup.ts',
    globalTeardown: './tests/global-teardown.ts'
  }
};

// tests/global-setup.ts
export default async function setup() {
  const container = await startContainer();
  process.env.TEST_DATABASE_URL = container.getConnectionUri();
}
```

### Parallel Tests

```typescript
// Use separate schemas for parallel tests
await client.query(`CREATE SCHEMA test_${testId}`);
await client.query(`SET search_path TO test_${testId}, public`);
```

## CI Integration

### GitHub Actions

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: pnpm install
      - run: pnpm test
```

## Troubleshooting

### Container Won't Start

```typescript
// Increase timeout
container = await new PostgreSqlContainer('postgres:16')
  .withStartupTimeout(120000)  // 2 minutes
  .start();
```

### Permission Denied

```typescript
// Grant schema usage
await adminClient.query(`
  GRANT USAGE ON SCHEMA public TO test_user;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO test_user;
`);
```

## Next Steps

- [Testing Policies](/guide/testing-policies) - Test patterns and examples
- [Security Best Practices](/guide/security-best-practices) - Secure your policies

