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

  // Local state
  let localTable = $state(selectedTable);
  let localField = $state(selectedField);
  let localNavPath = $state<FKNavigationStep[]>(navigationPath);
  let isOpen = $state(false);
  let dropdownRef = $state<HTMLDivElement | null>(null);

  // Sync local state with props
  $effect(() => { localTable = selectedTable; });
  $effect(() => { localField = selectedField; });
  $effect(() => { localNavPath = navigationPath; });

  // Close dropdown when clicking outside
  $effect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
        isOpen = false;
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    return $schema?.tables.find((t: TableInfo) => t.name === tableName);
  });

  let availableFields = $derived<ColumnInfo[]>(selectedTableInfo()?.columns || []);

  // Build display value for the trigger
  let displayValue = $derived(() => {
    if (!localTable) return 'Select table.field...';
    if (!localField) return `${currentTableName()} → Select field...`;

    // Build full path
    if (localNavPath.length === 0) {
      return `${localTable}.${localField}`;
    }

    const pathParts = [localTable];
    localNavPath.forEach((step: FKNavigationStep) => pathParts.push(step.toTable));
    return `${pathParts.join(' → ')}.${localField}`;
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
      (fk: ForeignKeyRelation) => fk.sourceTable === tableName && fk.sourceColumn === column.name
    );
  }

  function selectTable(tableName: string) {
    localTable = tableName;
    localField = '';
    localNavPath = [];
    onTableChange(tableName);
    onNavigationChange?.([]);
    onFieldChange('');
    // Don't close - let user select field
  }

  function selectField(column: ColumnInfo) {
    localField = column.name;
    onFieldChange(column.name);
    isOpen = false; // Close after field selection
  }

  function navigateToFK(column: ColumnInfo, e: MouseEvent) {
    e.stopPropagation();
    const fk = getFKTarget(column);
    if (!fk) return;

    const newStep: FKNavigationStep = {
      fromTable: fk.sourceTable,
      fromColumn: fk.sourceColumn,
      toTable: fk.targetTable,
      toColumn: fk.targetColumn
    };

    localNavPath = [...localNavPath, newStep];
    localField = '';
    onNavigationChange?.(localNavPath);
    onFieldChange('');
    // Keep dropdown open to select field from navigated table
  }

  function navigateBack(toIndex: number, e: MouseEvent) {
    e.stopPropagation();
    if (toIndex === -1) {
      localNavPath = [];
      localTable = '';
      localField = '';
    } else {
      localNavPath = localNavPath.slice(0, toIndex + 1);
      localField = '';
    }
    onNavigationChange?.(localNavPath);
    onFieldChange('');
  }
</script>

