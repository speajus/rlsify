/**
 * Template example - Using pre-built templates
 */

import { createContainer } from '@speajus/rlsify-core';

async function main() {
  console.log('📝 RLSify Template Example\n');

  const container = createContainer();
  const templateRegistry = container.getTemplateRegistry();
  const generator = container.getPolicyGenerator();

  // List available templates
  console.log('Available templates:');
  templateRegistry.getAll().forEach((template) => {
    console.log(`  - ${template.id}: ${template.name}`);
  });
  console.log();

  // Apply user-owned template
  console.log('Applying "user-owned" template...\n');
  const config = templateRegistry.apply('user-owned', {
    table: 'documents',
    userColumn: 'created_by',
    authFunction: 'auth.uid()',
  });

  // Add version (templates don't include it)
  config.version = '1.0';

  // Generate SQL
  const result = await generator.generate(config);

  console.log('✅ Generated SQL:\n');
  result.statements.forEach((stmt) => {
    console.log(`-- ${stmt.description}`);
    console.log(stmt.sql);
    console.log();
  });

  // Try organization template
  console.log('\n--- Organization Template ---\n');
  const orgConfig = templateRegistry.apply('organization', {
    table: 'projects',
    orgColumn: 'organization_id',
    orgFunction: "(auth.jwt() ->> 'organization_id')",
  });
  orgConfig.version = '1.0';

  const orgResult = await generator.generate(orgConfig);
  orgResult.statements.forEach((stmt) => {
    console.log(`-- ${stmt.description}`);
    console.log(stmt.sql);
    console.log();
  });
}

main().catch(console.error);

