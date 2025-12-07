/**
 * @speajus/rlsify-core
 * Core library for generating PostgreSQL Row-Level Security policies
 */

// Export types
export * from '@speajus/rlsify-types';

// Export core services
export { PolicyGenerator } from './services/policy-generator.js';
export { PolicyValidator } from './services/policy-validator.js';
export { SchemaIntrospector, type DatabaseConnection } from './services/schema-introspector.js';
export { JoinResolver } from './services/join-resolver.js';
export { ConfigLoader } from './services/config-loader.js';
export { MigrationGenerator } from './services/migration-generator.js';
export { PolicySimulator } from './services/policy-simulator.js';

// Export templates
export { TemplateRegistry } from './templates/template-registry.js';
export * from './templates/index.js';

// Export DI container setup
export { createContainer } from './container.js';
export * from './container.js';

// Export utilities
export * from './utils/index.js';

// Export permission expression compiler
export { compilePermissionExpression } from './permission-expression-compiler.js';

