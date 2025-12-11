# RLSify Docker Quick Reference

## 🚀 Getting Started

```bash
# 1. Setup
npm run docker:setup

# 2. Start
npm run docker:up

# 3. Access
# UI: http://localhost:5174
# DB: localhost:5432
```

## 📋 Common Commands

### Service Management
```bash
# Start all services
npm run docker:up

# Start with pgAdmin
npm run docker:up:tools

# Stop services
npm run docker:down

# Restart services
npm run docker:restart

# View logs
npm run docker:logs

# View specific service logs
npm run docker:postgres:logs
npm run docker:ui:logs

# Check status
npm run docker:status
```

### Database Access
```bash
# Open PostgreSQL shell
npm run docker:db:shell

# Run SQL file
docker-compose exec -T postgres psql -U rlsify -d rlsify < myfile.sql

# Backup database
docker-compose exec -T postgres pg_dump -U rlsify rlsify > backup.sql

# Restore database
docker-compose exec -T postgres psql -U rlsify -d rlsify < backup.sql
```

### Testing
```bash
# Run demo workflow
npm run docker:demo

# Run RLS tests
npm run docker:db:test

# Validate setup
npm run docker:validate
```

## 🔧 Useful SQL Commands

### Set User Context
```sql
-- Set current user (for testing RLS)
SELECT auth.set_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- View current user
SELECT * FROM auth.current_user_info;

-- Clear user
SELECT auth.clear_user();
```

### View Schema
```sql
-- List all tables
\dt

-- Describe table
\d table_name

-- List all policies
\d+ table_name
```

### Sample Queries
```sql
-- View all organizations
SELECT * FROM organizations;

-- View users with their organizations
SELECT 
    u.name,
    o.name AS organization,
    om.role
FROM users u
JOIN organization_members om ON u.id = om.user_id
JOIN organizations o ON om.organization_id = o.id;

-- View teams and members
SELECT 
    t.name AS team,
    u.name AS member,
    tm.role
FROM teams t
JOIN team_members tm ON t.id = tm.team_id
JOIN users u ON tm.user_id = u.id;
```

## 👥 Sample User IDs

```sql
-- Acme Corporation
'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' -- Alice (owner)
'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' -- Bob (admin)
'cccccccc-cccc-cccc-cccc-cccccccccccc' -- Carol (member)

-- TechStart Inc
'dddddddd-dddd-dddd-dddd-dddddddddddd' -- David (owner)
'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' -- Emma (member)

-- Global Enterprises
'ffffffff-ffff-ffff-ffff-ffffffffffff' -- Frank (owner)
'99999999-9999-9999-9999-999999999999' -- Grace (admin)
```

## 🎯 Example RLS Policies

### User-Owned Resources
```sql
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_owned_resources ON resources
    FOR SELECT
    USING (created_by = auth.uid() AND status = 'active');
```

### Team Member Access
```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_team_access ON projects
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = projects.team_id
            AND team_members.user_id = auth.uid()
        )
    );
```

### Organization Admin Override
```sql
CREATE POLICY project_org_admin_or_team ON projects
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = projects.team_id
            AND team_members.user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN teams t ON om.organization_id = t.organization_id
            WHERE t.id = projects.team_id
            AND om.user_id = auth.uid()
            AND om.role IN ('admin', 'owner')
        )
    );
```

## 🔍 Troubleshooting

### Services won't start
```bash
# Check status
npm run docker:status

# View logs
npm run docker:logs

# Restart
npm run docker:restart
```

### Database connection failed
```bash
# Check PostgreSQL health
docker-compose exec postgres pg_isready -U rlsify

# View PostgreSQL logs
npm run docker:postgres:logs
```

### UI not loading
```bash
# Check UI logs
npm run docker:ui:logs

# Rebuild UI
npm run docker:rebuild
```

### Reset everything
```bash
# Stop and remove all data
npm run docker:reset

# Start fresh
npm run docker:up
```

## 📊 Monitoring

### Check Service Health
```bash
docker-compose ps
```

### View Resource Usage
```bash
docker stats
```

### Database Size
```sql
SELECT 
    pg_size_pretty(pg_database_size('rlsify')) AS database_size;
```

### Active Connections
```sql
SELECT count(*) FROM pg_stat_activity;
```

## 🔗 URLs

- **UI**: http://localhost:5174
- **PostgreSQL**: localhost:5432
- **pgAdmin**: http://localhost:5050 (with `--profile tools`)

## 📚 Documentation

- [Full Docker Guide](../DOCKER.md)
- [Docker Directory README](./README.md)
- [Main README](../README.md)

