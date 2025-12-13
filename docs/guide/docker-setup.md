# Docker Setup

The Docker environment provides a complete RLSify setup with PostgreSQL, sample data, and the visual UI.

## Quick Start

```bash
# 1. Setup environment variables
npm run docker:setup

# 2. Start all services
npm run docker:up

# 3. Open the UI
open http://localhost:5174
```

## What's Included

### PostgreSQL 16

- Row-Level Security enabled
- `auth` schema with session management
- `rls` schema with stored procedures
- Sample multi-tenant schema

### Sample Schema

```sql
-- Organizations
organizations (id, name, slug)

-- Users with org membership
users (id, email, name)
organization_members (organization_id, user_id, role)

-- Teams within organizations
teams (id, organization_id, name)
team_members (team_id, user_id, role)

-- Resources
documents (id, team_id, title, created_by)
projects (id, organization_id, team_id, name)
```

### Sample Data

- **3 Organizations**: Acme Corp, TechStart, Global Inc
- **7 Users**: Alice, Bob, Carol (Acme), David, Emma (TechStart), Frank, Grace (Global)
- **4 Teams**: Engineering, Marketing, Product, Operations
- **Sample documents and projects**

## Docker Commands

### Lifecycle

```bash
# Start services
npm run docker:up

# Start with pgAdmin
npm run docker:up:tools

# Stop services
npm run docker:down

# View logs
npm run docker:logs

# Check status
npm run docker:status
```

### Database Access

```bash
# Open psql shell
npm run docker:db:shell

# Run test script
npm run docker:db:test
```

### Reset & Clean

```bash
# Remove containers (keep data)
npm run docker:clean

# Full reset (delete all data)
npm run docker:reset

# Rebuild UI container
npm run docker:rebuild
```

## Testing RLS Policies

### Using the Auth Helper

```sql
-- Set current user
SELECT auth.set_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Query with RLS
SELECT * FROM documents;

-- Check current user
SELECT auth.uid();
```

### Interactive Demo

```bash
npm run docker:demo
```

This runs an interactive script that:
1. Creates sample RLS policies
2. Tests access as different users
3. Shows how policies filter data

## Environment Variables

The `.env` file controls the Docker setup:

```bash
# PostgreSQL
POSTGRES_USER=rlsify
POSTGRES_PASSWORD=rlsify
POSTGRES_DB=rlsify
POSTGRES_PORT=5432

# UI
UI_PORT=5174

# pgAdmin (optional)
PGADMIN_EMAIL=admin@rlsify.dev
PGADMIN_PASSWORD=admin
PGADMIN_PORT=5050
```

## Ports

| Service | Port | URL |
|---------|------|-----|
| PostgreSQL | 5432 | `localhost:5432` |
| RLSify UI | 5174 | `http://localhost:5174` |
| pgAdmin | 5050 | `http://localhost:5050` |

## Troubleshooting

### Port Already in Use

```bash
# Check what's using the port
lsof -i :5432

# Use different ports in .env
POSTGRES_PORT=5433
UI_PORT=5175
```

### Container Won't Start

```bash
# View logs
docker-compose logs postgres

# Full reset
npm run docker:reset
npm run docker:up
```

### Permission Denied

```bash
# Fix Docker socket permissions
sudo chmod 666 /var/run/docker.sock
```

## Next Steps

- [Row-Level Security](/guide/row-level-security) - Understand RLS concepts
- [Expression Language](/guide/expression-language) - Learn the JSON syntax
- [Testing Policies](/guide/testing-policies) - Write automated tests

