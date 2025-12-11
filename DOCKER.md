# 🐳 RLSify Docker Environment

Complete Docker Compose setup for running RLSify with PostgreSQL and the web UI.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Docker Host                          │
│                                                             │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────┐ │
│  │              │      │              │      │          │ │
│  │  RLSify UI   │─────▶│  PostgreSQL  │◀─────│ pgAdmin  │ │
│  │  (Svelte)    │      │   (RLS DB)   │      │ (Tools)  │ │
│  │              │      │              │      │          │ │
│  │  Port: 5174  │      │  Port: 5432  │      │Port: 5050│ │
│  └──────────────┘      └──────────────┘      └──────────┘ │
│         │                      │                    │      │
│         │                      │                    │      │
│         └──────────────────────┴────────────────────┘      │
│                    rlsify-network                          │
│                                                             │
│  Volumes:                                                   │
│  • postgres_data (database persistence)                    │
│  • pgadmin_data (pgAdmin config)                          │
│  • ui_node_modules (dependency cache)                     │
└─────────────────────────────────────────────────────────────┘
         │                      │                    │
         ▼                      ▼                    ▼
    localhost:5174        localhost:5432       localhost:5050
```

## 📋 Prerequisites

- Docker Engine 20.10+ and Docker Compose 2.0+
- At least 2GB of available RAM
- Ports 5432, 5174, and optionally 5050 available

## 🚀 Quick Start

### 1. Copy Environment Variables

```bash
npm run docker:setup
```

Edit `.env` if you want to customize ports or credentials.

### 2. Start the Environment

```bash
# Start PostgreSQL and UI
npm run docker:up

# Or with pgAdmin for database management
npm run docker:up:tools
```

### 3. Access the Services

- **RLSify UI**: http://localhost:5174
- **PostgreSQL**: `localhost:5432` (credentials in `.env`)
- **pgAdmin** (optional): http://localhost:5050

## 📦 What's Included

### Services

1. **PostgreSQL 16** - Database with RLS support
   - Pre-configured with multi-tenant schema
   - Sample data demonstrating org → team → user hierarchy
   - Auth helper functions for testing RLS policies
   
2. **RLSify UI** - Svelte-based web interface
   - Visual Query Builder for creating RLS policies
   - Template-based policy creation
   - SQL editor with syntax highlighting
   
3. **pgAdmin 4** (optional) - Database management tool
   - Pre-configured connection to PostgreSQL
   - Useful for inspecting data and testing queries

### Database Schema

The PostgreSQL container is initialized with a complete multi-tenant schema:

```
organizations
├── organization_members (users with roles: owner, admin, member)
└── teams
    ├── team_members (users with roles: admin, member)
    ├── projects (team-scoped resources)
    └── documents (with public/private visibility)

users (can belong to multiple orgs and teams)
resources (simple user-owned resources for demos)
```

## 🎯 Example Workflow

### 1. Access the UI

Open http://localhost:5174 in your browser. The UI will automatically load with:
- The multi-tenant schema
- An example policy showing user-owned resources

### 2. Create a Policy Using Visual Builder

1. Click on the **Visual Builder** tab
2. Add conditions using the dropdown selectors:
   - Select a field (e.g., `created_by`)
   - Choose an operator (e.g., `equals`)
   - Set a value (e.g., `auth.uid()`)
3. The SQL is generated automatically

### 3. Test the Policy in PostgreSQL

Connect to the database:

```bash
docker-compose exec postgres psql -U rlsify -d rlsify
```

Set a user context and test the policy:

```sql
-- Set the current user (Alice)
SELECT auth.set_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- View current user info
SELECT * FROM auth.current_user_info;

-- Create a test policy on resources table
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_owned_resources ON resources
    FOR SELECT
    USING (created_by = auth.uid() AND status = 'active');

-- Test the policy - should only see Alice's active resources
SELECT * FROM resources;

-- Switch to Bob
SELECT auth.set_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Should now see Bob's resources
SELECT * FROM resources;

-- Clear user context
SELECT auth.clear_user();
```

### 4. Explore Sample Data

```sql
-- View all organizations
SELECT * FROM organizations;

