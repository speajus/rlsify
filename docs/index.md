---
layout: home

hero:
  name: RLSify
  text: Simplify PostgreSQL Row-Level Security
  tagline: Type-safe, declarative RLS policies with a modern TypeScript toolkit
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/speajus/rlsify

features:
  - icon: 🔒
    title: Type-Safe Policies
    details: Define RLS policies using TypeScript with full type checking and IntelliSense support.
  - icon: 📝
    title: JSON Expression Language
    details: Write policies using a structured JSON format that's easy to build, validate, and maintain.
  - icon: 🎨
    title: Visual Builder
    details: Use the Svelte-based web UI to visually create and test policies without writing SQL.
  - icon: 🚀
    title: Supabase Integration
    details: First-class support for Supabase auth helpers with automatic migration generation.
  - icon: 🧪
    title: Test Before Deploy
    details: Simulate policies with test containers to catch issues before they reach production.
  - icon: 🏗️
    title: Multi-Tenant Ready
    details: Built-in patterns for organizations, teams, and role-based access control.
---

## Quick Start

### Docker (Recommended)

```bash
# Setup and start
npm run docker:setup
npm run docker:up

# Open the UI
open http://localhost:5174
```

### Install Packages

```bash
pnpm add @speajus/rlsify-core @speajus/rlsify-types
```

### Define a Policy

```typescript
import { createContainer } from '@speajus/rlsify-core';
import type { RLSPolicyConfig } from '@speajus/rlsify-types';

const container = createContainer();
const generator = container.getPolicyGenerator();

const config: RLSPolicyConfig = {
  version: '1.0',
  table: 'posts',
  policies: [{
    name: 'users_own_posts',
    command: 'SELECT',
    using: 'user_id = auth.uid()'
  }],
  enableRLS: true
};

const result = await generator.generate(config);
```

