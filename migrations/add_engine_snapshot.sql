-- TEMPORARY: Add engine_snapshot column for debug snapshots
-- Run this migration in your Supabase SQL editor
-- Remove this file when debug snapshot feature is removed

ALTER TABLE recent_checks 
ADD COLUMN IF NOT EXISTS engine_snapshot JSONB;

-- Optional: Add comment for documentation
COMMENT ON COLUMN recent_checks.engine_snapshot IS 'TEMPORARY: Debug snapshot of engine evaluation results';

