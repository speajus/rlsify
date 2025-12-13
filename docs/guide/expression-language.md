# Expression Language

RLSify uses a JSON-based expression language inspired by Hasura's permission system. This allows you to define policies using structured JSON instead of raw SQL.

## Why JSON Expressions?

1. **Visual Builder Support** - JSON can be built with a UI
2. **Type Safety** - Structured format enables validation
3. **Portability** - JSON is language-agnostic
4. **Composability** - Build complex expressions from simple parts
5. **Readability** - More intuitive than raw SQL for common patterns

## Basic Structure

A permission expression is a JSON object that compiles to a PostgreSQL WHERE clause.

### Simple Field Comparison

```json
{
  "user_id": {
    "_eq": { "var": "auth.uid()", "type": "uuid" }
  }
}
```

Compiles to: `user_id = auth.uid()`

### Multiple Conditions

```json
{
  "_and": [
    { "user_id": { "_eq": { "var": "auth.uid()" } } },
    { "status": { "_eq": "active" } }
  ]
}
```

Compiles to: `(user_id = auth.uid() AND status = 'active')`

## Comparison Operators

| Operator | SQL | Example |
|----------|-----|---------|
| `_eq` | `=` | `{ "age": { "_eq": 18 } }` |
| `_neq` | `!=` | `{ "status": { "_neq": "deleted" } }` |
| `_gt` | `>` | `{ "price": { "_gt": 100 } }` |
| `_gte` | `>=` | `{ "age": { "_gte": 18 } }` |
| `_lt` | `<` | `{ "stock": { "_lt": 10 } }` |
| `_lte` | `<=` | `{ "discount": { "_lte": 50 } }` |
| `_in` | `IN` | `{ "role": { "_in": ["admin", "editor"] } }` |
| `_nin` | `NOT IN` | `{ "status": { "_nin": ["deleted"] } }` |
| `_like` | `LIKE` | `{ "name": { "_like": "John%" } }` |
| `_ilike` | `ILIKE` | `{ "email": { "_ilike": "%@example.com" } }` |
| `_is_null` | `IS NULL` | `{ "deleted_at": { "_is_null": true } }` |

### JSONB Operators

| Operator | SQL | Description |
|----------|-----|-------------|
| `_contains` | `@>` | JSONB contains |
| `_contained_by` | `<@` | JSONB contained by |
| `_has_key` | `?` | JSONB has key |
| `_has_any_keys` | `?|` | JSONB has any keys |
| `_has_all_keys` | `?&` | JSONB has all keys |

## Logical Operators

### _and

All conditions must be true:

```json
{
  "_and": [
    { "status": { "_eq": "published" } },
    { "deleted_at": { "_is_null": true } }
  ]
}
```

### _or

Any condition can be true:

```json
{
  "_or": [
    { "is_public": { "_eq": true } },
    { "user_id": { "_eq": { "var": "auth.uid()" } } }
  ]
}
```

### _not

Negate a condition:

```json
{
  "_not": {
    "status": { "_eq": "deleted" }
  }
}
```

## Value Types

### Literals

```json
{ "age": { "_eq": 18 } }
{ "name": { "_eq": "John" } }
{ "is_active": { "_eq": true } }
```

### Session Variables

Reference runtime values:

```json
{
  "user_id": {
    "_eq": { "var": "auth.uid()", "type": "uuid" }
  }
}
```

Common variables:
- `auth.uid()` - Current user ID (Supabase)
- `current_user` - Database user
- `current_setting('request.jwt.claims')::json->>'role'`

### Column References

Reference other columns:

```json
{
  "team_id": {
    "_eq": { "column": "documents.team_id" }
  }
}
```

## EXISTS Queries

Check for existence in related tables:

```json
{
  "_exists": {
    "_table": "team_members",
    "_where": {
      "team_id": { "_eq": { "column": "documents.team_id" } },
      "user_id": { "_eq": { "var": "auth.uid()" } }
    }
  }
}
```

Compiles to:

```sql
EXISTS (
  SELECT 1 FROM team_members
  WHERE team_id = documents.team_id
    AND user_id = auth.uid()
)
```

### Nested EXISTS

```json
{
  "_exists": {
    "_table": "teams",
    "_where": {
      "id": { "_eq": { "column": "documents.team_id" } },
      "_exists": {
        "_table": "organization_members",
        "_where": {
          "organization_id": { "_eq": { "column": "teams.organization_id" } },
          "user_id": { "_eq": { "var": "auth.uid()" } }
        }
      }
    }
  }
}
```

## Using in TypeScript

```typescript
import { compilePermissionExpression } from '@speajus/rlsify-core';

const expr = {
  user_id: { _eq: { var: 'auth.uid()' } }
};

const sql = compilePermissionExpression(expr);
// Result: "user_id = auth.uid()"
```

## Next Steps

- [Policy Types](/guide/policy-types) - SELECT, INSERT, UPDATE, DELETE
- [Basic Patterns](/examples/basic-patterns) - Common policy examples
- [Stored Procedures](/reference/stored-procedures) - PostgreSQL functions

