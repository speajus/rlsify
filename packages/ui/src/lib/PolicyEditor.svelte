<script lang="ts">
  import { policyConfig, addPolicy, removePolicy, updateTable } from './stores/policy-store.js';
  import { schema } from './stores/schema-store.js';
  import PolicyItem from './PolicyItem.svelte';
  import PolicyTester from './PolicyTester.svelte';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '$lib/components/ui/select/index.js';
  import Plus from 'lucide-svelte/icons/plus';
  import FlaskConical from 'lucide-svelte/icons/flask-conical';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';

  let showTester = $state(false);

  let tableName = $state('');

  // Get available tables from schema
  let availableTables = $derived($schema?.tables || []);

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
  <CardHeader>
    <CardTitle class="text-xl">Policy Configuration</CardTitle>
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
