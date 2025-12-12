/**
 * Policy configuration store
 * Uses Connect-Web client to communicate with gRPC backend
 */

import { writable, derived } from 'svelte/store';
import type { RLSPolicyConfig, JoinDefinition, PolicyDefinition, SavedPolicy, ExistingRLSPolicy } from '@speajus/rlsify-types';
import { policyClient } from '../api/client.js';

const initialConfig: RLSPolicyConfig = {
  version: '1.0',
  table: '',
  policies: [],
  enableRLS: true,
  joins: [],
};

interface PolicyState {
  config: RLSPolicyConfig;
  savedPolicyId: string | null;
  savedPolicies: SavedPolicy[];
  existingPolicies: ExistingRLSPolicy[];
  loading: boolean;
  saving: boolean;
  error: string | null;
}

const state = writable<PolicyState>({
  config: initialConfig,
  savedPolicyId: null,
  savedPolicies: [],
  existingPolicies: [],
  loading: false,
  saving: false,
  error: null,
});

// Derived stores for easy access
export const policyConfig = derived(state, ($state) => $state.config);
export const savedPolicies = derived(state, ($state) => $state.savedPolicies);
export const existingPolicies = derived(state, ($state) => $state.existingPolicies);
export const policyLoading = derived(state, ($state) => $state.loading);
export const policySaving = derived(state, ($state) => $state.saving);
export const policyError = derived(state, ($state) => $state.error);
export const currentPolicyId = derived(state, ($state) => $state.savedPolicyId);

export function addPolicy() {
  state.update((s) => ({
    ...s,
    config: {
      ...s.config,
      policies: [
        ...s.config.policies,
        {
          name: '',
          command: 'SELECT',
          using: '',
        },
      ],
    },
  }));
}

export function removePolicy(index: number) {
  state.update((s) => ({
    ...s,
    config: {
      ...s.config,
      policies: s.config.policies.filter((_, i) => i !== index),
    },
  }));
}

export function updatePolicy(index: number, field: string, value: unknown) {
  state.update((s) => {
    const policies = [...s.config.policies];
    policies[index] = { ...policies[index], [field]: value };
    return {
      ...s,
      config: {
        ...s.config,
        policies,
      },
    };
  });
}

export function updateTable(table: string) {
  state.update((s) => ({
    ...s,
    config: {
      ...s.config,
      table,
    },
  }));
}

export function resetConfig() {
  state.update((s) => ({
    ...s,
    config: initialConfig,
    savedPolicyId: null,
  }));
}

export function loadConfig(config: RLSPolicyConfig) {
  state.update((s) => ({
    ...s,
    config,
    savedPolicyId: null,
  }));
}

export function updateJoins(joins: JoinDefinition[]) {
  state.update((s) => ({
    ...s,
    config: {
      ...s.config,
      joins,
    },
  }));
}

export function exportConfig(): string {
  let config: RLSPolicyConfig = initialConfig;
  const unsubscribe = state.subscribe((s) => {
    config = s.config;
  });
  unsubscribe();
  return JSON.stringify(config, null, 2);
}

/**
 * Load an example policy for a specific table
 */
export function loadExamplePolicy(policy: PolicyDefinition, table: string) {
  state.update((s) => ({
    ...s,
    config: {
      ...s.config,
      table,
      policies: [...s.config.policies, policy],
    },
  }));
}

/**
 * Save policy to backend
 */
