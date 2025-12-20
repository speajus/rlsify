
export * from './gen/rlsify/v1/schema_pb.js';
export * from './gen/rlsify/v1/policy_pb.js';
export * from './gen/rlsify/v1/health_pb.js';
/**
 * Core types for rlsify - PostgreSQL Row-Level Security policy generation
 */

// ============================================================================
// Policy Configuration Types
// ============================================================================

/**
 * SQL command types for RLS policies
 */
export type PolicyCommand = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';

// ============================================================================
// Permission Expression Types (JSON-based, Hasura-inspired)
// ============================================================================

/**
 * Comparison operators for permission expressions
 */
export type ComparisonOperator =
  | '_eq'      // Equal
  | '_neq'     // Not equal
  | '_gt'      // Greater than
  | '_gte'     // Greater than or equal
  | '_lt'      // Less than
  | '_lte'     // Less than or equal
  | '_in'      // In array
  | '_nin'     // Not in array
  | '_like'    // SQL LIKE
  | '_ilike'   // SQL ILIKE (case-insensitive)
  | '_nlike'   // SQL NOT LIKE
  | '_nilike'  // SQL NOT ILIKE
  | '_is_null' // IS NULL
  | '_similar' // SQL SIMILAR TO
  | '_nsimilar'; // SQL NOT SIMILAR TO

/**
 * Logical operators for combining expressions
 */
export type LogicalOperator = '_and' | '_or' | '_not';

/**
 * Session variable reference (e.g., "auth.uid()", "current_user", "jwt.claim.org_id")
 */
export interface SessionVariable {
  /** The session variable name/function */
  var: string;

  /** Optional type hint for validation */
  type?: 'uuid' | 'text' | 'integer' | 'boolean' | 'jsonb';
}

/**
 * Column reference in permission expression
 */
export interface ColumnReference {
  /** Column name, optionally with table prefix (e.g., "user_id" or "posts.user_id") */
  column: string;
}

/**
 * Value in permission expression (can be literal, session variable, or column reference)
 */
export type PermissionValue =
  | string
  | number
  | boolean
  | null
  | SessionVariable
  | ColumnReference
  | PermissionValue[];

/**
 * Comparison expression
 */
export type ComparisonExpression = {
  [K in ComparisonOperator]?: PermissionValue;
};

/**
 * Field expression (column with comparison)
 */
export interface FieldExpression {
  [fieldName: string]: ComparisonExpression | PermissionExpression;
}

/**
 * Exists expression for checking related/unrelated tables
 */
export interface ExistsExpression {
  _exists: {
    /** Table to check */
    _table: string | { schema: string; name: string };

    /** Where condition */
    _where: PermissionExpression;
  };
}

/**
 * Permission expression (recursive boolean expression)
 */
export type PermissionExpression =
  | FieldExpression
  | { _and: PermissionExpression[] }
  | { _or: PermissionExpression[] }
  | { _not: PermissionExpression }
  | ExistsExpression;

// ============================================================================
// Foreign Key Navigation Types (for Visual Query Builder)
// ============================================================================

/**
 * A single step in a foreign key relationship path.
 * Represents navigating from one table to another via a specific FK column.
 */
export interface FKNavigationStep {
  /** The source table name */
  fromTable: string;
  /** The FK column in the source table */
  fromColumn: string;
  /** The target table name */
  toTable: string;
  /** The target column (usually the PK) */
  toColumn: string;
}

/**
 * Complete path through FK relationships from base table to a column.
 * Used by the Visual Query Builder for cross-table column references.
 *
 * Example: For orders → users → organizations.name:
 * {
 *   baseTable: 'orders',
 *   steps: [
 *     { fromTable: 'orders', fromColumn: 'user_id', toTable: 'users', toColumn: 'id' },
 *     { fromTable: 'users', fromColumn: 'org_id', toTable: 'organizations', toColumn: 'id' }
 *   ],
 *   column: 'name'
 * }
 */
export interface ColumnPath {
  /** The starting table (policy's base table) */
  baseTable: string;
  /** FK navigation steps to reach the target table */
  steps: FKNavigationStep[];
  /** The column name in the final table */
  column: string;
}

/**
 * Generates an _exists expression from a column path.
 * Multi-level paths result in nested _exists expressions.
 */
