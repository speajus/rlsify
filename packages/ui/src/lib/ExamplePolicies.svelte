<script lang="ts">
  import { examplePolicies } from './examples/multi-tenant-schema.js';
  import { loadExamplePolicy, updateTable } from './stores/policy-store.js';
  import type { PolicyDefinition } from '@speajus/rlsify-types';

  let showExamples = $state(false);

  interface ExamplePolicy {
    key: string;
    policy: PolicyDefinition;
    description: string;
  }

  const examples: ExamplePolicy[] = [
    {
      key: 'teamOrgIsolation',
      policy: examplePolicies.teamOrgIsolation,
      description: '🏢 Organization Isolation - Users only see teams from their organizations',
    },
    {
      key: 'projectTeamAccess',
      policy: examplePolicies.projectTeamAccess,
      description: '👥 Team Member Access - Users only see projects from their teams',
    },
    {
      key: 'projectTeamAdminUpdate',
      policy: examplePolicies.projectTeamAdminUpdate,
      description: '🔒 Team Admin Only - Only team admins can update projects',
    },
    {
      key: 'projectOrgAdminAccess',
      policy: examplePolicies.projectOrgAdminAccess,
      description: '👑 Org Admin Override - Org admins see all projects in their organization',
    },
    {
      key: 'documentPublicOrTeamAccess',
      policy: examplePolicies.documentPublicOrTeamAccess,
      description: '📄 Public or Team Access - Documents visible if public OR user is team member',
    },
  ];

  function loadExample(example: ExamplePolicy) {
    loadExamplePolicy(example.policy, example.policy.table);
    updateTable(example.policy.table);
    showExamples = false;
  }
</script>

<div class="example-policies">
  <button class="toggle-btn" onclick={() => (showExamples = !showExamples)}>
    {showExamples ? '✕ Hide' : '📚 Load'} Example Policies
  </button>

  {#if showExamples}
    <div class="examples-panel">
      <h3>Multi-Tenant Permission Examples</h3>
      <p class="hint">
        Click an example to load it into the editor. These demonstrate common patterns for
        organization and team-based permissions.
      </p>

      <div class="examples-list">
        {#each examples as example}
          <button class="example-item" onclick={() => loadExample(example)}>
            <div class="example-header">
              <strong>{example.policy.name}</strong>
              <span class="table-badge">{example.policy.table}</span>
            </div>
            <div class="example-description">{example.description}</div>
            {#if example.policy.description}
              <div class="example-detail">{example.policy.description}</div>
            {/if}
          </button>
        {/each}
      </div>

      <div class="examples-footer">
        <p class="hint">
          💡 <strong>Tip:</strong> After loading an example, you can modify it or use it as a
          template for your own policies.
        </p>
      </div>
    </div>
  {/if}
</div>

<style>
  .example-policies {
    margin-bottom: 1.5rem;
  }

  .toggle-btn {
    padding: 0.75rem 1.5rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .toggle-btn:hover {
    background: var(--accent-secondary);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(88, 101, 242, 0.3);
  }

  .examples-panel {
    margin-top: 1rem;
    padding: 1.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }

  .examples-panel h3 {
    margin: 0 0 0.5rem 0;
    color: var(--text-primary);
    font-size: 1.1rem;
  }

  .examples-panel > .hint {
    margin: 0 0 1.5rem 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .examples-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .example-item {
    padding: 1rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s;
  }

  .example-item:hover {
    border-color: var(--accent-primary);
    background: var(--bg-hover);
    transform: translateX(4px);
  }

  .example-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .example-header strong {
    color: var(--text-primary);
    font-size: 0.95rem;
  }

  .table-badge {
    padding: 0.25rem 0.5rem;
    background: var(--accent-primary);
    color: white;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .example-description {
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin-bottom: 0.25rem;
  }

  .example-detail {
    color: var(--text-tertiary);
    font-size: 0.8rem;
    font-style: italic;
  }

  .examples-footer {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-color);
  }

  .examples-footer .hint {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }
</style>
