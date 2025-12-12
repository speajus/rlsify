<script lang="ts">
  import PolicyEditor from './lib/PolicyEditor.svelte';
  import SQLPreview from './lib/SQLPreview.svelte';
  import ExistingPoliciesImporter from './lib/ExistingPoliciesImporter.svelte';
  import {
    policyConfig,
    fetchPolicies,
    fetchPolicy,
    deletePolicy,
    savedPolicies,
    policyError,
    resetConfig,
  } from './lib/stores/policy-store.js';
  import { loadSchema, schema, loading as schemaLoading, error as schemaError } from './lib/stores/schema-store.js';
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
  import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '$lib/components/ui/collapsible/index.js';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import Loader2 from 'lucide-svelte/icons/loader-2';
  import CheckCircle from 'lucide-svelte/icons/check-circle';
  import AlertCircle from 'lucide-svelte/icons/alert-circle';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Upload from 'lucide-svelte/icons/upload';
  import Database from 'lucide-svelte/icons/database';

  let showPreview = $state(false);
  let showSavedPolicies = $state(false);
  let showImportPolicies = $state(false);

  // Load schema and saved policies from backend on mount
  onMount(async () => {
    try {
      await Promise.all([
        loadSchema('public'),
        fetchPolicies(),
      ]);
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  });

  async function handleLoadPolicy(id: string) {
    await fetchPolicy(id);
    showSavedPolicies = false;
  }

  async function handleDeletePolicy(id: string) {
    if (confirm('Are you sure you want to delete this policy?')) {
      await deletePolicy(id);
    }
  }

  function handleNewPolicy() {
    resetConfig();
  }
</script>

<main class="min-h-screen">
  <header class="text-center mb-12 py-8 border-b border-border">
    <h1 class="text-5xl font-bold mb-2 bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
      🔒 RLSify
    </h1>
    <p class="text-muted-foreground text-lg">PostgreSQL Row-Level Security Policy Builder</p>
  </header>

  <div class="flex flex-col gap-8">
    <!-- Toolbar -->
    <Card class="border-border">
      <CardContent class="p-4">
        <div class="flex flex-wrap items-center gap-3">
          <Button onclick={handleNewPolicy}>New Policy</Button>
          <Button variant="secondary" onclick={() => showSavedPolicies = !showSavedPolicies}>
            <ChevronDown class="mr-2 h-4 w-4 transition-transform {showSavedPolicies ? 'rotate-180' : ''}" />
            Saved Policies
            <Badge variant="secondary" class="ml-2">{$savedPolicies.length}</Badge>
          </Button>
          <Button variant="outline" onclick={() => showImportPolicies = !showImportPolicies}>
            <Database class="mr-2 h-4 w-4" />
            Import from DB
          </Button>

          <div class="flex-1"></div>

          {#if $schemaLoading}
            <div class="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 class="h-4 w-4 animate-spin" />
              Loading schema...
            </div>
          {:else if $schemaError}
            <Alert variant="destructive" class="py-2 px-3">
              <AlertCircle class="h-4 w-4" />
              <AlertDescription>{$schemaError}</AlertDescription>
            </Alert>
          {:else if $schema}
            <div class="flex items-center gap-2 text-green-400 text-sm">
              <CheckCircle class="h-4 w-4" />
              {$schema.tables.length} tables loaded
            </div>
          {/if}

          {#if $policyError}
            <Alert variant="destructive" class="py-2 px-3">
              <AlertCircle class="h-4 w-4" />
              <AlertDescription>{$policyError}</AlertDescription>
            </Alert>
          {/if}
        </div>
      </CardContent>
    </Card>

    <!-- Saved Policies Collapsible -->
    <Collapsible bind:open={showSavedPolicies}>
      <CollapsibleContent>
        {#if $savedPolicies.length > 0}
          <Card class="border-border">
            <CardHeader class="pb-4">
              <CardTitle class="text-lg">Saved Policies</CardTitle>
            </CardHeader>
            <CardContent class="pt-0">
              <div class="flex flex-col gap-2">
                {#each $savedPolicies as policy}
                  <div class="flex justify-between items-center p-3 rounded-md bg-muted/50 border border-border hover:border-primary/50 transition-colors">
                    <div class="flex items-center gap-4">
                      <span class="font-medium">{policy.config?.table ?? 'Unknown'}</span>
                      {#if policy.description}
                        <span class="text-muted-foreground text-sm">{policy.description}</span>
                      {/if}
                      <span class="text-muted-foreground text-xs">{new Date(policy.updatedAt).toLocaleDateString()}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <Button size="sm" variant="secondary" onclick={() => handleLoadPolicy(policy.id)}>
                        <Upload class="mr-1 h-3 w-3" />
                        Load
                      </Button>
                      <Button size="sm" variant="destructive" onclick={() => handleDeletePolicy(policy.id)}>
                        <Trash2 class="mr-1 h-3 w-3" />
                        Delete
                      </Button>
                    </div>
                  </div>
                {/each}
              </div>
            </CardContent>
          </Card>
        {/if}
      </CollapsibleContent>
    </Collapsible>

    <!-- Import Existing Policies Collapsible -->
    <Collapsible bind:open={showImportPolicies}>
      <CollapsibleContent>
        <ExistingPoliciesImporter />
      </CollapsibleContent>
    </Collapsible>

    <!-- Policy Editor -->
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
  </div>
</main>
<style>
  /* Minimal styles - most styling is done via Tailwind classes */
</style>
