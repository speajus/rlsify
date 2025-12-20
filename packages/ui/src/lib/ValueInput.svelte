<script lang="ts">
  import type { TableInfo } from '@speajus/rlsify-types';
  import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';

  interface Props {
    value: any;
    valueType: 'literal' | 'session' | 'column';
    operator: string;
    availableTables: Array<{ table: TableInfo; path: string[]; relationship: string }>;
    onChange: (value: any, valueType: 'literal' | 'session' | 'column') => void;
  }

  let { value, valueType, operator, availableTables, onChange }: Props = $props();

  // Get all available columns from all tables
  let availableColumns = $derived.by(() => {
    const columns: Array<{ tableName: string; columnName: string; type: string; fullPath: string }> = [];

    availableTables.forEach(({ table, path }) => {
      table.columns.forEach(column => {
        const fullPath = path.length > 1
          ? `${path[path.length - 1]}.${column.name}`
          : column.name;

        columns.push({
          tableName: table.name,
          columnName: column.name,
          type: column.type,
          fullPath
        });
      });
    });

    return columns;
  });

  const sessionVariables = [
    { value: 'auth.uid()', label: 'Current User ID (auth.uid())' },
    { value: 'current_user', label: 'Current Database User' },
    { value: "current_setting('request.jwt.claims')::json->>'role'", label: 'JWT Role' },
    { value: "current_setting('request.jwt.claims')::json->>'org_id'", label: 'JWT Org ID' },
    { value: "current_setting('request.jwt.claims')::json->>'email'", label: 'JWT Email' },
  ];

  const typeLabels = {
    literal: 'Literal',
    session: 'Session',
    column: 'Column'
  };

  let inputType = $state(valueType);
  let inputValue = $state(value);
  let typeDropdownOpen = $state(false);
  let valueDropdownOpen = $state(false);

  function handleTypeChange(newType: 'literal' | 'session' | 'column') {
    inputType = newType;
    inputValue = '';
    typeDropdownOpen = false;
    onChange('', newType);
  }

  function handleValueChange(newValue: any) {
    inputValue = newValue;
    onChange(newValue, inputType);
  }

  function selectSessionValue(val: string) {
    handleValueChange(val);
    valueDropdownOpen = false;
  }

  function selectColumnValue(val: string) {
    handleValueChange(val);
    valueDropdownOpen = false;
  }

  // Get display label for current value
  let displayValue = $derived.by(() => {
    if (!inputValue) return '';
    if (inputType === 'session') {
      const sv = sessionVariables.find(s => s.value === inputValue);
      return sv?.label || inputValue;
    }
    if (inputType === 'column') {
      return inputValue;
    }
    return inputValue;
  });

  // For _is_null operator, we don't need a value input
  let needsValue = $derived(operator !== '_is_null');
</script>

