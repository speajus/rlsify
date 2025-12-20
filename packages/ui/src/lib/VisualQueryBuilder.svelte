<script lang="ts">
  import type { PermissionExpression, TableInfo, ForeignKeyRelation, FKNavigationStep, PermissionValue, buildExistsFromPath, ColumnPath } from '@speajus/rlsify-types';
  import { schema, foreignKeys } from './stores/schema-store.js';
  import ConditionRow from './ConditionRow.svelte';
  import { hasKey, keysOf } from './utils.js';
  import { Button } from '$lib/components/ui/button/index.js';

  interface Props {
    baseTable: string;
    expression?: PermissionExpression ;
    onUpdate: (expr: PermissionExpression | null) => void;
    debugLabel?: string;
  }

  let { baseTable, expression, onUpdate, debugLabel = 'VisualQueryBuilder' }: Props = $props();

  // Check if policy has any expression defined (either JSON or SQL string would have been converted)
  // This is used to determine whether to show templates or the condition editor
  let hasExpression = $derived(expression !== undefined && expression !== null && Object.keys(expression).length > 0);

  // Track whether we've finished initial parsing - used to prevent showing templates during initial load
  let hasInitialized = $state(false);

  // Template functions for starting points
  function useTemplate(template: 'user-owned' | 'role-based' | 'org-tenant') {
    let expr: PermissionExpression;

    switch (template) {
      case 'user-owned':
        expr = {
          user_id: {
            _eq: { var: 'auth.uid()', type: 'uuid' }
          }
        };
        break;

      case 'role-based':
        expr = {
          _exists: {
            _table: 'user_roles',
            _where: {
              _and: [
                { user_id: { _eq: { var: 'auth.uid()', type: 'uuid' } } },
                { role: { _in: ['admin', 'editor'] } }
              ]
            }
          }
        };
        break;

      case 'org-tenant':
        expr = {
          organization_id: {
            _eq: { var: 'current_setting(\'request.jwt.claims\')::json->>\'org_id\'', type: 'text' }
          }
        };
        break;
    }

    onUpdate(expr);
  }

  interface Condition {
    id: string;
    field: string;
    tablePath: string[]; // e.g., ['posts', 'user'] for posts.user.role
    /** FK navigation steps for cross-table references */
    fkPath?: FKNavigationStep[];
    operator: string;
    value: unknown;
    valueType: 'literal' | 'session' | 'column';
  }
  
  // Parse the initial expression into conditions
  // We need to declare state variables first, then parse
  let conditions = $state<Condition[]>([]);
  let logicMode = $state<'and' | 'or'>('and');

  // Track the last expression JSON we parsed to avoid infinite loops
  let lastParsedExpressionJson = $state('');

  // Track the last expression JSON we generated to avoid re-parsing our own output
  let lastGeneratedExpressionJson = $state('');

  // Flag to prevent updateExpression from being called during initialization
  let isLoadingFromExpression = $state(false);

  // Get available tables through relationships
  let availableTables = $derived.by(() => {
    if (!$schema || !baseTable) return [];
    
    const tables = new Map<string, { table: TableInfo; path: string[]; relationship: string }>();
    const baseTableName = baseTable.split('.').pop() || baseTable;
    
    // Add base table
    const baseTableInfo = $schema.tables.find(t => t.name === baseTableName);
    if (baseTableInfo) {
      tables.set(baseTableName, { 
        table: baseTableInfo, 
        path: [baseTableName],
        relationship: 'base'
      });
    }
    
    // Add directly related tables via FK
    $foreignKeys.forEach(fk => {
      if (fk.sourceTable === baseTableName) {
        const targetTable = $schema.tables.find(t => t.name === fk.targetTable);
        if (targetTable) {
          tables.set(fk.targetTable, {
            table: targetTable,
            path: [baseTableName, fk.targetTable],
            relationship: `${fk.sourceColumn} → ${fk.targetTable}.${fk.targetColumn}`
          });
        }
      }
      if (fk.targetTable === baseTableName) {
        const sourceTable = $schema.tables.find(t => t.name === fk.sourceTable);
        if (sourceTable) {
          tables.set(fk.sourceTable, {
            table: sourceTable,
            path: [baseTableName, fk.sourceTable],
            relationship: `${fk.sourceTable}.${fk.sourceColumn} → ${fk.targetColumn}`
          });
        }
      }
    });
    
    return Array.from(tables.values());
  });

  // Initialize conditions from expression whenever it changes
  $effect(() => {
    const currentExprJson = expression ? JSON.stringify(expression) : '';

    // Skip if no expression - just mark as initialized so templates show
    if (!expression || currentExprJson === '' || currentExprJson === '{}') {
      hasInitialized = true;
      return;
    }

    // Skip if this is an expression we just generated (avoid re-parsing our own output)
    if (currentExprJson === lastGeneratedExpressionJson) {
      lastParsedExpressionJson = currentExprJson;
      hasInitialized = true;
      return;
    }

    // Skip if we already parsed this exact expression
    if (currentExprJson === lastParsedExpressionJson) {
      hasInitialized = true;
      return;
    }

    // Parse the new expression
    isLoadingFromExpression = true;
    const { conditions: parsed, logicMode: mode } = parseExpressionToConditions(expression);
    conditions = parsed;
    logicMode = mode;
    lastParsedExpressionJson = currentExprJson;
    hasInitialized = true;

    // Use setTimeout to ensure all child components have finished initializing
    setTimeout(() => {
      isLoadingFromExpression = false;
    }, 0);
  });

  function addCondition() {
    conditions.push({
      id: crypto.randomUUID(),
      field: '',
      tablePath: [baseTable.split('.').pop() || baseTable],
      fkPath: [],
      operator: '_eq',
      value: '',
      valueType: 'literal'
    });
  }
  
  function removeCondition(id: string) {
    conditions = conditions.filter(c => c.id !== id);
    updateExpression();
  }

  function updateCondition(id: string, updates: Partial<Condition>) {
    const index = conditions.findIndex(c => c.id === id);
    if (index !== -1) {
      conditions[index] = { ...conditions[index], ...updates };
      updateExpression();
    }
  }
  
  /**
   * Build an _exists expression from FK navigation path
   */
  function buildExistsExpression(
    fkPath: FKNavigationStep[],
    column: string,
    operator: string,
    value: PermissionValue
  ): PermissionExpression {
    if (fkPath.length === 0) {
      // No FK navigation - just a direct column reference
      return { [column]: { [operator]: value } } as PermissionExpression;
    }

    // Build nested _exists from inside out
    // Start with the innermost condition (the actual field comparison)
    let innerExpr: PermissionExpression = { [column]: { [operator]: value } } as PermissionExpression;

    // Work backwards through the steps
    for (const step of [...fkPath].reverse()) {
      // Link condition: join the tables via FK
      const linkCondition: PermissionExpression = {
        [step.toColumn]: { _eq: { column: `${step.fromTable}.${step.fromColumn}` } }
      } as PermissionExpression;

      // Combine link with inner expression
      innerExpr = {
        _exists: {
          _table: step.toTable,
          _where: { _and: [linkCondition, innerExpr] }
        }
      };
    }

    return innerExpr;
  }

  function updateExpression() {
    // Don't update if we're currently loading from an expression
    if (isLoadingFromExpression) {
      return;
    }

    if (conditions.length === 0) {
      onUpdate(null);
      return;
    }

    const fieldExpressions = conditions
      .filter(c => c.field && c.operator)
      .map(c => {
        // Prepare the value based on valueType
        let value: PermissionValue = c.value as PermissionValue;
        if (c.valueType === 'session') {
          value = { var: c.value as string, type: 'uuid' };
        } else if (c.valueType === 'column') {
          value = { column: c.value as string };
        }

        // If there's an FK path, generate _exists expression
        if (c.fkPath && c.fkPath.length > 0) {
          return buildExistsExpression(c.fkPath, c.field, c.operator, value);
        }

        // Simple field expression (no FK navigation)
        return {
          [c.field]: {
            [c.operator]: value
          }
        } as PermissionExpression;
      });

    if (fieldExpressions.length === 0) {
      lastGeneratedExpressionJson = '';
      onUpdate(null);
      return;
    }

    let resultExpr: PermissionExpression;
    if (fieldExpressions.length === 1) {
      resultExpr = fieldExpressions[0];
    } else {
      resultExpr = {
        [`_${logicMode}`]: fieldExpressions
      } as PermissionExpression;
    }

    // Store the generated expression JSON so we don't re-parse it
    lastGeneratedExpressionJson = JSON.stringify(resultExpr);
    onUpdate(resultExpr);
  }
  
  function toggleLogicMode() {
    logicMode = logicMode === 'and' ? 'or' : 'and';
    updateExpression();
  }
  
  // Parse expression into conditions for display
  function parseExpressionToConditions(expr: PermissionExpression | undefined): { conditions: Condition[], logicMode: 'and' | 'or' } {
    if (!expr) return { conditions: [], logicMode: 'and' };

    const parsed: Condition[] = [];
    let mode: 'and' | 'or' = 'and';

    // Handle _and / _or at top level
    if ('_and' in expr && Array.isArray(expr._and)) {
      mode = 'and';
      expr._and.forEach((item: any) => {
        const cond = parseFieldExpression(item);
        if (cond) parsed.push(cond);
      });
    } else if ('_or' in expr && Array.isArray(expr._or)) {
      mode = 'or';
      expr._or.forEach((item: any) => {
        const cond = parseFieldExpression(item);
        if (cond) parsed.push(cond);
      });
    } else {
      // Single field expression
      const cond = parseFieldExpression(expr);
      if (cond) parsed.push(cond);
    }

    return { conditions: parsed, logicMode: mode };
  }

  function parseFieldExpression(expr: any): Condition | null {
    // Handle _exists expressions (FK navigation)
    if (hasKey(expr, '_exists')) {
      return parseExistsExpression(expr);
    }

    // Skip _not for now (could be extended later)
    if (hasKey(expr, '_not')) {
      return null;
    }

    // Find the field name (first key that's not an operator)
    const fieldName = Object.keys(expr).find(k => !k.startsWith('_'));
    if (!fieldName) return null;

    const fieldValue = expr[fieldName];
    if (!fieldValue || typeof fieldValue !== 'object') return null;

    // Find the operator
    const operator = keysOf(fieldValue).find(k => String(k).startsWith('_'));
    if (!operator) return null;

    const value = fieldValue[operator];

    // Determine value type and extract actual value
    let valueType: 'literal' | 'session' | 'column' = 'literal';
    let actualValue = value;

    if (value && typeof value === 'object') {
      if ('var' in value) {
        valueType = 'session';
        actualValue = value.var;
      } else if ('column' in value) {
        valueType = 'column';
        actualValue = value.column;
      }
    }

    const tableName = baseTable.split('.').pop() || baseTable;

    return {
      id: crypto.randomUUID(),
      field: fieldName,
      tablePath: [tableName],
      operator: String(operator),
      value: actualValue,
      valueType
    };
  }

  /**
   * Parse _exists expressions back into conditions with FK path
   */
  function parseExistsExpression(expr: any): Condition | null {
    const existsClause = expr._exists;
    if (!existsClause || !existsClause._table || !existsClause._where) {
      return null;
    }

    const fkPath: FKNavigationStep[] = [];
    let currentWhere = existsClause._where;
    let targetTable = existsClause._table;

    // Walk through nested _and to extract FK navigation steps and final condition
    // Structure: { _and: [linkCondition, innerExpr] }
    while (currentWhere && '_and' in currentWhere && Array.isArray(currentWhere._and)) {
      const andItems = currentWhere._and;

      // Find the link condition (has a column reference like { column: "table.field" })
      let linkCondition: any = null;
      let innerExpr: any = null;

      for (const item of andItems) {
        const fieldName = Object.keys(item).find(k => !k.startsWith('_'));
        if (fieldName && item[fieldName]?._eq?.column) {
          linkCondition = item;
        } else if ('_exists' in item) {
          innerExpr = item;
        } else {
          // This is the final condition
          innerExpr = item;
        }
      }

      if (linkCondition) {
        const linkFieldName = Object.keys(linkCondition).find(k => !k.startsWith('_'));
        if (linkFieldName) {
          const columnRef = linkCondition[linkFieldName]._eq.column as string;
          const [fromTable, fromColumn] = columnRef.split('.');

          fkPath.push({
            fromTable,
            fromColumn,
            toTable: targetTable,
            toColumn: linkFieldName
          });
        }
      }

      if (innerExpr && '_exists' in innerExpr) {
        // Continue walking nested _exists
        targetTable = innerExpr._exists._table;
        currentWhere = innerExpr._exists._where;
      } else if (innerExpr) {
        // Found the final condition
        currentWhere = innerExpr;
        break;
      } else {
        break;
      }
    }

    // Parse the final condition (the actual field comparison)
    const fieldName = Object.keys(currentWhere).find(k => !k.startsWith('_'));
    if (!fieldName) return null;

    const fieldValue = currentWhere[fieldName];
    if (!fieldValue || typeof fieldValue !== 'object') return null;

    const operator = Object.keys(fieldValue).find(k => k.startsWith('_'));
    if (!operator) return null;

    const value = fieldValue[operator];

    // Determine value type
    let valueType: 'literal' | 'session' | 'column' = 'literal';
    let actualValue: any = value;

    if (value && typeof value === 'object') {
      if ('var' in value) {
        valueType = 'session';
        actualValue = value.var;
      } else if ('column' in value) {
        valueType = 'column';
        actualValue = value.column;
      }
    }

    const tableName = baseTable.split('.').pop() || baseTable;

    return {
      id: crypto.randomUUID(),
      field: fieldName,
      tablePath: [tableName, targetTable],
      fkPath,
      operator,
      value: actualValue,
      valueType
    };
  }