<!-- Combined Table.Field Selector -->
<div class="field-selector" bind:this={dropdownRef}>
  <button
    class="selector-trigger"
    class:open={isOpen}
    onclick={() => isOpen = !isOpen}
  >
    <span class="trigger-value">{displayValue()}</span>
    <span class="trigger-chevron">{isOpen ? '▲' : '▼'}</span>
  </button>

  {#if isOpen}
    <div class="selector-dropdown">
      <!-- Navigation breadcrumb inside dropdown -->
      {#if localTable}
        <div class="dropdown-breadcrumb">
          <button
            class="breadcrumb-btn"
            class:active={localNavPath.length === 0 && !localField}
            onclick={(e) => navigateBack(-1, e)}
          >
            📋 Tables
          </button>
          {#if localTable}
            <span class="breadcrumb-sep">→</span>
            <button
              class="breadcrumb-btn"
              class:active={localNavPath.length === 0}
              onclick={(e) => { localNavPath = []; localField = ''; onNavigationChange?.([]); onFieldChange(''); e.stopPropagation(); }}
            >
              {localTable}
            </button>
          {/if}
          {#each localNavPath as step, i}
            <span class="breadcrumb-sep">→</span>
            <button
              class="breadcrumb-btn"
              class:active={i === localNavPath.length - 1}
              onclick={(e) => navigateBack(i, e)}
            >
              {step.toTable}
            </button>
          {/each}
        </div>
      {/if}

      <!-- Table list (when no table selected) -->
      {#if !localTable}
        <div class="dropdown-section">
          <div class="section-label">Select a table</div>
          {#each availableTables as { table }}
            <button
              class="dropdown-item table-item"
              onclick={() => selectTable(table.name)}
            >
              <span class="item-icon">📋</span>
              <span class="item-name">{table.name}</span>
            </button>
          {/each}
        </div>
      {:else}
        <!-- Field list (when table is selected) -->
        <div class="dropdown-section">
          <div class="section-label">Select field from {currentTableName()}</div>
          {#each availableFields as column}
            {@const fkTarget = getFKTarget(column)}
            <div class="dropdown-item-row">
              <button
                class="dropdown-item field-item"
                class:selected={localField === column.name}
                onclick={() => selectField(column)}
              >
                <span class="item-icon">{getFieldIcon(column)}</span>
                <span class="item-name">{column.name}</span>
                <span class="item-type">{getFieldTypeLabel(column.type)}</span>
                {#if column.isPrimaryKey}<span class="item-badge pk">PK</span>{/if}
                {#if column.isForeignKey}<span class="item-badge fk">FK</span>{/if}
              </button>
              {#if fkTarget}
                <button
                  class="fk-drill-btn"
                  onclick={(e) => navigateToFK(column, e)}
                  title="Drill into {fkTarget.targetTable}"
                >
                  → {fkTarget.targetTable}
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .field-selector {
    position: relative;
  }

  /* Trigger button */
  .selector-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 0.75rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .selector-trigger:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover);
  }

  .selector-trigger.open {
    border-color: var(--accent-primary);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .trigger-value {
    font-family: ui-monospace, monospace;
    font-weight: 500;
  }

  .trigger-chevron {
    font-size: 0.625rem;
    color: var(--text-muted);
  }

  /* Dropdown panel */
  .selector-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #1e1e2e;
    background-color: var(--bg-secondary, #1e1e2e);
    border: 1px solid var(--accent-primary);
    border-top: none;
    border-bottom-left-radius: 6px;
    border-bottom-right-radius: 6px;
    max-height: 300px;
    overflow-y: auto;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  }

  /* Custom scrollbar styling */
  .selector-dropdown::-webkit-scrollbar {
    width: 8px;
  }

  .selector-dropdown::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
  }

  .selector-dropdown::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
  }

  .selector-dropdown::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  /* Firefox scrollbar */
  .selector-dropdown {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) rgba(255, 255, 255, 0.05);
  }

  /* Breadcrumb inside dropdown */
  .dropdown-breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border-color);
    flex-wrap: wrap;
  }

  .breadcrumb-btn {
    padding: 0.25rem 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-family: ui-monospace, monospace;
    cursor: pointer;
    transition: all 0.15s;
  }

  .breadcrumb-btn:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover);
    color: var(--text-primary);
  }

  .breadcrumb-btn.active {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: white;
  }

  .breadcrumb-sep {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  /* Dropdown sections */
  .dropdown-section {
    padding: 0.5rem;
  }

  .section-label {
    padding: 0.25rem 0.5rem;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 0.05em;
  }

  /* Item rows */
  .dropdown-item-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .dropdown-item {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
  }

  .dropdown-item:hover {
    background: var(--bg-hover);
    border-color: var(--border-color);
  }

  .dropdown-item.selected {
    background: var(--accent-primary);
    color: white;
    border-color: var(--accent-primary);
  }

  .item-icon {
    font-size: 0.875rem;
    flex-shrink: 0;
  }

  .item-name {
    flex: 1;
    font-family: ui-monospace, monospace;
    font-weight: 500;
  }

  .item-type {
    color: var(--text-muted);
    font-size: 0.6875rem;
    flex-shrink: 0;
  }

  .dropdown-item.selected .item-type {
    color: rgba(255, 255, 255, 0.7);
  }

  .item-badge {
    padding: 0.125rem 0.25rem;
    border-radius: 3px;
    font-size: 0.5625rem;
    font-weight: 600;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .item-badge.pk {
    background: rgba(255, 193, 7, 0.2);
    color: #ffc107;
  }

  .item-badge.fk {
    background: rgba(0, 200, 117, 0.2);
    color: #00c875;
  }

  /* FK drill button */
  .fk-drill-btn {
    padding: 0.25rem 0.5rem;
    background: rgba(0, 200, 117, 0.1);
    border: 1px solid rgba(0, 200, 117, 0.3);
    border-radius: 4px;
    color: #00c875;
    font-size: 0.6875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .fk-drill-btn:hover {
    background: rgba(0, 200, 117, 0.3);
    border-color: #00c875;
  }
</style>

