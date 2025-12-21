-- ============================================================================
-- Saved Test Cases Table
-- ============================================================================
-- This table stores user-created test cases for RLS policy testing

CREATE TABLE IF NOT EXISTS saved_test_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name TEXT NOT NULL,  -- schema.table format
    test_cases JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(table_name)
);

-- Index on table_name for lookups
CREATE INDEX IF NOT EXISTS idx_saved_test_cases_table 
    ON saved_test_cases (table_name);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_saved_test_cases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_saved_test_cases_updated_at ON saved_test_cases;
CREATE TRIGGER trigger_saved_test_cases_updated_at
    BEFORE UPDATE ON saved_test_cases
    FOR EACH ROW
    EXECUTE FUNCTION update_saved_test_cases_updated_at();

-- Grant permissions
GRANT ALL ON saved_test_cases TO PUBLIC;

