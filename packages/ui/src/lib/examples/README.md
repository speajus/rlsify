# Multi-Tenant Schema Example

This directory contains a comprehensive, working example of a multi-tenant database schema with team-based permissions.

## Overview

The example demonstrates a realistic SaaS application structure where:

1. **Organizations** are the top-level tenant boundary
2. **Teams** exist within organizations
3. **Users** can be members of multiple organizations and teams with different roles
4. **Resources** (Projects, Documents) are scoped to teams
5. **Permissions** are enforced through Row-Level Security (RLS) policies

## Schema Structure

### Core Tables

#### `organizations`
Top-level tenant isolation. Each organization is completely isolated from others.

```typescript
{
  id: uuid (PK)
  name: text
  slug: text (unique)
  created_at: timestamptz
  updated_at: timestamptz
}
```

#### `users`
People who can belong to organizations and teams.

```typescript
{
  id: uuid (PK)
  email: text (unique)
  name: text
  created_at: timestamptz
  updated_at: timestamptz
}
```

#### `organization_members`
Links users to organizations with roles (`owner`, `admin`, `member`).

```typescript
{
  id: uuid (PK)
  organization_id: uuid (FK → organizations.id)
  user_id: uuid (FK → users.id)
  role: text ('owner' | 'admin' | 'member')
  created_at: timestamptz
}
```

#### `teams`
Groups within organizations for collaboration.

```typescript
{
  id: uuid (PK)
  organization_id: uuid (FK → organizations.id)
  name: text
  slug: text
  description: text
  created_at: timestamptz
  updated_at: timestamptz
}
```

#### `team_members`
Links users to teams with roles (`admin`, `member`).

```typescript
{
  id: uuid (PK)
  team_id: uuid (FK → teams.id)
  user_id: uuid (FK → users.id)
  role: text ('admin' | 'member')
  created_at: timestamptz
}
```

### Resource Tables

#### `projects`
Team-scoped work items.

```typescript
{
  id: uuid (PK)
  team_id: uuid (FK → teams.id)
  name: text
  description: text
  status: text ('active' | 'archived' | 'completed')
  created_by: uuid (FK → users.id)
  created_at: timestamptz
  updated_at: timestamptz
}
```

#### `documents`
Team-scoped content with public/private visibility.

```typescript
{
  id: uuid (PK)
  team_id: uuid (FK → teams.id)
  title: text
  content: text
  is_public: boolean
  created_by: uuid (FK → users.id)
  created_at: timestamptz
  updated_at: timestamptz
}
```

## Permission Patterns

The example includes 5 common permission patterns:

### 1. Organization Isolation
**Table**: `teams`
**Pattern**: Users can only see teams from organizations they belong to

```json
{
  "_exists": {
    "_table": "organization_members",
    "_where": {
      "_and": [
        { "organization_id": { "_eq": { "column": "teams.organization_id" } } },
        { "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } } }
      ]
    }
  }
}
```

### 2. Team Member Access
**Table**: `projects`
**Pattern**: Users can only see projects from teams they are members of

```json
{
  "_exists": {
    "_table": "team_members",
    "_where": {


### 5. Public or Team Member
**Table**: `documents`
**Pattern**: Documents are accessible if public OR user is a team member

```json
{
  "_or": [
    { "is_public": { "_eq": true } },
    {
      "_exists": {
        "_table": "team_members",
        "_where": {
          "_and": [
            { "team_id": { "_eq": { "column": "documents.team_id" } } },
            { "user_id": { "_eq": { "var": "auth.uid()", "type": "uuid" } } }
          ]
        }
      }
    }
  ]
}
```

## Using the Example

### 1. Load the Schema

In the rlsify UI:
1. Check "Use mock data"
2. Click "Load Schema"
3. The multi-tenant schema will be loaded

### 2. Explore the Tables

You'll see these tables in the dropdown:
- `public.organizations`
- `public.users`
- `public.organization_members`
- `public.teams`
- `public.team_members`
- `public.projects`
- `public.documents`

### 3. Build Permission Policies

Try building these policies using the Visual Query Builder:

#### Example 1: Team Member Can View Projects

1. Select table: `public.projects`
2. Add policy
3. Policy name: `team_member_view_projects`
4. Command: `SELECT`
5. Visual Builder (default):
   - This requires an EXISTS query, so switch to **Templates** mode
   - Or manually build in JSON mode

#### Example 2: Organization Isolation for Teams

1. Select table: `public.teams`
2. Add policy
3. Policy name: `org_isolation_teams`
4. Command: `SELECT`
5. Use Templates or JSON mode for EXISTS query

#### Example 3: Public Documents

1. Select table: `public.documents`
2. Add policy
3. Policy name: `public_documents_readable`
4. Command: `SELECT`
5. Visual Builder:
   - Add condition: `is_public = true`
   - Done! (Simple condition, no EXISTS needed)

### 4. Understand the Relationships

The Visual Query Builder will show you available relationships:

**From `projects` table**:
- → `teams` (via `team_id`)
- → `users` (via `created_by`)

**From `teams` table**:
- → `organizations` (via `organization_id`)

**From `team_members` table**:
- → `teams` (via `team_id`)
- → `users` (via `user_id`)

## Drizzle ORM Integration

The schema includes a Drizzle ORM definition that you can use to generate the actual database schema.

See `multi-tenant-schema.ts` for the complete Drizzle schema definition.

### Generate SQL with Drizzle

```bash
# Install Drizzle
pnpm add drizzle-orm
pnpm add -D drizzle-kit

