/**
 * User-owned resource template
 * For resources that belong to a specific user (created_by pattern)
 */

import type { PolicyTemplate } from '@speajus/rlsify-types';

export const userOwnedTemplate: PolicyTemplate = {
  id: 'user-owned',
  type: 'user-owned',
  name: 'User-Owned Resources',
  description: 'Policies for resources owned by users. Users can only access their own resources.',
  variables: [
    {
      name: 'table',
      type: 'table',
      description: 'Table name',
      required: true,
    },
    {
      name: 'userColumn',
      type: 'column',
      description: 'Column that stores the user ID',
      defaultValue: 'user_id',
      required: false,
    },
    {
      name: 'authFunction',
      type: 'string',
      description: 'Auth function to get current user ID',
      defaultValue: 'auth.uid()',
      required: false,
    },
  ],
  config: {
    table: '{{table}}',
    policies: [
      {
        name: '{{table}}_select_own',
        command: 'SELECT',
        using: '{{userColumn}} = {{authFunction}}',
      },
      {
        name: '{{table}}_insert_own',
        command: 'INSERT',
        withCheck: '{{userColumn}} = {{authFunction}}',
      },
      {
        name: '{{table}}_update_own',
        command: 'UPDATE',
        using: '{{userColumn}} = {{authFunction}}',
        withCheck: '{{userColumn}} = {{authFunction}}',
      },
      {
        name: '{{table}}_delete_own',
        command: 'DELETE',
        using: '{{userColumn}} = {{authFunction}}',
      },
    ],
  },
  example: `
// Apply user-owned template
const config = templateRegistry.apply('user-owned', {
  table: 'posts',
  userColumn: 'created_by',
  authFunction: 'auth.uid()'
});
  `.trim(),
};

