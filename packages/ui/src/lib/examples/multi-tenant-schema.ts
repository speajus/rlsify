/**
 * Multi-Tenant Schema Example
 *
 * This file demonstrates a realistic multi-tenant database schema with:
 * - Organizations (top-level tenant isolation)
 * - Teams (within organizations)
 * - Users (with org and team memberships)
 * - Projects (team-scoped resources)
 * - Role-based access control
 *
 * This schema can be used with Drizzle ORM:
 *
 * ```typescript
 * import { pgTable, uuid, text, timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core';
 * ```
 */

import type { SchemaInfo } from '@speajus/rlsify-types';

/**
 * Complete multi-tenant schema with organizations, teams, and resources
 */
export const multiTenantSchema: SchemaInfo = {
  tables: [
    // Organizations - Top-level tenant isolation
    {
      schema: 'public',
      name: 'organizations',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
        { name: 'name', type: 'text', nullable: false },
        { name: 'slug', type: 'text', nullable: false },
        { name: 'created_at', type: 'timestamptz', nullable: false },
        { name: 'updated_at', type: 'timestamptz', nullable: false },
      ],
      foreignKeys: [],
      primaryKeys: ['id'],
    },

    // Users - People who can belong to organizations and teams
    {
      schema: 'public',
      name: 'users',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
        { name: 'email', type: 'text', nullable: false },
        { name: 'name', type: 'text', nullable: false },
        { name: 'created_at', type: 'timestamptz', nullable: false },
        { name: 'updated_at', type: 'timestamptz', nullable: false },
      ],
      foreignKeys: [],
      primaryKeys: ['id'],
    },

    // Organization Members - Links users to organizations with roles
    {
      schema: 'public',
      name: 'organization_members',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
        { name: 'organization_id', type: 'uuid', nullable: false, isForeignKey: true },
        { name: 'user_id', type: 'uuid', nullable: false, isForeignKey: true },
        { name: 'role', type: 'text', nullable: false }, // 'owner', 'admin', 'member'
        { name: 'created_at', type: 'timestamptz', nullable: false },
      ],
      foreignKeys: [
        {
          sourceTable: 'organization_members',
          sourceColumn: 'organization_id',
          targetTable: 'organizations',
          targetColumn: 'id',
          constraintName: 'organization_members_organization_id_fkey',
        },
        {
          sourceTable: 'organization_members',
          sourceColumn: 'user_id',
          targetTable: 'users',
          targetColumn: 'id',
          constraintName: 'organization_members_user_id_fkey',
        },
      ],
      primaryKeys: ['id'],
    },

    // Teams - Groups within organizations
    {
      schema: 'public',
      name: 'teams',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
        { name: 'organization_id', type: 'uuid', nullable: false, isForeignKey: true },
        { name: 'name', type: 'text', nullable: false },
        { name: 'slug', type: 'text', nullable: false },
        { name: 'description', type: 'text', nullable: true },
        { name: 'created_at', type: 'timestamptz', nullable: false },
        { name: 'updated_at', type: 'timestamptz', nullable: false },
      ],
      foreignKeys: [
        {
          sourceTable: 'teams',
          sourceColumn: 'organization_id',
          targetTable: 'organizations',
          targetColumn: 'id',
          constraintName: 'teams_organization_id_fkey',
        },
      ],
      primaryKeys: ['id'],
    },

    // Team Members - Links users to teams with roles
    {
      schema: 'public',
      name: 'team_members',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
        { name: 'team_id', type: 'uuid', nullable: false, isForeignKey: true },
        { name: 'user_id', type: 'uuid', nullable: false, isForeignKey: true },
        { name: 'role', type: 'text', nullable: false }, // 'admin', 'member'
        { name: 'created_at', type: 'timestamptz', nullable: false },
      ],
      foreignKeys: [
        {
          sourceTable: 'team_members',
          sourceColumn: 'team_id',
          targetTable: 'teams',
          targetColumn: 'id',
          constraintName: 'team_members_team_id_fkey',
        },
        {
          sourceTable: 'team_members',
          sourceColumn: 'user_id',
          targetTable: 'users',
          targetColumn: 'id',
          constraintName: 'team_members_user_id_fkey',
        },
      ],
      primaryKeys: ['id'],
    },

    // Projects - Team-scoped resources
    {
      schema: 'public',
      name: 'projects',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
        { name: 'team_id', type: 'uuid', nullable: false, isForeignKey: true },
        { name: 'name', type: 'text', nullable: false },
        { name: 'description', type: 'text', nullable: true },
        { name: 'status', type: 'text', nullable: false },
        { name: 'created_by', type: 'uuid', nullable: false, isForeignKey: true },
        { name: 'created_at', type: 'timestamptz', nullable: false },
        { name: 'updated_at', type: 'timestamptz', nullable: false },
      ],
      foreignKeys: [
        {
          sourceTable: 'projects',
          sourceColumn: 'team_id',
          targetTable: 'teams',
          targetColumn: 'id',
          constraintName: 'projects_team_id_fkey',
        },
        {
          sourceTable: 'projects',
          sourceColumn: 'created_by',
          targetTable: 'users',
          targetColumn: 'id',
          constraintName: 'projects_created_by_fkey',
        },
      ],
      primaryKeys: ['id'],
    },

    // Documents - Team-scoped content with visibility controls
    {
      schema: 'public',
      name: 'documents',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
        { name: 'team_id', type: 'uuid', nullable: false, isForeignKey: true },
        { name: 'title', type: 'text', nullable: false },
        { name: 'content', type: 'text', nullable: true },
        { name: 'is_public', type: 'boolean', nullable: false },
        { name: 'created_by', type: 'uuid', nullable: false, isForeignKey: true },
        { name: 'created_at', type: 'timestamptz', nullable: false },
        { name: 'updated_at', type: 'timestamptz', nullable: false },
      ],
      foreignKeys: [
        {
          sourceTable: 'documents',
          sourceColumn: 'team_id',
          targetTable: 'teams',
          targetColumn: 'id',
          constraintName: 'documents_team_id_fkey',
        },
        {
          sourceTable: 'documents',
          sourceColumn: 'created_by',
          targetTable: 'users',
          targetColumn: 'id',
          constraintName: 'documents_created_by_fkey',
        },
      ],
      primaryKeys: ['id'],
    },

    // Resources - Simple user-owned resources for visual builder demo
    {
      schema: 'public',
      name: 'resources',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
        { name: 'name', type: 'text', nullable: false },
        { name: 'description', type: 'text', nullable: true },
        { name: 'status', type: 'text', nullable: false }, // 'active', 'inactive', 'archived'
        { name: 'created_by', type: 'uuid', nullable: false, isForeignKey: true },
        { name: 'created_at', type: 'timestamptz', nullable: false },
        { name: 'updated_at', type: 'timestamptz', nullable: false },
      ],
      foreignKeys: [
        {
          sourceTable: 'resources',
          sourceColumn: 'created_by',
          targetTable: 'users',
          targetColumn: 'id',
          constraintName: 'resources_created_by_fkey',
        },
      ],
      primaryKeys: ['id'],
    },
  ],

  // All foreign key relationships (flattened for easy lookup)
  foreignKeys: [
    // Organization Members
    {
      sourceTable: 'organization_members',
      sourceColumn: 'organization_id',
      targetTable: 'organizations',
      targetColumn: 'id',
      constraintName: 'organization_members_organization_id_fkey',
    },
    {
      sourceTable: 'organization_members',
      sourceColumn: 'user_id',
      targetTable: 'users',
      targetColumn: 'id',
      constraintName: 'organization_members_user_id_fkey',
    },
    // Teams
    {
      sourceTable: 'teams',
      sourceColumn: 'organization_id',
      targetTable: 'organizations',
      targetColumn: 'id',
      constraintName: 'teams_organization_id_fkey',
    },
    // Team Members
    {
      sourceTable: 'team_members',
      sourceColumn: 'team_id',
      targetTable: 'teams',
      targetColumn: 'id',
      constraintName: 'team_members_team_id_fkey',
    },
    {
      sourceTable: 'team_members',
      sourceColumn: 'user_id',
      targetTable: 'users',
      targetColumn: 'id',
      constraintName: 'team_members_user_id_fkey',
    },
    // Projects
    {
      sourceTable: 'projects',
      sourceColumn: 'team_id',
      targetTable: 'teams',
      targetColumn: 'id',
      constraintName: 'projects_team_id_fkey',
    },
    {
      sourceTable: 'projects',
      sourceColumn: 'created_by',
      targetTable: 'users',
      targetColumn: 'id',
      constraintName: 'projects_created_by_fkey',
    },
    // Documents
    {
      sourceTable: 'documents',
      sourceColumn: 'team_id',
      targetTable: 'teams',
      targetColumn: 'id',
      constraintName: 'documents_team_id_fkey',
    },
    {
      sourceTable: 'documents',
      sourceColumn: 'created_by',
      targetTable: 'users',
      targetColumn: 'id',
      constraintName: 'documents_created_by_fkey',
    },
    // Resources
    {
      sourceTable: 'resources',
      sourceColumn: 'created_by',
      targetTable: 'users',
      targetColumn: 'id',
      constraintName: 'resources_created_by_fkey',
    },
  ],
};

