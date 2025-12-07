/**
 * SchemaIntrospector - Introspects PostgreSQL schema for table and FK information
 */

import type {
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  ForeignKeyRelation,
} from '@speajus/rlsify-types';

export interface DatabaseConnection {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
}

export class SchemaIntrospector {
  constructor(private connection?: DatabaseConnection) {}

  /**
   * Get schema information for all tables
   */
  async getSchemaInfo(schema: string = 'public'): Promise<SchemaInfo> {
    if (!this.connection) {
      throw new Error('Database connection required for schema introspection');
    }

    const tables = await this.getTables(schema);
    const foreignKeys = await this.getForeignKeys(schema);

    return {
      tables,
      foreignKeys,
    };
  }

  /**
   * Get table information
   */
  async getTableInfo(tableName: string, schema: string = 'public'): Promise<TableInfo> {
    if (!this.connection) {
      throw new Error('Database connection required for schema introspection');
    }

    const columns = await this.getColumns(tableName, schema);
    const foreignKeys = await this.getTableForeignKeys(tableName, schema);
    const primaryKeys = await this.getPrimaryKeys(tableName, schema);

    return {
      schema,
      name: tableName,
      columns,
      foreignKeys,
      primaryKeys,
    };
  }

  /**
   * Get all tables in schema
   */
  private async getTables(schema: string): Promise<TableInfo[]> {
    const result = await this.connection!.query<{ table_name: string }>(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = $1 
       AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [schema]
    );

    return Promise.all(
      result.rows.map((row) => this.getTableInfo(row.table_name, schema))
    );
  }

  /**
   * Get columns for a table
   */
  private async getColumns(tableName: string, schema: string): Promise<ColumnInfo[]> {
    const result = await this.connection!.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, tableName]
    );

    const primaryKeys = await this.getPrimaryKeys(tableName, schema);
    const foreignKeys = await this.getTableForeignKeys(tableName, schema);

    return result.rows.map((row) => ({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
      ...(row.column_default && { defaultValue: row.column_default }),
      isPrimaryKey: primaryKeys.includes(row.column_name),
      isForeignKey: foreignKeys.some((fk) => fk.sourceColumn === row.column_name),
    }));
  }

  /**
   * Get primary keys for a table
   */
  private async getPrimaryKeys(tableName: string, schema: string): Promise<string[]> {
    const result = await this.connection!.query<{ column_name: string }>(
      `SELECT a.attname AS column_name
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = $1::regclass AND i.indisprimary`,
      [`${schema}.${tableName}`]
    );

    return result.rows.map((row) => row.column_name);
  }

  /**
   * Get foreign keys for a specific table
   */
  private async getTableForeignKeys(
    tableName: string,
    schema: string
  ): Promise<ForeignKeyRelation[]> {
    const result = await this.connection!.query<{
      constraint_name: string;
      source_column: string;
      target_table: string;
      target_column: string;
    }>(
      `SELECT
        tc.constraint_name,
        kcu.column_name AS source_column,
        ccu.table_name AS target_table,
        ccu.column_name AS target_column
       FROM information_schema.table_constraints AS tc
       JOIN information_schema.key_column_usage AS kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage AS ccu
         ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema = $1
         AND tc.table_name = $2`,
      [schema, tableName]
    );

    return result.rows.map((row) => ({
      sourceTable: tableName,
      sourceColumn: row.source_column,
      targetTable: row.target_table,
      targetColumn: row.target_column,
      constraintName: row.constraint_name,
    }));
  }

  /**
   * Get all foreign keys in schema
   */
  private async getForeignKeys(schema: string): Promise<ForeignKeyRelation[]> {
    const result = await this.connection!.query<{
      constraint_name: string;
      source_table: string;
      source_column: string;
      target_table: string;
      target_column: string;
    }>(
      `SELECT
        tc.constraint_name,
        tc.table_name AS source_table,
        kcu.column_name AS source_column,
        ccu.table_name AS target_table,
        ccu.column_name AS target_column
       FROM information_schema.table_constraints AS tc
       JOIN information_schema.key_column_usage AS kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage AS ccu
         ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema = $1`,
      [schema]
    );

    return result.rows.map((row) => ({
      sourceTable: row.source_table,
      sourceColumn: row.source_column,
      targetTable: row.target_table,
      targetColumn: row.target_column,
      constraintName: row.constraint_name,
    }));
  }
}

