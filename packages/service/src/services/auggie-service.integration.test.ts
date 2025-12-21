import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { GenerateFullPolicyOptions } from './auggie-service.js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from repository root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// These tests hit the real Auggie API and can be flaky depending on model/tooling behavior.
// Opt-in only.
const shouldRun = process.env.RUN_AUGGIE_INTEGRATION_TESTS === 'true';
const describeIf = shouldRun ? describe : describe.skip;

describeIf('Auggie Service Integration Tests', () => {
  let apiKey: string;
		  let apiUrl: string | undefined;
  let generateFullPolicy: typeof import('./auggie-service.js').generateFullPolicy;

  beforeAll(async () => {
    // Ensure unit-test mocks do not affect integration tests.
    vi.unmock('@augmentcode/auggie-sdk');
    vi.resetModules();

    // Lazy import so unit tests can mock @augmentcode/auggie-sdk without module cache interference.
    ({ generateFullPolicy } = await import('./auggie-service.js'));

		// Prefer explicit env vars (useful for CI), otherwise fall back to TOKEN JSON (used by the app UI).
		const envApiKey = process.env.AUGMENT_API_TOKEN;
		const envApiUrl = process.env.AUGMENT_API_URL;

		if (envApiKey) {
			apiKey = envApiKey;
			apiUrl = envApiUrl;
			return;
		}

		const tokenStr = process.env.TOKEN;
		if (!tokenStr) {
			throw new Error(
				'No Auggie credentials found. Set AUGMENT_API_TOKEN + AUGMENT_API_URL, or set TOKEN in .env as JSON with { accessToken, tenantURL }.'
			);
		}

		try {
			const tokenData = JSON.parse(tokenStr);
			apiKey = tokenData.accessToken;
			apiUrl =
				process.env.AUGMENT_API_URL ||
				tokenData.apiUrl ||
				tokenData.tenantURL ||
				tokenData.tenantUrl;

			if (!apiKey) throw new Error('accessToken not found in TOKEN');
			// Ensure downstream code that reads env vars sees consistent values.
			process.env.AUGMENT_API_TOKEN = apiKey;
			if (apiUrl) process.env.AUGMENT_API_URL = apiUrl;
		} catch (error) {
			throw new Error(`Failed to parse TOKEN from .env: ${error}`);
		}
  });

  it('should generate a simple SELECT policy for users viewing their own posts', async () => {
    const options: GenerateFullPolicyOptions = {
      apiKey,
			...(apiUrl ? { apiUrl } : {}),
      prompt: 'Users can only view their own posts',
      tableName: 'posts',
      tableSchema: {
        columns: [
          { name: 'id', type: 'uuid' },
          { name: 'user_id', type: 'uuid' },
          { name: 'title', type: 'text' },
          { name: 'content', type: 'text' },
          { name: 'created_at', type: 'timestamp' }
        ]
      }
    };

    console.log('\n=== Test: Simple SELECT Policy ===');
    console.log('Prompt:', options.prompt);
    console.log('Table:', options.tableName);

    const result = await generateFullPolicy(options);

    console.log('Result:', JSON.stringify(result, null, 2));

    expect(result).toBeDefined();
    expect(result.policies).toBeDefined();
    expect(result.policies.length).toBeGreaterThan(0);
    
	    const policy = result.policies[0];
	    expect(policy).toBeDefined();
	    if (!policy) {
	      throw new Error('Expected at least one generated policy.');
	    }
    expect(policy.name).toBeDefined();
    expect(policy.command).toContain('SELECT');
    expect(policy.description).toBeDefined();
    expect(policy.roles).toBeDefined();
    expect(policy.usingExpression).toBeDefined();
  }, 30000); // 30 second timeout for API call

  it('should generate CRUD policies for a posts table', async () => {
    const options: GenerateFullPolicyOptions = {
      apiKey,
			...(apiUrl ? { apiUrl } : {}),
      prompt: 'Authenticated users can create, read, update, and delete their own posts',
      tableName: 'posts',
      tableSchema: {
        columns: [
          { name: 'id', type: 'uuid' },
          { name: 'user_id', type: 'uuid' },
          { name: 'title', type: 'text' },
          { name: 'content', type: 'text' },
          { name: 'created_at', type: 'timestamp' }
        ]
      }
    };

    console.log('\n=== Test: CRUD Policies ===');
    console.log('Prompt:', options.prompt);
    console.log('Table:', options.tableName);

    const result = await generateFullPolicy(options);

    console.log('Result:', JSON.stringify(result, null, 2));

    expect(result).toBeDefined();
    expect(result.policies).toBeDefined();
    expect(result.policies.length).toBeGreaterThanOrEqual(1);
    
    // Check that we have policies for different commands
    const commands = result.policies.map(p => p.command).flat();
    console.log('Generated commands:', commands);
    
    // Should have at least some CRUD operations
    expect(commands.length).toBeGreaterThan(0);
  }, 30000);

  it('should generate admin policy with different permissions', async () => {
    const options: GenerateFullPolicyOptions = {
      apiKey,
			...(apiUrl ? { apiUrl } : {}),
      prompt: 'Admin users can view and delete any post, regular users can only view their own',
      tableName: 'posts',
      tableSchema: {
        columns: [
          { name: 'id', type: 'uuid' },
          { name: 'user_id', type: 'uuid' },
          { name: 'title', type: 'text' },
          { name: 'content', type: 'text' },
          { name: 'created_at', type: 'timestamp' }
        ]
      }
    };

    console.log('\n=== Test: Admin Policy ===');
    console.log('Prompt:', options.prompt);
    console.log('Table:', options.tableName);

    const result = await generateFullPolicy(options);

    console.log('Result:', JSON.stringify(result, null, 2));

    expect(result).toBeDefined();
    expect(result.policies).toBeDefined();
    expect(result.policies.length).toBeGreaterThan(0);
    
    // Should have policies for different roles
    const roles = result.policies.map(p => p.roles).flat();
    console.log('Generated roles:', roles);
  }, 30000);
});

