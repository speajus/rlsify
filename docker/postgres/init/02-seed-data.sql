-- RLSify Sample Data
-- This script populates the database with sample data to demonstrate multi-tenant access control

-- Insert Organizations
INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Acme Corporation', 'acme', NOW(), NOW()),
    ('22222222-2222-2222-2222-222222222222', 'TechStart Inc', 'techstart', NOW(), NOW()),
    ('33333333-3333-3333-3333-333333333333', 'Global Enterprises', 'global', NOW(), NOW());

-- Insert Users
INSERT INTO users (id, email, name, created_at, updated_at) VALUES
    -- Acme users
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@acme.com', 'Alice Anderson', NOW(), NOW()),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bob@acme.com', 'Bob Brown', NOW(), NOW()),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'carol@acme.com', 'Carol Chen', NOW(), NOW()),
    -- TechStart users
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'david@techstart.com', 'David Davis', NOW(), NOW()),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'emma@techstart.com', 'Emma Evans', NOW(), NOW()),
    -- Global users
    ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'frank@global.com', 'Frank Foster', NOW(), NOW()),
    ('99999999-9999-9999-9999-999999999999', 'grace@global.com', 'Grace Green', NOW(), NOW());

-- Insert Organization Members
INSERT INTO organization_members (id, organization_id, user_id, role, created_at) VALUES
    -- Acme members
    (uuid_generate_v4(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', NOW()),
    (uuid_generate_v4(), '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin', NOW()),
    (uuid_generate_v4(), '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'member', NOW()),
    -- TechStart members
    (uuid_generate_v4(), '22222222-2222-2222-2222-222222222222', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'owner', NOW()),
    (uuid_generate_v4(), '22222222-2222-2222-2222-222222222222', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'member', NOW()),
    -- Global members
    (uuid_generate_v4(), '33333333-3333-3333-3333-333333333333', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'owner', NOW()),
    (uuid_generate_v4(), '33333333-3333-3333-3333-333333333333', '99999999-9999-9999-9999-999999999999', 'admin', NOW());

-- Insert Teams
INSERT INTO teams (id, organization_id, name, slug, description, created_at, updated_at) VALUES
    -- Acme teams
    ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Engineering', 'engineering', 'Product development team', NOW(), NOW()),
    ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'Marketing', 'marketing', 'Marketing and growth team', NOW(), NOW()),
    -- TechStart teams
    ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'Product', 'product', 'Product team', NOW(), NOW()),
    -- Global teams
    ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333', 'Operations', 'operations', 'Operations team', NOW(), NOW());

-- Insert Team Members
INSERT INTO team_members (id, team_id, user_id, role, created_at) VALUES
    -- Acme Engineering team
    (uuid_generate_v4(), '44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', NOW()),
    (uuid_generate_v4(), '44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member', NOW()),
    -- Acme Marketing team
    (uuid_generate_v4(), '55555555-5555-5555-5555-555555555555', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'admin', NOW()),
    -- TechStart Product team
    (uuid_generate_v4(), '66666666-6666-6666-6666-666666666666', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'admin', NOW()),
    (uuid_generate_v4(), '66666666-6666-6666-6666-666666666666', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'member', NOW()),
    -- Global Operations team
    (uuid_generate_v4(), '77777777-7777-7777-7777-777777777777', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'admin', NOW()),
    (uuid_generate_v4(), '77777777-7777-7777-7777-777777777777', '99999999-9999-9999-9999-999999999999', 'member', NOW());

-- Insert Projects
INSERT INTO projects (id, team_id, name, description, status, created_by, created_at, updated_at) VALUES
    -- Acme Engineering projects
    (uuid_generate_v4(), '44444444-4444-4444-4444-444444444444', 'Mobile App', 'iOS and Android mobile application', 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NOW(), NOW()),
    (uuid_generate_v4(), '44444444-4444-4444-4444-444444444444', 'API Gateway', 'Microservices API gateway', 'active', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NOW(), NOW()),
    (uuid_generate_v4(), '44444444-4444-4444-4444-444444444444', 'Legacy Migration', 'Migrate from old system', 'archived', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NOW(), NOW()),
    -- Acme Marketing projects
    (uuid_generate_v4(), '55555555-5555-5555-5555-555555555555', 'Q4 Campaign', 'Holiday marketing campaign', 'active', 'cccccccc-cccc-cccc-cccc-cccccccccccc', NOW(), NOW()),
    -- TechStart Product projects
    (uuid_generate_v4(), '66666666-6666-6666-6666-666666666666', 'MVP Launch', 'Minimum viable product', 'completed', 'dddddddd-dddd-dddd-dddd-dddddddddddd', NOW(), NOW()),
    (uuid_generate_v4(), '66666666-6666-6666-6666-666666666666', 'Feature Expansion', 'Add new features', 'active', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', NOW(), NOW()),
    -- Global Operations projects
    (uuid_generate_v4(), '77777777-7777-7777-7777-777777777777', 'Infrastructure', 'Cloud infrastructure setup', 'active', 'ffffffff-ffff-ffff-ffff-ffffffffffff', NOW(), NOW());

-- Insert Documents
INSERT INTO documents (id, team_id, title, content, is_public, created_by, created_at, updated_at) VALUES
    -- Acme Engineering documents
    (uuid_generate_v4(), '44444444-4444-4444-4444-444444444444', 'Architecture Guide', 'System architecture documentation', FALSE, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NOW(), NOW()),
    (uuid_generate_v4(), '44444444-4444-4444-4444-444444444444', 'API Documentation', 'REST API endpoints and usage', TRUE, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NOW(), NOW()),
    -- Acme Marketing documents
    (uuid_generate_v4(), '55555555-5555-5555-5555-555555555555', 'Brand Guidelines', 'Company branding standards', TRUE, 'cccccccc-cccc-cccc-cccc-cccccccccccc', NOW(), NOW()),
    (uuid_generate_v4(), '55555555-5555-5555-5555-555555555555', 'Campaign Strategy', 'Internal campaign planning', FALSE, 'cccccccc-cccc-cccc-cccc-cccccccccccc', NOW(), NOW()),
    -- TechStart Product documents
    (uuid_generate_v4(), '66666666-6666-6666-6666-666666666666', 'Product Roadmap', 'Future product plans', FALSE, 'dddddddd-dddd-dddd-dddd-dddddddddddd', NOW(), NOW()),
    (uuid_generate_v4(), '66666666-6666-6666-6666-666666666666', 'User Guide', 'End-user documentation', TRUE, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', NOW(), NOW());

-- Insert Resources (for visual builder demo)
INSERT INTO resources (id, name, description, status, created_by, created_at, updated_at) VALUES
    -- Alice's resources
    (uuid_generate_v4(), 'Alice Resource 1', 'First resource owned by Alice', 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NOW(), NOW()),
    (uuid_generate_v4(), 'Alice Resource 2', 'Second resource owned by Alice', 'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NOW(), NOW()),
    (uuid_generate_v4(), 'Alice Archived', 'Archived resource', 'archived', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NOW(), NOW()),
    -- Bob's resources
    (uuid_generate_v4(), 'Bob Resource 1', 'First resource owned by Bob', 'active', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NOW(), NOW()),
    (uuid_generate_v4(), 'Bob Inactive', 'Inactive resource', 'inactive', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NOW(), NOW()),
    -- David's resources
    (uuid_generate_v4(), 'David Resource 1', 'First resource owned by David', 'active', 'dddddddd-dddd-dddd-dddd-dddddddddddd', NOW(), NOW());