export function buildExistsFromPath(
  path: ColumnPath,
  operator: string,
  value: PermissionValue
): PermissionExpression {
  if (path.steps.length === 0) {
    // No FK navigation - just a direct column reference
    return { [path.column]: { [operator]: value } } as PermissionExpression;
  }

  // Build nested _exists from inside out
  // Start with the innermost condition
  let innerExpr: PermissionExpression = { [path.column]: { [operator]: value } } as PermissionExpression;

  // Work backwards through the steps
  for (const step of [...path.steps].reverse()) {
    // Link condition: join the tables via FK
    const linkCondition: PermissionExpression = {
      [step.toColumn]: { _eq: { column: `${step.fromTable}.${step.fromColumn}` } }
    } as PermissionExpression;

    // Combine link with inner expression
    innerExpr = {
      _exists: {
        _table: step.toTable,
        _where: { _and: [linkCondition, innerExpr] }
      }
    };
  }

  return innerExpr;
}

/**
 * Individual RLS policy definition
 */
export interface PolicyDefinition {
  /** Unique name for the policy */
  name: string;

  /** SQL command(s) this policy applies to - can be single or multiple */
  command: PolicyCommand | PolicyCommand[];

  /** SQL expression for USING clause (for SELECT, UPDATE, DELETE) - legacy string format */
  using?: string;

  /** SQL expression for WITH CHECK clause (for INSERT, UPDATE) - legacy string format */
  withCheck?: string;

  /** JSON-based permission expression for USING clause (preferred over string) */
  usingExpression?: PermissionExpression;

  /** JSON-based permission expression for WITH CHECK clause (preferred over string) */
  withCheckExpression?: PermissionExpression;

  /** Optional roles this policy applies to (defaults to PUBLIC) */
  roles?: string[];

  /** Whether this policy is permissive (default) or restrictive */
  permissive?: boolean;
}

/**
 * Foreign key relationship definition
 */
export interface ForeignKeyRelation {
  /** Source table name */
  sourceTable: string;

  /** Source column name */
  sourceColumn: string;

  /** Target table name */
  targetTable: string;

  /** Target column name */
  targetColumn: string;

  /** Optional constraint name */
  constraintName?: string;
}

/**
 * Join definition for multi-table policies
 */
export interface JoinDefinition {
  /** Table to join */
  table: string;

  /** Join type (INNER, LEFT, RIGHT, FULL) */
  type?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';

  /**
   * Join condition. If not provided, will attempt to use foreign key relationships.
   * Can use simple transform syntax like "user_id = user.id"
   */
  on?: string;

  /** Alias for the joined table */
  alias?: string;
}

/**
 * Complete RLS policy configuration for a table
 */
export interface RLSPolicyConfig {
  /** Schema version for migration support */
  version: string;

  /** Target table name */
  table: string;

  /** Optional schema name (defaults to 'public') */
  schema?: string;

  /** Array of policy definitions */
  policies: PolicyDefinition[];

  /** Optional joins for multi-table policies */
  joins?: JoinDefinition[];

  /** Whether to enable RLS on the table (default: true) */
  enableRLS?: boolean;

  /** Whether to force RLS for table owner (default: false) */
  forceRLS?: boolean;

  /** Metadata for tracking */
  metadata?: {
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    description?: string;
  };
}

// ============================================================================
// Schema Introspection Types
// ============================================================================

/**
 * Database column information
 */
export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
}

/**
 * Database table information
 */
export interface TableInfo {
  schema: string;
  name: string;
  columns: ColumnInfo[];
  foreignKeys: ForeignKeyRelation[];
  primaryKeys: string[];
}

/**
 * Database schema information
 */
export interface SchemaInfo {
  tables: TableInfo[];
  foreignKeys: ForeignKeyRelation[];
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: ValidationError[];
}

// ============================================================================
// Generation Types


// ============================================================================
// Template Types
// ============================================================================

/**
 * Common RLS policy template types
 */
export type TemplateType =
  | 'user-owned'           // Resources owned by user (created_by = auth.uid())
  | 'role-based'           // Role-based access (auth.role() = 'admin')
  | 'organization'         // Organization/tenant isolation
  | 'team-based'           // Team-based access
  | 'public-private'       // Public/private content
  | 'hierarchical'         // Hierarchical permissions
  | 'time-based';          // Time-based access (subscriptions, etc.)

/**
 * Template variable for customization
 */
export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'column' | 'table';
  description: string;
  defaultValue?: string | number | boolean;
  required?: boolean;
}

/**
 * RLS policy template
 */
export interface PolicyTemplate {
  /** Template identifier */
  id: string;

  /** Template type */
  type: TemplateType;

  /** Human-readable name */
  name: string;

  /** Description of what this template does */
  description: string;

  /** Variables that can be customized */
  variables: TemplateVariable[];

