<script lang="ts">
  import type { TableInfo } from '@speajus/rlsify-types';

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
  
  let inputType = $state(valueType);
  let inputValue = $state(value);
  
  function handleTypeChange(newType: 'literal' | 'session' | 'column') {
    inputType = newType;
    inputValue = '';
    onChange('', newType);
  }
  
  function handleValueChange(newValue: any) {
    inputValue = newValue;
    onChange(newValue, inputType);
  }
  
  // For _is_null operator, we don't need a value input
  let needsValue = $derived(operator !== '_is_null');
</script>

<div class="value-input">
  <label>Value</label>
  
  {#if !needsValue}
    <div class="no-value-needed">
      <span class="hint">No value needed for NULL check</span>
    </div>
  {:else}
    <div class="value-type-tabs">
      <button
        class="type-tab {inputType === 'literal' ? 'active' : ''}"
        onclick={() => handleTypeChange('literal')}
      >
        Literal
      </button>
      <button
        class="type-tab {inputType === 'session' ? 'active' : ''}"
        onclick={() => handleTypeChange('session')}
      >
        Session Variable
      </button>
      <button
        class="type-tab {inputType === 'column' ? 'active' : ''}"
        onclick={() => handleTypeChange('column')}
      >
        Column
      </button>
    </div>
    
    <div class="value-input-field">
      {#if inputType === 'literal'}
        {#if operator === '_in' || operator === '_nin'}
          <input
            type="text"
            value={inputValue}
            oninput={(e) => handleValueChange(e.currentTarget.value)}
            placeholder="value1, value2, value3"
          />
          <span class="hint">Comma-separated values</span>
        {:else}
          <input
            type="text"
            value={inputValue}
            oninput={(e) => handleValueChange(e.currentTarget.value)}
            placeholder="Enter value..."
          />
        {/if}
      {:else if inputType === 'session'}
        <select value={inputValue} onchange={(e) => handleValueChange(e.currentTarget.value)}>
          <option value="">Select session variable...</option>
          {#each sessionVariables as sv}
            <option value={sv.value}>{sv.label}</option>
          {/each}
        </select>
      {:else if inputType === 'column'}
        <select value={inputValue} onchange={(e) => handleValueChange(e.currentTarget.value)}>
          <option value="">Select column...</option>
          {#each availableColumns as col}
            <option value={col.fullPath}>
              {col.fullPath} ({col.type})
            </option>
          {/each}
        </select>
        <span class="hint">Reference another column</span>
      {/if}
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
  
  .value-type-tabs {
    display: flex;
    gap: 0.25rem;
    background: var(--bg-tertiary);
    padding: 0.25rem;
    border-radius: 6px;
  }
  
  .type-tab {
    flex: 1;
    padding: 0.375rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .type-tab:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  
  .type-tab.active {
    background: var(--accent-primary);
    color: white;
  }
  
  .value-input-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  input,
  select {
    width: 100%;
    padding: 0.5rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 0.875rem;
  }
  
  input:focus,
  select:focus {
    outline: none;
    border-color: var(--accent-primary);
  }
  
  .hint {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
</style>

