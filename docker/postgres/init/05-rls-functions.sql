-- ============================================================================
-- RLS Policy Functions
-- PostgreSQL stored procedures for interpreting JSON permission expressions
-- and generating/applying Row-Level Security policies
-- ============================================================================

-- Create a schema for RLS functions
CREATE SCHEMA IF NOT EXISTS rls;

-- ============================================================================
-- rls.compile_value(value JSONB) -> TEXT
-- Compiles a permission value to SQL
-- Handles: literals (string, number, boolean, null), session variables, column refs
-- ============================================================================
CREATE OR REPLACE FUNCTION rls.compile_value(value JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  val_type TEXT;
  var_name TEXT;
  col_name TEXT;
  arr_values TEXT[];
  i INT;
BEGIN
  -- Handle null
  IF value IS NULL OR value = 'null'::jsonb THEN
    RETURN 'NULL';
  END IF;

  val_type := jsonb_typeof(value);

  -- String literal
  IF val_type = 'string' THEN
    RETURN quote_literal(value #>> '{}');
  END IF;

  -- Number literal
  IF val_type = 'number' THEN
    RETURN value::TEXT;
  END IF;

  -- Boolean literal
  IF val_type = 'boolean' THEN
    RETURN CASE WHEN value::BOOLEAN THEN 'true' ELSE 'false' END;
  END IF;

  -- Array literal
  IF val_type = 'array' THEN
    arr_values := ARRAY[]::TEXT[];
    FOR i IN 0..jsonb_array_length(value) - 1 LOOP
      arr_values := arr_values || rls.compile_value(value->i);
    END LOOP;
    RETURN 'ARRAY[' || array_to_string(arr_values, ', ') || ']';
  END IF;

  -- Object: could be session variable or column reference
  IF val_type = 'object' THEN
    -- Session variable: {"var": "auth.uid()", "type": "uuid"}
    IF value ? 'var' THEN
      var_name := value->>'var';
      RETURN var_name;
    END IF;

    -- Column reference: {"column": "other_table.column_name"}
    IF value ? 'column' THEN
      col_name := value->>'column';
      RETURN col_name;
    END IF;

    -- Unknown object structure
    RAISE EXCEPTION 'Unknown value object structure: %', value;
  END IF;

  RAISE EXCEPTION 'Unknown value type: %', val_type;
END;
$$;

COMMENT ON FUNCTION rls.compile_value(JSONB) IS
'Compiles a permission value (literal, session variable, or column reference) to SQL';

-- ============================================================================
-- rls.compile_comparison(field TEXT, operator TEXT, value JSONB) -> TEXT
-- Compiles a single comparison expression to SQL
-- ============================================================================
CREATE OR REPLACE FUNCTION rls.compile_comparison(
  field TEXT,
  operator TEXT,
  value JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  right_side TEXT;
  arr_values TEXT[];
  i INT;
BEGIN
  right_side := rls.compile_value(value);

  CASE operator
    WHEN '_eq' THEN
      RETURN format('%I = %s', field, right_side);
    WHEN '_neq' THEN
      RETURN format('%I != %s', field, right_side);
    WHEN '_gt' THEN
      RETURN format('%I > %s', field, right_side);
    WHEN '_gte' THEN
      RETURN format('%I >= %s', field, right_side);
    WHEN '_lt' THEN
      RETURN format('%I < %s', field, right_side);
    WHEN '_lte' THEN
      RETURN format('%I <= %s', field, right_side);
    WHEN '_in' THEN
      IF jsonb_typeof(value) = 'array' THEN
        arr_values := ARRAY[]::TEXT[];
        FOR i IN 0..jsonb_array_length(value) - 1 LOOP
          arr_values := arr_values || rls.compile_value(value->i);
        END LOOP;
        RETURN format('%I IN (%s)', field, array_to_string(arr_values, ', '));
      ELSE
        RETURN format('%I = ANY(%s)', field, right_side);
      END IF;
    WHEN '_nin' THEN
      IF jsonb_typeof(value) = 'array' THEN
        arr_values := ARRAY[]::TEXT[];
        FOR i IN 0..jsonb_array_length(value) - 1 LOOP
          arr_values := arr_values || rls.compile_value(value->i);
        END LOOP;
        RETURN format('%I NOT IN (%s)', field, array_to_string(arr_values, ', '));
      ELSE
        RETURN format('%I != ALL(%s)', field, right_side);
      END IF;
    WHEN '_like' THEN
      RETURN format('%I LIKE %s', field, right_side);
    WHEN '_ilike' THEN
      RETURN format('%I ILIKE %s', field, right_side);
    WHEN '_nlike' THEN
      RETURN format('%I NOT LIKE %s', field, right_side);
    WHEN '_nilike' THEN
      RETURN format('%I NOT ILIKE %s', field, right_side);
    WHEN '_is_null' THEN
      IF value::BOOLEAN THEN
        RETURN format('%I IS NULL', field);
      ELSE
        RETURN format('%I IS NOT NULL', field);
      END IF;
    WHEN '_similar' THEN
      RETURN format('%I SIMILAR TO %s', field, right_side);
    WHEN '_nsimilar' THEN
      RETURN format('%I NOT SIMILAR TO %s', field, right_side);
    ELSE
      RAISE EXCEPTION 'Unknown operator: %', operator;
  END CASE;
END;
$$;

COMMENT ON FUNCTION rls.compile_comparison(TEXT, TEXT, JSONB) IS
'Compiles a comparison expression (field operator value) to SQL';

-- ============================================================================
-- rls.is_comparison_operator(op TEXT) -> BOOLEAN
-- Check if a string is a comparison operator
-- ============================================================================
CREATE OR REPLACE FUNCTION rls.is_comparison_operator(op TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT op = ANY(ARRAY[
    '_eq', '_neq', '_gt', '_gte', '_lt', '_lte',
    '_in', '_nin', '_like', '_ilike', '_nlike', '_nilike',
    '_is_null', '_similar', '_nsimilar'
  ]);
$$;

-- ============================================================================
-- rls.compile_expression(expr JSONB) -> TEXT
-- Main function: Compiles a permission expression to a PostgreSQL WHERE clause
-- Handles: _and, _or, _not, _exists, and field comparisons
-- ============================================================================
CREATE OR REPLACE FUNCTION rls.compile_expression(expr JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  conditions TEXT[];
  child_expr JSONB;
  exists_table TEXT;
  exists_where TEXT;
  field_key TEXT;
  field_value JSONB;
  op_key TEXT;
  op_value JSONB;
  compiled TEXT;
BEGIN
  -- Handle null/empty
  IF expr IS NULL OR expr = '{}'::jsonb THEN
    RETURN 'true';
  END IF;

  -- Handle _and
  IF expr ? '_and' THEN
    conditions := ARRAY[]::TEXT[];
    FOR child_expr IN SELECT jsonb_array_elements(expr->'_and') LOOP
      conditions := conditions || rls.compile_expression(child_expr);
    END LOOP;
    IF array_length(conditions, 1) = 0 THEN
      RETURN 'true';
    END IF;
    RETURN '(' || array_to_string(conditions, ' AND ') || ')';
  END IF;

  -- Handle _or
  IF expr ? '_or' THEN
    conditions := ARRAY[]::TEXT[];
    FOR child_expr IN SELECT jsonb_array_elements(expr->'_or') LOOP
      conditions := conditions || rls.compile_expression(child_expr);
    END LOOP;
    IF array_length(conditions, 1) = 0 THEN
      RETURN 'false';
    END IF;
    RETURN '(' || array_to_string(conditions, ' OR ') || ')';
  END IF;

  -- Handle _not
  IF expr ? '_not' THEN
    RETURN 'NOT (' || rls.compile_expression(expr->'_not') || ')';
  END IF;

  -- Handle _exists
  IF expr ? '_exists' THEN
    -- Get table name
    IF jsonb_typeof(expr->'_exists'->'_table') = 'string' THEN
      exists_table := expr->'_exists'->>'_table';
    ELSE
      -- {schema: "public", name: "users"}
      exists_table := (expr->'_exists'->'_table'->>'schema') || '.' ||
                      (expr->'_exists'->'_table'->>'name');
    END IF;

    exists_where := rls.compile_expression(expr->'_exists'->'_where');
    RETURN format('EXISTS (SELECT 1 FROM %s WHERE %s)', exists_table, exists_where);
  END IF;

  -- Handle field expressions (column comparisons)
  conditions := ARRAY[]::TEXT[];

  FOR field_key, field_value IN SELECT * FROM jsonb_each(expr) LOOP
    -- Skip special operators (shouldn't reach here, but safety check)
    IF field_key IN ('_and', '_or', '_not', '_exists') THEN
      CONTINUE;
    END IF;

    -- field_value should be an object with comparison operators
    IF jsonb_typeof(field_value) = 'object' THEN
      FOR op_key, op_value IN SELECT * FROM jsonb_each(field_value) LOOP
        IF rls.is_comparison_operator(op_key) THEN
          conditions := conditions || rls.compile_comparison(field_key, op_key, op_value);
        ELSE
          -- Nested expression (relationship traversal) - treat as nested permission
          compiled := rls.compile_expression(field_value);
          conditions := conditions || compiled;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  IF array_length(conditions, 1) = 0 THEN
    RETURN 'true';
  ELSIF array_length(conditions, 1) = 1 THEN
    RETURN conditions[1];
  ELSE
    RETURN '(' || array_to_string(conditions, ' AND ') || ')';
  END IF;
END;
$$;

COMMENT ON FUNCTION rls.compile_expression(JSONB) IS
'Compiles a JSON permission expression to a PostgreSQL WHERE clause.
Supports: _and, _or, _not, _exists, and all comparison operators.';

-- ============================================================================
-- rls.generate_policy_sql(config JSONB) -> TEXT
-- Generates RLS policy SQL statements from a complete policy configuration
-- Does NOT execute - just returns the SQL for preview
-- ============================================================================
CREATE OR REPLACE FUNCTION rls.generate_policy_sql(config JSONB)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  table_name TEXT;
  enable_rls BOOLEAN;
  policy JSONB;
  policy_name TEXT;
  policy_command TEXT;
  using_expr TEXT;
  check_expr TEXT;
  roles TEXT[];
  permissive BOOLEAN;
  sql_statements TEXT[];
  policy_sql TEXT;
  role_list TEXT;
BEGIN
  -- Extract table name
  table_name := config->>'table';
  IF table_name IS NULL OR table_name = '' THEN
    RAISE EXCEPTION 'config.table is required';
  END IF;

  enable_rls := COALESCE((config->>'enableRLS')::BOOLEAN, true);
  sql_statements := ARRAY[]::TEXT[];

  -- Enable RLS on table
  IF enable_rls THEN
    sql_statements := sql_statements || format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY;', table_name);
    sql_statements := sql_statements || format('ALTER TABLE %s FORCE ROW LEVEL SECURITY;', table_name);
  END IF;

  -- Process each policy
  FOR policy IN SELECT jsonb_array_elements(config->'policies') LOOP
    policy_name := policy->>'name';
    policy_command := COALESCE(policy->>'command', 'ALL');
    permissive := COALESCE((policy->>'permissive')::BOOLEAN, true);

    -- Get roles
    IF policy ? 'roles' AND jsonb_array_length(policy->'roles') > 0 THEN
      SELECT array_agg(r::TEXT) INTO roles
      FROM jsonb_array_elements_text(policy->'roles') r;
      role_list := array_to_string(roles, ', ');
    ELSE
      role_list := 'PUBLIC';
    END IF;

    -- Compile USING expression
    IF policy ? 'usingExpression' THEN
      using_expr := rls.compile_expression(policy->'usingExpression');
    ELSIF policy ? 'using' THEN
      using_expr := policy->>'using';
    ELSE
      using_expr := 'true';
    END IF;

    -- Compile WITH CHECK expression
    IF policy ? 'withCheckExpression' THEN
      check_expr := rls.compile_expression(policy->'withCheckExpression');
    ELSIF policy ? 'withCheck' THEN
      check_expr := policy->>'withCheck';
    ELSE
      check_expr := NULL;
    END IF;

    -- Drop existing policy if exists
    sql_statements := sql_statements || format(
      'DROP POLICY IF EXISTS %I ON %s;',
      policy_name, table_name
    );

    -- Build CREATE POLICY statement
    policy_sql := format(
      'CREATE POLICY %I ON %s AS %s FOR %s TO %s USING (%s)',
      policy_name,
      table_name,
      CASE WHEN permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      policy_command,
      role_list,
      using_expr
    );

    -- Add WITH CHECK if specified and command supports it
    IF check_expr IS NOT NULL AND policy_command IN ('INSERT', 'UPDATE', 'ALL') THEN
      policy_sql := policy_sql || format(' WITH CHECK (%s)', check_expr);
    END IF;

    policy_sql := policy_sql || ';';
    sql_statements := sql_statements || policy_sql;
  END LOOP;

  RETURN array_to_string(sql_statements, E'\n');
END;
$$;

COMMENT ON FUNCTION rls.generate_policy_sql(JSONB) IS
'Generates RLS policy SQL statements from a JSON policy configuration.
Returns the SQL as text for preview - does not execute.';

-- ============================================================================
-- rls.apply_policy(config JSONB) -> VOID
-- Applies RLS policies from a complete policy configuration
-- Executes the generated SQL in a transaction
-- ============================================================================
CREATE OR REPLACE FUNCTION rls.apply_policy(config JSONB)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  table_name TEXT;
  enable_rls BOOLEAN;
  policy JSONB;
  policy_name TEXT;
  policy_command TEXT;
  using_expr TEXT;
  check_expr TEXT;
  roles TEXT[];
  permissive BOOLEAN;
  role_list TEXT;
  policy_sql TEXT;
BEGIN
  -- Extract table name
  table_name := config->>'table';
  IF table_name IS NULL OR table_name = '' THEN
    RAISE EXCEPTION 'config.table is required';
  END IF;

  enable_rls := COALESCE((config->>'enableRLS')::BOOLEAN, true);

  -- Enable RLS on table
  IF enable_rls THEN
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', table_name);
  END IF;

  -- Process each policy
  FOR policy IN SELECT jsonb_array_elements(config->'policies') LOOP
    policy_name := policy->>'name';
    policy_command := COALESCE(policy->>'command', 'ALL');
    permissive := COALESCE((policy->>'permissive')::BOOLEAN, true);

    -- Get roles
    IF policy ? 'roles' AND jsonb_array_length(policy->'roles') > 0 THEN
      SELECT array_agg(r::TEXT) INTO roles
      FROM jsonb_array_elements_text(policy->'roles') r;
      role_list := array_to_string(roles, ', ');
    ELSE
      role_list := 'PUBLIC';
    END IF;

    -- Compile USING expression
    IF policy ? 'usingExpression' THEN
      using_expr := rls.compile_expression(policy->'usingExpression');
    ELSIF policy ? 'using' THEN
      using_expr := policy->>'using';
    ELSE
      using_expr := 'true';
    END IF;

    -- Compile WITH CHECK expression
    IF policy ? 'withCheckExpression' THEN
      check_expr := rls.compile_expression(policy->'withCheckExpression');
    ELSIF policy ? 'withCheck' THEN
      check_expr := policy->>'withCheck';
    ELSE
      check_expr := NULL;
    END IF;

    -- Drop existing policy if exists
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', policy_name, table_name);

    -- Build and execute CREATE POLICY statement
    policy_sql := format(
      'CREATE POLICY %I ON %s AS %s FOR %s TO %s USING (%s)',
      policy_name,
      table_name,
      CASE WHEN permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      policy_command,
      role_list,
      using_expr
    );

    -- Add WITH CHECK if specified and command supports it
    IF check_expr IS NOT NULL AND policy_command IN ('INSERT', 'UPDATE', 'ALL') THEN
      policy_sql := policy_sql || format(' WITH CHECK (%s)', check_expr);
    END IF;

    EXECUTE policy_sql;

    RAISE NOTICE 'Created policy: %', policy_name;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION rls.apply_policy(JSONB) IS
'Applies RLS policies from a JSON policy configuration.
Executes the SQL statements to create/update policies.';

-- ============================================================================
-- rls.drop_all_policies(p_table TEXT) -> INT
-- Drops all RLS policies on a table
-- Returns number of policies dropped
-- ============================================================================
CREATE OR REPLACE FUNCTION rls.drop_all_policies(p_table TEXT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  policy_rec RECORD;
  drop_count INT := 0;
BEGIN
  FOR policy_rec IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname || '.' || tablename = p_table
       OR tablename = p_table
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', policy_rec.policyname, p_table);
    drop_count := drop_count + 1;
    RAISE NOTICE 'Dropped policy: %', policy_rec.policyname;
  END LOOP;

  RETURN drop_count;
END;
$$;

COMMENT ON FUNCTION rls.drop_all_policies(TEXT) IS
'Drops all RLS policies on a given table. Returns the count of dropped policies.';
