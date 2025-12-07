<script lang="ts">
  import type { PolicyDefinition, PermissionExpression } from '@speajus/rlsify-types';
  import { policyConfig } from './stores/policy-store.js';
  import PermissionBuilder from './PermissionBuilder.svelte';
  import VisualQueryBuilder from './VisualQueryBuilder.svelte';

  interface Props {
    policy: PolicyDefinition;
    index: number;
    onRemove: () => void;
    baseTable: string;
  }

  let { policy, index, onRemove, baseTable }: Props = $props();

  // Initialize mode based on the policy content
  let usingEditorMode = $state<'sql' | 'json' | 'visual'>(
   
       'visual'
  );

  let checkEditorMode = $state<'sql' | 'json' | 'visual'>(
    'visual'
  );

  function updatePolicy(field: keyof PolicyDefinition, value: any) {
    policyConfig.update((config) => {
      const policies = [...config.policies];
      policies[index] = { ...policies[index], [field]: value };
      return { ...config, policies };
    });
  }

  function updateUsingExpression(expr: PermissionExpression | null) {
    updatePolicy('usingExpression', expr);
    if (expr) {
      // Clear the legacy string field when using JSON expression
      updatePolicy('using', undefined);
    }
  }

  function updateCheckExpression(expr: PermissionExpression | null) {
    updatePolicy('withCheckExpression', expr);
    if (expr) {
      // Clear the legacy string field when using JSON expression
      updatePolicy('withCheck', undefined);
    }
  }
</script>

<div class="policy-item">
  <div class="policy-header">
    <h4>Policy {index + 1}</h4>
    <button class="remove-btn" onclick={onRemove}>Remove</button>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label for="name-{index}">Policy Name</label>
      <input
        id="name-{index}"
        type="text"
        value={policy.name}
        oninput={(e) => updatePolicy('name', e.currentTarget.value)}
        placeholder="e.g., posts_select_own"
      />
    </div>

    <div class="form-group">
      <label for="command-{index}">Command</label>
      <select
        id="command-{index}"
        value={policy.command}
        onchange={(e) => updatePolicy('command', e.currentTarget.value)}
      >
        <option value="SELECT">SELECT</option>
        <option value="INSERT">INSERT</option>
        <option value="UPDATE">UPDATE</option>
        <option value="DELETE">DELETE</option>
        <option value="ALL">ALL</option>
      </select>
    </div>
  </div>

  <div class="form-group">
    <div class="expression-header">
      <label for="using-{index}">USING Expression</label>
      <div class="mode-toggle">
        <button
          class="mode-btn {usingEditorMode === 'sql' ? 'active' : ''}"
          onclick={() => {
            usingEditorMode = 'sql';
            updatePolicy('usingExpression', null);
          }}
        >
          SQL
        </button>
        <button
          class="mode-btn {usingEditorMode === 'json' ? 'active' : ''}"
          onclick={() => {
            usingEditorMode = 'json';
            if (!policy.usingExpression) {
              updateUsingExpression({ user_id: { _eq: { var: 'auth.uid()', type: 'uuid' } } });
            }
          }}
        >
          Templates
        </button>
        <button
          class="mode-btn {usingEditorMode === 'visual' ? 'active' : ''}"
          onclick={() => {
            usingEditorMode = 'visual';
            if (!policy.usingExpression) {
              updateUsingExpression({});
            }
          }}
        >
          Visual Builder
        </button>
      </div>
    </div>

    {#if usingEditorMode === 'sql'}
      <textarea
        id="using-{index}"
        value={policy.using || ''}
        oninput={(e) => updatePolicy('using', e.currentTarget.value)}
        placeholder="e.g., user_id = auth.uid()"
        rows="2"
      ></textarea>
    {:else if usingEditorMode === 'json'}
      <PermissionBuilder
        expression={policy.usingExpression}
        onUpdate={updateUsingExpression}
        baseTable={baseTable}
      />
    {:else if usingEditorMode === 'visual'}
      <VisualQueryBuilder
        baseTable={baseTable}
        expression={policy.usingExpression}
        onUpdate={updateUsingExpression}
      />
    {/if}
  </div>

  <div class="form-group">
    <div class="expression-header">
      <label for="withCheck-{index}">WITH CHECK Expression (optional)</label>
      <div class="mode-toggle">
        <button
          class="mode-btn {checkEditorMode === 'sql' ? 'active' : ''}"
          onclick={() => {
            checkEditorMode = 'sql';
            updatePolicy('withCheckExpression', null);
          }}
        >
          SQL
        </button>
        <button
          class="mode-btn {checkEditorMode === 'json' ? 'active' : ''}"
          onclick={() => {
            checkEditorMode = 'json';
            if (!policy.withCheckExpression) {
              updateCheckExpression({ user_id: { _eq: { var: 'auth.uid()', type: 'uuid' } } });
            }
          }}
        >
          Templates
        </button>
        <button
          class="mode-btn {checkEditorMode === 'visual' ? 'active' : ''}"
          onclick={() => {
            checkEditorMode = 'visual';
            if (!policy.withCheckExpression) {
              updateCheckExpression({});
            }
          }}
        >
          Visual Builder
        </button>
      </div>
    </div>

    {#if checkEditorMode === 'sql'}
      <textarea
        id="withCheck-{index}"
        value={policy.withCheck || ''}
        oninput={(e) => updatePolicy('withCheck', e.currentTarget.value)}
        placeholder="e.g., user_id = auth.uid()"
        rows="2"
      ></textarea>
    {:else if checkEditorMode === 'json'}
      <PermissionBuilder
        expression={policy.withCheckExpression }
        onUpdate={updateCheckExpression}
        baseTable={baseTable}
      />
    {:else if checkEditorMode === 'visual'}
      <VisualQueryBuilder
        baseTable={baseTable}
        expression={policy.withCheckExpression}
        onUpdate={updateCheckExpression}
      />
    {/if}
  </div>
</div>

<style>
  .policy-item {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1.5rem;
    transition: border-color 0.2s ease;
  }

  .policy-item:hover {
    border-color: var(--border-hover);
  }

  .policy-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  h4 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--text-primary);
  }

  .remove-btn {
    background: var(--accent-error);
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    transition: all 0.2s ease;
  }

  .remove-btn:hover {
    background: #c23032;
    transform: translateY(-1px);
  }

  .form-row {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    font-size: 0.9rem;
    color: var(--text-primary);
  }

  input,
  select,
  textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.95rem;
    font-family: 'Courier New', monospace;
    transition: all 0.2s ease;
  }

  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: var(--accent-primary);
    background: var(--bg-hover);
  }

  textarea {
    resize: vertical;
    min-height: 60px;
  }

  select {
    cursor: pointer;
  }

  .expression-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .mode-toggle {
    display: flex;
    gap: 0.25rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 0.25rem;
  }

  .mode-btn {
    padding: 0.4rem 0.8rem;
    font-size: 0.85rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    border-radius: 3px;
    transition: all 0.2s ease;
  }

  .mode-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .mode-btn.active {
    background: var(--accent-primary);
    color: white;
  }

  .json-display {
    position: relative;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 1rem;
  }

  .json-display pre {
    margin: 0;
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
    line-height: 1.6;
    color: #58a6ff;
  }

  .json-display code {
    color: inherit;
  }

  .edit-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    padding: 0.4rem 0.8rem;
    font-size: 0.85rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
  }

  .edit-btn:hover {
    background: var(--bg-hover);
    border-color: var(--accent-primary);
  }
</style>