export async function savePolicy(description?: string): Promise<void> {
  state.update((s) => ({ ...s, saving: true, error: null }));

  try {
    let currentState: PolicyState | null = null;
    const unsubscribe = state.subscribe((s) => {
      currentState = s;
    });
    unsubscribe();

    if (!currentState) return;

    const response = await policyClient.savePolicy({
      config: convertToProtoConfig(currentState.config),
      id: currentState.savedPolicyId ?? undefined,
      description,
    });

    if (response.policy) {
      state.update((s) => ({
        ...s,
        savedPolicyId: response.policy?.id ?? null,
        saving: false,
      }));
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to save policy';
    state.update((s) => ({ ...s, error: errorMessage, saving: false }));
  }
}

/**
 * Load policies list from backend
 */
export async function fetchPolicies(tableFilter?: string): Promise<void> {
  state.update((s) => ({ ...s, loading: true, error: null }));

  try {
    const response = await policyClient.listPolicies({
      tableFilter,
      limit: 50,
      offset: 0,
    });

    state.update((s) => ({
      ...s,
      savedPolicies: response.policies as SavedPolicy[],
      loading: false,
    }));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to load policies';
    state.update((s) => ({ ...s, error: errorMessage, loading: false }));
  }
}

/**
 * Load a specific policy from backend
 */
export async function fetchPolicy(id: string): Promise<void> {
  state.update((s) => ({ ...s, loading: true, error: null }));

  try {
    const response = await policyClient.getPolicy({ id });

    if (response.policy?.config) {
      const config = convertFromProtoConfig(response.policy.config);
      state.update((s) => ({
        ...s,
        config,
        savedPolicyId: response.policy?.id ?? null,
        loading: false,
      }));
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to load policy';
    state.update((s) => ({ ...s, error: errorMessage, loading: false }));
  }
}

/**
 * Delete a policy from backend
 */
export async function deletePolicy(id: string): Promise<void> {
  state.update((s) => ({ ...s, loading: true, error: null }));

  try {
    await policyClient.deletePolicy({ id });

    state.update((s) => ({
      ...s,
      savedPolicies: s.savedPolicies.filter((p) => p.id !== id),
      savedPolicyId: s.savedPolicyId === id ? null : s.savedPolicyId,
      loading: false,
    }));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to delete policy';
    state.update((s) => ({ ...s, error: errorMessage, loading: false }));
  }
}

/**
 * Fetch existing RLS policies from the database (pg_policies view)
 */
export async function fetchExistingPolicies(schema?: string, table?: string): Promise<void> {
  state.update((s) => ({ ...s, loading: true, error: null }));

  try {
    const response = await policyClient.listExistingPolicies({
      schema: schema ?? 'public',
      table,
    });

    state.update((s) => ({
      ...s,
      existingPolicies: response.policies as ExistingRLSPolicy[],
      loading: false,
    }));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to load existing policies';
    state.update((s) => ({ ...s, error: errorMessage, loading: false }));
  }
}

/**
 * Import an existing RLS policy into the current config
 */
export function importExistingPolicy(policy: ExistingRLSPolicy): void {
  const newPolicy: PolicyDefinition = {
    name: policy.policyName,
    command: policy.command as 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL',
    using: policy.usingExpression ?? '',
    withCheck: policy.withCheckExpression,
    roles: [...policy.roles],
    permissive: policy.permissive,
  };

  state.update((s) => ({
    ...s,
    config: {
      ...s.config,
      table: s.config.table || policy.tableName,
      schema: s.config.schema || policy.schemaName,
      policies: [...s.config.policies, newPolicy],
    },
  }));
}

// Helper functions to convert between local and proto formats
function convertToProtoConfig(config: RLSPolicyConfig) {
  return {
    version: config.version,
    table: config.table,
    schema: config.schema,
    policies: config.policies.map((p) => ({
      name: p.name,
      command: mapCommandToProto(p.command),
      using: p.using,
      withCheck: p.withCheck,
      roles: p.roles ?? [],
      permissive: p.permissive ?? true,
    })),
    joins: (config.joins ?? []).map((j) => ({
      table: j.table,
      type: mapJoinTypeToProto(j.type),
      on: j.on,
      alias: j.alias,
    })),
    enableRls: config.enableRLS ?? true,
    forceRls: config.forceRLS ?? false,
  };
}

function convertFromProtoConfig(proto: SavedPolicy['config']): RLSPolicyConfig {
  return {
    version: proto?.version ?? '1.0',
    table: proto?.table ?? '',
    schema: proto?.schema,
    policies: (proto?.policies ?? []).map((p) => ({
      name: p.name,
      command: mapCommandFromProto(p.command),
      using: p.using,
      withCheck: p.withCheck,
      roles: [...p.roles],
      permissive: p.permissive,
    })),
    joins: (proto?.joins ?? []).map((j) => ({
      table: j.table,
      type: mapJoinTypeFromProto(j.type),
      on: j.on,
      alias: j.alias,
    })),
    enableRLS: proto?.enableRls ?? true,
    forceRLS: proto?.forceRls ?? false,
  };
}

function mapCommandToProto(cmd: string): number {
  const mapping: Record<string, number> = { SELECT: 1, INSERT: 2, UPDATE: 3, DELETE: 4, ALL: 5 };
  return mapping[cmd] ?? 5;
}

function mapCommandFromProto(cmd: number): 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL' {
  const mapping: Record<number, 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL'> = { 1: 'SELECT', 2: 'INSERT', 3: 'UPDATE', 4: 'DELETE', 5: 'ALL' };
  return mapping[cmd] ?? 'ALL';
}

function mapJoinTypeToProto(type?: string): number {
  const mapping: Record<string, number> = { INNER: 1, LEFT: 2, RIGHT: 3, FULL: 4 };
  return mapping[type ?? 'INNER'] ?? 1;
}

function mapJoinTypeFromProto(type: number): 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' {
  const mapping: Record<number, 'INNER' | 'LEFT' | 'RIGHT' | 'FULL'> = { 1: 'INNER', 2: 'LEFT', 3: 'RIGHT', 4: 'FULL' };
  return mapping[type] ?? 'INNER';
}

