/**
 * PolicyGenerator - Generates SQL DDL for RLS policies
 */

import type {
  RLSPolicyConfig,
  PolicyDefinition,
  GeneratedSQL,
  PolicyGenerationResult,
  SchemaInfo,
} from '@speajus/rlsify-types';
import { PolicyValidator } from './policy-validator.js';
import { JoinResolver } from './join-resolver.js';
import { compilePermissionExpression } from '../permission-expression-compiler.js';

export class PolicyGenerator {
  constructor(
    private validator: PolicyValidator,
    private joinResolver: JoinResolver
  ) {}

  /**
   * Generate RLS policies from configuration
   */
  async generate(
    config: RLSPolicyConfig,
    schemaInfo?: SchemaInfo
  ): Promise<PolicyGenerationResult> {
    // Validate configuration
    const validation = await this.validator.validate(config, schemaInfo);

    const statements: GeneratedSQL[] = [];

    // Generate ENABLE RLS statement if needed
    if (config.enableRLS !== false) {
      statements.push(this.generateEnableRLS(config));
    }

    // Generate FORCE RLS statement if needed
    if (config.forceRLS) {
      statements.push(this.generateForceRLS(config));
    }

    // Generate individual policies
    for (const policy of config.policies) {
      statements.push(this.generatePolicy(config, policy, schemaInfo));
    }

    return {
      statements,
      validation,
      config,
    };
  }

  /**
   * Generate ENABLE RLS statement
   */
  private generateEnableRLS(config: RLSPolicyConfig): GeneratedSQL {
    const schema = config.schema || 'public';
    const table = `${schema}.${config.table}`;

    return {
      type: 'ENABLE_RLS',
      sql: `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`,
      description: `Enable RLS on ${table}`,
    };
  }

  /**
   * Generate FORCE RLS statement
   */
  private generateForceRLS(config: RLSPolicyConfig): GeneratedSQL {
    const schema = config.schema || 'public';
    const table = `${schema}.${config.table}`;

    return {
      type: 'ALTER_TABLE',
      sql: `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`,
      description: `Force RLS on ${table} (applies to table owner)`,
    };
  }

  /**
   * Generate individual policy
   */
  private generatePolicy(
    config: RLSPolicyConfig,
    policy: PolicyDefinition,
    schemaInfo?: SchemaInfo
  ): GeneratedSQL {
    const schema = config.schema || 'public';
    const table = `${schema}.${config.table}`;
    const permissive = policy.permissive !== false ? 'PERMISSIVE' : 'RESTRICTIVE';
    const roles = policy.roles?.join(', ') || 'PUBLIC';

    let sql = `CREATE POLICY ${policy.name} ON ${table}\n`;
    sql += `  AS ${permissive}\n`;
    sql += `  FOR ${policy.command}\n`;
    sql += `  TO ${roles}`;

    // Add USING clause if provided (prefer JSON expression over string)
    if (policy.usingExpression) {
      const usingClause = compilePermissionExpression(policy.usingExpression);
      sql += `\n  USING (${usingClause})`;
    } else if (policy.using) {
      const usingClause = this.buildPolicyExpression(
        policy.using,
        config,
        schemaInfo
      );
      sql += `\n  USING (${usingClause})`;
    }

    // Add WITH CHECK clause if provided (prefer JSON expression over string)
    if (policy.withCheckExpression) {
      const withCheckClause = compilePermissionExpression(policy.withCheckExpression);
      sql += `\n  WITH CHECK (${withCheckClause})`;
    } else if (policy.withCheck) {
      const withCheckClause = this.buildPolicyExpression(
        policy.withCheck,
        config,
        schemaInfo
      );
      sql += `\n  WITH CHECK (${withCheckClause})`;
    }

    sql += ';';

    return {
      type: 'CREATE_POLICY',
      sql,
      description: `Create ${policy.command} policy '${policy.name}' on ${table}`,
    };
  }

  /**
   * Build policy expression, handling joins if needed
   */
  private buildPolicyExpression(
    expression: string,
    config: RLSPolicyConfig,
    schemaInfo?: SchemaInfo
  ): string {
    // If no joins, return expression as-is
    if (!config.joins || config.joins.length === 0) {
      return expression;
    }

    // If joins are present and we have schema info, build subquery
    if (schemaInfo) {
      return this.buildSubqueryWithJoins(expression, config, schemaInfo);
    }

    // No schema info but joins requested - return expression as-is
    // (validation should have caught this)
    return expression;
  }

  /**
   * Build subquery with joins for complex policies
   */
  private buildSubqueryWithJoins(
    expression: string,
    config: RLSPolicyConfig,
    schemaInfo: SchemaInfo
  ): string {
    const schema = config.schema || 'public';
    const table = `${schema}.${config.table}`;
    const joins = config.joins || [];

    // Build JOIN clauses
    const joinClauses = this.joinResolver.generateJoinClauses(
      config.table,
      joins,
      schemaInfo
    );

    // Build subquery
    return `EXISTS (
      SELECT 1
      FROM ${table}
      ${joinClauses.join('\n      ')}
      WHERE ${expression}
    )`;
  }
}

