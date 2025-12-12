/**
 * SQL Expression Parser
 * 
 * Converts PostgreSQL RLS policy expressions (SQL) to the JSON permission format
 * used by the UI and stored procedures.
 * 
 * Examples:
 *   "user_id = auth.uid()" 
 *     → { "user_id": { "_eq": { "var": "auth.uid()" } } }
 * 
 *   "is_public = true OR user_id = auth.uid()"
 *     → { "_or": [{ "is_public": { "_eq": true } }, { "user_id": { "_eq": { "var": "auth.uid()" } } }] }
 */

import type { PermissionExpression, ComparisonOperator } from '@speajus/rlsify-types';

// Token types
type TokenType =
  | 'IDENTIFIER'
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'NULL'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'IN'
  | 'LIKE'
  | 'ILIKE'
  | 'IS'
  | 'EXISTS'
  | 'SELECT'
  | 'FROM'
  | 'WHERE'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

/**
 * Tokenizes a SQL expression into tokens
 */
function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  const keywords: Record<string, TokenType> = {
    AND: 'AND',
    OR: 'OR',
    NOT: 'NOT',
    IN: 'IN',
    LIKE: 'LIKE',
    ILIKE: 'ILIKE',
    IS: 'IS',
    NULL: 'NULL',
    TRUE: 'BOOLEAN',
    FALSE: 'BOOLEAN',
    EXISTS: 'EXISTS',
    SELECT: 'SELECT',
    FROM: 'FROM',
    WHERE: 'WHERE',
  };

  while (pos < sql.length) {
    const char = sql.charAt(pos);
    const nextChar = sql.charAt(pos + 1);

    // Skip whitespace
    if (/\s/.test(char)) {
      pos++;
      continue;
    }

    const startPos = pos;

    // String literals
    if (char === "'") {
      pos++;
      let value = '';
      while (pos < sql.length && sql.charAt(pos) !== "'") {
        const c = sql.charAt(pos);
        const nc = sql.charAt(pos + 1);
        if (c === "'" && nc === "'") {
          value += "'";
          pos += 2;
        } else {
          value += c;
          pos++;
        }
      }
      pos++; // closing quote
      tokens.push({ type: 'STRING', value, position: startPos });
      continue;
    }

    // Numbers
    if (/\d/.test(char) || (char === '-' && /\d/.test(nextChar))) {
      let value = '';
      if (sql.charAt(pos) === '-') {
        value += sql.charAt(pos);
        pos++;
      }
      while (pos < sql.length && /[\d.]/.test(sql.charAt(pos))) {
        value += sql.charAt(pos);
        pos++;
      }
      tokens.push({ type: 'NUMBER', value, position: startPos });
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(char)) {
      let value = '';
      while (pos < sql.length && /[a-zA-Z0-9_.]/.test(sql.charAt(pos))) {
        value += sql.charAt(pos);
        pos++;
      }
      // Check for function calls
      if (sql.charAt(pos) === '(') {
        // It's a function call, include the parentheses and arguments
        let parenDepth = 1;
        value += sql.charAt(pos);
        pos++;
        while (pos < sql.length && parenDepth > 0) {
          const ch = sql.charAt(pos);
          if (ch === '(') parenDepth++;
          if (ch === ')') parenDepth--;
          value += ch;
          pos++;
        }
        tokens.push({ type: 'IDENTIFIER', value, position: startPos });
        continue;
      }
      
      const upperValue = value.toUpperCase();
      const keywordType = keywords[upperValue];
      if (keywordType) {
        tokens.push({ type: keywordType, value: upperValue, position: startPos });
      } else {
        tokens.push({ type: 'IDENTIFIER', value, position: startPos });
      }
      continue;
    }

    // Operators
    if (sql.substring(pos, pos + 2) === '<>' || sql.substring(pos, pos + 2) === '!=') {
      tokens.push({ type: 'OPERATOR', value: '<>', position: startPos });
      pos += 2;
      continue;
    }
    if (sql.substring(pos, pos + 2) === '<=' || sql.substring(pos, pos + 2) === '>=') {
      tokens.push({ type: 'OPERATOR', value: sql.substring(pos, pos + 2), position: startPos });
      pos += 2;
      continue;
    }
    if (['=', '<', '>'].includes(char)) {
      tokens.push({ type: 'OPERATOR', value: char, position: startPos });
      pos++;
      continue;
    }

    // Parentheses and comma
    if (char === '(') {
      tokens.push({ type: 'LPAREN', value: '(', position: startPos });
      pos++;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'RPAREN', value: ')', position: startPos });
      pos++;
      continue;
    }
    if (char === ',') {
      tokens.push({ type: 'COMMA', value: ',', position: startPos });
      pos++;
      continue;
    }

    // Unknown character - skip
    pos++;
  }

  tokens.push({ type: 'EOF', value: '', position: pos });
  return tokens;
}

