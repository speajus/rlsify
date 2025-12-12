<script lang="ts">
  import type { PolicyDefinition, TableInfo, ColumnInfo, PolicyTestResult } from '@speajus/rlsify-types';
  import { policyClient } from '$lib/api/client.js';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '$lib/components/ui/select/index.js';
  import Check from 'lucide-svelte/icons/check';
  import X from 'lucide-svelte/icons/x';
  import Play from 'lucide-svelte/icons/play';
  import Plus from 'lucide-svelte/icons/plus';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Loader2 from 'lucide-svelte/icons/loader-2';

  interface Props {
    policies: PolicyDefinition[];
    tableInfo?: TableInfo;
    tableName: string;
  }

  let { policies, tableInfo, tableName }: Props = $props();

  // Use valid UUIDs for testing (auth.uid() returns UUID type in PostgreSQL)
  const DEFAULT_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
  const DEFAULT_ORG_ID = '660e8400-e29b-41d4-a716-446655440000';

  let sessionRole = $state('authenticated');
  let sessionUserId = $state(DEFAULT_USER_ID);
  let sessionClaims = $state(`{"org_id": "${DEFAULT_ORG_ID}"}`);
  let testOperation = $state<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'>('SELECT');
  let isLoading = $state(false);
  let testError = $state<string | null>(null);

  // Default sample row with common RLS fields (using UUIDs for proper type matching)
  const defaultSampleRow = {
    id: DEFAULT_USER_ID,
    user_id: DEFAULT_USER_ID,
    org_id: DEFAULT_ORG_ID,
    is_public: false,
    status: 'active',
    created_at: new Date().toISOString(),
  };
  let sampleRowJson = $state(JSON.stringify(defaultSampleRow, null, 2));

  interface TestCase {
    id: string;
    name: string;
    role: string;
    userId: string;
    claims: string;
    rowData: string;
    operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  }

  let testCases = $state<TestCase[]>([]);
  // Map from test scenario ID to array of PolicyTestResult
  let testResults = $state<Map<string, PolicyTestResult[]>>(new Map());
  const availableRoles = ['public', 'authenticated', 'anon', 'service_role', 'postgres'];
  const operations = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;

  $effect(() => {
    if (tableInfo?.columns) {
      const sampleRow: Record<string, unknown> = {};
      for (const col of tableInfo.columns) {
        sampleRow[col.name] = getDefaultValueForType(col);
      }
      sampleRowJson = JSON.stringify(sampleRow, null, 2);
    }
  });

  function getDefaultValueForType(col: ColumnInfo): unknown {
    const type = col.type.toLowerCase();
    const name = col.name.toLowerCase();
    // For user_id or id columns, use the default user UUID for easier testing
    if (type.includes('uuid')) {
      if (name === 'user_id' || name === 'id' || name === 'owner_id' || name === 'created_by') {
        return DEFAULT_USER_ID;
      }
      if (name === 'org_id' || name === 'organization_id' || name === 'team_id') {
        return DEFAULT_ORG_ID;
      }
      return crypto.randomUUID();
    }
    if (type.includes('int') || type.includes('numeric')) return 0;
    if (type.includes('bool')) return false;
    if (type.includes('timestamp') || type.includes('date')) return new Date().toISOString();
    if (type.includes('json')) return {};
    if (type.includes('array')) return [];
    return '';
  }

  function mapOperationToCommand(op: string): number {
    const mapping: Record<string, number> = { 'SELECT': 1, 'INSERT': 2, 'UPDATE': 3, 'DELETE': 4, 'ALL': 5 };
    return mapping[op] ?? 5;
  }

  async function runTests() {
    isLoading = true;
    testError = null;
    const results = new Map<string, PolicyTestResult[]>();

    try {
      // Run main scenario
      const mainResponse = await policyClient.testPolicies({
        table: tableName,
        policies: policies.map(p => ({
          name: p.name,
          command: mapOperationToCommand(p.command),
          roles: [...(p.roles || [])],
          permissive: p.permissive ?? true,
          using: p.using,
          withCheck: p.withCheck,
          usingExpression: p.usingExpression,
          withCheckExpression: p.withCheckExpression,
        })),
        session: {
          userId: sessionUserId,
          role: sessionRole,
          claimsJson: sessionClaims,
        },
        rowDataJson: sampleRowJson,
        operation: mapOperationToCommand(testOperation),
      });

      if (mainResponse.error) {
        testError = mainResponse.error;
      } else {
        results.set('main', mainResponse.results as PolicyTestResult[]);
      }

      // Run test cases
      for (const tc of testCases) {
        const tcResponse = await policyClient.testPolicies({
          table: tableName,
          policies: policies.map(p => ({
            name: p.name,
            command: mapOperationToCommand(p.command),
            roles: [...(p.roles || [])],
            permissive: p.permissive ?? true,
            using: p.using,
            withCheck: p.withCheck,
            usingExpression: p.usingExpression,
            withCheckExpression: p.withCheckExpression,
          })),
          session: {
            userId: tc.userId,
            role: tc.role,
            claimsJson: tc.claims,
          },
          rowDataJson: tc.rowData,
          operation: mapOperationToCommand(tc.operation),
        });

        if (!tcResponse.error) {
          results.set(tc.id, tcResponse.results as PolicyTestResult[]);
        }
      }

      testResults = results;
    } catch (err) {
      testError = err instanceof Error ? err.message : 'Failed to run tests';
    } finally {
      isLoading = false;
    }
  }

  function addTestCase() {
    testCases = [...testCases, {
      id: crypto.randomUUID(), name: 'Test Case ' + (testCases.length + 1),
      role: sessionRole, userId: sessionUserId, claims: sessionClaims,
      rowData: sampleRowJson, operation: testOperation,
    }];
  }

  function removeTestCase(id: string) {
    testCases = testCases.filter(tc => tc.id !== id);
  }

  function updateTestCase(id: string, updates: Partial<TestCase>) {
    testCases = testCases.map(tc => tc.id === id ? { ...tc, ...updates } : tc);
  }
