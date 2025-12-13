# Stored Procedures Reference

PostgreSQL functions for compiling and applying RLS policies.

## Overview

RLSify includes PostgreSQL stored procedures in the `rls` schema that compile JSON expressions to SQL and apply policies directly in the database.

## Functions

### rls.compile_value

Compiles a JSON value to SQL.

```sql
rls.compile_value(value JSONB) RETURNS TEXT
```

**Parameters:**
- `value` - JSON value (literal, variable, or column reference)

**Examples:**

```sql
-- Literals
SELECT rls.compile_value('"hello"'::jsonb);  -- 'hello'
SELECT rls.compile_value('42'::jsonb);        -- 42
SELECT rls.compile_value('true'::jsonb);      -- true

-- Session variable
SELECT rls.compile_value('{"var": "auth.uid()"}'::jsonb);
-- auth.uid()

-- Column reference
SELECT rls.compile_value('{"column": "users.id"}'::jsonb);
-- users.id

-- Array
SELECT rls.compile_value('["a", "b", "c"]'::jsonb);
-- ARRAY['a', 'b', 'c']
```

### rls.compile_comparison

Compiles a field comparison to SQL.

```sql
rls.compile_comparison(
  field TEXT,
  operator TEXT,
  value JSONB
) RETURNS TEXT
```

**Parameters:**
- `field` - Column name
- `operator` - Comparison operator (`_eq`, `_gt`, etc.)
- `value` - JSON value to compare against

**Examples:**

```sql
SELECT rls.compile_comparison('status', '_eq', '"active"'::jsonb);
-- status = 'active'

SELECT rls.compile_comparison('age', '_gte', '18'::jsonb);
-- age >= 18

SELECT rls.compile_comparison('role', '_in', '["admin", "editor"]'::jsonb);
-- role IN ('admin', 'editor')

SELECT rls.compile_comparison('user_id', '_eq', '{"var": "auth.uid()"}'::jsonb);
-- user_id = auth.uid()
```

### rls.is_comparison_operator

Checks if a string is a valid comparison operator.

```sql
rls.is_comparison_operator(op TEXT) RETURNS BOOLEAN
```

**Supported operators:**
`_eq`, `_neq`, `_gt`, `_gte`, `_lt`, `_lte`, `_in`, `_nin`, `_like`, `_ilike`, `_is_null`, `_contains`, `_contained_by`, `_has_key`, `_has_any_keys`, `_has_all_keys`

### rls.compile_expression

Compiles a complete permission expression to SQL.

```sql
rls.compile_expression(expr JSONB) RETURNS TEXT
```

**Parameters:**
- `expr` - JSON permission expression

**Examples:**

```sql
-- Simple field comparison
SELECT rls.compile_expression('{"user_id": {"_eq": {"var": "auth.uid()"}}}'::jsonb);
-- user_id = auth.uid()

-- AND condition
SELECT rls.compile_expression('{
  "_and": [
    {"status": {"_eq": "active"}},
    {"deleted_at": {"_is_null": true}}
  ]
}'::jsonb);
-- (status = 'active' AND deleted_at IS NULL)

-- EXISTS query
SELECT rls.compile_expression('{
  "_exists": {
    "_table": "team_members",
    "_where": {
      "team_id": {"_eq": {"column": "docs.team_id"}},
      "user_id": {"_eq": {"var": "auth.uid()"}}
    }
  }
}'::jsonb);
-- EXISTS (SELECT 1 FROM team_members WHERE team_id = docs.team_id AND user_id = auth.uid())
```

### rls.generate_policy_sql

Generates SQL statements for RLS policies (does not execute).

```sql
rls.generate_policy_sql(config JSONB) RETURNS TEXT
```

**Parameters:**
- `config` - Policy configuration JSON

**Configuration Schema:**

```json
{
  "table": "table_name",
  "enableRLS": true,
  "policies": [
    {
      "name": "policy_name",
      "command": "SELECT",
      "permissive": true,
      "roles": ["authenticated"],
      "usingExpression": { ... },
      "checkExpression": { ... }
    }
  ]
}
```

**Example:**

```sql
SELECT rls.generate_policy_sql('{
  "table": "posts",
  "enableRLS": true,
  "policies": [
    {
      "name": "owner_select",
      "command": "SELECT",
      "usingExpression": {"user_id": {"_eq": {"var": "auth.uid()"}}}
    }
  ]
}'::jsonb);
```

**Output:**
```sql
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_select ON posts AS PERMISSIVE FOR SELECT TO public USING (user_id = auth.uid());
```

### rls.apply_policy

Applies RLS policies directly to a table.

```sql
rls.apply_policy(config JSONB) RETURNS VOID
```

**Parameters:**
- `config` - Same configuration as `generate_policy_sql`

**Example:**

```sql
SELECT rls.apply_policy('{
  "table": "documents",
  "enableRLS": true,
  "policies": [
    {
      "name": "team_access",
      "command": "SELECT",
      "usingExpression": {
        "_exists": {
          "_table": "team_members",
          "_where": {
            "team_id": {"_eq": {"column": "documents.team_id"}},
            "user_id": {"_eq": {"var": "auth.uid()"}}
          }
        }
      }
    }
  ]
}'::jsonb);
```

### rls.drop_all_policies

Drops all RLS policies from a table.

```sql
rls.drop_all_policies(table_name TEXT) RETURNS VOID
```

**Example:**

```sql
SELECT rls.drop_all_policies('posts');
```

## Auth Schema

Helper functions for user authentication.

### auth.set_user

Sets the current user ID for the session.

```sql
auth.set_user(user_id UUID) RETURNS VOID
```

### auth.uid

Returns the current user ID.

```sql
auth.uid() RETURNS UUID
```

### auth.clear_user

Clears the current user context.

```sql
auth.clear_user() RETURNS VOID
```

**Usage:**

```sql
-- Set user context
SELECT auth.set_user('aaaa-aaaa-aaaa-aaaa');

-- Query with RLS
SELECT * FROM posts;  -- Filtered by policies

-- Check current user
SELECT auth.uid();  -- Returns 'aaaa-aaaa-aaaa-aaaa'

-- Clear context
SELECT auth.clear_user();
```

## Error Handling

Functions raise exceptions for invalid input:

```sql
-- Invalid operator
SELECT rls.compile_comparison('id', '_invalid', '1'::jsonb);
-- ERROR: Unknown comparison operator: _invalid

-- Invalid value structure
SELECT rls.compile_value('{"unknown": "structure"}'::jsonb);
-- ERROR: Unknown value object structure: {"unknown": "structure"}
```

