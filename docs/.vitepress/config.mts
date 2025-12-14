import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'RLSify',
  description: 'Visual PostgreSQL Row-Level Security policy builder',
  base: '/rlsify/',

  head: [
    ['link', { rel: 'icon', href: '/rlsify/favicon.ico' }]
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Visual UI', link: '/guide/visual-step-by-step' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/expression-language' },
      { text: 'Examples', link: '/examples/basic-patterns' },
      { text: 'GitHub', link: 'https://github.com/speajus/rlsify' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: '🎨 Visual UI',
          items: [
            { text: 'Visual Step-by-Step', link: '/guide/visual-step-by-step' },
            { text: 'Docker Setup', link: '/guide/docker-setup' }
          ]
        },
        {
          text: 'Getting Started',
          items: [
            { text: 'What is RLSify?', link: '/guide/what-is-rlsify' },
            { text: 'Quick Start', link: '/guide/getting-started' }
          ]
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Row-Level Security', link: '/guide/row-level-security' },
            { text: 'Expression Language', link: '/guide/expression-language' },
            { text: 'Policy Types', link: '/guide/policy-types' }
          ]
        },
        {
          text: 'Security',
          items: [
            { text: 'Security Best Practices', link: '/guide/security-best-practices' },
            { text: 'Common Vulnerabilities', link: '/guide/common-vulnerabilities' },
            { text: 'Auditing', link: '/guide/auditing' }
          ]
        },
        {
          text: 'Testing',
          items: [
            { text: 'Testing RLS Policies', link: '/guide/testing-policies' },
            { text: 'Test Containers', link: '/guide/test-containers' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Expression Language', link: '/reference/expression-language' },
            { text: 'Stored Procedures', link: '/reference/stored-procedures' },
            { text: 'TypeScript API', link: '/reference/typescript-api' }
          ]
        }
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Basic Patterns', link: '/examples/basic-patterns' },
            { text: 'Team & Org Permissions', link: '/examples/team-org-permissions' },
            { text: 'Multi-Tenant Apps', link: '/examples/multi-tenant' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/speajus/rlsify' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024 Justin Spears'
    },

    search: {
      provider: 'local'
    }
  }
})

