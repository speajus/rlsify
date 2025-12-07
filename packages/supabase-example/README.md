# @speajus/rlsify-supabase-example

Supabase-specific examples for rlsify.

## Setup

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Fill in your Supabase credentials:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here
```

## Examples

### Basic Supabase
Simple policies using Supabase auth helpers.

```bash
pnpm basic
```

### Auth with JWT Claims
Multi-tenant policies using JWT claims.

```bash
pnpm auth
```

### Migration Generation
Generate Supabase-compatible migration files.

```bash
pnpm migration
```

### Apply Policies
Apply policies directly to your Supabase database.

```bash
pnpm apply
```

**Note:** The apply example requires a custom `exec_sql` function in your database. See the main Supabase package README for setup instructions.

## License

MIT

