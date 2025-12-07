<script lang="ts">
  import PolicyEditor from './lib/PolicyEditor.svelte';
  import SQLPreview from './lib/SQLPreview.svelte';
  import SchemaLoader from './lib/SchemaLoader.svelte';
  import JoinEditor from './lib/JoinEditor.svelte';
  import { policyConfig, updateJoins, loadExamplePolicy, updateTable } from './lib/stores/policy-store.js';
  import { loadMockSchema } from './lib/stores/schema-store.js';
  import { examplePolicies } from './lib/examples/multi-tenant-schema.js';
  import { onMount } from 'svelte';

  let showPreview = $state(false);

  // Load mock schema and first example on mount
  onMount(() => {
    loadMockSchema();
    // Load the simple user-owned example (compatible with visual builder)
    setTimeout(() => {
      const firstExample = examplePolicies.userOwnedResources;
      loadExamplePolicy(firstExample, firstExample.table);
      updateTable(firstExample.table);
    }, 600);
  });
</script>

<main>
  <header>
    <h1>🔒 RLSify</h1>
    <p>PostgreSQL Row-Level Security Policy Builder</p>
  </header>

  <div class="container">
    <SchemaLoader />

    <PolicyEditor />

    <JoinEditor
      joins={$policyConfig.joins || []}
      onUpdate={updateJoins}
      baseTable={$policyConfig.table}
    />

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
</style>