# Create drizzle.config.ts
# Add the schema from multi-tenant-schema.ts

# Generate migration
pnpm drizzle-kit generate:pg

# Apply migration
pnpm drizzle-kit push:pg
```

## Real-World Usage

This schema pattern is used by many SaaS applications:

- **Slack**: Organizations (workspaces), Channels (teams), Messages (resources)
- **GitHub**: Organizations, Teams, Repositories (resources)
- **Notion**: Workspaces (organizations), Pages (resources), Sharing (team members)
- **Linear**: Organizations, Teams, Issues (resources)
- **Asana**: Organizations, Teams, Projects (resources)

## Testing Scenarios

### Scenario 1: User in Multiple Organizations

**User**: alice@example.com
- Member of Org A (role: member)
- Owner of Org B (role: owner)

**Expected Behavior**:
- Can see teams from both Org A and Org B
- Can see projects from teams she's a member of in both orgs
- Can manage all teams in Org B (owner privilege)
- Can only manage teams she's admin of in Org A

### Scenario 2: Team Admin vs Team Member

**User**: bob@example.com
- Team Member in "Engineering" team (role: member)
- Team Admin in "Marketing" team (role: admin)

**Expected Behavior**:
- Can view projects in both teams
- Can only update/delete projects in "Marketing" team
- Cannot update/delete projects in "Engineering" team

### Scenario 3: Public Documents

**User**: charlie@example.com (not logged in)

**Expected Behavior**:
- Can view documents where `is_public = true`
- Cannot view private documents
- Cannot create/update/delete any documents

### Scenario 4: Organization Admin Override

**User**: diana@example.com
- Org Admin in Org A (role: admin)
- Not a member of any teams in Org A

**Expected Behavior**:
- Can see all teams in Org A (org admin privilege)
- Can see all projects in all teams in Org A (org admin privilege)
- Can manage organization-level settings
- May or may not be able to edit team resources (depends on policy)

## Performance Considerations

### Indexes

For optimal performance, add these indexes:

```sql
-- Organization membership lookups
CREATE INDEX idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX idx_org_members_org_user ON organization_members(organization_id, user_id);

-- Team membership lookups
CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_team_members_team_user ON team_members(team_id, user_id);

-- Resource lookups
CREATE INDEX idx_projects_team_id ON projects(team_id);
CREATE INDEX idx_documents_team_id ON documents(team_id);
CREATE INDEX idx_teams_org_id ON teams(organization_id);
```

### Query Optimization

The EXISTS queries in RLS policies can be expensive. Consider:

1. **Materialized Views**: Pre-compute user permissions
2. **Caching**: Cache user memberships in JWT claims
3. **Denormalization**: Add `organization_id` directly to resources
4. **Partial Indexes**: Index only active memberships

## Next Steps

1. **Load the schema** in the UI
2. **Build policies** using the Visual Query Builder
3. **Generate SQL** and review the output
4. **Test policies** with different user scenarios
5. **Apply to your database** using Supabase or direct PostgreSQL connection

## Resources

- [Multi-Tenant Permissions Guide](../../docs/team-organization-permissions.md)
- [Visual Query Builder Guide](../../docs/visual-query-builder.md)
- [Permission Expression Language](../../docs/permission-expression-language.md)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

