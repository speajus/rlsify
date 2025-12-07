/**
 * SupabaseMigrationGenerator - Generates Supabase-compatible migrations
 */

import { MigrationGenerator } from '@speajus/rlsify-core';
import type { SupabasePolicyConfig, MigrationFile } from '@speajus/rlsify-types';
import { SupabasePolicyGenerator } from './supabase-policy-generator.js';

export class SupabaseMigrationGenerator extends MigrationGenerator {
  constructor(policyGenerator?: SupabasePolicyGenerator) {
    super(policyGenerator || new SupabasePolicyGenerator());
  }

  /**
   * Generate Supabase migration with proper timestamp format
   */
  async generateSupabaseMigration(
    config: SupabasePolicyConfig,
    name?: string
  ): Promise<MigrationFile> {
    const migration = await this.generateMigration(config, name);
    
    // Supabase uses timestamp format: YYYYMMDDHHMMSS
    const supabaseTimestamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14);

    const migrationName = name || `rls_${config.table}`;

    return {
      ...migration,
      name: `${supabaseTimestamp}_${migrationName}`,
    };
  }
}

