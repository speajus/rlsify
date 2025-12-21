<script lang="ts">
  import type { RLSPolicyConfig } from '@speajus/rlsify-types';
  import { createContainer, policyGenerator } from '@speajus/rlsify-core';

  interface Props {
    config: RLSPolicyConfig;
  }

  let { config }: Props = $props();

  let sql = $state('');
  let error = $state('');

  async function generateSQL() {
    try {
      error = '';
      console.log('Generating SQL for config:', config);
      const container = createContainer();
      const generator = container.resolve(policyGenerator);

      const result = await generator.generate(config);
      console.log('Generation result:', result);

      if (!result.validation.valid) {
        error = result.validation.errors.map(e => e.message).join('\n');
        sql = '';
        console.error('Validation errors:', error);
        return;
      }

      sql = result.statements.map(s => s.sql).join('\n\n');
      console.log('Generated SQL:', sql);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      sql = '';
      console.error('Error generating SQL:', err);
    }
  }
  
  $effect(() => {
    if (config.table && config.policies.length > 0) {
      generateSQL();
    }
  });
  
  function copyToClipboard() {
    navigator.clipboard.writeText(sql);
  }
</script>

<div class="preview">
  <div class="preview-header">
    <h3>SQL Preview</h3>
    {#if sql}
      <button onclick={copyToClipboard}>Copy SQL</button>
    {/if}
  </div>

  {#if error}
    <div class="error">
      <strong>Validation Errors:</strong>
      <pre>{error}</pre>
    </div>
  {:else if sql}
    <pre class="sql-output"><code>{sql}</code></pre>
  {:else if !config.table}
    <p class="empty">⚠️ Please select a table name first.</p>
  {:else if config.policies.length === 0}
    <p class="empty">⚠️ Please add at least one policy.</p>
  {:else}
    <p class="empty">Generating SQL...</p>
  {/if}
</div>

<style>
  .preview {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 2rem;
  }

  .preview-header {
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

  .error {
    background: rgba(237, 66, 69, 0.15);
    border: 1px solid var(--accent-error);
    border-radius: 4px;
    padding: 1rem;
    color: var(--accent-error);
  }

  .error strong {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--text-primary);
  }

  .error pre {
    margin: 0;
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
  }

  .sql-output {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 1.5rem;
    overflow-x: auto;
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
    line-height: 1.6;
    color: #58a6ff;
  }

  .sql-output code {
    color: inherit;
  }

  .empty {
    text-align: center;
    color: var(--text-secondary);
    padding: 2rem;
    border: 2px dashed var(--border-color);
    border-radius: 8px;
    background: var(--bg-tertiary);
  }
</style>

