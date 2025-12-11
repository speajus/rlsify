/**
 * Policy Service Implementation - gRPC service for policy generation and validation
 */

import type { Pool } from 'pg';
import { create } from '@bufbuild/protobuf';
import type { ServiceImpl } from '@connectrpc/connect';
import {
  createContainer,
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
  type PreviewPoliciesRequest,
  type ValidateConfigRequest,
  type ApplyPoliciesRequest,
  type SavePolicyRequest,
  type ListPoliciesRequest,
  type GetPolicyRequest,
  type DeletePolicyRequest,
  type RLSPolicyConfig,
} from '@speajus/rlsify-types';

export class PolicyServiceImpl implements ServiceImpl<typeof PolicyServiceProto> {
  private coreContainer = createContainer();
  private validator: PolicyValidator;

  constructor(private pool: Pool) {
    // Resolve services from the container
    this.validator = this.coreContainer.resolve(policyValidatorBlob) as PolicyValidator;
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

