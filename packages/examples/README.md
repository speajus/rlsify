# @speajus/rlsify-examples

General usage examples demonstrating the core rlsify library.

## Examples

### Basic Example
Simple user-owned resource policies.

```bash
pnpm basic
```

Demonstrates:
- Creating a basic policy configuration
- Generating SQL for CRUD operations
- User ownership patterns with `auth.uid()`

### Template Example
Using pre-built policy templates.

```bash
pnpm templates
```

Demonstrates:
- Listing available templates
- Applying templates with variables
- User-owned and organization-based patterns

### Join Example
Policies with table joins and foreign key auto-detection.

```bash
pnpm joins
```

Demonstrates:
- Defining joins between tables
- Automatic foreign key detection
- Complex policies spanning multiple tables

### Migration Example
Generating migration files for version control.

```bash
pnpm migration
```

Demonstrates:
- Creating up/down migrations
- Migration file format
- Writing migrations to disk

## Running Examples

```bash
# Install dependencies
pnpm install

# Run specific example
pnpm basic
pnpm templates
pnpm joins
pnpm migration
```

## License

MIT

