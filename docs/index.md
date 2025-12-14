---
layout: home

hero:
  name: RLSify
  text: Visual PostgreSQL Row-Level Security
  tagline: Build, test, and deploy RLS policies with a modern visual interface — no SQL required
  image:
    src: /images/guide-step-10.png
    alt: RLSify Visual Policy Builder
  actions:
    - theme: brand
      text: Try the Visual UI
      link: /guide/visual-step-by-step
    - theme: alt
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: GitHub
      link: https://github.com/speajus/rlsify

features:
  - icon: 🎨
    title: Visual Policy Builder
    details: Create RLS policies with a drag-and-drop interface. See SQL generated in real-time as you build.
  - icon: 🧪
    title: Built-in Policy Tester
    details: Test policies before deploying. Simulate different users and verify access rules work correctly.
  - icon: 🔒
    title: Type-Safe Policies
    details: Define RLS policies using TypeScript with full type checking and IntelliSense support.
  - icon: 📝
    title: JSON Expression Language
    details: Write policies using a structured JSON format that's easy to build, validate, and maintain.
  - icon: 🚀
    title: Supabase Integration
    details: First-class support for Supabase auth helpers with automatic migration generation.
  - icon: 🏗️
    title: Multi-Tenant Ready
    details: Built-in patterns for organizations, teams, and role-based access control.
---

<div class="ui-showcase">

## 🎨 Visual Policy Builder

Create PostgreSQL Row-Level Security policies visually — no SQL knowledge required.

![RLSify Visual UI](/images/guide-step-10.png)

<div class="action-buttons">
  <a href="/rlsify/guide/visual-step-by-step" class="action-button primary">Visual Step-by-Step Guide →</a>
  <a href="/rlsify/guide/getting-started" class="action-button secondary">Quick Start</a>
</div>

</div>

## Quick Start

### Start the UI (Docker)

```bash
# Clone and start
git clone https://github.com/speajus/rlsify.git
cd rlsify
pnpm install
pnpm docker:setup
pnpm docker:up

# Open the UI
open http://localhost:5174
```

### Or Use the TypeScript API

```bash
pnpm add @speajus/rlsify-core @speajus/rlsify-types
```

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

<style>
.ui-showcase {
  margin: 3rem 0;
  padding: 2rem;
  background: linear-gradient(135deg, var(--vp-c-bg-soft) 0%, var(--vp-c-bg) 100%);
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
}

.ui-showcase img {
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  margin: 1.5rem 0;
}

.action-buttons {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}

.action-button {
  display: inline-block;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
}

.action-button.primary {
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
}

.action-button.primary:hover {
  background: var(--vp-c-brand-2);
}

.action-button.secondary {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
}

.action-button.secondary:hover {
  border-color: var(--vp-c-brand-1);
}
</style>

