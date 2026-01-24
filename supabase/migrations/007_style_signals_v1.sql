-- Style Signals v1 Migration (Epic 1)
-- Adds style_signals_v1 columns to wardrobe_items and recent_checks tables
-- For Trust Filter v1 aesthetic/formality/statement/season evaluation

-- ─────────────────────────────────────────────
-- ADD STYLE SIGNALS COLUMNS TO wardrobe_items
-- ─────────────────────────────────────────────

-- JSONB column for the style signals data (see StyleSignalsV1 schema in types.ts)
ALTER TABLE wardrobe_items
ADD COLUMN IF NOT EXISTS style_signals_v1 JSONB;

-- Version tracking (allows future schema evolution)
ALTER TABLE wardrobe_items
ADD COLUMN IF NOT EXISTS style_signals_version INTEGER DEFAULT 1;

-- Processing status for async enrichment
-- none: not yet processed
-- processing: currently being analyzed
-- ready: signals available and valid
-- failed: analysis failed (see error column)
ALTER TABLE wardrobe_items
ADD COLUMN IF NOT EXISTS style_signals_status TEXT DEFAULT 'none'
CHECK (style_signals_status IN ('none', 'processing', 'ready', 'failed'));

-- Timestamp of last signal update
ALTER TABLE wardrobe_items
ADD COLUMN IF NOT EXISTS style_signals_updated_at TIMESTAMPTZ;

-- Source of the signals
-- scan_ai: Generated during scan analysis
-- wardrobe_ai: Generated via lazy enrichment
-- user_override: Manually set by user (future feature)
ALTER TABLE wardrobe_items
ADD COLUMN IF NOT EXISTS style_signals_source TEXT
CHECK (style_signals_source IN ('scan_ai', 'wardrobe_ai', 'user_override'));

-- Error message if analysis failed
ALTER TABLE wardrobe_items
ADD COLUMN IF NOT EXISTS style_signals_error TEXT;

-- Prompt version for cache invalidation
ALTER TABLE wardrobe_items
ADD COLUMN IF NOT EXISTS style_signals_prompt_version INTEGER DEFAULT 1;

-- Input hash for caching (hash of image URL + updatedAt)
ALTER TABLE wardrobe_items
ADD COLUMN IF NOT EXISTS style_signals_input_hash TEXT;

-- ─────────────────────────────────────────────
-- ADD STYLE SIGNALS COLUMNS TO recent_checks
-- ─────────────────────────────────────────────

-- JSONB column for the style signals data
ALTER TABLE recent_checks
ADD COLUMN IF NOT EXISTS style_signals_v1 JSONB;

-- Version tracking
ALTER TABLE recent_checks
ADD COLUMN IF NOT EXISTS style_signals_version INTEGER DEFAULT 1;

-- Processing status
ALTER TABLE recent_checks
ADD COLUMN IF NOT EXISTS style_signals_status TEXT DEFAULT 'none'
CHECK (style_signals_status IN ('none', 'processing', 'ready', 'failed'));

-- Timestamp of last signal update
ALTER TABLE recent_checks
ADD COLUMN IF NOT EXISTS style_signals_updated_at TIMESTAMPTZ;

-- Source of the signals
ALTER TABLE recent_checks
ADD COLUMN IF NOT EXISTS style_signals_source TEXT
CHECK (style_signals_source IN ('scan_ai', 'wardrobe_ai', 'user_override'));

-- Error message if analysis failed
ALTER TABLE recent_checks
ADD COLUMN IF NOT EXISTS style_signals_error TEXT;

-- Prompt version for cache invalidation
ALTER TABLE recent_checks
ADD COLUMN IF NOT EXISTS style_signals_prompt_version INTEGER DEFAULT 1;

-- Input hash for caching
ALTER TABLE recent_checks
ADD COLUMN IF NOT EXISTS style_signals_input_hash TEXT;

-- ─────────────────────────────────────────────
-- INDEXES FOR EFFICIENT QUERIES
-- ─────────────────────────────────────────────

-- Index for finding items that need enrichment (status != ready)
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_style_signals_status 
ON wardrobe_items(style_signals_status) 
WHERE style_signals_status != 'ready';

CREATE INDEX IF NOT EXISTS idx_recent_checks_style_signals_status 
ON recent_checks(style_signals_status) 
WHERE style_signals_status != 'ready';

