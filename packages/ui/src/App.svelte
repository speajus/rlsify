<script lang="ts">
  import PolicyEditor from './lib/PolicyEditor.svelte';
  import SQLPreview from './lib/SQLPreview.svelte';
  import {
    policyConfig,
    savePolicy,
    fetchPolicies,
    fetchPolicy,
    deletePolicy,
    savedPolicies,
    policySaving,
    policyError,
    currentPolicyId,
    resetConfig,
  } from './lib/stores/policy-store.js';
  import { loadSchema, schema, loading as schemaLoading, error as schemaError } from './lib/stores/schema-store.js';
  import { onMount } from 'svelte';

  let showPreview = $state(false);
  let showSavedPolicies = $state(false);

  // Load schema and saved policies from backend on mount
  onMount(async () => {
    try {
      await Promise.all([
        loadSchema('public'),
        fetchPolicies(),
      ]);
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  });

  async function handleSave() {
    const description = prompt('Enter a description for this policy (optional):');
    await savePolicy(description ?? undefined);
    await fetchPolicies();
  }

  async function handleLoadPolicy(id: string) {
    await fetchPolicy(id);
    showSavedPolicies = false;
  }

  async function handleDeletePolicy(id: string) {
    if (confirm('Are you sure you want to delete this policy?')) {
      await deletePolicy(id);
    }
  }

  function handleNewPolicy() {
    resetConfig();
  }
</script>

<main>
  <header>
    <h1>🔒 RLSify</h1>
    <p>PostgreSQL Row-Level Security Policy Builder</p>
  </header>

  <div class="container">
    <div class="toolbar">
      <button class="btn-primary" onclick={handleNewPolicy}>New Policy</button>
      <button class="btn-primary" onclick={handleSave} disabled={$policySaving}>
        {$policySaving ? 'Saving...' : ($currentPolicyId ? 'Update Policy' : 'Save Policy')}
      </button>
      <button class="btn-secondary" onclick={() => showSavedPolicies = !showSavedPolicies}>
        {showSavedPolicies ? 'Hide' : 'Show'} Saved Policies ({$savedPolicies.length})
      </button>
      {#if $schemaLoading}
        <span class="status loading">Loading schema...</span>
      {:else if $schemaError}
        <span class="status error">{$schemaError}</span>
      {:else if $schema}
        <span class="status success">✓ {$schema.tables.length} tables loaded</span>
      {/if}
      {#if $policyError}
        <span class="status error">{$policyError}</span>
      {/if}
    </div>

    {#if showSavedPolicies && $savedPolicies.length > 0}
      <div class="saved-policies">
        <h3>Saved Policies</h3>
        <ul>
          {#each $savedPolicies as policy}
            <li>
              <div class="policy-info">
                <strong>{policy.config?.table ?? 'Unknown'}</strong>
                {#if policy.description}
                  <span class="description">{policy.description}</span>
                {/if}
                <span class="date">{new Date(policy.updatedAt).toLocaleDateString()}</span>
              </div>
              <div class="policy-actions">
                <button class="btn-small" onclick={() => handleLoadPolicy(policy.id)}>Load</button>
                <button class="btn-small btn-danger" onclick={() => handleDeletePolicy(policy.id)}>Delete</button>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <PolicyEditor />

    <div class="actions">
      <button onclick={() => showPreview = !showPreview}>
        {showPreview ? 'Hide' : 'Show'} SQL Preview
      </button>
    </div>

    {#if showPreview}
      <SQLPreview config={$policyConfig} />
    {/if}
  </div>
</main>

<style>
  main {
    width: 100%;
  }

  header {
    text-align: center;
    margin-bottom: 3rem;
    padding: 2rem 0;
    border-bottom: 1px solid var(--border-color);
  }

  h1 {
    font-size: 3rem;
    margin-bottom: 0.5rem;
    color: var(--text-primary);
    background: linear-gradient(135deg, var(--accent-primary) 0%, #7289da 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  p {
    color: var(--text-secondary);
    font-size: 1.1rem;
  }

  .container {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    padding: 1rem 0;
  }

  .toolbar {
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: 1rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    border: 1px solid var(--border-color);
    flex-wrap: wrap;
  }

  .status {
    font-size: 0.85rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    margin-left: auto;
  }

  .status.loading {
    color: var(--text-secondary);
  }

  .status.success {
    color: #43b581;
  }

  .status.error {
    color: #dc3545;
  }

  .btn-primary {
    background: var(--accent-primary);
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: var(--bg-hover);
  }

  .btn-small {
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid var(--border-color);
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .btn-small:hover {
    background: var(--bg-hover);
  }

  .btn-danger {
    background: #dc3545;
    color: white;
    border-color: #dc3545;
  }

  .btn-danger:hover {
    background: #c82333;
  }

  .error {
    color: #dc3545;
    font-size: 0.9rem;
  }

  .saved-policies {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1rem;
  }

  .saved-policies h3 {
    margin: 0 0 1rem 0;
    color: var(--text-primary);
  }

  .saved-policies ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .saved-policies li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--bg-tertiary);
    border-radius: 4px;
    border: 1px solid var(--border-color);
  }

  .policy-info {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .policy-info .description {
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .policy-info .date {
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .policy-actions {
    display: flex;
    gap: 0.5rem;
  }
</style>

