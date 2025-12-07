# ADR 001: Project Architecture and Monorepo Structure

**Status:** Proposed
**Date:** 2025-11-24
**Deciders:** Project Team
**Context:** Initial architecture decisions for rlsify

## Context and Problem Statement

We are building **rlsify**, a TypeScript-based toolset that simplifies the creation and management of PostgreSQL Row-Level Security (RLS) policies. The project needs to support multiple use cases:

- Core library for defining and generating RLS policies
- Integration with Supabase
- Web-based UI for visual policy creation
- Example implementations for developers
- Potential future desktop application

We need to make foundational decisions about project structure, tooling, and technical approaches that will enable rapid development while maintaining flexibility and extensibility.

## Decision Drivers

- **Developer Experience**: Easy to use API for defining RLS policies
- **Maintainability**: Clear separation of concerns across packages
- **Extensibility**: Support for multiple database platforms and UI frameworks
- **Type Safety**: Leverage TypeScript for compile-time guarantees
- **Integration**: Seamless integration with Supabase and other PostgreSQL platforms
- **Flexibility**: Support both programmatic and visual policy creation

## Considered Options

### 1. Monorepo Tooling

**Decision:** Use **pnpm workspaces** for monorepo management

**Rationale:**
- Fast, efficient disk space usage through content-addressable storage
- Strict dependency resolution prevents phantom dependencies
- Built-in workspace protocol support
- Excellent TypeScript monorepo support
- Growing adoption in the ecosystem

**Alternatives Considered:**
- npm workspaces: Less efficient, slower
- Yarn workspaces: Good but pnpm offers better performance
- Turborepo/Nx: Overkill for initial project scope, can add later if needed

**Package Structure:**
```
packages/
  ├── core/                 # @speajus/rlsify-core
  ├── supabase/            # @speajus/rlsify-supabase
  ├── ui/                  # @speajus/rlsify-ui
  ├── examples/            # @speajus/rlsify-examples (not published)
  └── supabase-example/    # @speajus/rlsify-supabase-example (not published)
```

### 2. Dependency Injection Framework Usage

**Decision:** Use **@speajus/Diblob selectively** in core and supabase packages

**Rationale:**
- **Core package**: YES - Benefits from DI for extensibility
  - Policy generators can be swapped/extended
  - Schema parsers can be pluggable
  - Testing becomes easier with mock injection

- **UI package**: NO - Svelte has its own reactivity and component model
  - Svelte stores and context API are sufficient
  - Adding DI would complicate the component architecture
  - Make the svelte component easy to embed if necessary.  
- **Supabase package**: YES - Adapter pattern benefits from DI
  - Different Supabase client versions can be injected
  - Configuration providers can be swapped
  - Testing with mock Supabase clients

**Trade-offs:**
- Adds learning curve for contributors unfamiliar with DI
- Provides clear architectural boundaries and testability
- Enables plugin-based extensibility for future features

### 3. Schema Definition and Query Configuration

**Decision:** Store policy configurations as **JSON files in PostgreSQL** via custom functions

**Approach:**
1. Users define RLS policy configurations in JSON format
2. Configurations are stored in a dedicated PostgreSQL table (e.g., `rls_policy_configs`)
3. A PostgreSQL function loads and validates these configurations
4. The core library reads configurations via the function and generates policies

**Schema:**
```sql
CREATE TABLE rls_policy_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE FUNCTION load_rls_config(config_name TEXT)
RETURNS JSONB AS $$
  SELECT config FROM rls_policy_configs WHERE name = config_name;
$$ LANGUAGE SQL STABLE;
```

**Benefits:**
- Configuration lives alongside the database schema
- Version control through database migrations
- Can be modified without application redeployment
- Accessible to both backend and UI applications
- Supports database-driven configuration management

**Alternatives Considered:**
- File-based JSON configs: Requires deployment for changes
- Code-based TypeScript configs: Less flexible, requires compilation
- Environment variables: Not suitable for complex configurations


### 4. RLS Policy Generation from JSON Configurations

**Decision:** Core module generates SQL DDL statements from JSON configurations

**Architecture:**
```typescript
// Configuration format (stored in DB)
interface RLSPolicyConfig {
  table: string;
  policies: Array<{
    name: string;
    command: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
    using?: string;  // SQL expression for USING clause
    withCheck?: string;  // SQL expression for WITH CHECK clause
    roles?: string[];  // Optional role restrictions
  }>;
}

// Core generator interface
interface PolicyGenerator {
  generate(config: RLSPolicyConfig): string[];  // Returns SQL statements
  validate(config: RLSPolicyConfig): ValidationResult;
}
```

**Generation Flow:**
1. Load JSON config from PostgreSQL via `load_rls_config()`
2. Parse and validate configuration structure
3. Generate SQL DDL statements (CREATE POLICY, ALTER TABLE, etc.)
4. Return SQL for execution or inspection

