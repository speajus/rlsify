/**
 * ConfigLoader - Loads RLS policy configurations from PostgreSQL
 */

import type { RLSPolicyConfig } from '@speajus/rlsify-types';
import type { DatabaseConnection } from './schema-introspector.js';

export class ConfigLoader {
  constructor(private connection?: DatabaseConnection) {}

  /**
   * Load configuration from database by name
   */
  async loadConfig(name: string): Promise<RLSPolicyConfig> {
    if (!this.connection) {
      throw new Error('Database connection required for loading configurations');
    }

    const result = await this.connection.query<{ config: any }>(
      `SELECT load_rls_config($1) as config`,
      [name]
    );

    if (!result.rows[0] || !result.rows[0].config) {
      throw new Error(`Configuration '${name}' not found`);
    }

    return result.rows[0].config as RLSPolicyConfig;
  }

  /**
   * Save configuration to database
   */
  async saveConfig(config: RLSPolicyConfig, name: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Database connection required for saving configurations');
    }

    await this.connection.query(
      `INSERT INTO rls_policy_configs (name, config, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (name) 
       DO UPDATE SET config = $2, updated_at = NOW()`,
      [name, JSON.stringify(config)]
    );
  }

  /**
   * List all configuration names
   */
  async listConfigs(): Promise<string[]> {
    if (!this.connection) {
      throw new Error('Database connection required for listing configurations');
    }

    const result = await this.connection.query<{ name: string }>(
      `SELECT name FROM rls_policy_configs ORDER BY name`
    );

    return result.rows.map((row) => row.name);
  }

  /**
   * Delete configuration by name
   */
  async deleteConfig(name: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Database connection required for deleting configurations');
    }

    await this.connection.query(
      `DELETE FROM rls_policy_configs WHERE name = $1`,
      [name]
    );
  }

  /**
   * Load configuration from JSON file
   */
  async loadFromFile(filePath: string): Promise<RLSPolicyConfig> {
    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as RLSPolicyConfig;
  }

  /**
   * Save configuration to JSON file
   */
  async saveToFile(config: RLSPolicyConfig, filePath: string): Promise<void> {
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');
  }
}

