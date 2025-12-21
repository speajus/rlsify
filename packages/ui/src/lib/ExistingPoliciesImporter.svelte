<script lang="ts">
	  import { existingPolicies, fetchExistingPolicies, importExistingPolicy, policyLoading, policyError } from './stores/policy-store.js';
	  import { connected } from './stores/connection-store.js';
  import type { ExistingRLSPolicy } from '@speajus/rlsify-types';
  import { Button } from './components/ui/button/index.js';

  let schema = $state('public');
  let tableFilter = $state('');
  let selectedPolicy = $state<ExistingRLSPolicy | null>(null);
	  let didInitialLoad = $state(false);

	  // Only load existing policies after a DB connection is established.
	  // This component is mounted in the desktop app even when the UI is "collapsed",
	  // so an unconditional fetch would spam IPC unary calls before connecting.
	  $effect(() => {
	    if (!$connected) {
	      didInitialLoad = false;
	      return;
	    }

	    if (!didInitialLoad) {
	      didInitialLoad = true;
	      fetchExistingPolicies(schema);
	    }
	  });

  function handleRefresh() {
	    if (!$connected) return;
	    fetchExistingPolicies(schema, tableFilter || undefined);
  }

  function handleImport(policy: ExistingRLSPolicy) {
    importExistingPolicy(policy);
    selectedPolicy = null;
  }

  function formatCommand(cmd: string): string {
    return cmd || 'ALL';
  }

  function truncateSql(sql: string | undefined, maxLen = 60): string {
    if (!sql) return '—';
    return sql.length > maxLen ? sql.substring(0, maxLen) + '...' : sql;
  }
</script>

<div class="existing-policies-importer">
  <div class="header">
    <h3 class="text-lg font-semibold">Import Existing RLS Policies</h3>
    <p class="text-sm text-muted-foreground">
      Import policies from your database's pg_policies view
    </p>
  </div>

  <div class="filters">
    <div class="filter-row">
      <label class="filter-label">
        Schema:
        <input type="text" bind:value={schema} placeholder="public" class="filter-input" />
      </label>
      <label class="filter-label">
        Table:
        <input type="text" bind:value={tableFilter} placeholder="All tables" class="filter-input" />
      </label>
	      <Button onclick={handleRefresh} disabled={$policyLoading || !$connected}>
        {$policyLoading ? 'Loading...' : 'Refresh'}
      </Button>
    </div>
  </div>

  {#if $policyError}
    <div class="error-message">{$policyError}</div>
  {/if}

  <div class="policies-list">
    {#if $existingPolicies.length === 0}
      <div class="empty-state">
        {#if $policyLoading}
          Loading policies...
	        {:else if !$connected}
	          Connect to a database to list existing RLS policies.
	        {:else}
	          No RLS policies found. Make sure the database has policies.
        {/if}
      </div>
    {:else}
      <table class="policies-table">
        <thead>
          <tr>
            <th>Table</th>
            <th>Policy Name</th>
            <th>Command</th>
            <th>USING Expression</th>
            <th>Parsed?</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each $existingPolicies as policy}
            <tr class:selected={selectedPolicy === policy}>
              <td class="table-name">{policy.tableName}</td>
              <td class="policy-name">{policy.policyName}</td>
              <td class="command">{formatCommand(policy.command)}</td>
              <td class="expression" title={policy.usingExpression}>
                <code>{truncateSql(policy.usingExpression)}</code>
              </td>
              <td class="parsed-status">
                {#if policy.parsedUsing}
                  <span class="parsed-yes" title="Successfully parsed to JSON">✓</span>
                {:else if policy.parseError}
                  <span class="parsed-no" title={policy.parseError}>✗</span>
                {:else}
                  <span class="parsed-na">—</span>
                {/if}
              </td>
              <td class="actions">
                <Button size="sm" variant="outline" onclick={() => handleImport(policy)}>
                  Import
                </Button>
                <Button size="sm" variant="ghost" onclick={() => selectedPolicy = policy}>
                  View
                </Button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  {#if selectedPolicy}
    <div class="policy-detail">
      <div class="detail-header">
        <h4>{selectedPolicy.schemaName}.{selectedPolicy.tableName} — {selectedPolicy.policyName}</h4>
        <Button size="sm" variant="ghost" onclick={() => selectedPolicy = null}>Close</Button>
      </div>
      <div class="detail-content">
        <div class="detail-row">
          <strong>Command:</strong> {formatCommand(selectedPolicy.command)}
        </div>
        <div class="detail-row">
          <strong>Permissive:</strong> {selectedPolicy.permissive ? 'Yes' : 'No'}
        </div>
        <div class="detail-row">
          <strong>Roles:</strong> {selectedPolicy.roles.join(', ') || 'PUBLIC'}
        </div>
        <div class="detail-section">
          <strong>USING Expression (SQL):</strong>
          <pre class="sql-code">{selectedPolicy.usingExpression || '—'}</pre>
        </div>
        {#if selectedPolicy.parsedUsing}
          <div class="detail-section">
            <strong>Parsed JSON:</strong>
            <pre class="json-code">{JSON.stringify(selectedPolicy.parsedUsing, null, 2)}</pre>
          </div>
        {/if}
        {#if selectedPolicy.parseError}
          <div class="detail-section error">
            <strong>Parse Error:</strong> {selectedPolicy.parseError}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .existing-policies-importer {
    padding: 1rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
  }

  .header {
    margin-bottom: 1rem;
  }

  .filters {
    margin-bottom: 1rem;
  }

  .filter-row {
    display: flex;
    gap: 1rem;
    align-items: flex-end;
  }

  .filter-label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.875rem;
    color: var(--foreground);
  }

  .filter-input {
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    background: var(--background);
    color: var(--foreground);
    width: 150px;
  }

  .error-message {
    padding: 0.75rem;
    background: hsl(0 84% 60% / 0.1);
    border: 1px solid hsl(0 84% 60%);
    border-radius: 0.25rem;
    color: hsl(0 84% 60%);
    margin-bottom: 1rem;
  }

  .policies-list {
    margin-bottom: 1rem;
  }

  .empty-state {
    padding: 2rem;
    text-align: center;
    color: var(--muted-foreground);
  }

  .policies-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  .policies-table th,
  .policies-table td {
    padding: 0.5rem;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }

  .policies-table th {
    font-weight: 600;
    background: var(--muted);
    color: var(--foreground);
  }

  .policies-table td {
    color: var(--foreground);
  }

  .policies-table tr:hover {
    background: var(--accent);
  }

  .policies-table tr.selected {
    background: var(--accent);
  }

  .table-name {
    font-weight: 500;
  }

  .expression code {
    font-size: 0.75rem;
    background: var(--muted);
    padding: 0.125rem 0.25rem;
    border-radius: 0.125rem;
  }

  .parsed-yes {
    color: hsl(142 76% 36%);
    font-weight: bold;
  }

  .parsed-no {
    color: hsl(0 84% 60%);
    font-weight: bold;
  }

  .parsed-na {
    color: var(--muted-foreground);
  }

  .actions {
    display: flex;
    gap: 0.25rem;
  }

  .policy-detail {
    margin-top: 1rem;
    padding: 1rem;
    background: var(--muted);
    border-radius: 0.5rem;
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .detail-header h4 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .detail-row {
    margin-bottom: 0.5rem;
  }

  .detail-section {
    margin-top: 1rem;
  }

  .detail-section.error {
    color: hsl(0 84% 60%);
  }

  .sql-code,
  .json-code {
    margin-top: 0.5rem;
    padding: 0.75rem;
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>

