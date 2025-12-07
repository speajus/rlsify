<script lang="ts">
  import { policyConfig, addPolicy, removePolicy, updateTable } from './stores/policy-store.js';
  import { schema } from './stores/schema-store.js';
  import PolicyItem from './PolicyItem.svelte';
  import ExamplePolicies from './ExamplePolicies.svelte';

  let tableName = $state('');

  // Get available tables from schema
  let availableTables = $derived($schema?.tables || []);

  // Sync tableName with policy config when it changes externally (e.g., from loading an example)
  $effect(() => {
    if ($policyConfig.table && $policyConfig.table !== tableName) {
      tableName = $policyConfig.table;
    }
  });

  // Update policy config when tableName changes from user input
  $effect(() => {
    if (tableName !== $policyConfig.table) {
      updateTable(tableName);
    }
  });
</script>

<div class="editor">
  <h2>Policy Configuration</h2>

  <div class="form-group">
    <label for="table">Table Name</label>
    {#if availableTables.length > 0}
      <select
        id="table"
        bind:value={tableName}
      >
        <option value="">Select a table...</option>
        {#each availableTables as table}
          <option value="{table.schema}.{table.name}">
            {table.schema}.{table.name}
          </option>
        {/each}
      </select>
    {:else}
      <input
        id="table"
        type="text"
        bind:value={tableName}
        placeholder="e.g., public.posts, public.users"
      />
      <p class="hint">Load schema to see available tables</p>
    {/if}
  </div>

  <ExamplePolicies />

  <div class="policies-section">
    <div class="section-header">
      <h3>Policies</h3>
      <button onclick={addPolicy}>+ Add Policy</button>
    </div>

    {#if $policyConfig.policies.length === 0}
      <p class="empty-state">No policies defined. Click "Add Policy" to get started.</p>
    {:else}
      <div class="policies-list">
        {#each $policyConfig.policies as policy, index (index)}
          <PolicyItem
            {policy}
            {index}
            onRemove={() => removePolicy(index)}
            baseTable={tableName}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .editor {
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
    margin: 0;
    color: var(--text-primary);
    font-size: 1.3rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  input,
  select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-size: 1rem;
    transition: all 0.2s ease;
  }

  input:focus,
  select:focus {
    outline: none;
    border-color: var(--accent-primary);
    background: var(--bg-hover);
  }

  .hint {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .policies-section {
    margin-top: 2rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .empty-state {
    text-align: center;
    color: var(--text-secondary);
    padding: 2rem;
    border: 2px dashed var(--border-color);
    border-radius: 8px;
    background: var(--bg-tertiary);
  }

  .policies-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
</style>