</script>

<Card class="border-primary/20">
  <CardHeader>
    <CardTitle class="flex items-center justify-between">
      <span>Policy Tester (Server-Side)</span>
      <Button size="sm" onclick={runTests} disabled={isLoading}>
        {#if isLoading}
          <Loader2 class="mr-2 h-4 w-4 animate-spin" />
          Testing...
        {:else}
          <Play class="mr-2 h-4 w-4" />
          Run Tests
        {/if}
      </Button>
    </CardTitle>
  </CardHeader>
  <CardContent class="space-y-6">
    <!-- Session Context Section -->
    <div class="space-y-4">
      <h3 class="text-sm font-semibold text-foreground">Session Context</h3>
      <div class="grid grid-cols-4 gap-4">
        <div class="space-y-2">
          <Label>Role</Label>
          <Select type="single" value={sessionRole} onValueChange={(v) => { if (v) sessionRole = v; }}>
            <SelectTrigger>
              <SelectValue placeholder="Select role">{sessionRole}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {#each availableRoles as role}
                <SelectItem value={role} label={role} />
              {/each}
            </SelectContent>
          </Select>
        </div>
        <div class="space-y-2">
          <Label>User ID (auth.uid())</Label>
          <Input bind:value={sessionUserId} placeholder="user-123" />
        </div>
        <div class="space-y-2">
          <Label>Claims (JSON)</Label>
          <Input bind:value={sessionClaims} placeholder={'{"org_id": "org-1"}'} />
        </div>
        <div class="space-y-2">
          <Label>Operation</Label>
          <Select type="single" value={testOperation} onValueChange={(v) => { if (v) testOperation = v as typeof testOperation; }}>
            <SelectTrigger>
              <SelectValue placeholder="Select operation">{testOperation}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {#each operations as op}
                <SelectItem value={op} label={op} />
              {/each}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>

    <!-- Sample Row Data -->
    <div class="space-y-2">
      <Label>Sample Row Data (JSON)</Label>
      <Textarea bind:value={sampleRowJson} rows={6} class="font-mono text-sm" />
    </div>

    <!-- Error Display -->
    {#if testError}
      <div class="rounded-lg border border-red-500 bg-red-500/10 p-4 text-red-400">
        <strong>Error:</strong> {testError}
      </div>
    {/if}

    <!-- Test Results -->
    {#if testResults.size > 0}
      <div class="space-y-4">
        <h3 class="text-sm font-semibold text-foreground">Results (PostgreSQL Evaluation)</h3>

        <!-- Debug: Show current context -->
        <div class="text-xs bg-slate-800 text-slate-200 p-2 rounded font-mono">
          <div><strong>Context:</strong> role={sessionRole}, userId={sessionUserId}, operation={testOperation}</div>
          <div><strong>Claims:</strong> {sessionClaims}</div>
        </div>

        {#each Array.from(testResults.entries()) as [testId, policyResults]}
          <div class="rounded-lg border p-4 space-y-3">
            <div class="font-medium text-sm">
              {testId === 'main' ? 'Main Scenario' : testCases.find(tc => tc.id === testId)?.name || testId}
            </div>
            {#each policyResults as result}
              <div class="flex flex-col gap-2 text-sm bg-muted/50 rounded px-3 py-2">
                <div class="flex items-center justify-between">
                  <span class="font-medium">{result.policyName}</span>
                  <div class="flex items-center gap-4">
                    <!-- Overall Result -->
                    <div class="flex items-center gap-2">
                      <span class="text-muted-foreground">Overall:</span>
                      {#if result.overallAllowed}
                        <Badge variant="default" class="bg-green-600"><Check class="h-3 w-3 mr-1" />Allow</Badge>
                      {:else}
                        <Badge variant="destructive"><X class="h-3 w-3 mr-1" />Deny</Badge>
                      {/if}
                    </div>
                    <!-- USING Result -->
                    {#if result.usingResult}
                      <div class="flex items-center gap-2">
                        <span class="text-muted-foreground">USING:</span>
                        {#if result.usingResult.allowed}
                          <Badge variant="outline" class="text-green-500 border-green-500"><Check class="h-3 w-3" /></Badge>
                        {:else}
                          <Badge variant="outline" class="text-red-500 border-red-500"><X class="h-3 w-3" /></Badge>
                        {/if}
                      </div>
                    {/if}
                    <!-- WITH CHECK Result -->
                    {#if result.withCheckResult}
                      <div class="flex items-center gap-2">
                        <span class="text-muted-foreground">CHECK:</span>
                        {#if result.withCheckResult.allowed}
                          <Badge variant="outline" class="text-green-500 border-green-500"><Check class="h-3 w-3" /></Badge>
                        {:else}
                          <Badge variant="outline" class="text-red-500 border-red-500"><X class="h-3 w-3" /></Badge>
                        {/if}
                      </div>
                    {/if}
                  </div>
                </div>
                <!-- Show SQL expression that was evaluated -->
                {#if result.usingResult?.sqlExpression}
                  <div class="text-xs text-muted-foreground font-mono bg-slate-900 p-1 rounded overflow-x-auto">
                    <span class="text-blue-400">USING SQL:</span> {result.usingResult.sqlExpression}
                  </div>
                {/if}
                {#if result.withCheckResult?.sqlExpression}
                  <div class="text-xs text-muted-foreground font-mono bg-slate-900 p-1 rounded overflow-x-auto">
                    <span class="text-purple-400">CHECK SQL:</span> {result.withCheckResult.sqlExpression}
                  </div>
                {/if}
                <!-- Show reason if available -->
                {#if result.usingResult?.reason && !result.usingResult.allowed}
                  <div class="text-xs text-red-400">USING: {result.usingResult.reason}</div>
                {/if}
                {#if result.withCheckResult?.reason && !result.withCheckResult.allowed}
                  <div class="text-xs text-red-400">CHECK: {result.withCheckResult.reason}</div>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    {/if}

    <!-- Test Cases -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-foreground">Saved Test Cases</h3>
        <Button size="sm" variant="outline" onclick={addTestCase}>
          <Plus class="mr-1 h-3 w-3" />
          Add Test Case
        </Button>
      </div>
      {#each testCases as tc (tc.id)}
        <Card class="border-dashed">
          <CardHeader class="py-3">
            <div class="flex items-center justify-between">
              <Input
                value={tc.name}
                oninput={(e) => updateTestCase(tc.id, { name: e.currentTarget.value })}
                class="w-48 h-8 text-sm"
              />
              <Button size="sm" variant="ghost" onclick={() => removeTestCase(tc.id)}>
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent class="pt-0 space-y-3">
            <div class="grid grid-cols-3 gap-3">
              <div class="space-y-1">
                <Label class="text-xs">Role</Label>
                <Select type="single" value={tc.role} onValueChange={(v) => { if (v) updateTestCase(tc.id, { role: v }); }}>
                  <SelectTrigger class="h-8">
                    <SelectValue>{tc.role}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {#each availableRoles as role}
                      <SelectItem value={role} label={role} />
                    {/each}
                  </SelectContent>
                </Select>
              </div>
              <div class="space-y-1">
                <Label class="text-xs">User ID</Label>
                <Input
                  value={tc.userId}
                  oninput={(e) => updateTestCase(tc.id, { userId: e.currentTarget.value })}
                  class="h-8 text-sm"
                />
              </div>
              <div class="space-y-1">
                <Label class="text-xs">Claims</Label>
                <Input
                  value={tc.claims}
                  oninput={(e) => updateTestCase(tc.id, { claims: e.currentTarget.value })}
                  class="h-8 text-sm"
                />
              </div>
            </div>
            <div class="space-y-1">
              <Label class="text-xs">Row Data (JSON)</Label>
              <Textarea
                value={tc.rowData}
                oninput={(e) => updateTestCase(tc.id, { rowData: e.currentTarget.value })}
                rows={3}
                class="font-mono text-xs"
              />
            </div>
          </CardContent>
        </Card>
      {/each}
    </div>
  </CardContent>
</Card>