/**
 * Drizzle ORM Schema Definition
 *
 * Use this to generate the actual database schema:
 */
export const drizzleSchemaExample = `
import { pgTable, uuid, text, timestamp, boolean, unique } from 'drizzle-orm/pg-core';

// Organizations - Top-level tenant isolation
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Organization Members - Links users to organizations with roles
export const organizationMembers = pgTable('organization_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'owner', 'admin', 'member'
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  uniqueOrgUser: unique().on(table.organizationId, table.userId),
}));

// Teams - Groups within organizations
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Team Members - Links users to teams with roles
export const teamMembers = pgTable('team_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'admin', 'member'
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  uniqueTeamUser: unique().on(table.teamId, table.userId),
}));

// Projects - Team-scoped resources
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'), // 'active', 'archived', 'completed'
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Documents - Team-scoped content with visibility controls
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content'),
  isPublic: boolean('is_public').notNull().default(false),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
`;

/**
 * Example Permission Policies
 *
 * These demonstrate common multi-tenant permission patterns:
 */
export const examplePolicies = {
  // 0. Simple User-Owned Resources (Visual Builder Compatible)
  userOwnedResources: {
    name: 'user_owned_resources',
    table: 'public.resources',
    command: 'SELECT' as const,
    description: 'Users can only see resources they created',
    usingExpression: {
      _and: [
        {
          created_by: { _eq: { var: 'auth.uid()', type: 'uuid' } },
        },
        {
          status: { _eq: 'active' },
        },
      ],
    },
  },

  // 1. Organization Isolation - Users only see their org's teams
  teamOrgIsolation: {
    name: 'team_org_isolation',
    table: 'public.teams',
    command: 'SELECT' as const,
    description: 'Users can only see teams from organizations they belong to',
    usingExpression: {
      _exists: {
        _table: 'organization_members',
        _where: {
          _and: [
            {
              organization_id: { _eq: { column: 'teams.organization_id' } },
            },
            {
              user_id: { _eq: { var: 'auth.uid()', type: 'uuid' } },
            },
          ],
        },
      },
    },
  },

  // 2. Team Member Access - Users can only see projects from teams they belong to
  projectTeamAccess: {
    name: 'project_team_access',
    table: 'public.projects',
    command: 'SELECT' as const,
    description: 'Users can only see projects from teams they are members of',
    usingExpression: {
      _exists: {
        _table: 'team_members',
        _where: {
          _and: [
            {
              team_id: { _eq: { column: 'projects.team_id' } },
            },
            {
              user_id: { _eq: { var: 'auth.uid()', type: 'uuid' } },
            },
          ],
        },
      },
    },
  },

  // 3. Team Admin Only - Only team admins can update projects
  projectTeamAdminUpdate: {
    name: 'project_team_admin_update',
    table: 'public.projects',
    command: 'UPDATE' as const,
    description: 'Only team admins can update projects',
    usingExpression: {
      _exists: {
        _table: 'team_members',
        _where: {
          _and: [
            {
              team_id: { _eq: { column: 'projects.team_id' } },
            },
            {
              user_id: { _eq: { var: 'auth.uid()', type: 'uuid' } },
            },
            {
              role: { _eq: 'admin' },
            },
          ],
        },
      },
    },
  },

  // 4. Org Admin Override - Org admins can see all projects in their org
  projectOrgAdminAccess: {
    name: 'project_org_admin_access',
    table: 'public.projects',
    command: 'SELECT' as const,
    description: 'Organization admins can see all projects in their organization',
    usingExpression: {
      _exists: {
        _table: 'organization_members',
        _where: {
          _and: [
            {
              organization_id: { _eq: { column: 'projects.team.organization_id' } },
            },
            {
              user_id: { _eq: { var: 'auth.uid()', type: 'uuid' } },
            },
            {
              role: { _in: ['admin', 'owner'] },
            },
          ],
        },
      },
    },
  },

  // 5. Public or Team Member - Documents are accessible if public OR user is team member
  documentPublicOrTeamAccess: {
    name: 'document_public_or_team_access',
    table: 'public.documents',
    command: 'SELECT' as const,
    description: 'Users can see public documents or documents from their teams',
    usingExpression: {
      _or: [
        {
          is_public: { _eq: true },
        },
        {
          _exists: {
            _table: 'team_members',
            _where: {
              _and: [
                {
                  team_id: { _eq: { column: 'documents.team_id' } },
                },
                {
                  user_id: { _eq: { var: 'auth.uid()', type: 'uuid' } },
                },
              ],
            },
          },
        },
      ],
    },
  },
};
