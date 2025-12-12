<script lang="ts">
  import type { PermissionExpression, ComparisonOperator } from '@speajus/rlsify-types';
  import { schema } from './stores/schema-store.js';

  interface Props {
    expression?: PermissionExpression;
    onUpdate: (expr?: PermissionExpression) => void;
    baseTable: string;
  }

  let { expression, onUpdate, baseTable }: Props = $props();

  // Editable JSON state
  let editableJson = $state('');
  let jsonError = $state<string | null>(null);
  let isEditing = $state(false);

  // Sync editable JSON with expression when not editing
  $effect(() => {
    if (!isEditing) {
      editableJson = expression ? JSON.stringify(expression, null, 2) : '{}';
    }
  });

  function handleJsonInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    editableJson = target.value;
    jsonError = null;

    try {
      const parsed = JSON.parse(editableJson);
      onUpdate(parsed);
    } catch (err) {
      jsonError = err instanceof Error ? err.message : 'Invalid JSON';
    }
  }

  function handleFocus() {
    isEditing = true;
  }

  function handleBlur() {
    isEditing = false;
    // Re-format if valid JSON
    if (!jsonError && expression) {
      editableJson = JSON.stringify(expression, null, 2);
    }
  }

  // Syntax highlighting for JSON
  function highlightJson(json: string): string {
    return json
      // Escape HTML first
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Highlight strings (including keys)
      .replace(/"([^"\\]|\\.)*"/g, (match) => {
        // Check if it's a key (followed by :)
        if (match.startsWith('"_')) {
          return `<span class="json-operator">${match}</span>`;
        }
        return `<span class="json-string">${match}</span>`;
      })
      // Highlight numbers
      .replace(/\b(-?\d+\.?\d*)\b/g, '<span class="json-number">$1</span>')
      // Highlight booleans and null
      .replace(/\b(true|false|null)\b/g, '<span class="json-boolean">$1</span>');
  }

  let highlightedJson = $derived(highlightJson(editableJson));


  function createSimpleExpression(): PermissionExpression {
    return {
      user_id: {
        _eq: { var: 'auth.uid()', type: 'uuid' }
      }
    };
  }

  function createAndExpression(): PermissionExpression {
    return {
      _and: [
        { user_id: { _eq: { var: 'auth.uid()', type: 'uuid' } } }
      ]
    };
  }

  function createOrExpression(): PermissionExpression {
    return {
      _or: [
        { user_id: { _eq: { var: 'auth.uid()', type: 'uuid' } } }
      ]
    };
  }

  function useTemplate(template: 'user-owned' | 'role-based' | 'org-tenant') {
    let expr: PermissionExpression;

    switch (template) {
      case 'user-owned':
        expr = {
          user_id: {
            _eq: { var: 'auth.uid()', type: 'uuid' }
          }
        };
        break;

      case 'role-based':
        expr = {
          _exists: {
            _table: 'user_roles',
            _where: {
              _and: [
                { user_id: { _eq: { var: 'auth.uid()', type: 'uuid' } } },
                { role: { _in: ['admin', 'editor'] } }
              ]
            }
          }
        };
        break;

      case 'org-tenant':
        expr = {
          organization_id: {
            _eq: { var: 'current_setting(\'request.jwt.claims\')::json->>\'org_id\'', type: 'text' }
          }
        };
        break;
    }

    onUpdate(expr);
  }

  let copySuccess = $state(false);

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(editableJson);
      copySuccess = true;
      setTimeout(() => {copySuccess = false}, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
</script>

<div class="permission-builder">
  <div class="section-header">
    <h3>Permission Expression Builder</h3>
  </div>

  {#if !expression}
    <div class="templates">
      <p class="hint">Choose a template to get started:</p>
      <div class="template-buttons">
        <button onclick={() => useTemplate('user-owned')}>
          👤 User-Owned Records
          <span class="template-desc">user_id = auth.uid()</span>
        </button>
        <button onclick={() => useTemplate('role-based')}>
          🔐 Role-Based Access
          <span class="template-desc">Check user roles</span>
        </button>
        <button onclick={() => useTemplate('org-tenant')}>
          🏢 Organization/Tenant
          <span class="template-desc">org_id from JWT</span>
        </button>
      </div>
      <div class="or-divider">
        <span>or build custom</span>
      </div>
      <div class="custom-buttons">
        <button onclick={() => onUpdate(createSimpleExpression())}>Simple Condition</button>
        <button onclick={() => onUpdate(createAndExpression())}>AND Conditions</button>
        <button onclick={() => onUpdate(createOrExpression())}>OR Conditions</button>
      </div>
    </div>
  {:else}
    <div class="expression-editor">
      <div class="json-editor-container">
        <div class="preview-header">
          <strong>JSON Expression:</strong>
          <div class="preview-actions">
            <button class="secondary" onclick={copyJson}>
              {copySuccess ? '✓ Copied' : 'Copy'}
            </button>
            <button class="secondary" onclick={() => onUpdate()}>Clear</button>
          </div>
        </div>
        <div class="editor-wrapper" class:has-error={jsonError}>
          <div class="highlight-backdrop" aria-hidden="true">
            <pre>{@html highlightedJson}</pre>
          </div>
          <textarea
            class="json-textarea"
            value={editableJson}
            oninput={handleJsonInput}
            onfocus={handleFocus}
            onblur={handleBlur}
            spellcheck="false"
            autocomplete="off"
            autocapitalize="off"
          ></textarea>
        </div>
        {#if jsonError}
          <div class="json-error">
            ⚠️ {jsonError}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .permission-builder {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 2rem;
    margin-top: 1rem;
  }

  .section-header {
    margin-bottom: 1.5rem;
  }

  h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1.3rem;
  }

  .templates {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .hint {
    color: var(--text-secondary);
    margin: 0 0 1rem 0;
    font-size: 0.95rem;
  }

  .template-buttons {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .template-buttons button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 1.5rem;
    background: var(--bg-tertiary);
    border: 2px solid var(--border-color);
    border-radius: 8px;
    text-align: left;
    font-size: 1rem;
    font-weight: 600;
    transition: all 0.2s ease;
  }

  .template-buttons button:hover {
    border-color: var(--accent-primary);
    background: var(--bg-hover);
    transform: translateY(-2px);
  }

  .template-desc {
    font-size: 0.85rem;
    font-weight: 400;
    color: var(--text-muted);
    margin-top: 0.5rem;
    font-family: 'Courier New', monospace;
  }

  .or-divider {
    text-align: center;
    position: relative;
    margin: 1rem 0;
  }

  .or-divider::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 1px;
    background: var(--border-color);
  }

  .or-divider span {
    background: var(--bg-secondary);
    padding: 0 1rem;
    position: relative;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .custom-buttons {
    display: flex;
    gap: 1rem;
    justify-content: center;
  }

  .custom-buttons button {
    padding: 0.75rem 1.5rem;
  }

  .expression-editor {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .json-editor-container {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 1rem;
  }

  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .preview-header strong {
    color: var(--text-primary);
  }

  .preview-actions {
    display: flex;
    gap: 0.5rem;
  }

  button.secondary {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
  }

  button.secondary:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover);
  }

  /* Editor wrapper with overlapping textarea and highlight backdrop */
  .editor-wrapper {
    position: relative;
    min-height: 150px;
    max-height: 400px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: #1a1a2e;
    overflow: auto;
  }

  .editor-wrapper.has-error {
    border-color: #f85149;
  }

  .highlight-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    pointer-events: none;
    z-index: 0;
  }

  .highlight-backdrop pre {
    margin: 0;
    padding: 1rem;
    background: transparent;
    border: none;
    font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
    font-size: 0.875rem;
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
    color: #e0e0e0;
  }

  .json-textarea {
    position: relative;
    display: block;
    width: 100%;
    min-height: 150px;
    padding: 1rem;
    margin: 0;
    border: none;
    background: transparent;
    color: transparent;
    caret-color: #fff;
    font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
    font-size: 0.875rem;
    line-height: 1.6;
    resize: none;
    outline: none;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow: hidden;
    z-index: 1;
  }

  .json-textarea:focus {
    outline: none;
  }

  .json-error {
    margin-top: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: rgba(248, 81, 73, 0.15);
    border: 1px solid rgba(248, 81, 73, 0.4);
    border-radius: 4px;
    color: #f85149;
    font-size: 0.8rem;
    font-family: monospace;
  }

  /* Syntax highlighting colors */
  :global(.json-operator) {
    color: #ff79c6;
    font-weight: 500;
  }

  :global(.json-string) {
    color: #a5d6ff;
  }

  :global(.json-number) {
    color: #79c0ff;
  }

  :global(.json-boolean) {
    color: #ffa657;
  }
</style>

