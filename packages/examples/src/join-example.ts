/**
 * Join example - Policies with table joins
 */

import { createContainer } from '@speajus/rlsify-core';
import type { RLSPolicyConfig, SchemaInfo } from '@speajus/rlsify-types';

async function main() {
  console.log('🔗 RLSify Join Example\n');

  const container = createContainer();
  const generator = container.getPolicyGenerator();

  // Example: Comments can only be viewed if user can view the parent post
  const config: RLSPolicyConfig = {
    version: '1.0',
    table: 'comments',
    schema: 'public',
    joins: [
      {
        table: 'posts',
        type: 'INNER',
        // Auto-detect FK: comments.post_id = posts.id
      },
    ],
    policies: [
      {
        name: 'comments_select_if_post_visible',
        command: 'SELECT',
        using: 'posts.user_id = auth.uid() OR posts.is_public = true',
      },
      {
        name: 'comments_insert_own',
        command: 'INSERT',
        withCheck: 'user_id = auth.uid()',
      },
    ],
    enableRLS: true,
  };

  // Mock schema info for demonstration
  const schemaInfo: SchemaInfo = {
    tables: [
      {
        schema: 'public',
        name: 'comments',
        columns: [
          { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
          { name: 'post_id', type: 'uuid', nullable: false, isPrimaryKey: false },
          { name: 'user_id', type: 'uuid', nullable: false, isPrimaryKey: false },
          { name: 'content', type: 'text', nullable: false, isPrimaryKey: false },
        ],
        foreignKeys: [
          {
            sourceTable: 'comments',
            sourceColumn: 'post_id',
            targetTable: 'posts',
            targetColumn: 'id',
          },
        ],
      },
      {
        schema: 'public',
        name: 'posts',
        columns: [
          { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
          { name: 'user_id', type: 'uuid', nullable: false, isPrimaryKey: false },
          { name: 'is_public', type: 'boolean', nullable: false, isPrimaryKey: false },
        ],
        foreignKeys: [],
      },
    ],
  };

  // Generate SQL with joins
  const result = await generator.generate(config, schemaInfo);

  if (!result.validation.valid) {
    console.error('❌ Validation errors:');
    result.validation.errors.forEach((error) => {
      console.error(`  - ${error.message}`);
    });
    return;
  }

  console.log('✅ Generated SQL with auto-detected joins:\n');
  result.statements.forEach((stmt) => {
    console.log(`-- ${stmt.description}`);
    console.log(stmt.sql);
    console.log();
  });
}

main().catch(console.error);

