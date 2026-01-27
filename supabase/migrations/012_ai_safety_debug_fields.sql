-- AI Safety Debug Fields Migration
-- Adds expires_at column for explicit TTL tracking and debugging.

-- ─────────────────────────────────────────────
-- ADD EXPIRES_AT COLUMN
-- ─────────────────────────────────────────────
-- This allows explicit TTL tracking rather than relying on implicit TTL.
-- Default: 7 days from creation (adjustable via server config)

ALTER TABLE ai_safety_verdicts
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Backfill existing rows with 7-day TTL from created_at
UPDATE ai_safety_verdicts
SET expires_at = created_at + INTERVAL '7 days'
WHERE expires_at IS NULL;

-- Set default for new rows
ALTER TABLE ai_safety_verdicts
ALTER COLUMN expires_at SET DEFAULT NOW() + INTERVAL '7 days';

-- ─────────────────────────────────────────────
-- ADD INDEX FOR EXPIRY QUERIES
-- ─────────────────────────────────────────────
-- Useful for cache cleanup jobs and debugging queries

CREATE INDEX IF NOT EXISTS idx_ai_safety_verdicts_expires_at
ON ai_safety_verdicts(expires_at);

-- ─────────────────────────────────────────────
-- UPDATE CACHE LOOKUP FUNCTION
-- ─────────────────────────────────────────────
-- Now excludes expired verdicts from cache hits

CREATE OR REPLACE FUNCTION get_ai_safety_cached_verdicts(
  p_unique_keys TEXT[]
) RETURNS TABLE (
  unique_key TEXT,
  action TEXT,
  reason_code TEXT,
  ai_confidence REAL,
  ai_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.unique_key,
    v.action,
    v.reason_code,
    v.ai_confidence,
    v.ai_reason
  FROM ai_safety_verdicts v
  WHERE v.unique_key = ANY(p_unique_keys)
    AND (v.expires_at IS NULL OR v.expires_at > NOW());
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_ai_safety_cached_verdicts IS 'Batch lookup of non-expired AI safety verdicts';

-- ─────────────────────────────────────────────
-- CACHE CLEANUP FUNCTION (Optional)
-- ─────────────────────────────────────────────
-- Can be called periodically to remove expired verdicts

CREATE OR REPLACE FUNCTION cleanup_expired_ai_safety_verdicts(
  p_batch_size INTEGER DEFAULT 1000
) RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM ai_safety_verdicts
    WHERE id IN (
      SELECT id FROM ai_safety_verdicts
      WHERE expires_at < NOW()
      LIMIT p_batch_size
    )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;
  
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_ai_safety_verdicts IS 'Remove expired AI safety verdicts in batches. Returns count of deleted rows.';

-- ─────────────────────────────────────────────
-- COMMENTS
-- ─────────────────────────────────────────────

COMMENT ON COLUMN ai_safety_verdicts.expires_at IS 'When this verdict expires (default: 7 days from creation). Expired verdicts are excluded from cache lookups.';
