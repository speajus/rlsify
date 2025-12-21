<script lang="ts">
  import type { TableInfo, PolicyDefinition } from '@speajus/rlsify-types';
  import {
    generateFullPolicy,
    retrieveAuggieToken,
    storeAuggieToken,
    type GeneratedPolicyDefinition,
    type GenerateFullPolicyResult,
  } from './services/auggie-service';

  interface Props {
    baseTable: string;
    tableSchema?: TableInfo;
    existingPolicies?: string[];
    onPoliciesGenerated: (policies: PolicyDefinition[]) => void;
  }

  let {
    baseTable,
    tableSchema,
    existingPolicies = [],
    onPoliciesGenerated,
  }: Props = $props();

  // State
  let prompt = $state('');
  let isGenerating = $state(false);
  let error = $state<string | null>(null);
  let generatedResult = $state<GenerateFullPolicyResult | null>(null);
  let showTokenInput = $state(false);
  let tokenInput = $state('');
  let isExpanded = $state(false);

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
  // Full Policy Generation
  // ============================================================================

  async function handleGenerateFullPolicy() {
    if (!checkToken()) return;
    if (!prompt.trim()) {
      error = 'Please describe the policy you want to create.';
      return;
    }

    isGenerating = true;
    error = null;
    generatedResult = null;

    try {
      console.log('Generating full policy with prompt:', prompt.trim());
      const result = await generateFullPolicy({
        prompt: prompt.trim(),
        tableName: baseTable,
        tableSchema,
        existingPolicies,
      });

      console.log('Generated full policy result:', result);

      if (!result.policies || result.policies.length === 0) {
        error = 'The AI did not generate any policies. Please try rephrasing your request.';
        console.error('No policies returned:', result);
      } else {
        generatedResult = result;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to generate policy';
      console.error('Full policy generation error:', err);
    } finally {
      isGenerating = false;
    }
  }

  function convertToPolicyDefinition(policy: GeneratedPolicyDefinition): PolicyDefinition {
    return {
      name: policy.name,
      command: policy.command as ('SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL')[],
      description: policy.description,
      roles: policy.roles,
      usingExpression: policy.usingExpression,
      withCheckExpression: policy.withCheckExpression,
    };
  }

  function applyGeneratedPolicies() {
    if (generatedResult) {
      const policies = generatedResult.policies.map(convertToPolicyDefinition);
      onPoliciesGenerated(policies);
      generatedResult = null;
      prompt = '';
    }
  }

  function discardGeneratedPolicies() {
    generatedResult = null;
  }

  function regeneratePolicy() {
    handleGenerateFullPolicy();
  }
</script>

<div class="ai-full-policy-generator">
  <div class="header" onclick={() => (isExpanded = !isExpanded)}>
    <h3>
      <span class="icon">{isExpanded ? '▼' : '▶'}</span>
      AI Full Policy Generator
    </h3>
    <p class="subtitle">Generate complete policies from natural language descriptions</p>
  </div>

  {#if isExpanded}
    <div class="content">
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
          <label for="full-policy-prompt">
            Describe the complete policy you want to create:
          </label>
          <textarea
            id="full-policy-prompt"
            bind:value={prompt}
            placeholder="Example: Users can CRUD their own posts. Admins can do anything."
            rows="4"
            disabled={isGenerating}
          ></textarea>

          <button
            onclick={handleGenerateFullPolicy}
            disabled={isGenerating || !prompt.trim()}
            class="btn-primary"
          >
            {isGenerating ? 'Generating...' : 'Generate Complete Policy'}
          </button>
        </div>

        {#if generatedResult}
          <div class="generated-result">
            <h4>Generated {generatedResult.policies.length > 1 ? 'Policies' : 'Policy'}</h4>
            <p class="explanation">{generatedResult.explanation}</p>

            <div class="policies-preview">
              {#each generatedResult.policies as policy}
                <div class="policy-card">
                  <div class="policy-header">
                    <strong>{policy.name}</strong>
                    <span class="command-badge">{policy.command.join(', ')}</span>
                  </div>
                  <p class="policy-description">{policy.description}</p>
                  {#if policy.roles && policy.roles.length > 0}
                    <div class="policy-roles">
                      <strong>Roles:</strong> {policy.roles.join(', ')}
                    </div>
                  {/if}
                  <details class="policy-details">
                    <summary>View Expression</summary>
                    <pre><code>{JSON.stringify(policy.usingExpression, null, 2)}</code></pre>
                    {#if policy.withCheckExpression}
                      <strong>WITH CHECK:</strong>
                      <pre><code>{JSON.stringify(policy.withCheckExpression, null, 2)}</code></pre>
                    {/if}
                  </details>
                </div>
              {/each}
            </div>

            <div class="result-actions">
              <button onclick={applyGeneratedPolicies} class="btn-primary">
                Accept {generatedResult.policies.length > 1 ? 'All' : 'Policy'}
              </button>
              <button onclick={regeneratePolicy} class="btn-secondary">Regenerate</button>
              <button onclick={discardGeneratedPolicies} class="btn-secondary">Discard</button>
            </div>
          </div>
        {/if}
      {/if}

      {#if error}
        <div class="error-message">{error}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .ai-full-policy-generator {
    margin-bottom: 1.5rem;
    border: 2px solid hsl(var(--border));
    border-radius: var(--radius);
    background: hsl(var(--card));
  }

  .header {
    padding: 1rem;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
  }

  .header:hover {
    background: hsl(var(--muted) / 0.5);
  }

  h3 {
    margin: 0 0 0.25rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .icon {
    font-size: 0.9rem;
    color: hsl(var(--muted-foreground));
  }

  .subtitle {
    margin: 0;
    font-size: 0.9rem;
    color: hsl(var(--muted-foreground));
    padding-left: 1.4rem;
  }

  .content {
    padding: 0 1rem 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .token-input-section {
    padding: 1rem;
    background: hsl(var(--background));
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
    background: hsl(var(--background));
    border: 2px solid hsl(var(--border));
    border-radius: var(--radius);
  }

  h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .explanation {
    margin: 0.5rem 0 1rem 0;
    color: hsl(var(--foreground));
    line-height: 1.6;
    font-size: 0.95rem;
  }

  .policies-preview {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .policy-card {
    padding: 1rem;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
  }

  .policy-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .command-badge {
    padding: 0.25rem 0.5rem;
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    border-radius: calc(var(--radius) - 2px);
    font-size: 0.85rem;
    font-weight: 600;
  }

  .policy-description {
    margin: 0.5rem 0;
    color: hsl(var(--muted-foreground));
    font-size: 0.9rem;
  }

  .policy-roles {
    margin: 0.5rem 0;
    font-size: 0.9rem;
    color: hsl(var(--foreground));
  }

  .policy-details {
    margin-top: 0.5rem;
  }

  .policy-details summary {
    cursor: pointer;
    font-weight: 600;
    color: hsl(var(--primary));
    font-size: 0.9rem;
    user-select: none;
  }

  .policy-details summary:hover {
    text-decoration: underline;
  }

  pre {
    background: hsl(var(--background));
    padding: 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    overflow-x: auto;
    margin: 0.5rem 0;
  }

  code {
    font-family: 'Courier New', monospace;
    font-size: 0.85rem;
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

  .policy-generation {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
</style>

