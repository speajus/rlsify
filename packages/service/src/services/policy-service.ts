/**
 * Policy Service Implementation - gRPC service for policy generation and validation
 */

import type { Pool } from 'pg';
import { create, type JsonObject } from '@bufbuild/protobuf';
import type { ServiceImpl } from '@connectrpc/connect';
import {
  policyValidatorBlob,
  type PolicyValidator,
} from '@speajus/rlsify-core';
import {
  PolicyServiceProto,
  PreviewPoliciesResponseSchema,
  ValidateConfigResponseSchema,
  ApplyPoliciesResponseSchema,
  GeneratedSQLSchema,
  ValidationResultSchema,
  PolicyGenerationResultSchema,
  ValidationErrorSchema,
  StatementType,
  SavePolicyResponseSchema,
  SavedPolicySchema,
  ListPoliciesResponseSchema,
  GetPolicyResponseSchema,
  DeletePolicyResponseSchema,
  RLSPolicyConfigSchema,
  PolicyDefinitionSchema,
  ListExistingPoliciesResponseSchema,
  ExistingRLSPolicySchema,
  TestPoliciesResponseSchema,
  PolicyTestResultSchema,
  ExpressionResultSchema,
  type PreviewPoliciesRequest,
  type ValidateConfigRequest,
  type ApplyPoliciesRequest,
  type SavePolicyRequest,
  type ListPoliciesRequest,
  type GetPolicyRequest,
  type DeletePolicyRequest,
  type ListExistingPoliciesRequest,
  type TestPoliciesRequest,
  type RLSPolicyConfig,
} from '@speajus/rlsify-types';
import { tryParseSqlExpression } from '@speajus/rlsify-core';

export class PolicyServiceImpl implements ServiceImpl<typeof PolicyServiceProto> {
  private pool: Pool;
  private validator: PolicyValidator;

  constructor(pool: Pool, validator: PolicyValidator = policyValidatorBlob) {
    this.pool = pool;
    this.validator = validator;
  }

  setPool(pool: Pool) {
    this.pool = pool;
  }

  async previewPolicies(request: PreviewPoliciesRequest) {
    const config = request.config;
    if (!config) {
      return create(PreviewPoliciesResponseSchema, { statements: [] });
    }

    // Convert proto config to JSON format for the stored procedure
    const configJson = this.protoConfigToStoredProcJson(config);

    // Call the PostgreSQL stored procedure to generate SQL
    const result = await this.pool.query<{ generate_policy_sql: string }>(
      'SELECT rls.generate_policy_sql($1::jsonb)',
      [JSON.stringify(configJson)]
    );

    const sql = result.rows[0]?.generate_policy_sql || '';

    // Parse the SQL into individual statements
    const statements = sql
      .split('\n')
      .filter((line: string) => line.trim().length > 0)
      .map((line: string) => {
        const type = this.inferStatementType(line);
        return create(GeneratedSQLSchema, {
          sql: line,
          type,
          description: this.generateDescription(line, type),
        });
      });

    return create(PreviewPoliciesResponseSchema, { statements });
  }

  async validateConfig(request: ValidateConfigRequest) {
    const config = request.config;
    if (!config) {
      return create(ValidateConfigResponseSchema, {
        result: create(ValidationResultSchema, {
          valid: false,
          errors: [create(ValidationErrorSchema, { field: 'config', message: 'Config is required', code: 'REQUIRED' })],
        }),
      });
    }

    const coreConfig = this.convertProtoConfigToCore(config);
    const result = await this.validator.validate(coreConfig);

    return create(ValidateConfigResponseSchema, {
      result: this.createValidationResult(result),
    });
  }

