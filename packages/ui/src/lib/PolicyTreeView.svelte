<script lang="ts">
  import type { SavedPolicy, TableInfo } from '@speajus/rlsify-types';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import Table from 'lucide-svelte/icons/table';
  import FileText from 'lucide-svelte/icons/file-text';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Key from 'lucide-svelte/icons/key';
  import Link from 'lucide-svelte/icons/link';
  import Columns3 from 'lucide-svelte/icons/columns-3';
  import Database from 'lucide-svelte/icons/database';
  import Loader2 from 'lucide-svelte/icons/loader-2';
  import Plug from 'lucide-svelte/icons/plug';
  import PlugZap from 'lucide-svelte/icons/plug-zap';
  import FlaskConical from 'lucide-svelte/icons/flask-conical';

  interface Props {
    tables: TableInfo[];
    policies: SavedPolicy[];
    currentPolicyId: string | null;
    selectedTable: string | null;
    currentSchema: string;
    availableSchemas: string[];
    schemaLoading: boolean;
    connected: boolean;
    currentDatabase: string | null;
    /** Map of table name to tests array */
    testsByTable?: Map<string, { id: string; name: string }[]>;
    onSelectTable: (tableName: string) => void;
    onSelectPolicy: (id: string) => void;
    onDeletePolicy: (id: string) => void;
    onChangeSchema: (schema: string) => void;
    onOpenConnectionDialog: () => void;
    onSelectTests?: (tableName: string) => void;
  }

  let { tables, policies, currentPolicyId, selectedTable, currentSchema, availableSchemas, schemaLoading, connected, currentDatabase, testsByTable = new Map(), onSelectTable, onSelectPolicy, onDeletePolicy, onChangeSchema, onOpenConnectionDialog, onSelectTests }: Props = $props();

  // Track expanded tables
  let expandedTables = $state<Set<string>>(new Set());
  // Track expanded sub-branches (columns, policies, tests) per table
  let expandedColumns = $state<Set<string>>(new Set());
  let expandedPolicies = $state<Set<string>>(new Set());
  let expandedTests = $state<Set<string>>(new Set());

  // Group policies by table name
  let policiesByTable = $derived.by(() => {
    const groups = new Map<string, SavedPolicy[]>();
    for (const policy of policies) {
      const tableName = policy.config?.table || '';
      if (tableName) {
        if (!groups.has(tableName)) {
          groups.set(tableName, []);
        }
        groups.get(tableName)!.push(policy);
      }
    }
    return groups;
  });

  function getFullTableName(table: TableInfo): string {
    return table.schema ? `${table.schema}.${table.name}` : table.name;
  }

  function toggleTable(tableName: string) {
    if (expandedTables.has(tableName)) {
      expandedTables.delete(tableName);
    } else {
      expandedTables.add(tableName);
    }
    expandedTables = new Set(expandedTables);
  }

  function toggleColumns(tableName: string) {
    if (expandedColumns.has(tableName)) {
      expandedColumns.delete(tableName);
    } else {
      expandedColumns.add(tableName);
    }
    expandedColumns = new Set(expandedColumns);
  }

  function togglePolicies(tableName: string) {
    if (expandedPolicies.has(tableName)) {
      expandedPolicies.delete(tableName);
    } else {
      expandedPolicies.add(tableName);
    }
    expandedPolicies = new Set(expandedPolicies);
  }

  function toggleTests(tableName: string) {
    if (expandedTests.has(tableName)) {
      expandedTests.delete(tableName);
    } else {
      expandedTests.add(tableName);
    }
    expandedTests = new Set(expandedTests);
  }

  function handleSelectTable(tableName: string) {
    onSelectTable(tableName);
  }

  function handleSelectTests(tableName: string) {
    onSelectTests?.(tableName);
  }

  function handleSelectPolicy(id: string) {
    onSelectPolicy(id);
  }

  function handleDeletePolicy(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this policy?')) {
      onDeletePolicy(id);
    }
  }

  /**
   * Count total policy definitions across all saved policies for a table
   */
  function countPolicyDefs(savedPolicies: SavedPolicy[]): number {
    return savedPolicies.reduce((count, sp) => count + (sp.config?.policies?.length || 0), 0);
  }

  /**
   * Find the FK target table for a given column in a table
   */
  function getFKTarget(table: TableInfo, columnName: string): string | null {
    const fk = table.foreignKeys.find(fk => fk.sourceColumn === columnName);
    if (fk) {
      // Return full table name with schema if available
      return table.schema ? `${table.schema}.${fk.targetTable}` : fk.targetTable;
    }
    return null;
  }

  /**
   * Navigate to a FK target table - expand it and its columns
   */
  function navigateToFKTable(e: Event, targetTableName: string) {
    e.stopPropagation();
    // Expand the target table
    if (!expandedTables.has(targetTableName)) {
      expandedTables.add(targetTableName);
      expandedTables = new Set(expandedTables);
    }
    // Expand its columns branch
    if (!expandedColumns.has(targetTableName)) {
      expandedColumns.add(targetTableName);
      expandedColumns = new Set(expandedColumns);
    }
  }

  // Auto-expand selected table
  $effect(() => {
    if (selectedTable && !expandedTables.has(selectedTable)) {
      expandedTables.add(selectedTable);
      expandedTables = new Set(expandedTables);
    }
  });
