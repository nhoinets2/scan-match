-- ============================================
-- PERSONALIZED SUGGESTIONS CACHE
-- ============================================
-- Caches AI-generated personalized styling suggestions
-- by composite key: (user_id, cache_key)
--
-- cache_key is a SHA-256 hash of:
--   scanId|topK_ids_sorted_joined|wardrobeUpdatedAt|promptVersion|schemaVersion
--
-- This ensures:
-- - Automatic invalidation when prompt/schema changes
-- - Automatic invalidation when wardrobe changes
-- - Per-user isolation (different users can't see each other's suggestions)
-- - Hard TTL via expires_at column
-- ============================================

CREATE TABLE personalized_suggestions_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- SHA-256 hash of input parameters (64 chars)
  -- Format: sha256(scanId|topIds|wardrobeUpdatedAt|promptVersion|schemaVersion)
  cache_key TEXT NOT NULL,
  
  -- Structured response: { version, why_it_works[], to_elevate[] }
  suggestions JSONB NOT NULL,
  
  -- Versioning for invalidation (included in cache_key, but stored for debugging)
  prompt_version INT NOT NULL DEFAULT 1,
  schema_version INT NOT NULL DEFAULT 1,
  
  -- Telemetry
  latency_ms INT,
  source TEXT NOT NULL DEFAULT 'ai_call',
  
  -- Timestamps and hit tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  hit_count INT NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  
  -- Optional: for debugging/analytics
  scan_id TEXT
);

-- ============================================
-- INDEXES
-- ============================================

-- IMPORTANT: Uniqueness is per-user, not global
-- (two users could theoretically have same scanId + topIds)
CREATE UNIQUE INDEX uq_suggestions_user_cache_key
  ON personalized_suggestions_cache(user_id, cache_key);

-- For user lookups (RLS will filter by user_id)
CREATE INDEX idx_suggestions_cache_user 
  ON personalized_suggestions_cache(user_id);

-- For cleanup queries (delete expired entries)
CREATE INDEX idx_suggestions_expires 
  ON personalized_suggestions_cache(expires_at);

-- For analytics (optional - can be dropped if not needed)
CREATE INDEX idx_suggestions_cache_created_at
  ON personalized_suggestions_cache(created_at);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE personalized_suggestions_cache ENABLE ROW LEVEL SECURITY;

-- Users can read their own suggestions
CREATE POLICY "Users can read own suggestions"
  ON personalized_suggestions_cache FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own (for hit_count, last_hit_at via RPC)
CREATE POLICY "Users can update own suggestions"
  ON personalized_suggestions_cache FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- NOTE: INSERT is done via Edge Function using service role (bypasses RLS)
-- This ensures only the Edge Function can create cache entries after AI call.
-- If you want RLS-only (no service role), uncomment:
-- CREATE POLICY "Users can insert own suggestions"
--   ON personalized_suggestions_cache FOR INSERT
--   TO authenticated
--   WITH CHECK (auth.uid() = user_id);

-- ============================================
-- RPC: INCREMENT CACHE HIT
-- ============================================
-- Called by client when cache hit occurs.
-- SECURITY: Only allows incrementing for the calling user's own cache entries.
-- This prevents users from bumping other users' cache hit counts.

CREATE OR REPLACE FUNCTION increment_suggestions_cache_hit(
  p_cache_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only update rows belonging to the calling user (auth.uid())
  -- This prevents users from bumping other users' cache hit counts
  UPDATE personalized_suggestions_cache
  SET hit_count = hit_count + 1,
      last_hit_at = now()
  WHERE user_id = auth.uid()
    AND cache_key = p_cache_key
    AND expires_at > now();  -- Don't count hits on expired entries
END;
$$;

-- Revoke default PUBLIC execute, grant only to authenticated users
REVOKE EXECUTE ON FUNCTION increment_suggestions_cache_hit(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_suggestions_cache_hit(TEXT) TO authenticated;

-- ============================================
-- RPC: CLEANUP EXPIRED CACHE ENTRIES
-- ============================================
-- Maintenance function to remove expired/old entries.
-- Only callable by service role (scheduled job) or admin.
-- NOT granted to authenticated users.

CREATE OR REPLACE FUNCTION cleanup_suggestions_cache(
  retention_days INT DEFAULT 30
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  deleted_count INT;
BEGIN
  DELETE FROM personalized_suggestions_cache
  WHERE expires_at < now()
     OR created_at < now() - (retention_days || ' days')::interval;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Revoke public access - this is a maintenance function
REVOKE EXECUTE ON FUNCTION cleanup_suggestions_cache(INT) FROM PUBLIC;
-- Service role has access by default (SECURITY DEFINER)

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE personalized_suggestions_cache IS 
  'Cache for AI-generated personalized styling suggestions by (user_id, cache_key). Avoids repeated AI calls for same match context.';

COMMENT ON COLUMN personalized_suggestions_cache.user_id IS 
  'User who generated this cache entry. RLS enforces per-user isolation.';

COMMENT ON COLUMN personalized_suggestions_cache.cache_key IS 
  'SHA-256 hash of: scanId|topIds|wardrobeUpdatedAt|promptVersion|schemaVersion';

COMMENT ON COLUMN personalized_suggestions_cache.suggestions IS 
  'Cached PersonalizedSuggestions JSON: { version, why_it_works[], to_elevate[] }';

COMMENT ON COLUMN personalized_suggestions_cache.prompt_version IS 
  'Version of the suggestions prompt used. Stored for debugging (also in cache_key).';

COMMENT ON COLUMN personalized_suggestions_cache.schema_version IS 
  'Version of the output schema used. Stored for debugging (also in cache_key).';

COMMENT ON COLUMN personalized_suggestions_cache.expires_at IS 
  'Hard TTL - cache entries are not served after this time. Default 7 days.';

COMMENT ON COLUMN personalized_suggestions_cache.hit_count IS 
  'Number of times this cache entry has been reused. For analytics.';

COMMENT ON COLUMN personalized_suggestions_cache.last_hit_at IS 
  'When this cache entry was last hit. For analytics and potential LRU cleanup.';

COMMENT ON FUNCTION increment_suggestions_cache_hit(TEXT) IS 
  'Increment hit count for a cache entry. Only updates entries owned by calling user.';

COMMENT ON FUNCTION cleanup_suggestions_cache(INT) IS 
  'Remove expired cache entries. Call periodically via scheduled job.';
