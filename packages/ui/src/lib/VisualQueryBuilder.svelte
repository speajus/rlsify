<script lang="ts">
  import type { PermissionExpression, TableInfo, ForeignKeyRelation } from '@speajus/rlsify-types';
  import { schema, foreignKeys } from './stores/schema-store.js';
  import ConditionRow from './ConditionRow.svelte';
  
  interface Props {
    baseTable: string;
    expression?: PermissionExpression ;
    onUpdate: (expr: PermissionExpression | null) => void;
  }
  
  let { baseTable, expression, onUpdate }: Props = $props();
  
  interface Condition {
    id: string;
    field: string;
    tablePath: string[]; // e.g., ['posts', 'user'] for posts.user.role
    operator: string;
    value: any;
    valueType: 'literal' | 'session' | 'column';
  }
  
  let conditions = $state<Condition[]>([]);
  let logicMode = $state<'and' | 'or'>('and');
  let lastParsedExpression = $state<PermissionExpression | undefined>(undefined);
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
  
  function addCondition() {
    conditions.push({
      id: crypto.randomUUID(),
      field: '',
      tablePath: [baseTable.split('.').pop() || baseTable],
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
  
  function updateExpression() {
    console.log('VisualQueryBuilder: updateExpression called, conditions.length =', conditions.length);
    console.trace('updateExpression stack trace');
    if (conditions.length === 0) {
      console.log('VisualQueryBuilder: calling onUpdate(null) because conditions.length === 0');
      onUpdate(null);
      return;
    }
    
    const fieldExpressions = conditions
      .filter(c => c.field && c.operator)
      .map(c => {
        const fieldName = c.tablePath.length > 1 
          ? `${c.tablePath.slice(1).join('.')}.${c.field}`
          : c.field;
        
        let value: any = c.value;
        if (c.valueType === 'session') {
          value = { var: c.value, type: 'uuid' };
        } else if (c.valueType === 'column') {
          value = { column: c.value };
        }
        
        return {
          [fieldName]: {
            [c.operator]: value
          }
        };
      });
    
    if (fieldExpressions.length === 0) {
      onUpdate(null);
      return;
    }
    
    if (fieldExpressions.length === 1) {
      console.log('VisualQueryBuilder: calling onUpdate with single expression:', fieldExpressions[0]);
      onUpdate(fieldExpressions[0]);
    } else {
      const expr = {
        [`_${logicMode}`]: fieldExpressions
      };
      console.log('VisualQueryBuilder: calling onUpdate with combined expression:', expr);
      onUpdate(expr);
    }
  }
  
  function toggleLogicMode() {
    logicMode = logicMode === 'and' ? 'or' : 'and';
    updateExpression();
  }
  
  // Parse expression into conditions for display
  function parseExpressionToConditions(expr: PermissionExpression | undefined): Condition[] {
    if (!expr) return [];

    const parsed: Condition[] = [];

    // Handle _and / _or at top level
    if ('_and' in expr && Array.isArray(expr._and)) {
      logicMode = 'and';
      expr._and.forEach((item: any) => {
        const cond = parseFieldExpression(item);
        if (cond) parsed.push(cond);
      });
    } else if ('_or' in expr && Array.isArray(expr._or)) {
      logicMode = 'or';
      expr._or.forEach((item: any) => {
        const cond = parseFieldExpression(item);
        if (cond) parsed.push(cond);
      });
    } else {
      // Single field expression
      const cond = parseFieldExpression(expr);
      if (cond) parsed.push(cond);
    }

    return parsed;
  }

  function parseFieldExpression(expr: any): Condition | null {
    // Skip _exists and other complex operators for now
    if ('_exists' in expr || '_not' in expr) {
      return null;
    }

    // Find the field name (first key that's not an operator)
    const fieldName = Object.keys(expr).find(k => !k.startsWith('_'));
    if (!fieldName) return null;

    const fieldValue = expr[fieldName];
    if (!fieldValue || typeof fieldValue !== 'object') return null;

    // Find the operator
    const operator = Object.keys(fieldValue).find(k => k.startsWith('_'));
    if (!operator) return null;

    const value = fieldValue[operator];

    // Determine value type and extract actual value
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

    return {
      id: crypto.randomUUID(),
      field: fieldName,
      tablePath: [baseTable.split('.').pop() || baseTable],
      operator,
      value: actualValue,
      valueType
    };
  }

  // Parse expression when it changes
  $effect(() => {
    // Only parse if expression has changed (to avoid infinite loops)
    if (expression !== lastParsedExpression) {
      console.log('VisualQueryBuilder: expression changed', { expression, lastParsedExpression });
      lastParsedExpression = expression;
      isLoadingFromExpression = true;

      if (expression) {
        const parsed = parseExpressionToConditions(expression);
        console.log('VisualQueryBuilder: parsed conditions', parsed);
        if (parsed.length > 0) {
          conditions = parsed;
          console.log('VisualQueryBuilder: conditions after assignment', conditions, 'length:', conditions.length);
        } else {
          // Expression exists but couldn't be parsed (e.g., _exists) - clear conditions
          console.log('VisualQueryBuilder: could not parse expression, clearing conditions');
          conditions = [];
        }
      } else {
        // No expression - clear conditions
        conditions = [];
      }

      // Reset flag after a tick to allow the UI to update
      setTimeout(() => {
        isLoadingFromExpression = false;
      }, 0);
    }
  });
</script>

<div class="visual-query-builder">
  <div class="builder-header">
    <h3>Visual Query Builder</h3>
    <p class="hint">Build permission rules without writing SQL</p>
  </div>
  
  <div style="background: #333; padding: 0.5rem; margin-bottom: 1rem; font-size: 0.85rem;">
    DEBUG: conditions.length = {conditions.length}, conditions = {JSON.stringify(conditions)}
  </div>

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
    {#each conditions as condition (condition.id)}
      <ConditionRow
        {condition}
        {availableTables}
        onUpdate={(updates) => updateCondition(condition.id, updates)}
        onRemove={() => removeCondition(condition.id)}
      />
    {:else}
      <p style="color: #888; padding: 1rem;">No conditions (conditions.length = {conditions.length})</p>
    {/each}
  </div>
  
  <button class="add-condition-btn" onclick={addCondition}>
    + Add Condition
  </button>
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

  .add-condition-btn {
    padding: 0.75rem;
    background: var(--bg-secondary);
    border: 1px dashed var(--border-color);
    border-radius: 6px;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .add-condition-btn:hover {
    background: var(--bg-hover);
    border-color: var(--accent-primary);
    border-style: solid;
    color: var(--accent-primary);
  }
</style>

