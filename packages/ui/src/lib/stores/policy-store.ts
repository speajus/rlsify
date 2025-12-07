/**
 * Policy configuration store
 */

import { writable } from 'svelte/store';
import type { RLSPolicyConfig, JoinDefinition, PolicyDefinition } from '@speajus/rlsify-types';

const initialConfig: RLSPolicyConfig = {
  version: '1.0',
  table: '',
  policies: [],
  enableRLS: true,
  joins: [],
};

export const policyConfig = writable<RLSPolicyConfig>(initialConfig);

export function addPolicy() {
  policyConfig.update((config) => ({
    ...config,
    policies: [
      ...config.policies,
      {
        name: '',
        command: 'SELECT',
        using: '',
      },
    ],
  }));
}

export function removePolicy(index: number) {
  policyConfig.update((config) => ({
    ...config,
    policies: config.policies.filter((_, i) => i !== index),
  }));
}

export function updateTable(table: string) {
  policyConfig.update((config) => ({
    ...config,
    table,
  }));
}

export function resetConfig() {
  policyConfig.set(initialConfig);
}

export function loadConfig(config: RLSPolicyConfig) {
  policyConfig.set(config);
}

export function updateJoins(joins: JoinDefinition[]) {
  policyConfig.update((config) => ({
    ...config,
    joins,
  }));
}

export function exportConfig(): string {
  let config: RLSPolicyConfig = initialConfig;
  const unsubscribe = policyConfig.subscribe((c) => {
    config = c;
  });
  unsubscribe();
  return JSON.stringify(config, null, 2);
}

/**
 * Load an example policy for a specific table
 */
export function loadExamplePolicy(policy: PolicyDefinition, table: string) {
  policyConfig.update((config) => ({
    ...config,
    table,
    policies: [...config.policies, policy],
  }));
}

