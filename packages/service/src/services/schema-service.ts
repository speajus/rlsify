/**
 * Schema Service Implementation - gRPC service for database schema introspection
 */

import type { Pool } from 'pg';
import { create } from '@bufbuild/protobuf';
import type { ServiceImpl } from '@connectrpc/connect';
import {
  type SchemaServiceProto,
  GetSchemaResponseSchema,
  GetTableResponseSchema,
  GetForeignKeysResponseSchema,
  SchemaInfoSchema,
  TableInfoSchema,
  ColumnInfoSchema,
  ForeignKeyRelationSchema,
  type GetSchemaRequest,
  type GetTableRequest,
  type GetForeignKeysRequest,
} from '@speajus/rlsify-types';

export class SchemaServiceImpl implements ServiceImpl<typeof SchemaServiceProto> {
  constructor(private pool: Pool) {}

  async getSchema(request: GetSchemaRequest) {
    const schemaName = request.schema ?? 'public';

    // Query tables
    const tablesResult = await this.pool.query<{
      table_schema: string;
      table_name: string;
    }>(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `, [schemaName]);

    const tables = await Promise.all(
      tablesResult.rows.map(async (row) => {
        const tableInfo = await this.fetchTableInfo(row.table_schema, row.table_name);
        return tableInfo;
      })
    );

    // Query all foreign keys in schema
    const fksResult = await this.pool.query<{
      source_table: string;
      source_column: string;
      target_table: string;
      target_column: string;
      constraint_name: string;
    }>(`
      SELECT
        tc.table_name as source_table,
        kcu.column_name as source_column,
        ccu.table_name as target_table,
        ccu.column_name as target_column,
        tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
    `, [schemaName]);

    const foreignKeys = fksResult.rows.map((row) =>
      create(ForeignKeyRelationSchema, {
        sourceTable: row.source_table,
        sourceColumn: row.source_column,
        targetTable: row.target_table,
        targetColumn: row.target_column,
        constraintName: row.constraint_name,
      })
    );

    return create(GetSchemaResponseSchema, {
      schema: create(SchemaInfoSchema, {
        tables,
        foreignKeys,
      }),
    });
  }

  async getTable(request: GetTableRequest) {
    const schemaName = request.schema ?? 'public';
    const tableInfo = await this.fetchTableInfo(schemaName, request.tableName);

    return create(GetTableResponseSchema, {
      table: tableInfo,
    });
  }

  async getForeignKeys(request: GetForeignKeysRequest) {
    const schemaName = request.schema ?? 'public';

    const result = await this.pool.query<{
      source_table: string;
      source_column: string;
      target_table: string;
      target_column: string;
      constraint_name: string;
    }>(`
      SELECT
        tc.table_name as source_table,
        kcu.column_name as source_column,
        ccu.table_name as target_table,
        ccu.column_name as target_column,
        tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
        AND (tc.table_name = $2 OR ccu.table_name = $2)
    `, [schemaName, request.tableName]);

    const foreignKeys = result.rows.map((row) =>
      create(ForeignKeyRelationSchema, {
        sourceTable: row.source_table,
        sourceColumn: row.source_column,
        targetTable: row.target_table,
        targetColumn: row.target_column,
        constraintName: row.constraint_name,
      })
    );

    return create(GetForeignKeysResponseSchema, { foreignKeys });
  }

  private async fetchTableInfo(schemaName: string, tableName: string) {
    // Query columns
    const columnsResult = await this.pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `, [schemaName, tableName]);

    // Query primary keys
    const pkResult = await this.pool.query<{ column_name: string }>(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
    `, [schemaName, tableName]);

    const primaryKeys = pkResult.rows.map((r) => r.column_name);

    // Query foreign keys for this table
    const fkResult = await this.pool.query<{ column_name: string }>(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
    `, [schemaName, tableName]);

    const fkColumns = new Set(fkResult.rows.map((r) => r.column_name));

    const columns = columnsResult.rows.map((row) => {
      const colInfo: {
        name: string;
        type: string;
        nullable: boolean;
        isPrimaryKey: boolean;
        isForeignKey: boolean;
        defaultValue?: string;
      } = {
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        isPrimaryKey: primaryKeys.includes(row.column_name),
        isForeignKey: fkColumns.has(row.column_name),
      };
      if (row.column_default) {
        colInfo.defaultValue = row.column_default;
      }
      return create(ColumnInfoSchema, colInfo);
    });

    return create(TableInfoSchema, {
      schema: schemaName,
      name: tableName,
      columns,
      primaryKeys,
      foreignKeys: [], // Will be populated at schema level
    });
  }
}

