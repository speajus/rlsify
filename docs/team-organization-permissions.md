# Team and Organization Permissions

This guide shows how to implement multi-tenant, team-based, and organization-scoped permissions using rlsify's Visual Query Builder.

## Table of Contents

1. [Database Schema Setup](#database-schema-setup)
2. [Organization-Based Permissions](#organization-based-permissions)
3. [Team-Based Permissions](#team-based-permissions)
4. [Role-Based Access Within Organizations](#role-based-access-within-organizations)
5. [Hierarchical Permissions](#hierarchical-permissions)
6. [Common Patterns](#common-patterns)

---

## Database Schema Setup

### Basic Multi-Tenant Schema

```sql
-- Organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table with organization membership
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  organization_id UUID REFERENCES organizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teams within organizations
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team membership
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id),
  user_id UUID REFERENCES users(id),
  role TEXT NOT NULL, -- 'member', 'admin', 'owner'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- Organization roles
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  role TEXT NOT NULL, -- 'member', 'admin', 'owner'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- Example: Projects table (multi-tenant resource)
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id),
  team_id UUID REFERENCES teams(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example: Documents table (team-scoped resource)
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  team_id UUID REFERENCES teams(id),
  created_by UUID REFERENCES users(id),
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Organization-Based Permissions

### Pattern 1: Organization Isolation

**Use Case**: Users can only see resources from their own organization.

**Visual Builder Steps**:
1. Table: `projects`
2. Add Condition:
   - Field: `organization_id`
   - Operator: `=` equals
   - Value Type: Session Variable
   - Value: `current_setting('request.jwt.claims')::json->>'org_id'`

**Generated Expression**:
```json
{
  "organization_id": {
    "_eq": {
      "var": "current_setting('request.jwt.claims')::json->>'org_id'",
      "type": "uuid"
    }
  }
}
```

**SQL**:
```sql
CREATE POLICY "org_isolation_select" ON projects
  FOR SELECT
  USING (organization_id = (current_setting('request.jwt.claims')::json->>'org_id')::uuid);
```

### Pattern 2: Organization via User Relationship

**Use Case**: Access resources where the user belongs to the same organization.

**Visual Builder Steps**:
1. Table: `projects`
2. Logic: ALL (AND)
3. Add Condition 1:
   - Table: `users` (via created_by → users.id)
   - Field: `organization_id`
   - Operator: `=` equals
   - Value Type: Session Variable
   - Value: `current_setting('request.jwt.claims')::json->>'org_id'`

**Generated Expression**:
```json
{
  "user.organization_id": {
    "_eq": {
      "var": "current_setting('request.jwt.claims')::json->>'org_id'",
      "type": "uuid"
    }
  }
}
```

### Pattern 3: Organization Admin Override

**Use Case**: Regular users see only their resources, but org admins see everything in the org.

**Visual Builder Steps**:
1. Table: `projects`
2. Logic: ANY (OR)
3. Add Condition 1 (User owns it):
   - Field: `created_by`
   - Operator: `=` equals
   - Value Type: Session Variable
   - Value: `auth.uid()`
4. Add Condition 2 (User is org admin):
   - Use EXISTS query (requires JSON mode or SQL mode)

**JSON Expression**:
```json
{
  "_or": [
    {
      "created_by": {
        "_eq": { "var": "auth.uid()", "type": "uuid" }
      }
    },
    {
      "_exists": {
        "_table": "organization_members",
        "_where": {
          "_and": [
            {
              "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } }
            },
            {
              "organization_id": { "_eq": { "column": "projects.organization_id" } }
            },
            {
              "role": { "_in": ["admin", "owner"] }
            }
          ]
        }
      }
    }
  ]
}
```

---

## Team-Based Permissions

### Pattern 4: Team Member Access

**Use Case**: Users can access resources if they're a member of the team.

**JSON Expression**:
```json
{
  "_exists": {
    "_table": "team_members",
    "_where": {
      "_and": [
        {
          "team_id": { "_eq": { "column": "documents.team_id" } }
        },
        {
          "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } }
        }
      ]
    }
  }
}
```

**SQL**:
```sql
CREATE POLICY "team_member_access" ON documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = documents.team_id
        AND team_members.user_id = auth.uid()
    )
  );
```

### Pattern 5: Team Admin Only

**Use Case**: Only team admins can modify resources.

**JSON Expression**:
```json
{
  "_exists": {
    "_table": "team_members",
    "_where": {
      "_and": [
        {
          "team_id": { "_eq": { "column": "documents.team_id" } }
        },
        {
          "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } }
        },
        {
          "role": { "_in": ["admin", "owner"] }
        }
      ]
    }
  }
}
```

### Pattern 6: Public or Team Member

**Use Case**: Documents are accessible if public OR user is a team member.

**JSON Expression**:
```json
{
  "_or": [
    {
      "is_public": { "_eq": true }
    },
    {
      "_exists": {
        "_table": "team_members",
        "_where": {
          "_and": [
            {
              "team_id": { "_eq": { "column": "documents.team_id" } }
            },
            {
              "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } }
            }
          ]
        }
      }
    }
  ]
}
```

---

## Role-Based Access Within Organizations

### Pattern 7: Organization Role Check

**Use Case**: Only organization admins can perform certain actions.

**JSON Expression**:
```json
{
  "_exists": {
    "_table": "organization_members",
    "_where": {
      "_and": [
        {
          "organization_id": { "_eq": { "column": "projects.organization_id" } }
        },
        {
          "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } }
        },
        {
          "role": { "_in": ["admin", "owner"] }
        }
      ]
    }
  }
}
```

### Pattern 8: Hierarchical Roles

**Use Case**: Owners can do everything, admins can edit, members can view.

**For SELECT (everyone in org)**:
```json
{
  "_exists": {
    "_table": "organization_members",
    "_where": {
      "_and": [
        {
          "organization_id": { "_eq": { "column": "projects.organization_id" } }
        },
        {
          "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } }
        }
      ]
    }
  }
}
```

**For UPDATE (admins and owners)**:
```json
{
  "_exists": {
    "_table": "organization_members",
    "_where": {
      "_and": [
        {
          "organization_id": { "_eq": { "column": "projects.organization_id" } }
        },
        {
          "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } }
        },
        {
          "role": { "_in": ["admin", "owner"] }
        }
      ]
    }
  }
}
```

**For DELETE (owners only)**:
```json
{
  "_exists": {
    "_table": "organization_members",
    "_where": {
      "_and": [
        {
          "organization_id": { "_eq": { "column": "projects.organization_id" } }
        },
        {
          "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } }
        },
        {
          "role": { "_eq": "owner" }
        }
      ]
    }
  }
}
```

---

## Hierarchical Permissions

### Pattern 9: Team within Organization

**Use Case**: User must be in the organization AND in the specific team.

**JSON Expression**:
```json
{
  "_and": [
    {
      "_exists": {
        "_table": "organization_members",
        "_where": {
          "_and": [
            {
              "organization_id": { "_eq": { "column": "documents.team.organization_id" } }
            },
            {
              "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } }
            }
          ]
        }
      }
    },
    {
      "_exists": {
        "_table": "team_members",
        "_where": {
          "_and": [
            {
              "team_id": { "_eq": { "column": "documents.team_id" } }
            },
            {
              "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } }
            }
          ]
        }
      }
    }
  ]
}
```


### Pattern 10: Cross-Organization Collaboration

**Use Case**: Users can access resources if they're in the resource's organization OR explicitly shared.

**JSON Expression**:
```json
{
  "_or": [
    {
      "_exists": {
        "_table": "organization_members",
        "_where": {
          "_and": [
            {
              "organization_id": { "_eq": { "column": "projects.organization_id" } }
            },
            {
              "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } }
            }
          ]
        }
      }
    },
    {
      "_exists": {
        "_table": "project_shares",
        "_where": {
          "_and": [
            {
              "project_id": { "_eq": { "column": "projects.id" } }
            },
            {
              "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } }
            }
          ]
        }
      }
    }
  ]
}
```

---

## Common Patterns

### Pattern 11: Creator Override

**Use Case**: Users can access their own resources regardless of team/org membership.

**Visual Builder Steps**:
1. Logic: ANY (OR)
2. Condition 1: `created_by = auth.uid()`
3. Condition 2: Team membership check (EXISTS)

**JSON Expression**:
```json
{
  "_or": [
    {
      "created_by": { "_eq": { "var": "auth.uid()", "type": "uuid" } }
    },
    {
      "_exists": {
        "_table": "team_members",
        "_where": {
          "_and": [
            {
              "team_id": { "_eq": { "column": "documents.team_id" } }
            },
            {
              "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } }
            }
          ]
        }
      }
    }
  ]
}
```

### Pattern 12: Time-Based Access

**Use Case**: Users can only access active team memberships.

**JSON Expression**:
```json
{
  "_exists": {
    "_table": "team_members",
    "_where": {
      "_and": [
        {
          "team_id": { "_eq": { "column": "documents.team_id" } }
        },
        {
          "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } }
        },
        {
          "_or": [
            { "expires_at": { "_is_null": true } },
            { "expires_at": { "_gt": { "var": "NOW()", "type": "timestamp" } } }
          ]
        }
      ]
    }
  }
}
```

### Pattern 13: Department-Based Access

**Use Case**: Users can access resources from their department within the organization.

**Schema Addition**:
```sql
ALTER TABLE users ADD COLUMN department TEXT;
ALTER TABLE projects ADD COLUMN department TEXT;
```

**Visual Builder Steps**:
1. Logic: ALL (AND)
2. Condition 1: Same organization
3. Condition 2: Same department

**JSON Expression**:
```json
{
  "_and": [
    {
      "organization_id": {
        "_eq": {
          "var": "current_setting('request.jwt.claims')::json->>'org_id'",
          "type": "uuid"
        }
      }
    },
    {
      "department": {
        "_eq": {
          "var": "current_setting('request.jwt.claims')::json->>'department'",
          "type": "text"
        }
      }
    }
  ]
}
```

### Pattern 14: Multi-Level Approval

**Use Case**: Documents require approval from team lead AND department head.

**Schema Addition**:
```sql
ALTER TABLE documents ADD COLUMN team_approved BOOLEAN DEFAULT false;
ALTER TABLE documents ADD COLUMN dept_approved BOOLEAN DEFAULT false;
ALTER TABLE documents ADD COLUMN status TEXT DEFAULT 'draft';
```

**For Team Leads (can approve at team level)**:
```json
{
  "_and": [
    {
      "_exists": {
        "_table": "team_members",
        "_where": {
          "_and": [
            {
              "team_id": { "_eq": { "column": "documents.team_id" } }
            },
            {
              "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } }
            },
            {
              "role": { "_eq": "admin" }
            }
          ]
        }
      }
    },
    {
      "status": { "_eq": "pending_team_approval" }
    }
  ]
}
```

### Pattern 15: Guest Access

**Use Case**: External users can access specific shared resources.

**Schema Addition**:
```sql
CREATE TABLE guest_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type TEXT NOT NULL,
  resource_id UUID NOT NULL,
  email TEXT NOT NULL,
  permissions TEXT[] DEFAULT ARRAY['read'],
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**JSON Expression**:
```json
{
  "_or": [
    {
      "_exists": {
        "_table": "team_members",
        "_where": {
          "_and": [
            {
              "team_id": { "_eq": { "column": "documents.team_id" } }
            },
            {
              "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } }
            }
          ]
        }
      }
    },
    {
      "_exists": {
        "_table": "guest_access",
        "_where": {
          "_and": [
            {
              "resource_type": { "_eq": "document" }
            },
            {
              "resource_id": { "_eq": { "column": "documents.id" } }
            },
            {
              "email": {
                "_eq": {
                  "var": "current_setting('request.jwt.claims')::json->>'email'",
                  "type": "text"
                }
              }
            },
            {
              "_or": [
                { "expires_at": { "_is_null": true } },
                { "expires_at": { "_gt": { "var": "NOW()", "type": "timestamp" } } }
              ]
            }
          ]
        }
      }
    }
  ]
}
```

---

## Implementation Guide

### Step 1: Set Up JWT Claims

Ensure your authentication system includes these claims in the JWT:

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "org_id": "organization-uuid",
  "role": "admin",
  "department": "engineering",
  "team_ids": ["team-uuid-1", "team-uuid-2"]
}
```

### Step 2: Configure Supabase Auth

In your Supabase project, set up the auth hook to populate JWT claims:

```sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  claims jsonb;
  user_org_id uuid;
  user_role text;
BEGIN
  -- Get user's organization and role
  SELECT organization_id, role INTO user_org_id, user_role
  FROM organization_members
  WHERE user_id = (event->>'user_id')::uuid
  LIMIT 1;

  claims := event->'claims';

  -- Add custom claims
  claims := jsonb_set(claims, '{org_id}', to_jsonb(user_org_id::text));
  claims := jsonb_set(claims, '{role}', to_jsonb(user_role));

  event := jsonb_set(event, '{claims}', claims);

  RETURN event;
END;
$$;
```

### Step 3: Apply Policies Using rlsify

```typescript
import { RLSifyBuilder } from '@speajus/rlsify-core';

const builder = new RLSifyBuilder('public.projects');

// Organization isolation
builder.addPolicy({
  name: 'org_isolation',
  command: 'SELECT',
  usingExpression: {
    organization_id: {
      _eq: {
        var: "current_setting('request.jwt.claims')::json->>'org_id'",
        type: 'uuid'
      }
    }
  }
});

// Generate and apply SQL
const sql = builder.generateSQL();
```

### Step 4: Test Your Policies

```sql
-- Set JWT claims for testing
SET request.jwt.claims = '{"org_id": "123e4567-e89b-12d3-a456-426614174000", "sub": "user-uuid"}';

-- Test query
SELECT * FROM projects; -- Should only return projects from org 123e4567...
```

---

## Best Practices

1. **Always Include Organization Isolation**: Start with org-level isolation, then add team/role checks
2. **Use Indexes**: Add indexes on `organization_id`, `team_id`, and foreign keys
3. **Cache JWT Claims**: Store frequently accessed claims in the JWT to avoid extra queries
4. **Test Thoroughly**: Test each policy with different user roles and scenarios
5. **Document Permissions**: Keep a clear record of who can access what
6. **Audit Access**: Log access attempts for security auditing
7. **Use Least Privilege**: Start restrictive, then add permissions as needed
8. **Consider Performance**: Complex EXISTS queries can be slow; optimize with indexes

---

## Performance Optimization

### Add Indexes

```sql
-- Organization isolation
CREATE INDEX idx_projects_org_id ON projects(organization_id);
CREATE INDEX idx_users_org_id ON users(organization_id);

-- Team membership
CREATE INDEX idx_team_members_team_user ON team_members(team_id, user_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);

-- Organization membership
CREATE INDEX idx_org_members_org_user ON organization_members(organization_id, user_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);
```

### Use Materialized Views for Complex Checks

```sql
CREATE MATERIALIZED VIEW user_team_access AS
SELECT
  tm.user_id,
  tm.team_id,
  t.organization_id,
  tm.role as team_role,
  om.role as org_role
FROM team_members tm
JOIN teams t ON t.id = tm.team_id
LEFT JOIN organization_members om ON om.user_id = tm.user_id AND om.organization_id = t.organization_id;

CREATE INDEX idx_user_team_access ON user_team_access(user_id, team_id);

-- Refresh periodically
REFRESH MATERIALIZED VIEW CONCURRENTLY user_team_access;
```

---

## Troubleshooting

### Policy Not Working

1. Check JWT claims are being set correctly
2. Verify foreign key relationships exist
3. Test the SQL directly with hardcoded values
4. Check for typos in column names
5. Ensure RLS is enabled: `ALTER TABLE projects ENABLE ROW LEVEL SECURITY;`

### Performance Issues

1. Add missing indexes
2. Use EXPLAIN ANALYZE to identify slow queries
3. Consider denormalizing frequently checked relationships
4. Use materialized views for complex permission checks
5. Cache user permissions in application layer

### Common Errors

**Error**: `infinite recursion detected in policy`
**Solution**: Avoid circular references in EXISTS queries

**Error**: `column does not exist`
**Solution**: Check relationship paths and use correct table aliases

**Error**: `permission denied for table`
**Solution**: Ensure RLS is enabled and at least one policy grants access


