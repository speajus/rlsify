/**
 * TemplateRegistry - Registry for RLS policy templates
 */

import type { PolicyTemplate, TemplateType } from '@speajus/rlsify-types';
import { userOwnedTemplate } from './user-owned.js';
import { roleBasedTemplate } from './role-based.js';
import { organizationTemplate } from './organization.js';
import { teamBasedTemplate } from './team-based.js';

export class TemplateRegistry {
  private templates: Map<string, PolicyTemplate> = new Map();

  constructor() {
    this.registerDefaultTemplates();
  }

  /**
   * Register default templates
   */
  private registerDefaultTemplates(): void {
    this.register(userOwnedTemplate);
    this.register(roleBasedTemplate);
    this.register(organizationTemplate);
    this.register(teamBasedTemplate);
  }

  /**
   * Register a template
   */
  register(template: PolicyTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Get template by ID
   */
  get(id: string): PolicyTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Get all templates
   */
  getAll(): PolicyTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get templates by type
   */
  getByType(type: TemplateType): PolicyTemplate[] {
    return this.getAll().filter((t) => t.type === type);
  }

  /**
   * Apply template with variables
   */
  apply(
    templateId: string,
    variables: Record<string, any>
  ): any {
    const template = this.get(templateId);
    
    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }

    // Validate required variables
    const missing = template.variables
      .filter((v) => v.required && !(v.name in variables))
      .map((v) => v.name);

    if (missing.length > 0) {
      throw new Error(`Missing required variables: ${missing.join(', ')}`);
    }

    // Clone config and replace variables
    const config = JSON.parse(JSON.stringify(template.config));
    return this.replaceVariables(config, variables);
  }

  /**
   * Replace variables in configuration
   */
  private replaceVariables(obj: any, variables: Record<string, any>): any {
    if (typeof obj === 'string') {
      // Replace {{variable}} placeholders
      return obj.replace(/\{\{(\w+)\}\}/g, (_, name) => {
        return variables[name] !== undefined ? variables[name] : `{{${name}}}`;
      });
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.replaceVariables(item, variables));
    }

    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.replaceVariables(value, variables);
      }
      return result;
    }

    return obj;
  }
}

