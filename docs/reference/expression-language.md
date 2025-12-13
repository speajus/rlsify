# Expression Language Reference

Complete reference for the JSON permission expression language.

## Comparison Operators

### Equality

| Operator | SQL | Description |
|----------|-----|-------------|
| `_eq` | `=` | Equal to |
| `_neq` | `<>` or `!=` | Not equal to |

```json
{ "status": { "_eq": "active" } }
{ "deleted": { "_neq": true } }
```

### Numeric Comparison

| Operator | SQL | Description |
|----------|-----|-------------|
| `_gt` | `>` | Greater than |
| `_gte` | `>=` | Greater than or equal |
| `_lt` | `<` | Less than |
| `_lte` | `<=` | Less than or equal |

```json
{ "age": { "_gte": 18 } }
{ "price": { "_lt": 100 } }
```

### Array Operators

| Operator | SQL | Description |
|----------|-----|-------------|
| `_in` | `IN` | Value in array |
| `_nin` | `NOT IN` | Value not in array |

```json
{ "role": { "_in": ["admin", "moderator"] } }
{ "status": { "_nin": ["deleted", "archived"] } }
```

### String Operators

| Operator | SQL | Description |
|----------|-----|-------------|
| `_like` | `LIKE` | Pattern match (case-sensitive) |
| `_ilike` | `ILIKE` | Pattern match (case-insensitive) |

```json
{ "name": { "_like": "John%" } }
{ "email": { "_ilike": "%@gmail.com" } }
```

### NULL Check

| Operator | SQL | Description |
|----------|-----|-------------|
| `_is_null` | `IS NULL` / `IS NOT NULL` | NULL check |

```json
{ "deleted_at": { "_is_null": true } }
{ "email": { "_is_null": false } }
```

### JSONB Operators

| Operator | SQL | Description |
|----------|-----|-------------|
| `_contains` | `@>` | JSONB contains |
| `_contained_by` | `<@` | JSONB contained by |
| `_has_key` | `?` | Has key |
| `_has_any_keys` | `?|` | Has any of keys |
| `_has_all_keys` | `?&` | Has all of keys |

```json
{ "metadata": { "_contains": { "type": "premium" } } }
{ "tags": { "_has_key": "featured" } }
{ "permissions": { "_has_all_keys": ["read", "write"] } }
```

## Logical Operators

### _and

All conditions must be true. Empty array returns `true`.

```json
{
  "_and": [
    { "status": { "_eq": "published" } },
    { "deleted_at": { "_is_null": true } },
    { "org_id": { "_eq": { "var": "get_org_id()" } } }
  ]
}
```

SQL: `(status = 'published' AND deleted_at IS NULL AND org_id = get_org_id())`

### _or

Any condition can be true. Empty array returns `false`.

```json
{
  "_or": [
    { "is_public": { "_eq": true } },
    { "owner_id": { "_eq": { "var": "auth.uid()" } } },
    { "role": { "_in": ["admin", "moderator"] } }
  ]
}
```

SQL: `(is_public = true OR owner_id = auth.uid() OR role IN ('admin', 'moderator'))`

### _not

Negates the condition.

```json
{
  "_not": {
    "status": { "_eq": "deleted" }
  }
}
```

SQL: `NOT (status = 'deleted')`

### Nested Logic

```json
{
  "_and": [
    { "org_id": { "_eq": { "var": "get_org_id()" } } },
    {
      "_or": [
        { "is_public": { "_eq": true } },
        { "owner_id": { "_eq": { "var": "auth.uid()" } } }
      ]
    }
  ]
}
```

## Value Types

### Literals

Direct values in JSON:

```json
{ "count": { "_eq": 42 } }
{ "name": { "_eq": "John" } }
{ "active": { "_eq": true } }
{ "config": { "_eq": null } }
```

### Session Variables

Runtime values from the database session:

```json
{
  "user_id": {
    "_eq": { "var": "auth.uid()", "type": "uuid" }
  }
}
```

Common variables:
- `auth.uid()` - Current user ID
- `current_user` - Database username
- `current_setting('request.jwt.claims')::json->>'role'`
- `NOW()` - Current timestamp

### Column References

Reference columns from other tables:

```json
{
  "team_id": {
    "_eq": { "column": "documents.team_id" }
  }
}
```

## EXISTS Queries

### Basic EXISTS

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

SQL:
```sql
EXISTS (
  SELECT 1 FROM team_members
  WHERE team_id = documents.team_id
    AND user_id = auth.uid()
)
```

### Schema-Qualified Table

```json
{
  "_exists": {
    "_table": { "schema": "private", "name": "permissions" },
    "_where": { ... }
  }
}
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

## Mixed Expressions

Combine field comparisons with logical operators in the same object:

```json
{
  "status": { "_eq": "active" },
  "_exists": {
    "_table": "team_members",
    "_where": {
      "team_id": { "_eq": { "column": "docs.team_id" } },
      "user_id": { "_eq": { "var": "auth.uid()" } }
    }
  }
}
```

SQL: `(status = 'active' AND EXISTS (SELECT 1 FROM team_members WHERE ...))`

## Type Annotations

Specify types for proper casting:

```json
{
  "user_id": {
    "_eq": { "var": "auth.uid()", "type": "uuid" }
  }
}
```

Supported types: `uuid`, `text`, `integer`, `boolean`, `timestamp`, `jsonb`

