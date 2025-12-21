import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GenerateFullPolicyOptions } from './auggie-service.js';

// Robust ESM mocking: avoid static-importing the module under test until after mocks are registered.
const auggieCreateMock = vi.hoisted(() => vi.fn());
vi.mock('@augmentcode/auggie-sdk', () => ({
  Auggie: {
    create: auggieCreateMock,
  },
}));

function mockAuggieClient(promptResponse: string) {
  const client = {
    onSessionUpdate: vi.fn(),
    prompt: vi.fn().mockResolvedValue(promptResponse),
    close: vi.fn().mockResolvedValue(undefined),
  };

  auggieCreateMock.mockResolvedValue(client as any);
  return client;
}

describe('generateFullPolicy', () => {
  let generateFullPolicy: typeof import('./auggie-service.js').generateFullPolicy;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    ({ generateFullPolicy } = await import('./auggie-service.js'));

    // Set required environment variables
    process.env.AUGMENT_API_TOKEN = 'test-token';
    process.env.AUGMENT_API_URL = 'https://api.example.com';

    mockAuggieClient(
      JSON.stringify({
        name: 'posts_select_own',
        command: ['SELECT'],
        description: 'Allow users to view only their own posts',
        roles: ['authenticated'],
        usingExpression: {
          _eq: {
            user_id: { _session_var: 'user_id' },
          },
        },
      })
    );
  });

  it('should generate a single policy from a simple prompt', async () => {
    const options: GenerateFullPolicyOptions = {
      apiKey: 'test-api-key',
      prompt: 'Users can only see their own posts',
      tableName: 'posts',
    };

    const result = await generateFullPolicy(options);

    expect(result).toBeDefined();
    expect(result.policies).toHaveLength(1);
    expect(result.policies[0]).toMatchObject({
      name: 'posts_select_own',
      command: ['SELECT'],
      description: 'Allow users to view only their own posts',
      roles: ['authenticated'],
    });
    expect(result.policies[0].usingExpression).toBeDefined();
    expect(result.explanation).toBeDefined();
  });

  it('should enforce policy name convention {table}_{command}_{purpose}', async () => {

    mockAuggieClient(
      JSON.stringify({
        // Intentionally non-conforming
        name: 'select_posts_own',
        command: ['SELECT'],
        description: 'Allow users to view only their own posts',
        roles: ['authenticated'],
        usingExpression: {
          _eq: {
            user_id: { _session_var: 'user_id' },
          },
        },
      })
    );

    const options: GenerateFullPolicyOptions = {
      apiKey: 'test-api-key',
      prompt: 'Users can only see their own posts',
      tableName: 'posts',
    };

    const result = await generateFullPolicy(options);

    expect(result.policies[0]?.name).toBe('posts_select_own');
  });

	it('should parse tool-call policies even when prompt returns an empty string', async () => {
		let sessionUpdateHandler: ((n: any) => void) | undefined;
		const toolPolicy = {
			name: 'posts_select_own',
			command: ['SELECT'],
			description: 'Allow users to view only their own posts',
			roles: ['authenticated'],
			usingExpression: {
				_eq: {
					user_id: { _session_var: 'user_id' },
				},
			},
		};

		auggieCreateMock.mockResolvedValueOnce({
			onSessionUpdate: vi.fn((handler: any) => {
				sessionUpdateHandler = handler;
			}),
			prompt: vi.fn(() => {
				// Simulate the tool-call update arriving *after* prompt() resolves.
				setTimeout(() => {
					sessionUpdateHandler?.({
						update: {
							sessionUpdate: 'tool_call',
							toolCallId: 'tc_1',
							title: 'generate_full_policy',
							rawInput: JSON.stringify(toolPolicy),
						},
					});
				}, 0);
				return Promise.resolve('');
			}),
			close: vi.fn().mockResolvedValue(undefined),
		} as any);

		const options: GenerateFullPolicyOptions = {
			apiKey: 'test-api-key',
			prompt: 'Users can only see their own posts',
			tableName: 'posts',
		};

		const result = await generateFullPolicy(options);
		expect(result.policies).toHaveLength(1);
		expect(result.policies[0]?.name).toBe('posts_select_own');
	});

		it('should accept INSERT policies without a usingExpression and default it to {}', async () => {
			let sessionUpdateHandler: ((n: any) => void) | undefined;

			const toolPolicy = {
				name: 'posts_insert_own',
				command: ['INSERT'],
				description: 'Allow users to insert their own posts',
				roles: ['authenticated'],
				withCheckExpression: {
					_eq: {
						user_id: { _session_var: 'user_id' },
					},
				},
			};

			auggieCreateMock.mockResolvedValueOnce({
				onSessionUpdate: vi.fn((handler: any) => {
					sessionUpdateHandler = handler;
				}),
				prompt: vi.fn(() => {
					setTimeout(() => {
						sessionUpdateHandler?.({
							update: {
								sessionUpdate: 'tool_call',
								toolCallId: 'tc_insert_1',
								title: 'generate_full_policy',
								rawInput: JSON.stringify(toolPolicy),
							},
						});
					}, 0);
					return Promise.resolve('');
				}),
				close: vi.fn().mockResolvedValue(undefined),
			});

			const options: GenerateFullPolicyOptions = {
				apiKey: 'test-api-key',
				prompt: 'Users can insert their own posts',
				tableName: 'posts',
			};

			const result = await generateFullPolicy(options);
			expect(result.policies).toHaveLength(1);
			expect(result.policies[0]?.command).toEqual(['INSERT']);
			expect(result.policies[0]?.usingExpression).toEqual({});
			expect(result.policies[0]?.withCheckExpression).toBeDefined();
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
          { name: 'content', type: 'text' },
        ],
      },
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
      existingPolicies: ['posts_select_own', 'posts_insert_own'],
    };

    const result = await generateFullPolicy(options);

    expect(result).toBeDefined();
    expect(result.policies).toHaveLength(1);
  });

  it('should handle API errors gracefully', async () => {
    // Mock an error
    auggieCreateMock.mockResolvedValueOnce({
      onSessionUpdate: vi.fn(),
      prompt: vi.fn().mockRejectedValue(new Error('API Error')),
      close: vi.fn().mockResolvedValue(undefined),
    } as any);

    const options: GenerateFullPolicyOptions = {
      apiKey: 'test-api-key',
      prompt: 'Test prompt',
      tableName: 'posts',
    };

    await expect(generateFullPolicy(options)).rejects.toThrow('API Error');
  });

  it('should use custom model when provided', async () => {
    const options: GenerateFullPolicyOptions = {
      apiKey: 'test-api-key',
      prompt: 'Users can view posts',
      tableName: 'posts',
      model: 'gpt5',
    };

    const result = await generateFullPolicy(options);

    expect(result).toBeDefined();
    expect(auggieCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt5' })
    );
  });

  it('should use custom API URL when provided', async () => {
    // Ensure the env var does not override the explicit option.
    delete process.env.AUGMENT_API_URL;

    const options: GenerateFullPolicyOptions = {
      apiKey: 'test-api-key',
      apiUrl: 'https://custom-api.example.com',
      prompt: 'Users can view posts',
      tableName: 'posts',
    };

    const result = await generateFullPolicy(options);

    expect(result).toBeDefined();
    expect(auggieCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiUrl: 'https://custom-api.example.com' })
    );
  });

  it('should generate policy with both USING and WITH CHECK expressions', async () => {

    mockAuggieClient(
      JSON.stringify({
        name: 'posts_insert_own',
        command: ['INSERT'],
        description: 'Allow users to insert their own posts',
        roles: ['authenticated'],
        usingExpression: {
          _eq: { user_id: { _session_var: 'user_id' } },
        },
        withCheckExpression: {
          _eq: { user_id: { _session_var: 'user_id' } },
        },
      })
    );

    const options: GenerateFullPolicyOptions = {
      apiKey: 'test-api-key',
      prompt: 'Users can insert their own posts',
      tableName: 'posts',
    };

    const result = await generateFullPolicy(options);

    expect(result.policies[0].withCheckExpression).toBeDefined();
  });

  it('should handle multiple policies from CRUD prompt', async () => {

    mockAuggieClient(
      JSON.stringify([
        {
          name: 'posts_select_own',
          command: ['SELECT'],
          description: 'Allow users to view their own posts',
          roles: ['authenticated'],
          usingExpression: { _eq: { user_id: { _session_var: 'user_id' } } },
        },
        {
          name: 'posts_insert_own',
          command: ['INSERT'],
          description: 'Allow users to insert their own posts',
          roles: ['authenticated'],
          usingExpression: { _eq: { user_id: { _session_var: 'user_id' } } },
        },
        {
          name: 'posts_update_own',
          command: ['UPDATE'],
          description: 'Allow users to update their own posts',
          roles: ['authenticated'],
          usingExpression: { _eq: { user_id: { _session_var: 'user_id' } } },
        },
        {
          name: 'posts_delete_own',
          command: ['DELETE'],
          description: 'Allow users to delete their own posts',
          roles: ['authenticated'],
          usingExpression: { _eq: { user_id: { _session_var: 'user_id' } } },
        },
      ])
    );

    const options: GenerateFullPolicyOptions = {
      apiKey: 'test-api-key',
      prompt: 'Users can CRUD their own posts',
      tableName: 'posts',
    };

    const result = await generateFullPolicy(options);

    expect(result.policies).toHaveLength(4);
    expect(result.policies.map((p) => p.command[0])).toEqual(['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
  });
});

