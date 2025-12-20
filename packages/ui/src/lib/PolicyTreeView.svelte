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
    onSelectTable: (tableName: string) => void;
    onSelectPolicy: (id: string) => void;
    onDeletePolicy: (id: string) => void;
    onChangeSchema: (schema: string) => void;
    onOpenConnectionDialog: () => void;
  }

  let { tables, policies, currentPolicyId, selectedTable, currentSchema, availableSchemas, schemaLoading, connected, currentDatabase, onSelectTable, onSelectPolicy, onDeletePolicy, onChangeSchema, onOpenConnectionDialog }: Props = $props();

  // Track expanded tables
  let expandedTables = $state<Set<string>>(new Set());

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

  function handleSelectTable(tableName: string) {
    onSelectTable(tableName);
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
              <span class="text-[10px] text-muted-foreground">{table.columns.length}</span>
            </span>
          </div>

          <!-- Columns under this table -->
          {#if expandedTables.has(fullName)}
            <div class="pl-5 border-l border-border ml-3">
              {#each table.columns as column}
                <div class="flex items-center gap-1.5 px-2 py-0.5 text-xs">
                  {#if column.isPrimaryKey}
                    <Key class="h-3 w-3 text-yellow-500 shrink-0" />
                  {:else if column.isForeignKey}
                    <Link class="h-3 w-3 text-blue-400 shrink-0" />
                  {:else}
                    <Columns3 class="h-3 w-3 text-muted-foreground shrink-0" />
                  {/if}
                  <span class="truncate flex-1 text-foreground">{column.name}</span>
                  <span class="text-muted-foreground text-[10px] shrink-0">{column.type}</span>
                </div>
              {/each}

              <!-- Saved policies for this table -->
              {#if tablePolicies.length > 0}
                <div class="mt-1 pt-1 border-t border-border">
                  <div class="px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wider">Policies</div>
                  {#each tablePolicies as policy}
                    {@const isPolicySelected = policy.id === currentPolicyId}
                    <div class="flex items-center gap-1.5 px-2 py-0.5 group cursor-pointer transition-colors
                        {isPolicySelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'}">
                      <span
                        class="flex items-center gap-1.5 flex-1 cursor-pointer"
                        role="button"
                        tabindex="0"
                        onclick={() => handleSelectPolicy(policy.id)}
                        onkeydown={(e) => e.key === 'Enter' && handleSelectPolicy(policy.id)}
                      >
                        <FileText class="h-3 w-3 shrink-0 {isPolicySelected ? 'text-primary' : 'text-muted-foreground'}" />
                        <span class="text-xs truncate flex-1">{policy.description || 'Untitled'}</span>
                      </span>
                      <span
                        class="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-destructive/20 rounded transition-all cursor-pointer"
                        role="button"
                        tabindex="0"
                        onclick={(e) => handleDeletePolicy(e, policy.id)}
                        onkeydown={(e) => e.key === 'Enter' && handleDeletePolicy(e, policy.id)}
                        title="Delete policy"
                      >
                        <Trash2 class="h-2.5 w-2.5 text-destructive" />
                      </span>
                    </div>
                  {/each}
                </div>
              {/if}
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