/**
 * Parser class for SQL expressions
 */
class SqlExpressionParser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private current(): Token {
    return this.tokens[this.pos] || { type: 'EOF', value: '', position: 0 };
  }

  private advance(): Token {
    const token = this.current();
    this.pos++;
    return token;
  }

  private expect(type: TokenType): Token {
    const token = this.current();
    if (token.type !== type) {
      throw new Error(`Expected ${type} but got ${token.type} at position ${token.position}`);
    }
    return this.advance();
  }

  /**
   * Parse the full expression
   */
  parse(): PermissionExpression {
    const expr = this.parseOrExpression();
    if (this.current().type !== 'EOF') {
      throw new Error(`Unexpected token: ${this.current().value}`);
    }
    return expr;
  }

  private parseOrExpression(): PermissionExpression {
    let left = this.parseAndExpression();

    while (this.current().type === 'OR') {
      this.advance();
      const right = this.parseAndExpression();

      // Flatten OR expressions
      if ('_or' in left && Array.isArray(left._or)) {
        left._or.push(right);
      } else {
        left = { _or: [left, right] };
      }
    }

    return left;
  }

  private parseAndExpression(): PermissionExpression {
    let left = this.parseNotExpression();

    while (this.current().type === 'AND') {
      this.advance();
      const right = this.parseNotExpression();

      // Flatten AND expressions
      if ('_and' in left && Array.isArray(left._and)) {
        left._and.push(right);
      } else {
        left = { _and: [left, right] };
      }
    }

    return left;
  }

  private parseNotExpression(): PermissionExpression {
    if (this.current().type === 'NOT') {
      this.advance();
      const expr = this.parsePrimaryExpression();
      return { _not: expr };
    }
    return this.parsePrimaryExpression();
  }

  private parsePrimaryExpression(): PermissionExpression {
    // Handle parenthesized expressions
    if (this.current().type === 'LPAREN') {
      this.advance();
      const expr = this.parseOrExpression();
      this.expect('RPAREN');
      return expr;
    }

    // Handle EXISTS subquery
    if (this.current().type === 'EXISTS') {
      return this.parseExistsExpression();
    }

    // Handle comparison expressions
    return this.parseComparisonExpression();
  }

  private parseExistsExpression(): PermissionExpression {
    this.expect('EXISTS');
    this.expect('LPAREN');
    this.expect('SELECT');

    // Skip SELECT list (usually "1" or "*")
    while (this.current().type !== 'FROM' && this.current().type !== 'EOF') {
      this.advance();
    }

    this.expect('FROM');
    const tableName = this.expect('IDENTIFIER').value;

    let whereExpr: PermissionExpression = {};
    if (this.current().type === 'WHERE') {
      this.advance();
      whereExpr = this.parseOrExpression();
    }

    this.expect('RPAREN');

    return {
      _exists: {
        _table: tableName,
        _where: whereExpr,
      },
    };
  }

  private parseComparisonExpression(): PermissionExpression {
    const left = this.expect('IDENTIFIER').value;

    // Handle IS NULL / IS NOT NULL
    if (this.current().type === 'IS') {
      this.advance();
      const isNot = this.current().type === 'NOT';
      if (isNot) this.advance();
      this.expect('NULL');

      return {
        [left]: { _is_null: !isNot },
      } as PermissionExpression;
    }

    // Handle IN / NOT IN
    if (this.current().type === 'NOT') {
      this.advance();
      if (this.current().type === 'IN') {
        this.advance();
        const values = this.parseValueList();
        return { [left]: { _nin: values } } as PermissionExpression;
      }
      throw new Error(`Expected IN after NOT at position ${this.current().position}`);
    }

    if (this.current().type === 'IN') {
      this.advance();
      const values = this.parseValueList();
      return { [left]: { _in: values } } as PermissionExpression;
    }

    // Handle LIKE / ILIKE
    if (this.current().type === 'LIKE') {
      this.advance();
      const pattern = this.parseValue();
      return { [left]: { _like: pattern } } as PermissionExpression;
    }

    if (this.current().type === 'ILIKE') {
      this.advance();
      const pattern = this.parseValue();
      return { [left]: { _ilike: pattern } } as PermissionExpression;
    }

    // Handle comparison operators
    const opToken = this.expect('OPERATOR');
    const operator = this.mapOperator(opToken.value);
    const right = this.parseValue();

    return {
      [left]: { [operator]: right },
    } as PermissionExpression;
  }

  private mapOperator(op: string): ComparisonOperator {
    const opMap: Record<string, ComparisonOperator> = {
      '=': '_eq',
      '<>': '_neq',
      '!=': '_neq',
      '>': '_gt',
      '>=': '_gte',
      '<': '_lt',
      '<=': '_lte',
    };
    return opMap[op] || '_eq';
  }

  private parseValueList(): unknown[] {
    this.expect('LPAREN');
    const values: unknown[] = [];

    while (this.current().type !== 'RPAREN' && this.current().type !== 'EOF') {
      values.push(this.parseValue());
      if (this.current().type === 'COMMA') {
        this.advance();
      }
    }

    this.expect('RPAREN');
    return values;
  }

  private parseValue(): unknown {
    const token = this.current();

    switch (token.type) {
      case 'STRING':
        this.advance();
        return token.value;

      case 'NUMBER':
        this.advance();
        return token.value.includes('.') ? parseFloat(token.value) : parseInt(token.value, 10);

      case 'BOOLEAN':
        this.advance();
        return token.value === 'TRUE';

      case 'NULL':
        this.advance();
        return null;

      case 'IDENTIFIER':
        this.advance();
        // Check if it looks like a function call (contains parentheses) → session variable
        if (token.value.includes('(')) {
          return { var: token.value };
        }
        // Table.column reference or plain column reference → column reference
        return { column: token.value };

      default:
        throw new Error(`Unexpected token in value: ${token.type} at position ${token.position}`);
    }
  }
}

