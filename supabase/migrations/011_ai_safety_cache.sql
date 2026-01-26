-- AI Safety Check Migration
-- Adds verdict caching and per-user daily rate limiting for the AI Safety Check feature.
-- This is a targeted LLM-based sanity check for borderline Trust Filter results.

-- ─────────────────────────────────────────────
-- AI SAFETY VERDICTS CACHE
-- ─────────────────────────────────────────────
-- Stores AI verdicts for scan+match pairs to avoid redundant model calls.
-- Key: unique_key (scan_input_hash || match_input_hash || prompt_version)

CREATE TABLE IF NOT EXISTS ai_safety_verdicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Composite unique key for caching
  unique_key TEXT NOT NULL UNIQUE,
  
  -- Input hashes (from style signals)
  scan_input_hash TEXT NOT NULL,
  match_input_hash TEXT NOT NULL,
  
  -- Prompt version for cache invalidation on prompt changes
  prompt_version INTEGER NOT NULL DEFAULT 1,
  
  -- AI verdict result
  action TEXT NOT NULL CHECK (action IN ('keep', 'demote', 'hide')),
  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'ai_keep',           -- AI explicitly approves the pair
    'ai_sanity_veto',    -- AI vetoes: hide the pair
    'ai_sanity_demote',  -- AI demotes: lower confidence
    'timeout_fallback',  -- Timeout occurred, defaulted to keep
    'error_fallback'     -- Error occurred, defaulted to keep
  )),
  ai_confidence REAL,    -- Model's reported confidence (0.0-1.0)
  ai_reason TEXT,        -- Brief AI explanation (for debugging/telemetry)
  
  -- Source tracking for telemetry
  source TEXT NOT NULL DEFAULT 'ai_call' CHECK (source IN ('ai_call', 'cache_hit')),
  latency_ms INTEGER,    -- Time taken for AI call (NULL for cache hits)
  
  -- Model info
  model_id TEXT,         -- e.g., 'gpt-4o', 'gpt-4o-mini'
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cache lookups (primary path)
CREATE INDEX IF NOT EXISTS idx_ai_safety_verdicts_unique_key 
ON ai_safety_verdicts(unique_key);

-- Index for telemetry queries (by date, action)
CREATE INDEX IF NOT EXISTS idx_ai_safety_verdicts_created_at 
ON ai_safety_verdicts(created_at);

CREATE INDEX IF NOT EXISTS idx_ai_safety_verdicts_action 
ON ai_safety_verdicts(action);

-- Index for prompt version queries (for cache invalidation analysis)
CREATE INDEX IF NOT EXISTS idx_ai_safety_verdicts_prompt_version 
ON ai_safety_verdicts(prompt_version);

-- ─────────────────────────────────────────────
-- AI SAFETY USAGE (DAILY RATE LIMITING)
-- ─────────────────────────────────────────────
-- Tracks per-user daily AI call count to prevent abuse.
-- Only incremented on actual AI calls (not cache hits).

CREATE TABLE IF NOT EXISTS ai_safety_usage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Usage counters
  ai_calls INTEGER NOT NULL DEFAULT 0,      -- Actual AI API calls made
  cache_hits INTEGER NOT NULL DEFAULT 0,    -- Cache hits (not counted against limit)
  pairs_checked INTEGER NOT NULL DEFAULT 0, -- Total pairs evaluated
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique per user per day
  UNIQUE(user_id, day)
);

-- Index for rate limit checks (user + day lookup)
CREATE INDEX IF NOT EXISTS idx_ai_safety_usage_daily_user_day 
ON ai_safety_usage_daily(user_id, day);

-- ─────────────────────────────────────────────
-- HELPER FUNCTION: Check and increment rate limit
-- ─────────────────────────────────────────────
-- Returns: { allowed: boolean, current_count: integer, daily_limit: integer }
-- Atomically checks and increments the counter in one transaction.

CREATE OR REPLACE FUNCTION check_ai_safety_rate_limit(
  p_user_id UUID,
  p_daily_limit INTEGER DEFAULT 50,
  p_increment BOOLEAN DEFAULT TRUE
) RETURNS JSONB AS $$
DECLARE
  v_current_count INTEGER;
  v_allowed BOOLEAN;
  v_today DATE := CURRENT_DATE;
BEGIN
  -- Upsert the usage record and get current count
  INSERT INTO ai_safety_usage_daily (user_id, day, ai_calls)
  VALUES (p_user_id, v_today, 0)
  ON CONFLICT (user_id, day) DO NOTHING;
  
  -- Get current count
  SELECT ai_calls INTO v_current_count
  FROM ai_safety_usage_daily
  WHERE user_id = p_user_id AND day = v_today;
  
  v_allowed := v_current_count < p_daily_limit;
  
  -- Increment if allowed and requested
  IF v_allowed AND p_increment THEN
    UPDATE ai_safety_usage_daily
    SET ai_calls = ai_calls + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id AND day = v_today;
    
    v_current_count := v_current_count + 1;
  END IF;
  
  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'current_count', v_current_count,
    'daily_limit', p_daily_limit,
    'remaining', GREATEST(0, p_daily_limit - v_current_count)
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_ai_safety_rate_limit IS 'Check if user is within daily AI safety call limit. Optionally increment counter.';

