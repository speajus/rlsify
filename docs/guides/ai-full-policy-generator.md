# AI Full Policy Generator User Guide

The AI Full Policy Generator is a powerful feature that allows you to create complete RLS policies from natural language descriptions. Instead of manually configuring each field, you can describe what you want and let AI generate the entire policy structure.

## Overview

The AI Full Policy Generator can create:
- **Policy name** (following naming conventions)
- **Command(s)** (SELECT, INSERT, UPDATE, DELETE, or ALL)
- **Description** (human-readable explanation)
- **Roles** (e.g., `authenticated`, `public`, `admin`)
- **USING expression** (the access control logic)
- **WITH CHECK expression** (for INSERT/UPDATE operations)

## Getting Started

### 1. Set Up Your Auggie API Token

Before using AI features, you need an Auggie API token:

1. Run `auggie token print` in your terminal
2. Copy the entire JSON output (including `accessToken`, `tenantURL`, and `scopes`)
3. Paste it into the token input field in the UI
4. Click "Save Token"

The token is stored in your browser's localStorage and will be used for all AI requests.

### 2. Select a Table

Navigate to the Policy Configuration tab and select a table from the left sidebar. The AI Full Policy Generator will appear at the top of the configuration section.

### 3. Describe Your Policy

Click to expand the AI Full Policy Generator section and describe the access control policy you want to create. Be as specific or as general as you like.

## Example Prompts

### Simple Access Control

**Prompt:** "Users can only see their own posts"

**Generated Policy:**
- Name: `posts_select_own`
- Command: `SELECT`
- Description: "Allow users to view only their own posts"
- Roles: `authenticated`
- USING: `{"_eq": {"user_id": {"_session_var": "user_id"}}}`

### Multiple Operations (CRUD)

**Prompt:** "Users can CRUD their own posts"

**Generated Policies:** (4 separate policies)
1. `posts_select_own` - SELECT with user_id check
2. `posts_insert_own` - INSERT with user_id check
3. `posts_update_own` - UPDATE with user_id check
4. `posts_delete_own` - DELETE with user_id check

### Admin Access

**Prompt:** "Admins can do anything"

**Generated Policy:**
- Name: `posts_all_admin`
- Command: `ALL`
- Description: "Allow administrators full access to all posts"
- Roles: `admin`
- USING: `{"_eq": {"role": {"_session_var": "role"}, "_value": "admin"}}`

### Team-Based Access

**Prompt:** "Team members can view and edit posts in their team"

**Generated Policies:** (2 policies)
1. `posts_select_team` - SELECT with team_id join
2. `posts_update_team` - UPDATE with team_id join

## Reviewing Generated Policies

After the AI generates policies, you'll see a preview showing:

- **Policy name** - Following the `{table}_{command}_{purpose}` convention
- **Command badge** - Visual indicator of the operation type
- **Description** - Human-readable explanation
- **Roles** - Which database roles can use this policy
- **Expression details** - Expandable view of the JSON logic

### Actions

- **Accept All** - Add all generated policies to your configuration
- **Regenerate** - Try again with the same prompt (useful if the result isn't quite right)
- **Discard** - Cancel and start over

## Tips for Better Results

### Be Specific About Operations

Instead of: "Users can access their data"
Try: "Users can SELECT and UPDATE their own records"

### Mention Roles Explicitly

Instead of: "Only admins can delete"
Try: "Users with role 'admin' can DELETE any record"

### Describe Relationships

Instead of: "Team access"
Try: "Users can view posts where the post's team_id matches their team membership"

### Use Domain Language

The AI understands common patterns:
- "own records" → user_id matching
- "team members" → team_id joins
- "public access" → no restrictions
- "authenticated users" → logged-in users only

## Advanced Features

### Context Awareness

The AI is aware of:
- **Table name** - Automatically included in policy names
- **Existing policies** - Avoids creating duplicates
- **Common patterns** - Follows RLS best practices

### Multiple Policy Generation

When you describe CRUD operations, the AI automatically generates separate policies for each command. This follows PostgreSQL best practices where each operation has its own policy.

## Troubleshooting

### "No Auggie API token found"

Make sure you've saved your token using the token input field. The token should be a JSON object with `accessToken` and `tenantURL` fields.

### "The AI did not generate any policies"

Try rephrasing your prompt to be more specific. Include details about:
- Which operations (SELECT, INSERT, UPDATE, DELETE)
- Which roles should have access
- What conditions should apply

### Generated policy doesn't match expectations

Use the **Regenerate** button to try again, or click **Discard** and refine your prompt with more details.

## Integration with Existing Features

The AI Full Policy Generator works seamlessly with other rlsify features:

- **Manual editing** - After accepting AI-generated policies, you can still edit them manually
- **AI Expression Builder** - Use this to refine individual USING/WITH CHECK expressions
- **Visual mode** - Switch to visual mode to see the policy structure
- **Testing** - Generate test cases for your AI-created policies

## Best Practices

1. **Start simple** - Generate basic policies first, then refine
2. **Review before accepting** - Always check the generated expressions
3. **Test thoroughly** - Use the test generation feature to validate policies
4. **Iterate** - Use Regenerate if the first attempt isn't perfect
5. **Combine approaches** - Use AI for initial generation, then manual editing for fine-tuning

## Related Documentation

- [ADR 003: AI-Powered Full Policy Generation](../adr/003-ai-full-policy-generation.md) - Technical architecture
- [ADR 002: AI-Powered Policy Generation](../adr/002-ai-powered-policy-generation.md) - AI Expression Builder
- [RLS Policy Configuration Guide](./policy-configuration.md) - Manual policy creation