<div class="value-input">

  {#if !needsValue}
    <div class="no-value-needed">
      <span class="hint">No value needed for NULL check</span>
    </div>
  {:else}
    <div class="input-group">
      <!-- Type prefix dropdown -->
      <div class="type-prefix">
        <button
          class="type-trigger"
          onclick={() => typeDropdownOpen = !typeDropdownOpen}
          type="button"
        >
          <span>{typeLabels[inputType]}</span>
          <ChevronDown class="chevron" />
        </button>

        {#if typeDropdownOpen}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="type-dropdown" onmouseleave={() => typeDropdownOpen = false}>
            <button
              class="type-option {inputType === 'literal' ? 'active' : ''}"
              onclick={() => handleTypeChange('literal')}
              type="button"
            >
              Literal
            </button>
            <button
              class="type-option {inputType === 'session' ? 'active' : ''}"
              onclick={() => handleTypeChange('session')}
              type="button"
            >
              Session
            </button>
            <button
              class="type-option {inputType === 'column' ? 'active' : ''}"
              onclick={() => handleTypeChange('column')}
              type="button"
            >
              Column
            </button>
          </div>
        {/if}
      </div>

      <!-- Value input/select -->
      <div class="value-field">
        {#if inputType === 'literal'}
          <input
            type="text"
            value={inputValue}
            oninput={(e) => handleValueChange(e.currentTarget.value)}
            placeholder={operator === '_in' || operator === '_nin' ? 'value1, value2, ...' : 'Enter value...'}
          />
        {:else if inputType === 'session'}
          <button
            class="value-trigger"
            onclick={() => valueDropdownOpen = !valueDropdownOpen}
            type="button"
          >
            <span class="value-display">{displayValue || 'Select session variable...'}</span>
            <ChevronDown class="chevron" />
          </button>

          {#if valueDropdownOpen}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="value-dropdown" onmouseleave={() => valueDropdownOpen = false}>
              {#each sessionVariables as sv}
                <button
                  class="value-option {inputValue === sv.value ? 'active' : ''}"
                  onclick={() => selectSessionValue(sv.value)}
                  type="button"
                >
                  {sv.label}
                </button>
              {/each}
            </div>
          {/if}
        {:else if inputType === 'column'}
          <button
            class="value-trigger"
            onclick={() => valueDropdownOpen = !valueDropdownOpen}
            type="button"
          >
            <span class="value-display">{displayValue || 'Select column...'}</span>
            <ChevronDown class="chevron" />
          </button>

          {#if valueDropdownOpen}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="value-dropdown" onmouseleave={() => valueDropdownOpen = false}>
              {#each availableColumns as col}
                <button
                  class="value-option {inputValue === col.fullPath ? 'active' : ''}"
                  onclick={() => selectColumnValue(col.fullPath)}
                  type="button"
                >
                  {col.fullPath} <span class="col-type">({col.type})</span>
                </button>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .value-input {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .no-value-needed {
    padding: 0.75rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    text-align: center;
  }

  .hint {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  /* Input group styles */
  .input-group {
    display: flex;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    overflow: visible;
    background: var(--bg-tertiary);
  }

  .input-group:focus-within {
    border-color: var(--accent-primary);
  }

  /* Type prefix dropdown */
  .type-prefix {
    position: relative;
    flex-shrink: 0;
    border-right: 1px solid var(--border-color);
  }

  .type-trigger {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary);
    border: none;
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    height: 100%;
    border-radius: 5px 0 0 5px;
    transition: all 0.15s ease;
  }

  .type-trigger:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .type-trigger :global(.chevron) {
    width: 12px;
    height: 12px;
    opacity: 0.6;
  }

  .type-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 100%;
    background: #1e1e2e;
    background-color: var(--bg-secondary, #1e1e2e);
    border: 1px solid var(--accent-primary);
    border-radius: 6px;
    margin-top: 2px;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    overflow: hidden;
  }

  .type-option {
    display: block;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .type-option:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .type-option.active {
    background: var(--accent-primary);
    color: white;
  }

  /* Value field */
  .value-field {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .value-field input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .value-field input:focus {
    outline: none;
  }

  .value-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    color: var(--text-primary);
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;
  }

  .value-trigger:hover {
    background: var(--bg-hover);
  }

  .value-trigger :global(.chevron) {
    width: 14px;
    height: 14px;
    opacity: 0.5;
    flex-shrink: 0;
  }

  .value-display {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .value-dropdown {
    position: absolute;
    top: 100%;
    left: -1px;
    right: -1px;
    background: #1e1e2e;
    background-color: var(--bg-secondary, #1e1e2e);
    border: 1px solid var(--accent-primary);
    border-radius: 6px;
    margin-top: 4px;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    max-height: 200px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) rgba(255, 255, 255, 0.05);
  }

  .value-dropdown::-webkit-scrollbar {
    width: 8px;
  }

  .value-dropdown::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
  }

  .value-dropdown::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
  }

  .value-option {
    display: block;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    color: var(--text-primary);
    font-size: 0.8rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .value-option:hover {
    background: var(--bg-hover);
  }

  .value-option.active {
    background: var(--accent-primary);
    color: white;
  }

  .col-type {
    color: var(--text-muted);
    font-size: 0.7rem;
  }
</style>

