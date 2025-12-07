/**
 * JoinResolver - Resolves table joins using foreign key relationships
 */

import type {
  JoinDefinition,
  ForeignKeyRelation,
  SchemaInfo,
} from '@speajus/rlsify-types';

export class JoinResolver {
  /**
   * Resolve join conditions using foreign key relationships
   * If join.on is not provided, attempts to find FK relationship
   */
  resolveJoin(
    sourceTable: string,
    join: JoinDefinition,
    schemaInfo: SchemaInfo
  ): string {
    // If explicit join condition provided, use it
    if (join.on) {
      return this.normalizeJoinCondition(join.on, sourceTable, join.table, join.alias);
    }

    // Try to find foreign key relationship
    const fkRelation = this.findForeignKeyRelation(
      sourceTable,
      join.table,
      schemaInfo
    );

    if (fkRelation) {
      return this.buildJoinCondition(fkRelation, join.alias);
    }

    // No FK found - this should trigger a validation error
    throw new Error(
      `No foreign key relationship found between ${sourceTable} and ${join.table}. ` +
      `Please provide an explicit join condition using the 'on' property.`
    );
  }

  /**
   * Find foreign key relationship between two tables
   * Checks both directions (source -> target and target -> source)
   */
  private findForeignKeyRelation(
    sourceTable: string,
    targetTable: string,
    schemaInfo: SchemaInfo
  ): ForeignKeyRelation | null {
    // Check source -> target
    const forwardFK = schemaInfo.foreignKeys.find(
      (fk) =>
        fk.sourceTable === sourceTable && fk.targetTable === targetTable
    );

    if (forwardFK) {
      return forwardFK;
    }

    // Check target -> source (reverse relationship)
    const reverseFK = schemaInfo.foreignKeys.find(
      (fk) =>
        fk.sourceTable === targetTable && fk.targetTable === sourceTable
    );

    return reverseFK || null;
  }

  /**
   * Build join condition from foreign key relationship
   */
  private buildJoinCondition(
    fk: ForeignKeyRelation,
    alias?: string
  ): string {
    const targetRef = alias || fk.targetTable;
    return `${fk.sourceTable}.${fk.sourceColumn} = ${targetRef}.${fk.targetColumn}`;
  }

  /**
   * Normalize join condition with simple transform syntax
   * Supports: "user_id = user.id" -> "table.user_id = user.id"
   */
  private normalizeJoinCondition(
    condition: string,
    sourceTable: string,
    _targetTable: string,
    alias?: string
  ): string {
    // Simple transform: "column = table.column"
    const simplePattern = /^(\w+)\s*=\s*(\w+)\.(\w+)$/;
    const match = condition.match(simplePattern);

    if (match) {
      const [, sourceColumn, table, targetColumn] = match;
      const targetRef = alias || table;
      return `${sourceTable}.${sourceColumn} = ${targetRef}.${targetColumn}`;
    }

    // Already qualified or complex expression - return as is
    return condition;
  }

  /**
   * Generate SQL JOIN clause
   */
  generateJoinClause(
    sourceTable: string,
    join: JoinDefinition,
    schemaInfo: SchemaInfo
  ): string {
    const joinType = join.type || 'INNER';
    const targetRef = join.alias ? `${join.table} AS ${join.alias}` : join.table;
    const condition = this.resolveJoin(sourceTable, join, schemaInfo);

    return `${joinType} JOIN ${targetRef} ON ${condition}`;
  }

  /**
   * Generate multiple JOIN clauses
   */
  generateJoinClauses(
    sourceTable: string,
    joins: JoinDefinition[],
    schemaInfo: SchemaInfo
  ): string[] {
    return joins.map((join) =>
      this.generateJoinClause(sourceTable, join, schemaInfo)
    );
  }

  /**
   * Validate that all joins can be resolved
   */
  validateJoins(
    sourceTable: string,
    joins: JoinDefinition[],
    schemaInfo: SchemaInfo
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const join of joins) {
      try {
        this.resolveJoin(sourceTable, join, schemaInfo);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

