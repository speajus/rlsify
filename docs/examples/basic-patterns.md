# Basic Patterns

Common RLS policy patterns and their implementations.

## Owner-Based Access

Users can only access their own records.

### JSON Expression

```json
{
  "user_id": {
    "_eq": { "var": "auth.uid()", "type": "uuid" }
  }
}
```

### Full Policy Config

```typescript
const config: RLSPolicyConfig = {
  version: '1.0',
  table: 'posts',
  enableRLS: true,
  policies: [
    {
      name: 'owner_select',
      command: 'SELECT',
      usingExpression: {
        user_id: { _eq: { var: 'auth.uid()' } }
      }
    },
    {
      name: 'owner_insert',
      command: 'INSERT',
      checkExpression: {
        user_id: { _eq: { var: 'auth.uid()' } }
      }
    },
    {
      name: 'owner_update',
      command: 'UPDATE',
      usingExpression: {
        user_id: { _eq: { var: 'auth.uid()' } }
      },
      checkExpression: {
        user_id: { _eq: { var: 'auth.uid()' } }
      }
    },
    {
      name: 'owner_delete',
      command: 'DELETE',
      usingExpression: {
        user_id: { _eq: { var: 'auth.uid()' } }
      }
    }
  ]
};
```

### Generated SQL

```sql
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_select ON posts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY owner_insert ON posts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY owner_update ON posts FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY owner_delete ON posts FOR DELETE
  USING (user_id = auth.uid());
```

## Public or Owner

Public items visible to all, private items only to owner.

### JSON Expression

```json
{
  "_or": [
    { "is_public": { "_eq": true } },
    { "owner_id": { "_eq": { "var": "auth.uid()" } } }
  ]
}
```

### Policy Config

```typescript
{
  name: 'public_or_owner',
  command: 'SELECT',
  usingExpression: {
    _or: [
      { is_public: { _eq: true } },
      { owner_id: { _eq: { var: 'auth.uid()' } } }
    ]
  }
}
```

## Status-Based Filtering

Only show active, non-deleted records.

### JSON Expression

```json
{
  "_and": [
    { "status": { "_eq": "active" } },
    { "deleted_at": { "_is_null": true } }
  ]
}
```

### Combined with Owner Check

```json
{
  "_and": [
    { "user_id": { "_eq": { "var": "auth.uid()" } } },
    { "status": { "_neq": "deleted" } },
    { "deleted_at": { "_is_null": true } }
  ]
}
```

## Role-Based Access

Different access levels based on user role.

### Admin Full Access

```json
{
  "_exists": {
    "_table": "user_roles",
    "_where": {
      "user_id": { "_eq": { "var": "auth.uid()" } },
      "role": { "_eq": "admin" }
    }
  }
}
```

### Admin or Owner

```json
{
  "_or": [
    { "owner_id": { "_eq": { "var": "auth.uid()" } } },
    {
      "_exists": {
        "_table": "user_roles",
        "_where": {
          "user_id": { "_eq": { "var": "auth.uid()" } },
          "role": { "_in": ["admin", "moderator"] }
        }
      }
    }
  ]
}
```

## Date-Based Access

### Not Expired

```json
{
  "_or": [
    { "expires_at": { "_is_null": true } },
    { "expires_at": { "_gt": { "var": "NOW()" } } }
  ]
}
```

### Published Content

```json
{
  "_and": [
    { "status": { "_eq": "published" } },
    { "published_at": { "_lte": { "var": "NOW()" } } }
  ]
}
```

## Combining Patterns

### Owner with Status and Date

```typescript
{
  name: 'active_owner_content',
  command: 'SELECT',
  usingExpression: {
    _and: [
      { user_id: { _eq: { var: 'auth.uid()' } } },
      { status: { _eq: 'published' } },
      { deleted_at: { _is_null: true } },
      {
        _or: [
          { expires_at: { _is_null: true } },
          { expires_at: { _gt: { var: 'NOW()' } } }
        ]
      }
    ]
  }
}
```

## Next Steps

- [Team & Org Permissions](/examples/team-org-permissions) - Complex access patterns
- [Multi-Tenant Apps](/examples/multi-tenant) - Organization isolation

