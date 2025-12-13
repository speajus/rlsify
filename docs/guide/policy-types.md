# Policy Types

PostgreSQL RLS policies control access for different SQL commands. This guide explains how each type works and when to use them.

## Command Types

### SELECT Policies

Control which rows users can read.

```typescript
{
  name: 'users_read_own',
  command: 'SELECT',
  usingExpression: {
    user_id: { _eq: { var: 'auth.uid()' } }
  }
}
```

```sql
CREATE POLICY users_read_own ON posts
  FOR SELECT
  USING (user_id = auth.uid());
```

### INSERT Policies

Control which rows users can create. Uses `WITH CHECK` instead of `USING`.

```typescript
{
  name: 'users_create_own',
  command: 'INSERT',
  checkExpression: {
    user_id: { _eq: { var: 'auth.uid()' } }
  }
}
```

```sql
CREATE POLICY users_create_own ON posts
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
```

### UPDATE Policies

Control which rows users can modify. Can use both `USING` and `WITH CHECK`.

- **USING** - Which existing rows can be selected for update
- **WITH CHECK** - What the new values must satisfy

```typescript
{
  name: 'users_update_own',
  command: 'UPDATE',
  usingExpression: {
    user_id: { _eq: { var: 'auth.uid()' } }
  },
  checkExpression: {
    user_id: { _eq: { var: 'auth.uid()' } }
  }
}
```

```sql
CREATE POLICY users_update_own ON posts
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

### DELETE Policies

Control which rows users can delete.

```typescript
{
  name: 'users_delete_own',
  command: 'DELETE',
  usingExpression: {
    user_id: { _eq: { var: 'auth.uid()' } }
  }
}
```

```sql
CREATE POLICY users_delete_own ON posts
  FOR DELETE
  USING (user_id = auth.uid());
```

### ALL Policies

Apply to all commands. Useful for simple owner-based access.

```typescript
{
  name: 'owner_all',
  command: 'ALL',
  usingExpression: {
    owner_id: { _eq: { var: 'auth.uid()' } }
  },
  checkExpression: {
    owner_id: { _eq: { var: 'auth.uid()' } }
  }
}
```

## Permissive vs Restrictive

### Permissive (Default)

Multiple permissive policies are OR'd together:

```typescript
// Policy 1: Owner can access
{
  name: 'owner_access',
  command: 'SELECT',
  permissive: true,  // default
  usingExpression: { owner_id: { _eq: { var: 'auth.uid()' } } }
}

// Policy 2: Public items accessible
{
  name: 'public_access',
  command: 'SELECT',
  permissive: true,
  usingExpression: { is_public: { _eq: true } }
}

// Result: owner_id = auth.uid() OR is_public = true
```

### Restrictive

Restrictive policies are AND'd with permissive policies:

```typescript
// Permissive: Team members can access
{
  name: 'team_access',
  command: 'SELECT',
  permissive: true,
  usingExpression: {
    _exists: {
      _table: 'team_members',
      _where: {
        team_id: { _eq: { column: 'docs.team_id' } },
        user_id: { _eq: { var: 'auth.uid()' } }
      }
    }
  }
}

// Restrictive: Must also be approved
{
  name: 'must_be_approved',
  command: 'SELECT',
  permissive: false,
  usingExpression: { is_approved: { _eq: true } }
}

// Result: (team_member check) AND is_approved = true
```

## Role-Based Policies

Apply policies to specific database roles:

```typescript
{
  name: 'admin_full_access',
  command: 'ALL',
  roles: ['admin_role'],
  usingExpression: true  // Allow all
}

{
  name: 'user_limited',
  command: 'SELECT',
  roles: ['authenticated'],
  usingExpression: {
    user_id: { _eq: { var: 'auth.uid()' } }
  }
}
```

## Best Practices

1. **Separate by command** - Create specific policies for SELECT, INSERT, etc.
2. **Use restrictive sparingly** - They can be confusing when combined
3. **Test all operations** - Verify INSERT, UPDATE, DELETE work as expected
4. **Document intent** - Name policies descriptively

## Next Steps

- [Security Best Practices](/guide/security-best-practices) - Secure your policies
- [Testing Policies](/guide/testing-policies) - Write automated tests
- [Basic Patterns](/examples/basic-patterns) - Common examples

