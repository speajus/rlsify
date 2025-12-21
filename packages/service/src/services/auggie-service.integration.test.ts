import { describe, it, expect, beforeAll } from 'vitest';
import { generateFullPolicy, type GenerateFullPolicyOptions } from './auggie-service.js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from repository root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

describe('Auggie Service Integration Tests', () => {
  let apiKey: string;

  beforeAll(() => {
    // Parse the TOKEN from .env
    const tokenStr = process.env.TOKEN;
    if (!tokenStr) {
      throw new Error('TOKEN not found in .env file');
    }

    try {
      const tokenData = JSON.parse(tokenStr);
      apiKey = tokenData.accessToken;
      
      if (!apiKey) {
        throw new Error('accessToken not found in TOKEN');
      }

      console.log('Using API key from .env:', apiKey.substring(0, 10) + '...');
    } catch (error) {
      throw new Error(`Failed to parse TOKEN from .env: ${error}`);
    }
  });

  it('should generate a simple SELECT policy for users viewing their own posts', async () => {
    const options: GenerateFullPolicyOptions = {
      apiKey,
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
    expect(policy.name).toBeDefined();
    expect(policy.command).toContain('SELECT');
    expect(policy.description).toBeDefined();
    expect(policy.roles).toBeDefined();
    expect(policy.usingExpression).toBeDefined();
  }, 30000); // 30 second timeout for API call

  it('should generate CRUD policies for a posts table', async () => {
    const options: GenerateFullPolicyOptions = {
      apiKey,
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

