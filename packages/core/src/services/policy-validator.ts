/**
 * PolicyValidator - Validates RLS policy configurations
 */

import type {
  RLSPolicyConfig,
  ValidationResult,
  ValidationError,
  SchemaInfo,
} from '@speajus/rlsify-types';
import { JoinResolver } from './join-resolver.js';

export class PolicyValidator {
  constructor(private joinResolver: JoinResolver) {}

  /**
   * Validate RLS policy configuration
   */
  async validate(
    config: RLSPolicyConfig,
    schemaInfo?: SchemaInfo
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Validate version
    if (!config.version) {
      errors.push({
        field: 'version',
        message: 'Configuration version is required',
        code: 'MISSING_VERSION',
      });
    }

    // Validate table name
    if (!config.table || config.table.trim() === '') {
      errors.push({
        field: 'table',
        message: 'Table name is required',
        code: 'MISSING_TABLE',
      });
    }

    // Validate policies array
    if (!config.policies || config.policies.length === 0) {
      errors.push({
        field: 'policies',
        message: 'At least one policy is required',
        code: 'MISSING_POLICIES',
      });
    } else {
      // Validate each policy
      config.policies.forEach((policy, index) => {
        this.validatePolicy(policy, index, errors, warnings);
      });
    }

    // Validate joins if present
    if (config.joins && config.joins.length > 0) {
      if (!schemaInfo) {
        warnings.push({
          field: 'joins',
          message: 'Joins specified but no schema info provided for validation',
          code: 'MISSING_SCHEMA_INFO',
        });
      } else {
        const joinValidation = this.joinResolver.validateJoins(
          config.table,
          config.joins,
          schemaInfo
        );

        if (!joinValidation.valid) {
          joinValidation.errors.forEach((error) => {
            errors.push({
              field: 'joins',
              message: error,
              code: 'INVALID_JOIN',
            });
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate individual policy
   */
  private validatePolicy(
    policy: any,
    index: number,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    const prefix = `policies[${index}]`;

    // Validate name
    if (!policy.name || policy.name.trim() === '') {
      errors.push({
        field: `${prefix}.name`,
        message: 'Policy name is required',
        code: 'MISSING_POLICY_NAME',
      });
    }

    // Validate command
    const validCommands = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL'];
    if (!policy.command || !validCommands.includes(policy.command)) {
      errors.push({
        field: `${prefix}.command`,
        message: `Invalid command. Must be one of: ${validCommands.join(', ')}`,
        code: 'INVALID_COMMAND',
      });
    }

    // Validate USING clause for applicable commands
    if (['SELECT', 'UPDATE', 'DELETE', 'ALL'].includes(policy.command)) {
      if (!policy.using) {
        warnings.push({
          field: `${prefix}.using`,
          message: `USING clause recommended for ${policy.command} command`,
          code: 'MISSING_USING',
        });
      }
    }

    // Validate WITH CHECK clause for applicable commands
    if (['INSERT', 'UPDATE', 'ALL'].includes(policy.command)) {
      if (!policy.withCheck && !policy.using) {
        warnings.push({
          field: `${prefix}.withCheck`,
          message: `WITH CHECK or USING clause recommended for ${policy.command} command`,
          code: 'MISSING_WITH_CHECK',
        });
      }
    }

    // Validate roles if provided
    if (policy.roles && !Array.isArray(policy.roles)) {
      errors.push({
        field: `${prefix}.roles`,
        message: 'Roles must be an array',
        code: 'INVALID_ROLES',
      });
    }
  }
}

