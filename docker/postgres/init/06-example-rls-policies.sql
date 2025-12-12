-- Example RLS Policies for demonstration
-- These policies demonstrate common patterns that can be imported using rlsify

-- Enable RLS on demo tables
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Pattern 1: User-Owned Resources (Simple)
-- Users can only see their own resources
-- =============================================================================
CREATE POLICY "resources_select_own" ON resources
    FOR SELECT
    TO PUBLIC
    USING (created_by = auth.uid());

CREATE POLICY "resources_insert_own" ON resources
    FOR INSERT
    TO PUBLIC
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "resources_update_own" ON resources
    FOR UPDATE
    TO PUBLIC
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "resources_delete_own" ON resources
    FOR DELETE
    TO PUBLIC
    USING (created_by = auth.uid());

-- =============================================================================
-- Pattern 2: Public/Private Content
-- Documents can be public (visible to all) or private (visible to creator only)
-- =============================================================================
CREATE POLICY "documents_select_public_or_own" ON documents
    FOR SELECT
    TO PUBLIC
    USING (is_public = true OR created_by = auth.uid());

-- =============================================================================
-- Pattern 3: Team-Based Access via EXISTS
-- Projects are visible to team members
-- =============================================================================
CREATE POLICY "projects_select_team_members" ON projects
    FOR SELECT
    TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = projects.team_id
            AND team_members.user_id = auth.uid()
        )
    );

-- =============================================================================
-- Pattern 4: Role-Based Access
-- Only admins can update projects
-- =============================================================================
CREATE POLICY "projects_update_team_admins" ON projects
    FOR UPDATE
    TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = projects.team_id
            AND team_members.user_id = auth.uid()
            AND team_members.role = 'admin'
        )
    );

-- =============================================================================
-- Pattern 5: Status-Based Access
-- Only active resources can be updated
-- =============================================================================
CREATE POLICY "resources_update_active_only" ON resources
    FOR UPDATE
    TO PUBLIC
    USING (status = 'active' AND created_by = auth.uid());

-- =============================================================================
-- Pattern 6: Organization Tenant Isolation
-- Team documents are visible only to organization members
-- =============================================================================
CREATE POLICY "documents_select_org_members" ON documents
    FOR SELECT
    TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM teams t
            JOIN organization_members om ON om.organization_id = t.organization_id
            WHERE t.id = documents.team_id
            AND om.user_id = auth.uid()
        )
    );

-- Note: For production, you'd want to force RLS for the table owner:
-- ALTER TABLE resources FORCE ROW LEVEL SECURITY;
-- ALTER TABLE documents FORCE ROW LEVEL SECURITY;
-- ALTER TABLE projects FORCE ROW LEVEL SECURITY;

COMMENT ON POLICY "resources_select_own" ON resources IS 'User-owned resource pattern: users can only see their own resources';
COMMENT ON POLICY "documents_select_public_or_own" ON documents IS 'Public/private pattern: public docs visible to all, private to creator';
COMMENT ON POLICY "projects_select_team_members" ON projects IS 'Team-based access: projects visible to team members via EXISTS';
COMMENT ON POLICY "projects_update_team_admins" ON projects IS 'Role-based access: only team admins can update projects';