/**
 * Parse a SQL RLS expression into the JSON permission format
 *
 * @param sql - The SQL expression (e.g., "user_id = auth.uid()")
 * @returns The equivalent PermissionExpression JSON
 * @throws Error if the expression cannot be parsed
 *
 * @example
 * parseSqlExpression("user_id = auth.uid()")
 * // Returns: { "user_id": { "_eq": { "var": "auth.uid()" } } }
 *
 * @example
 * parseSqlExpression("is_public = true OR user_id = auth.uid()")
 * // Returns: { "_or": [{ "is_public": { "_eq": true } }, { "user_id": { "_eq": { "var": "auth.uid()" } } }] }
 */
export function parseSqlExpression(sql: string): PermissionExpression {
  const tokens = tokenize(sql);
  const parser = new SqlExpressionParser(tokens);
  return parser.parse();
}

/**
 * Try to parse a SQL expression, returning null if it fails
 */
export function tryParseSqlExpression(sql: string): PermissionExpression | null {
  try {
    return parseSqlExpression(sql);
  } catch {
    return null;
  }
}

/**
 * Parse a full RLS policy definition (from pg_policies view)
 *
 * @param policyDef - Object containing the policy definition from PostgreSQL
 * @returns A partial policy config that can be merged with other settings
 */
export function parseRlsPolicy(policyDef: {
  policyname: string;
  tablename: string;
  schemaname?: string;
  cmd: string;
  qual?: string;
  with_check?: string;
  roles?: string[];
  permissive?: string;
}): {
  name: string;
  table: string;
  command: string;
  usingExpression?: PermissionExpression;
  withCheckExpression?: PermissionExpression;
  using?: string;
  withCheck?: string;
  roles?: string[];
  permissive: boolean;
} {
  const result: ReturnType<typeof parseRlsPolicy> = {
    name: policyDef.policyname,
    table: policyDef.schemaname
      ? `${policyDef.schemaname}.${policyDef.tablename}`
      : policyDef.tablename,
    command: policyDef.cmd.toUpperCase(),
    permissive: policyDef.permissive !== 'RESTRICTIVE',
  };

  if (policyDef.roles && policyDef.roles.length > 0) {
    result.roles = policyDef.roles;
  }

  // Try to parse USING clause
  if (policyDef.qual) {
    const parsed = tryParseSqlExpression(policyDef.qual);
    if (parsed) {
      result.usingExpression = parsed;
    } else {
      result.using = policyDef.qual;
    }
  }

  // Try to parse WITH CHECK clause
  if (policyDef.with_check) {
    const parsed = tryParseSqlExpression(policyDef.with_check);
    if (parsed) {
      result.withCheckExpression = parsed;
    } else {
      result.withCheck = policyDef.with_check;
    }
  }

  return result;
}

