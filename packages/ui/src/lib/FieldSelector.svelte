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

  // Create local state for the select values to ensure reactivity
  let localTable = $state(selectedTable);
  let localField = $state(selectedField);

  // Sync local state with props
  $effect(() => {
    localTable = selectedTable;
  });

  $effect(() => {
    localField = selectedField;
  });

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
    <select bind:value={localTable} onchange={() => onTableChange(localTable)}>
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
      <select bind:value={localField} onchange={() => onFieldChange(localField)}>
        <option value="">Select field...</option>
        {#each availableFields as column}
          <option value={column.name}>
            {getFieldIcon(column)} {column.name} ({getFieldTypeLabel(column.type)})
            {#if column.isPrimaryKey} - PK{/if}
            {#if column.isForeignKey} - FK{/if}
          </option>
        {/each}
      </select>
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

  .table-selector select,
  .field-list select {
    width: 100%;
    padding: 0.5rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
  }

  .table-selector select:hover,
  .field-list select:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover);
  }
</style>

