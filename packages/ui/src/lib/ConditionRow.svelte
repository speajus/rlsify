<script lang="ts">
  import type { TableInfo } from '@speajus/rlsify-types';
  import FieldSelector from './FieldSelector.svelte';
  import ValueInput from './ValueInput.svelte';
  
  interface Condition {
    id: string;
    field: string;
    tablePath: string[];
    operator: string;
    value: any;
    valueType: 'literal' | 'session' | 'column';
  }
  
  interface Props {
    condition: Condition;
    availableTables: Array<{ table: TableInfo; path: string[]; relationship: string }>;
    onUpdate: (updates: Partial<Condition>) => void;
    onRemove: () => void;
  }
  
  let { condition, availableTables, onUpdate, onRemove }: Props = $props();
  
  const operators = [
    { value: '_eq', label: 'equals', symbol: '=' },
    { value: '_neq', label: 'not equals', symbol: '≠' },
    { value: '_gt', label: 'greater than', symbol: '>' },
    { value: '_gte', label: 'greater or equal', symbol: '≥' },
    { value: '_lt', label: 'less than', symbol: '<' },
    { value: '_lte', label: 'less or equal', symbol: '≤' },
    { value: '_in', label: 'in list', symbol: '∈' },
    { value: '_nin', label: 'not in list', symbol: '∉' },
    { value: '_like', label: 'like', symbol: '~' },
    { value: '_ilike', label: 'like (case-insensitive)', symbol: '~*' },
    { value: '_is_null', label: 'is null', symbol: '∅' },
  ];
  
  // Initialize with the last table in the path, or empty string
  let selectedTableName = $state(condition.tablePath[condition.tablePath.length - 1] || '');

  // Auto-select base table if nothing is selected and we have available tables
  $effect(() => {
    if (!selectedTableName && availableTables.length > 0) {
      const baseTable = availableTables[0];
      selectedTableName = baseTable.table.name;
      // Only reset the field if the condition doesn't already have one
      if (!condition.field) {
        onUpdate({
          tablePath: baseTable.path,
          field: ''
        });
      }
    }
  });

  function handleTableChange(tableName: string) {
    selectedTableName = tableName;
    const selectedTableInfo = availableTables.find(t => t.table.name === tableName);
    if (selectedTableInfo) {
      onUpdate({
        tablePath: selectedTableInfo.path,
        field: '' // Reset field when table changes
      });
    }
  }
  
  function handleFieldChange(fieldName: string) {
    onUpdate({ field: fieldName });
  }
  
  function handleOperatorChange(operator: string) {
    onUpdate({ operator });
  }
  
  function handleValueChange(value: any, valueType: 'literal' | 'session' | 'column') {
    onUpdate({ value, valueType });
  }
</script>

<div class="condition-row">
  <div class="condition-content">
    <div class="field-section">
      <FieldSelector
        {availableTables}
        selectedTable={selectedTableName}
        selectedField={condition.field}
        onTableChange={handleTableChange}
        onFieldChange={handleFieldChange}
      />
    </div>
    
    <div class="operator-section">
      <label>Operator</label>
      <select 
        value={condition.operator} 
        onchange={(e) => handleOperatorChange(e.currentTarget.value)}
      >
        {#each operators as op}
          <option value={op.value}>
            {op.symbol} {op.label}
          </option>
        {/each}
      </select>
    </div>
    
    <div class="value-section">
      <ValueInput
        value={condition.value}
        valueType={condition.valueType}
        operator={condition.operator}
        {availableTables}
        onChange={handleValueChange}
      />
    </div>
  </div>
  
  <button class="remove-btn" onclick={onRemove} title="Remove condition">
    ×
  </button>
</div>

<style>
  .condition-row {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    position: relative;
  }
  
  .condition-content {
    flex: 1;
    display: grid;
    grid-template-columns: 2fr 1fr 2fr;
    gap: 1rem;
    align-items: start;
  }
  
  .operator-section label,
  .value-section label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
  }
  
  .operator-section select {
    width: 100%;
    padding: 0.5rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.875rem;
  }
  
  .remove-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 1.25rem;
    line-height: 1;
    transition: all 0.2s;
  }
  
  .remove-btn:hover {
    background: var(--accent-error);
    border-color: var(--accent-error);
    color: white;
  }
  
  @media (max-width: 768px) {
    .condition-content {
      grid-template-columns: 1fr;
    }
  }
</style>

