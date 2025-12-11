# 🚀 Getting Started with RLSify Docker

This guide will walk you through setting up and using RLSify with Docker in under 5 minutes.

## Prerequisites

- Docker Engine 20.10+ and Docker Compose 2.0+
- At least 2GB of available RAM
- Ports 5432 and 5174 available

## Step 1: Setup (30 seconds)

```bash
# Clone the repository (if you haven't already)
git clone https://github.com/jspears/rlsify.git
cd rlsify

# Copy environment configuration
cp .env.example .env

# Optional: Edit .env to customize ports or credentials
# nano .env
```

## Step 2: Start Services (1 minute)

```bash
# Start PostgreSQL and UI
npm run docker:up

# Or with Docker Compose directly:
docker-compose up -d
```

Wait for the services to start. You'll see:
```
✅ RLSify is running!
🌐 UI: http://localhost:5174
🗄️  PostgreSQL: localhost:5432
```

## Step 3: Access the UI (immediate)

Open your browser to http://localhost:5174

You'll see:
- **Visual Builder** tab with an example policy pre-loaded
- **Templates** tab with common RLS patterns
- **SQL** tab showing the generated SQL

The UI is pre-configured with:
- Multi-tenant schema (organizations → teams → users)
- Example policy: "Users can only see resources they created"

## Step 4: Explore the Database (1 minute)

```bash
# Open PostgreSQL shell
npm run docker:db:shell

# Or with Docker Compose directly:
docker-compose exec postgres psql -U rlsify -d rlsify
```

Try these commands:

```sql
-- View all tables
\dt

-- See sample organizations
SELECT * FROM organizations;

-- See users and their organizations
SELECT 
    u.name AS user,
    o.name AS organization,
    om.role
FROM users u
JOIN organization_members om ON u.id = om.user_id
JOIN organizations o ON om.organization_id = o.id;

-- Exit
\q
```

## Step 5: Test RLS Policies (2 minutes)

### Option A: Run the Interactive Demo

```bash
./docker/scripts/demo-workflow.sh
```

This will:
1. Show the database schema
2. Display sample data
3. Create RLS policies
4. Test with different users
5. Demonstrate team-based access

### Option B: Manual Testing

```bash
# Access database
npm run docker:db:shell
```

```sql
-- Set user context (Alice)
SELECT auth.set_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- View current user
SELECT * FROM auth.current_user_info;

-- Enable RLS on resources table
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

-- Create a policy
CREATE POLICY user_owned_resources ON resources
    FOR SELECT
    USING (created_by = auth.uid() AND status = 'active');

-- Test it - should only see Alice's active resources
SELECT name, status FROM resources;

-- Switch to Bob
SELECT auth.set_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Should now see Bob's resources
SELECT name, status FROM resources;
```

## What's Next?

### 1. Create Your Own Policies

Use the Visual Builder in the UI:
1. Click **Visual Builder** tab
2. Add conditions using dropdowns
3. See SQL generated automatically
4. Copy SQL to test in database

### 2. Try Templates

Click the **Templates** tab to see pre-built patterns:
- User-owned resources
- Team member access
- Organization admin override
- Public or team access

### 3. Explore Sample Data

The database includes:
- **3 organizations**: Acme, TechStart, Global
- **7 users** with different roles
- **4 teams** across organizations
- **Projects, documents, and resources**

See [DOCKER.md](./DOCKER.md#sample-data-reference) for complete data reference.

### 4. Learn RLS Patterns

Read the documentation:
- [DOCKER.md](./DOCKER.md) - Complete Docker guide
- [docker/QUICK_REFERENCE.md](./docker/QUICK_REFERENCE.md) - Quick reference
- [docs/team-organization-permissions.md](./docs/team-organization-permissions.md) - Permission patterns

## Common Commands

```bash
# View logs
npm run docker:logs

# Restart services
npm run docker:restart

# Stop services
npm run docker:down

# Reset everything (fresh start)
npm run docker:reset

# Access database
npm run docker:db:shell

# Run tests
npm run docker:db:test

# Run demo
npm run docker:demo

# Check status
npm run docker:status
```

## Troubleshooting

### Services won't start

```bash
# Check status
docker-compose ps

# View logs
docker-compose logs
```

### Port already in use

Edit `.env` and change the ports:
```env
POSTGRES_PORT=5433
UI_PORT=5175
```

Then restart:
```bash
npm run docker:down
npm run docker:up
```

### UI not loading

```bash
# Check UI logs
docker-compose logs ui

# Rebuild UI
docker-compose build ui
docker-compose up -d ui
```

### Database connection issues

```bash
# Check PostgreSQL health
docker-compose exec postgres pg_isready -U rlsify

# View PostgreSQL logs
docker-compose logs postgres
```

## Advanced Usage

### With pgAdmin (Database Management Tool)

```bash
# Start with pgAdmin
npm run docker:up:tools

# Or with Docker Compose directly:
docker-compose --profile tools up -d
```

Access pgAdmin at http://localhost:5050
- Email: `admin@rlsify.local`
- Password: `admin`

### Production Mode

To run the UI in production mode with Nginx:

1. Edit `docker-compose.yml`:
```yaml
ui:
  build:
    target: production
```

2. Rebuild and restart:
```bash
docker-compose build ui
docker-compose up -d ui
```

## Learning Resources

### Understanding RLS

1. **USING vs WITH CHECK**:
   - `USING`: Controls which rows are visible (SELECT/UPDATE/DELETE)
   - `WITH CHECK`: Controls which rows can be inserted/updated

2. **Common Patterns**:
   - User-owned: `created_by = auth.uid()`
   - Team member: `EXISTS (SELECT 1 FROM team_members WHERE ...)`
   - Role-based: `role IN ('admin', 'owner')`

3. **Testing**:
   - Use `auth.set_user(uuid)` to simulate different users
   - Check `auth.current_user_info` to see who you're testing as
   - Use `auth.clear_user()` to reset

### Documentation

- [PostgreSQL RLS Docs](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [RLSify Documentation](./docs/)

## Support

- **Issues**: https://github.com/jspears/rlsify/issues
- **Discussions**: https://github.com/jspears/rlsify/discussions
- **Documentation**: See [DOCKER.md](./DOCKER.md) for detailed guide

## Summary

You now have:
- ✅ PostgreSQL with multi-tenant schema
- ✅ RLSify UI for visual policy building
- ✅ Sample data demonstrating access patterns
- ✅ Auth helpers for testing policies
- ✅ Interactive demo and test scripts

Start building secure, multi-tenant applications with RLS! 🎉

