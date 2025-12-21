<script lang="ts">
  import PolicyEditor from './PolicyEditor.svelte';
  import SQLPreview from './SQLPreview.svelte';
  import ExistingPoliciesImporter from './ExistingPoliciesImporter.svelte';
  import PolicyTreeView from './PolicyTreeView.svelte';
  import ConnectionDialog from './ConnectionDialog.svelte';
  import PolicyTester, { type TestCase } from './PolicyTester.svelte';
  import TableDataViewer from './TableDataViewer.svelte';
  import {
    policyConfig,
    fetchPolicies,
    fetchPolicy,
    deletePolicy,
    savedPolicies,
    policyError,
    resetConfig,
    currentPolicyId,
  } from './stores/policy-store.js';
  import { loadSchema, tables, schema, loading as schemaLoading, error as schemaError, currentSchema, availableSchemas } from './stores/schema-store.js';
  import { connected, currentConnection, checkConnectionStatus, connectionError, connect, retrieveLastConnection } from './stores/connection-store.js';
  import { updateTable } from './stores/policy-store.js';
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Card, CardContent } from '$lib/components/ui/card/index.js';
  import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import Loader2 from 'lucide-svelte/icons/loader-2';
  import AlertCircle from 'lucide-svelte/icons/alert-circle';
  import Database from 'lucide-svelte/icons/database';
  import Plus from 'lucide-svelte/icons/plus';
  import ChevronLeft from 'lucide-svelte/icons/chevron-left';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import { policyClient } from './api/client.js';
  import { PolicyCommand } from '@speajus/rlsify-types';

  // View mode: 'editor', 'tester', or 'data'
  type ViewMode = 'editor' | 'tester' | 'data';
  let viewMode = $state<ViewMode>('editor');
  let selectedTestTable = $state<string | null>(null);
  let selectedDataTable = $state<string | null>(null);

  // Track full test cases per table for persistence
  let testsByTable = $state<Map<string, TestCase[]>>(new Map());

  // Load test cases for a specific table from the API
  async function loadTestCasesForTable(tableName: string): Promise<TestCase[]> {
    try {
      const response = await policyClient.getTestCases({ table: tableName });
      return response.testCases.map(tc => ({
        id: tc.id,
        name: tc.name,
        role: tc.role,
        userId: tc.userId,
        claims: tc.claims,
        rowData: tc.rowData,
        operation: policyCommandToOperation(tc.operation),
        expectedOutcome: tc.expectedOutcome as 'allow' | 'deny',
      }));
    } catch (e) {
      console.error('Failed to load test cases:', e);
      return [];
    }
  }

  // Convert PolicyCommand enum to operation string
  function policyCommandToOperation(cmd: PolicyCommand): 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' {
    switch (cmd) {
      case PolicyCommand.INSERT: return 'INSERT';
      case PolicyCommand.UPDATE: return 'UPDATE';
      case PolicyCommand.DELETE: return 'DELETE';
      default: return 'SELECT';
    }
  }

  // Convert operation string to PolicyCommand enum
  function operationToPolicyCommand(op: string): PolicyCommand {
    switch (op) {
      case 'INSERT': return PolicyCommand.INSERT;
      case 'UPDATE': return PolicyCommand.UPDATE;
      case 'DELETE': return PolicyCommand.DELETE;
      default: return PolicyCommand.SELECT;
    }
  }

  // Save test cases to the API
  async function saveTestCasesToApi(tableName: string, tests: TestCase[]) {
    try {
      await policyClient.saveTestCases({
        table: tableName,
        testCases: tests.map(tc => ({
          id: tc.id,
          name: tc.name,
          role: tc.role,
          userId: tc.userId,
          claims: tc.claims,
          rowData: tc.rowData,
          operation: operationToPolicyCommand(tc.operation),
          expectedOutcome: tc.expectedOutcome,
        })),
      });
    } catch (e) {
      console.error('Failed to save test cases:', e);
    }
  }

  // Load all test case counts on mount
  async function loadAllTestCaseCounts() {
    try {
      const response = await policyClient.listTestCaseTables({});
      const newMap = new Map<string, TestCase[]>();
      // Load full test cases for each table that has tests
      for (const [tableName, _count] of Object.entries(response.tables)) {
        const tests = await loadTestCasesForTable(tableName);
        if (tests.length > 0) {
          newMap.set(tableName, tests);
        }
      }
      testsByTable = newMap;
    } catch (e) {
      console.error('Failed to load test case counts:', e);
    }
  }

  let showPreview = $state(false);
  let showImportPolicies = $state(false);
  let sidebarCollapsed = $state(false);
  let showConnectionDialog = $state(false);

  let initialLoadError = $state<string | null>(null);

  // Check connection status and load data on mount
  onMount(async () => {
    try {
      // First check if we're already connected
      await checkConnectionStatus();

      // If connected, load schema, policies, and test cases
      if ($connected) {
        await Promise.all([
          loadSchema('public'),
          fetchPolicies(),
          loadAllTestCaseCounts(),
        ]);
      } else {
        // Not connected - try to auto-connect with last saved connection
        const lastConnection = retrieveLastConnection();
        if (lastConnection) {
          console.log('Auto-connecting to last used connection:', lastConnection.name);
          const result = await connect({
            host: lastConnection.host,
            port: lastConnection.port,
            database: lastConnection.database,
            user: lastConnection.user,
            password: lastConnection.password,
            ssl: lastConnection.ssl,
          });

          if (result.success) {
            // Successfully auto-connected, load data
            await Promise.all([
              loadSchema('public'),
              fetchPolicies(),
              loadAllTestCaseCounts(),
            ]);
          } else {
            // Auto-connect failed - show connection dialog with error
            initialLoadError = result.error || 'Failed to auto-connect';
            showConnectionDialog = true;
          }
        } else {
          // No saved connection - show connection dialog with any error from the status check
          if ($connectionError) {
            initialLoadError = $connectionError;
          }
          showConnectionDialog = true;
        }
      }
    } catch (e) {
      console.error('Failed to load data:', e);
      // Capture the error for display
      if (e instanceof Error) {
        // Provide user-friendly error messages for common issues
        if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
          initialLoadError = 'Cannot connect to the RLSify service. Make sure the backend is running on port 50051.';
        } else if (e.message.includes('ECONNREFUSED')) {
          initialLoadError = 'Connection refused. The RLSify service is not running.';
        } else {
          initialLoadError = e.message;
        }
      } else {
        initialLoadError = 'Failed to connect to the RLSify service.';
      }
      // If check fails, show connection dialog
      showConnectionDialog = true;
    }
  });

  async function handleDeletePolicy(id: string) {
    await deletePolicy(id);
  }

  function handleNewPolicy() {
    resetConfig();
  }

  function handleSelectTable(tableName: string) {
    updateTable(tableName);
    viewMode = 'editor';
  }

  function handleSelectPolicy(id: string) {
    console.log('handleSelectPolicy called with id:', id);
    fetchPolicy(id);
    viewMode = 'editor';
    console.log('viewMode set to:', viewMode);
  }

  function handleSelectTests(tableName: string) {
    selectedTestTable = tableName;
    viewMode = 'tester';
  }

  function handleSelectData(tableName: string) {
    selectedDataTable = tableName;
    viewMode = 'data';
  }

  function handleTestsChange(tests: TestCase[]) {
    if (selectedTestTable) {
      const newMap = new Map(testsByTable);
      newMap.set(selectedTestTable, tests);
      testsByTable = newMap;
      // Persist to database
      saveTestCasesToApi(selectedTestTable, tests);
    }
  }

  async function handleChangeSchema(schemaName: string) {
    await loadSchema(schemaName);
  }

  function handleOpenConnectionDialog() {
    showConnectionDialog = true;
  }

  async function handleConnected() {
    // Clear any initial error
    initialLoadError = null;
    // Reload schema and policies after connecting
    await Promise.all([
      loadSchema($currentSchema),
      fetchPolicies(),
    ]);
  }

  // Derived values for PolicyTester
  let testerTableName = $derived(selectedTestTable || '');
  let testerTableInfo = $derived($schema?.tables.find(t => `${t.schema}.${t.name}` === testerTableName));
  // Get policies for the selected test table
  let testerPolicies = $derived.by(() => {
    if (!selectedTestTable) return [];
    const tablePolicies = $savedPolicies.filter(p => p.config?.table === selectedTestTable);
    return tablePolicies.flatMap(p => p.config?.policies || []);
  });
  // Get test cases for the selected table
  let testerTestCases = $derived(selectedTestTable ? testsByTable.get(selectedTestTable) ?? [] : []);

  // Derived values for TableDataViewer
  let dataTableName = $derived(selectedDataTable || '');
  let dataTableInfo = $derived($schema?.tables.find(t => `${t.schema}.${t.name}` === dataTableName));
