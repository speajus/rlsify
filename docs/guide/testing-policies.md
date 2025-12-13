# Testing RLS Policies

Comprehensive testing ensures your RLS policies work correctly and securely.

## Why Test?

- **Catch bugs early** - Find policy issues before production
- **Prevent regressions** - Ensure changes don't break access control
- **Document behavior** - Tests serve as executable documentation
- **Security validation** - Verify policies actually protect data

## Testing Strategy

### 1. Unit Tests

Test individual policy expressions:

```typescript
import { compilePermissionExpression } from '@speajus/rlsify-core';

describe('Permission Expressions', () => {
  it('compiles owner check', () => {
    const expr = {
      user_id: { _eq: { var: 'auth.uid()' } }
    };
    
    const sql = compilePermissionExpression(expr);
    expect(sql).toBe('user_id = auth.uid()');
  });

  it('compiles team membership', () => {
    const expr = {
      _exists: {
        _table: 'team_members',
        _where: {
          team_id: { _eq: { column: 'docs.team_id' } },
          user_id: { _eq: { var: 'auth.uid()' } }
        }
      }
    };
    
    const sql = compilePermissionExpression(expr);
    expect(sql).toContain('EXISTS');
    expect(sql).toContain('team_members');
  });
});
```

### 2. Integration Tests

Test policies against a real database:

```typescript
import { Client } from 'pg';

describe('RLS Enforcement', () => {
  let client: Client;
  
  beforeAll(async () => {
    client = new Client(process.env.TEST_DATABASE_URL);
    await client.connect();
  });

  it('users can only see their own posts', async () => {
    // Set user context
    await client.query(`SELECT auth.set_user('user-1-id')`);
    
    // Query posts
    const result = await client.query('SELECT * FROM posts');
    
    // Verify all results belong to user
    for (const row of result.rows) {
      expect(row.user_id).toBe('user-1-id');
    }
  });

  it('users cannot see other users posts', async () => {
    await client.query(`SELECT auth.set_user('user-1-id')`);
    
    const result = await client.query(
      `SELECT * FROM posts WHERE user_id = 'user-2-id'`
    );
    
    expect(result.rows).toHaveLength(0);
  });
});
```

### 3. Security Tests

Explicitly test for vulnerabilities:

```typescript
describe('Security', () => {
  it('prevents cross-tenant access', async () => {
    await setUser(orgAUser);
    
    const result = await client.query(
      `SELECT * FROM resources WHERE org_id = $1`,
      [orgBId]
    );
    
    expect(result.rows).toHaveLength(0);
  });

  it('prevents privilege escalation', async () => {
    await setUser(regularUser);
    
    await expect(
      client.query(
        `UPDATE users SET role = 'admin' WHERE id = $1`,
        [regularUser.id]
      )
    ).rejects.toThrow();
  });

  it('INSERT respects WITH CHECK', async () => {
    await setUser(userA);
    
    // Try to insert a row owned by another user
    await expect(
      client.query(
        `INSERT INTO posts (user_id, title) VALUES ($1, $2)`,
        [userB.id, 'Hacked post']
      )
    ).rejects.toThrow();
  });
});
```

## Test Fixtures

### Sample Users

```typescript
const USERS = {
  alice: {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    org: 'org-1',
    role: 'admin'
  },
  bob: {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    org: 'org-1',
    role: 'member'
  },
  carol: {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    org: 'org-2',
    role: 'admin'
  }
};
```

### Test Data Setup

```typescript
async function setupTestData(client: Client) {
  await client.query(`
    INSERT INTO users (id, email, org_id, role) VALUES
      ('${USERS.alice.id}', 'alice@test.com', 'org-1', 'admin'),
      ('${USERS.bob.id}', 'bob@test.com', 'org-1', 'member'),
      ('${USERS.carol.id}', 'carol@test.com', 'org-2', 'admin')
  `);

  await client.query(`
    INSERT INTO posts (id, user_id, org_id, title) VALUES
      ('post-1', '${USERS.alice.id}', 'org-1', 'Alice Post'),
      ('post-2', '${USERS.bob.id}', 'org-1', 'Bob Post'),
      ('post-3', '${USERS.carol.id}', 'org-2', 'Carol Post')
  `);
}
```

## Test Patterns

### Pattern 1: Owner Access

```typescript
describe('Owner-based access', () => {
  it('owner can SELECT own rows', async () => {
    await setUser(alice);
    const result = await query('SELECT * FROM posts WHERE id = $1', ['post-1']);
    expect(result.rows).toHaveLength(1);
  });

  it('owner can UPDATE own rows', async () => {
    await setUser(alice);
    const result = await query(
      'UPDATE posts SET title = $1 WHERE id = $2 RETURNING *',
      ['Updated', 'post-1']
    );
    expect(result.rows).toHaveLength(1);
  });

  it('owner can DELETE own rows', async () => {
    await setUser(alice);
    const result = await query('DELETE FROM posts WHERE id = $1', ['post-1']);
    expect(result.rowCount).toBe(1);
  });

  it('non-owner cannot access', async () => {
    await setUser(bob);
    const result = await query('SELECT * FROM posts WHERE id = $1', ['post-1']);
    expect(result.rows).toHaveLength(0);
  });
});
```

### Pattern 2: Team Access

```typescript
describe('Team-based access', () => {
  it('team member can access team docs', async () => {
    await setUser(teamMember);
    const result = await query('SELECT * FROM documents WHERE team_id = $1', [teamId]);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('non-member cannot access team docs', async () => {
    await setUser(nonMember);
    const result = await query('SELECT * FROM documents WHERE team_id = $1', [teamId]);
    expect(result.rows).toHaveLength(0);
  });
});
```

### Pattern 3: Organization Isolation

```typescript
describe('Organization isolation', () => {
  it('user in org A cannot see org B data', async () => {
    await setUser(orgAUser);
    const result = await query('SELECT * FROM resources WHERE org_id = $1', [orgBId]);
    expect(result.rows).toHaveLength(0);
  });

  it('user sees all data in their org', async () => {
    await setUser(orgAUser);
    const result = await query('SELECT * FROM resources WHERE org_id = $1', [orgAId]);
    expect(result.rows.length).toBeGreaterThan(0);
  });
});
```

## Cleanup

```typescript
afterEach(async () => {
  // Reset to superuser
  await client.query('RESET ROLE');
  
  // Clean test data
  await client.query('DELETE FROM posts WHERE id LIKE $1', ['test-%']);
});

afterAll(async () => {
  await client.end();
});
```

## Next Steps

- [Test Containers](/guide/test-containers) - Use Docker for testing
- [Security Best Practices](/guide/security-best-practices) - Secure policies

