/**
 * Organization/tenant isolation template
 * For multi-tenant applications with organization-based access
 */

import type { PolicyTemplate } from '@speajus/rlsify-types';

export const organizationTemplate: PolicyTemplate = {
  id: 'organization',
  type: 'organization',
  name: 'Organization Isolation',
  description: 'Multi-tenant isolation. Users can only access data from their organization.',
  variables: [
    {
      name: 'table',
      type: 'table',
      description: 'Table name',
      required: true,
    },
    {
      name: 'orgColumn',
      type: 'column',
      description: 'Column that stores the organization ID',
      defaultValue: 'organization_id',
      required: false,
    },
    {
      name: 'orgFunction',
      type: 'string',
      description: 'Function to get current user organization ID',
      defaultValue: "(auth.jwt() ->> 'organization_id')",
      required: false,
    },
  ],
  config: {
    table: '{{table}}',
    policies: [
      {
        name: '{{table}}_org_isolation',
        command: 'ALL',
        using: '{{orgColumn}}::text = {{orgFunction}}',
        withCheck: '{{orgColumn}}::text = {{orgFunction}}',
      },
    ],
  },
  example: `
// Apply organization template
const config = templateRegistry.apply('organization', {
  table: 'projects',
  orgColumn: 'organization_id',
  orgFunction: "(auth.jwt() ->> 'organization_id')"
});
  `.trim(),
};

