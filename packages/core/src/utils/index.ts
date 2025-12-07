/**
 * Utility functions
 */

/**
 * Escape SQL identifier (table/column names)
 */
export function escapeIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Escape SQL string literal
 */
export function escapeString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Format SQL for readability
 */
export function formatSQL(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/**
 * Generate unique policy name
 */
export function generatePolicyName(
  table: string,
  command: string,
  suffix?: string
): string {
  const parts = [table, command.toLowerCase()];
  if (suffix) {
    parts.push(suffix);
  }
  return parts.join('_');
}

/**
 * Validate PostgreSQL identifier
 */
export function isValidIdentifier(identifier: string): boolean {
  // PostgreSQL identifiers: start with letter or underscore, contain letters, digits, underscores
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier);
}

/**
 * Parse schema-qualified table name
 */
export function parseTableName(qualifiedName: string): {
  schema: string;
  table: string;
} {
  const parts = qualifiedName.split('.');
  if (parts.length === 2) {
    return { schema: parts[0] || 'public', table: parts[1] || qualifiedName };
  }
  return { schema: 'public', table: qualifiedName };
}

