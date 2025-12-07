/**
 * Role-based access template
 * For role-based access control (admin, user, etc.)
 */

import type { PolicyTemplate } from '@speajus/rlsify-types';

export const roleBasedTemplate: PolicyTemplate = {
  id: 'role-based',
  type: 'role-based',
  name: 'Role-Based Access',
  description: 'Policies based on user roles. Different permissions for different roles.',
  variables: [
    {
      name: 'table',
      type: 'table',
      description: 'Table name',
      required: true,
    },
    {
      name: 'adminRole',
      type: 'string',
      description: 'Admin role name',
      defaultValue: 'admin',
      required: false,
    },
    {
      name: 'userRole',
      type: 'string',
      description: 'User role name',
      defaultValue: 'user',
      required: false,
    },
    {
      name: 'roleFunction',
      type: 'string',
      description: 'Function to get current user role',
      defaultValue: 'auth.role()',
      required: false,
    },
  ],
  config: {
    table: '{{table}}',
    policies: [
      {
        name: '{{table}}_admin_all',
        command: 'ALL',
        using: "{{roleFunction}} = '{{adminRole}}'",
        withCheck: "{{roleFunction}} = '{{adminRole}}'",
      },
      {
        name: '{{table}}_user_select',
        command: 'SELECT',
        using: "{{roleFunction}} = '{{userRole}}'",
      },
    ],
  },
  example: `
// Apply role-based template
const config = templateRegistry.apply('role-based', {
  table: 'products',
  adminRole: 'admin',
  userRole: 'user',
  roleFunction: 'auth.role()'
});
  `.trim(),
};