**Output Options:**
- SQL string array for manual execution
- Direct database application via connection
- Migration file generation for version control

**Benefits:**
- Clear separation between configuration and generation
- SQL output can be reviewed before application
- Supports both automated and manual workflows
- Easy to test and validate

### 5. Supabase Integration Strategy

**Decision:** Create dedicated **@speajus/rlsify-supabase** adapter package

**Integration Points:**
1. **Supabase Client Integration**: Use Supabase client for database operations
2. **Auth Context Awareness**: Leverage Supabase auth for policy expressions
3. **Type Generation**: Integrate with Supabase CLI type generation
4. **Migration Support**: Generate Supabase-compatible migration files

**Adapter Responsibilities:**
```typescript
// Supabase-specific helpers
interface SupabaseRLSAdapter {
  // Generate policies using Supabase auth helpers
  generateAuthPolicies(config: AuthPolicyConfig): string[];

  // Apply policies using Supabase client
  applyPolicies(policies: string[]): Promise<void>;

  // Generate migration files
  createMigration(name: string, policies: string[]): MigrationFile;

  // Validate against Supabase schema
  validateSchema(config: RLSPolicyConfig): Promise<ValidationResult>;
}
```

**Supabase-Specific Features:**
- Pre-built policy templates for common auth patterns
- Integration with `auth.uid()` and `auth.jwt()` functions
- Support for Supabase's RLS helper functions
- Migration file generation in Supabase format

**Benefits:**
- Clean separation between generic PostgreSQL and Supabase-specific code
- Users can choose generic or Supabase-optimized approach
- Easier to maintain and test platform-specific features

### 6. Svelte UI and Core Library Interaction

**Decision:** UI interacts with core library through **JSON configuration files**

**Architecture:**
- UI provides visual editor for creating/editing RLS policy configurations
- Configurations are serialized to JSON format
- JSON can be saved to PostgreSQL or exported as files
- Core library consumes JSON to generate SQL policies

**UI Workflow:**
1. User designs policies visually in Svelte UI
2. UI generates JSON configuration in real-time
3. User can preview generated SQL policies
4. Configuration saved to PostgreSQL or exported
5. Core library reads configuration and applies policies
6. User can join tables together, it should by default use the foreign key mappings in the database if defined. Otherwise it should ask the user to define the join. It would be great to use simple transforms like maps to `user_id = user.id `

**Communication Layer:**
```typescript
// Shared types package for UI and core
interface UIBridge {
  // UI -> Core: Generate preview
  previewPolicies(config: RLSPolicyConfig): Promise<string[]>;

  // UI -> DB: Save configuration
  saveConfig(config: RLSPolicyConfig): Promise<void>;

  // DB -> UI: Load configuration
  loadConfig(name: string): Promise<RLSPolicyConfig>;

  // Core -> UI: Validation feedback
  validateConfig(config: RLSPolicyConfig): ValidationResult;
}
```

**UI Features:**
- Visual table/column selector
- Expression builder for USING/WITH CHECK clauses
- Role selector
- Live SQL preview
- Configuration import/export
- Template library for common patterns

**Benefits:**
- Decoupled architecture allows independent development
- JSON serves as contract between UI and core
- UI can work offline with local JSON files
- Easy to add alternative UIs (CLI, desktop app, etc.)

### 7. Package Naming and Versioning Strategy