</script>

<div class="min-h-screen flex flex-col">
  <!-- Header -->
  <header class="text-center py-4 border-b border-border shrink-0">
    <h1 class="text-3xl font-bold mb-1 bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
      🔒 RLSify
    </h1>
    <p class="text-muted-foreground text-sm">PostgreSQL Row-Level Security Policy Builder</p>
  </header>

  <!-- Main Layout: Sidebar + Content -->
  <div class="flex flex-1 overflow-hidden">
    <!-- Left Sidebar: Policy Tree -->
    <aside class="border-r border-border bg-card shrink-0 flex flex-col transition-all duration-200
      {sidebarCollapsed ? 'w-12' : 'w-64'}">
      <!-- Sidebar Header -->
      <div class="p-2 border-b border-border flex items-center justify-between">
        {#if !sidebarCollapsed}
          <span class="text-sm font-medium text-muted-foreground">Saved Policies</span>
        {/if}
        <button
          type="button"
          class="p-1.5 hover:bg-muted rounded transition-colors"
          onclick={() => sidebarCollapsed = !sidebarCollapsed}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {#if sidebarCollapsed}
            <ChevronRight class="h-4 w-4 text-muted-foreground" />
          {:else}
            <ChevronLeft class="h-4 w-4 text-muted-foreground" />
          {/if}
        </button>
      </div>

      {#if !sidebarCollapsed}
        <!-- New Policy Button -->
        <div class="p-2 border-b border-border">
          <Button class="w-full" size="sm" onclick={handleNewPolicy}>
            <Plus class="mr-2 h-4 w-4" />
            New Policy
          </Button>
        </div>

        <!-- Schema Tree -->
        <div class="flex-1 overflow-y-auto">
          {#if $schemaLoading}
            <div class="p-4 flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 class="h-4 w-4 animate-spin" />
              Loading...
            </div>
          {:else if $schemaError}
            <div class="p-4 text-destructive text-sm">
              <AlertCircle class="h-4 w-4 inline mr-1" />
              {$schemaError}
            </div>
          {:else}
            <PolicyTreeView
              tables={$tables}
              policies={$savedPolicies}
              currentPolicyId={$currentPolicyId}
              selectedTable={$policyConfig.table || null}
              currentSchema={$currentSchema}
              availableSchemas={$availableSchemas}
              schemaLoading={$schemaLoading}
              connected={$connected}
              currentDatabase={$currentConnection?.database ?? null}
              {testsByTable}
              onSelectTable={handleSelectTable}
              onSelectPolicy={handleSelectPolicy}
              onDeletePolicy={handleDeletePolicy}
              onChangeSchema={handleChangeSchema}
              onOpenConnectionDialog={handleOpenConnectionDialog}
              onSelectTests={handleSelectTests}
              onSelectData={handleSelectData}
            />
          {/if}
        </div>
      {/if}
    </aside>

    <!-- Main Content Area -->
    <main class="flex-1 overflow-y-auto">
      <div class="p-6 flex flex-col gap-6">
        <!-- Debug: Show current view mode -->
        <div class="text-xs text-muted-foreground">Current view: {viewMode}</div>

        <!-- Error Alert -->
        {#if $policyError}
          <Alert variant="destructive" class="py-2 px-3">
            <AlertCircle class="h-4 w-4" />
            <AlertDescription>{$policyError}</AlertDescription>
          </Alert>
        {/if}

        {#if viewMode === 'tester'}
          <!-- Policy Tester View -->
          <PolicyTester
            policies={testerPolicies}
            tableInfo={testerTableInfo}
            tableName={testerTableName}
            testCases={testerTestCases}
            onTestsChange={handleTestsChange}
          />
        {:else if viewMode === 'data'}
          <!-- Table Data Viewer -->
          <TableDataViewer
            tableName={dataTableName}
            tableInfo={dataTableInfo}
          />
        {:else}
          <!-- Policy Editor View -->
          <PolicyEditor />

          <!-- Preview Toggle -->
          <div class="flex justify-center">
            <Button variant="outline" onclick={() => showPreview = !showPreview}>
              {showPreview ? 'Hide' : 'Show'} SQL Preview
            </Button>
          </div>

          {#if showPreview}
            <SQLPreview config={$policyConfig} />
          {/if}

          <!-- Import from DB - moved to bottom -->
          <Card class="border-border">
            <CardContent class="p-3">
              <Button variant="outline" onclick={() => showImportPolicies = !showImportPolicies}>
                <Database class="mr-2 h-4 w-4" />
                Import from DB
                <ChevronDown class="ml-2 h-4 w-4 transition-transform {showImportPolicies ? 'rotate-180' : ''}" />
              </Button>
            </CardContent>
          </Card>

          {#if showImportPolicies}
            <ExistingPoliciesImporter />
          {/if}
        {/if}
      </div>
    </main>
  </div>
</div>

<!-- Connection Dialog -->
<ConnectionDialog
  open={showConnectionDialog}
  onClose={() => showConnectionDialog = false}
  onConnected={handleConnected}
  initialError={initialLoadError}
/>

<style>
  /* Minimal styles - most styling is done via Tailwind classes */
</style>
