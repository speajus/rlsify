/**
 * Supabase auth template with JWT claims support
 */

import type { PolicyTemplate } from '@speajus/rlsify-types';

export const supabaseAuthTemplate: PolicyTemplate = {
  id: 'supabase-auth',
  type: 'user-owned',
  name: 'Supabase Auth with JWT Claims',
  description: 'Policies using Supabase auth.uid() and JWT claims',
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
  ],
  config: {
    table: '{{table}}',
    policies: [
      {
        name: '{{table}}_auth_select',
        command: 'SELECT',
        using: '{{userColumn}} = auth.uid()',
      },
      {
        name: '{{table}}_auth_insert',
        command: 'INSERT',
        withCheck: '{{userColumn}} = auth.uid()',
      },
      {
        name: '{{table}}_auth_update',
        command: 'UPDATE',
        using: '{{userColumn}} = auth.uid()',
        withCheck: '{{userColumn}} = auth.uid()',
      },
      {
        name: '{{table}}_auth_delete',
        command: 'DELETE',
        using: '{{userColumn}} = auth.uid()',
      },
    ],
  },
  example: `
// Apply Supabase auth template
const config = templateRegistry.apply('supabase-auth', {
  table: 'profiles',
  userColumn: 'id',
});
  `.trim(),
};

