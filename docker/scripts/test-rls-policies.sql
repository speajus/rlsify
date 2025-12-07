-- RLS Policy Testing Script
-- This script demonstrates how to test RLS policies with the sample data

\echo '========================================='
\echo 'RLSify RLS Policy Testing'
\echo '========================================='
\echo ''

-- Show all users
\echo '📋 Available Users:'
SELECT 
    name,
    email,
    id
FROM users
ORDER BY name;

\echo ''
\echo '========================================='
\echo 'Test 1: User-Owned Resources Policy'
\echo '========================================='
\echo ''

-- Enable RLS on resources
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS user_owned_resources ON resources;

-- Create policy: users can only see their own active resources
CREATE POLICY user_owned_resources ON resources
    FOR SELECT
    USING (created_by = auth.uid() AND status = 'active');

\echo '✅ Policy created: user_owned_resources'
\echo ''

-- Test as Alice
\echo '👤 Testing as Alice Anderson...'
SELECT auth.set_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT * FROM auth.current_user_info;
\echo ''
\echo 'Alice resources (should see 2 active resources):'
SELECT name, status FROM resources ORDER BY name;

\echo ''
-- Test as Bob
\echo '👤 Testing as Bob Brown...'
SELECT auth.set_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
SELECT * FROM auth.current_user_info;
\echo ''
\echo 'Bob resources (should see 1 active resource):'
SELECT name, status FROM resources ORDER BY name;

\echo ''
\echo '========================================='
\echo 'Test 2: Team Member Access Policy'
\echo '========================================='
\echo ''

-- Enable RLS on projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS project_team_access ON projects;

-- Create policy: users can see projects from teams they belong to
CREATE POLICY project_team_access ON projects
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = projects.team_id
            AND team_members.user_id = auth.uid()
        )
    );

\echo '✅ Policy created: project_team_access'
\echo ''

-- Test as Alice (Acme Engineering team)
\echo '👤 Testing as Alice Anderson (Acme Engineering)...'
SELECT auth.set_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
\echo ''
\echo 'Alice projects (should see 3 Engineering projects):'
SELECT name, status FROM projects ORDER BY name;

\echo ''
-- Test as Carol (Acme Marketing team)
\echo '👤 Testing as Carol Chen (Acme Marketing)...'
SELECT auth.set_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
\echo ''
\echo 'Carol projects (should see 1 Marketing project):'
SELECT name, status FROM projects ORDER BY name;

\echo ''
-- Test as David (TechStart Product team)
\echo '👤 Testing as David Davis (TechStart Product)...'
SELECT auth.set_user('dddddddd-dddd-dddd-dddd-dddddddddddd');
\echo ''
\echo 'David projects (should see 2 Product projects):'
SELECT name, status FROM projects ORDER BY name;

\echo ''
\echo '========================================='
\echo 'Test 3: Organization Admin Override'
\echo '========================================='
\echo ''

-- Drop previous policy
DROP POLICY IF EXISTS project_team_access ON projects;

-- Create policy with org admin override
CREATE POLICY project_org_admin_or_team_member ON projects
    FOR SELECT
    USING (
        -- User is a team member
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = projects.team_id
            AND team_members.user_id = auth.uid()
        )
        OR
        -- User is an org admin/owner
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN teams t ON om.organization_id = t.organization_id
            WHERE t.id = projects.team_id
            AND om.user_id = auth.uid()
            AND om.role IN ('admin', 'owner')
        )
    );

\echo '✅ Policy created: project_org_admin_or_team_member'
\echo ''

-- Test as Bob (Acme admin, not in Marketing team)
\echo '👤 Testing as Bob Brown (Acme admin, not in Marketing team)...'
SELECT auth.set_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
\echo ''
\echo 'Bob projects (should see ALL 4 Acme projects due to admin role):'
SELECT name, status FROM projects ORDER BY name;

\echo ''
\echo '========================================='
\echo 'Test 4: Public or Team Member Access'
\echo '========================================='
\echo ''

-- Enable RLS on documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS document_public_or_team_access ON documents;

-- Create policy: public documents OR team member access
CREATE POLICY document_public_or_team_access ON documents
    FOR SELECT
    USING (
        is_public = TRUE
        OR
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = documents.team_id
            AND team_members.user_id = auth.uid()
        )
    );

\echo '✅ Policy created: document_public_or_team_access'
\echo ''

-- Test as Carol (Acme Marketing team)
\echo '👤 Testing as Carol Chen (Acme Marketing)...'
SELECT auth.set_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
\echo ''
\echo 'Carol documents (should see public docs + Marketing private docs):'
SELECT title, is_public FROM documents ORDER BY title;

\echo ''
-- Test as Emma (TechStart Product team)
\echo '👤 Testing as Emma Evans (TechStart Product)...'
SELECT auth.set_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
\echo ''
\echo 'Emma documents (should see public docs + Product private docs):'
SELECT title, is_public FROM documents ORDER BY title;

\echo ''
-- Clear user context
SELECT auth.clear_user();

\echo ''
\echo '========================================='
\echo '✅ All tests completed!'
\echo '========================================='
\echo ''
\echo 'To run these tests again:'
\echo '  docker-compose exec postgres psql -U rlsify -d rlsify -f /docker-entrypoint-initdb.d/test-rls-policies.sql'
\echo ''
\echo 'Or from the host:'
\echo '  make db-test'
\echo ''

