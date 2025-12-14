<script lang="ts">
  import { policyConfig, addPolicy, removePolicy, updateTable, savePolicy, fetchPolicies, policySaving, currentPolicyId, hasUnsavedChanges, policyDescription, updateDescription } from './stores/policy-store.js';
  import { schema, foreignKeys } from './stores/schema-store.js';
  import PolicyItem from './PolicyItem.svelte';
  import PolicyTester from './PolicyTester.svelte';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '$lib/components/ui/select/index.js';
  import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '$lib/components/ui/collapsible/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import Plus from 'lucide-svelte/icons/plus';
  import FlaskConical from 'lucide-svelte/icons/flask-conical';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import Database from 'lucide-svelte/icons/database';
  import Save from 'lucide-svelte/icons/save';
  import Loader2 from 'lucide-svelte/icons/loader-2';

  let showTester = $state(false);
  let schemaRefOpen = $state(false);

  let tableName = $state('');

  async function handleSave() {
    await savePolicy();
    await fetchPolicies();
  }

  function handleDescriptionChange(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    updateDescription(target.value);
  }

  // Get available tables from schema
  let availableTables = $derived($schema?.tables || []);

  // Get table info for the selected table
  let tableInfo = $derived(() => {
    const tblName = tableName.includes('.') ? tableName.split('.')[1] : tableName;
    return $schema?.tables.find(t => t.name === tblName);
  });

  // Get foreign keys for this table (both outgoing and incoming)
  let tableForeignKeys = $derived(() => {
    const tblName = tableName.includes('.') ? tableName.split('.')[1] : tableName;
    return {
      outgoing: $foreignKeys.filter(fk => fk.sourceTable === tblName),
      incoming: $foreignKeys.filter(fk => fk.targetTable === tblName)
    };
  });

  // Create items array for bits-ui Select (enables typeahead and label display)
  let tableItems = $derived(
    availableTables.map((table) => ({
      value: `${table.schema}.${table.name}`,
      label: `${table.schema}.${table.name}`,
    }))
  );

  // Sync tableName with policy config when it changes externally (e.g., from loading an example)
  $effect(() => {
    if ($policyConfig.table && $policyConfig.table !== tableName) {
      tableName = $policyConfig.table;
    }
  });

  // Update policy config when tableName changes from user input
  $effect(() => {
    if (tableName !== $policyConfig.table) {
      updateTable(tableName);
    }
  });

  function handleTableSelect(value: string | undefined) {
    if (value) {
      tableName = value;
    }
  }
</script>