</script>

<div class="visual-query-builder">
  <div class="builder-header">
    <h3>Visual Query Builder</h3>
    <p class="hint">Build permission rules without writing SQL</p>
  </div>

  {#if hasInitialized && !hasExpression && conditions.length === 0}
    <!-- Template selection for new/empty policies -->
    <div class="templates">
      <p class="template-hint">Choose a template to get started:</p>
      <div class="template-buttons">
        <button class="template-btn" onclick={() => useTemplate('user-owned')}>
          <span class="template-icon">👤</span>
          <span class="template-name">User-Owned Records</span>
          <span class="template-desc">user_id = auth.uid()</span>
        </button>
        <button class="template-btn" onclick={() => useTemplate('role-based')}>
          <span class="template-icon">🔐</span>
          <span class="template-name">Role-Based Access</span>
          <span class="template-desc">Check user roles table</span>
        </button>
        <button class="template-btn" onclick={() => useTemplate('org-tenant')}>
          <span class="template-icon">🏢</span>
          <span class="template-name">Organization/Tenant</span>
          <span class="template-desc">org_id from JWT claims</span>
        </button>
      </div>
      <div class="or-divider">
        <span>or</span>
      </div>
      <button class="scratch-btn" onclick={addCondition}>
        🛠️ Start from Scratch
      </button>
    </div>
  {:else}
    <!-- Normal condition editing mode -->
    {#if conditions.length > 1}
      <div class="logic-toggle">
        <span>Match</span>
        <button class="logic-btn {logicMode === 'and' ? 'active' : ''}" onclick={toggleLogicMode}>
          {logicMode === 'and' ? 'ALL' : 'ANY'}
        </button>
        <span>of the following conditions:</span>
      </div>
    {/if}

    <div class="conditions-list">
      {#each conditions || [] as condition (condition.id)}
        <ConditionRow
          {condition}
          {availableTables}
          onUpdate={(updates) => updateCondition(condition.id, updates)}
          onRemove={() => removeCondition(condition.id)}
        />
      {/each}
    </div>

    <Button variant="outline" class="add-condition-btn" onclick={addCondition}>
      <span class="btn-icon">+</span>
      <span class="btn-text">Add Condition</span>
    </Button>
  {/if}
</div>

<style>
  .visual-query-builder {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background: var(--bg-tertiary);
    border-radius: 8px;
  }

  .builder-header h3 {
    margin: 0 0 0.25rem 0;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .builder-header .hint {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .logic-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .logic-btn {
    padding: 0.375rem 0.75rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .logic-btn:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover);
  }

  .logic-btn.active {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: white;
  }

  .conditions-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  :global(.add-condition-btn) {
    width: 100%;
    display: flex !important;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem !important;
    border: 1px dashed var(--border-color) !important;
    border-radius: 6px;
    transition: all 0.25s ease !important;
  }

  :global(.add-condition-btn:hover) {
    border-style: solid !important;
    border-color: var(--accent-primary) !important;
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(var(--accent-primary-rgb, 99, 102, 241), 0.2);
  }

  :global(.add-condition-btn:active) {
    transform: scale(0.98);
  }

  .btn-icon {
    font-size: 1.25rem;
    font-weight: 300;
    transition: transform 0.25s ease;
  }

  :global(.add-condition-btn:hover) .btn-icon {
    transform: rotate(90deg) scale(1.2);
  }

  .btn-text {
    transition: letter-spacing 0.25s ease;
  }

  :global(.add-condition-btn:hover) .btn-text {
    letter-spacing: 0.05em;
  }

  /* Template styles */
  .templates {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .template-hint {
    color: var(--text-secondary);
    margin: 0;
    font-size: 0.875rem;
  }

  .template-buttons {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
  }

  .template-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    padding: 1rem;
    background: var(--bg-secondary);
    border: 2px solid var(--border-color);
    border-radius: 8px;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .template-btn:hover {
    border-color: var(--accent-primary);
    background: var(--bg-hover);
    transform: translateY(-2px);
  }

  .template-icon {
    font-size: 1.25rem;
  }

  .template-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .template-desc {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-family: 'SF Mono', 'Menlo', monospace;
  }

  .or-divider {
    text-align: center;
    position: relative;
    margin: 0.5rem 0;
  }

  .or-divider::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 1px;
    background: var(--border-color);
  }

  .or-divider span {
    background: var(--bg-tertiary);
    padding: 0 0.75rem;
    position: relative;
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .scratch-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: var(--bg-tertiary);
    border: 2px dashed var(--border-color);
    border-radius: 8px;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .scratch-btn:hover {
    outline: 2px solid var(--accent-primary);
    color: var(--accent-primary);
    background: var(--bg-hover);
  }
</style>

