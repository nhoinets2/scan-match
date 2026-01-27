-- ============================================
-- STYLE SIGNALS CACHE BY IMAGE HASH
-- ============================================
-- Caches style signals by image hash (SHA256) to avoid
-- repeated AI calls when scanning the same image multiple times.
--
-- Similar to clothing_image_analysis_cache but for style signals.
-- ============================================

-- Create the cache table
CREATE TABLE IF NOT EXISTS style_signals_cache (
  -- Primary key: SHA256 hash of the image (hex string)
  image_sha256 TEXT PRIMARY KEY,
  
  -- The cached style signals (StyleSignalsV1 JSON)
  style_signals JSONB NOT NULL,
  
  -- Prompt version used to generate these signals
  -- Allows invalidation when prompt changes
  prompt_version INT NOT NULL DEFAULT 1,
  
  -- When the cache entry was created
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- How many times this cache entry has been used
  hit_count INT DEFAULT 0
);

-- Index for cleanup queries (delete old entries)
CREATE INDEX IF NOT EXISTS idx_style_signals_cache_created_at 
  ON style_signals_cache(created_at);

-- Index for prompt version (for invalidation queries)
CREATE INDEX IF NOT EXISTS idx_style_signals_cache_prompt_version
  ON style_signals_cache(prompt_version);

-- ============================================
-- RPC: INCREMENT HIT COUNT (fire-and-forget)
-- ============================================

CREATE OR REPLACE FUNCTION increment_style_signals_cache_hit(p_image_sha256 TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE style_signals_cache
  SET hit_count = hit_count + 1
  WHERE image_sha256 = p_image_sha256;
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
-- Style signals cache is global (shared across users)
-- Only authenticated users can read/write

ALTER TABLE style_signals_cache ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read cache (for lookups)
CREATE POLICY "Authenticated users can read style signals cache"
  ON style_signals_cache FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert into cache
CREATE POLICY "Authenticated users can insert style signals cache"
  ON style_signals_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update hit_count
CREATE POLICY "Authenticated users can update style signals cache"
  ON style_signals_cache FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE style_signals_cache IS 
  'Cache for style signals by image hash. Avoids repeated AI calls for same image.';

COMMENT ON COLUMN style_signals_cache.image_sha256 IS 
  'SHA256 hash of the image (hex string, same hash used for analysis cache)';

COMMENT ON COLUMN style_signals_cache.style_signals IS 
  'Cached StyleSignalsV1 JSON containing aesthetic, formality, etc.';

COMMENT ON COLUMN style_signals_cache.prompt_version IS 
  'Version of the style signals prompt used. Bump when prompt changes to invalidate old entries.';
