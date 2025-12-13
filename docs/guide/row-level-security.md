# Row-Level Security

Row-Level Security (RLS) is a PostgreSQL feature that restricts which rows users can see or modify based on policies you define.

## How RLS Works

When RLS is enabled on a table, every query is automatically filtered by the policies you define. Users can only see or modify rows that match their assigned policies.

### Basic Example

```sql
-- Enable RLS on posts table
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Users can only see their own posts
CREATE POLICY users_see_own_posts ON posts
  FOR SELECT
  USING (user_id = auth.uid());

-- Now when Alice queries:
SELECT * FROM posts;
-- She only sees rows where user_id = Alice's ID
```

## Policy Types

### USING vs WITH CHECK

- **USING** - Filters rows for SELECT, UPDATE (existing rows), DELETE
- **WITH CHECK** - Validates rows for INSERT, UPDATE (new values)

```sql
-- SELECT: Filter with USING
CREATE POLICY select_own ON posts
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT: Validate with WITH CHECK
CREATE POLICY insert_own ON posts
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE: Both USING and WITH CHECK
CREATE POLICY update_own ON posts
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: Filter with USING
CREATE POLICY delete_own ON posts
  FOR DELETE
  USING (user_id = auth.uid());
```

### Commands

| Command | USING | WITH CHECK |
|---------|-------|------------|
| SELECT | ✅ Required | ❌ Not used |
| INSERT | ❌ Not used | ✅ Required |
| UPDATE | ✅ Filters existing | ✅ Validates new |
| DELETE | ✅ Required | ❌ Not used |

## Permissive vs Restrictive

### Permissive Policies (Default)

Multiple permissive policies are combined with OR:

```sql
CREATE POLICY owner_access ON docs
  AS PERMISSIVE
  FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY public_access ON docs
  AS PERMISSIVE
  FOR SELECT
  USING (is_public = true);

-- User sees: owner_id = me OR is_public = true
```

### Restrictive Policies

Restrictive policies are combined with AND:

```sql
CREATE POLICY must_be_org_member ON docs
  AS RESTRICTIVE
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id = docs.org_id
        AND user_id = auth.uid()
    )
  );

-- Combined: (permissive conditions) AND (restrictive conditions)
```

## Bypassing RLS

### Superusers

By default, superusers bypass RLS. To enforce RLS on superusers:

```sql
ALTER TABLE posts FORCE ROW LEVEL SECURITY;
```

### Service Roles

Create a role that bypasses RLS for administrative tasks:

```sql
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT service_role TO your_app_user;

-- In application code, use SET ROLE
SET ROLE service_role;
-- ... do admin operations ...
RESET ROLE;
```

## Common Patterns

### 1. Owner-Based Access

```sql
CREATE POLICY owner_policy ON resources
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
```

### 2. Team Membership

```sql
CREATE POLICY team_access ON documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = documents.team_id
        AND user_id = auth.uid()
    )
  );
```

### 3. Organization Isolation

```sql
CREATE POLICY org_isolation ON projects
  FOR ALL
  USING (org_id = current_setting('app.org_id')::uuid);
```

### 4. Public + Private

```sql
CREATE POLICY public_or_owner ON posts
  FOR SELECT
  USING (
    is_public = true
    OR author_id = auth.uid()
  );
```

## Performance Considerations

1. **Index foreign keys** - Policies with EXISTS need indexes
2. **Avoid complex subqueries** - Use materialized views for complex checks
3. **Cache session variables** - Avoid repeated function calls
4. **Test with EXPLAIN** - Analyze query plans with RLS enabled

```sql
-- Add indexes for RLS performance
CREATE INDEX idx_docs_team_id ON documents(team_id);
CREATE INDEX idx_team_members_lookup ON team_members(team_id, user_id);
```

## Next Steps

- [Expression Language](/guide/expression-language) - JSON syntax for policies
- [Policy Types](/guide/policy-types) - Detailed command reference
- [Security Best Practices](/guide/security-best-practices) - Secure your policies

