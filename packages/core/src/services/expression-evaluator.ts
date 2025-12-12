/**
 * Client-side expression evaluator for testing RLS policies
 * Evaluates JSON permission expressions against sample row data and session context
 */

import type { PermissionExpression, SessionVariable, ColumnReference } from '@speajus/rlsify-types';

/** Session context for policy evaluation (simulates PostgreSQL session variables) */
export interface SessionContext {
  userId?: string;
  role?: string;
  claims?: Record<string, unknown>;
  variables?: Record<string, unknown>;
}

export type RowData = Record<string, unknown>;
export type RelatedData = Record<string, RowData[]>;

export interface EvaluationResult {
  allowed: boolean;
  reason?: string;
}

export interface PolicyEvaluationResult {
  policyName: string;
  command: string;
  usingResult: EvaluationResult;
  withCheckResult: EvaluationResult;
  overallAllowed: boolean;
}

function resolveSessionVariable(variable: SessionVariable, context: SessionContext): unknown {
  const varName = variable.var.toLowerCase();

  // Handle auth.uid() - current user ID
  if (varName === 'auth.uid()' || varName === 'auth.uid') {
    return context.userId;
  }

  // Handle auth.role() or current_user - current role
  if (varName === 'auth.role()' || varName === 'auth.role' || varName === 'current_user') {
    return context.role;
  }

  // Handle current_setting('request.jwt.claims')::json->>'key' format (Supabase style)
  const jwtClaimMatch = varName.match(/current_setting\s*\(\s*['"]request\.jwt\.claims['"]\s*\)\s*::json\s*->>?\s*['"]([^'"]+)['"]/i);
  if (jwtClaimMatch && jwtClaimMatch[1] && context.claims) {
    const claimKey = jwtClaimMatch[1];
    return context.claims[claimKey];
  }

  // Handle auth.jwt()->>'key' format (Hasura style)
  if (varName.startsWith('auth.jwt()') && context.claims) {
    const match = varName.match(/->>?\s*'([^']+)'/);
    if (match && match[1]) {
      return context.claims[match[1]];
    }
    return context.claims;
  }

  // Handle (auth.jwt()->'app_metadata'->>'org_id') nested format
  const nestedJwtMatch = varName.match(/auth\.jwt\(\)\s*->\s*'([^']+)'\s*->>?\s*'([^']+)'/);
  if (nestedJwtMatch && nestedJwtMatch[1] && nestedJwtMatch[2] && context.claims) {
    const outerKey = nestedJwtMatch[1];
    const innerKey = nestedJwtMatch[2];
    const outer = context.claims[outerKey];
    if (typeof outer === 'object' && outer !== null) {
      return (outer as Record<string, unknown>)[innerKey];
    }
    return undefined;
  }

  return context.variables?.[variable.var];
}

function resolveValue(value: unknown, row: RowData, context: SessionContext): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object' && 'var' in value) return resolveSessionVariable(value as SessionVariable, context);
  if (typeof value === 'object' && 'column' in value) return row[(value as ColumnReference).column];
  if (Array.isArray(value)) return value.map(v => resolveValue(v, row, context));
  return value;
}

function compareValues(a: unknown, b: unknown, operator: string): boolean {
  if (a === null || a === undefined) {
    if (operator === '_is_null') return b === true;
    if (operator === '_eq') return b === null || b === undefined;
    if (operator === '_neq' || operator === '_ne') return b !== null && b !== undefined;
    return false;
  }
  const norm = (v: unknown): unknown => typeof v === 'string' ? v.toLowerCase().trim() : v;
  const normA = norm(a), normB = norm(b);
  switch (operator) {
    case '_eq': return normA === normB;
    case '_neq': case '_ne': return normA !== normB;
    case '_gt': return (a as number) > (b as number);
    case '_gte': case '_ge': return (a as number) >= (b as number);
    case '_lt': return (a as number) < (b as number);
    case '_lte': case '_le': return (a as number) <= (b as number);
    case '_in': return Array.isArray(b) && b.some(item => norm(item) === normA);
    case '_nin': return !Array.isArray(b) || !b.some(item => norm(item) === normA);
    case '_like': {
      if (typeof a !== 'string' || typeof b !== 'string') return false;
      const pattern = b.replace(/%/g, '.*').replace(/_/g, '.');
      return new RegExp('^' + pattern + '$').test(a);
    }
    case '_ilike': {
      if (typeof a !== 'string' || typeof b !== 'string') return false;
      const pattern = b.replace(/%/g, '.*').replace(/_/g, '.');
      return new RegExp('^' + pattern + '$', 'i').test(a);
    }
    case '_is_null': return b === true ? (a === null || a === undefined) : (a !== null && a !== undefined);
    default: return false;
  }
}

function evaluateNode(
  expr: PermissionExpression,
  row: RowData,
  context: SessionContext,
  relatedData?: RelatedData
): boolean {
  if ('_and' in expr && Array.isArray(expr._and)) {
    return expr._and.every(subExpr => evaluateNode(subExpr, row, context, relatedData));
  }
  if ('_or' in expr && Array.isArray(expr._or)) {
    return expr._or.some(subExpr => evaluateNode(subExpr, row, context, relatedData));
  }
  if ('_not' in expr) {
    const notExpr = expr as { _not: PermissionExpression };
    return !evaluateNode(notExpr._not, row, context, relatedData);
  }
  if ('_exists' in expr) {
    const existsExpr = (expr as { _exists: { _table: string | { schema: string; name: string }; _where: PermissionExpression } })._exists;
    const tableName = typeof existsExpr._table === 'string'
      ? existsExpr._table
      : existsExpr._table.schema + '.' + existsExpr._table.name;
    const relatedRows = relatedData?.[tableName] || [];
    return relatedRows.some(relatedRow => {
      const mergedRow = { ...row, ...relatedRow };
      return evaluateNode(existsExpr._where, mergedRow, context, relatedData);
    });
  }
  // Field expression
  for (const [fieldName, comparison] of Object.entries(expr)) {
    if (fieldName.startsWith('_')) continue;
    const fieldValue = row[fieldName];
    if (typeof comparison !== 'object' || comparison === null) continue;
    for (const [operator, operand] of Object.entries(comparison as Record<string, unknown>)) {
      if (!operator.startsWith('_')) continue;
      const resolvedOperand = resolveValue(operand, row, context);
      if (!compareValues(fieldValue, resolvedOperand, operator)) return false;
    }
  }
  return true;
}

export function evaluateExpression(
  expression: PermissionExpression | undefined | null,
  row: RowData,
  context: SessionContext,
  relatedData?: RelatedData
): EvaluationResult {
  if (!expression) return { allowed: true, reason: 'No expression defined (allows all)' };
  try {
    const result = evaluateNode(expression, row, context, relatedData);
    return { allowed: result, reason: result ? 'Expression evaluated to true' : 'Expression evaluated to false' };
  } catch (error) {
    return { allowed: false, reason: 'Evaluation error: ' + (error instanceof Error ? error.message : String(error)) };
  }
}

export function evaluatePolicy(
  policy: { name: string; command: string; usingExpression?: PermissionExpression; withCheckExpression?: PermissionExpression },
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE',
  row: RowData,
  context: SessionContext,
  relatedData?: RelatedData
): PolicyEvaluationResult {
  const usingResult = evaluateExpression(policy.usingExpression, row, context, relatedData);
  const withCheckResult = evaluateExpression(policy.withCheckExpression, row, context, relatedData);
  let overallAllowed = true;
  switch (operation) {
    case 'SELECT': case 'DELETE': overallAllowed = usingResult.allowed; break;
    case 'INSERT': overallAllowed = withCheckResult.allowed; break;
    case 'UPDATE': overallAllowed = usingResult.allowed && withCheckResult.allowed; break;
  }
  return { policyName: policy.name, command: policy.command, usingResult, withCheckResult, overallAllowed };
}
