/**
 * Migration example - Generate migration files
 */

import { createContainer } from '@speajus/rlsify-core';
import type { RLSPolicyConfig } from '@speajus/rlsify-types';

async function main() {
  console.log('📦 RLSify Migration Example\n');

  const container = createContainer();
  const migrationGenerator = container.getMigrationGenerator();

  const config: RLSPolicyConfig = {
    version: '1.0',
    table: 'products',
    schema: 'public',
    policies: [
      {
        name: 'products_select_all',
        command: 'SELECT',
        using: 'true',
      },
      {
        name: 'products_modify_admin',
        command: 'ALL',
        using: "(auth.jwt() ->> 'role') = 'admin'",
        roles: ['authenticated'],
      },
    ],
    enableRLS: true,
  };

  // Generate migration
  const migration = await migrationGenerator.generateMigration(config, 'add_products_rls');

  console.log('✅ Generated Migration:\n');
  console.log(`Name: ${migration.name}`);
  console.log(`Timestamp: ${migration.timestamp}\n`);

  console.log('--- UP Migration ---');
  console.log(migration.up);
  console.log();

  console.log('--- DOWN Migration ---');
  console.log(migration.down);
  console.log();

  // Optionally write to file
  console.log('To write migration to disk:');
  console.log(`  const path = await migrationGenerator.writeMigrationFile(migration, './migrations');`);
}

main().catch(console.error);

