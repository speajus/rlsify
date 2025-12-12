<script lang="ts">
  import { examplePolicies } from './examples/multi-tenant-schema.js';
  import { loadExamplePolicy, updateTable } from './stores/policy-store.js';
  import type { PolicyDefinition } from '@speajus/rlsify-types';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '$lib/components/ui/card/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Collapsible, CollapsibleContent } from '$lib/components/ui/collapsible/index.js';
  import BookOpen from 'lucide-svelte/icons/book-open';
  import X from 'lucide-svelte/icons/x';
  import Lightbulb from 'lucide-svelte/icons/lightbulb';

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

<div class="flex flex-col gap-4">
  <Button variant={showExamples ? 'secondary' : 'default'} onclick={() => showExamples = !showExamples}>
    {#if showExamples}
      <X class="mr-2 h-4 w-4" />
      Hide Examples
    {:else}
      <BookOpen class="mr-2 h-4 w-4" />
      Load Example Policies
    {/if}
  </Button>

  <Collapsible bind:open={showExamples}>

  <CollapsibleContent>
    <Card class="mt-4 border-border">
      <CardHeader>
        <CardTitle class="text-lg">Multi-Tenant Permission Examples</CardTitle>
        <CardDescription>
          Click an example to load it into the editor. These demonstrate common patterns for
          organization and team-based permissions.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-3">
        {#each examples as example}
          <button
            class="flex flex-col gap-2 p-4 rounded-lg border border-border bg-background hover:border-primary/50 hover:bg-muted/50 transition-all text-left cursor-pointer"
            onclick={() => loadExample(example)}
          >
            <div class="flex items-center justify-between">
              <span class="font-medium text-foreground">{example.policy.name}</span>
              <Badge variant="default">{example.policy.table}</Badge>
            </div>
            <div class="text-sm text-muted-foreground">{example.description}</div>
            {#if example.policy.description}
              <div class="text-xs text-muted-foreground/70 italic">{example.policy.description}</div>
            {/if}
          </button>
        {/each}
      </CardContent>
      <CardFooter class="border-t border-border pt-4">
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <Lightbulb class="h-4 w-4" />
          <span><strong>Tip:</strong> After loading an example, you can modify it or use it as a template for your own policies.</span>
        </div>
      </CardFooter>
    </Card>
  </CollapsibleContent>
</Collapsible>
</div>

<style>
  /* Minimal styles - most styling is done via Tailwind classes */
</style>
