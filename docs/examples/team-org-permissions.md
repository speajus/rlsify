# Team & Organization Permissions

Complex access patterns for team and organization-based applications.

## Schema Setup

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  user_id UUID NOT NULL,
  role TEXT NOT NULL,  -- 'owner', 'admin', 'member'
  UNIQUE(organization_id, user_id)
);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL
);

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id),
  user_id UUID NOT NULL,
  role TEXT NOT NULL,  -- 'admin', 'member'
  UNIQUE(team_id, user_id)
);

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id),
  title TEXT NOT NULL,
  created_by UUID NOT NULL
);
```

## Team Member Access

Users can access resources if they're a team member.

### JSON Expression

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

### Policy Config

```typescript
{
  name: 'team_member_read',
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
```

## Team Admin Only

Only team admins can modify resources.

```json
{
  "_exists": {
    "_table": "team_members",
    "_where": {
      "team_id": { "_eq": { "column": "documents.team_id" } },
      "user_id": { "_eq": { "var": "auth.uid()" } },
      "role": { "_in": ["admin", "owner"] }
    }
  }
}
```

## Organization Isolation

Users can only access resources within their organization.

### Via Organization Membership

```json
{
  "_exists": {
    "_table": "organization_members",
    "_where": {
      "organization_id": { "_eq": { "column": "resources.organization_id" } },
      "user_id": { "_eq": { "var": "auth.uid()" } }
    }
  }
}
```

### Through Team Relationship

Documents belong to teams, teams belong to organizations.

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

## Hierarchical Roles

Different permissions based on organization role.

### Everyone in Org (SELECT)

```typescript
{
  name: 'org_members_read',
  command: 'SELECT',
  usingExpression: {
    _exists: {
      _table: 'organization_members',
      _where: {
        organization_id: { _eq: { column: 'projects.organization_id' } },
        user_id: { _eq: { var: 'auth.uid()' } }
      }
    }
  }
}
```

### Admins and Owners (UPDATE)

```typescript
{
  name: 'org_admins_update',
  command: 'UPDATE',
  usingExpression: {
    _exists: {
      _table: 'organization_members',
      _where: {
        organization_id: { _eq: { column: 'projects.organization_id' } },
        user_id: { _eq: { var: 'auth.uid()' } },
        role: { _in: ['admin', 'owner'] }
      }
    }
  }
}
```

### Owners Only (DELETE)

```typescript
{
  name: 'org_owners_delete',
  command: 'DELETE',
  usingExpression: {
    _exists: {
      _table: 'organization_members',
      _where: {
        organization_id: { _eq: { column: 'projects.organization_id' } },
        user_id: { _eq: { var: 'auth.uid()' } },
        role: { _eq: 'owner' }
      }
    }
  }
}
```

## Creator Override

Creators can always access their own content, plus team access.

```json
{
  "_or": [
    { "created_by": { "_eq": { "var": "auth.uid()" } } },
    {
      "_exists": {
        "_table": "team_members",
        "_where": {
          "team_id": { "_eq": { "column": "documents.team_id" } },
          "user_id": { "_eq": { "var": "auth.uid()" } }
        }
      }
    }
  ]
}
```

## Complete Example

```typescript
const documentsConfig: RLSPolicyConfig = {
  version: '1.0',
  table: 'documents',
  enableRLS: true,
  policies: [
    {
      name: 'team_or_creator_read',
      command: 'SELECT',
      usingExpression: {
        _or: [
          { created_by: { _eq: { var: 'auth.uid()' } } },
          {
            _exists: {
              _table: 'team_members',
              _where: {
                team_id: { _eq: { column: 'documents.team_id' } },
                user_id: { _eq: { var: 'auth.uid()' } }
              }
            }
          }
        ]
      }
    },
    {
      name: 'team_admin_modify',
      command: 'UPDATE',
      usingExpression: {
        _exists: {
          _table: 'team_members',
          _where: {
            team_id: { _eq: { column: 'documents.team_id' } },
            user_id: { _eq: { var: 'auth.uid()' } },
            role: { _eq: 'admin' }
          }
        }
      }
    }
  ]
};
```

## Next Steps

- [Multi-Tenant Apps](/examples/multi-tenant) - Full tenant isolation
- [Security Best Practices](/guide/security-best-practices) - Secure your policies

