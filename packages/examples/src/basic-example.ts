/**
 * Basic example - Simple user-owned resources
 */

import { createContainer } from '@speajus/rlsify-core';
import type { RLSPolicyConfig } from '@speajus/rlsify-types';

async function main() {
  console.log('🔒 RLSify Basic Example\n');

  // Create DI container
  const container = createContainer();
  const generator = container.getPolicyGenerator();

  // Define policy configuration
  const config: RLSPolicyConfig = {
    version: '1.0',
    table: 'posts',
    schema: 'public',
    policies: [
      {
        name: 'posts_select_own',
        command: 'SELECT',
        using: 'user_id = auth.uid()',
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
        withCheck: 'user_id = auth.uid()',
      },
      {
        name: 'posts_delete_own',
        command: 'DELETE',
        using: 'user_id = auth.uid()',
      },
    ],
    enableRLS: true,
  };

  // Generate SQL
  const result = await generator.generate(config);

  // Check validation
  if (!result.validation.valid) {
    console.error('❌ Validation errors:');
    result.validation.errors.forEach((error) => {
      console.error(`  - ${error.field}: ${error.message}`);
    });
    return;
  }

  // Print generated SQL
  console.log('✅ Generated SQL:\n');
  result.statements.forEach((stmt) => {
    console.log(`-- ${stmt.description}`);
    console.log(stmt.sql);
    console.log();
  });
}

main().catch(console.error);