</script>

<div class="schema-tree h-full overflow-y-auto flex flex-col">
  <!-- Connection Button -->
  <button
    class="p-2 border-b border-border flex items-center gap-2 hover:bg-muted/50 transition-colors w-full text-left"
    onclick={onOpenConnectionDialog}
  >
    {#if connected}
      <PlugZap class="h-4 w-4 text-green-500 shrink-0" />
      <span class="text-sm truncate flex-1">{currentDatabase || 'Connected'}</span>
    {:else}
      <Plug class="h-4 w-4 text-muted-foreground shrink-0" />
      <span class="text-sm text-muted-foreground">Connect to database...</span>
    {/if}
  </button>

  <!-- Schema Selector -->
  <div class="p-2 border-b border-border">
    <div class="flex items-center gap-2">
      <Database class="h-4 w-4 text-primary shrink-0" />
      <select
        class="flex-1 bg-muted border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        value={currentSchema}
        onchange={(e) => onChangeSchema(e.currentTarget.value)}
        disabled={schemaLoading || !connected}
      >
        {#each availableSchemas as schema}
          <option value={schema}>{schema}</option>
        {/each}
      </select>
      {#if schemaLoading}
        <Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
      {/if}
    </div>
  </div>

  <!-- Tables List -->
  {#if tables.length === 0}
    <div class="p-4 text-muted-foreground text-sm text-center flex-1">
      No tables in schema
    </div>
  {:else}
    <div class="py-1 flex-1 overflow-y-auto">
      {#each tables as table}
        {@const fullName = getFullTableName(table)}
        {@const isSelected = selectedTable === fullName}
        {@const tablePolicies = policiesByTable.get(fullName) || []}
        {@const policyCount = countPolicyDefs(tablePolicies)}
        {@const tableTests = testsByTable.get(fullName) ?? []}
        <div class="tree-group">
          <!-- Table header -->
          <div class="w-full flex items-center gap-1.5 px-2 py-1.5 transition-colors cursor-pointer
              {isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'}">
            <span
              class="p-0.5 hover:bg-muted rounded cursor-pointer"
              role="button"
              tabindex="0"
              onclick={(e) => { e.stopPropagation(); toggleTable(fullName); }}
              onkeydown={(e) => e.key === 'Enter' && toggleTable(fullName)}
            >
              {#if expandedTables.has(fullName)}
                <ChevronDown class="h-3 w-3 text-muted-foreground" />
              {:else}
                <ChevronRight class="h-3 w-3 text-muted-foreground" />
              {/if}
            </span>
            <span
              class="flex items-center gap-1.5 flex-1 cursor-pointer"
              role="button"
              tabindex="0"
              onclick={() => handleSelectTable(fullName)}
              onkeydown={(e) => e.key === 'Enter' && handleSelectTable(fullName)}
            >
              <Table class="h-3.5 w-3.5 text-primary shrink-0" />
              <span class="font-medium text-xs truncate flex-1 {isSelected ? 'text-primary' : ''}">{table.name}</span>
              {#if policyCount === 0}
                <span class="text-[10px] text-orange-500 italic">no policy</span>
              {:else}
                <span class="text-[10px] text-muted-foreground">{policyCount} {policyCount === 1 ? 'policy' : 'policies'}</span>
              {/if}
            </span>
          </div>

          <!-- Sub-branches under this table -->
          {#if expandedTables.has(fullName)}
            <div class="pl-5 border-l border-border ml-4">
              <!-- Columns branch -->
              <div class="tree-branch">
                <div
                  class="flex items-center gap-1.5 px-2 py-1 hover:bg-muted/50 transition-colors cursor-pointer"
                  role="button"
                  tabindex="0"
                  onclick={() => toggleColumns(fullName)}
                  onkeydown={(e) => e.key === 'Enter' && toggleColumns(fullName)}
                >
                  <span class="p-0.5">
                    {#if expandedColumns.has(fullName)}
                      <ChevronDown class="h-3 w-3 text-muted-foreground" />
                    {:else}
                      <ChevronRight class="h-3 w-3 text-muted-foreground" />
                    {/if}
                  </span>
                  <Columns3 class="h-3 w-3 text-amber-500 shrink-0" />
                  <span class="text-xs text-foreground">Columns</span>
                  <span class="text-[10px] text-muted-foreground ml-auto">{table.columns.length}</span>
                </div>
                {#if expandedColumns.has(fullName)}
                  <div class="pl-5 border-l border-border ml-4">
                    {#each table.columns as column}
                      {@const fkTarget = column.isForeignKey ? getFKTarget(table, column.name) : null}
                      <div class="flex items-center gap-1.5 px-2 py-0.5 text-xs {fkTarget ? 'hover:bg-muted/50 cursor-pointer' : ''}"
                        role={fkTarget ? 'button' : undefined}
                        tabindex={fkTarget ? 0 : undefined}
                        onclick={(e) => fkTarget && navigateToFKTable(e, fkTarget)}
                        onkeydown={(e) => fkTarget && e.key === 'Enter' && navigateToFKTable(e, fkTarget)}
                      >
                        {#if column.isPrimaryKey}
                          <Key class="h-3 w-3 text-yellow-500 shrink-0" />
                        {:else if column.isForeignKey}
                          <Link class="h-3 w-3 text-blue-400 shrink-0" />
                        {:else}
                          <Columns3 class="h-3 w-3 text-muted-foreground shrink-0" />
                        {/if}
                        <span class="truncate flex-1 text-foreground">{column.name}</span>
                        {#if fkTarget}
                          <span class="text-blue-400 text-[10px] shrink-0">→ {fkTarget.split('.').pop()}</span>
                        {:else}
                          <span class="text-muted-foreground text-[10px] shrink-0">{column.type}</span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

              <!-- Policies branch -->
              <div class="tree-branch">
                <div
                  class="flex items-center gap-1.5 px-2 py-1 hover:bg-muted/50 transition-colors cursor-pointer"
                  role="button"
                  tabindex="0"
                  onclick={() => togglePolicies(fullName)}
                  onkeydown={(e) => e.key === 'Enter' && togglePolicies(fullName)}
                >
                  <span class="p-0.5">
                    {#if expandedPolicies.has(fullName)}
                      <ChevronDown class="h-3 w-3 text-muted-foreground" />
                    {:else}
                      <ChevronRight class="h-3 w-3 text-muted-foreground" />
                    {/if}
                  </span>
                  <FileText class="h-3 w-3 text-green-500 shrink-0" />
                  <span class="text-xs text-foreground">Policies</span>
                  <span class="text-[10px] text-muted-foreground ml-auto">{policyCount === 0 ? 'no policy' : policyCount}</span>
                </div>
                {#if expandedPolicies.has(fullName)}
                  <div class="pl-5 border-l border-border ml-4">
                    {#if policyCount === 0}
                      <div class="px-2 py-1 text-xs text-muted-foreground italic">No policies</div>
                    {:else}
                      {#each tablePolicies as savedPolicy}
                        {@const isPolicySelected = savedPolicy.id === currentPolicyId}
                        {@const policyDefs = savedPolicy.config?.policies || []}
                        {#if policyDefs.length === 0}
                          <div class="flex items-center gap-1.5 px-2 py-0.5 group cursor-pointer transition-colors
                              {isPolicySelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'}">
                            <span
                              class="flex items-center gap-1.5 flex-1 cursor-pointer"
                              role="button"
                              tabindex="0"
                              onclick={() => handleSelectPolicy(savedPolicy.id)}
                              onkeydown={(e) => e.key === 'Enter' && handleSelectPolicy(savedPolicy.id)}
                            >
                              <FileText class="h-3 w-3 shrink-0 {isPolicySelected ? 'text-primary' : 'text-muted-foreground'}" />
                              <span class="text-xs truncate flex-1">{savedPolicy.description || 'Untitled'}</span>
                            </span>
                            <span
                              class="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-destructive/20 rounded transition-all cursor-pointer"
                              role="button"
                              tabindex="0"
                              onclick={(e) => handleDeletePolicy(e, savedPolicy.id)}
                              onkeydown={(e) => e.key === 'Enter' && handleDeletePolicy(e, savedPolicy.id)}
                              title="Delete policy"
                            >
                              <Trash2 class="h-2.5 w-2.5 text-destructive" />
                            </span>
                          </div>
                        {:else}
                          {#each policyDefs as policyDef}
                            <div class="flex items-center gap-1.5 px-2 py-0.5 group cursor-pointer transition-colors
                                {isPolicySelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'}">
                              <span
                                class="flex items-center gap-1.5 flex-1 cursor-pointer"
                                role="button"
                                tabindex="0"
                                onclick={() => handleSelectPolicy(savedPolicy.id)}
                                onkeydown={(e) => e.key === 'Enter' && handleSelectPolicy(savedPolicy.id)}
                              >
                                <FileText class="h-3 w-3 shrink-0 {isPolicySelected ? 'text-primary' : 'text-muted-foreground'}" />
                                <span class="text-xs truncate flex-1">{policyDef.name || 'Untitled'}</span>
                              </span>
                              <span
                                class="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-destructive/20 rounded transition-all cursor-pointer"
                                role="button"
                                tabindex="0"
                                onclick={(e) => handleDeletePolicy(e, savedPolicy.id)}
                                onkeydown={(e) => e.key === 'Enter' && handleDeletePolicy(e, savedPolicy.id)}
                                title="Delete policy"
                              >
                                <Trash2 class="h-2.5 w-2.5 text-destructive" />
                              </span>
                            </div>
                          {/each}
                        {/if}
                      {/each}
                    {/if}
                  </div>
                {/if}
              </div>

              <!-- Tests branch -->
              <div class="tree-branch">
                <div
                  class="flex items-center gap-1.5 px-2 py-1 hover:bg-muted/50 transition-colors cursor-pointer"
                  role="button"
                  tabindex="0"
                  onclick={() => { toggleTests(fullName); handleSelectTests(fullName); }}
                  onkeydown={(e) => e.key === 'Enter' && (toggleTests(fullName), handleSelectTests(fullName))}
                >
                  <span class="p-0.5">
                    {#if expandedTests.has(fullName)}
                      <ChevronDown class="h-3 w-3 text-muted-foreground" />
                    {:else}
                      <ChevronRight class="h-3 w-3 text-muted-foreground" />
                    {/if}
                  </span>
                  <FlaskConical class="h-3 w-3 text-purple-500 shrink-0" />
                  <span class="text-xs text-foreground">Tests</span>
                  <span class="text-[10px] text-muted-foreground ml-auto">{tableTests.length === 0 ? 'no tests' : tableTests.length}</span>
                </div>
                {#if expandedTests.has(fullName)}
                  <div class="pl-5 border-l border-border ml-4">
                    {#if tableTests.length === 0}
                      <div class="px-2 py-1 text-xs text-muted-foreground italic">No tests defined</div>
                    {:else}
                      {#each tableTests as test (test.id)}
                        <div class="px-2 py-1 text-xs text-foreground hover:bg-muted/50 rounded cursor-pointer truncate">
                          {test.name}
                        </div>
                      {/each}
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .schema-tree {
    min-width: 180px;
  }
</style>

