import { describe, it, expect } from 'vitest';
import { parseSqlExpression, tryParseSqlExpression, parseRlsPolicy } from './sql-expression-parser.js';

describe('parseSqlExpression', () => {
  describe('simple comparisons', () => {
    it('parses equality with function call', () => {
      const result = parseSqlExpression('user_id = auth.uid()');
      expect(result).toEqual({
        user_id: { _eq: { var: 'auth.uid()' } },
      });
    });

    it('parses equality with boolean', () => {
      const result = parseSqlExpression('is_public = true');
      expect(result).toEqual({
        is_public: { _eq: true },
      });
    });

    it('parses equality with string', () => {
      const result = parseSqlExpression("status = 'active'");
      expect(result).toEqual({
        status: { _eq: 'active' },
      });
    });

    it('parses equality with number', () => {
      const result = parseSqlExpression('age >= 18');
      expect(result).toEqual({
        age: { _gte: 18 },
      });
    });

    it('parses not equals', () => {
      const result = parseSqlExpression("status <> 'deleted'");
      expect(result).toEqual({
        status: { _neq: 'deleted' },
      });
    });
  });

  describe('IS NULL expressions', () => {
    it('parses IS NULL', () => {
      const result = parseSqlExpression('deleted_at IS NULL');
      expect(result).toEqual({
        deleted_at: { _is_null: true },
      });
    });

    it('parses IS NOT NULL', () => {
      const result = parseSqlExpression('verified_at IS NOT NULL');
      expect(result).toEqual({
        verified_at: { _is_null: false },
      });
    });
  });

  describe('IN expressions', () => {
    it('parses IN with strings', () => {
      const result = parseSqlExpression("role IN ('admin', 'editor')");
      expect(result).toEqual({
        role: { _in: ['admin', 'editor'] },
      });
    });

    it('parses NOT IN', () => {
      const result = parseSqlExpression("status NOT IN ('deleted', 'archived')");
      expect(result).toEqual({
        status: { _nin: ['deleted', 'archived'] },
      });
    });
  });

  describe('LIKE expressions', () => {
    it('parses LIKE', () => {
      const result = parseSqlExpression("email LIKE '%@company.com'");
      expect(result).toEqual({
        email: { _like: '%@company.com' },
      });
    });

    it('parses ILIKE', () => {
      const result = parseSqlExpression("name ILIKE '%john%'");
      expect(result).toEqual({
        name: { _ilike: '%john%' },
      });
    });
  });

  describe('logical operators', () => {
    it('parses OR expressions', () => {
      const result = parseSqlExpression('is_public = true OR user_id = auth.uid()');
      expect(result).toEqual({
        _or: [
          { is_public: { _eq: true } },
          { user_id: { _eq: { var: 'auth.uid()' } } },
        ],
      });
    });

    it('parses AND expressions', () => {
      const result = parseSqlExpression("is_active = true AND status = 'published'");
      expect(result).toEqual({
        _and: [
          { is_active: { _eq: true } },
          { status: { _eq: 'published' } },
        ],
      });
    });

    it('parses NOT expressions', () => {
      const result = parseSqlExpression('NOT is_deleted = true');
      expect(result).toEqual({
        _not: { is_deleted: { _eq: true } },
      });
    });

    it('parses complex nested expressions', () => {
      const result = parseSqlExpression(
        '(user_id = auth.uid() OR is_public = true) AND is_deleted = false'
      );
      expect(result).toEqual({
        _and: [
          {
            _or: [
              { user_id: { _eq: { var: 'auth.uid()' } } },
              { is_public: { _eq: true } },
            ],
          },
          { is_deleted: { _eq: false } },
        ],
      });
    });
  });

  describe('EXISTS subqueries', () => {
    it('parses EXISTS with simple WHERE', () => {
      const result = parseSqlExpression(
        'EXISTS (SELECT 1 FROM team_members WHERE team_id = teams.id)'
      );
      expect(result).toEqual({
        _exists: {
          _table: 'team_members',
          _where: {
            team_id: { _eq: { column: 'teams.id' } },
          },
        },
      });
    });
  });
});

describe('tryParseSqlExpression', () => {
  it('returns parsed expression on success', () => {
    const result = tryParseSqlExpression('user_id = auth.uid()');
    expect(result).toEqual({
      user_id: { _eq: { var: 'auth.uid()' } },
    });
  });

  it('returns null on parse failure', () => {
    const result = tryParseSqlExpression('invalid sql <<<>>>');
    expect(result).toBeNull();
  });
});

