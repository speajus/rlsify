# Docker Configuration

This directory contains all Docker-related configuration files for RLSify.

## Directory Structure

```
docker/
├── postgres/
│   ├── init/                    # Database initialization scripts
│   │   ├── 01-schema.sql       # Create tables and schema
│   │   ├── 02-seed-data.sql    # Insert sample data
│   │   └── 03-auth-helpers.sql # Auth helper functions
│   └── postgresql.conf          # PostgreSQL configuration
├── ui/
│   ├── Dockerfile              # UI container build instructions
│   └── nginx.conf              # Nginx config for production
├── pgadmin/
│   └── servers.json            # pgAdmin server configuration
└── scripts/
    ├── demo-workflow.sh        # Interactive demo script
    └── test-rls-policies.sql   # RLS policy test suite
```

## PostgreSQL Initialization

The database is automatically initialized with:

1. **Schema** (`01-schema.sql`):
   - Organizations, teams, users tables
   - Projects, documents, resources tables
   - Foreign key relationships
   - Indexes for performance
   - Triggers for updated_at columns

2. **Sample Data** (`02-seed-data.sql`):
   - 3 organizations (Acme, TechStart, Global)
   - 7 users across different organizations
   - 4 teams with various members
   - Multiple projects, documents, and resources

3. **Auth Helpers** (`03-auth-helpers.sql`):
   - `auth.uid()` - Get current user ID
   - `auth.set_user(uuid)` - Set user for testing
   - `auth.clear_user()` - Clear user context
   - `auth.current_user_info` - View current user

## UI Container

The UI container supports two modes:

### Development Mode (default)
- Hot reload enabled
- Source code mounted as volume
- Runs Vite dev server on port 5174

### Production Mode
- Built with Vite
- Served with Nginx
- Optimized for performance

To use production mode, update docker-compose.yml to use the `production` target:

```yaml
ui:
  build:
    target: production
```

## Scripts

### Demo Workflow

Run an interactive demo showing the complete RLSify workflow:

```bash
./docker/scripts/demo-workflow.sh
```

This script:
1. Shows the database schema
2. Displays sample data
3. Creates RLS policies
4. Tests policies with different users
5. Demonstrates team-based access control

### RLS Policy Tests

Run comprehensive RLS policy tests:

```bash
docker-compose exec postgres psql -U rlsify -d rlsify -f /docker-entrypoint-initdb.d/test-rls-policies.sql
```

Or copy to the init directory to run on startup:

```bash
cp docker/scripts/test-rls-policies.sql docker/postgres/init/04-test-policies.sql
```

## Configuration

### PostgreSQL

The `postgresql.conf` file is optimized for:
- Development and testing
- RLS policy evaluation
- Query performance monitoring
- Detailed logging

Key settings:
- `row_security = on` - Enable RLS by default
- `log_min_duration_statement = 1000` - Log slow queries
- `shared_preload_libraries = 'pg_stat_statements'` - Performance monitoring

### Environment Variables

All configuration is done through environment variables in `.env`:

```env
# Database
POSTGRES_DB=rlsify
POSTGRES_USER=rlsify
POSTGRES_PASSWORD=rlsify_dev_password
POSTGRES_PORT=5432

# UI
UI_PORT=5174

# pgAdmin (optional)
PGADMIN_PORT=5050
PGADMIN_EMAIL=admin@rlsify.local
PGADMIN_PASSWORD=admin
```

## Volumes

The Docker Compose setup uses named volumes for persistence:

- `postgres_data` - Database files
- `pgadmin_data` - pgAdmin configuration
- `ui_node_modules` - Node modules cache
- `ui_packages_node_modules` - Package-specific node modules

To reset all data:

```bash
docker-compose down -v
```

## Health Checks

All services include health checks:

- **PostgreSQL**: `pg_isready` check every 10s
- **UI**: HTTP check on port 5174 every 30s
- **pgAdmin**: HTTP check on port 80 every 30s

## Networking

All services run on the `rlsify-network` bridge network, allowing:
- UI to connect to PostgreSQL using hostname `postgres`
- pgAdmin to connect to PostgreSQL using hostname `postgres`
- Host to access services via published ports

## Troubleshooting

### Container won't start

Check logs:
```bash
docker-compose logs -f [service-name]
```

### Database connection issues

Verify PostgreSQL is healthy:
```bash
docker-compose ps postgres
docker-compose exec postgres pg_isready -U rlsify
```

### UI not loading

Check if Vite dev server is running:
```bash
docker-compose logs -f ui
```

Rebuild the container:
```bash
docker-compose build ui
docker-compose up -d ui
```

### Port conflicts

Edit `.env` to use different ports:
```env
POSTGRES_PORT=5433
UI_PORT=5175
PGADMIN_PORT=5051
```

## Development Tips

1. **Live Reload**: Changes to `packages/ui/src` automatically reload the browser
2. **Database Shell**: Quick access with `docker-compose exec postgres psql -U rlsify -d rlsify`
3. **View Logs**: Use `docker-compose logs -f` to monitor all services
4. **Reset Data**: Use `docker-compose down -v` for a fresh start

## Production Deployment

For production deployment:

1. Change the Dockerfile target to `production`
2. Use strong passwords in `.env`
3. Enable SSL/TLS for PostgreSQL
4. Use a reverse proxy (nginx, Traefik) for HTTPS
5. Set up proper backup strategies for volumes
6. Configure resource limits in docker-compose.yml

Example resource limits:

```yaml
services:
  postgres:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

