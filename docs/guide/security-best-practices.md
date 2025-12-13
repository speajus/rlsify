# Security Best Practices

Row-Level Security is a powerful tool, but it must be implemented correctly to be effective. This guide covers essential security practices.

## Fundamental Principles

### 1. Defense in Depth

RLS is one layer of security. Combine it with:

- Application-level authorization
- API authentication (JWT, sessions)
- Network security (firewalls, VPNs)
- Encryption at rest and in transit

### 2. Principle of Least Privilege

Start with no access and grant permissions explicitly:

```sql
-- Enable RLS first (denies all by default)
ALTER TABLE sensitive_data ENABLE ROW LEVEL SECURITY;

-- Then add specific policies
CREATE POLICY owner_only ON sensitive_data
  FOR ALL
  USING (owner_id = auth.uid());
```

### 3. Fail Secure

If something goes wrong, deny access:

```sql
-- Use COALESCE to handle NULLs securely
CREATE POLICY safe_access ON resources
  FOR SELECT
  USING (COALESCE(owner_id = auth.uid(), false));
```

## Policy Design

### Validate All Operations

Don't forget INSERT and UPDATE policies:

```sql
-- SELECT: what can be read
CREATE POLICY read_own ON posts FOR SELECT
  USING (author_id = auth.uid());

-- INSERT: what can be created
CREATE POLICY create_own ON posts FOR INSERT
  WITH CHECK (author_id = auth.uid());

-- UPDATE: what can be modified
CREATE POLICY update_own ON posts FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- DELETE: what can be removed
CREATE POLICY delete_own ON posts FOR DELETE
  USING (author_id = auth.uid());
```

### Prevent Privilege Escalation

Ensure users can't grant themselves more access:

```typescript
// BAD: User can set any role
{
  name: 'update_user',
  command: 'UPDATE',
  checkExpression: {
    user_id: { _eq: { var: 'auth.uid()' } }
  }
}

// GOOD: Restrict what fields can be changed
{
  name: 'update_user',
  command: 'UPDATE',
  usingExpression: {
    user_id: { _eq: { var: 'auth.uid()' } }
  },
  checkExpression: {
    _and: [
      { user_id: { _eq: { var: 'auth.uid()' } } },
      { role: { _eq: { column: 'users.role' } } }  // Can't change role
    ]
  }
}
```

### Use Restrictive Policies for Critical Checks

```sql
-- Permissive: Various ways to access
CREATE POLICY owner_or_team ON documents AS PERMISSIVE
  FOR SELECT
  USING (owner_id = auth.uid() OR team_access(...));

-- Restrictive: Must ALWAYS be true
CREATE POLICY must_be_active ON documents AS RESTRICTIVE
  FOR SELECT
  USING (deleted_at IS NULL AND org_id = current_org());
```

## Session Variable Security

### Validate JWT Claims

Never trust unvalidated claims:

```sql
-- Create a secure function to get user ID
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN NULLIF(
    current_setting('request.jwt.claim.sub', true),
    ''
  )::uuid;
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$;
```

### Protect Session Variables

```sql
-- Revoke ability to set session variables from public
REVOKE ALL ON FUNCTION set_config FROM public;
```

## Multi-Tenant Security

### Organization Isolation

Always check organization membership:

```typescript
{
  name: 'org_isolation',
  command: 'ALL',
  usingExpression: {
    _exists: {
      _table: 'organization_members',
      _where: {
        organization_id: { _eq: { column: 'resources.org_id' } },
        user_id: { _eq: { var: 'auth.uid()' } }
      }
    }
  }
}
```

### Cross-Tenant Data Leakage

Prevent queries that could expose other tenants:

```sql
-- Use restrictive policy for tenant check
CREATE POLICY tenant_isolation ON all_tables AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

## Bypassing RLS

### Service Roles

Create dedicated roles for admin operations:

```sql
CREATE ROLE service_admin NOLOGIN BYPASSRLS;

-- Grant to specific users
GRANT service_admin TO admin_user;

-- Use in application
SET ROLE service_admin;
-- ... admin operations ...
RESET ROLE;
```

### Force RLS for Table Owners

```sql
-- Even table owners must follow RLS
ALTER TABLE sensitive_data FORCE ROW LEVEL SECURITY;
```

## Auditing

### Log Policy Decisions

```sql
CREATE OR REPLACE FUNCTION log_access()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO access_log (
    table_name, row_id, user_id, action, timestamp
  ) VALUES (
    TG_TABLE_NAME, NEW.id, auth.uid(), TG_OP, NOW()
  );
  RETURN NEW;
END;
$$;
```

### Monitor Failed Access

```sql
-- Log when RLS blocks access
CREATE POLICY logged_access ON resources
  FOR SELECT
  USING (
    CASE
      WHEN owner_id = auth.uid() THEN true
      ELSE log_denied_access(id, auth.uid()) AND false
    END
  );
```

## Testing Security

Always test your policies:

```typescript
describe('RLS Policies', () => {
  it('prevents cross-tenant access', async () => {
    await setUser(tenantAUser);
    const result = await query('SELECT * FROM resources WHERE tenant_id = $1', [tenantBId]);
    expect(result.rows).toHaveLength(0);
  });

  it('prevents privilege escalation', async () => {
    await setUser(regularUser);
    await expect(
      query('UPDATE users SET role = $1 WHERE id = $2', ['admin', regularUser.id])
    ).rejects.toThrow();
  });
});
```

## Next Steps

- [Common Vulnerabilities](/guide/common-vulnerabilities) - Avoid these mistakes
- [Auditing](/guide/auditing) - Monitor access patterns
- [Testing Policies](/guide/testing-policies) - Write security tests