<Card class="border-border">
  <CardHeader class="flex flex-row items-center justify-between">
    <CardTitle class="text-xl">Policy Configuration</CardTitle>
    <Button
      onclick={handleSave}
      disabled={$policySaving || !$hasUnsavedChanges}
      class="gap-2"
      size="sm"
    >
      {#if $policySaving}
        <Loader2 class="h-4 w-4 animate-spin" />
        Saving...
      {:else}
        <Save class="h-4 w-4" />
        {$currentPolicyId ? 'Update Policy' : 'Save Policy'}
      {/if}
    </Button>
  </CardHeader>
  <CardContent class="flex flex-col gap-6">
    <!-- Table Selection -->
    <div class="flex flex-col gap-2">
      <Label for="table">Table Name</Label>
      {#if availableTables.length > 0}
        <Select type="single" value={tableName} onValueChange={handleTableSelect} items={tableItems}>
          <SelectTrigger>
            <SelectValue placeholder="Select a table...">
              {tableName || 'Select a table...'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {#each availableTables as table}
              <SelectItem value="{table.schema}.{table.name}" label="{table.schema}.{table.name}" />
            {/each}
          </SelectContent>
        </Select>
      {:else}
        <Input
          id="table"
          type="text"
          bind:value={tableName}
          placeholder="e.g., public.posts, public.users"
        />
        <p class="text-sm text-muted-foreground">Load schema to see available tables</p>
      {/if}

      <!-- Schema Reference (Collapsible) - shown only when table is selected -->
      {#if tableName}
        <Collapsible bind:open={schemaRefOpen}>
          <CollapsibleTrigger
            class="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1"
          >
            <ChevronRight class="h-4 w-4 transition-transform {schemaRefOpen ? 'rotate-90' : ''}" />
            <Database class="h-4 w-4" />
            <span>Schema Reference</span>
            {#if tableInfo()}
              <Badge variant="outline" class="ml-1 text-xs">{tableInfo()?.columns.length} columns</Badge>
            {/if}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div class="mt-2 p-3 bg-muted/50 rounded-lg border border-border text-sm">
              {#if tableInfo()}
                <!-- Columns -->
                <div class="mb-3">
                  <h4 class="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-2">Columns</h4>
                  <div class="flex flex-wrap gap-1.5">
                    {#each tableInfo()?.columns || [] as column}
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-background border border-border">
                        <span class="font-mono text-xs">{column.name}</span>
                        <span class="text-muted-foreground text-xs">({column.type})</span>
                        {#if column.isPrimaryKey}
                          <span class="text-amber-500 text-xs font-medium">PK</span>
                        {/if}
                        {#if column.isForeignKey}
                          <span class="text-emerald-500 text-xs font-medium">FK</span>
                        {/if}
                      </span>
                    {/each}
                  </div>
                </div>

                <!-- Foreign Keys -->
                {#if tableForeignKeys().outgoing.length > 0 || tableForeignKeys().incoming.length > 0}
                  <div>
                    <h4 class="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-2">Foreign Keys</h4>
                    <div class="space-y-1">
                      {#each tableForeignKeys().outgoing as fk}
                        <div class="flex items-center gap-2 text-xs">
                          <span class="text-emerald-500">→</span>
                          <span class="font-mono">{fk.sourceColumn}</span>
                          <span class="text-muted-foreground">references</span>
                          <span class="font-mono font-medium">{fk.targetTable}.{fk.targetColumn}</span>
                        </div>
                      {/each}
                      {#each tableForeignKeys().incoming as fk}
                        <div class="flex items-center gap-2 text-xs">
                          <span class="text-blue-500">←</span>
                          <span class="font-mono">{fk.sourceTable}.{fk.sourceColumn}</span>
                          <span class="text-muted-foreground">references</span>
                          <span class="font-mono font-medium">{fk.targetColumn}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              {:else}
                <p class="text-muted-foreground italic">No schema information available for this table.</p>
              {/if}
            </div>
          </CollapsibleContent>
        </Collapsible>
      {/if}
    </div>

    <!-- Description Field -->
    <div class="flex flex-col gap-2">
      <Label for="description">Description</Label>
      <Textarea
        id="description"
        value={$policyDescription}
        oninput={handleDescriptionChange}
        placeholder="Describe what this policy configuration does..."
        rows={2}
        class="resize-none"
      />
      <p class="text-sm text-muted-foreground">A brief description of the policy configuration for documentation.</p>
    </div>

    <!-- Policies Section -->
    <div class="flex flex-col gap-4">
      <div class="flex justify-between items-center">
        <h3 class="text-lg font-semibold">Policies</h3>
        <Button onclick={addPolicy} size="sm">
          <Plus class="mr-1 h-4 w-4" />
          Add Policy
        </Button>
      </div>

      {#if $policyConfig.policies.length === 0}
        <div class="text-center text-muted-foreground py-8 border-2 border-dashed border-border rounded-lg bg-muted/30">
          No policies defined. Click "Add Policy" to get started.
        </div>
      {:else}
        <div class="flex flex-col gap-4">
          {#each $policyConfig.policies as policy, index (index)}
            <PolicyItem
              {policy}
              {index}
              onRemove={() => removePolicy(index)}
              baseTable={tableName}
            />
          {/each}
        </div>
      {/if}

    </div>

    <!-- Policy Tester Section -->
    {#if $policyConfig.policies.length > 0}
      <div class="space-y-2">
        <Button variant="outline" class="w-full justify-between" onclick={() => showTester = !showTester}>
          <span class="flex items-center gap-2">
            <FlaskConical class="h-4 w-4" />
            Policy Tester
          </span>
          <ChevronDown class="h-4 w-4 transition-transform {showTester ? 'rotate-180' : ''}" />
        </Button>
        {#if showTester}
          <PolicyTester
            policies={$policyConfig.policies}
            tableInfo={$schema?.tables.find(t => `${t.schema}.${t.name}` === tableName)}
            {tableName}
          />
        {/if}
      </div>
    {/if}
  </CardContent>
</Card>

<style>
  /* Minimal styles - most styling is done via Tailwind classes */
</style>
