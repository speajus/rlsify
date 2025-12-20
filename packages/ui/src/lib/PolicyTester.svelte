<script lang="ts">
  import type { PolicyDefinition, TableInfo, ColumnInfo, PolicyTestResult } from '@speajus/rlsify-types';
  import { policyClient } from '$lib/api/client.js';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '$lib/components/ui/select/index.js';
  import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '$lib/components/ui/collapsible/index.js';
  import JsonEditor from '$lib/components/JsonEditor.svelte';
  import Check from 'lucide-svelte/icons/check';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import X from 'lucide-svelte/icons/x';
  import Play from 'lucide-svelte/icons/play';
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

  // Realistic JWT claims similar to Supabase Auth
  const DEFAULT_CLAIMS = JSON.stringify({
    iss: 'https://example.supabase.co/auth/v1',
    sub: DEFAULT_USER_ID,
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    email: 'user@example.com',
    phone: '',
    app_metadata: {
      provider: 'email',
      providers: ['email']
    },
    user_metadata: {
      org_id: DEFAULT_ORG_ID,
      role: 'member'
    },
    role: 'authenticated'
  }, null, 2);

  let sessionRole = $state('authenticated');
  let sessionUserId = $state(DEFAULT_USER_ID);
  let sessionClaims = $state(DEFAULT_CLAIMS);
  let testOperation = $state<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'>('SELECT');
  let isLoading = $state(false);
  let testError = $state<string | null>(null);
  let claimsOpen = $state(false);

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

  // Derived parsed row values for the table editor
  let parsedRowValues = $derived.by(() => {
    try {
      return JSON.parse(sampleRowJson) || {};
    } catch {
      return {};
    }
  });

  interface TestCase {
    id: string;
    name: string;
    role: string;
    userId: string;
    claims: string;
    rowData: string;
    operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
    expectedOutcome: 'allow' | 'deny';
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

  function mapOperationToCommand(op: string | string[]): number {
    const mapping: Record<string, number> = { 'SELECT': 1, 'INSERT': 2, 'UPDATE': 3, 'DELETE': 4, 'ALL': 5 };
    // Handle both single command and array (take first for proto)
    const singleOp = Array.isArray(op) ? op[0] : op;
    return mapping[singleOp] ?? 5;
  }

  function parseRowJson(json: string): Record<string, unknown> {
    try {
      return JSON.parse(json) || {};
    } catch {
      return {};
    }
  }

  function formatCellValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function updateRowValue(columnName: string, inputValue: string, columnType: string) {
    const rowValues = parseRowJson(sampleRowJson);
    const type = columnType.toLowerCase();

    // Parse value based on column type
    let parsedValue: unknown = inputValue;
    if (type.includes('int') || type.includes('numeric') || type.includes('decimal') || type.includes('float') || type.includes('double')) {
      parsedValue = inputValue === '' ? 0 : Number(inputValue);
    } else if (type.includes('bool')) {
      parsedValue = inputValue.toLowerCase() === 'true' || inputValue === '1';
    } else if (type.includes('json')) {
      try {
        parsedValue = JSON.parse(inputValue);
      } catch {
        parsedValue = inputValue;
      }
    } else if (type.includes('array')) {
      try {
        parsedValue = JSON.parse(inputValue);
      } catch {
        parsedValue = inputValue.split(',').map(s => s.trim());
      }
    }

    rowValues[columnName] = parsedValue;
    sampleRowJson = JSON.stringify(rowValues, null, 2);
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

  function addTestCase(expectedOutcome: 'allow' | 'deny' = 'allow') {
    const isNegativeCase = expectedOutcome === 'deny';
    // For negative cases, use a different user ID to simulate unauthorized access
    const testUserId = isNegativeCase ? 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' : sessionUserId;
    testCases = [...testCases, {
      id: crypto.randomUUID(),
      name: isNegativeCase ? 'Should Deny: ' + (testCases.length + 1) : 'Should Allow: ' + (testCases.length + 1),
      role: sessionRole,
      userId: testUserId,
      claims: sessionClaims,
      rowData: sampleRowJson,
      operation: testOperation,
      expectedOutcome,
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
      <div class="grid grid-cols-3 gap-4">
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
      <Collapsible bind:open={claimsOpen}>
        <CollapsibleTrigger
          class="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1"
        >
          <ChevronRight class="h-4 w-4 transition-transform {claimsOpen ? 'rotate-90' : ''}" />
          <span>JWT Claims (JSON)</span>
          <Badge variant="outline" class="ml-1 text-xs">
            {Object.keys(JSON.parse(sessionClaims || '{}')).length} fields
          </Badge>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div class="mt-2">
            <JsonEditor
              value={sessionClaims}
              onUpdate={(v) => sessionClaims = v}
              rows={8}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>

    <!-- Sample Row Data as Table -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">Sample Row Data</span>
        {#if tableName}
          <span class="text-xs text-muted-foreground font-mono">{tableName}</span>
        {/if}
      </div>
      {#if tableInfo?.columns && tableInfo.columns.length > 0}
        <div class="rounded-lg border border-border overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-muted/50">
              <tr>
                <th class="px-3 py-2 text-left font-medium text-muted-foreground w-1/3">Column</th>
                <th class="px-3 py-2 text-left font-medium text-muted-foreground w-1/6">Type</th>
                <th class="px-3 py-2 text-left font-medium text-muted-foreground">Value</th>
              </tr>
            </thead>
            <tbody>
              {#each tableInfo.columns as col, idx}
                <tr class="border-t border-border {idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}">
                  <td class="px-3 py-1.5">
                    <div class="flex items-center gap-1.5">
                      <span class="font-mono text-xs">{col.name}</span>
                      {#if col.isPrimaryKey}
                        <span class="text-[9px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400">PK</span>
                      {/if}
                      {#if col.isForeignKey}
                        <span class="text-[9px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400">FK</span>
                      {/if}
                    </div>
                  </td>
                  <td class="px-3 py-1.5">
                    <span class="font-mono text-xs text-muted-foreground">{col.type}</span>
                  </td>
                  <td class="px-3 py-1.5">
                    <input
                      type="text"
                      class="w-full px-2 py-1 text-xs font-mono bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                      value={formatCellValue(parsedRowValues[col.name])}
                      oninput={(e) => updateRowValue(col.name, (e.target as HTMLInputElement).value, col.type)}
                    />
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <JsonEditor
          value={sampleRowJson}
          onUpdate={(v) => sampleRowJson = v}
          rows={6}
        />
      {/if}
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
        <h3 class="text-sm font-semibold text-foreground">Test Cases</h3>
        <div class="flex gap-2">
          <Button size="sm" variant="outline" class="text-green-500 border-green-500/50 hover:bg-green-500/10" onclick={() => addTestCase('allow')}>
            <Check class="mr-1 h-3 w-3" />
            Add Allow Case
          </Button>
          <Button size="sm" variant="outline" class="text-red-500 border-red-500/50 hover:bg-red-500/10" onclick={() => addTestCase('deny')}>
            <X class="mr-1 h-3 w-3" />
            Add Deny Case
          </Button>
        </div>
      </div>
      {#each testCases as tc (tc.id)}
        {@const tcResults = testResults.get(tc.id)}
        {@const actualOutcome = tcResults?.every(r => r.overallAllowed) ? 'allow' : 'deny'}
        {@const testPassed = tcResults ? actualOutcome === tc.expectedOutcome : null}
        <Card class={`border-dashed ${tc.expectedOutcome === 'deny' ? 'border-red-500/30' : 'border-green-500/30'}`}>
          <CardHeader class="py-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Input
                  value={tc.name}
                  oninput={(e) => updateTestCase(tc.id, { name: e.currentTarget.value })}
                  class="w-48 h-8 text-sm"
                />
                <Badge variant={tc.expectedOutcome === 'allow' ? 'default' : 'destructive'} class={tc.expectedOutcome === 'allow' ? 'bg-green-600' : ''}>
                  Expect: {tc.expectedOutcome.toUpperCase()}
                </Badge>
                {#if testPassed !== null}
                  {#if testPassed}
                    <Badge variant="outline" class="text-green-500 border-green-500 bg-green-500/10">
                      <Check class="h-3 w-3 mr-1" />PASS
                    </Badge>
                  {:else}
                    <Badge variant="outline" class="text-red-500 border-red-500 bg-red-500/10">
                      <X class="h-3 w-3 mr-1" />FAIL (got {actualOutcome})
                    </Badge>
                  {/if}
                {/if}
              </div>
              <div class="flex items-center gap-2">
                <Select type="single" value={tc.expectedOutcome} onValueChange={(v) => { if (v) updateTestCase(tc.id, { expectedOutcome: v as 'allow' | 'deny' }); }}>
                  <SelectTrigger class="h-8 w-24">
                    <SelectValue>{tc.expectedOutcome}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allow" label="Allow" />
                    <SelectItem value="deny" label="Deny" />
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" onclick={() => removeTestCase(tc.id)}>
                  <Trash2 class="h-4 w-4" />
                </Button>
              </div>
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
                <Label class="text-xs">Operation</Label>
                <Select type="single" value={tc.operation} onValueChange={(v) => { if (v) updateTestCase(tc.id, { operation: v as 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' }); }}>
                  <SelectTrigger class="h-8">
                    <SelectValue>{tc.operation}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {#each operations as op}
                      <SelectItem value={op} label={op} />
                    {/each}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <JsonEditor
              value={tc.claims}
              onUpdate={(v) => updateTestCase(tc.id, { claims: v })}
              rows={2}
              label="JWT Claims (JSON)"
            />
            <JsonEditor
              value={tc.rowData}
              onUpdate={(v) => updateTestCase(tc.id, { rowData: v })}
              rows={3}
              label="Row Data (JSON)"
            />
          </CardContent>
        </Card>
      {/each}
    </div>
  </CardContent>
</Card>
