<script lang="ts">
  import type { PolicyDefinition, PermissionExpression } from '@speajus/rlsify-types';
  import { updatePolicy as updatePolicyStore } from './stores/policy-store.js';
  import PermissionBuilder from './PermissionBuilder.svelte';
  import VisualQueryBuilder from './VisualQueryBuilder.svelte';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Tabs, TabsList, TabsTrigger, TabsContent } from '$lib/components/ui/tabs/index.js';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '$lib/components/ui/select/index.js';
  import { TagInput } from '$lib/components/ui/tag-input/index.js';
  import Trash2 from 'lucide-svelte/icons/trash-2';

  // Common PostgreSQL roles for suggestions
  const roleSuggestions = ['public', 'authenticated', 'anon', 'service_role', 'postgres'];

  interface Props {
    policy: PolicyDefinition;
    index: number;
    onRemove: () => void;
    baseTable: string;
  }

  let { policy, index, onRemove, baseTable }: Props = $props();

  // Initialize mode based on the policy content
  let usingEditorMode = $state<'sql' | 'json' | 'visual'>('visual');
  let checkEditorMode = $state<'sql' | 'json' | 'visual'>('visual');

  // Edit-in-place state for policy name
  let isEditingName = $state(false);
  let editingNameValue = $state('');
  let nameInputRef = $state<HTMLInputElement | null>(null);

  function startEditingName() {
    editingNameValue = policy.name || '';
    isEditingName = true;
    // Focus the input after it renders
    setTimeout(() => nameInputRef?.focus(), 0);
  }

  function saveNameEdit() {
    handleUpdatePolicy('name', editingNameValue);
    isEditingName = false;
  }

  function cancelNameEdit() {
    isEditingName = false;
  }

  function handleNameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      saveNameEdit();
    } else if (e.key === 'Escape') {
      cancelNameEdit();
    }
  }

  function handleUpdatePolicy(field: keyof PolicyDefinition, value: unknown) {
    updatePolicyStore(index, field, value);
  }

  function updateUsingExpression(expr: PermissionExpression | null) {
    handleUpdatePolicy('usingExpression', expr);
    if (expr) {
      handleUpdatePolicy('using', undefined);
    }
  }

  function updateCheckExpression(expr: PermissionExpression | null) {
    handleUpdatePolicy('withCheckExpression', expr);
    if (expr) {
      handleUpdatePolicy('withCheck', undefined);
    }
  }

  function handleCommandChange(value: string[] | undefined) {
    if (value) {
      // Remove duplicates and store as array
      const uniqueValues = [...new Set(value)];
      handleUpdatePolicy('command', uniqueValues);
    }
  }

  // Convert command to array for multi-select display (handles both string and array)
  let commandValues = $derived.by(() => {
    if (!policy.command) return [];
    if (Array.isArray(policy.command)) return policy.command;
    return [policy.command];
  });
</script>

