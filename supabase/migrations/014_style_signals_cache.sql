-- ============================================
-- STYLE SIGNALS CACHE BY IMAGE HASH
-- ============================================
-- Caches style signals by composite key:
--   (user_id, image_hash, prompt_version, model_version)
--
-- This ensures:
-- - Automatic invalidation when prompt/model changes (just bump version)
-- - Per-user isolation (RLS compatible)
-- - Same image analyzed with different prompts = different cache entries
-- ============================================

-- Drop old table if exists (schema changed from single-column to composite key)
DROP TABLE IF EXISTS style_signals_cache CASCADE;

-- Drop old functions if they exist (signature changed)
DROP FUNCTION IF EXISTS increment_style_signals_cache_hit(TEXT);
DROP FUNCTION IF EXISTS increment_style_signals_cache_hit(UUID, TEXT, INT, TEXT);

-- Create the cache table with composite primary key
CREATE TABLE style_signals_cache (
  -- User who generated this cache entry
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- SHA256 hash of the resized/normalized image bytes
  image_sha256 TEXT NOT NULL,
  
  -- Prompt version used to generate these signals
  -- Bump this when prompt changes = automatic invalidation
  prompt_version INT NOT NULL,
  
  -- Model version (e.g., "gpt-4o-mini" normalized to "4o-mini")
  model_version TEXT NOT NULL DEFAULT 'default',
  
  -- The cached style signals (StyleSignalsV1 JSON)
  style_signals JSONB NOT NULL,
  
  -- When the cache entry was created
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- When the cache entry was last updated (for UPSERT races)
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- How many times this cache entry has been used
  hit_count INT DEFAULT 0,
  
  -- Composite primary key: ensures uniqueness per user/hash/version combo
  PRIMARY KEY (user_id, image_sha256, prompt_version, model_version)
);

-- Index for cleanup queries (delete old entries)
CREATE INDEX idx_style_signals_cache_created_at 
  ON style_signals_cache(created_at);

-- Index for user lookups (RLS will filter by user_id anyway)
CREATE INDEX idx_style_signals_cache_user_id
  ON style_signals_cache(user_id);

-- ============================================
-- RPC: INCREMENT HIT COUNT (fire-and-forget)
-- ============================================

CREATE OR REPLACE FUNCTION increment_style_signals_cache_hit(
  p_user_id UUID,
  p_image_sha256 TEXT,
  p_prompt_version INT,
  p_model_version TEXT DEFAULT 'default'
)
RETURNS VOID AS $$
BEGIN
  UPDATE style_signals_cache
  SET hit_count = hit_count + 1
  WHERE user_id = p_user_id
    AND image_sha256 = p_image_sha256
    AND prompt_version = p_prompt_version
    AND model_version = p_model_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RPC: CLEANUP OLD ENTRIES
-- ============================================
-- Call periodically to remove entries older than retention period

CREATE OR REPLACE FUNCTION cleanup_style_signals_cache(
  p_retention_days INT DEFAULT 30
)
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM style_signals_cache
  WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RLS POLICIES
-- ============================================
-- Users can only access their own cache entries

ALTER TABLE style_signals_cache ENABLE ROW LEVEL SECURITY;

-- Users can read their own cache entries
CREATE POLICY "Users can read own style signals cache"
  ON style_signals_cache FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own cache entries
CREATE POLICY "Users can insert own style signals cache"
  ON style_signals_cache FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own cache entries (for UPSERT and hit_count)
CREATE POLICY "Users can update own style signals cache"
  ON style_signals_cache FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE style_signals_cache IS 
  'Cache for style signals by (user_id, image_hash, prompt_version, model_version). Avoids repeated AI calls for same image.';

COMMENT ON COLUMN style_signals_cache.user_id IS 
  'User who generated this cache entry. RLS enforces per-user isolation.';

COMMENT ON COLUMN style_signals_cache.image_sha256 IS 
  'SHA256 hash of the resized/normalized image bytes (same bytes sent to API).';

COMMENT ON COLUMN style_signals_cache.prompt_version IS 
  'Version of the style signals prompt. Bump to invalidate old entries.';

COMMENT ON COLUMN style_signals_cache.model_version IS 
  'Model used for generation (e.g., "4o-mini"). Bump to invalidate when model changes.';

COMMENT ON COLUMN style_signals_cache.style_signals IS 
  'Cached StyleSignalsV1 JSON containing aesthetic, formality, etc.';
