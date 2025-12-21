/**
 * Dependency Injection container setup using @speajus/diblob
 */

import { createBlob, createContainer as createDiblobContainer } from '@speajus/diblob';
import { PolicyGenerator } from './services/policy-generator.js';
import { PolicyValidator } from './services/policy-validator.js';
import { SchemaIntrospector } from './services/schema-introspector.js';
import { JoinResolver } from './services/join-resolver.js';
import { ConfigLoader } from './services/config-loader.js';
import { MigrationGenerator } from './services/migration-generator.js';
import { PolicySimulator } from './services/policy-simulator.js';
import { TemplateRegistry } from './templates/template-registry.js';

// Create blobs for each service
export const policyGenerator = createBlob<PolicyGenerator>('PolicyGenerator');
export const policyValidator = createBlob<PolicyValidator>('PolicyValidator');
export const schemaIntrospector = createBlob<SchemaIntrospector>('SchemaIntrospector');
export const joinResolver = createBlob<JoinResolver>('JoinResolver');
export const configLoader = createBlob<ConfigLoader>('ConfigLoader');
export const migrationGenerator = createBlob<MigrationGenerator>('MigrationGenerator');
export const policySimulator = createBlob<PolicySimulator>('PolicySimulator');
export const templateRegistry = createBlob<TemplateRegistry>('TemplateRegistry');

/**
 * Create a new RLSify container instance with all services registered
 */
export function registerCore(container = createDiblobContainer()) {

  // Register services with their dependencies
  container.register(joinResolver, JoinResolver);
  container.register(policyValidator, PolicyValidator, joinResolver);
  container.register(policyGenerator, PolicyGenerator, policyValidator, joinResolver);
  container.register(schemaIntrospector, SchemaIntrospector);
  container.register(configLoader, ConfigLoader);
  container.register(migrationGenerator, MigrationGenerator, policyGenerator);
  container.register(policySimulator, PolicySimulator);
  container.register(templateRegistry, TemplateRegistry);

  return container;
}

