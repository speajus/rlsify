-- Authentication Helper Functions
-- These functions simulate Supabase auth.uid() for testing RLS policies

-- Create a schema for auth helpers
CREATE SCHEMA IF NOT EXISTS auth;

-- Function to get current user ID (simulates auth.uid())
-- In a real Supabase environment, this would return the authenticated user's ID
-- For testing, we'll use a session variable
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID AS $$
BEGIN
    -- Get the user ID from the session variable
    -- Set this with: SET LOCAL auth.current_user_id = 'user-uuid';
    RETURN NULLIF(current_setting('auth.current_user_id', TRUE), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to set the current user for testing
CREATE OR REPLACE FUNCTION auth.set_user(user_id UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('auth.current_user_id', user_id::TEXT, FALSE);
END;
$$ LANGUAGE plpgsql;

-- Function to clear the current user
CREATE OR REPLACE FUNCTION auth.clear_user()
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('auth.current_user_id', '', FALSE);
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT USAGE ON SCHEMA auth TO rlsify;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO rlsify;

-- Create a view to show current user info (helpful for debugging)
CREATE OR REPLACE VIEW auth.current_user_info AS
SELECT 
    auth.uid() AS user_id,
    u.email,
    u.name
FROM users u
WHERE u.id = auth.uid();

GRANT SELECT ON auth.current_user_info TO rlsify;

-- Example usage comments
COMMENT ON FUNCTION auth.uid() IS 'Returns the current authenticated user ID. Use auth.set_user(uuid) to set the user for testing.';
COMMENT ON FUNCTION auth.set_user(UUID) IS 'Set the current user for testing RLS policies. Example: SELECT auth.set_user(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'');';
COMMENT ON FUNCTION auth.clear_user() IS 'Clear the current user. Example: SELECT auth.clear_user();';