**Decision:** Use **@speajus/** scope with unified versioning

**Package Names:**
- `@speajus/rlsify-core` - Core policy generation library
- `@speajus/rlsify-supabase` - Supabase adapter
- `@speajus/rlsify-ui` - Svelte web UI
- `@speajus/rlsify-types` - Shared TypeScript types
- `@speajus/rlsify-examples` - Examples (not published to npm)
- `@speajus/rlsify-supabase-example` - Supabase examples (not published)

**Versioning Strategy:**
- **Unified versioning**: All packages share the same version number
- Start at `0.1.0` for initial development
- Increment together even if individual packages haven't changed
- Simplifies dependency management and communication

**Benefits:**
- Clear package ownership under @speajus scope
- Consistent naming pattern (rlsify-*)
- Simplified version management
- Users know all packages are compatible

**Alternatives Considered:**
- Independent versioning: More complex, harder to manage compatibility
- No scope: Risk of name conflicts
- Different naming pattern: Less consistent

### 8. Build Tooling and TypeScript Configuration

**Decision:** Use **tsup** for building with shared TypeScript configurations

**Build Tool: tsup**
- Fast, zero-config bundler built on esbuild
- Excellent TypeScript support
- Generates both ESM and CJS outputs
- Built-in declaration file generation
- Minimal configuration required

**Shared Configuration Strategy:**
```
tsconfig.base.json          # Base config for all packages
packages/
  ├── core/
  │   └── tsconfig.json     # Extends base, package-specific overrides
  ├── supabase/
  │   └── tsconfig.json
  └── ui/
      └── tsconfig.json     # Extends base, adds Svelte support
```

**Base TypeScript Configuration:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

**Package-Specific Build Configs:**
- Core/Supabase: Dual ESM/CJS output
- UI: Vite for Svelte compilation
- Types: Declaration files only

**Benefits:**
- Fast builds with esbuild
- Consistent TypeScript settings across packages
- Easy to override per-package when needed
- Modern module system support

## Consequences

### Positive

1. **Clear Architecture**: Monorepo structure provides clear separation of concerns
2. **Type Safety**: Shared types package ensures consistency across UI and core
3. **Flexibility**: JSON-based configuration supports multiple workflows
4. **Extensibility**: DI framework enables plugin architecture
5. **Developer Experience**: Modern tooling (pnpm, tsup) provides fast builds
6. **Platform Support**: Dedicated Supabase package enables optimized integration
7. **Maintainability**: Unified versioning simplifies dependency management

### Negative

1. **Learning Curve**: DI framework adds complexity for contributors
2. **Database Dependency**: Storing configs in PostgreSQL requires database access
3. **Monorepo Overhead**: More complex CI/CD and release processes
4. **Abstraction Cost**: Multiple layers between user input and SQL output

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| DI framework complexity | Comprehensive documentation and examples |
| JSON schema evolution | Versioned schema with migration support |
| PostgreSQL version compatibility | Test against multiple PostgreSQL versions |
| Supabase API changes | Pin Supabase client versions, adapter pattern |
| UI/Core coupling | Strict JSON contract, integration tests |

## Open Questions

The following questions need to be answered before implementation:

### 1. PostgreSQL and Supabase Compatibility
- What PostgreSQL versions should we support? 15+
- What Supabase features/versions are required? v2
- Should we support vanilla PostgreSQL and Supabase equally? Yes, but Supabase will be the main focus.

### 2. Policy Definition API Style
- **Fluent/Builder Pattern**: `policy.for('users').select().where('id = auth.uid()')`
- **Declarative Objects**: JSON/TypeScript object configuration
- **Hybrid Approach**: Support multiple styles

### 3. Policy Application Strategy
- Create a function to apply policies
- Create a function to generate migrations
- Create a function to generate SQL
- insert a load function in the core that can be used to read the config from the database and generate the policies.
- have a version so that we can migrate the config if needed.

### 4. Authentication and Authorization Patterns
- What auth patterns should we prioritize?
  - User owns resource (e.g., `user_id = auth.uid()`)
  - Role-based access (e.g., `auth.role() = 'admin'`)
  - Organization/tenant isolation
  - Custom JWT claims
- Should we provide pre-built templates for common patterns?
  - Yes.
  - The templates should cover created_by, updated_by, organization_id, tenant_id, role.

### 5. UI Capabilities
- Visual query builder with drag-and-drop?
  - No.  It may support a graph editor like [svelte-flow](https://svelteflow.dev/) 
- Should UI support testing policies against sample data?
  - Yes.  
- Real-time collaboration features?
  - No.

### 6. Specific RLS Policy Patterns
- What use cases should we prioritize?
  - Multi-tenant SaaS applications
  - User-owned resources
  - Team/organization-based access
  - Public/private content
  - Hierarchical permissions
- Should we build a template library?
  - Yes.

### 7. Testing and Validation
- How should users test policies before applying?
  - The UI should have a way to test policies against sample data.
  - The UI should have a way to test policies against sample data.
- Should we provide a policy simulator?
 - Yes.  The simulator should be able to read the config and generate a policy.  The policy simulator should be able to be used in the UI and in the CLI.
- Integration with existing test frameworks?
- Yes, it should be able to be used in jest and other testing frameworks.

### 8. Future Desktop Application
- Should we plan for Electron now or defer?
  - defer for now.
- Would it share the same Svelte UI codebase?
  - yes, it would be embedded in the desktop application.
- What additional features would desktop app provide?
  - None, the UI would be the same.  The desktop application would just be a way to package the UI for easy use.

## Next Steps

1. **Create initial monorepo structure** with pnpm workspaces
2. **Set up shared TypeScript and build configurations**
3. **Implement core package** with basic policy generation
4. **Create example configurations** to validate approach
5. **Develop Supabase adapter** with auth integration
6. **Build UI prototype** for visual policy creation
7. **Write comprehensive documentation** and examples

## References

- [PostgreSQL Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [tsup Documentation](https://tsup.egoist.dev/)
- [@speajus/Diblob](https://github.com/speajus/diblob) (assumed repository)

---

**Document History:**
- 2025-11-24: Initial ADR created
