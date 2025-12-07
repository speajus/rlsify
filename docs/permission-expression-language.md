# Permission Expression Language

## Overview

rlsify supports a JSON-based permission expression language inspired by Hasura's permission system. This allows you to define Row-Level Security policies using structured JSON instead of raw SQL, making them easier to build, validate, and maintain.

## Why JSON Expressions?

1. **Visual Builder Support**: JSON expressions can be built using a visual UI
2. **Type Safety**: Structured format enables validation and type checking
3. **Portability**: JSON is language-agnostic and easy to serialize
4. **Composability**: Complex expressions can be built from simple building blocks
5. **Readability**: More intuitive than raw SQL for common patterns

## Basic Structure

A permission expression is a JSON object that describes a boolean condition. It gets compiled to a PostgreSQL WHERE clause for use in RLS policies.

### Simple Field Comparison

```json
{
  "user_id": {
    "_eq": { "var": "auth.uid()", "type": "uuid" }
  }
}
```

Compiles to: `user_id = auth.uid()`

### Multiple Conditions (AND)

```json
{
  "_and": [
    { "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } } },
    { "status": { "_eq": "active" } }
  ]
}
```

Compiles to: `(user_id = auth.uid() AND status = 'active')`

### Multiple Conditions (OR)

```json
{
  "_or": [
    { "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } } },
    { "is_public": { "_eq": true } }
  ]
}
```

Compiles to: `(user_id = auth.uid() OR is_public = true)`

## Comparison Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `_eq` | Equal | `{ "age": { "_eq": 18 } }` |
| `_neq` | Not equal | `{ "status": { "_neq": "deleted" } }` |
| `_gt` | Greater than | `{ "price": { "_gt": 100 } }` |
| `_gte` | Greater than or equal | `{ "age": { "_gte": 18 } }` |
| `_lt` | Less than | `{ "stock": { "_lt": 10 } }` |
| `_lte` | Less than or equal | `{ "discount": { "_lte": 50 } }` |
| `_in` | In array | `{ "role": { "_in": ["admin", "editor"] } }` |
| `_nin` | Not in array | `{ "status": { "_nin": ["deleted", "archived"] } }` |
| `_like` | SQL LIKE | `{ "name": { "_like": "John%" } }` |
| `_ilike` | Case-insensitive LIKE | `{ "email": { "_ilike": "%@example.com" } }` |
| `_is_null` | IS NULL check | `{ "deleted_at": { "_is_null": true } }` |

## Session Variables

Session variables reference runtime values from the database session or JWT claims:

```json
{
  "user_id": {
    "_eq": { "var": "auth.uid()", "type": "uuid" }
  }
}
```

### Common Session Variables

- `auth.uid()` - Current user ID (Supabase)
- `current_user` - Current database user
- `current_setting('request.jwt.claims')::json->>'role'` - JWT role claim
- `current_setting('request.jwt.claims')::json->>'org_id'` - JWT organization ID

## Logical Operators

### AND

```json
{
  "_and": [
    { "user_id": { "_eq": { "var": "auth.uid()" } } },
    { "status": { "_eq": "published" } },
    { "deleted_at": { "_is_null": true } }
  ]
}
```

### OR

```json
{
  "_or": [
    { "user_id": { "_eq": { "var": "auth.uid()" } } },
    { "is_public": { "_eq": true } }
  ]
}
```

### NOT

```json
{
  "_not": {
    "status": { "_eq": "deleted" }
  }
}
```

## EXISTS Queries

Check for existence in related or unrelated tables:

```json
{
  "_exists": {
    "_table": "user_roles",
    "_where": {
      "_and": [
        { "user_id": { "_eq": { "var": "auth.uid()" } } },
        { "role": { "_in": ["admin", "editor"] } }
      ]
    }
  }
}
```

Compiles to:
```sql
EXISTS (
  SELECT 1 FROM user_roles 
  WHERE user_id = auth.uid() AND role IN ('admin', 'editor')
)
```

## Common Patterns

### 1. User-Owned Records

```json
{
  "user_id": {
    "_eq": { "var": "auth.uid()", "type": "uuid" }
  }
}
```

### 2. Role-Based Access

```json
{
  "_exists": {
    "_table": "user_roles",
    "_where": {
      "_and": [
        { "user_id": { "_eq": { "var": "auth.uid()" } } },
        { "role": { "_in": ["admin", "editor"] } }
      ]
    }
  }
}
```

### 3. Organization/Tenant Isolation

```json
{
  "organization_id": {
    "_eq": {
      "var": "current_setting('request.jwt.claims')::json->>'org_id'",
      "type": "text"
    }
  }
}
```

### 4. Public or Owned

```json
{
  "_or": [
    { "is_public": { "_eq": true } },
    { "user_id": { "_eq": { "var": "auth.uid()" } } }
  ]
}
```

## Using in rlsify

### In Code (TypeScript)

```typescript
import { PolicyDefinition } from '@speajus/rlsify-types';

const policy: PolicyDefinition = {
  name: 'posts_select_own',
  command: 'SELECT',
  usingExpression: {
    user_id: {
      _eq: { var: 'auth.uid()', type: 'uuid' }
    }
  }
};
```

### In UI

The rlsify UI provides a visual Permission Builder with:
- Template selection (User-Owned, Role-Based, Organization/Tenant)
- Toggle between SQL and JSON modes
- JSON editor with syntax highlighting
- Real-time SQL preview

## Compilation

JSON expressions are compiled to PostgreSQL SQL using the `compilePermissionExpression()` function:

```typescript
import { compilePermissionExpression } from '@speajus/rlsify-core';

const expr = {
  user_id: { _eq: { var: 'auth.uid()', type: 'uuid' } }
};

const sql = compilePermissionExpression(expr);
// Result: "user_id = auth.uid()"
```

## Benefits Over Raw SQL

1. **Validation**: Catch errors before deployment
2. **Type Safety**: Ensure correct types for comparisons
3. **Reusability**: Share common patterns across policies
4. **Testing**: Easier to unit test permission logic
5. **Documentation**: Self-documenting structure
6. **Tooling**: Enable visual builders and code generation

