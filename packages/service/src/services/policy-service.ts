/**
 * Policy Service Implementation - gRPC service for policy generation and validation
 */

import type { Pool } from 'pg';
import { create } from '@bufbuild/protobuf';
import type { ServiceImpl } from '@connectrpc/connect';
import {
  createContainer,
  policyGeneratorBlob,
  policyValidatorBlob,
  type PolicyGenerator,
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
  private generator: PolicyGenerator;
  private validator: PolicyValidator;

  constructor(private pool: Pool) {
    // Resolve services from the container
    this.generator = this.coreContainer.resolve(policyGeneratorBlob) as PolicyGenerator;
    this.validator = this.coreContainer.resolve(policyValidatorBlob) as PolicyValidator;
  }

  async previewPolicies(request: PreviewPoliciesRequest) {
    const config = request.config;
    if (!config) {
      return create(PreviewPoliciesResponseSchema, { statements: [] });
    }

    // Convert proto config to core library format
    const coreConfig = this.convertProtoConfigToCore(config);

    const result = await this.generator.generate(coreConfig);

    const statements = result.statements.map((stmt) =>
      this.createGeneratedSQL(stmt)
    );

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

    const coreConfig = this.convertProtoConfigToCore(config);
    const result = await this.generator.generate(coreConfig);

    if (!result.validation.valid) {
      return create(ApplyPoliciesResponseSchema, {
        result: create(PolicyGenerationResultSchema, {
          statements: [],
          validation: create(ValidationResultSchema, result.validation),
          config: config,
        }),
        applied: false,
        error: 'Validation failed',
      });
    }

    // If dry run, just return the result without applying
    if (request.dryRun) {
      return create(ApplyPoliciesResponseSchema, {
        result: create(PolicyGenerationResultSchema, {
          statements: result.statements.map((stmt) => this.createGeneratedSQL(stmt)),
          validation: this.createValidationResult(result.validation),
          config: config,
        }),
        applied: false,
      });
    }

    // Apply the policies
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const stmt of result.statements) {
        await client.query(stmt.sql);
      }

      await client.query('COMMIT');

      return create(ApplyPoliciesResponseSchema, {
        result: create(PolicyGenerationResultSchema, {
          statements: result.statements.map((stmt) => this.createGeneratedSQL(stmt)),
          validation: this.createValidationResult(result.validation),
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
    return create(RLSPolicyConfigSchema, {
      version: (json.version as string) ?? '1.0',
      table: (json.table as string) ?? '',
      schema: json.schema as string | undefined,
      policies: ((json.policies as Array<Record<string, unknown>>) ?? []).map((p) => ({
        name: (p.name as string) ?? '',
        command: this.reverseMapCommand((p.command as string) ?? 'ALL'),
        using: p.using as string | undefined,
        withCheck: p.withCheck as string | undefined,
        roles: (p.roles as string[]) ?? [],
        permissive: (p.permissive as boolean) ?? true,
      })),
      enableRls: (json.enableRLS as boolean) ?? true,
      forceRls: (json.forceRLS as boolean) ?? false,
    });
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

  private mapStatementType(type: string): StatementType {
    const mapping: Record<string, StatementType> = {
      'CREATE_POLICY': StatementType.CREATE_POLICY,
      'ALTER_TABLE': StatementType.ALTER_TABLE,
      'DROP_POLICY': StatementType.DROP_POLICY,
      'ENABLE_RLS': StatementType.ENABLE_RLS,
      'DISABLE_RLS': StatementType.DISABLE_RLS,
    };
    return mapping[type] ?? StatementType.UNSPECIFIED;
  }

  private createGeneratedSQL(stmt: { sql: string; type: string; description?: string }) {
    const msg: { sql: string; type: StatementType; description?: string } = {
      sql: stmt.sql,
      type: this.mapStatementType(stmt.type),
    };
    if (stmt.description) {
      msg.description = stmt.description;
    }
    return create(GeneratedSQLSchema, msg);
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
}