  async applyPolicies(request: ApplyPoliciesRequest) {
    const config = request.config;
    if (!config) {
      return create(ApplyPoliciesResponseSchema, {
        applied: false,
        error: 'Config is required',
      });
    }

    // Convert proto config to JSON format for the stored procedure
    const configJson = this.protoConfigToStoredProcJson(config);

    // If dry run, just preview the SQL without applying
    if (request.dryRun) {
      const previewResult = await this.pool.query<{ generate_policy_sql: string }>(
        'SELECT rls.generate_policy_sql($1::jsonb)',
        [JSON.stringify(configJson)]
      );

      const sql = previewResult.rows[0]?.generate_policy_sql || '';
      const statements = sql
        .split('\n')
        .filter((line: string) => line.trim().length > 0)
        .map((line: string) => {
          const type = this.inferStatementType(line);
          return create(GeneratedSQLSchema, {
            sql: line,
            type,
            description: this.generateDescription(line, type),
          });
        });

      return create(ApplyPoliciesResponseSchema, {
        result: create(PolicyGenerationResultSchema, {
          statements,
          validation: create(ValidationResultSchema, { valid: true, errors: [] }),
          config: config,
        }),
        applied: false,
      });
    }

    // Apply the policies using the stored procedure
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Call the stored procedure to apply policies
      await client.query(
        'SELECT rls.apply_policy($1::jsonb)',
        [JSON.stringify(configJson)]
      );

      await client.query('COMMIT');

      // Get the generated SQL for the response
      const previewResult = await this.pool.query<{ generate_policy_sql: string }>(
        'SELECT rls.generate_policy_sql($1::jsonb)',
        [JSON.stringify(configJson)]
      );

      const sql = previewResult.rows[0]?.generate_policy_sql || '';
      const statements = sql
        .split('\n')
        .filter((line: string) => line.trim().length > 0)
        .map((line: string) => {
          const type = this.inferStatementType(line);
          return create(GeneratedSQLSchema, {
            sql: line,
            type,
            description: this.generateDescription(line, type),
          });
        });

      return create(ApplyPoliciesResponseSchema, {
        result: create(PolicyGenerationResultSchema, {
          statements,
          validation: create(ValidationResultSchema, { valid: true, errors: [] }),
          config: config,
        }),
        applied: true,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      return create(ApplyPoliciesResponseSchema, {
        applied: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      client.release();
    }
  }

  async savePolicy(request: SavePolicyRequest) {
    const config = request.config;
    if (!config) {
      throw new Error('Config is required');
    }

    const configJson = JSON.stringify(this.protoConfigToJson(config));

    let result: { rows: Array<{ id: string; config: unknown; description?: string; created_at: Date; updated_at: Date }> };
    if (request.id) {
      // Update existing policy
      result = await this.pool.query(
        `UPDATE saved_policies
         SET config = $1, description = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING id, config, description, created_at, updated_at`,
        [configJson, request.description ?? null, request.id]
      );
    } else {
      // Insert new policy
      result = await this.pool.query(
        `INSERT INTO saved_policies (config, description)
         VALUES ($1, $2)
         RETURNING id, config, description, created_at, updated_at`,
        [configJson, request.description ?? null]
      );
    }

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to save policy');
    }
    return create(SavePolicyResponseSchema, {
      policy: this.rowToSavedPolicy(row),
    });
  }

  async listPolicies(request: ListPoliciesRequest) {
    const limit = request.limit || 50;
    const offset = request.offset || 0;

    let query = 'SELECT id, config, description, created_at, updated_at FROM saved_policies';
    const params: (string | number)[] = [];

    if (request.tableFilter) {
      query += ` WHERE config->>'table' = $1`;
      params.push(request.tableFilter);
    }

    query += ' ORDER BY updated_at DESC';
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM saved_policies';
    const countParams: string[] = [];
    if (request.tableFilter) {
      countQuery += ` WHERE config->>'table' = $1`;
      countParams.push(request.tableFilter);
    }
    const countResult = await this.pool.query(countQuery, countParams);

    return create(ListPoliciesResponseSchema, {
      policies: result.rows.map((row) => this.rowToSavedPolicy(row)),
      total: parseInt(countResult.rows[0].count, 10),
    });
  }

  async getPolicy(request: GetPolicyRequest) {
    const result = await this.pool.query(
      'SELECT id, config, description, created_at, updated_at FROM saved_policies WHERE id = $1',
      [request.id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Policy not found: ${request.id}`);
    }

    return create(GetPolicyResponseSchema, {
      policy: this.rowToSavedPolicy(result.rows[0]),
    });
  }

  async deletePolicy(request: DeletePolicyRequest) {
    const result = await this.pool.query(
      'DELETE FROM saved_policies WHERE id = $1',
      [request.id]
    );

    return create(DeletePolicyResponseSchema, {
      deleted: (result.rowCount ?? 0) > 0,
    });
  }

  async listExistingPolicies(request: ListExistingPoliciesRequest) {
    const schemaName = request.schema ?? 'public';

    // Query pg_policies view to get existing RLS policies
    // Note: roles is a name[] array, we convert it to text[] for proper JSON serialization
    let query = `
      SELECT
        schemaname as schema_name,
        tablename as table_name,
        policyname as policy_name,
        cmd as command,
        permissive,
        roles::text[] as roles,
        qual as using_expression,
        with_check as with_check_expression
      FROM pg_policies
      WHERE schemaname = $1
    `;
    const params: string[] = [schemaName];

    if (request.table) {
      query += ' AND tablename = $2';
      params.push(request.table);
    }

    query += ' ORDER BY tablename, policyname';

    const result = await this.pool.query(query, params);

    const policies = result.rows.map((row) => {
      // Try to parse the SQL expressions to JSON format
      let parsedUsing = null;
      let parsedWithCheck = null;
      let parseError: string | undefined;

      if (row.using_expression) {
        try {
          const parsed = tryParseSqlExpression(row.using_expression);
          if (parsed) {
            parsedUsing = parsed;
          }
        } catch (e) {
          parseError = e instanceof Error ? e.message : 'Failed to parse USING expression';
        }
      }

      if (row.with_check_expression) {
        try {
          const parsed = tryParseSqlExpression(row.with_check_expression);
          if (parsed) {
            parsedWithCheck = parsed;
          }
        } catch (e) {
          parseError = parseError
            ? `${parseError}; ${e instanceof Error ? e.message : 'Failed to parse WITH CHECK expression'}`
            : (e instanceof Error ? e.message : 'Failed to parse WITH CHECK expression');
        }
      }

      const policyData: {
        schemaName: string;
        tableName: string;
        policyName: string;
        command: string;
        permissive: boolean;
        roles: string[];
        usingExpression?: string;
        withCheckExpression?: string;
        parsedUsing?: JsonObject;
        parsedWithCheck?: JsonObject;
        parseError?: string;
      } = {
        schemaName: row.schema_name,
        tableName: row.table_name,
        policyName: row.policy_name,
        command: row.command || 'ALL',
        permissive: row.permissive === 'PERMISSIVE',
        roles: row.roles || [],
      };

      if (row.using_expression) {
        policyData.usingExpression = row.using_expression;
      }
      if (row.with_check_expression) {
        policyData.withCheckExpression = row.with_check_expression;
      }
      if (parsedUsing) {
        policyData.parsedUsing = parsedUsing as JsonObject;
      }
      if (parsedWithCheck) {
        policyData.parsedWithCheck = parsedWithCheck as JsonObject;
      }
      if (parseError) {
        policyData.parseError = parseError;
      }

      return create(ExistingRLSPolicySchema, policyData);
    });

    return create(ListExistingPoliciesResponseSchema, { policies });
  }

  async testPolicies(request: TestPoliciesRequest) {
    const { policies, session, rowDataJson, operation } = request;

    if (!policies || policies.length === 0) {
      return create(TestPoliciesResponseSchema, {
        results: [],
        error: 'No policies to test',
      });
    }

    // Parse the sample row data
    let rowData: Record<string, unknown>;
    try {
      rowData = JSON.parse(rowDataJson || '{}');
    } catch {
      return create(TestPoliciesResponseSchema, {
        results: [],
        error: 'Invalid row data JSON',
      });
    }

    let client: import('pg').PoolClient;
    try {
      client = await this.pool.connect();
    } catch (connError) {
      return create(TestPoliciesResponseSchema, {
        results: [],
        error: `Database connection failed: ${connError instanceof Error ? connError.message : 'Unknown error'}`,
      });
    }
    const results = [];

    try {
      // Start a transaction so we can set session variables
      await client.query('BEGIN');

      // Set session variables for auth context using set_config (supports parameterized queries)
      if (session?.userId) {
        await client.query(`SELECT set_config('auth.current_user_id', $1, true)`, [session.userId]);
      }

      // Set JWT claims if provided
      if (session?.claimsJson) {
        await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [session.claimsJson]);
      }

      // Set role if provided (for role-based checks)
      if (session?.role) {
        await client.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, [session.role]);
      }

      // Test each policy
      for (const policy of policies) {
        const policyResult = await this.evaluatePolicyExpression(
          client,
          policy,
          rowData,
          this.mapCommand(operation)
        );
        results.push(policyResult);
      }

      // Rollback - we don't want to persist any changes
      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      return create(TestPoliciesResponseSchema, {
        results: [],
        error: error instanceof Error ? error.message : 'Unknown error during policy testing',
      });
    } finally {
      client.release();
    }

    return create(TestPoliciesResponseSchema, { results });
  }

  private async evaluatePolicyExpression(
    client: import('pg').PoolClient,
    policy: TestPoliciesRequest['policies'][number],
    rowData: Record<string, unknown>,
    operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL'
  ) {
    // Determine which expressions to evaluate based on operation
    const needsUsing = operation !== 'INSERT';
    const needsWithCheck = operation === 'INSERT' || operation === 'UPDATE' || operation === 'ALL';

    let usingResult = create(ExpressionResultSchema, { allowed: true, reason: 'No USING expression' });
    let withCheckResult = create(ExpressionResultSchema, { allowed: true, reason: 'No WITH CHECK expression' });

    // Evaluate USING expression
    if (needsUsing && policy.usingExpression) {
      usingResult = await this.evaluateJsonExpression(client, policy.usingExpression, rowData, 'USING');
    } else if (needsUsing && policy.using) {
      usingResult = await this.evaluateSqlExpression(client, policy.using, rowData, 'USING');
    }

    // Evaluate WITH CHECK expression
    if (needsWithCheck && policy.withCheckExpression) {
      withCheckResult = await this.evaluateJsonExpression(client, policy.withCheckExpression, rowData, 'WITH CHECK');
    } else if (needsWithCheck && policy.withCheck) {
      withCheckResult = await this.evaluateSqlExpression(client, policy.withCheck, rowData, 'WITH CHECK');
    }

    // Determine overall allowed based on operation
    let overallAllowed = true;
    if (operation === 'SELECT' || operation === 'DELETE') {
      overallAllowed = usingResult.allowed;
    } else if (operation === 'INSERT') {
      overallAllowed = withCheckResult.allowed;
    } else if (operation === 'UPDATE' || operation === 'ALL') {
      overallAllowed = usingResult.allowed && withCheckResult.allowed;
    }

    return create(PolicyTestResultSchema, {
      policyName: policy.name,
      usingResult,
      withCheckResult,
      overallAllowed,
    });
  }

  private async evaluateJsonExpression(
    client: import('pg').PoolClient,
    expressionJson: unknown,
    rowData: Record<string, unknown>,
    expressionType: string
  ) {
    try {
      // First, compile the JSON expression to SQL using the stored procedure
      const compileResult = await client.query<{ compile_expression: string }>(
        'SELECT rls.compile_expression($1::jsonb)',
        [JSON.stringify(expressionJson)]
      );

      const sqlExpression = compileResult.rows[0]?.compile_expression || 'true';

      // Now evaluate the SQL expression against the row data
      return await this.evaluateSqlExpression(client, sqlExpression, rowData, expressionType);
    } catch (error) {
      return create(ExpressionResultSchema, {
        allowed: false,
        reason: `Failed to compile ${expressionType} expression: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  private async evaluateSqlExpression(
    client: import('pg').PoolClient,
    sqlExpression: string,
    rowData: Record<string, unknown>,
    expressionType: string
  ) {
    try {
      // Build a query that evaluates the expression against the row data
      // We create a CTE with the row data and then evaluate the expression
      const columns = Object.keys(rowData);
      const values = Object.values(rowData);

      if (columns.length === 0) {
        // No row data, just evaluate the expression directly
        const result = await client.query<{ result: boolean }>(
          `SELECT (${sqlExpression})::boolean AS result`
        );
        const allowed = result.rows[0]?.result ?? false;
        return create(ExpressionResultSchema, {
          allowed,
          reason: allowed ? 'Expression evaluated to true' : 'Expression evaluated to false',
          sqlExpression,
        });
      }

      // Build column definitions for the CTE
      // We need to infer types from the values
      const columnDefs = columns.map((col, i) => {
        const val = values[i];
        let typeCast = '::text';
        if (typeof val === 'number') {
          typeCast = Number.isInteger(val) ? '::integer' : '::numeric';
        } else if (typeof val === 'boolean') {
          typeCast = '::boolean';
        } else if (val === null) {
          typeCast = '::text';
        } else if (typeof val === 'string') {
          // Check if it looks like a UUID
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) {
            typeCast = '::uuid';
          } else if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
            typeCast = '::timestamptz';
          }
        }
        return `$${i + 1}${typeCast} AS ${col}`;
      });

      // Build the query
      const query = `
        WITH row_data AS (
          SELECT ${columnDefs.join(', ')}
        )
        SELECT (${sqlExpression})::boolean AS result
        FROM row_data
      `;

      const result = await client.query<{ result: boolean }>(query, values);
      const allowed = result.rows[0]?.result ?? false;

      return create(ExpressionResultSchema, {
        allowed,
        reason: allowed ? 'Expression evaluated to true' : 'Expression evaluated to false',
        sqlExpression,
      });
    } catch (error) {
      return create(ExpressionResultSchema, {
        allowed: false,
        reason: `Failed to evaluate ${expressionType} expression: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sqlExpression,
      });
    }
  }

  private rowToSavedPolicy(row: { id: string; config: unknown; description?: string; created_at: Date; updated_at: Date }) {
    const configJson = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
    const savedPolicy: { id: string; config: ReturnType<typeof create<typeof RLSPolicyConfigSchema>>; createdAt: string; updatedAt: string; description?: string } = {
      id: row.id,
      config: this.jsonToProtoConfig(configJson),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
    if (row.description) {
      savedPolicy.description = row.description;
    }
    return create(SavedPolicySchema, savedPolicy);
  }

  private protoConfigToJson(config: SavePolicyRequest['config']) {
    return {
      version: config?.version ?? '1.0',
      table: config?.table ?? '',
      schema: config?.schema ?? 'public',
      policies: (config?.policies ?? []).map((p) => ({
        name: p.name,
        command: this.mapCommand(p.command),
        using: p.using,
        withCheck: p.withCheck,
        roles: [...p.roles],
        permissive: p.permissive,
      })),
      joins: (config?.joins ?? []).map((j) => ({
        table: j.table,
        type: j.type,
        on: j.on,
        alias: j.alias,
      })),
      enableRLS: config?.enableRls ?? true,
      forceRLS: config?.forceRls ?? false,
    };
  }

  private jsonToProtoConfig(json: Record<string, unknown>) {
    const policies = ((json.policies as Array<Record<string, unknown>>) ?? []).map((p) => {
      const policyInit: {
        name: string;
        command: number;
        roles: string[];
        permissive: boolean;
        using?: string;
        withCheck?: string;
      } = {
        name: (p.name as string) ?? '',
        command: this.reverseMapCommand((p.command as string) ?? 'ALL'),
        roles: (p.roles as string[]) ?? [],
        permissive: (p.permissive as boolean) ?? true,
      };
      if (p.using) policyInit.using = p.using as string;
      if (p.withCheck) policyInit.withCheck = p.withCheck as string;
      return create(PolicyDefinitionSchema, policyInit);
    });

    const configInit: {
      version: string;
      table: string;
      policies: typeof policies;
      enableRls: boolean;
      forceRls: boolean;
      schema?: string;
    } = {
      version: (json.version as string) ?? '1.0',
      table: (json.table as string) ?? '',
      policies,
      enableRls: (json.enableRLS as boolean) ?? true,
      forceRls: (json.forceRLS as boolean) ?? false,
    };
    if (json.schema) configInit.schema = json.schema as string;

    return create(RLSPolicyConfigSchema, configInit);
  }

  private reverseMapCommand(cmd: string): number {
    const mapping: Record<string, number> = {
      'SELECT': 1,
      'INSERT': 2,
      'UPDATE': 3,
      'DELETE': 4,
      'ALL': 5,
    };
    return mapping[cmd] ?? 5;
  }

  private convertProtoConfigToCore(config: PreviewPoliciesRequest['config']): RLSPolicyConfig {
    // Convert proto RLSPolicyConfig to core library format
    // This is a simplified conversion - extend as needed
    return {
      version: config?.version ?? '1.0',
      table: config?.table ?? '',
      schema: config?.schema ?? 'public',
      policies: (config?.policies ?? []).map((p) => {
        // Build policy object, only including defined optional fields
        const policy: RLSPolicyConfig['policies'][number] = {
          name: p.name,
          command: this.mapCommand(p.command),
          roles: [...p.roles],
          permissive: p.permissive,
        };
        // Only add using/withCheck if they're defined (not undefined)
        if (p.using !== undefined && p.using !== '') {
          policy.using = p.using;
        }
        if (p.withCheck !== undefined && p.withCheck !== '') {
          policy.withCheck = p.withCheck;
        }
        return policy;
      }),
      enableRLS: config?.enableRls ?? true,
      forceRLS: config?.forceRls ?? false,
    };
  }

  private mapCommand(cmd: number): 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL' {
    const mapping: Record<number, 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL'> = {
      1: 'SELECT',
      2: 'INSERT',
      3: 'UPDATE',
      4: 'DELETE',
      5: 'ALL',
    };
    return mapping[cmd] ?? 'ALL';
  }

  private createValidationResult(result: { valid: boolean; errors: Array<{ field: string; message: string; code: string }>; warnings?: Array<{ field: string; message: string; code: string }> }) {
    const errors = result.errors.map((e) =>
      create(ValidationErrorSchema, { field: e.field, message: e.message, code: e.code })
    );

    // Check if warnings exist and have items
    if (result.warnings && result.warnings.length > 0) {
      const warnings = result.warnings.map((w) =>
        create(ValidationErrorSchema, { field: w.field, message: w.message, code: w.code })
      );
      return create(ValidationResultSchema, {
        valid: result.valid,
        errors,
        warnings,
      });
    }

    return create(ValidationResultSchema, {
      valid: result.valid,
      errors,
    });
  }

  /**
   * Convert proto config to JSON format expected by the stored procedure
   */
  private protoConfigToStoredProcJson(config: PreviewPoliciesRequest['config']) {
    const schema = config?.schema || 'public';
    const tableName = config?.table || '';
    const fullTableName = tableName.includes('.') ? tableName : `${schema}.${tableName}`;

    return {
      table: fullTableName,
      enableRLS: config?.enableRls ?? true,
      policies: (config?.policies ?? []).map((p) => ({
        name: p.name,
        command: this.mapCommand(p.command),
        permissive: p.permissive ?? true,
        roles: [...p.roles],
        // Use usingExpression if available, otherwise fall back to using
        ...(p.usingExpression ? { usingExpression: p.usingExpression } : { using: p.using || 'true' }),
        // Use withCheckExpression if available, otherwise fall back to withCheck
        ...(p.withCheckExpression ? { withCheckExpression: p.withCheckExpression } :
           (p.withCheck ? { withCheck: p.withCheck } : {})),
      })),
    };
  }

  /**
   * Infer statement type from SQL
   */
  private inferStatementType(sql: string): StatementType {
    const upperSql = sql.toUpperCase().trim();
    if (upperSql.startsWith('CREATE POLICY')) return StatementType.CREATE_POLICY;
    if (upperSql.startsWith('DROP POLICY')) return StatementType.DROP_POLICY;
    if (upperSql.includes('ENABLE ROW LEVEL SECURITY')) return StatementType.ENABLE_RLS;
    if (upperSql.includes('DISABLE ROW LEVEL SECURITY')) return StatementType.DISABLE_RLS;
    if (upperSql.startsWith('ALTER TABLE')) return StatementType.ALTER_TABLE;
    return StatementType.UNSPECIFIED;
  }

  /**
   * Generate description for a SQL statement
   */
  private generateDescription(sql: string, type: StatementType): string {
    switch (type) {
      case StatementType.CREATE_POLICY: {
        const match = sql.match(/CREATE POLICY (\S+) ON (\S+)/i);
        if (match) return `Create policy '${match[1]}' on ${match[2]}`;
        return 'Create RLS policy';
      }
      case StatementType.DROP_POLICY: {
        const match = sql.match(/DROP POLICY.*?(\S+) ON (\S+)/i);
        if (match) return `Drop policy '${match[1]}' on ${match[2]}`;
        return 'Drop RLS policy';
      }
      case StatementType.ENABLE_RLS: {
        const match = sql.match(/ALTER TABLE (\S+)/i);
        if (match) return `Enable RLS on ${match[1]}`;
        return 'Enable RLS';
      }
      case StatementType.ALTER_TABLE: {
        const match = sql.match(/ALTER TABLE (\S+)/i);
        if (match) return `Alter table ${match[1]}`;
        return 'Alter table';
      }
      default:
        return sql.substring(0, 50);
    }
  }
}

