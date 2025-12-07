/**
 * Supabase auth example with JWT claims
 */

import { SupabaseAdapter } from '@speajus/rlsify-supabase';
import type { SupabasePolicyConfig } from '@speajus/rlsify-types';
import { config } from 'dotenv';

config();

async function main() {
  console.log('🔐 RLSify Supabase Auth Example\n');

  const adapter = new SupabaseAdapter({
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_SERVICE_KEY!,
  });

  // Example: Multi-tenant SaaS with organization-based access
  const policyConfig: SupabasePolicyConfig = {
    version: '1.0',
    table: 'projects',
    schema: 'public',
    useAuthHelpers: true,
    policies: [
      {
        name: 'projects_select_org',
        command: 'SELECT',
        using: "organization_id = (auth.jwt() ->> 'organization_id')::uuid",
      },
      {
        name: 'projects_insert_org',
        command: 'INSERT',
        withCheck: "organization_id = (auth.jwt() ->> 'organization_id')::uuid",
      },
      {
        name: 'projects_update_org_admin',
        command: 'UPDATE',
        using: `
          organization_id = (auth.jwt() ->> 'organization_id')::uuid
          AND (auth.jwt() ->> 'role') = 'admin'
        `,
      },
      {
        name: 'projects_delete_org_admin',
        command: 'DELETE',
        using: `
          organization_id = (auth.jwt() ->> 'organization_id')::uuid
          AND (auth.jwt() ->> 'role') = 'admin'
        `,
      },
    ],
    enableRLS: true,
  };

  const result = await adapter.generatePolicies(policyConfig);

  console.log('✅ Generated Supabase SQL with JWT claims:\n');
  result.statements.forEach((stmt) => {
    console.log(`-- ${stmt.description}`);
    console.log(stmt.sql);
    console.log();
  });
}

main().catch(console.error);

