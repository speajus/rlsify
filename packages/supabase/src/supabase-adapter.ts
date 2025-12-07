/**
 * SupabaseAdapter - Main adapter for Supabase integration
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  SupabasePolicyConfig,
  PolicyGenerationResult,
  MigrationFile,
} from '@speajus/rlsify-types';
import { SupabasePolicyGenerator } from './supabase-policy-generator.js';
import { SupabaseMigrationGenerator } from './supabase-migration-generator.js';
import { SupabaseSchemaIntrospector } from './supabase-schema-introspector.js';

export interface SupabaseAdapterOptions {
  supabaseUrl: string;
  supabaseKey: string;
  client?: SupabaseClient;
}

export class SupabaseAdapter {
  private client: SupabaseClient;
  private policyGenerator: SupabasePolicyGenerator;
  private migrationGenerator: SupabaseMigrationGenerator;
  private schemaIntrospector: SupabaseSchemaIntrospector;

  constructor(options: SupabaseAdapterOptions) {
    this.client = options.client || createClient(options.supabaseUrl, options.supabaseKey);
    this.policyGenerator = new SupabasePolicyGenerator();
    this.migrationGenerator = new SupabaseMigrationGenerator(this.policyGenerator);
    this.schemaIntrospector = new SupabaseSchemaIntrospector(this.client);
  }

  /**
   * Generate RLS policies with Supabase auth helpers
   */
  async generatePolicies(config: SupabasePolicyConfig): Promise<PolicyGenerationResult> {
    const schemaInfo = await this.schemaIntrospector.getSchemaInfo(config.schema);
    return this.policyGenerator.generate(config, schemaInfo);
  }

  /**
   * Apply policies to Supabase database
   */
  async applyPolicies(config: SupabasePolicyConfig): Promise<void> {
    const result = await this.generatePolicies(config);

    if (!result.validation.valid) {
      throw new Error(
        `Invalid configuration: ${result.validation.errors.map((e) => e.message).join(', ')}`
      );
    }

    // Execute each SQL statement
    for (const statement of result.statements) {
      const { error } = await this.client.rpc('exec_sql', { sql: statement.sql });
      
      if (error) {
        throw new Error(`Failed to execute SQL: ${error.message}\n${statement.sql}`);
      }
    }
  }

  /**
   * Generate Supabase migration file
   */
  async generateMigration(
    config: SupabasePolicyConfig,
    name?: string
  ): Promise<MigrationFile> {
    return this.migrationGenerator.generateSupabaseMigration(config, name);
  }

  /**
   * Write migration to Supabase migrations directory
   */
  async writeMigration(
    config: SupabasePolicyConfig,
    name?: string,
    directory: string = './supabase/migrations'
  ): Promise<string> {
    const migration = await this.generateMigration(config, name);
    return this.migrationGenerator.writeMigrationFile(migration, directory);
  }

  /**
   * Load configuration from Supabase database
   */
  async loadConfig(name: string): Promise<SupabasePolicyConfig> {
    const { data, error } = await this.client
      .rpc('load_rls_config', { config_name: name });

    if (error) {
      throw new Error(`Failed to load configuration: ${error.message}`);
    }

    if (!data) {
      throw new Error(`Configuration '${name}' not found`);
    }

    return data as SupabasePolicyConfig;
  }

  /**
   * Save configuration to Supabase database
   */
  async saveConfig(config: SupabasePolicyConfig, name: string): Promise<void> {
    const { error } = await this.client
      .from('rls_policy_configs')
      .upsert({
        name,
        config,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Failed to save configuration: ${error.message}`);
    }
  }

  /**
   * Get Supabase client
   */
  getClient(): SupabaseClient {
    return this.client;
  }

  /**
   * Get schema introspector
   */
  getSchemaIntrospector(): SupabaseSchemaIntrospector {
    return this.schemaIntrospector;
  }
}

