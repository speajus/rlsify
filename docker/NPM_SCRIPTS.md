# NPM Scripts for Docker

All Docker commands are available as npm scripts in `package.json`. This provides a consistent interface across different platforms and eliminates the need for Make.

## 📋 Complete Script Reference

### Setup

#### `npm run docker:setup`
Copy `.env.example` to `.env` if it doesn't exist.

```bash
npm run docker:setup
```

**What it does:**
- Checks if `.env` exists
- If not, copies `.env.example` to `.env`
- Shows success or warning message

**When to use:**
- First time setup
- After cloning the repository

---

### Service Management

#### `npm run docker:up`
Start all services (PostgreSQL + UI).

```bash
npm run docker:up
```

**What it does:**
- Starts PostgreSQL container
- Starts UI container
- Shows access URLs

**Output:**
```
✅ RLSify is running!
🌐 UI: http://localhost:5174
🗄️  PostgreSQL: localhost:5432
```

---

#### `npm run docker:up:tools`
Start all services including pgAdmin.

```bash
npm run docker:up:tools
```

**What it does:**
- Starts PostgreSQL container
- Starts UI container
- Starts pgAdmin container
- Shows access URLs

**Output:**
```
✅ RLSify is running with tools!
🌐 UI: http://localhost:5174
🗄️  PostgreSQL: localhost:5432
🔧 pgAdmin: http://localhost:5050
```

---

#### `npm run docker:down`
Stop all services.

```bash
npm run docker:down
```

**What it does:**
- Stops all running containers
- Removes containers
- Preserves volumes (data is kept)

---

#### `npm run docker:restart`
Restart all services.

```bash
npm run docker:restart
```

**What it does:**
- Restarts all running containers
- Useful after configuration changes

---

#### `npm run docker:status`
Show status of all services.

```bash
npm run docker:status
```

**What it does:**
- Shows which containers are running
- Displays container health status
- Shows port mappings

---

#### `npm run docker:clean`
Remove containers but keep data.

```bash
npm run docker:clean
```

**What it does:**
- Stops all containers
- Removes containers
- Preserves volumes (database data is kept)

**Output:**
```
✅ Containers removed (data preserved)
```

---

#### `npm run docker:reset`
Complete reset - remove containers and volumes.

```bash
npm run docker:reset
```

**What it does:**
- Stops all containers
- Removes containers
- Removes volumes (database data is deleted)

**Output:**
```
✅ Containers and volumes removed (fresh start)
Run npm run docker:up to start fresh
```

**⚠️ Warning:** This deletes all database data!

---

#### `npm run docker:rebuild`
Rebuild and restart UI container.

```bash
npm run docker:rebuild
```

**What it does:**
- Rebuilds UI Docker image
- Restarts UI container
- Useful after Dockerfile changes

**Output:**
```
✅ UI container rebuilt and restarted
```

---

### Database

#### `npm run docker:db:shell`
Open PostgreSQL interactive shell.

```bash
npm run docker:db:shell
```

**What it does:**
- Opens `psql` connected to the rlsify database
- Allows running SQL commands interactively

**Example usage:**
```sql
-- List tables
\dt

-- Query data
SELECT * FROM organizations;

-- Exit
\q
```

---

#### `npm run docker:db:test`
Run RLS policy test suite.

```bash
npm run docker:db:test
```

**What it does:**
- Runs the test suite from `docker/scripts/test-rls-policies.sql`
- Tests 4 different RLS policy patterns
- Shows results for each test case

---

### Logs

#### `npm run docker:logs`
View logs from all services (follows).

```bash
npm run docker:logs
```

**What it does:**
- Shows logs from all containers
- Follows logs in real-time
- Press Ctrl+C to exit

---

#### `npm run docker:ui:logs`
View UI logs only (follows).

```bash
npm run docker:ui:logs
```

**What it does:**
- Shows logs from UI container only
- Follows logs in real-time
- Useful for debugging UI issues

---

#### `npm run docker:postgres:logs`
View PostgreSQL logs only (follows).

```bash
npm run docker:postgres:logs
```

**What it does:**
- Shows logs from PostgreSQL container only
- Follows logs in real-time
- Useful for debugging database issues

---

### Scripts

#### `npm run docker:demo`
Run interactive demo workflow.

```bash
npm run docker:demo
```

**What it does:**
- Runs `docker/scripts/demo-workflow.sh`
- Shows database schema
- Creates example RLS policies
- Tests policies with different users
- Demonstrates team-based access

---

#### `npm run docker:validate`
Validate Docker setup.

```bash
npm run docker:validate
```

**What it does:**
- Runs `docker/scripts/validate-setup.sh`
- Checks all required files exist
- Verifies directory structure
- Shows setup status

---

## 🔄 Common Workflows

### First Time Setup
```bash
npm run docker:setup
npm run docker:up
npm run docker:demo
```

### Daily Development
```bash
npm run docker:up
npm run docker:logs
```

### Debugging Issues
```bash
npm run docker:status
npm run docker:ui:logs
npm run docker:postgres:logs
```

### Fresh Start
```bash
npm run docker:reset
npm run docker:up
```

### Testing RLS Policies
```bash
npm run docker:db:shell
# Run SQL commands
npm run docker:db:test
```

## 🆚 NPM Scripts vs Docker Compose

| Task | NPM Script | Docker Compose |
|------|-----------|----------------|
| Start services | `npm run docker:up` | `docker-compose up -d` |
| Stop services | `npm run docker:down` | `docker-compose down` |
| View logs | `npm run docker:logs` | `docker-compose logs -f` |
| Database shell | `npm run docker:db:shell` | `docker-compose exec postgres psql -U rlsify -d rlsify` |
| Check status | `npm run docker:status` | `docker-compose ps` |

**Benefits of NPM scripts:**
- ✅ Shorter commands
- ✅ Consistent interface
- ✅ Cross-platform compatibility
- ✅ Helpful output messages
- ✅ No need to remember Docker Compose syntax

## 📚 See Also

- [DOCKER.md](../DOCKER.md) - Complete Docker guide
- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - Quick command reference
- [GETTING_STARTED_DOCKER.md](../GETTING_STARTED_DOCKER.md) - Getting started guide

