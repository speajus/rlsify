/**
 * Team-based access template
 * For team collaboration with team membership checks
 */

import type { PolicyTemplate } from '@speajus/rlsify-types';

export const teamBasedTemplate: PolicyTemplate = {
  id: 'team-based',
  type: 'team-based',
  name: 'Team-Based Access',
  description: 'Team collaboration. Users can access resources belonging to their teams.',
  variables: [
    {
      name: 'table',
      type: 'table',
      description: 'Table name',
      required: true,
    },
    {
      name: 'teamColumn',
      type: 'column',
      description: 'Column that stores the team ID',
      defaultValue: 'team_id',
      required: false,
    },
    {
      name: 'membershipTable',
      type: 'table',
      description: 'Table that stores team memberships',
      defaultValue: 'team_members',
      required: false,
    },
    {
      name: 'authFunction',
      type: 'string',
      description: 'Function to get current user ID',
      defaultValue: 'auth.uid()',
      required: false,
    },
  ],
  config: {
    table: '{{table}}',
    policies: [
      {
        name: '{{table}}_team_select',
        command: 'SELECT',
        using: `EXISTS (
          SELECT 1 FROM {{membershipTable}}
          WHERE team_id = {{table}}.{{teamColumn}}
          AND user_id = {{authFunction}}
        )`,
      },
      {
        name: '{{table}}_team_insert',
        command: 'INSERT',
        withCheck: `EXISTS (
          SELECT 1 FROM {{membershipTable}}
          WHERE team_id = {{teamColumn}}
          AND user_id = {{authFunction}}
        )`,
      },
      {
        name: '{{table}}_team_update',
        command: 'UPDATE',
        using: `EXISTS (
          SELECT 1 FROM {{membershipTable}}
          WHERE team_id = {{table}}.{{teamColumn}}
          AND user_id = {{authFunction}}
        )`,
      },
      {
        name: '{{table}}_team_delete',
        command: 'DELETE',
        using: `EXISTS (
          SELECT 1 FROM {{membershipTable}}
          WHERE team_id = {{table}}.{{teamColumn}}
          AND user_id = {{authFunction}}
        )`,
      },
    ],
  },
  example: `
// Apply team-based template
const config = templateRegistry.apply('team-based', {
  table: 'documents',
  teamColumn: 'team_id',
  membershipTable: 'team_members',
  authFunction: 'auth.uid()'
});
  `.trim(),
};

