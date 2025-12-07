/**
 * PolicySimulator - Simulates RLS policy execution for testing
 */

import type {
  RLSPolicyConfig,
  TestScenario,
  TestResult,
} from '@speajus/rlsify-types';
import type { DatabaseConnection } from './schema-introspector.js';

export class PolicySimulator {
  constructor(private connection?: DatabaseConnection) {}

  /**
   * Test a policy against a scenario
   */
  async testPolicy(
    config: RLSPolicyConfig,
    scenario: TestScenario
  ): Promise<TestResult> {
    if (!this.connection) {
      throw new Error('Database connection required for policy simulation');
    }

    // Find the policy for this operation
    const policy = config.policies.find(
      (p) => p.command === scenario.operation || p.command === 'ALL'
    );

    if (!policy) {
      return {
        passed: false,
        actual: 'deny',
        expected: scenario.expected,
        sql: '',
        error: `No policy found for ${scenario.operation} operation`,
      };
    }

    // Build test SQL
    const sql = this.buildTestSQL(config, policy, scenario);

    try {
      // Execute test query
      const result = await this.connection.query<{ allowed: boolean }>(sql);
      const actual = result.rows[0]?.allowed ? 'allow' : 'deny';
      const passed = actual === scenario.expected;

      return {
        passed,
        actual,
        expected: scenario.expected,
        sql,
      };
    } catch (error) {
      return {
        passed: false,
        actual: 'deny',
        expected: scenario.expected,
        sql,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Build SQL for testing policy
   */
  private buildTestSQL(
    _config: RLSPolicyConfig,
    policy: any,
    scenario: TestScenario
  ): string {
    // Set up session variables for auth context
    const setVars = this.buildSessionVariables(scenario);

    // Build the policy expression
    const expression = this.buildPolicyExpression(policy, scenario);

    // Build test query
    return `
      ${setVars}
      SELECT (${expression}) AS allowed;
    `;
  }

  /**
   * Build session variables for auth context
   */
  private buildSessionVariables(scenario: TestScenario): string {
    const vars: string[] = [];

    if (scenario.user.id) {
      vars.push(`SET LOCAL request.jwt.claims.sub = '${scenario.user.id}';`);
    }

    if (scenario.user.role) {
      vars.push(`SET LOCAL request.jwt.claims.role = '${scenario.user.role}';`);
    }

    if (scenario.user.claims) {
      for (const [key, value] of Object.entries(scenario.user.claims)) {
        vars.push(`SET LOCAL request.jwt.claims.${key} = '${value}';`);
      }
    }

    return vars.join('\n');
  }

  /**
   * Build policy expression with test data
   */
  private buildPolicyExpression(policy: any, scenario: TestScenario): string {
    let expression = '';

    // Use USING clause for SELECT, UPDATE, DELETE
    if (['SELECT', 'UPDATE', 'DELETE'].includes(scenario.operation)) {
      expression = policy.using || 'true';
    }
    // Use WITH CHECK clause for INSERT, UPDATE
    else if (['INSERT', 'UPDATE'].includes(scenario.operation)) {
      expression = policy.withCheck || policy.using || 'true';
    }

    // Replace auth.uid() with test user ID
    if (scenario.user.id) {
      expression = expression.replace(/auth\.uid\(\)/g, `'${scenario.user.id}'`);
    }

    // Replace auth.role() with test user role
    if (scenario.user.role) {
      expression = expression.replace(/auth\.role\(\)/g, `'${scenario.user.role}'`);
    }

    // Replace column references with test data
    for (const [column, value] of Object.entries(scenario.data)) {
      const regex = new RegExp(`\\b${column}\\b`, 'g');
      const sqlValue = typeof value === 'string' ? `'${value}'` : String(value);
      expression = expression.replace(regex, sqlValue);
    }

    return expression;
  }

  /**
   * Run multiple test scenarios
   */
  async runTests(
    config: RLSPolicyConfig,
    scenarios: TestScenario[]
  ): Promise<TestResult[]> {
    return Promise.all(
      scenarios.map((scenario) => this.testPolicy(config, scenario))
    );
  }

  /**
   * Generate test report
   */
  generateReport(results: TestResult[]): string {
    const passed = results.filter((r) => r.passed).length;

    let report = `Test Results: ${passed}/${results.length} passed\n\n`;

    results.forEach((result, index) => {
      const status = result.passed ? '✓' : '✗';
      report += `${status} Test ${index + 1}: ${result.passed ? 'PASSED' : 'FAILED'}\n`;
      report += `  Expected: ${result.expected}, Actual: ${result.actual}\n`;
      
      if (result.error) {
        report += `  Error: ${result.error}\n`;
      }
      
      report += '\n';
    });

    return report;
  }
}

