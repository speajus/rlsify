<script lang="ts">
  import type { TableInfo, ColumnInfo, ForeignKeyRelation, FKNavigationStep } from '@speajus/rlsify-types';
  import { schema, foreignKeys } from './stores/schema-store.js';

  interface Props {
    availableTables: Array<{ table: TableInfo; path: string[]; relationship: string }>;
    selectedTable: string;
    selectedField: string;
    /** FK navigation path from base table to current table */
    navigationPath?: FKNavigationStep[];
    onTableChange: (table: string) => void;
    onFieldChange: (field: string) => void;
    /** Called when FK navigation changes */
    onNavigationChange?: (path: FKNavigationStep[]) => void;
  }

  let {
    availableTables,
    selectedTable,
    selectedField,
    navigationPath = [],
    onTableChange,
    onFieldChange,
    onNavigationChange
  }: Props = $props();

  // Create local state for the select values to ensure reactivity
  let localTable = $state(selectedTable);
  let localField = $state(selectedField);
  let localNavPath = $state<FKNavigationStep[]>(navigationPath);

  // Sync local state with props
  $effect(() => {
    localTable = selectedTable;
  });

  $effect(() => {
    localField = selectedField;
  });

  $effect(() => {
    localNavPath = navigationPath;
  });

  // Get the current table based on navigation path
  let currentTableName = $derived(() => {
    if (localNavPath.length === 0) {
      return localTable;
    }
    const lastStep = localNavPath[localNavPath.length - 1];
    return lastStep?.toTable ?? localTable;
  });

  let selectedTableInfo = $derived(() => {
    const tableName = currentTableName();
    return $schema?.tables.find(t => t.name === tableName);
  });

  let availableFields = $derived(selectedTableInfo()?.columns || []);

  // Get FK columns that can be navigated
  let fkColumnsForCurrentTable = $derived(() => {
    const tableName = currentTableName();
    return $foreignKeys.filter(fk => fk.sourceTable === tableName);
  });

  // Build breadcrumb path display
  let breadcrumbPath = $derived(() => {
    const parts: Array<{ name: string; isClickable: boolean; index: number }> = [];

    // Start with base table
    if (availableTables.length > 0) {
      const baseTable = availableTables[0]?.table.name ?? 'unknown';
      parts.push({ name: baseTable, isClickable: localNavPath.length > 0, index: -1 });
    }

    // Add each navigation step
    localNavPath.forEach((step, index) => {
      parts.push({
        name: step.toTable,
        isClickable: index < localNavPath.length - 1,
        index
      });
    });

    return parts;
  });

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

  function getFKTarget(column: ColumnInfo): ForeignKeyRelation | undefined {
    const tableName = currentTableName();
    return $foreignKeys.find(
      fk => fk.sourceTable === tableName && fk.sourceColumn === column.name
    );
  }

  function navigateToFK(column: ColumnInfo) {
    const fk = getFKTarget(column);
    if (!fk) return;

    const newStep: FKNavigationStep = {
      fromTable: fk.sourceTable,
      fromColumn: fk.sourceColumn,
      toTable: fk.targetTable,
      toColumn: fk.targetColumn
    };

    localNavPath = [...localNavPath, newStep];
    localField = ''; // Reset field selection
    onNavigationChange?.(localNavPath);
    onFieldChange('');
  }

  function navigateBack(toIndex: number) {
    if (toIndex === -1) {
      // Go back to base table
      localNavPath = [];
    } else {
      // Go back to specific step
      localNavPath = localNavPath.slice(0, toIndex + 1);
    }
    localField = '';
    onNavigationChange?.(localNavPath);
    onFieldChange('');
  }

  function handleFieldSelect(column: ColumnInfo) {
    localField = column.name;
    onFieldChange(column.name);
  }
</script>

<div class="field-selector">
  <!-- Breadcrumb Navigation -->
  {#if breadcrumbPath().length > 0}
    <div class="breadcrumb">
      <span class="breadcrumb-label">Path:</span>
      {#each breadcrumbPath() as part, i}
        {#if i > 0}
          <span class="breadcrumb-separator">→</span>
        {/if}
        {#if part.isClickable}
          <button
            class="breadcrumb-item clickable"
            onclick={() => navigateBack(part.index)}
            title="Go back to {part.name}"
          >
            {part.name}
          </button>
        {:else}
          <span class="breadcrumb-item current">{part.name}</span>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- Table Selector (only shown when no navigation) -->
  {#if localNavPath.length === 0}
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
  {/if}

  <!-- Field List -->
  {#if currentTableName()}
    <div class="field-list">
      <label>Field {#if localNavPath.length > 0}<span class="field-hint">(from {currentTableName()})</span>{/if}</label>
      <div class="field-options">
        {#each availableFields as column}
          {@const fkTarget = getFKTarget(column)}
          <div class="field-option {selectedField === column.name ? 'selected' : ''}">
            <button
              class="field-btn"
              onclick={() => handleFieldSelect(column)}
              title="Select {column.name}"
            >
              <span class="field-icon">{getFieldIcon(column)}</span>
              <span class="field-name">{column.name}</span>
              <span class="field-type">{getFieldTypeLabel(column.type)}</span>
              {#if column.isPrimaryKey}<span class="field-badge pk">PK</span>{/if}
            </button>
            {#if fkTarget}
              <button
                class="fk-navigate-btn"
                onclick={() => navigateToFK(column)}
                title="Navigate to {fkTarget.targetTable}"
              >
                → {fkTarget.targetTable}
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .field-selector {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* Breadcrumb styles */
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 0.8125rem;
    flex-wrap: wrap;
  }

  .breadcrumb-label {
    color: var(--text-muted);
    font-weight: 500;
    margin-right: 0.25rem;
  }

  .breadcrumb-separator {
    color: var(--text-muted);
  }

  .breadcrumb-item {
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-family: ui-monospace, monospace;
  }

  .breadcrumb-item.clickable {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    color: var(--accent-primary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .breadcrumb-item.clickable:hover {
    background: var(--accent-primary);
    color: white;
    border-color: var(--accent-primary);
  }

  .breadcrumb-item.current {
    background: var(--accent-primary);
    color: white;
    font-weight: 600;
  }

  /* Table selector */
  .table-selector label,
  .field-list label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
  }

  .field-hint {
    font-weight: 400;
    color: var(--text-muted);
  }

  .table-selector select {
    width: 100%;
    padding: 0.5rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
  }

  .table-selector select:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover);
  }

  /* Field list styles */
  .field-options {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-height: 200px;
    overflow-y: auto;
    padding: 0.25rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
  }

  .field-option {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .field-option.selected .field-btn {
    background: var(--accent-primary);
    color: white;
    border-color: var(--accent-primary);
  }

  .field-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
  }

  .field-btn:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover);
  }

  .field-icon {
    font-size: 0.875rem;
  }

  .field-name {
    flex: 1;
    font-family: ui-monospace, monospace;
    font-weight: 500;
  }

  .field-type {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .field-badge {
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .field-badge.pk {
    background: rgba(255, 193, 7, 0.2);
    color: #ffc107;
  }

  /* FK navigation button */
  .fk-navigate-btn {
    padding: 0.375rem 0.5rem;
    background: rgba(0, 200, 117, 0.1);
    border: 1px solid rgba(0, 200, 117, 0.3);
    border-radius: 4px;
    color: #00c875;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .fk-navigate-btn:hover {
    background: rgba(0, 200, 117, 0.2);
    border-color: #00c875;
  }
</style>

