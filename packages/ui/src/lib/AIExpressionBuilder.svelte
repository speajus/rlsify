<script lang="ts">
  import type { PermissionExpression, PolicyTest, TableInfo } from '@speajus/rlsify-types';
  import {
    generatePolicyExpression,
    generatePolicyTests,
    retrieveAuggieToken,
    storeAuggieToken,
    type GeneratePolicyResult,
  } from './services/auggie-service';

  interface Props {
    baseTable: string;
    expression?: PermissionExpression;
    tableSchema?: TableInfo;
    existingPolicies?: string[];
    onUpdate: (expr: PermissionExpression, explanation?: string) => void;
    onGenerateTests?: (tests: PolicyTest[]) => void;
  }

  let {
    baseTable,
    expression = $bindable(),
    tableSchema,
    existingPolicies = [],
    onUpdate,
    onGenerateTests,
  }: Props = $props();

  // State
  let prompt = $state('');
  let testPrompt = $state('');
  let isGenerating = $state(false);
  let isGeneratingTests = $state(false);
  let error = $state<string | null>(null);
  let generatedResult = $state<GeneratePolicyResult | null>(null);
  let showTokenInput = $state(false);
  let tokenInput = $state('');

  // Check for token on mount
  let hasToken = $state(!!retrieveAuggieToken());

  // ============================================================================
  // Token Management
  // ============================================================================

  function checkToken(): boolean {
    const token = retrieveAuggieToken();
    if (!token) {
      showTokenInput = true;
      error = 'Please provide an Auggie API token to use AI features.';
      return false;
    }
    return true;
  }

  function saveToken() {
    if (tokenInput.trim()) {
      storeAuggieToken(tokenInput.trim());
      hasToken = true;
      showTokenInput = false;
      tokenInput = '';
      error = null;
    }
  }

  // ============================================================================
  // Policy Generation
  // ============================================================================

  async function handleGeneratePolicy() {
    if (!checkToken()) return;
    if (!prompt.trim()) {
      error = 'Please enter a description of the policy you want to generate.';
      return;
    }

    isGenerating = true;
    error = null;
    generatedResult = null;

    try {
      console.log('Generating policy with prompt:', prompt.trim());
      const result = await generatePolicyExpression({
        prompt: prompt.trim(),
        tableName: baseTable,
        tableSchema,
        existingPolicies,
      });

      console.log('Generated policy result:', result);

      // Check if the expression is empty
      if (!result.expression || Object.keys(result.expression).length === 0) {
        error = 'The AI did not generate a valid policy expression. Please try rephrasing your request or check the backend logs.';
        console.error('Empty expression returned:', result);
      } else {
        generatedResult = result;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to generate policy';
      console.error('Policy generation error:', err);
    } finally {
      isGenerating = false;
    }
  }

  function applyGeneratedPolicy() {
    if (generatedResult) {
      onUpdate(generatedResult.expression, generatedResult.explanation);
      generatedResult = null;
      prompt = '';
    }
  }

  function discardGeneratedPolicy() {
    generatedResult = null;
  }

  // ============================================================================
  // Test Generation
  // ============================================================================

  async function handleGenerateTests() {
    if (!checkToken()) return;
    if (!testPrompt.trim()) {
      error = 'Please describe what test cases you want to generate.';
      return;
    }

    isGeneratingTests = true;
    error = null;

    try {
      const tests = await generatePolicyTests({
        prompt: testPrompt.trim(),
        tableName: baseTable,
        policyName: 'current_policy', // TODO: get actual policy name
        policyExpression: expression,
        tableSchema,
      });

      if (onGenerateTests) {
        onGenerateTests(tests);
      }
      testPrompt = '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to generate tests';
      console.error('Test generation error:', err);
    } finally {
      isGeneratingTests = false;
    }
  }
</script>

<div class="ai-expression-builder">
  <div class="section">
    <h3>AI Policy Generator</h3>
    
    {#if !hasToken || showTokenInput}
      <div class="token-input-section">
        <p class="help-text">
          To use AI features, you need an Auggie API token.
          Run <code>auggie token print</code> in your terminal and paste the entire JSON token below:
        </p>
        <p class="help-text">
          Example: <code>{`{"accessToken":"...","tenantURL":"https://...","scopes":[...]}`}</code>
        </p>
        <div class="token-input-group">
          <input
            type="text"
            bind:value={tokenInput}
            placeholder='Paste the full JSON token from "auggie token print"'
            class="token-input"
          />
          <button onclick={saveToken} class="btn-primary">Save Token</button>
        </div>
      </div>
    {/if}

    {#if hasToken && !showTokenInput}
      <div class="policy-generation">
        <label for="policy-prompt">
          Describe the access control policy you want to create:
        </label>
        <textarea
          id="policy-prompt"
          bind:value={prompt}
          placeholder="Example: Allow users to see only their own records where user_id matches their JWT claim"
          rows="4"
          disabled={isGenerating}
        ></textarea>
        
        <button
          onclick={handleGeneratePolicy}
          disabled={isGenerating || !prompt.trim()}
          class="btn-primary"
        >
          {isGenerating ? 'Generating...' : 'Generate Policy'}
        </button>
      </div>

      {#if generatedResult}
        <div class="generated-result">
          <h4>Generated Policy</h4>
          <p class="explanation">{generatedResult.explanation}</p>
          <pre><code>{JSON.stringify(generatedResult.expression, null, 2)}</code></pre>
          <div class="result-actions">
            <button onclick={applyGeneratedPolicy} class="btn-primary">Apply Policy</button>
            <button onclick={discardGeneratedPolicy} class="btn-secondary">Discard</button>
          </div>
        </div>
      {/if}

      {#if onGenerateTests}
        <div class="test-generation">
          <h4>Generate Test Cases</h4>
          <label for="test-prompt">
            Describe the test scenarios you want to create:
          </label>
          <textarea
            id="test-prompt"
            bind:value={testPrompt}
            placeholder="Example: Test that users can access their own records but not others"
            rows="3"
            disabled={isGeneratingTests}
          ></textarea>
          
          <button
            onclick={handleGenerateTests}
            disabled={isGeneratingTests || !testPrompt.trim()}
            class="btn-primary"
          >
            {isGeneratingTests ? 'Generating Tests...' : 'Generate Tests'}
          </button>
        </div>
      {/if}
    {/if}

    {#if error}
      <div class="error-message">{error}</div>
    {/if}
  </div>
</div>

<style>
  .ai-expression-builder {
    padding: 1rem;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .token-input-section {
    padding: 1rem;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
  }

  .help-text {
    margin-bottom: 1rem;
    font-size: 0.9rem;
    color: hsl(var(--foreground));
    line-height: 1.5;
  }

  .help-text code {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
    padding: 0.2rem 0.4rem;
    border-radius: calc(var(--radius) - 4px);
    font-family: monospace;
    border: 1px solid hsl(var(--border));
  }

  .token-input-group {
    display: flex;
    gap: 0.5rem;
  }

  .token-input {
    flex: 1;
    padding: 0.5rem;
    border: 2px solid hsl(var(--input));
    border-radius: var(--radius);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: 0.95rem;
  }

  .token-input:focus {
    outline: none;
    border-color: hsl(var(--ring));
    box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
  }

  label {
    font-weight: 600;
    margin-bottom: 0.25rem;
    color: hsl(var(--foreground));
    font-size: 0.95rem;
  }

  textarea {
    width: 100%;
    padding: 0.5rem;
    border: 2px solid hsl(var(--input));
    border-radius: var(--radius);
    font-family: inherit;
    resize: vertical;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: 0.95rem;
    line-height: 1.5;
  }

  textarea:focus {
    outline: none;
    border-color: hsl(var(--ring));
    box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
  }

  textarea:disabled {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    cursor: not-allowed;
    border-color: hsl(var(--border));
  }

  .btn-primary,
  .btn-secondary {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
    font-weight: 600;
    font-size: 0.95rem;
    transition: all 0.15s;
  }

  .btn-primary {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
  }

  .btn-primary:hover:not(:disabled) {
    background: hsl(var(--primary) / 0.9);
  }

  .btn-primary:disabled {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    cursor: not-allowed;
    opacity: 0.5;
  }

  .btn-secondary {
    background: hsl(var(--secondary));
    color: hsl(var(--secondary-foreground));
  }

  .btn-secondary:hover {
    background: hsl(var(--secondary) / 0.8);
  }

  .generated-result {
    padding: 1rem;
    background: hsl(var(--card));
    border: 2px solid hsl(var(--border));
    border-radius: var(--radius);
  }

  .explanation {
    margin: 0.5rem 0;
    color: hsl(var(--foreground));
    line-height: 1.6;
    font-size: 0.95rem;
  }

  pre {
    background: hsl(var(--background));
    padding: 1rem;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    overflow-x: auto;
    margin: 0.5rem 0;
  }

  code {
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
    color: hsl(var(--foreground));
  }

  .result-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .error-message {
    padding: 0.75rem;
    background: hsl(var(--destructive) / 0.1);
    color: hsl(var(--destructive));
    border: 2px solid hsl(var(--destructive));
    border-radius: var(--radius);
    font-weight: 500;
  }

  .policy-generation,
  .test-generation {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
</style>

