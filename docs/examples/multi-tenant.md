# Multi-Tenant Applications

Complete guide to implementing tenant isolation with RLS.

## Architecture Overview

Multi-tenant applications share a database but isolate data per tenant (organization). RLS ensures users can only access their tenant's data.

```
┌─────────────────────────────────────────────────┐
│                   Application                    │
├─────────────────────────────────────────────────┤
│                   PostgreSQL                     │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────┐  │
│  │  Tenant A   │ │  Tenant B   │ │ Tenant C  │  │
│  │   (RLS)     │ │   (RLS)     │ │  (RLS)    │  │
│  └─────────────┘ └─────────────┘ └───────────┘  │
└─────────────────────────────────────────────────┘
```

## Schema Design

### Tenant Table

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tenant Membership

```sql
CREATE TABLE tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);
```

### Tenant-Scoped Resources

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  assignee_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Tenant Context

### Session Variable Approach

```sql
-- Set tenant context at connection time
CREATE OR REPLACE FUNCTION set_tenant(tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.tenant_id', tenant_id::text, false);
END;
$$;

-- Get current tenant
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN NULLIF(current_setting('app.tenant_id', true), '')::uuid;
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$;
```

### JWT Claims Approach (Supabase)

```sql
CREATE OR REPLACE FUNCTION get_tenant_from_jwt()
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN (
    current_setting('request.jwt.claims', true)::json->>'tenant_id'
  )::uuid;
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$;
```

## Restrictive Tenant Policy

Use a restrictive policy to ensure ALL queries are tenant-scoped.

### JSON Expression

```json
{
  "tenant_id": {
    "_eq": { "var": "current_tenant_id()", "type": "uuid" }
  }
}
```

### Policy Config

```typescript
const tenantIsolation: RLSPolicyConfig = {
  version: '1.0',
  table: 'projects',
  enableRLS: true,
  forceRLS: true,
  policies: [
    {
      name: 'tenant_isolation',
      command: 'ALL',
      permissive: false,  // RESTRICTIVE - always enforced
      usingExpression: {
        tenant_id: { _eq: { var: 'current_tenant_id()' } }
      },
      checkExpression: {
        tenant_id: { _eq: { var: 'current_tenant_id()' } }
      }
    }
  ]
};
```

### Generated SQL

```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
```

## Layered Policies

Combine tenant isolation with role-based access.

```typescript
const projectsConfig: RLSPolicyConfig = {
  version: '1.0',
  table: 'projects',
  enableRLS: true,
  forceRLS: true,
  policies: [
    // Layer 1: Tenant isolation (RESTRICTIVE)
    {
      name: 'tenant_isolation',
      command: 'ALL',
      permissive: false,
      usingExpression: {
        tenant_id: { _eq: { var: 'current_tenant_id()' } }
      },
      checkExpression: {
        tenant_id: { _eq: { var: 'current_tenant_id()' } }
      }
    },
    // Layer 2: All tenant members can read (PERMISSIVE)
    {
      name: 'tenant_members_read',
      command: 'SELECT',
      permissive: true,
      usingExpression: {
        _exists: {
          _table: 'tenant_users',
          _where: {
            tenant_id: { _eq: { column: 'projects.tenant_id' } },
            user_id: { _eq: { var: 'auth.uid()' } }
          }
        }
      }
    },
    // Layer 3: Only admins can modify (PERMISSIVE)
    {
      name: 'tenant_admins_modify',
      command: 'UPDATE',
      permissive: true,
      usingExpression: {
        _exists: {
          _table: 'tenant_users',
          _where: {
            tenant_id: { _eq: { column: 'projects.tenant_id' } },
            user_id: { _eq: { var: 'auth.uid()' } },
            role: { _in: ['admin', 'owner'] }
          }
        }
      }
    }
  ]
};
```

## Application Integration

### Middleware (Express)

```typescript
app.use(async (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'];
  
  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant required' });
  }
  
  // Verify user belongs to tenant
  const membership = await db.query(
    'SELECT 1 FROM tenant_users WHERE tenant_id = $1 AND user_id = $2',
    [tenantId, req.user.id]
  );
  
  if (membership.rows.length === 0) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // Set tenant context for this connection
  await db.query('SELECT set_tenant($1)', [tenantId]);
  
  next();
});
```

### Supabase Client

```typescript
const supabase = createClient(url, key, {
  global: {
    headers: {
      'x-tenant-id': currentTenantId
    }
  }
});
```

## Security Considerations

1. **Always use FORCE RLS** - Prevents bypassing by table owners
2. **Use restrictive policies** - Tenant check is always enforced
3. **Validate tenant membership** - Before setting context
4. **Audit cross-tenant attempts** - Log suspicious access

## Next Steps

- [Security Best Practices](/guide/security-best-practices) - Secure your implementation
- [Testing Policies](/guide/testing-policies) - Test tenant isolation

