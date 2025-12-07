/**
 * Apply policies directly to Supabase database
 * WARNING: This will modify your database!
 */

import { SupabaseAdapter } from '@speajus/rlsify-supabase';
import type { SupabasePolicyConfig } from '@speajus/rlsify-types';
import { config } from 'dotenv';

config();

async function main() {
  console.log('⚠️  RLSify Supabase Apply Example\n');
  console.log('WARNING: This will modify your Supabase database!\n');

  const adapter = new SupabaseAdapter({
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_SERVICE_KEY!,
  });

  const policyConfig: SupabasePolicyConfig = {
    version: '1.0',
    table: 'test_table',
    schema: 'public',
    useAuthHelpers: true,
    policies: [
      {
        name: 'test_select_all',
        command: 'SELECT',
        using: 'true',
      },
    ],
    enableRLS: true,
  };

  try {
    console.log('Applying policies to Supabase...\n');
    
    // This requires a custom exec_sql function in your Supabase database
    // See README for setup instructions
    await adapter.applyPolicies(policyConfig);
    
    console.log('✅ Policies applied successfully!');
  } catch (error) {
    console.error('❌ Failed to apply policies:');
    console.error(error);
    console.log('\nNote: You need to create the exec_sql function in your database.');
    console.log('See the Supabase package README for instructions.');
  }
}

main().catch(console.error);

