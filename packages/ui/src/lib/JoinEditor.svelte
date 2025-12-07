<script lang="ts">
  import type { JoinDefinition } from '@speajus/rlsify-types';
  import { schema, tables, foreignKeys } from './stores/schema-store.js';

  interface Props {
    joins: JoinDefinition[];
    onUpdate: (joins: JoinDefinition[]) => void;
    baseTable: string;
  }

  let { joins, onUpdate, baseTable }: Props = $props();
  
  function addJoin() {
    const newJoin: JoinDefinition = {
      table: '',
      type: 'INNER',
      on: '',
    };
    onUpdate([...joins, newJoin]);
  }
  
  function removeJoin(index: number) {
    onUpdate(joins.filter((_, i) => i !== index));
  }
  
  function updateJoin(index: number, field: keyof JoinDefinition, value: any) {
    const updated = [...joins];
    updated[index] = { ...updated[index], [field]: value };
    onUpdate(updated);
  }
  
  function autoDetectJoin(index: number, targetTable: string) {
    if (!targetTable || !baseTable) return;

    // Find foreign key relationship
    const fk = $foreignKeys.find(
      fk =>
        (fk.sourceTable === baseTable && fk.targetTable === targetTable) ||
        (fk.sourceTable === targetTable && fk.targetTable === baseTable)
    );

    if (fk) {
      // Auto-fill the join condition
      const condition = fk.sourceTable === baseTable
        ? `${fk.sourceColumn} = ${targetTable}.${fk.targetColumn}`
        : `${baseTable}.${fk.targetColumn} = ${targetTable}.${fk.sourceColumn}`;

      updateJoin(index, 'on', condition);
    }
  }
  
  function handleTableChange(index: number, table: string) {
    updateJoin(index, 'table', table);
    autoDetectJoin(index, table);
  }
  
  // Get available tables for join (excluding base table and already joined tables)
  function getAvailableTables(currentIndex: number): string[] {
    const joinedTables = joins
      .map((j, i) => i !== currentIndex ? j.table : null)
      .filter(Boolean) as string[];

    return $tables
      .map(t => `${t.schema}.${t.name}`)
      .filter(t => t !== baseTable && !joinedTables.includes(t));
  }

  // Check if a foreign key exists for a table pair
  function hasForeignKey(table1: string, table2: string): boolean {
    return $foreignKeys.some(
      fk =>
        (fk.sourceTable === table1 && fk.targetTable === table2) ||
        (fk.sourceTable === table2 && fk.targetTable === table1)
    );
  }
</script>

<div class="join-editor">
  <div class="section-header">
    <h3>Table Joins</h3>
    <button onclick={addJoin} disabled={!baseTable || !$schema}>
      + Add Join
    </button>
  </div>
  
  {#if !$schema}
    <p class="info">Load a schema first to define joins</p>
  {:else if !baseTable}
    <p class="info">Select a base table first to define joins</p>
  {:else if joins.length === 0}
    <p class="empty-state">No joins defined. Click "Add Join" to join tables.</p>
  {:else}
    <div class="joins-list">
      {#each joins as join, index}
        <div class="join-item">
          <div class="join-header">
            <span class="join-number">Join {index + 1}</span>
            <button onclick={() => removeJoin(index)} class="remove-btn">×</button>
          </div>
          
          <div class="join-fields">
            <div class="form-group">
              <label>Join Type</label>
              <select 
                value={join.type}
                onchange={(e) => updateJoin(index, 'type', e.currentTarget.value)}
              >
                <option value="INNER">INNER JOIN</option>
                <option value="LEFT">LEFT JOIN</option>
                <option value="RIGHT">RIGHT JOIN</option>
              </select>
            </div>
            
            <div class="form-group">
              <label>
                Table
                {#if join.table && hasForeignKey(baseTable, join.table)}
                  <span class="fk-badge">FK detected</span>
                {/if}
              </label>
              <select
                value={join.table}
                onchange={(e) => handleTableChange(index, e.currentTarget.value)}
              >
                <option value="">Select table...</option>
                {#each getAvailableTables(index) as table}
                  <option value={table}>
                    {table}
                    {#if hasForeignKey(baseTable, table)}
                      (has FK)
                    {/if}
                  </option>
                {/each}
              </select>
            </div>
            
            <div class="form-group full-width">
              <label>
                Join Condition
                <span class="hint">e.g., user_id = users.id</span>
              </label>
              <input
                type="text"
                value={join.on}
                oninput={(e) => updateJoin(index, 'on', e.currentTarget.value)}
                placeholder="column = table.column"
              />
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .join-editor {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 2rem;
    margin-top: 1rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1.3rem;
  }

  .info, .empty-state {
    text-align: center;
    color: var(--text-secondary);
    padding: 2rem;
    border: 2px dashed var(--border-color);
    border-radius: 8px;
    background: var(--bg-tertiary);
  }

  .joins-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .join-item {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 1rem;
    transition: border-color 0.2s ease;
  }

  .join-item:hover {
    border-color: var(--border-hover);
  }

  .join-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .join-number {
    font-weight: 600;
    color: var(--accent-primary);
    font-size: 1rem;
  }

  .remove-btn {
    background: transparent;
    border: none;
    color: var(--accent-error);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .remove-btn:hover {
    background: rgba(237, 66, 69, 0.15);
    border-radius: 4px;
    transform: scale(1.1);
  }

  .join-fields {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group.full-width {
    grid-column: 1 / -1;
  }

  label {
    font-weight: 500;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-primary);
  }

  .hint {
    color: var(--text-muted);
    font-weight: 400;
    font-size: 0.8rem;
  }

  .fk-badge {
    background: var(--accent-success);
    color: white;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: 600;
  }

  select, input {
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.95rem;
    transition: all 0.2s ease;
  }

  select:focus, input:focus {
    outline: none;
    border-color: var(--accent-primary);
    background: var(--bg-hover);
  }

  select:disabled, input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>

