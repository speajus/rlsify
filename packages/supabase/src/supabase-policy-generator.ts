/**
 * SupabasePolicyGenerator - Generates Supabase-optimized RLS policies
 */

import {
  PolicyGenerator,
  PolicyValidator,
  JoinResolver,
} from '@speajus/rlsify-core';
import type { SupabasePolicyConfig, PolicyGenerationResult } from '@speajus/rlsify-types';

export class SupabasePolicyGenerator extends PolicyGenerator {
  constructor() {
    const joinResolver = new JoinResolver();
    const validator = new PolicyValidator(joinResolver);
    super(validator, joinResolver);
  }

  /**
   * Generate policies with Supabase auth helpers
   */
  async generate(
    config: SupabasePolicyConfig,
    schemaInfo?: any
  ): Promise<PolicyGenerationResult> {
    // Transform config to use Supabase auth helpers if enabled
    const transformedConfig = config.useAuthHelpers !== false
      ? this.transformAuthHelpers(config)
      : config;

    return super.generate(transformedConfig, schemaInfo);
  }

  /**
   * Transform generic auth functions to Supabase-specific ones
   */
  private transformAuthHelpers(config: SupabasePolicyConfig): SupabasePolicyConfig {
    const transformed = JSON.parse(JSON.stringify(config));

    for (const policy of transformed.policies) {
      if (policy.using) {
        policy.using = this.replaceAuthFunctions(policy.using);
      }
      if (policy.withCheck) {
        policy.withCheck = this.replaceAuthFunctions(policy.withCheck);
      }
    }

    return transformed;
  }

  /**
   * Replace generic auth functions with Supabase equivalents
   */
  private replaceAuthFunctions(expression: string): string {
    return expression
      .replace(/auth\.user_id\(\)/g, 'auth.uid()')
      .replace(/current_user_id\(\)/g, 'auth.uid()')
      .replace(/current_user_role\(\)/g, 'auth.role()');
  }
}

