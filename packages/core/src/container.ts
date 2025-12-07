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
export const policyGeneratorBlob = createBlob<PolicyGenerator>('PolicyGenerator');
export const policyValidatorBlob = createBlob<PolicyValidator>('PolicyValidator');
export const schemaIntrospectorBlob = createBlob<SchemaIntrospector>('SchemaIntrospector');
export const joinResolverBlob = createBlob<JoinResolver>('JoinResolver');
export const configLoaderBlob = createBlob<ConfigLoader>('ConfigLoader');
export const migrationGeneratorBlob = createBlob<MigrationGenerator>('MigrationGenerator');
export const policySimulatorBlob = createBlob<PolicySimulator>('PolicySimulator');
export const templateRegistryBlob = createBlob<TemplateRegistry>('TemplateRegistry');

/**
 * Create a new RLSify container instance with all services registered
 */
export function createContainer() {
  const container = createDiblobContainer();

  // Register services with their dependencies
  container.register(joinResolverBlob, JoinResolver);
  container.register(policyValidatorBlob, PolicyValidator, joinResolverBlob);
  container.register(policyGeneratorBlob, PolicyGenerator, policyValidatorBlob, joinResolverBlob);
  container.register(schemaIntrospectorBlob, SchemaIntrospector);
  container.register(configLoaderBlob, ConfigLoader);
  container.register(migrationGeneratorBlob, MigrationGenerator, policyGeneratorBlob);
  container.register(policySimulatorBlob, PolicySimulator);
  container.register(templateRegistryBlob, TemplateRegistry);

  return container;
}