-- View users and their organization memberships
SELECT 
    u.name,
    u.email,
    o.name AS organization,
    om.role
FROM users u
JOIN organization_members om ON u.id = om.user_id
JOIN organizations o ON om.organization_id = o.id
ORDER BY o.name, u.name;

-- View teams and their members
SELECT 
    o.name AS organization,
    t.name AS team,
    u.name AS member,
    tm.role
FROM teams t
JOIN organizations o ON t.organization_id = o.id
JOIN team_members tm ON t.id = tm.team_id
JOIN users u ON tm.user_id = u.id
ORDER BY o.name, t.name, u.name;
```

## 🔧 Management Commands

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f postgres
docker-compose logs -f ui
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart postgres
```

### Stop Services

```bash
# Stop but keep data
docker-compose stop

# Stop and remove containers (keeps volumes)
docker-compose down

# Stop and remove everything including data
docker-compose down -v
```

### Access Database Shell

```bash
docker-compose exec postgres psql -U rlsify -d rlsify
```

### Reset Database

```bash
# Stop and remove database volume
docker-compose down -v

# Start fresh
docker-compose up -d
```

## 🧪 Testing RLS Policies

### Example: Team Member Access Policy

Create a policy that allows users to see projects from teams they belong to:

```sql
-- Enable RLS on projects table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Create the policy
CREATE POLICY project_team_access ON projects
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = projects.team_id
            AND team_members.user_id = auth.uid()
        )
    );

-- Test as Alice (member of Acme Engineering team)
SELECT auth.set_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT name, description FROM projects;
-- Should see: Mobile App, API Gateway, Legacy Migration

-- Test as David (member of TechStart Product team)
SELECT auth.set_user('dddddddd-dddd-dddd-dddd-dddddddddddd');
SELECT name, description FROM projects;
-- Should see: MVP Launch, Feature Expansion
```

### Example: Organization Admin Override

Create a policy where org admins can see all projects in their organization:

```sql
-- Drop the previous policy
DROP POLICY IF EXISTS project_team_access ON projects;

-- Create a more complex policy with org admin override
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

-- Test as Bob (Acme admin, not in Marketing team)
SELECT auth.set_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
SELECT name, team_id FROM projects;
-- Should see all Acme projects (Engineering + Marketing)
```

### Example: Public or Team Member Access

Documents can be public OR accessible to team members:

```sql
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

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

-- Test as Carol (Acme Marketing team member)
SELECT auth.set_user('cccccccc-cccc-cccc-cccc-cccccccccccc');
SELECT title, is_public FROM documents;
-- Should see: public docs from all teams + private Marketing docs
```

## 📊 Sample Data Reference

### Organizations

| Name | Slug | ID |
|------|------|-----|
| Acme Corporation | acme | 11111111-1111-1111-1111-111111111111 |
| TechStart Inc | techstart | 22222222-2222-2222-2222-222222222222 |
| Global Enterprises | global | 33333333-3333-3333-3333-333333333333 |

### Users

| Name | Email | ID | Organization | Role |
|------|-------|-----|--------------|------|
| Alice Anderson | alice@acme.com | aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa | Acme | owner |
| Bob Brown | bob@acme.com | bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb | Acme | admin |
| Carol Chen | carol@acme.com | cccccccc-cccc-cccc-cccc-cccccccccccc | Acme | member |
| David Davis | david@techstart.com | dddddddd-dddd-dddd-dddd-dddddddddddd | TechStart | owner |
| Emma Evans | emma@techstart.com | eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee | TechStart | member |
| Frank Foster | frank@global.com | ffffffff-ffff-ffff-ffff-ffffffffffff | Global | owner |
| Grace Green | grace@global.com | 99999999-9999-9999-9999-999999999999 | Global | admin |

### Teams

| Organization | Team | Members |
|--------------|------|---------|
| Acme | Engineering | Alice (admin), Bob (member) |
| Acme | Marketing | Carol (admin) |
| TechStart | Product | David (admin), Emma (member) |
| Global | Operations | Frank (admin), Grace (member) |

