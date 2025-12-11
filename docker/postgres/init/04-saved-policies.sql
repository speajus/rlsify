-- ============================================================================
-- Saved RLS Policies Table
-- ============================================================================
-- This table stores user-created RLS policy configurations

CREATE TABLE IF NOT EXISTS saved_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on table name for filtering
CREATE INDEX IF NOT EXISTS idx_saved_policies_table 
    ON saved_policies ((config->>'table'));

-- Index on updated_at for sorting
CREATE INDEX IF NOT EXISTS idx_saved_policies_updated_at 
    ON saved_policies (updated_at DESC);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_saved_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_saved_policies_updated_at ON saved_policies;
CREATE TRIGGER trigger_saved_policies_updated_at
    BEFORE UPDATE ON saved_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_saved_policies_updated_at();

-- Grant permissions (adjust as needed for your auth setup)
GRANT ALL ON saved_policies TO PUBLIC;

