import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateFullPolicy, type GenerateFullPolicyOptions } from './auggie-service.js';

// Mock the Auggie SDK
const mockPromptResponse = {
  text: 'Generated policy explanation',
  toolCalls: [
    {
      toolName: 'generate_full_policy',
      args: {
        name: 'posts_select_own',
        command: ['SELECT'],
        description: 'Allow users to view only their own posts',
        roles: ['authenticated'],
        usingExpression: {
          _eq: {
            user_id: { _session_var: 'user_id' }
          }
        }
      }
    }
  ]
};

vi.mock('@augmentcode/auggie-sdk', () => ({
  Auggie: vi.fn().mockImplementation(() => ({
    prompt: vi.fn().mockResolvedValue(mockPromptResponse),
    close: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe('generateFullPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set required environment variables
    process.env.AUGMENT_API_TOKEN = 'test-token';
  });

  it('should generate a single policy from a simple prompt', async () => {
    const options: GenerateFullPolicyOptions = {
      apiKey: 'test-api-key',
      prompt: 'Users can only see their own posts',
      tableName: 'posts'
    };

    const result = await generateFullPolicy(options);

    expect(result).toBeDefined();
    expect(result.policies).toHaveLength(1);
    expect(result.policies[0]).toMatchObject({
      name: 'posts_select_own',
      command: ['SELECT'],
      description: 'Allow users to view only their own posts',
      roles: ['authenticated']
    });
    expect(result.policies[0].usingExpression).toBeDefined();
    expect(result.explanation).toBeDefined();
  });

  it('should include table schema in context when provided', async () => {
    const options: GenerateFullPolicyOptions = {
      apiKey: 'test-api-key',
      prompt: 'Users can edit their posts',
      tableName: 'posts',
      tableSchema: {
        columns: [
          { name: 'id', type: 'integer' },
          { name: 'user_id', type: 'uuid' },
          { name: 'content', type: 'text' }
        ]
      }
    };

    const result = await generateFullPolicy(options);

    expect(result).toBeDefined();
    expect(result.policies).toHaveLength(1);
  });

  it('should include existing policies in context', async () => {
    const options: GenerateFullPolicyOptions = {
      apiKey: 'test-api-key',
      prompt: 'Admins can delete any post',
      tableName: 'posts',
      existingPolicies: ['posts_select_own', 'posts_insert_own']
    };

    const result = await generateFullPolicy(options);

    expect(result).toBeDefined();
    expect(result.policies).toHaveLength(1);
  });

  it('should handle API errors gracefully', async () => {
    // Mock an error
    const { Auggie } = await import('@augmentcode/auggie-sdk');
    vi.mocked(Auggie).mockImplementationOnce(() => ({
      prompt: vi.fn().mockRejectedValue(new Error('API Error')),
      close: vi.fn().mockResolvedValue(undefined)
    }) as any);

    const options: GenerateFullPolicyOptions = {
      apiKey: 'test-api-key',
      prompt: 'Test prompt',
      tableName: 'posts'
    };

    await expect(generateFullPolicy(options)).rejects.toThrow('API Error');
  });

  it('should use custom model when provided', async () => {
    const options: GenerateFullPolicyOptions = {
      apiKey: 'test-api-key',
      prompt: 'Users can view posts',
      tableName: 'posts',
      model: 'gpt-4'
    };

    const result = await generateFullPolicy(options);

    expect(result).toBeDefined();
  });

  it('should use custom API URL when provided', async () => {
    const options: GenerateFullPolicyOptions = {
      apiKey: 'test-api-key',
      apiUrl: 'https://custom-api.example.com',
      prompt: 'Users can view posts',
      tableName: 'posts'
    };

    const result = await generateFullPolicy(options);

    expect(result).toBeDefined();
  });

  it('should generate policy with both USING and WITH CHECK expressions', async () => {
    const { Auggie } = await import('@augmentcode/auggie-sdk');
    const mockResponse = {
      text: 'Generated policy with both expressions',
      toolCalls: [
        {
          toolName: 'generate_full_policy',
          args: {
            name: 'posts_insert_own',
            command: ['INSERT'],
            description: 'Allow users to insert their own posts',
            roles: ['authenticated'],
            usingExpression: {
              _eq: { user_id: { _session_var: 'user_id' } }
            },
            withCheckExpression: {
              _eq: { user_id: { _session_var: 'user_id' } }
            }
          }
        }
      ]
    };

    vi.mocked(Auggie).mockImplementationOnce(() => ({
      prompt: vi.fn().mockResolvedValue(mockResponse),
      close: vi.fn().mockResolvedValue(undefined)
    }) as any);

    const options: GenerateFullPolicyOptions = {
      apiKey: 'test-api-key',
      prompt: 'Users can insert their own posts',
      tableName: 'posts'
    };

    const result = await generateFullPolicy(options);

    expect(result.policies[0].withCheckExpression).toBeDefined();
  });

  it('should handle multiple policies from CRUD prompt', async () => {
    const { Auggie } = await import('@augmentcode/auggie-sdk');
    const mockResponse = {
      text: 'Generated CRUD policies for user access',
      toolCalls: [
        {
          toolName: 'generate_full_policy',
          args: {
            name: 'posts_select_own',
            command: ['SELECT'],
            description: 'Allow users to view their own posts',
            roles: ['authenticated'],
            usingExpression: { _eq: { user_id: { _session_var: 'user_id' } } }
          }
        },
        {
          toolName: 'generate_full_policy',
          args: {
            name: 'posts_insert_own',
            command: ['INSERT'],
            description: 'Allow users to insert their own posts',
            roles: ['authenticated'],
            usingExpression: { _eq: { user_id: { _session_var: 'user_id' } } }
          }
        },
        {
          toolName: 'generate_full_policy',
          args: {
            name: 'posts_update_own',
            command: ['UPDATE'],
            description: 'Allow users to update their own posts',
            roles: ['authenticated'],
            usingExpression: { _eq: { user_id: { _session_var: 'user_id' } } }
          }
        },
        {
          toolName: 'generate_full_policy',
          args: {
            name: 'posts_delete_own',
            command: ['DELETE'],
            description: 'Allow users to delete their own posts',
            roles: ['authenticated'],
            usingExpression: { _eq: { user_id: { _session_var: 'user_id' } } }
          }
        }
      ]
    };

    vi.mocked(Auggie).mockImplementationOnce(() => ({
      prompt: vi.fn().mockResolvedValue(mockResponse),
      close: vi.fn().mockResolvedValue(undefined)
    }) as any);

    const options: GenerateFullPolicyOptions = {
      apiKey: 'test-api-key',
      prompt: 'Users can CRUD their own posts',
      tableName: 'posts'
    };

    const result = await generateFullPolicy(options);

    expect(result.policies).toHaveLength(4);
    expect(result.policies.map(p => p.command[0])).toEqual(['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
  });
});