  /** Template configuration (with variable placeholders) */
  config: Omit<RLSPolicyConfig, 'version' | 'metadata'>;

  /** Example usage */
  example?: string;
}

// ============================================================================
// Migration Types
// ============================================================================

/**
 * Migration file format
 */
export interface MigrationFile {
  /** Migration name */
  name: string;

  /** Timestamp */
  timestamp: string;

  /** Up migration SQL */
  up: string;

  /** Down migration SQL */
  down: string;

  /** Optional description */
  description?: string;
}

// ============================================================================
// UI Bridge Types
// ============================================================================

/**
 * Bridge interface between UI and core library
 */
export interface UIBridge {
  /** Generate SQL preview from configuration */
  previewPolicies(config: RLSPolicyConfig): Promise<GeneratedSQL[]>;

  /** Save configuration to database */
  saveConfig(config: RLSPolicyConfig): Promise<void>;

  /** Load configuration from database */
  loadConfig(name: string): Promise<RLSPolicyConfig>;

  /** Validate configuration */
  validateConfig(config: RLSPolicyConfig): Promise<ValidationResult>;

  /** Get schema information for introspection */
  getSchemaInfo(schema?: string): Promise<SchemaInfo>;

  /** Get foreign key relationships for a table */
  getForeignKeys(table: string, schema?: string): Promise<ForeignKeyRelation[]>;

  /** Test policy against sample data */
  testPolicy(config: RLSPolicyConfig, testData: TestScenario): Promise<TestResult>;
}

/**
 * Test scenario for policy simulation
 */
export interface TestScenario {
  /** User context for testing */
  user: {
    id?: string;
    role?: string;
    claims?: Record<string, unknown>;
  };

  /** Operation being tested */
  operation: PolicyCommand;

  /** Sample data to test against */
  data: Record<string, unknown>;

  /** Expected result */
  expected: 'allow' | 'deny';
}

/**
 * Test result
 */
export interface TestResult {
  /** Whether test passed */
  passed: boolean;

  /** Actual result */
  actual: 'allow' | 'deny';

  /** Expected result */
  expected: 'allow' | 'deny';

  /** SQL that was evaluated */
  sql: string;

  /** Error message if test failed */
  error?: string;
}

// ============================================================================
// Supabase-Specific Types
// ============================================================================

/**
 * Supabase auth context
 */
export interface SupabaseAuthContext {
  /** User ID from auth.uid() */
  uid?: string;

  /** User role from auth.role() */
  role?: string;

  /** JWT claims from auth.jwt() */
  jwt?: Record<string, unknown>;
}

/**
 * Supabase-specific policy configuration
 */
export interface SupabasePolicyConfig extends RLSPolicyConfig {
  /** Use Supabase auth helpers */
  useAuthHelpers?: boolean;

  /** Supabase-specific metadata */
  supabase?: {
    /** Project reference */
    projectRef?: string;

    /** Whether to use Supabase realtime */
    realtime?: boolean;
  };
}

// ============================================================================

/**
 * Generated SQL statement
 */
export interface GeneratedSQL {
  /** The SQL statement */
  sql: string;

  /** Type of statement */
  type: 'CREATE_POLICY' | 'ALTER_TABLE' | 'DROP_POLICY' | 'ENABLE_RLS' | 'DISABLE_RLS';

  /** Optional description */
  description?: string;
}

/**
 * Policy generation result
 */
export interface PolicyGenerationResult {
  /** Generated SQL statements */
  statements: GeneratedSQL[];

  /** Validation result */
  validation: ValidationResult;

  /** Configuration that was used */
  config: RLSPolicyConfig;
}

// ============================================================================
// gRPC/Connect Service Definitions (generated from protobuf)
// ============================================================================

// Re-export generated protobuf types and services with 'Proto' prefix to avoid conflicts
// Import and re-export with aliases to avoid naming conflicts
export {
  // Schema Service
  SchemaService as SchemaServiceProto,
  ColumnInfoSchema,
  ForeignKeyRelationSchema,
  TableInfoSchema,
  SchemaInfoSchema,
  GetSchemaRequestSchema,
  GetSchemaResponseSchema,
  GetTableRequestSchema,
  GetTableResponseSchema,
  GetForeignKeysRequestSchema,
  GetForeignKeysResponseSchema,
  type ColumnInfo as ColumnInfoProto,
  type ForeignKeyRelation as ForeignKeyRelationProto,
  type TableInfo as TableInfoProto,
  type SchemaInfo as SchemaInfoProto,
  type GetSchemaRequest,
  type GetSchemaResponse,
  type GetTableRequest,
  type GetTableResponse,
  type GetForeignKeysRequest,
  type GetForeignKeysResponse,
} from './gen/rlsify/v1/schema_pb.js';