-- ─────────────────────────────────────────────
-- HELPER FUNCTION: Increment cache hit counter
-- ─────────────────────────────────────────────
-- Called when a cache hit occurs (doesn't count against rate limit)

CREATE OR REPLACE FUNCTION increment_ai_safety_cache_hit(
  p_user_id UUID
) RETURNS VOID AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
BEGIN
  INSERT INTO ai_safety_usage_daily (user_id, day, cache_hits, pairs_checked)
  VALUES (p_user_id, v_today, 1, 1)
  ON CONFLICT (user_id, day) DO UPDATE
  SET cache_hits = ai_safety_usage_daily.cache_hits + 1,
      pairs_checked = ai_safety_usage_daily.pairs_checked + 1,
      updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_ai_safety_cache_hit IS 'Increment cache hit counter for telemetry (does not count against rate limit)';

-- ─────────────────────────────────────────────
-- HELPER FUNCTION: Increment pairs checked counter
-- ─────────────────────────────────────────────
-- Called after AI call to update pairs_checked

CREATE OR REPLACE FUNCTION increment_ai_safety_pairs_checked(
  p_user_id UUID,
  p_count INTEGER DEFAULT 1
) RETURNS VOID AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
BEGIN
  UPDATE ai_safety_usage_daily
  SET pairs_checked = pairs_checked + p_count,
      updated_at = NOW()
  WHERE user_id = p_user_id AND day = v_today;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_ai_safety_pairs_checked IS 'Increment pairs checked counter for telemetry';

-- ─────────────────────────────────────────────
-- CACHE LOOKUP HELPER
-- ─────────────────────────────────────────────
-- Looks up cached verdicts for multiple pairs at once

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
  WHERE v.unique_key = ANY(p_unique_keys);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_ai_safety_cached_verdicts IS 'Batch lookup of cached AI safety verdicts';

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────

ALTER TABLE ai_safety_verdicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_safety_usage_daily ENABLE ROW LEVEL SECURITY;

-- Verdicts: Anyone can read (for client-side cache checks), only service role can write
CREATE POLICY "Verdicts are readable by authenticated users" 
ON ai_safety_verdicts FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Verdicts are insertable by service role" 
ON ai_safety_verdicts FOR INSERT 
TO service_role 
WITH CHECK (true);

CREATE POLICY "Verdicts are updatable by service role" 
ON ai_safety_verdicts FOR UPDATE 
TO service_role 
USING (true);

-- Usage: Users can read their own usage, only service role can write
CREATE POLICY "Users can read own usage" 
ON ai_safety_usage_daily FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Usage insertable by service role" 
ON ai_safety_usage_daily FOR INSERT 
TO service_role 
WITH CHECK (true);

CREATE POLICY "Usage updatable by service role" 
ON ai_safety_usage_daily FOR UPDATE 
TO service_role 
USING (true);

-- ─────────────────────────────────────────────
-- COMMENTS
-- ─────────────────────────────────────────────

COMMENT ON TABLE ai_safety_verdicts IS 'Cache for AI Safety Check verdicts. Key: scan_hash+match_hash+prompt_version';
COMMENT ON TABLE ai_safety_usage_daily IS 'Per-user daily rate limiting for AI Safety Check calls';

COMMENT ON COLUMN ai_safety_verdicts.unique_key IS 'Composite cache key: scan_input_hash|match_input_hash|prompt_version';
COMMENT ON COLUMN ai_safety_verdicts.action IS 'AI verdict: keep | demote | hide';
COMMENT ON COLUMN ai_safety_verdicts.reason_code IS 'Reason code for analytics: ai_keep, ai_sanity_veto, ai_sanity_demote, timeout_fallback, error_fallback';
COMMENT ON COLUMN ai_safety_verdicts.ai_confidence IS 'Model confidence score (0.0-1.0)';
COMMENT ON COLUMN ai_safety_verdicts.ai_reason IS 'Brief AI explanation for debugging';
COMMENT ON COLUMN ai_safety_verdicts.source IS 'How verdict was obtained: ai_call or cache_hit';
COMMENT ON COLUMN ai_safety_verdicts.latency_ms IS 'Time taken for AI call (NULL for cache hits)';

COMMENT ON COLUMN ai_safety_usage_daily.ai_calls IS 'Actual AI API calls (counts against daily limit)';
COMMENT ON COLUMN ai_safety_usage_daily.cache_hits IS 'Cache hits (does not count against limit)';
COMMENT ON COLUMN ai_safety_usage_daily.pairs_checked IS 'Total pairs evaluated (ai_calls + cache_hits)';