{#if !baseTable}
  <Card class="border-border border-dashed">
    <CardContent class="py-8">
      <p class="text-muted-foreground text-center">Select a table above to configure this policy</p>
    </CardContent>
  </Card>
{:else}
<Card class="border-border hover:border-primary/50 transition-colors">
  <CardHeader class="pb-4">
    <div class="flex justify-between items-center">
      <CardTitle class="text-base flex items-center gap-2">
        {#if isEditingName}
          <span class="text-muted-foreground">Policy:</span>
          <input
            bind:this={nameInputRef}
            type="text"
            bind:value={editingNameValue}
            onblur={saveNameEdit}
            onkeydown={handleNameKeydown}
            class="px-2 py-0.5 text-base font-semibold bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring w-48"
          />
        {:else}
          <button
            type="button"
            onclick={startEditingName}
            class="hover:bg-muted px-2 py-0.5 rounded-md transition-colors cursor-text text-left"
            title="Click to edit policy name"
          >
            Policy: {policy.name || `Policy ${index + 1}`}
          </button>
        {/if}
        {#if commandValues.length > 0}
          {#each commandValues as cmd}
            <Badge variant="secondary">{cmd}</Badge>
          {/each}
        {/if}
      </CardTitle>
      <Button variant="destructive" size="sm" onclick={onRemove}>
        <Trash2 class="mr-1 h-3 w-3" />
        Remove
      </Button>
    </div>
  </CardHeader>
  <CardContent class="flex flex-col gap-4 pt-0">
    <!-- Name, Command, and Roles Row -->
    <div class="grid grid-cols-[2fr_1fr_2fr] gap-4">
      <div class="flex flex-col gap-2">
        <Label for="name-{index}">Policy Name</Label>
        <Input
          id="name-{index}"
          type="text"
          value={policy.name}
          oninput={(e) => handleUpdatePolicy('name', e.currentTarget.value)}
          placeholder="e.g., posts_select_own"
        />
      </div>

      <div class="flex flex-col gap-2">
        <Label for="command-{index}">Command</Label>
        <Select type="multiple" value={commandValues} onValueChange={handleCommandChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select commands">
              {#if commandValues.length === 0}
                Select commands
              {:else if commandValues.length === 1}
                {commandValues[0]}
              {:else}
                {commandValues.join(', ')}
              {/if}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SELECT" label="SELECT" />
            <SelectItem value="INSERT" label="INSERT" />
            <SelectItem value="UPDATE" label="UPDATE" />
            <SelectItem value="DELETE" label="DELETE" />
            <SelectItem value="ALL" label="ALL" />
          </SelectContent>
        </Select>
      </div>

      <div class="flex flex-col gap-2">
        <Label for="roles-{index}">Roles</Label>
        <TagInput
          values={policy.roles || []}
          onUpdate={(roles) => handleUpdatePolicy('roles', roles)}
          placeholder="Add role..."
          suggestions={roleSuggestions}
        />
      </div>
    </div>

    <!-- USING Expression -->
    <div class="flex flex-col gap-2">
      <div class="flex justify-between items-center">
        <Label>USING Expression</Label>
        <Tabs bind:value={usingEditorMode} class="w-auto">
          <TabsList class="h-8">
            <TabsTrigger value="visual" class="text-xs px-2 py-1">Visual</TabsTrigger>
            <TabsTrigger value="json" class="text-xs px-2 py-1" onclick={() => {
              if (!policy.usingExpression) {
                updateUsingExpression({ user_id: { _eq: { var: 'auth.uid()', type: 'uuid' } } });
              }
            }}>Source</TabsTrigger>
            <TabsTrigger value="sql" class="text-xs px-2 py-1">SQL</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {#if usingEditorMode === 'sql'}
        <Textarea
          id="using-{index}"
          value={policy.using || ''}
          oninput={(e) => handleUpdatePolicy('using', e.currentTarget.value)}
          placeholder="e.g., user_id = auth.uid()"
          rows={2}
        />
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
          debugLabel="USING"
        />
      {/if}
    </div>

    <!-- WITH CHECK Expression -->
    <div class="flex flex-col gap-2">
      <div class="flex justify-between items-center">
        <Label>WITH CHECK Expression (optional)</Label>
        <Tabs bind:value={checkEditorMode} class="w-auto">
          <TabsList class="h-8">
            <TabsTrigger value="visual" class="text-xs px-2 py-1">Visual</TabsTrigger>
            <TabsTrigger value="json" class="text-xs px-2 py-1" onclick={() => {
              if (!policy.withCheckExpression) {
                updateCheckExpression({ user_id: { _eq: { var: 'auth.uid()', type: 'uuid' } } });
              }
            }}>Source</TabsTrigger>
            <TabsTrigger value="sql" class="text-xs px-2 py-1">SQL</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {#if checkEditorMode === 'sql'}
        <Textarea
          id="withCheck-{index}"
          value={policy.withCheck || ''}
          oninput={(e) => handleUpdatePolicy('withCheck', e.currentTarget.value)}
          placeholder="e.g., user_id = auth.uid()"
          rows={2}
        />
      {:else if checkEditorMode === 'json'}
        <PermissionBuilder
          expression={policy.withCheckExpression}
          onUpdate={updateCheckExpression}
          baseTable={baseTable}
        />
      {:else if checkEditorMode === 'visual'}
        <VisualQueryBuilder
          baseTable={baseTable}
          expression={policy.withCheckExpression}
          onUpdate={updateCheckExpression}
          debugLabel="WITH_CHECK"
        />
      {/if}
    </div>
  </CardContent>
</Card>
{/if}
<style>
  /* Minimal styles - most styling is done via Tailwind classes */
</style>
