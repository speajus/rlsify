#!/bin/bash
# RLSify Demo Workflow
# This script demonstrates a complete workflow of creating and testing RLS policies

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}RLSify Demo Workflow${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Check if Docker Compose is running
if ! docker-compose ps | grep -q "Up"; then
    echo -e "${YELLOW}⚠️  Docker Compose is not running${NC}"
    echo "Starting services..."
    docker-compose up -d
    echo "Waiting for services to be ready..."
    sleep 10
fi

echo -e "${GREEN}✅ Services are running${NC}"
echo ""

# Step 1: Show the database schema
echo -e "${BLUE}Step 1: Database Schema${NC}"
echo "The database has been initialized with a multi-tenant schema:"
echo ""
docker-compose exec -T postgres psql -U rlsify -d rlsify << 'EOF'
\dt
EOF
echo ""

# Step 2: Show sample data
echo -e "${BLUE}Step 2: Sample Data${NC}"
echo "Organizations and users:"
echo ""
docker-compose exec -T postgres psql -U rlsify -d rlsify << 'EOF'
SELECT 
    o.name AS organization,
    u.name AS user,
    om.role
FROM organization_members om
JOIN organizations o ON om.organization_id = o.id
JOIN users u ON om.user_id = u.id
ORDER BY o.name, u.name;
EOF
echo ""

# Step 3: Create a simple RLS policy
echo -e "${BLUE}Step 3: Create RLS Policy${NC}"
echo "Creating a policy: Users can only see their own active resources"
echo ""
docker-compose exec -T postgres psql -U rlsify -d rlsify << 'EOF'
-- Enable RLS
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

-- Create policy
DROP POLICY IF EXISTS user_owned_resources ON resources;
CREATE POLICY user_owned_resources ON resources
    FOR SELECT
    USING (created_by = auth.uid() AND status = 'active');

\echo '✅ Policy created successfully'
EOF
echo ""

# Step 4: Test the policy
echo -e "${BLUE}Step 4: Test the Policy${NC}"
echo ""
echo "Testing as Alice Anderson..."
docker-compose exec -T postgres psql -U rlsify -d rlsify << 'EOF'
-- Set user as Alice
SELECT auth.set_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Show current user
SELECT 'Current user:' AS info, name, email FROM auth.current_user_info;

-- Query resources (should only see Alice's active resources)
SELECT 'Alice resources:' AS info, name, status FROM resources;
EOF
echo ""

echo "Testing as Bob Brown..."
docker-compose exec -T postgres psql -U rlsify -d rlsify << 'EOF'
-- Set user as Bob
SELECT auth.set_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Show current user
SELECT 'Current user:' AS info, name, email FROM auth.current_user_info;

-- Query resources (should only see Bob's active resources)
SELECT 'Bob resources:' AS info, name, status FROM resources;
EOF
echo ""

# Step 5: Create a more complex policy
echo -e "${BLUE}Step 5: Complex Policy - Team Access${NC}"
echo "Creating a policy: Users can see projects from teams they belong to"
echo ""
docker-compose exec -T postgres psql -U rlsify -d rlsify << 'EOF'
-- Enable RLS on projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Create policy
DROP POLICY IF EXISTS project_team_access ON projects;
CREATE POLICY project_team_access ON projects
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = projects.team_id
            AND team_members.user_id = auth.uid()
        )
    );

\echo '✅ Policy created successfully'
EOF
echo ""

# Step 6: Test the complex policy
echo -e "${BLUE}Step 6: Test Team Access Policy${NC}"
echo ""
echo "Testing as Alice (Acme Engineering team)..."
docker-compose exec -T postgres psql -U rlsify -d rlsify << 'EOF'
SELECT auth.set_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT 'Alice projects:' AS info, name, status FROM projects ORDER BY name;
EOF
echo ""

echo "Testing as Carol (Acme Marketing team)..."
docker-compose exec -T postgres psql -U rlsify -d rlsify << 'EOF'
SELECT auth.set_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
SELECT 'Carol projects:' AS info, name, status FROM projects ORDER BY name;
EOF
echo ""

echo "Testing as David (TechStart Product team)..."
docker-compose exec -T postgres psql -U rlsify -d rlsify << 'EOF'
SELECT auth.set_user('dddddddd-dddd-dddd-dddd-dddddddddddd');
SELECT 'David projects:' AS info, name, status FROM projects ORDER BY name;
EOF
echo ""

# Summary
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}✅ Demo Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "What you've learned:"
echo "1. ✅ Database schema with multi-tenant structure"
echo "2. ✅ Sample data representing organizations, teams, and users"
echo "3. ✅ Simple RLS policy (user-owned resources)"
echo "4. ✅ Complex RLS policy (team member access)"
echo "5. ✅ Testing policies with different users"
echo ""
echo "Next steps:"
echo "• Open the UI at http://localhost:5174"
echo "• Try creating policies using the Visual Builder"
echo "• Explore the Templates tab for pre-built patterns"
echo "• Connect to the database: docker-compose exec postgres psql -U rlsify -d rlsify"
echo "• Run full test suite: docker-compose exec postgres psql -U rlsify -d rlsify -f /docker-entrypoint-initdb.d/test-rls-policies.sql"
echo ""