export {
  // Policy Service
  PolicyService as PolicyServiceProto,
  PolicyCommand as PolicyCommandProto,
  JoinType,
  StatementType,
  PolicyDefinitionSchema,
  JoinDefinitionSchema,
  RLSPolicyConfigSchema,
  ValidationErrorSchema,
  ValidationResultSchema,
  GeneratedSQLSchema,
  PolicyGenerationResultSchema,
  PreviewPoliciesRequestSchema,
  PreviewPoliciesResponseSchema,
  ValidateConfigRequestSchema,
  ValidateConfigResponseSchema,
  ApplyPoliciesRequestSchema,
  ApplyPoliciesResponseSchema,
  // Policy CRUD schemas
  SavedPolicySchema,
  SavePolicyRequestSchema,
  SavePolicyResponseSchema,
  ListPoliciesRequestSchema,
  ListPoliciesResponseSchema,
  GetPolicyRequestSchema,
  GetPolicyResponseSchema,
  DeletePolicyRequestSchema,
  DeletePolicyResponseSchema,
  type PolicyDefinition as PolicyDefinitionProto,
  type JoinDefinition as JoinDefinitionProto,
  type RLSPolicyConfig as RLSPolicyConfigProto,
  type ValidationError as ValidationErrorProto,
  type ValidationResult as ValidationResultProto,
  type GeneratedSQL as GeneratedSQLProto,
  type PolicyGenerationResult as PolicyGenerationResultProto,
  type PreviewPoliciesRequest,
  type PreviewPoliciesResponse,
  type ValidateConfigRequest,
  type ValidateConfigResponse,
  type ApplyPoliciesRequest,
  type ApplyPoliciesResponse,
  // Policy CRUD types
  type SavedPolicy,
  type SavePolicyRequest,
  type SavePolicyResponse,
  type ListPoliciesRequest,
  type ListPoliciesResponse,
  type GetPolicyRequest,
  type GetPolicyResponse,
  type DeletePolicyRequest,
  type DeletePolicyResponse,
  // Existing RLS policies from database
  ExistingRLSPolicySchema,
  ListExistingPoliciesRequestSchema,
  ListExistingPoliciesResponseSchema,
  type ExistingRLSPolicy,
  type ListExistingPoliciesRequest,
  type ListExistingPoliciesResponse,
  // Policy testing
  SessionContextSchema,
  ExpressionResultSchema,
  PolicyTestResultSchema,
  TestPoliciesRequestSchema,
  TestPoliciesResponseSchema,
  type SessionContext as SessionContextProto,
  type ExpressionResult,
  type PolicyTestResult,
  type TestPoliciesRequest,
  type TestPoliciesResponse,
} from './gen/rlsify/v1/policy_pb.js';

export {
  // Health Service
  HealthService as HealthServiceProto,
  HealthCheckResponseSchema,
  HealthCheckResponse_ServingStatus,
  ReadinessCheckResponseSchema,
  type HealthCheckRequest,
  type HealthCheckResponse,
  type ReadinessCheckRequest,
  type ReadinessCheckResponse,
} from './gen/rlsify/v1/health_pb.js';

export {
  // Connection Service
  ConnectionService as ConnectionServiceProto,
  DatabaseConnectionSchema,
  ConnectDatabaseRequestSchema,
  ConnectDatabaseResponseSchema,
  DisconnectDatabaseRequestSchema,
  DisconnectDatabaseResponseSchema,
  GetConnectionStatusRequestSchema,
  GetConnectionStatusResponseSchema,
  SaveConnectionRequestSchema,
  SaveConnectionResponseSchema,
  ListConnectionsRequestSchema,
  ListConnectionsResponseSchema,
  DeleteConnectionRequestSchema,
  DeleteConnectionResponseSchema,
  type DatabaseConnection,
  type ConnectDatabaseRequest,
  type ConnectDatabaseResponse,
  type DisconnectDatabaseRequest,
  type DisconnectDatabaseResponse,
  type GetConnectionStatusRequest,
  type GetConnectionStatusResponse,
  type SaveConnectionRequest,
  type SaveConnectionResponse,
  type ListConnectionsRequest,
  type ListConnectionsResponse,
  type DeleteConnectionRequest,
  type DeleteConnectionResponse,
} from './gen/rlsify/v1/connection_pb.js';
