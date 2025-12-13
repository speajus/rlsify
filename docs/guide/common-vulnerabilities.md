# Common Vulnerabilities

Learn about common RLS mistakes and how to avoid them.

## 1. Missing RLS Enablement

**Vulnerability**: Forgetting to enable RLS means policies are ignored.

```sql
-- WRONG: Policies exist but RLS not enabled
CREATE POLICY user_access ON posts
  FOR SELECT USING (user_id = auth.uid());

SELECT * FROM posts;  -- Returns ALL rows!
```

**Fix**:

```sql
-- ALWAYS enable RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners too
ALTER TABLE posts FORCE ROW LEVEL SECURITY;
```

## 2. Missing INSERT/UPDATE Policies

**Vulnerability**: Having SELECT policies but missing write policies.

```sql
-- Only SELECT is protected
CREATE POLICY read_own ON posts
  FOR SELECT USING (user_id = auth.uid());

-- Anyone can INSERT!
INSERT INTO posts (user_id, content) VALUES ('other-user-id', 'hacked');
```

**Fix**:

```sql
CREATE POLICY insert_own ON posts
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY update_own ON posts
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY delete_own ON posts
  FOR DELETE
  USING (user_id = auth.uid());
```

## 3. Incorrect Column References

**Vulnerability**: Using wrong column names in policies.

```sql
-- WRONG: 'user_id' doesn't exist, column is 'author_id'
CREATE POLICY user_access ON posts
  FOR SELECT USING (user_id = auth.uid());

-- Policy fails silently, blocking ALL access
SELECT * FROM posts;  -- Returns 0 rows
```

**Fix**: Always verify column names match your schema.

## 4. NULL Handling

**Vulnerability**: NULL values can bypass comparisons.

```sql
-- WRONG: If owner_id is NULL, this returns NULL (not true/false)
CREATE POLICY owner_access ON resources
  FOR SELECT USING (owner_id = auth.uid());

-- Row with NULL owner_id is NOT visible (good)
-- But be explicit about intent
```

**Better**:

```sql
CREATE POLICY owner_access ON resources
  FOR SELECT
  USING (owner_id IS NOT NULL AND owner_id = auth.uid());
```

## 5. Unsafe Type Casts

**Vulnerability**: Type mismatches can cause errors or bypasses.

```sql
-- WRONG: If JWT claim is malformed, this throws error
CREATE POLICY org_access ON resources
  FOR SELECT
  USING (org_id = current_setting('request.jwt.claims')::json->>'org_id');
```

**Fix**:

```sql
-- Use a safe wrapper function
CREATE OR REPLACE FUNCTION get_org_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN (current_setting('request.jwt.claims', true)::json->>'org_id')::uuid;
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$;

CREATE POLICY org_access ON resources
  FOR SELECT
  USING (org_id = get_org_id());
```

## 6. Recursive Policy Loops

**Vulnerability**: Policies that reference themselves infinitely.

```sql
-- WRONG: Policy on users references users table
CREATE POLICY user_access ON users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.manager_id = users.id
        AND u.id = auth.uid()
    )
  );

-- ERROR: infinite recursion detected in policy
```

**Fix**: Use a different approach or materialized views.

```sql
-- Use a function with SECURITY DEFINER
CREATE FUNCTION get_managed_user_ids(manager UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM users WHERE manager_id = manager;
$$;
```

## 7. Cross-Tenant Data Exposure

**Vulnerability**: Policies that don't properly isolate tenants.

```sql
-- WRONG: User can see any team they're a member of
CREATE POLICY team_access ON documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = documents.team_id
        AND user_id = auth.uid()
    )
  );

-- If user is in Team A (Org 1) and Team B (Org 2),
-- they can see documents from both organizations!
```

**Fix**: Always include organization-level checks.

```sql
CREATE POLICY team_access ON documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.team_id = documents.team_id
        AND tm.user_id = auth.uid()
        AND t.org_id = get_current_org_id()  -- Add org check!
    )
  );
```

## 8. Privilege Escalation via UPDATE

**Vulnerability**: Allowing users to update sensitive fields.

```sql
-- WRONG: User can change their own role
CREATE POLICY update_self ON users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- User can: UPDATE users SET role = 'admin' WHERE id = auth.uid();
```

**Fix**: Restrict which columns can be updated.

```sql
-- Option 1: Column-level grants
REVOKE UPDATE (role) ON users FROM authenticated;

-- Option 2: Check in policy
CREATE POLICY update_self ON users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM users WHERE id = auth.uid())
  );
```

## 9. Service Key Exposure

**Vulnerability**: Using service role keys in client code.

```javascript
// WRONG: Service key in frontend!
const supabase = createClient(url, 'service-role-key');
```

**Fix**: Only use service keys server-side.

## 10. Missing Force RLS

**Vulnerability**: Table owners bypass RLS by default.

```sql
-- If the app connects as table owner, RLS is bypassed
ALTER TABLE sensitive ENABLE ROW LEVEL SECURITY;
-- Table owner can still see everything!
```

**Fix**:

```sql
ALTER TABLE sensitive FORCE ROW LEVEL SECURITY;
```

## Security Checklist

- [ ] RLS enabled on all sensitive tables
- [ ] FORCE RLS enabled where needed
- [ ] Policies for SELECT, INSERT, UPDATE, DELETE
- [ ] Organization isolation in multi-tenant apps
- [ ] NULL handling is explicit
- [ ] Type casts are safe
- [ ] No recursive policy references
- [ ] Service keys are server-side only
- [ ] Privilege escalation prevented
- [ ] Policies are tested

## Next Steps

- [Auditing](/guide/auditing) - Monitor access patterns
- [Testing Policies](/guide/testing-policies) - Write security tests

