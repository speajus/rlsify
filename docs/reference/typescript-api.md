# TypeScript API Reference

API reference for RLSify TypeScript packages.

## @speajus/rlsify-types

Type definitions for RLS policies and expressions.

### RLSPolicyConfig

Main configuration object for a table's RLS policies.

```typescript
interface RLSPolicyConfig {
  version: string;
  table: string;
  schema?: string;
  enableRLS?: boolean;
  forceRLS?: boolean;
  policies: PolicyDefinition[];
}
```

### PolicyDefinition

Individual policy definition.

```typescript
interface PolicyDefinition {
  name: string;
  command: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  permissive?: boolean;  // default: true
  roles?: string[];      // default: ['public']
  
  // Raw SQL expressions
  using?: string;
  check?: string;
  
  // JSON expressions (preferred)
  usingExpression?: PermissionExpression;
  checkExpression?: PermissionExpression;
}
```

### PermissionExpression

JSON permission expression type.

```typescript
type PermissionExpression =
  | FieldExpression
  | AndExpression
  | OrExpression
  | NotExpression
  | ExistsExpression;

interface FieldExpression {
  [field: string]: ComparisonExpression;
}

interface AndExpression {
  _and: PermissionExpression[];
}

interface OrExpression {
  _or: PermissionExpression[];
}

interface NotExpression {
  _not: PermissionExpression;
}

interface ExistsExpression {
  _exists: {
    _table: string | { schema: string; name: string };
    _where: PermissionExpression;
  };
}
```

### ComparisonExpression

Comparison operators and values.

```typescript
interface ComparisonExpression {
  _eq?: ComparisonValue;
  _neq?: ComparisonValue;
  _gt?: ComparisonValue;
  _gte?: ComparisonValue;
  _lt?: ComparisonValue;
  _lte?: ComparisonValue;
  _in?: ComparisonValue[];
  _nin?: ComparisonValue[];
  _like?: string;
  _ilike?: string;
  _is_null?: boolean;
  _contains?: object;
  _contained_by?: object;
  _has_key?: string;
  _has_any_keys?: string[];
  _has_all_keys?: string[];
}

type ComparisonValue =
  | string
  | number
  | boolean
  | null
  | SessionVariable
  | ColumnReference;

interface SessionVariable {
  var: string;
  type?: 'uuid' | 'text' | 'integer' | 'boolean' | 'timestamp' | 'jsonb';
}

interface ColumnReference {
  column: string;
}
```

## @speajus/rlsify-core

Core library for policy generation.

### createContainer

Creates a dependency injection container.

```typescript
import { createContainer } from '@speajus/rlsify-core';

const container = createContainer();
```

### PolicyGenerator

Generates SQL from policy configurations.

```typescript
const generator = container.getPolicyGenerator();

const result = await generator.generate(config);

interface GenerateResult {
  statements: SQLStatement[];
  warnings?: string[];
}

interface SQLStatement {
  type: 'ENABLE_RLS' | 'CREATE_POLICY' | 'DROP_POLICY';
  sql: string;
  policyName?: string;
}
```

### compilePermissionExpression

Compiles a JSON expression to SQL.

```typescript
import { compilePermissionExpression } from '@speajus/rlsify-core';

const expr = {
  user_id: { _eq: { var: 'auth.uid()' } }
};

const sql = compilePermissionExpression(expr);
// Returns: "user_id = auth.uid()"
```

### validatePolicy

Validates a policy configuration.

```typescript
import { validatePolicy } from '@speajus/rlsify-core';

const errors = validatePolicy(config);

if (errors.length > 0) {
  console.error('Validation failed:', errors);
}
```

## @speajus/rlsify-supabase

Supabase adapter for RLSify.

### SupabaseAdapter

```typescript
import { SupabaseAdapter } from '@speajus/rlsify-supabase';

const adapter = new SupabaseAdapter({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY!
});
```

#### Methods

##### apply

Applies policies directly to the database.

```typescript
await adapter.apply(config);
```

##### generate

Generates SQL without applying.

```typescript
const sql = await adapter.generate(config);
console.log(sql);
```

##### writeMigration

Creates a migration file.

```typescript
await adapter.writeMigration(
  config,
  'add_posts_rls',           // Migration name
  './supabase/migrations'    // Output directory
);
```

##### getTableInfo

Fetches table schema information.

```typescript
const info = await adapter.getTableInfo('posts');
console.log(info.columns);
console.log(info.foreignKeys);
```

## Usage Examples

### Basic Policy

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
      name: 'owner_access',
      command: 'ALL',
      usingExpression: {
        user_id: { _eq: { var: 'auth.uid()' } }
      },
      checkExpression: {
        user_id: { _eq: { var: 'auth.uid()' } }
      }
    }
  ]
};

const result = await generator.generate(config);
```

### Team-Based Access

```typescript
const config: RLSPolicyConfig = {
  version: '1.0',
  table: 'documents',
  enableRLS: true,
  policies: [
    {
      name: 'team_member_access',
      command: 'SELECT',
      usingExpression: {
        _exists: {
          _table: 'team_members',
          _where: {
            team_id: { _eq: { column: 'documents.team_id' } },
            user_id: { _eq: { var: 'auth.uid()' } }
          }
        }
      }
    }
  ]
};
```

### Multi-Tenant with Supabase

```typescript
import { SupabaseAdapter } from '@speajus/rlsify-supabase';

const adapter = new SupabaseAdapter({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY!
});

const config: RLSPolicyConfig = {
  version: '1.0',
  table: 'resources',
  enableRLS: true,
  forceRLS: true,
  policies: [
    {
      name: 'org_isolation',
      command: 'ALL',
      permissive: false,  // Restrictive
      usingExpression: {
        org_id: {
          _eq: {
            var: "current_setting('request.jwt.claims')::json->>'org_id'",
            type: 'uuid'
          }
        }
      }
    }
  ]
};

await adapter.apply(config);
```

