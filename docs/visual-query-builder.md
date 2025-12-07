# Visual Query Builder

## Overview

The Visual Query Builder is an adaptive, no-code UI for building RLS permission rules. It eliminates the need to write SQL or JSON by providing an intuitive, visual interface that automatically generates permission expressions.

## Key Features

### 1. **Zero SQL Required**
- Build complex permission rules without writing any SQL
- Visual field selection with type indicators
- Smart operator selection based on field types
- Automatic relationship traversal

### 2. **Relationship-Aware**
- Automatically detects foreign key relationships
- Shows available tables through relationships
- Displays relationship paths (e.g., "via user_id → users.id")
- Supports multi-table queries

### 3. **Three Editor Modes**

#### SQL Mode (Traditional)
- Raw SQL textarea for advanced users
- Direct control over the WHERE clause
- Useful for complex custom logic

#### Templates Mode (JSON Builder)
- Pre-built templates for common patterns
- User-Owned, Role-Based, Organization/Tenant
- JSON-based with visual preview
- Good for standard use cases

#### Visual Builder Mode (NEW!)
- Completely visual, no-code interface
- Drag-and-drop style condition building
- Real-time expression generation
- Perfect for non-technical users

### 4. **Smart Field Selector**

The field selector provides:
- **Table Selection**: Choose from base table or related tables
- **Relationship Hints**: Shows how tables are connected
- **Field List**: Visual list of all available columns
- **Type Indicators**: Icons and badges for field types
  - 🔑 Primary Key (PK badge)
  - 🔗 Foreign Key (FK badge)
  - 🆔 UUID fields
  - 📝 Text fields
  - 🔢 Numeric fields
  - ✓ Boolean fields
  - 📅 Date/Time fields

### 5. **Flexible Value Input**

Three value types supported:

#### Literal Values
- Direct value entry
- Comma-separated for IN/NOT IN operators
- Type-appropriate input validation

#### Session Variables
- Pre-populated dropdown with common variables:
  - `auth.uid()` - Current user ID (Supabase)
  - `current_user` - Database user
  - `current_setting('request.jwt.claims')::json->>'role'` - JWT role
  - `current_setting('request.jwt.claims')::json->>'org_id'` - JWT org ID
  - `current_setting('request.jwt.claims')::json->>'email'` - JWT email

#### Column References
- Reference other columns in comparisons
- Supports cross-table column references
- Format: `table.column`

### 6. **Logical Operators**

- **ALL (AND)**: Match all conditions
- **ANY (OR)**: Match any condition
- Easy toggle between modes
- Visual indicator of current mode

### 7. **Comparison Operators**

Full set of PostgreSQL operators:
- `=` equals
- `≠` not equals
- `>` greater than
- `≥` greater or equal
- `<` less than
- `≤` less or equal
- `∈` in list
- `∉` not in list
- `~` like (pattern matching)
- `~*` like (case-insensitive)
- `∅` is null

## Architecture

### Component Structure

```
VisualQueryBuilder.svelte (Main container)
├── ConditionRow.svelte (Individual condition)
│   ├── FieldSelector.svelte (Table & field selection)
│   └── ValueInput.svelte (Value entry with type tabs)
└── Logic toggle (AND/OR)
```

### Data Flow

1. **User Interaction** → Component state updates
2. **State Change** → `updateExpression()` called
3. **Expression Generation** → JSON permission expression created
4. **Callback** → `onUpdate()` sends expression to parent
5. **Parent Update** → Policy configuration updated
6. **SQL Generation** → Expression compiled to PostgreSQL

### Type Definitions

```typescript
interface Condition {
  id: string;
  field: string;
  tablePath: string[];  // e.g., ['posts', 'user']
  operator: string;
  value: any;
  valueType: 'literal' | 'session' | 'column';
}
```

## Usage Examples

### Example 1: User-Owned Records

**Visual Steps:**
1. Click "Add Condition"
2. Select field: `user_id`
3. Select operator: `=` equals
4. Select value type: "Session Variable"
5. Select value: "Current User ID (auth.uid())"

**Generated Expression:**
```json
{
  "user_id": {
    "_eq": { "var": "auth.uid()", "type": "uuid" }
  }
}
```

**Compiled SQL:**
```sql
user_id = auth.uid()
```

### Example 2: Multi-Condition with Relationships

**Visual Steps:**
1. Add Condition 1:
   - Table: `posts` (base)
   - Field: `published`
   - Operator: `=` equals
   - Value: `true`

2. Add Condition 2:
   - Table: `users` (via user_id → users.id)
   - Field: `role`
   - Operator: `∈` in list
   - Value: `admin, editor`

3. Set logic mode: ALL (AND)

**Generated Expression:**
```json
{
  "_and": [
    { "published": { "_eq": true } },
    { "user.role": { "_in": ["admin", "editor"] } }
  ]
}
```

### Example 3: Complex Permission

**Scenario:** Allow access if user owns the record OR user is an admin

**Visual Steps:**
1. Set logic mode: ANY (OR)
2. Add Condition 1: `user_id = auth.uid()`
3. Add Condition 2: `user.role = 'admin'` (via relationship)

**Generated Expression:**
```json
{
  "_or": [
    { "user_id": { "_eq": { "var": "auth.uid()" } } },
    { "user.role": { "_eq": "admin" } }
  ]
}
```

## Benefits

### For Non-Technical Users
- ✅ No SQL knowledge required
- ✅ Visual, intuitive interface
- ✅ Guided field selection
- ✅ Pre-populated session variables
- ✅ Immediate visual feedback

### For Developers
- ✅ Faster policy creation
- ✅ Fewer syntax errors
- ✅ Type-safe expressions
- ✅ Easy to modify and maintain
- ✅ Can switch to SQL mode anytime

### For Teams
- ✅ Consistent policy structure
- ✅ Self-documenting rules
- ✅ Easy to review and audit
- ✅ Reduces training time
- ✅ Enables collaboration

## Future Enhancements

Planned features:
- [ ] Drag-and-drop condition reordering
- [ ] Nested condition groups (AND within OR, etc.)
- [ ] Visual relationship graph
- [ ] Field value suggestions based on data
- [ ] Policy testing with sample data
- [ ] Import/export condition sets
- [ ] Condition templates library
- [ ] Real-time SQL preview
- [ ] Validation and error highlighting

