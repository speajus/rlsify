<script lang="ts">
  import type { PermissionExpression, ComparisonOperator } from '@speajus/rlsify-types';
  import { schema } from './stores/schema-store.js';

  interface Props {
    expression?: PermissionExpression;
    onUpdate: (expr?: PermissionExpression) => void;
    baseTable: string;
  }

  let { expression, onUpdate, baseTable }: Props = $props();

  // Available operators
  const comparisonOps: { value: ComparisonOperator; label: string }[] = [
    { value: '_eq', label: 'equals (=)' },
    { value: '_neq', label: 'not equals (≠)' },
    { value: '_gt', label: 'greater than (>)' },
    { value: '_gte', label: 'greater than or equal (≥)' },
    { value: '_lt', label: 'less than (<)' },
    { value: '_lte', label: 'less than or equal (≤)' },
    { value: '_in', label: 'in array' },
    { value: '_nin', label: 'not in array' },
    { value: '_like', label: 'like (pattern)' },
    { value: '_ilike', label: 'like (case-insensitive)' },
    { value: '_is_null', label: 'is null' },
  ];

  // Common session variables for Supabase/PostgreSQL
  const sessionVars = [
    { value: 'auth.uid()', label: 'Current User ID (auth.uid())' },
    { value: 'current_user', label: 'Current Database User' },
    { value: 'current_setting(\'request.jwt.claims\')::json->>\'role\'', label: 'JWT Role' },
    { value: 'current_setting(\'request.jwt.claims\')::json->>\'org_id\'', label: 'JWT Org ID' },
  ];

  // Get columns for the base table
  let baseTableColumns = $derived($schema?.tables.find(t => t.name === baseTable)?.columns || []);

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

  // Convert expression to readable JSON
  let jsonPreview = $derived(expression ? JSON.stringify(expression, null, 2) : '{}');
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
      <div class="json-preview">
        <div class="preview-header">
          <strong>JSON Expression:</strong>
          <button class="secondary" onclick={() => onUpdate()}>Clear</button>
        </div>
        <pre><code>{jsonPreview}</code></pre>
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

  .json-preview {
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

  pre {
    margin: 0;
    padding: 1rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    overflow-x: auto;
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
    line-height: 1.6;
  }

  code {
    color: #58a6ff;
  }

  .info {
    background: rgba(88, 166, 255, 0.1);
    border: 1px solid rgba(88, 166, 255, 0.3);
    border-radius: 6px;
    padding: 1rem;
    color: var(--text-secondary);
    margin: 0;
    font-size: 0.95rem;
  }
</style>

