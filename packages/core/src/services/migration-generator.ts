/**
 * MigrationGenerator - Generates migration files for RLS policies
 */

import type {
  RLSPolicyConfig,
  MigrationFile,
} from '@speajus/rlsify-types';
import { PolicyGenerator } from './policy-generator.js';

export class MigrationGenerator {
  constructor(private policyGenerator: PolicyGenerator) {}

  /**
   * Generate migration file from configuration
   */
  async generateMigration(
    config: RLSPolicyConfig,
    name?: string
  ): Promise<MigrationFile> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const migrationName = name || `create_rls_policies_${config.table}`;

    // Generate up migration (create policies)
    const result = await this.policyGenerator.generate(config);
    const upSQL = result.statements.map((stmt) => stmt.sql).join('\n\n');

    // Generate down migration (drop policies)
    const downSQL = this.generateDownMigration(config);

    return {
      name: `${timestamp}_${migrationName}`,
      timestamp,
      up: upSQL,
      down: downSQL,
      ...(config.metadata?.description && { description: config.metadata.description }),
    };
  }

  /**
   * Generate down migration (rollback)
   */
  private generateDownMigration(config: RLSPolicyConfig): string {
    const schema = config.schema || 'public';
    const table = `${schema}.${config.table}`;
    const statements: string[] = [];

    // Drop all policies
    for (const policy of config.policies) {
      statements.push(`DROP POLICY IF EXISTS ${policy.name} ON ${table};`);
    }

    // Disable RLS if it was enabled
    if (config.enableRLS !== false) {
      statements.push(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;`);
    }

    return statements.join('\n');
  }

  /**
   * Generate Supabase-compatible migration
   */
  async generateSupabaseMigration(
    config: RLSPolicyConfig,
    name?: string
  ): Promise<MigrationFile> {
    const migration = await this.generateMigration(config, name);
    
    // Supabase uses timestamp format: YYYYMMDDHHMMSS
    const supabaseTimestamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14);

    return {
      ...migration,
      name: `${supabaseTimestamp}_${name || `rls_${config.table}`}.sql`,
    };
  }

  /**
   * Write migration file to disk
   */
  async writeMigrationFile(
    migration: MigrationFile,
    directory: string
  ): Promise<string> {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Ensure directory exists
    await fs.mkdir(directory, { recursive: true });

    // Write migration file
    const filePath = path.join(directory, `${migration.name}.sql`);
    const content = this.formatMigrationFile(migration);
    await fs.writeFile(filePath, content, 'utf-8');

    return filePath;
  }

  /**
   * Format migration file content
   */
  private formatMigrationFile(migration: MigrationFile): string {
    let content = `-- Migration: ${migration.name}\n`;
    
    if (migration.description) {
      content += `-- Description: ${migration.description}\n`;
    }
    
    content += `-- Created: ${migration.timestamp}\n\n`;
    content += `-- Up Migration\n`;
    content += migration.up;
    content += `\n\n-- Down Migration\n`;
    content += `-- ${migration.down.split('\n').join('\n-- ')}`;

    return content;
  }
}

