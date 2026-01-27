-- Migration: Add finalized match count columns to recent_checks
-- These store the final match counts after Trust Filter + AI Safety
-- Used by useMatchCount for consistent badge display

-- ─────────────────────────────────────────────
-- ADD FINALIZED COUNT COLUMNS
-- ─────────────────────────────────────────────

ALTER TABLE recent_checks
ADD COLUMN IF NOT EXISTS final_high_count INT DEFAULT NULL;

ALTER TABLE recent_checks
ADD COLUMN IF NOT EXISTS final_near_count INT DEFAULT NULL;

ALTER TABLE recent_checks
ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ DEFAULT NULL;

-- JSONB for mode flags: { tf_enabled, ai_enabled, ai_dry_run }
-- Allows future decisions about whether to trust old counts
ALTER TABLE recent_checks
ADD COLUMN IF NOT EXISTS finalized_flags JSONB DEFAULT NULL;

-- ─────────────────────────────────────────────
-- COMMENTS
-- ─────────────────────────────────────────────

COMMENT ON COLUMN recent_checks.final_high_count IS 'Count of HIGH matches after TF + AI Safety (displayed in "Wear now" tab)';
COMMENT ON COLUMN recent_checks.final_near_count IS 'Count of NEAR matches after TF + AI Safety (displayed in "Worth trying" tab)';
COMMENT ON COLUMN recent_checks.finalized_at IS 'Timestamp when counts were last computed';
COMMENT ON COLUMN recent_checks.finalized_flags IS 'Mode flags at computation time: { tf_enabled, ai_enabled, ai_dry_run }';

-- ─────────────────────────────────────────────
-- INDEX for quick lookup of checks with/without counts
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_recent_checks_finalized_at
ON recent_checks(finalized_at)
WHERE finalized_at IS NOT NULL;
