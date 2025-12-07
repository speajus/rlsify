/**
 * Basic Supabase example
 */

import { SupabaseAdapter } from '@speajus/rlsify-supabase';
import type { SupabasePolicyConfig } from '@speajus/rlsify-types';
import { config } from 'dotenv';

config();

async function main() {
  console.log('🔒 RLSify Supabase Basic Example\n');

  // Create Supabase adapter
  const adapter = new SupabaseAdapter({
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_SERVICE_KEY!,
  });

  // Define policy configuration with Supabase auth helpers
  const policyConfig: SupabasePolicyConfig = {
    version: '1.0',
    table: 'profiles',
    schema: 'public',
    useAuthHelpers: true,
    policies: [
      {
        name: 'profiles_select_own',
        command: 'SELECT',
        using: 'id = auth.uid()',
      },
      {
        name: 'profiles_update_own',
        command: 'UPDATE',
        using: 'id = auth.uid()',
        withCheck: 'id = auth.uid()',
      },
    ],
    enableRLS: true,
  };

  // Generate policies
  const result = await adapter.generatePolicies(policyConfig);

  if (!result.validation.valid) {
    console.error('❌ Validation errors:');
    result.validation.errors.forEach((error) => {
      console.error(`  - ${error.message}`);
    });
    return;
  }

  console.log('✅ Generated Supabase SQL:\n');
  result.statements.forEach((stmt) => {
    console.log(`-- ${stmt.description}`);
    console.log(stmt.sql);
    console.log();
  });
}

main().catch(console.error);

