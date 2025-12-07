<script lang="ts">
  import type { TableInfo, ColumnInfo } from '@speajus/rlsify-types';
  
  interface Props {
    availableTables: Array<{ table: TableInfo; path: string[]; relationship: string }>;
    selectedTable: string;
    selectedField: string;
    onTableChange: (table: string) => void;
    onFieldChange: (field: string) => void;
  }
  
  let { availableTables, selectedTable, selectedField, onTableChange, onFieldChange }: Props = $props();
  
  let selectedTableInfo = $derived(
    availableTables.find(t => t.table.name === selectedTable)
  );
  
  let availableFields = $derived(selectedTableInfo?.table.columns || []);
  
  function getFieldIcon(column: ColumnInfo): string {
    if (column.isPrimaryKey) return '🔑';
    if (column.isForeignKey) return '🔗';
    if (column.type.includes('uuid')) return '🆔';
    if (column.type.includes('text') || column.type.includes('varchar')) return '📝';
    if (column.type.includes('int') || column.type.includes('numeric')) return '🔢';
    if (column.type.includes('bool')) return '✓';
    if (column.type.includes('timestamp') || column.type.includes('date')) return '📅';
    return '•';
  }
  
  function getFieldTypeLabel(type: string): string {
    if (type.includes('uuid')) return 'UUID';
    if (type.includes('text')) return 'Text';
    if (type.includes('varchar')) return 'String';
    if (type.includes('int')) return 'Number';
    if (type.includes('bool')) return 'Boolean';
    if (type.includes('timestamp')) return 'Timestamp';
    if (type.includes('date')) return 'Date';
    return type;
  }
</script>

<div class="field-selector">
  <div class="table-selector">
    <label>Table</label>
    <select value={selectedTable} onchange={(e) => onTableChange(e.currentTarget.value)}>
      <option value="">Select table...</option>
      {#each availableTables as { table, path, relationship }}
        <option value={table.name}>
          {table.name}
          {#if path.length > 1}
            <span class="relationship-hint">via {relationship}</span>
          {/if}
        </option>
      {/each}
    </select>
  </div>
  
  {#if selectedTable}
    <div class="field-list">
      <label>Field</label>
      <div class="field-options">
        {#each availableFields as column}
          <button
            class="field-option {selectedField === column.name ? 'selected' : ''}"
            onclick={() => onFieldChange(column.name)}
          >
            <span class="field-icon">{getFieldIcon(column)}</span>
            <span class="field-name">{column.name}</span>
            <span class="field-type">{getFieldTypeLabel(column.type)}</span>
            {#if column.isPrimaryKey}
              <span class="badge pk">PK</span>
            {/if}
            {#if column.isForeignKey}
              <span class="badge fk">FK</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .field-selector {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .table-selector label,
  .field-list label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
  }
  
  .table-selector select {
    width: 100%;
    padding: 0.5rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.875rem;
  }
  
  .field-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 300px;
    overflow-y: auto;
  }
  
  .field-option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }
  
  .field-option:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover);
  }
  
  .field-option.selected {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: white;
  }
  
  .field-icon {
    font-size: 1.25rem;
  }
  
  .field-name {
    flex: 1;
    font-weight: 500;
  }
  
  .field-type {
    font-size: 0.75rem;
    color: var(--text-muted);
    padding: 0.25rem 0.5rem;
    background: var(--bg-primary);
    border-radius: 4px;
  }
  
  .field-option.selected .field-type {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }
  
  .badge {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    font-weight: 600;
  }
  
  .badge.pk {
    background: #5865f2;
    color: white;
  }
  
  .badge.fk {
    background: #3ba55d;
    color: white;
  }
</style>