## 🔍 Troubleshooting

### UI Not Loading

```bash
# Check if the container is running
docker-compose ps

# View UI logs
docker-compose logs -f ui

# Restart the UI
docker-compose restart ui
```

### Database Connection Issues

```bash
# Check if PostgreSQL is healthy
docker-compose ps postgres

# View PostgreSQL logs
docker-compose logs -f postgres

# Test connection
docker-compose exec postgres pg_isready -U rlsify
```

### Port Conflicts

If ports are already in use, edit `.env`:

```env
POSTGRES_PORT=5433  # Change from 5432
UI_PORT=5175        # Change from 5174
PGADMIN_PORT=5051   # Change from 5050
```

Then restart:

```bash
docker-compose down
docker-compose up -d
```

### Reset Everything

```bash
# Stop and remove all containers, networks, and volumes
docker-compose down -v

# Remove any orphaned volumes
docker volume prune

# Start fresh
docker-compose up -d
```

## 🏗️ Development Mode

The UI container runs in development mode with hot reload enabled. Any changes to files in `packages/ui/src` will automatically reload the browser.

To rebuild after dependency changes:

```bash
# Rebuild the UI container
docker-compose build ui

# Restart with new build
docker-compose up -d ui
```

## 🔧 NPM Scripts Reference

All Docker commands are available as npm scripts for convenience:

### Setup & Management
```bash
npm run docker:setup          # Copy .env.example to .env
npm run docker:up             # Start all services
npm run docker:up:tools       # Start with pgAdmin
npm run docker:down           # Stop all services
npm run docker:restart        # Restart all services
npm run docker:status         # Show service status
npm run docker:clean          # Remove containers (keep data)
npm run docker:reset          # Remove containers and volumes
npm run docker:rebuild        # Rebuild UI container
```

### Database
```bash
npm run docker:db:shell       # Open PostgreSQL shell
npm run docker:db:test        # Run RLS policy tests
```

### Logs
```bash
npm run docker:logs           # View all logs
npm run docker:ui:logs        # View UI logs only
npm run docker:postgres:logs  # View PostgreSQL logs only
```

### Scripts
```bash
npm run docker:demo           # Run interactive demo
npm run docker:validate       # Validate setup
```

## 📝 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_DB` | rlsify | Database name |
| `POSTGRES_USER` | rlsify | Database user |
| `POSTGRES_PASSWORD` | rlsify_dev_password | Database password |
| `POSTGRES_PORT` | 5432 | PostgreSQL port |
| `UI_PORT` | 5174 | UI application port |
| `PGADMIN_PORT` | 5050 | pgAdmin port |
| `PGADMIN_EMAIL` | admin@rlsify.local | pgAdmin login email |
| `PGADMIN_PASSWORD` | admin | pgAdmin login password |

## 🎓 Learning Resources

### Understanding RLS Policies

1. **USING vs WITH CHECK**:
   - `USING`: Controls which rows are visible in SELECT/UPDATE/DELETE
   - `WITH CHECK`: Controls which rows can be inserted/updated

2. **Policy Commands**:
   - `SELECT`: Read access
   - `INSERT`: Create new rows
   - `UPDATE`: Modify existing rows
   - `DELETE`: Remove rows
   - `ALL`: All operations

3. **Common Patterns**:
   - User-owned: `created_by = auth.uid()`
   - Team member: `EXISTS (SELECT 1 FROM team_members WHERE ...)`
   - Role-based: `role IN ('admin', 'owner')`
   - Public or owned: `is_public = TRUE OR created_by = auth.uid()`

### Next Steps

1. Explore the Visual Builder in the UI
2. Try creating policies using the Templates tab
3. Test policies in PostgreSQL using the examples above
4. Read the [PostgreSQL RLS documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
5. Check out the [Supabase RLS guide](https://supabase.com/docs/guides/auth/row-level-security)

## 🤝 Contributing

Found an issue or want to improve the Docker setup? Please open an issue or PR!

## 📄 License

MIT © Justin Spears

