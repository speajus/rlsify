import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  policyConfig,
  addGeneratedPolicy,
  addGeneratedPolicies,
  resetConfig
} from './policy-store.js';
import type { PolicyDefinition } from '@speajus/rlsify-types';

describe('policy-store', () => {
  beforeEach(() => {
    // Reset the store before each test
    resetConfig();
  });

  describe('addGeneratedPolicy', () => {
    it('should add a single AI-generated policy to the config', () => {
      const policy: PolicyDefinition = {
        name: 'posts_select_own',
        command: ['SELECT'],
        description: 'Allow users to view only their own posts',
        roles: ['authenticated'],
        usingExpression: {
          _eq: {
            user_id: { _session_var: 'user_id' }
          }
        }
      };

      addGeneratedPolicy(policy);

      const config = get(policyConfig);
      expect(config.policies).toHaveLength(1);
      expect(config.policies[0]).toEqual(policy);
    });

    it('should append to existing policies', () => {
      const policy1: PolicyDefinition = {
        name: 'posts_select_own',
        command: ['SELECT'],
        usingExpression: { _eq: { user_id: { _session_var: 'user_id' } } }
      };

      const policy2: PolicyDefinition = {
        name: 'posts_insert_own',
        command: ['INSERT'],
        usingExpression: { _eq: { user_id: { _session_var: 'user_id' } } }
      };

      addGeneratedPolicy(policy1);
      addGeneratedPolicy(policy2);

      const config = get(policyConfig);
      expect(config.policies).toHaveLength(2);
      expect(config.policies[0].name).toBe('posts_select_own');
      expect(config.policies[1].name).toBe('posts_insert_own');
    });

    it('should preserve all policy fields', () => {
      const policy: PolicyDefinition = {
        name: 'posts_update_own',
        command: ['UPDATE'],
        description: 'Allow users to update their own posts',
        roles: ['authenticated', 'editor'],
        usingExpression: {
          _eq: { user_id: { _session_var: 'user_id' } }
        },
        withCheckExpression: {
          _eq: { user_id: { _session_var: 'user_id' } }
        },
        permissive: true
      };

      addGeneratedPolicy(policy);

      const config = get(policyConfig);
      expect(config.policies[0]).toEqual(policy);
    });
  });

  describe('addGeneratedPolicies', () => {
    it('should add multiple AI-generated policies at once', () => {
      const policies: PolicyDefinition[] = [
        {
          name: 'posts_select_own',
          command: ['SELECT'],
          usingExpression: { _eq: { user_id: { _session_var: 'user_id' } } }
        },
        {
          name: 'posts_insert_own',
          command: ['INSERT'],
          usingExpression: { _eq: { user_id: { _session_var: 'user_id' } } }
        },
        {
          name: 'posts_update_own',
          command: ['UPDATE'],
          usingExpression: { _eq: { user_id: { _session_var: 'user_id' } } }
        },
        {
          name: 'posts_delete_own',
          command: ['DELETE'],
          usingExpression: { _eq: { user_id: { _session_var: 'user_id' } } }
        }
      ];

      addGeneratedPolicies(policies);

      const config = get(policyConfig);
      expect(config.policies).toHaveLength(4);
      expect(config.policies.map(p => p.name)).toEqual([
        'posts_select_own',
        'posts_insert_own',
        'posts_update_own',
        'posts_delete_own'
      ]);
    });

    it('should handle empty array', () => {
      addGeneratedPolicies([]);

      const config = get(policyConfig);
      expect(config.policies).toHaveLength(0);
    });

    it('should append to existing policies', () => {
      const existingPolicy: PolicyDefinition = {
        name: 'existing_policy',
        command: ['SELECT'],
        usingExpression: { _eq: { id: 1 } }
      };

      addGeneratedPolicy(existingPolicy);

      const newPolicies: PolicyDefinition[] = [
        {
          name: 'posts_select_own',
          command: ['SELECT'],
          usingExpression: { _eq: { user_id: { _session_var: 'user_id' } } }
        },
        {
          name: 'posts_insert_own',
          command: ['INSERT'],
          usingExpression: { _eq: { user_id: { _session_var: 'user_id' } } }
        }
      ];

      addGeneratedPolicies(newPolicies);

      const config = get(policyConfig);
      expect(config.policies).toHaveLength(3);
      expect(config.policies[0].name).toBe('existing_policy');
      expect(config.policies[1].name).toBe('posts_select_own');
      expect(config.policies[2].name).toBe('posts_insert_own');
    });
  });
});

