<script lang="ts">
  import { policyConfig, addPolicy, removePolicy, savePolicy, fetchPolicies, policySaving, currentPolicyId, hasUnsavedChanges, policyDescription, updateDescription } from './stores/policy-store.js';
  import PolicyItem from './PolicyItem.svelte';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import Plus from 'lucide-svelte/icons/plus';
  import Save from 'lucide-svelte/icons/save';
  import Loader2 from 'lucide-svelte/icons/loader-2';

  // Derive table name from policy config
  let tableName = $derived($policyConfig.table || '');

  async function handleSave() {
    await savePolicy();
    await fetchPolicies();
  }

  function handleDescriptionChange(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    updateDescription(target.value);
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
    <!-- Selected Table Display -->
    {#if tableName}
      <div class="flex items-center gap-2 text-sm">
        <span class="text-muted-foreground">Table:</span>
        <span class="font-mono font-medium">{tableName}</span>
      </div>
    {:else}
      <div class="text-sm text-muted-foreground italic">
        Select a table from the left sidebar to configure policies.
      </div>
    {/if}

    <!-- Description Field (inline editable) -->
    <p
      contenteditable="true"
      role="textbox"
      class="text-sm text-muted-foreground py-1 px-0 border-b border-transparent hover:border-muted focus:border-primary focus:outline-none transition-colors empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50"
      data-placeholder="Add a description..."
      oninput={(e) => handleDescriptionChange({ currentTarget: { value: e.currentTarget.textContent || '' } })}
      onblur={(e) => handleDescriptionChange({ currentTarget: { value: e.currentTarget.textContent || '' } })}
    >{$policyDescription}</p>

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

  </CardContent>
</Card>

<style>
  /* Minimal styles - most styling is done via Tailwind classes */
</style>
