/**
 * PostgreSQL RLS Stored Procedure Tests
 * 
 * These tests use @testcontainers/postgresql to spin up a real PostgreSQL container
 * and test the RLS stored procedures defined in docker/postgres/init/05-rls-functions.sql
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Client } = pg;

// Test timeout for container startup
const CONTAINER_TIMEOUT = 120_000;
const HOOK_TIMEOUT = 60_000;

describe('PostgreSQL RLS Functions', { timeout: CONTAINER_TIMEOUT }, () => {
  let container: StartedPostgreSqlContainer;
  let client: pg.Client;        // Superuser client for DDL operations
  let rlsClient: pg.Client;     // Non-superuser client for RLS testing

  // Read SQL files from docker/postgres/init
  const getInitSql = () => {
    const initDir = path.resolve(__dirname, '../../../../docker/postgres/init');
    const schemaSQL = fs.readFileSync(path.join(initDir, '01-schema.sql'), 'utf-8');
    const seedDataSQL = fs.readFileSync(path.join(initDir, '02-seed-data.sql'), 'utf-8');
    const authHelpersSQL = fs.readFileSync(path.join(initDir, '03-auth-helpers.sql'), 'utf-8');
    const rlsFunctionsSQL = fs.readFileSync(path.join(initDir, '05-rls-functions.sql'), 'utf-8');
    return { schemaSQL, seedDataSQL, authHelpersSQL, rlsFunctionsSQL };
  };

  beforeAll(async () => {
    // Start PostgreSQL container
    container = await new PostgreSqlContainer('postgres:16')
      .withDatabase('rlsify_test')
      .withUsername('test')
      .withPassword('test')
      .start();

    // Connect to the container as superuser for DDL operations
    client = new Client({
      connectionString: container.getConnectionUri(),
    });
    await client.connect();

    // Initialize the database with schema and functions
    const { schemaSQL, seedDataSQL, authHelpersSQL, rlsFunctionsSQL } = getInitSql();

    // Create the rlsify role that the schema expects (non-superuser for RLS testing)
    await client.query(`CREATE ROLE rlsify WITH LOGIN PASSWORD 'rlsify'`);

    await client.query(schemaSQL);
    await client.query(seedDataSQL);
    await client.query(authHelpersSQL);
    await client.query(rlsFunctionsSQL);

    // Grant rlsify role access to all tables and functions for RLS testing
    await client.query(`GRANT USAGE ON SCHEMA public TO rlsify`);
    await client.query(`GRANT USAGE ON SCHEMA auth TO rlsify`);
    await client.query(`GRANT USAGE ON SCHEMA rls TO rlsify`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rlsify`);
    await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO rlsify`);
    await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA rls TO rlsify`);

    // Create a second connection as rlsify user (non-superuser) for RLS testing
    const connectionUri = container.getConnectionUri();
    const rlsifyUri = connectionUri.replace('test:test', 'rlsify:rlsify');
    rlsClient = new Client({ connectionString: rlsifyUri });
    await rlsClient.connect();
  }, HOOK_TIMEOUT);

  afterAll(async () => {
    if (rlsClient) await rlsClient.end();
    if (client) await client.end();
    if (container) await container.stop();
  }, HOOK_TIMEOUT);

  beforeEach(async () => {
    // Clear auth context between tests
    await client.query('SELECT auth.clear_user()');
  });

  // =========================================================================
  // Test: rls.compile_value - Value Compilation Tests
  // =========================================================================
  describe('rls.compile_value', () => {
    describe('literal values', () => {
      it('compiles null to NULL', async () => {
        const result = await client.query("SELECT rls.compile_value('null'::jsonb)");
        expect(result.rows[0].compile_value).toBe('NULL');
      });

      it('compiles string literal with proper quoting', async () => {
        const result = await client.query(`SELECT rls.compile_value('"hello world"'::jsonb)`);
        expect(result.rows[0].compile_value).toBe("'hello world'");
      });

      it('compiles string with special characters', async () => {
        const result = await client.query(`SELECT rls.compile_value('"it''s a test"'::jsonb)`);
        expect(result.rows[0].compile_value).toBe("'it''s a test'");
      });

      it('compiles integer number', async () => {
        const result = await client.query("SELECT rls.compile_value('42'::jsonb)");
        expect(result.rows[0].compile_value).toBe('42');
      });

      it('compiles decimal number', async () => {
        const result = await client.query("SELECT rls.compile_value('3.14159'::jsonb)");
        expect(result.rows[0].compile_value).toBe('3.14159');
      });

      it('compiles negative number', async () => {
        const result = await client.query("SELECT rls.compile_value('-100'::jsonb)");
        expect(result.rows[0].compile_value).toBe('-100');
      });

      it('compiles boolean true', async () => {
        const result = await client.query("SELECT rls.compile_value('true'::jsonb)");
        expect(result.rows[0].compile_value).toBe('true');
      });

      it('compiles boolean false', async () => {
        const result = await client.query("SELECT rls.compile_value('false'::jsonb)");
        expect(result.rows[0].compile_value).toBe('false');
      });

      it('compiles empty array', async () => {
        const result = await client.query("SELECT rls.compile_value('[]'::jsonb)");
        expect(result.rows[0].compile_value).toBe('ARRAY[]');
      });

      it('compiles array of strings', async () => {
        const result = await client.query(`SELECT rls.compile_value('["a", "b", "c"]'::jsonb)`);
        expect(result.rows[0].compile_value).toBe("ARRAY['a', 'b', 'c']");
      });

      it('compiles array of numbers', async () => {
        const result = await client.query("SELECT rls.compile_value('[1, 2, 3]'::jsonb)");
        expect(result.rows[0].compile_value).toBe('ARRAY[1, 2, 3]');
      });

      it('compiles mixed array', async () => {
        const result = await client.query(`SELECT rls.compile_value('[1, "two", true]'::jsonb)`);
        expect(result.rows[0].compile_value).toBe("ARRAY[1, 'two', true]");
      });
    });

    describe('session variables', () => {
      it('compiles auth.uid() variable', async () => {
        const result = await client.query(`SELECT rls.compile_value('{"var": "auth.uid()"}'::jsonb)`);
        expect(result.rows[0].compile_value).toBe('auth.uid()');
      });

      it('compiles custom session variable', async () => {
        const result = await client.query(
          `SELECT rls.compile_value('{"var": "current_setting(''app.tenant_id'')"}'::jsonb)`
        );
        expect(result.rows[0].compile_value).toBe("current_setting('app.tenant_id')");
      });

      it('compiles variable with type hint', async () => {
        const result = await client.query(
          `SELECT rls.compile_value('{"var": "auth.uid()", "type": "uuid"}'::jsonb)`
        );
        expect(result.rows[0].compile_value).toBe('auth.uid()');
      });
    });

    describe('column references', () => {
      it('compiles simple column reference', async () => {
        const result = await client.query(`SELECT rls.compile_value('{"column": "users.id"}'::jsonb)`);
        expect(result.rows[0].compile_value).toBe('users.id');
      });

      it('compiles unqualified column reference', async () => {
        const result = await client.query(`SELECT rls.compile_value('{"column": "created_by"}'::jsonb)`);
        expect(result.rows[0].compile_value).toBe('created_by');
      });
    });

    describe('error handling', () => {
      it('throws error for unknown object structure', async () => {
        await expect(
          client.query(`SELECT rls.compile_value('{"unknown": "field"}'::jsonb)`)
        ).rejects.toThrow(/Unknown value object structure/);
      });
    });
  });

  // =========================================================================
  // Test: rls.compile_comparison - Comparison Operator Tests
  // =========================================================================
  describe('rls.compile_comparison', () => {
    describe('equality operators', () => {
      it('compiles _eq with literal', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('status', '_eq', '"active"'::jsonb)`
        );
        // PostgreSQL format %I only quotes when necessary (special chars/reserved words)
        expect(result.rows[0].compile_comparison).toBe(`status = 'active'`);
      });

      it('compiles _eq with session variable', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('user_id', '_eq', '{"var": "auth.uid()"}'::jsonb)`
        );
        expect(result.rows[0].compile_comparison).toBe('user_id = auth.uid()');
      });

      it('compiles _neq', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('status', '_neq', '"deleted"'::jsonb)`
        );
        expect(result.rows[0].compile_comparison).toBe(`status != 'deleted'`);
      });
    });

    describe('comparison operators', () => {
      it('compiles _gt (greater than)', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('age', '_gt', '18'::jsonb)`
        );
        expect(result.rows[0].compile_comparison).toBe('age > 18');
      });

      it('compiles _gte (greater than or equal)', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('priority', '_gte', '5'::jsonb)`
        );
        expect(result.rows[0].compile_comparison).toBe('priority >= 5');
      });

      it('compiles _lt (less than)', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('count', '_lt', '100'::jsonb)`
        );
        expect(result.rows[0].compile_comparison).toBe('count < 100');
      });

      it('compiles _lte (less than or equal)', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('level', '_lte', '10'::jsonb)`
        );
        expect(result.rows[0].compile_comparison).toBe('level <= 10');
      });
    });

    describe('set operators', () => {
      it('compiles _in with array', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('role', '_in', '["admin", "editor", "viewer"]'::jsonb)`
        );
        expect(result.rows[0].compile_comparison).toBe(`role IN ('admin', 'editor', 'viewer')`);
      });

      it('compiles _nin with array', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('status', '_nin', '["deleted", "archived"]'::jsonb)`
        );
        expect(result.rows[0].compile_comparison).toBe(`status NOT IN ('deleted', 'archived')`);
      });

      it('compiles _in with session variable (array type)', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('team_id', '_in', '{"var": "auth.jwt_claims()->''team_ids''"}'::jsonb)`
        );
        expect(result.rows[0].compile_comparison).toContain('= ANY');
      });
    });

    describe('pattern matching operators', () => {
      it('compiles _like', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('email', '_like', '"%@company.com"'::jsonb)`
        );
        expect(result.rows[0].compile_comparison).toBe(`email LIKE '%@company.com'`);
      });

      it('compiles _ilike (case insensitive)', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('name', '_ilike', '"%john%"'::jsonb)`
        );
        expect(result.rows[0].compile_comparison).toBe(`name ILIKE '%john%'`);
      });

      it('compiles _nlike', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('path', '_nlike', '"/private/%"'::jsonb)`
        );
        expect(result.rows[0].compile_comparison).toBe(`path NOT LIKE '/private/%'`);
      });

      it('compiles _nilike', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('category', '_nilike', '"%test%"'::jsonb)`
        );
        expect(result.rows[0].compile_comparison).toBe(`category NOT ILIKE '%test%'`);
      });

      it('compiles _similar', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('code', '_similar', '"ABC[0-9]+"'::jsonb)`
        );
        expect(result.rows[0].compile_comparison).toBe(`code SIMILAR TO 'ABC[0-9]+'`);
      });

      it('compiles _nsimilar', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('sku', '_nsimilar', '"TEST-%"'::jsonb)`
        );
        expect(result.rows[0].compile_comparison).toBe(`sku NOT SIMILAR TO 'TEST-%'`);
      });
    });

    describe('null operators', () => {
      it('compiles _is_null true', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('deleted_at', '_is_null', 'true'::jsonb)`
        );
        expect(result.rows[0].compile_comparison).toBe('deleted_at IS NULL');
      });

      it('compiles _is_null false', async () => {
        const result = await client.query(
          `SELECT rls.compile_comparison('verified_at', '_is_null', 'false'::jsonb)`
        );
        expect(result.rows[0].compile_comparison).toBe('verified_at IS NOT NULL');
      });
    });

    describe('error handling', () => {
      it('throws error for unknown operator', async () => {
        await expect(
          client.query(`SELECT rls.compile_comparison('field', '_unknown', '"value"'::jsonb)`)
        ).rejects.toThrow(/Unknown operator/);
      });
    });
  });

  // =========================================================================
  // Test: rls.compile_expression - Expression Compilation Tests
  // =========================================================================
  describe('rls.compile_expression', () => {
    describe('simple field expressions', () => {
      it('compiles single field equality', async () => {
        const result = await client.query(
          `SELECT rls.compile_expression('{"user_id": {"_eq": {"var": "auth.uid()"}}}'::jsonb)`
        );
        expect(result.rows[0].compile_expression).toBe('user_id = auth.uid()');
      });

      it('compiles field with literal value', async () => {
        const result = await client.query(
          `SELECT rls.compile_expression('{"is_public": {"_eq": true}}'::jsonb)`
        );
        expect(result.rows[0].compile_expression).toBe('is_public = true');
      });

      it('compiles multiple field conditions (implicit AND)', async () => {
        const result = await client.query(
          `SELECT rls.compile_expression('{"status": {"_eq": "active"}, "is_deleted": {"_eq": false}}'::jsonb)`
        );
        // Multiple conditions are joined with AND
        expect(result.rows[0].compile_expression).toContain('status = ');
        expect(result.rows[0].compile_expression).toContain('is_deleted = false');
        expect(result.rows[0].compile_expression).toContain(' AND ');
      });
    });

    describe('null and empty expressions', () => {
      it('compiles null expression to true', async () => {
        const result = await client.query(`SELECT rls.compile_expression(NULL)`);
        expect(result.rows[0].compile_expression).toBe('true');
      });

      it('compiles empty object to true', async () => {
        const result = await client.query(`SELECT rls.compile_expression('{}'::jsonb)`);
        expect(result.rows[0].compile_expression).toBe('true');
      });
    });

    describe('_and operator', () => {
      it('compiles simple _and', async () => {
        const result = await client.query(
          `SELECT rls.compile_expression('{"_and": [{"is_active": {"_eq": true}}, {"status": {"_eq": "published"}}]}'::jsonb)`
        );
        expect(result.rows[0].compile_expression).toContain('is_active = true');
        expect(result.rows[0].compile_expression).toContain('status =');
        expect(result.rows[0].compile_expression).toContain(' AND ');
      });

      it('compiles empty _and array to true', async () => {
        const result = await client.query(
          `SELECT rls.compile_expression('{"_and": []}'::jsonb)`
        );
        // Empty _and returns true (vacuous truth - all zero conditions are satisfied)
        expect(result.rows[0].compile_expression).toBe('true');
      });

      it('compiles _and with three conditions', async () => {
        const expr = JSON.stringify({
          _and: [
            { field1: { _eq: 'a' } },
            { field2: { _eq: 'b' } },
            { field3: { _eq: 'c' } }
          ]
        });
        const result = await client.query(`SELECT rls.compile_expression('${expr}'::jsonb)`);
        const sql = result.rows[0].compile_expression;
        expect(sql).toContain('field1');
        expect(sql).toContain('field2');
        expect(sql).toContain('field3');
        expect((sql.match(/ AND /g) || []).length).toBe(2);
      });
    });

    describe('_or operator', () => {
      it('compiles simple _or', async () => {
        const result = await client.query(
          `SELECT rls.compile_expression('{"_or": [{"is_public": {"_eq": true}}, {"user_id": {"_eq": {"var": "auth.uid()"}}}]}'::jsonb)`
        );
        expect(result.rows[0].compile_expression).toContain('is_public = true');
        expect(result.rows[0].compile_expression).toContain('auth.uid()');
        expect(result.rows[0].compile_expression).toContain(' OR ');
      });

      it('compiles empty _or array to false', async () => {
        const result = await client.query(
          `SELECT rls.compile_expression('{"_or": []}'::jsonb)`
        );
        // Empty _or returns false (no conditions can be satisfied)
        expect(result.rows[0].compile_expression).toBe('false');
      });
    });

    describe('_not operator', () => {
      it('compiles simple _not', async () => {
        const result = await client.query(
          `SELECT rls.compile_expression('{"_not": {"is_deleted": {"_eq": true}}}'::jsonb)`
        );
        expect(result.rows[0].compile_expression).toBe('NOT (is_deleted = true)');
      });

      it('compiles nested _not', async () => {
        const result = await client.query(
          `SELECT rls.compile_expression('{"_not": {"_or": [{"status": {"_eq": "deleted"}}, {"status": {"_eq": "archived"}}]}}'::jsonb)`
        );
        expect(result.rows[0].compile_expression).toContain('NOT (');
        expect(result.rows[0].compile_expression).toContain(' OR ');
      });
    });

    describe('_exists operator', () => {
      it('compiles simple _exists', async () => {
        const expr = JSON.stringify({
          _exists: {
            _table: 'team_members',
            _where: {
              team_id: { _eq: { column: 'teams.id' } },
              user_id: { _eq: { var: 'auth.uid()' } }
            }
          }
        });
        const result = await client.query(`SELECT rls.compile_expression('${expr}'::jsonb)`);
        expect(result.rows[0].compile_expression).toContain('EXISTS (SELECT 1 FROM team_members WHERE');
        expect(result.rows[0].compile_expression).toContain('teams.id');
        expect(result.rows[0].compile_expression).toContain('auth.uid()');
      });

      it('compiles _exists with schema-qualified table', async () => {
        const expr = JSON.stringify({
          _exists: {
            _table: { schema: 'public', name: 'team_members' },
            _where: {
              user_id: { _eq: { var: 'auth.uid()' } }
            }
          }
        });
        const result = await client.query(`SELECT rls.compile_expression('${expr}'::jsonb)`);
        expect(result.rows[0].compile_expression).toContain('EXISTS (SELECT 1 FROM public.team_members');
      });
    });

    describe('complex nested expressions', () => {
      it('compiles user-owned OR public pattern', async () => {
        const expr = JSON.stringify({
          _or: [
            { created_by: { _eq: { var: 'auth.uid()' } } },
            { is_public: { _eq: true } }
          ]
        });
        const result = await client.query(`SELECT rls.compile_expression('${expr}'::jsonb)`);
        const sql = result.rows[0].compile_expression;
        expect(sql).toContain('created_by = auth.uid()');
        expect(sql).toContain('is_public = true');
        expect(sql).toContain(' OR ');
      });

      it('compiles team-based access with _exists and _and', async () => {
        const expr = JSON.stringify({
          _and: [
            { is_deleted: { _eq: false } },
            {
              _exists: {
                _table: 'team_members',
                _where: {
                  team_id: { _eq: { column: 'projects.team_id' } },
                  user_id: { _eq: { var: 'auth.uid()' } }
                }
              }
            }
          ]
        });
        const result = await client.query(`SELECT rls.compile_expression('${expr}'::jsonb)`);
        const sql = result.rows[0].compile_expression;
        expect(sql).toContain('is_deleted = false');
        expect(sql).toContain('EXISTS (SELECT 1 FROM team_members');
        expect(sql).toContain(' AND ');
      });

      it('compiles role-based access with _in operator', async () => {
        const expr = JSON.stringify({
          _and: [
            {
              _exists: {
                _table: 'team_members',
                _where: {
                  team_id: { _eq: { column: 'projects.team_id' } },
                  user_id: { _eq: { var: 'auth.uid()' } },
                  role: { _in: ['admin', 'owner'] }
                }
              }
            }
          ]
        });
        const result = await client.query(`SELECT rls.compile_expression('${expr}'::jsonb)`);
        const sql = result.rows[0].compile_expression;
        expect(sql).toContain('EXISTS');
        expect(sql).toContain("IN ('admin', 'owner')");
      });

      it('compiles organization-scoped access with nested _exists', async () => {
        const expr = JSON.stringify({
          _exists: {
            _table: 'teams',
            _where: {
              id: { _eq: { column: 'documents.team_id' } },
              _exists: {
                _table: 'organization_members',
                _where: {
                  organization_id: { _eq: { column: 'teams.organization_id' } },
                  user_id: { _eq: { var: 'auth.uid()' } }
                }
              }
            }
          }
        });
        const result = await client.query(`SELECT rls.compile_expression('${expr}'::jsonb)`);
        const sql = result.rows[0].compile_expression;
        // Should have nested EXISTS
        expect(sql.match(/EXISTS/g)?.length).toBeGreaterThanOrEqual(2);
        expect(sql).toContain('organization_members');
      });
    });
  });

  // =========================================================================
  // Test: rls.generate_policy_sql - SQL Generation Tests
  // =========================================================================
  describe('rls.generate_policy_sql', () => {
    describe('basic policy generation', () => {
      it('generates enable RLS and force RLS statements', async () => {
        const config = JSON.stringify({
          table: 'test_table',
          enableRLS: true,
          policies: []
        });
        const result = await client.query(`SELECT rls.generate_policy_sql('${config}'::jsonb)`);
        const sql = result.rows[0].generate_policy_sql;
        expect(sql).toContain('ALTER TABLE test_table ENABLE ROW LEVEL SECURITY');
        expect(sql).toContain('ALTER TABLE test_table FORCE ROW LEVEL SECURITY');
      });

      it('omits RLS statements when enableRLS is false', async () => {
        const config = JSON.stringify({
          table: 'test_table',
          enableRLS: false,
          policies: [
            {
              name: 'test_policy',
              command: 'SELECT',
              using: 'true'
            }
          ]
        });
        const result = await client.query(`SELECT rls.generate_policy_sql('${config}'::jsonb)`);
        const sql = result.rows[0].generate_policy_sql;
        expect(sql).not.toContain('ENABLE ROW LEVEL SECURITY');
      });

      it('throws error when table is not specified', async () => {
        const config = JSON.stringify({ policies: [] });
        await expect(
          client.query(`SELECT rls.generate_policy_sql('${config}'::jsonb)`)
        ).rejects.toThrow(/config.table is required/);
      });
    });

    describe('policy SQL generation', () => {
      it('generates SELECT policy with USING clause', async () => {
        const config = JSON.stringify({
          table: 'resources',
          policies: [
            {
              name: 'select_own',
              command: 'SELECT',
              usingExpression: { created_by: { _eq: { var: 'auth.uid()' } } }
            }
          ]
        });
        const result = await client.query(`SELECT rls.generate_policy_sql('${config}'::jsonb)`);
        const sql = result.rows[0].generate_policy_sql;
        expect(sql).toContain('DROP POLICY IF EXISTS select_own ON resources');
        expect(sql).toContain('CREATE POLICY select_own ON resources');
        expect(sql).toContain('AS PERMISSIVE');
        expect(sql).toContain('FOR SELECT');
        expect(sql).toContain('TO PUBLIC');
        expect(sql).toContain('USING (');
        expect(sql).toContain('auth.uid()');
      });

      it('generates INSERT policy with WITH CHECK clause', async () => {
        const config = JSON.stringify({
          table: 'resources',
          policies: [
            {
              name: 'insert_own',
              command: 'INSERT',
              withCheckExpression: { created_by: { _eq: { var: 'auth.uid()' } } }
            }
          ]
        });
        const result = await client.query(`SELECT rls.generate_policy_sql('${config}'::jsonb)`);
        const sql = result.rows[0].generate_policy_sql;
        expect(sql).toContain('FOR INSERT');
        expect(sql).toContain('WITH CHECK (');
      });

      it('generates UPDATE policy with both USING and WITH CHECK', async () => {
        const config = JSON.stringify({
          table: 'resources',
          policies: [
            {
              name: 'update_own',
              command: 'UPDATE',
              usingExpression: { created_by: { _eq: { var: 'auth.uid()' } } },
              withCheckExpression: { created_by: { _eq: { var: 'auth.uid()' } } }
            }
          ]
        });
        const result = await client.query(`SELECT rls.generate_policy_sql('${config}'::jsonb)`);
        const sql = result.rows[0].generate_policy_sql;
        expect(sql).toContain('FOR UPDATE');
        expect(sql).toContain('USING (');
        expect(sql).toContain('WITH CHECK (');
      });

      it('generates DELETE policy', async () => {
        const config = JSON.stringify({
          table: 'resources',
          policies: [
            {
              name: 'delete_own',
              command: 'DELETE',
              usingExpression: { created_by: { _eq: { var: 'auth.uid()' } } }
            }
          ]
        });
        const result = await client.query(`SELECT rls.generate_policy_sql('${config}'::jsonb)`);
        const sql = result.rows[0].generate_policy_sql;
        expect(sql).toContain('FOR DELETE');
      });

      it('generates policy with raw SQL using clause', async () => {
        const config = JSON.stringify({
          table: 'resources',
          policies: [
            {
              name: 'raw_sql_policy',
              command: 'SELECT',
              using: 'created_by = auth.uid() OR is_public = true'
            }
          ]
        });
        const result = await client.query(`SELECT rls.generate_policy_sql('${config}'::jsonb)`);
        const sql = result.rows[0].generate_policy_sql;
        expect(sql).toContain('USING (created_by = auth.uid() OR is_public = true)');
      });
    });

    describe('policy options', () => {
      it('generates RESTRICTIVE policy', async () => {
        const config = JSON.stringify({
          table: 'resources',
          policies: [
            {
              name: 'restrictive_policy',
              command: 'SELECT',
              permissive: false,
              using: 'true'
            }
          ]
        });
        const result = await client.query(`SELECT rls.generate_policy_sql('${config}'::jsonb)`);
        const sql = result.rows[0].generate_policy_sql;
        expect(sql).toContain('AS RESTRICTIVE');
      });

      it('generates policy with specific roles', async () => {
        const config = JSON.stringify({
          table: 'resources',
          policies: [
            {
              name: 'admin_policy',
              command: 'ALL',
              roles: ['admin_role', 'superuser_role'],
              using: 'true'
            }
          ]
        });
        const result = await client.query(`SELECT rls.generate_policy_sql('${config}'::jsonb)`);
        const sql = result.rows[0].generate_policy_sql;
        expect(sql).toContain('TO admin_role, superuser_role');
      });

      it('defaults to ALL command when not specified', async () => {
        const config = JSON.stringify({
          table: 'resources',
          policies: [
            {
              name: 'default_command',
              using: 'true'
            }
          ]
        });
        const result = await client.query(`SELECT rls.generate_policy_sql('${config}'::jsonb)`);
        const sql = result.rows[0].generate_policy_sql;
        expect(sql).toContain('FOR ALL');
      });
    });

    describe('multiple policies', () => {
      it('generates SQL for multiple policies', async () => {
        const config = JSON.stringify({
          table: 'resources',
          policies: [
            { name: 'select_policy', command: 'SELECT', using: 'true' },
            { name: 'insert_policy', command: 'INSERT', withCheck: 'true' },
            { name: 'update_policy', command: 'UPDATE', using: 'true', withCheck: 'true' },
            { name: 'delete_policy', command: 'DELETE', using: 'true' }
          ]
        });
        const result = await client.query(`SELECT rls.generate_policy_sql('${config}'::jsonb)`);
        const sql = result.rows[0].generate_policy_sql;
        expect(sql).toContain('select_policy');
        expect(sql).toContain('insert_policy');
        expect(sql).toContain('update_policy');
        expect(sql).toContain('delete_policy');
      });
    });
  });

  // =========================================================================
  // Test: rls.apply_policy - Policy Application Tests
  // =========================================================================
  describe('rls.apply_policy', () => {
    // Create a test table for policy application tests
    beforeAll(async () => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS test_apply_policy (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name TEXT NOT NULL,
          owner_id UUID,
          is_public BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
    });

    afterAll(async () => {
      await client.query('DROP TABLE IF EXISTS test_apply_policy CASCADE');
    });

    beforeEach(async () => {
      // Clean up policies before each test
      await client.query(`SELECT rls.drop_all_policies('test_apply_policy')`);
      await client.query('ALTER TABLE test_apply_policy DISABLE ROW LEVEL SECURITY');
    });

    it('applies policy and enables RLS on table', async () => {
      const config = JSON.stringify({
        table: 'test_apply_policy',
        enableRLS: true,
        policies: [
          {
            name: 'test_select',
            command: 'SELECT',
            using: 'true'
          }
        ]
      });

      await client.query(`SELECT rls.apply_policy('${config}'::jsonb)`);

      // Verify RLS is enabled
      const rlsResult = await client.query(`
        SELECT relrowsecurity, relforcerowsecurity
        FROM pg_class
        WHERE relname = 'test_apply_policy'
      `);
      expect(rlsResult.rows[0].relrowsecurity).toBe(true);
      expect(rlsResult.rows[0].relforcerowsecurity).toBe(true);

      // Verify policy exists
      const policyResult = await client.query(`
        SELECT policyname, cmd, permissive
        FROM pg_policies
        WHERE tablename = 'test_apply_policy'
      `);
      expect(policyResult.rows.length).toBe(1);
      expect(policyResult.rows[0].policyname).toBe('test_select');
    });

    it('replaces existing policy with same name', async () => {
      // Apply first policy
      const config1 = JSON.stringify({
        table: 'test_apply_policy',
        enableRLS: true,
        policies: [{ name: 'test_policy', command: 'SELECT', using: 'true' }]
      });
      await client.query(`SELECT rls.apply_policy('${config1}'::jsonb)`);

      // Apply second policy with same name but different expression
      const config2 = JSON.stringify({
        table: 'test_apply_policy',
        enableRLS: true,
        policies: [{ name: 'test_policy', command: 'SELECT', using: 'false' }]
      });
      await client.query(`SELECT rls.apply_policy('${config2}'::jsonb)`);

      // Verify only one policy exists
      const policyResult = await client.query(`
        SELECT COUNT(*) as count FROM pg_policies WHERE tablename = 'test_apply_policy'
      `);
      expect(parseInt(policyResult.rows[0].count)).toBe(1);
    });

    it('applies multiple policies in single call', async () => {
      const config = JSON.stringify({
        table: 'test_apply_policy',
        enableRLS: true,
        policies: [
          { name: 'select_all', command: 'SELECT', using: 'true' },
          { name: 'insert_check', command: 'INSERT', withCheck: 'true' },
          { name: 'update_check', command: 'UPDATE', using: 'true', withCheck: 'true' }
        ]
      });

      await client.query(`SELECT rls.apply_policy('${config}'::jsonb)`);

      const policyResult = await client.query(`
        SELECT policyname FROM pg_policies WHERE tablename = 'test_apply_policy'
      `);
      expect(policyResult.rows.length).toBe(3);
    });
  });

  // =========================================================================
  // Test: rls.drop_all_policies - Policy Removal Tests
  // =========================================================================
  describe('rls.drop_all_policies', () => {
    beforeAll(async () => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS test_drop_policies (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
        )
      `);
    });

    afterAll(async () => {
      await client.query('DROP TABLE IF EXISTS test_drop_policies CASCADE');
    });

    it('drops all policies on a table', async () => {
      // Create multiple policies
      await client.query(`ALTER TABLE test_drop_policies ENABLE ROW LEVEL SECURITY`);
      await client.query(`CREATE POLICY policy1 ON test_drop_policies FOR SELECT USING (true)`);
      await client.query(`CREATE POLICY policy2 ON test_drop_policies FOR INSERT WITH CHECK (true)`);
      await client.query(`CREATE POLICY policy3 ON test_drop_policies FOR UPDATE USING (true)`);

      // Drop all policies
      const result = await client.query(`SELECT rls.drop_all_policies('test_drop_policies')`);
      expect(result.rows[0].drop_all_policies).toBe(3);

      // Verify no policies exist
      const policyResult = await client.query(`
        SELECT COUNT(*) as count FROM pg_policies WHERE tablename = 'test_drop_policies'
      `);
      expect(parseInt(policyResult.rows[0].count)).toBe(0);
    });

    it('returns 0 when no policies exist', async () => {
      // Ensure no policies
      await client.query(`SELECT rls.drop_all_policies('test_drop_policies')`);

      const result = await client.query(`SELECT rls.drop_all_policies('test_drop_policies')`);
      expect(result.rows[0].drop_all_policies).toBe(0);
    });
  });

  // =========================================================================
  // Test: RLS Policy Enforcement - Positive and Negative Access Tests
  // =========================================================================
  describe('RLS Policy Enforcement', () => {
    // User IDs for testing (matching seed data)
    const ALICE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const BOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const CAROL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const DAVID_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const EMMA_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

    // Team IDs from seed data
    const ACME_ENGINEERING_TEAM = '44444444-4444-4444-4444-444444444444';
    const ACME_MARKETING_TEAM = '55555555-5555-5555-5555-555555555555';
    const TECHSTART_PRODUCT_TEAM = '66666666-6666-6666-6666-666666666666';

    // Organization IDs from seed data
    const ACME_ORG = '11111111-1111-1111-1111-111111111111';
    const TECHSTART_ORG = '22222222-2222-2222-2222-222222222222';

    describe('Pattern 1: User-Owned Resources', () => {
      beforeAll(async () => {
        // Drop any existing policies (superuser)
        await client.query(`SELECT rls.drop_all_policies('resources')`);
        await client.query('ALTER TABLE resources DISABLE ROW LEVEL SECURITY');

        // Apply user-owned policy (superuser)
        const config = JSON.stringify({
          table: 'resources',
          enableRLS: true,
          policies: [
            {
              name: 'user_owns_resource',
              command: 'SELECT',
              usingExpression: { created_by: { _eq: { var: 'auth.uid()' } } }
            }
          ]
        });
        await client.query(`SELECT rls.apply_policy('${config}'::jsonb)`);
      });

      afterAll(async () => {
        await client.query(`SELECT rls.drop_all_policies('resources')`);
        await client.query('ALTER TABLE resources DISABLE ROW LEVEL SECURITY');
      });

      it('allows user to see their own resources (positive)', async () => {
        // Set user context on rlsClient (non-superuser)
        await rlsClient.query(`SELECT auth.set_user('${ALICE_ID}')`);

        const result = await rlsClient.query(`
          SELECT name FROM resources ORDER BY name
        `);

        // Alice should see her resources
        const names = result.rows.map(r => r.name);
        expect(names).toContain('Alice Resource 1');
        expect(names).toContain('Alice Resource 2');
        expect(names).toContain('Alice Archived');
      });

      it('blocks user from seeing other users resources (negative)', async () => {
        await rlsClient.query(`SELECT auth.set_user('${ALICE_ID}')`);

        const result = await rlsClient.query(`
          SELECT name FROM resources ORDER BY name
        `);

        // Alice should NOT see Bob's or David's resources
        const names = result.rows.map(r => r.name);
        expect(names).not.toContain('Bob Resource 1');
        expect(names).not.toContain('Bob Inactive');
        expect(names).not.toContain('David Resource 1');
      });

      it('returns empty results for unauthenticated user (negative)', async () => {
        await rlsClient.query('SELECT auth.clear_user()');

        const result = await rlsClient.query('SELECT COUNT(*) as count FROM resources');
        expect(parseInt(result.rows[0].count)).toBe(0);
      });

      it('each user sees only their own resources (positive)', async () => {
        // Test as Bob
        await rlsClient.query(`SELECT auth.set_user('${BOB_ID}')`);
        let result = await rlsClient.query('SELECT name FROM resources');
        let names = result.rows.map(r => r.name);
        expect(names).toContain('Bob Resource 1');
        expect(names).not.toContain('Alice Resource 1');

        // Test as David
        await rlsClient.query(`SELECT auth.set_user('${DAVID_ID}')`);
        result = await rlsClient.query('SELECT name FROM resources');
        names = result.rows.map(r => r.name);
        expect(names).toContain('David Resource 1');
        expect(names).not.toContain('Alice Resource 1');
        expect(names).not.toContain('Bob Resource 1');
      });
    });

    describe('Pattern 2: Public or Owner Access', () => {
      beforeAll(async () => {
        await client.query(`SELECT rls.drop_all_policies('documents')`);
        await client.query('ALTER TABLE documents DISABLE ROW LEVEL SECURITY');

        // Apply public-or-owner policy (superuser)
        const config = JSON.stringify({
          table: 'documents',
          enableRLS: true,
          policies: [
            {
              name: 'public_or_owner',
              command: 'SELECT',
              usingExpression: {
                _or: [
                  { is_public: { _eq: true } },
                  { created_by: { _eq: { var: 'auth.uid()' } } }
                ]
              }
            }
          ]
        });
        await client.query(`SELECT rls.apply_policy('${config}'::jsonb)`);
      });

      afterAll(async () => {
        await client.query(`SELECT rls.drop_all_policies('documents')`);
        await client.query('ALTER TABLE documents DISABLE ROW LEVEL SECURITY');
      });

      it('allows user to see public documents (positive)', async () => {
        await rlsClient.query(`SELECT auth.set_user('${DAVID_ID}')`);

        const result = await rlsClient.query(`
          SELECT title FROM documents WHERE is_public = true
        `);

        // David should see public docs even from other teams
        const titles = result.rows.map(r => r.title);
        expect(titles.length).toBeGreaterThan(0);
        expect(titles).toContain('API Documentation');
        expect(titles).toContain('Brand Guidelines');
        expect(titles).toContain('User Guide');
      });

      it('allows user to see their own private documents (positive)', async () => {
        await rlsClient.query(`SELECT auth.set_user('${ALICE_ID}')`);

        const result = await rlsClient.query(`
          SELECT title FROM documents WHERE is_public = false AND created_by = '${ALICE_ID}'
        `);

        const titles = result.rows.map(r => r.title);
        expect(titles).toContain('Architecture Guide');
      });

      it('blocks user from seeing other users private documents (negative)', async () => {
        await rlsClient.query(`SELECT auth.set_user('${DAVID_ID}')`);

        const result = await rlsClient.query(`
          SELECT title FROM documents
        `);

        // David should NOT see private docs from other users
        const titles = result.rows.map(r => r.title);
        expect(titles).not.toContain('Architecture Guide');  // Alice's private doc
        expect(titles).not.toContain('Campaign Strategy');   // Carol's private doc
      });

      it('unauthenticated user sees only public documents', async () => {
        await rlsClient.query('SELECT auth.clear_user()');

        const result = await rlsClient.query('SELECT title, is_public FROM documents');

        // All returned docs should be public
        result.rows.forEach(row => {
          expect(row.is_public).toBe(true);
        });
      });
    });

    describe('Pattern 3: Team-Based Access', () => {
      beforeAll(async () => {
        await client.query(`SELECT rls.drop_all_policies('projects')`);
        await client.query('ALTER TABLE projects DISABLE ROW LEVEL SECURITY');

        // Apply team-based access policy using EXISTS (superuser)
        const config = JSON.stringify({
          table: 'projects',
          enableRLS: true,
          policies: [
            {
              name: 'team_member_access',
              command: 'SELECT',
              usingExpression: {
                _exists: {
                  _table: 'team_members',
                  _where: {
                    team_id: { _eq: { column: 'projects.team_id' } },
                    user_id: { _eq: { var: 'auth.uid()' } }
                  }
                }
              }
            }
          ]
        });
        await client.query(`SELECT rls.apply_policy('${config}'::jsonb)`);
      });

      afterAll(async () => {
        await client.query(`SELECT rls.drop_all_policies('projects')`);
        await client.query('ALTER TABLE projects DISABLE ROW LEVEL SECURITY');
      });

      it('allows team members to see team projects (positive)', async () => {
        // Alice is in Acme Engineering team
        await rlsClient.query(`SELECT auth.set_user('${ALICE_ID}')`);

        const result = await rlsClient.query('SELECT name FROM projects');
        const names = result.rows.map(r => r.name);

        // Should see Engineering projects
        expect(names).toContain('Mobile App');
        expect(names).toContain('API Gateway');
        expect(names).toContain('Legacy Migration');
      });

      it('blocks non-team members from seeing team projects (negative)', async () => {
        // Carol is in Marketing, not Engineering
        await rlsClient.query(`SELECT auth.set_user('${CAROL_ID}')`);

        const result = await rlsClient.query('SELECT name FROM projects');
        const names = result.rows.map(r => r.name);

        // Should NOT see Engineering projects
        expect(names).not.toContain('Mobile App');
        expect(names).not.toContain('API Gateway');

        // Should see Marketing projects
        expect(names).toContain('Q4 Campaign');
      });

      it('blocks cross-organization access (negative)', async () => {
        // David is at TechStart, should not see Acme projects
        await rlsClient.query(`SELECT auth.set_user('${DAVID_ID}')`);

        const result = await rlsClient.query('SELECT name FROM projects');
        const names = result.rows.map(r => r.name);

        // Should NOT see Acme projects
        expect(names).not.toContain('Mobile App');
        expect(names).not.toContain('Q4 Campaign');

        // Should see TechStart projects
        expect(names).toContain('MVP Launch');
        expect(names).toContain('Feature Expansion');
      });

      it('unauthenticated user sees no projects', async () => {
        await rlsClient.query('SELECT auth.clear_user()');

        const result = await rlsClient.query('SELECT COUNT(*) as count FROM projects');
        expect(parseInt(result.rows[0].count)).toBe(0);
      });
    });

    describe('Pattern 4: Role-Based Team Access', () => {
      let testTableCreated = false;

      beforeAll(async () => {
        // Create a test table for role-based access (superuser)
        await client.query(`
          CREATE TABLE IF NOT EXISTS sensitive_data (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            data TEXT NOT NULL,
            classification TEXT NOT NULL CHECK (classification IN ('public', 'internal', 'confidential'))
          )
        `);
        testTableCreated = true;

        // Grant rlsify access to the new table
        await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON sensitive_data TO rlsify`);

        // Insert test data
        await client.query(`
          INSERT INTO sensitive_data (team_id, data, classification) VALUES
            ('${ACME_ENGINEERING_TEAM}', 'Public roadmap', 'public'),
            ('${ACME_ENGINEERING_TEAM}', 'Internal metrics', 'internal'),
            ('${ACME_ENGINEERING_TEAM}', 'Security keys', 'confidential'),
            ('${TECHSTART_PRODUCT_TEAM}', 'TechStart public', 'public'),
            ('${TECHSTART_PRODUCT_TEAM}', 'TechStart secrets', 'confidential')
        `);

        // Apply role-based policy: admins see all, members see only public/internal
        const config = JSON.stringify({
          table: 'sensitive_data',
          enableRLS: true,
          policies: [
            {
              name: 'team_admin_full_access',
              command: 'SELECT',
              usingExpression: {
                _exists: {
                  _table: 'team_members',
                  _where: {
                    team_id: { _eq: { column: 'sensitive_data.team_id' } },
                    user_id: { _eq: { var: 'auth.uid()' } },
                    role: { _eq: 'admin' }
                  }
                }
              }
            },
            {
              name: 'team_member_limited_access',
              command: 'SELECT',
              usingExpression: {
                _and: [
                  {
                    _exists: {
                      _table: 'team_members',
                      _where: {
                        team_id: { _eq: { column: 'sensitive_data.team_id' } },
                        user_id: { _eq: { var: 'auth.uid()' } }
                      }
                    }
                  },
                  { classification: { _in: ['public', 'internal'] } }
                ]
              }
            }
          ]
        });
        await client.query(`SELECT rls.apply_policy('${config}'::jsonb)`);
      });

      afterAll(async () => {
        if (testTableCreated) {
          await client.query('DROP TABLE IF EXISTS sensitive_data CASCADE');
        }
      });

      it('team admin sees all classifications (positive)', async () => {
        // Alice is admin of Engineering team
        await rlsClient.query(`SELECT auth.set_user('${ALICE_ID}')`);

        const result = await rlsClient.query(`
          SELECT data, classification FROM sensitive_data ORDER BY data
        `);

        const classifications = result.rows.map(r => r.classification);
        expect(classifications).toContain('public');
        expect(classifications).toContain('internal');
        expect(classifications).toContain('confidential');
      });

      it('team member sees only public and internal (positive/negative)', async () => {
        // Bob is member (not admin) of Engineering team
        await rlsClient.query(`SELECT auth.set_user('${BOB_ID}')`);

        const result = await rlsClient.query(`
          SELECT data, classification FROM sensitive_data ORDER BY data
        `);

        const classifications = result.rows.map(r => r.classification);
        expect(classifications).toContain('public');
        expect(classifications).toContain('internal');
        expect(classifications).not.toContain('confidential');
      });

      it('cross-organization users see nothing (negative)', async () => {
        // David is at TechStart, should not see Acme data
        await rlsClient.query(`SELECT auth.set_user('${DAVID_ID}')`);

        const result = await rlsClient.query(`
          SELECT data FROM sensitive_data WHERE team_id = '${ACME_ENGINEERING_TEAM}'
        `);

        expect(result.rows.length).toBe(0);
      });
    });

    describe('Pattern 5: Organization Tenant Isolation', () => {
      beforeAll(async () => {
        await client.query(`SELECT rls.drop_all_policies('teams')`);
        await client.query('ALTER TABLE teams DISABLE ROW LEVEL SECURITY');

        // Apply organization isolation policy (superuser)
        const config = JSON.stringify({
          table: 'teams',
          enableRLS: true,
          policies: [
            {
              name: 'org_member_sees_teams',
              command: 'SELECT',
              usingExpression: {
                _exists: {
                  _table: 'organization_members',
                  _where: {
                    organization_id: { _eq: { column: 'teams.organization_id' } },
                    user_id: { _eq: { var: 'auth.uid()' } }
                  }
                }
              }
            }
          ]
        });
        await client.query(`SELECT rls.apply_policy('${config}'::jsonb)`);
      });

      afterAll(async () => {
        await client.query(`SELECT rls.drop_all_policies('teams')`);
        await client.query('ALTER TABLE teams DISABLE ROW LEVEL SECURITY');
      });

      it('org member sees all teams in their org (positive)', async () => {
        // Alice is in Acme org
        await rlsClient.query(`SELECT auth.set_user('${ALICE_ID}')`);

        const result = await rlsClient.query('SELECT name FROM teams ORDER BY name');
        const names = result.rows.map(r => r.name);

        // Should see both Acme teams
        expect(names).toContain('Engineering');
        expect(names).toContain('Marketing');
      });

      it('org member cannot see teams from other orgs (negative)', async () => {
        // Alice is in Acme, should not see TechStart or Global teams
        await rlsClient.query(`SELECT auth.set_user('${ALICE_ID}')`);

        const result = await rlsClient.query('SELECT name FROM teams ORDER BY name');
        const names = result.rows.map(r => r.name);

        expect(names).not.toContain('Product');
        expect(names).not.toContain('Operations');
      });

      it('complete tenant isolation between organizations (negative)', async () => {
        // David is at TechStart
        await rlsClient.query(`SELECT auth.set_user('${DAVID_ID}')`);

        const result = await rlsClient.query('SELECT name FROM teams ORDER BY name');
        const names = result.rows.map(r => r.name);

        // Should only see TechStart team
        expect(names).toContain('Product');
        expect(names).not.toContain('Engineering');
        expect(names).not.toContain('Marketing');
        expect(names).not.toContain('Operations');
      });
    });

    describe('Pattern 6: CRUD Policy Enforcement', () => {
      let crudTestTableCreated = false;

      beforeAll(async () => {
        // Create test table for CRUD operations (superuser)
        await client.query(`
          CREATE TABLE IF NOT EXISTS crud_test (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name TEXT NOT NULL,
            owner_id UUID NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        crudTestTableCreated = true;

        // Grant rlsify access to the new table
        await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON crud_test TO rlsify`);

        // Apply full CRUD policies
        const config = JSON.stringify({
          table: 'crud_test',
          enableRLS: true,
          policies: [
            {
              name: 'select_own',
              command: 'SELECT',
              usingExpression: { owner_id: { _eq: { var: 'auth.uid()' } } }
            },
            {
              name: 'insert_own',
              command: 'INSERT',
              withCheckExpression: { owner_id: { _eq: { var: 'auth.uid()' } } }
            },
            {
              name: 'update_own',
              command: 'UPDATE',
              usingExpression: { owner_id: { _eq: { var: 'auth.uid()' } } },
              withCheckExpression: { owner_id: { _eq: { var: 'auth.uid()' } } }
            },
            {
              name: 'delete_own',
              command: 'DELETE',
              usingExpression: { owner_id: { _eq: { var: 'auth.uid()' } } }
            }
          ]
        });
        await client.query(`SELECT rls.apply_policy('${config}'::jsonb)`);
      });

      afterAll(async () => {
        if (crudTestTableCreated) {
          await client.query('DROP TABLE IF EXISTS crud_test CASCADE');
        }
      });

      beforeEach(async () => {
        // Clean up test data (superuser can delete all)
        await client.query('DELETE FROM crud_test');
      });

      it('allows INSERT when owner_id matches user (positive)', async () => {
        await rlsClient.query(`SELECT auth.set_user('${ALICE_ID}')`);

        await expect(
          rlsClient.query(`
            INSERT INTO crud_test (name, owner_id) VALUES ('Alice item', '${ALICE_ID}')
          `)
        ).resolves.not.toThrow();
      });

      it('blocks INSERT when owner_id does not match user (negative)', async () => {
        await rlsClient.query(`SELECT auth.set_user('${ALICE_ID}')`);

        await expect(
          rlsClient.query(`
            INSERT INTO crud_test (name, owner_id) VALUES ('Fake item', '${BOB_ID}')
          `)
        ).rejects.toThrow(/row-level security/i);
      });

      it('allows UPDATE on own records (positive)', async () => {
        // First insert a record
        await rlsClient.query(`SELECT auth.set_user('${ALICE_ID}')`);
        await rlsClient.query(`
          INSERT INTO crud_test (name, owner_id) VALUES ('Original', '${ALICE_ID}')
        `);

        // Update should work
        const result = await rlsClient.query(`
          UPDATE crud_test SET name = 'Updated' WHERE owner_id = '${ALICE_ID}'
        `);
        expect(result.rowCount).toBe(1);
      });

      it('blocks UPDATE on others records (negative)', async () => {
        // Insert as Alice
        await rlsClient.query(`SELECT auth.set_user('${ALICE_ID}')`);
        await rlsClient.query(`
          INSERT INTO crud_test (name, owner_id) VALUES ('Alice item', '${ALICE_ID}')
        `);

        // Try to update as Bob (should affect 0 rows due to RLS)
        await rlsClient.query(`SELECT auth.set_user('${BOB_ID}')`);
        const result = await rlsClient.query(`
          UPDATE crud_test SET name = 'Hacked' WHERE name = 'Alice item'
        `);
        expect(result.rowCount).toBe(0);
      });

      it('allows DELETE on own records (positive)', async () => {
        await rlsClient.query(`SELECT auth.set_user('${ALICE_ID}')`);
        await rlsClient.query(`
          INSERT INTO crud_test (name, owner_id) VALUES ('To delete', '${ALICE_ID}')
        `);

        const result = await rlsClient.query(`DELETE FROM crud_test WHERE name = 'To delete'`);
        expect(result.rowCount).toBe(1);
      });

      it('blocks DELETE on others records (negative)', async () => {
        // Insert as Alice
        await rlsClient.query(`SELECT auth.set_user('${ALICE_ID}')`);
        await rlsClient.query(`
          INSERT INTO crud_test (name, owner_id) VALUES ('Alice item', '${ALICE_ID}')
        `);

        // Try to delete as Bob
        await rlsClient.query(`SELECT auth.set_user('${BOB_ID}')`);
        const result = await rlsClient.query(`DELETE FROM crud_test WHERE name = 'Alice item'`);
        expect(result.rowCount).toBe(0);
      });
    });

    describe('Pattern 7: Restrictive Policies', () => {
      let restrictiveTestCreated = false;

      beforeAll(async () => {
        // Create test table (superuser)
        await client.query(`
          CREATE TABLE IF NOT EXISTS restrictive_test (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name TEXT NOT NULL,
            owner_id UUID NOT NULL,
            is_approved BOOLEAN DEFAULT FALSE
          )
        `);
        restrictiveTestCreated = true;

        // Grant rlsify access to the new table
        await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON restrictive_test TO rlsify`);

        // Insert test data
        await client.query(`
          INSERT INTO restrictive_test (name, owner_id, is_approved) VALUES
            ('Approved item', '${ALICE_ID}', true),
            ('Pending item', '${ALICE_ID}', false),
            ('Bob approved', '${BOB_ID}', true),
            ('Bob pending', '${BOB_ID}', false)
        `);

        // Apply permissive policy (owner can see) + restrictive policy (must be approved)
        const permissiveConfig = JSON.stringify({
          table: 'restrictive_test',
          enableRLS: true,
          policies: [
            {
              name: 'owner_access',
              command: 'SELECT',
              permissive: true,
              usingExpression: { owner_id: { _eq: { var: 'auth.uid()' } } }
            }
          ]
        });
        await client.query(`SELECT rls.apply_policy('${permissiveConfig}'::jsonb)`);

        // Add restrictive policy - must ALSO be approved
        const restrictiveConfig = JSON.stringify({
          table: 'restrictive_test',
          enableRLS: false, // Don't re-enable, just add policy
          policies: [
            {
              name: 'must_be_approved',
              command: 'SELECT',
              permissive: false,
              usingExpression: { is_approved: { _eq: true } }
            }
          ]
        });
        await client.query(`SELECT rls.apply_policy('${restrictiveConfig}'::jsonb)`);
      });

      afterAll(async () => {
        if (restrictiveTestCreated) {
          await client.query('DROP TABLE IF EXISTS restrictive_test CASCADE');
        }
      });

      it('restrictive policy further limits permissive policy results', async () => {
        await rlsClient.query(`SELECT auth.set_user('${ALICE_ID}')`);

        const result = await rlsClient.query('SELECT name, is_approved FROM restrictive_test');

        // Alice should only see her approved items (restrictive + permissive)
        expect(result.rows.length).toBe(1);
        expect(result.rows[0].name).toBe('Approved item');
        expect(result.rows[0].is_approved).toBe(true);
      });
    });

    describe('Pattern 8: Complex Multi-Level Access', () => {
      it('handles deeply nested organization access', async () => {
        // Test the existing documents table with org-level isolation (superuser)
        await client.query(`SELECT rls.drop_all_policies('documents')`);

        const config = JSON.stringify({
          table: 'documents',
          enableRLS: true,
          policies: [
            {
              name: 'org_member_access',
              command: 'SELECT',
              usingExpression: {
                _exists: {
                  _table: 'teams',
                  _where: {
                    id: { _eq: { column: 'documents.team_id' } },
                    _exists: {
                      _table: 'organization_members',
                      _where: {
                        organization_id: { _eq: { column: 'teams.organization_id' } },
                        user_id: { _eq: { var: 'auth.uid()' } }
                      }
                    }
                  }
                }
              }
            }
          ]
        });
        await client.query(`SELECT rls.apply_policy('${config}'::jsonb)`);

        // Alice (Acme org) should see Acme documents (rlsClient for RLS enforcement)
        await rlsClient.query(`SELECT auth.set_user('${ALICE_ID}')`);
        let result = await rlsClient.query('SELECT title FROM documents ORDER BY title');
        let titles = result.rows.map(r => r.title);

        expect(titles).toContain('Architecture Guide');
        expect(titles).toContain('API Documentation');
        expect(titles).toContain('Brand Guidelines');
        expect(titles).toContain('Campaign Strategy');

        // David (TechStart org) should only see TechStart documents
        await rlsClient.query(`SELECT auth.set_user('${DAVID_ID}')`);
        result = await rlsClient.query('SELECT title FROM documents ORDER BY title');
        titles = result.rows.map(r => r.title);

        expect(titles).toContain('Product Roadmap');
        expect(titles).toContain('User Guide');
        expect(titles).not.toContain('Architecture Guide');
        expect(titles).not.toContain('Brand Guidelines');

        // Clean up (superuser)
        await client.query(`SELECT rls.drop_all_policies('documents')`);
        await client.query('ALTER TABLE documents DISABLE ROW LEVEL SECURITY');
      });
    });
  });

  // =========================================================================
  // Test: Edge Cases and Error Handling
  // =========================================================================
  describe('Edge Cases and Error Handling', () => {
    describe('SQL injection prevention', () => {
      it('safely handles special characters in string values', async () => {
        const dangerousValue = "'; DROP TABLE users; --";
        const expr = JSON.stringify({
          name: { _eq: dangerousValue }
        });
        const result = await client.query(`SELECT rls.compile_expression('${expr.replace(/'/g, "''")}'::jsonb)`);
        expect(result.rows[0].compile_expression).toContain("''");
        // Should not cause an error
      });

      it('safely handles table names with special characters', async () => {
        const config = JSON.stringify({
          table: 'public.my_table',  // Schema-qualified name
          enableRLS: true,
          policies: [{ name: 'test', command: 'SELECT', using: 'true' }]
        });
        const result = await client.query(`SELECT rls.generate_policy_sql('${config}'::jsonb)`);
        expect(result.rows[0].generate_policy_sql).toContain('public.my_table');
      });
    });

    describe('auth helper functions', () => {
      it('auth.uid() returns null when no user set', async () => {
        await client.query('SELECT auth.clear_user()');
        const result = await client.query('SELECT auth.uid()');
        expect(result.rows[0].uid).toBeNull();
      });

      it('auth.uid() returns correct user after set', async () => {
        const testId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        await client.query(`SELECT auth.set_user('${testId}')`);
        const result = await client.query('SELECT auth.uid()');
        expect(result.rows[0].uid).toBe(testId);
      });

      it('auth.clear_user() resets the user context', async () => {
        const testId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
        await client.query(`SELECT auth.set_user('${testId}')`);
        await client.query('SELECT auth.clear_user()');
        const result = await client.query('SELECT auth.uid()');
        expect(result.rows[0].uid).toBeNull();
      });
    });

    describe('is_comparison_operator helper', () => {
      it('returns true for valid operators', async () => {
        const operators = ['_eq', '_neq', '_gt', '_gte', '_lt', '_lte', '_in', '_nin',
                          '_like', '_ilike', '_nlike', '_nilike', '_is_null', '_similar', '_nsimilar'];

        for (const op of operators) {
          const result = await client.query(`SELECT rls.is_comparison_operator('${op}')`);
          expect(result.rows[0].is_comparison_operator).toBe(true);
        }
      });

      it('returns false for invalid operators', async () => {
        const invalidOps = ['_unknown', '_regex', '_contains', 'eq', 'neq', ''];

        for (const op of invalidOps) {
          const result = await client.query(`SELECT rls.is_comparison_operator('${op}')`);
          expect(result.rows[0].is_comparison_operator).toBe(false);
        }
      });
    });

    describe('empty and null handling', () => {
      it('handles empty policies array', async () => {
        const config = JSON.stringify({
          table: 'resources',
          enableRLS: true,
          policies: []
        });
        const result = await client.query(`SELECT rls.generate_policy_sql('${config}'::jsonb)`);
        expect(result.rows[0].generate_policy_sql).toContain('ENABLE ROW LEVEL SECURITY');
      });

      it('handles null values in expressions', async () => {
        const expr = JSON.stringify({
          field: { _eq: null }
        });
        const result = await client.query(`SELECT rls.compile_expression('${expr}'::jsonb)`);
        expect(result.rows[0].compile_expression).toContain('NULL');
      });
    });
  });
});

