<script lang="ts">
  import { schema, loading, error, tables, foreignKeys, loadSchema, loadMockSchema, clearSchema } from './stores/schema-store.js';

  let connectionString = $state('');
  let useMockData = $state(true);

  function handleLoadSchema() {
    if (useMockData) {
      loadMockSchema();
    } else {
      loadSchema(connectionString);
    }
  }

  function handleClearSchema() {
    clearSchema();
    connectionString = '';
  }
</script>

<div class="schema-loader">
  <h2>📊 Database Schema</h2>
  
  {#if !$schema}
    <div class="connection-form">
      <div class="form-group">
        <label>
          <input type="checkbox" bind:checked={useMockData} />
          Use mock data (for demo)
        </label>
      </div>

      {#if !useMockData}
        <div class="form-group">
          <label for="connection">Connection String</label>
          <input
            id="connection"
            type="text"
            bind:value={connectionString}
            placeholder="postgresql://user:password@host:5432/database"
            disabled={$loading}
          />
        </div>
      {/if}

      <button
        onclick={handleLoadSchema}
        disabled={$loading || (!useMockData && !connectionString)}
      >
        {$loading ? 'Loading...' : 'Load Schema'}
      </button>

      {#if $error}
        <div class="error">{$error}</div>
      {/if}
    </div>
  {:else}
    <div class="schema-info">
      <div class="schema-header">
        <div>
          <p class="success">✓ Schema loaded successfully</p>
          <p class="meta">{$tables.length} tables, {$foreignKeys.length} foreign keys</p>
        </div>
        <button onclick={handleClearSchema} class="secondary">Change Schema</button>
      </div>

      <div class="tables-list">
        <h3>Tables</h3>
        {#each $tables as table}
          <div class="table-item">
            <div class="table-name">
              <strong>{table.schema}.{table.name}</strong>
              <span class="column-count">{table.columns.length} columns</span>
            </div>
            <div class="columns">
              {#each table.columns as column}
                <span class="column">
                  {column.name}
                  <span class="type">{column.type}</span>
                  {#if column.isPrimaryKey}
                    <span class="badge pk">PK</span>
                  {/if}
                  {#if !column.nullable}
                    <span class="badge required">NOT NULL</span>
                  {/if}
                </span>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .schema-loader {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 2rem;
  }

  h2 {
    margin-bottom: 1.5rem;
    color: var(--text-primary);
    font-size: 1.5rem;
  }

  h3 {
    margin-bottom: 1rem;
    font-size: 1.1rem;
    color: var(--text-primary);
  }

  .connection-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    font-weight: 500;
    color: var(--text-primary);
  }

  input[type="text"] {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-size: 1rem;
  }

  input[type="text"]:focus {
    outline: none;
    border-color: var(--accent-primary);
    background: var(--bg-hover);
  }

  input[type="text"]:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  input[type="checkbox"] {
    margin-right: 0.5rem;
    cursor: pointer;
  }

  .error {
    color: var(--accent-error);
    padding: 0.75rem;
    background: rgba(237, 66, 69, 0.15);
    border-radius: 4px;
    border: 1px solid var(--accent-error);
  }

  .success {
    color: var(--accent-success);
    margin: 0;
    font-weight: 600;
  }

  .meta {
    color: var(--text-secondary);
    font-size: 0.9rem;
    margin: 0.25rem 0 0 0;
  }

  .schema-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1.5rem;
  }

  .tables-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .table-item {
    background: var(--bg-tertiary);
    padding: 1rem;
    border-radius: 6px;
    border: 1px solid var(--border-color);
    transition: border-color 0.2s ease;
  }

  .table-item:hover {
    border-color: var(--border-hover);
  }

  .table-name {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .table-name strong {
    color: var(--text-primary);
    font-size: 1rem;
  }

  .column-count {
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .columns {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .column {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.35rem 0.6rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: 0.85rem;
    color: var(--text-primary);
  }

  .type {
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .badge {
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .badge.pk {
    background: var(--accent-primary);
    color: white;
  }

  .badge.required {
    background: var(--accent-warning);
    color: #0f1419;
  }

  button.secondary {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
  }

  button.secondary:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover);
  }
</style>

