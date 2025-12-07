/**
 * Supabase migration generation example
 */

import { SupabaseAdapter } from '@speajus/rlsify-supabase';
import type { SupabasePolicyConfig } from '@speajus/rlsify-types';
import { config } from 'dotenv';

config();

async function main() {
  console.log('📦 RLSify Supabase Migration Example\n');

  const adapter = new SupabaseAdapter({
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_SERVICE_KEY!,
  });

  const policyConfig: SupabasePolicyConfig = {
    version: '1.0',
    table: 'posts',
    schema: 'public',
    useAuthHelpers: true,
    policies: [
      {
        name: 'posts_select_public_or_own',
        command: 'SELECT',
        using: 'is_public = true OR user_id = auth.uid()',
      },
      {
        name: 'posts_insert_own',
        command: 'INSERT',
        withCheck: 'user_id = auth.uid()',
      },
      {
        name: 'posts_update_own',
        command: 'UPDATE',
        using: 'user_id = auth.uid()',
      },
      {
        name: 'posts_delete_own',
        command: 'DELETE',
        using: 'user_id = auth.uid()',
      },
    ],
    enableRLS: true,
  };

  // Generate Supabase migration
  const migration = await adapter.generateMigration(policyConfig, 'add_posts_rls');

  console.log('✅ Generated Supabase Migration:\n');
  console.log(`Name: ${migration.name}`);
  console.log(`Timestamp: ${migration.timestamp}\n`);

  console.log('--- UP Migration ---');
  console.log(migration.up);
  console.log();

  console.log('--- DOWN Migration ---');
  console.log(migration.down);
  console.log();

  console.log('To write migration:');
  console.log(`  await adapter.writeMigration(policyConfig, 'add_posts_rls', './supabase/migrations');`);
}

main().catch(console.error);