-- Index for cache lookups by input hash
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_style_signals_hash 
ON wardrobe_items(style_signals_input_hash) 
WHERE style_signals_input_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recent_checks_style_signals_hash 
ON recent_checks(style_signals_input_hash) 
WHERE style_signals_input_hash IS NOT NULL;

-- GIN index for querying inside JSONB (e.g., find all "western" items)
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_style_signals_gin 
ON wardrobe_items USING GIN (style_signals_v1);

CREATE INDEX IF NOT EXISTS idx_recent_checks_style_signals_gin 
ON recent_checks USING GIN (style_signals_v1);

-- ─────────────────────────────────────────────
-- COMMENTS FOR DOCUMENTATION
-- ─────────────────────────────────────────────

COMMENT ON COLUMN wardrobe_items.style_signals_v1 IS 'StyleSignalsV1 JSONB: aesthetic (primary/secondary), formality, statement, season, pattern, material, palette';
COMMENT ON COLUMN wardrobe_items.style_signals_version IS 'Schema version (1 = v1). Allows future migrations without breaking existing data';
COMMENT ON COLUMN wardrobe_items.style_signals_status IS 'Processing status: none | processing | ready | failed';
COMMENT ON COLUMN wardrobe_items.style_signals_updated_at IS 'Timestamp of last successful signal update';
COMMENT ON COLUMN wardrobe_items.style_signals_source IS 'How signals were generated: scan_ai | wardrobe_ai | user_override';
COMMENT ON COLUMN wardrobe_items.style_signals_error IS 'Error message if status = failed';
COMMENT ON COLUMN wardrobe_items.style_signals_prompt_version IS 'AI prompt version used. If < current version, treat as outdated';
COMMENT ON COLUMN wardrobe_items.style_signals_input_hash IS 'Hash of image URL + updatedAt for cache invalidation';

COMMENT ON COLUMN recent_checks.style_signals_v1 IS 'StyleSignalsV1 JSONB for scanned item';
COMMENT ON COLUMN recent_checks.style_signals_version IS 'Schema version (1 = v1)';
COMMENT ON COLUMN recent_checks.style_signals_status IS 'Processing status: none | processing | ready | failed';
COMMENT ON COLUMN recent_checks.style_signals_updated_at IS 'Timestamp of last successful signal update';
COMMENT ON COLUMN recent_checks.style_signals_source IS 'How signals were generated: scan_ai | wardrobe_ai | user_override';
COMMENT ON COLUMN recent_checks.style_signals_error IS 'Error message if status = failed';
COMMENT ON COLUMN recent_checks.style_signals_prompt_version IS 'AI prompt version used';
COMMENT ON COLUMN recent_checks.style_signals_input_hash IS 'Hash of image URL + updatedAt for cache invalidation';

-- ─────────────────────────────────────────────
-- HELPER FUNCTION: Check if signals are valid
-- ─────────────────────────────────────────────
-- Returns true if style signals are ready and not outdated

CREATE OR REPLACE FUNCTION has_valid_style_signals(
  p_status TEXT,
  p_prompt_version INTEGER,
  p_current_prompt_version INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN p_status = 'ready' AND p_prompt_version >= p_current_prompt_version;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION has_valid_style_signals IS 'Check if style signals are ready and not outdated by prompt version';

-- ─────────────────────────────────────────────
-- NOTES
-- ─────────────────────────────────────────────
-- 
-- StyleSignalsV1 JSON Schema:
-- {
--   "version": 1,
--   "aesthetic": {
--     "primary": "<archetype|unknown>",
--     "primary_confidence": <0..1>,
--     "secondary": "<archetype|none|unknown>",
--     "secondary_confidence": <0..1>
--   },
--   "formality": { "band": "<enum>", "confidence": <0..1> },
--   "statement": { "level": "<enum>", "confidence": <0..1> },
--   "season": { "heaviness": "<enum>", "confidence": <0..1> },
--   "palette": { "colors": ["<color>", ...], "confidence": <0..1> },
--   "pattern": { "level": "<enum>", "confidence": <0..1> },
--   "material": { "family": "<enum>", "confidence": <0..1> }
-- }
--
-- Aesthetic archetypes (12):
-- minimalist, classic, workwear, romantic, boho, western,
-- street, sporty, edgy, glam, preppy, outdoor_utility
--
-- Plus special values: unknown, none (for secondary only)
--
-- See src/lib/trust-filter/types.ts for full TypeScript definitions.
