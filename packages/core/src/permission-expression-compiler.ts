/**
 * Compiler for converting JSON permission expressions to PostgreSQL SQL
 */

import type {
  PermissionExpression,
  ComparisonOperator,
  SessionVariable,
  ColumnReference,
  PermissionValue,
} from '@speajus/rlsify-types';

/**
 * Compile a permission expression to a PostgreSQL WHERE clause
 */
export function compilePermissionExpression(expr: PermissionExpression): string {
  if ('_and' in expr) {
    const conditions = (expr as { _and: PermissionExpression[] })._and.map((e: PermissionExpression) =>
      compilePermissionExpression(e)
    );
    return `(${conditions.join(' AND ')})`;
  }

  if ('_or' in expr) {
    const conditions = (expr as { _or: PermissionExpression[] })._or.map((e: PermissionExpression) =>
      compilePermissionExpression(e)
    );
    return `(${conditions.join(' OR ')})`;
  }

  if ('_not' in expr) {
    return `NOT (${compilePermissionExpression((expr as { _not: PermissionExpression })._not)})`;
  }

  if ('_exists' in expr) {
    const existsExpr = expr as { _exists: { _table: string | { schema: string; name: string }; _where: PermissionExpression } };
    const { _table, _where } = existsExpr._exists;
    const tableName = typeof _table === 'string' ? _table : `${_table.schema}.${_table.name}`;
    const whereClause = compilePermissionExpression(_where);
    return `EXISTS (SELECT 1 FROM ${tableName} WHERE ${whereClause})`;
  }

  // Field expressions
  const entries = Object.entries(expr);
  const conditions: string[] = [];

  for (const [field, value] of entries) {
    if (typeof value === 'object' && value !== null) {
      // Check if it's a comparison expression
      const comparisonEntries = Object.entries(value);
      for (const [op, val] of comparisonEntries) {
        if (isComparisonOperator(op)) {
          conditions.push(compileComparison(field, op as ComparisonOperator, val as PermissionValue));
        } else {
          // Nested field (relationship traversal)
          // For now, we'll treat this as a simple field path
          conditions.push(compilePermissionExpression(value as PermissionExpression));
        }
      }
    }
  }

  return conditions.length > 1 ? `(${conditions.join(' AND ')})` : conditions[0] || 'true';
}

/**
 * Check if a string is a comparison operator
 */
function isComparisonOperator(op: string): boolean {
  return [
    '_eq', '_neq', '_gt', '_gte', '_lt', '_lte',
    '_in', '_nin', '_like', '_ilike', '_nlike', '_nilike',
    '_is_null', '_similar', '_nsimilar'
  ].includes(op);
}

/**
 * Compile a comparison expression
 */
function compileComparison(
  field: string,
  operator: ComparisonOperator,
  value: PermissionValue
): string {
  const leftSide = field;
  const rightSide = compileValue(value);

  switch (operator) {
    case '_eq':
      return `${leftSide} = ${rightSide}`;
    case '_neq':
      return `${leftSide} != ${rightSide}`;
    case '_gt':
      return `${leftSide} > ${rightSide}`;
    case '_gte':
      return `${leftSide} >= ${rightSide}`;
    case '_lt':
      return `${leftSide} < ${rightSide}`;
    case '_lte':
      return `${leftSide} <= ${rightSide}`;
    case '_in':
      if (Array.isArray(value)) {
        const values = value.map(v => compileValue(v)).join(', ');
        return `${leftSide} IN (${values})`;
      }
      return `${leftSide} = ANY(${rightSide})`;
    case '_nin':
      if (Array.isArray(value)) {
        const values = value.map(v => compileValue(v)).join(', ');
        return `${leftSide} NOT IN (${values})`;
      }
      return `${leftSide} != ALL(${rightSide})`;
    case '_like':
      return `${leftSide} LIKE ${rightSide}`;
    case '_ilike':
      return `${leftSide} ILIKE ${rightSide}`;
    case '_nlike':
      return `${leftSide} NOT LIKE ${rightSide}`;
    case '_nilike':
      return `${leftSide} NOT ILIKE ${rightSide}`;
    case '_is_null':
      return value ? `${leftSide} IS NULL` : `${leftSide} IS NOT NULL`;
    case '_similar':
      return `${leftSide} SIMILAR TO ${rightSide}`;
    case '_nsimilar':
      return `${leftSide} NOT SIMILAR TO ${rightSide}`;
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}

/**
 * Compile a value to SQL
 */
function compileValue(value: PermissionValue): string {
  if (value === null) {
    return 'NULL';
  }

  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`;
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (Array.isArray(value)) {
    return `ARRAY[${value.map(v => compileValue(v)).join(', ')}]`;
  }

  if ('var' in value) {
    // Session variable
    return (value as SessionVariable).var;
  }

  if ('column' in value) {
    // Column reference
    return (value as ColumnReference).column;
  }

  throw new Error(`Unknown value type: ${JSON.stringify(value)}`);
}

