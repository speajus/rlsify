# @speajus/rlsify-ui

Svelte-based web UI for creating PostgreSQL Row-Level Security policies visually.

## Features

- 🗄️ **Schema Loading**: Load database schema from PostgreSQL or use mock data for demos
- 🔗 **Join Editor**: Define table joins with automatic foreign key detection
- 📝 **Visual Policy Editor**: Create and edit RLS policies through a user-friendly interface
- 👁️ **Live SQL Preview**: See generated SQL in real-time as you build policies
- 💾 **Import/Export**: Save and load policy configurations as JSON
- ✅ **Validation**: Real-time validation with helpful error messages
- 🎨 **Modern UI**: Built with Svelte 5 and Vite

### Schema Loading
- Load database schema from PostgreSQL connection string
- Mock data mode for testing and demos
- Visual display of tables, columns, data types, and constraints
- Foreign key relationship detection

### Join Editor with Auto-Detection
- **Automatic foreign key detection** - when you select a table to join, the UI automatically detects foreign key relationships and pre-fills the join condition
- Support for INNER, LEFT, and RIGHT joins
- Simple join syntax: `user_id = users.id`
- Visual indicators showing which tables have foreign key relationships
- Prevents duplicate joins and circular references

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Usage

### Step-by-Step Guide

1. **Load Schema**
   - Toggle "Use mock data" for demo mode, or
   - Enter your PostgreSQL connection string
   - Click "Load Schema"
   - View tables, columns, and foreign key relationships

2. **Define Base Table**
   - Enter the table name for your RLS policies
   - This is the main table your policies will protect

3. **Add Joins** (Optional)
   - Click "Add Join" to join additional tables
   - Select the table to join from the dropdown
   - The UI will automatically detect foreign keys and pre-fill the join condition
   - Tables with foreign keys are marked with "(has FK)"
   - Modify the join condition if needed
   - Add multiple joins to create complex policies

4. **Create Policies**
   - Click "Add Policy" to create a new policy
   - Define the policy name, command (SELECT/INSERT/UPDATE/DELETE)
   - Write USING and WITH CHECK expressions
   - Reference joined tables in your expressions

5. **Preview SQL**
   - Click "Show SQL Preview" to see generated SQL
   - Review the complete DDL statements
   - Export configuration as JSON for version control

## Integration

The UI can be:
- Deployed as a standalone web application
- Embedded in other applications
- Packaged as an Electron desktop app (future)

## License

MIT

