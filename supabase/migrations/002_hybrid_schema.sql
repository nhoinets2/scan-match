-- Hybrid Schema Migration: Volume + Shape + Length + Tier
-- Run this AFTER 001_library_items.sql
-- This adds the new hybrid schema fields and deprecates old ones

-- ─────────────────────────────────────────────
-- ADD NEW COLUMNS
-- ─────────────────────────────────────────────

-- Volume: How the garment fits the body (universal across categories)
ALTER TABLE library_items
ADD COLUMN IF NOT EXISTS volume TEXT
CHECK (volume IN ('fitted', 'regular', 'oversized', 'unknown'));

-- Shape: Category-specific garment cut/style
-- Allowed values depend on category (enforced in app, not DB)
-- bottoms: skinny, straight, wide, tapered, flare, cargo
-- skirts: pencil, a_line, pleated
-- dresses: slip, wrap, shirt, bodycon, fit_flare
-- shoes: low_profile, chunky, heeled, boot
ALTER TABLE library_items
ADD COLUMN IF NOT EXISTS shape TEXT;

-- Length: Garment length (category-scoped)
-- tops: cropped, regular, longline
-- outerwear: cropped, regular, long
-- dresses/skirts: mini, midi, maxi
ALTER TABLE library_items
ADD COLUMN IF NOT EXISTS length TEXT;

-- Tier: Item classification for maintainability and auditing
-- Helps answer "why is this rank 10?" without guessing
-- core: Universal basics (rank 10-20) - 1-3 items per category
-- staple: Versatile everyday pieces (rank 30-50)
-- style: Vibe-specific items (rank 60-80)
-- statement: Bold, specific use cases (rank 90+)
ALTER TABLE library_items
ADD COLUMN IF NOT EXISTS tier TEXT
CHECK (tier IN ('core', 'staple', 'style', 'statement'));

-- ─────────────────────────────────────────────
-- CREATE INDEXES FOR NEW COLUMNS
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_library_items_volume ON library_items(volume);
CREATE INDEX IF NOT EXISTS idx_library_items_shape ON library_items(shape);
CREATE INDEX IF NOT EXISTS idx_library_items_length ON library_items(length);
CREATE INDEX IF NOT EXISTS idx_library_items_tier ON library_items(tier);

-- GIN index for vibes array (if not already exists)
CREATE INDEX IF NOT EXISTS idx_library_items_vibes_gin ON library_items USING GIN(vibes);

-- ─────────────────────────────────────────────
-- COMMENTS FOR DOCUMENTATION
-- ─────────────────────────────────────────────

COMMENT ON COLUMN library_items.volume IS 'Body fit: fitted | regular | oversized | unknown. Used for CE and preference matching.';
COMMENT ON COLUMN library_items.shape IS 'Category-specific cut/style. Values depend on category - see schema-validation.ts';
COMMENT ON COLUMN library_items.length IS 'Garment length. Category-scoped - see schema-validation.ts';
COMMENT ON COLUMN library_items.tier IS 'Item classification: core (rank 10-20) | staple (30-50) | style (60-80) | statement (90+). For maintainability.';
COMMENT ON COLUMN library_items.silhouette IS 'DEPRECATED: Use volume instead';
COMMENT ON COLUMN library_items.shoe_profile IS 'DEPRECATED: Use shape instead for shoes';

-- ─────────────────────────────────────────────
-- RANK + TIER GUIDELINES
-- ─────────────────────────────────────────────
--
-- Tier determines WHY an item has its rank. Rank determines sort order.
--
-- | Tier      | Rank Range | Description                        |
-- |-----------|------------|-------------------------------------|
-- | core      | 10-20      | Universal basics (1-3 per category) |
-- | staple    | 30-50      | Versatile everyday pieces           |
-- | style     | 60-80      | Vibe-specific items                 |
-- | statement | 90+        | Bold, specific use cases            |
--
-- Spacing rule:
-- - Default ranks: 10, 20, 30, 40...
-- - Special inserts: 15, 25, 35... (reserve 5s for future insertions)
--
-- IMPORTANT: Rank should never compensate for weak filters.
-- If a bulletKey implies "office/tailored", add structure/formality constraints.

-- ─────────────────────────────────────────────
-- EXAMPLE: Insert items with new schema
-- ─────────────────────────────────────────────

-- To insert items, use this pattern:
--
-- INSERT INTO library_items (
--   category, label, image_url, vibes, tone, structure, formality,
--   volume, shape, length, rank
-- ) VALUES
-- -- TOPS (volume + length, no shape)
-- ('tops', 'White tee', 'https://xxx.supabase.co/storage/v1/object/public/library-items/tops/tee_white.webp',
--  ARRAY['casual', 'minimal', 'default'], 'light', 'soft', 'casual',
--  'fitted', NULL, 'regular', 10),
--
-- -- BOTTOMS (volume + shape, no length)
-- ('bottoms', 'Black straight jeans', 'https://xxx.supabase.co/storage/v1/object/public/library-items/bottoms/jean_black.webp',
--  ARRAY['casual', 'minimal', 'default'], 'dark', 'structured', 'casual',
--  'regular', 'straight', NULL, 20),
--
-- -- DRESSES (volume + shape + length)
-- ('dresses', 'Black midi dress', 'https://xxx.supabase.co/storage/v1/object/public/library-items/dresses/dress_midi_black.webp',
--  ARRAY['minimal', 'office', 'default'], 'dark', 'structured', 'smart-casual',
--  'fitted', 'bodycon', 'midi', 30),
--
-- -- SHOES (shape only, no volume/length)
-- ('shoes', 'White minimal sneakers', 'https://xxx.supabase.co/storage/v1/object/public/library-items/shoes/sneaker_white.webp',
--  ARRAY['casual', 'minimal', 'default'], 'light', 'structured', 'casual',
--  NULL, 'low_profile', NULL, 40);

-- ─────────────────────────────────────────────
-- BATCH INSERT TEMPLATE
-- ─────────────────────────────────────────────

-- Replace YOUR_PROJECT_URL with your actual Supabase URL
-- Example: https://abcdefgh.supabase.co

-- INSERT INTO library_items (category, label, image_url, vibes, tone, structure, formality, volume, shape, length, rank) VALUES
--
-- -- ═══════════════════════════════════════════
-- -- TOPS
-- -- ═══════════════════════════════════════════
-- ('tops', 'White tee', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/tops/tee_white.webp',
--  ARRAY['casual', 'minimal', 'street', 'default'], 'light', 'soft', 'casual',
--  'fitted', NULL, 'regular', 10),
--
-- ('tops', 'Black tee', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/tops/tee_black.webp',
--  ARRAY['casual', 'minimal', 'street', 'default'], 'dark', 'soft', 'casual',
--  'fitted', NULL, 'regular', 20),
--
-- ('tops', 'Cream tank', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/tops/tank_cream.webp',
--  ARRAY['minimal', 'feminine', 'default'], 'light', 'soft', 'casual',
--  'fitted', NULL, 'cropped', 30),
--
-- ('tops', 'Oversized tee', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/tops/tee_oversized_black.webp',
--  ARRAY['street', 'casual', 'default'], 'dark', 'soft', 'casual',
--  'oversized', NULL, 'longline', 80),
--
-- -- ═══════════════════════════════════════════
-- -- BOTTOMS
-- -- ═══════════════════════════════════════════
-- ('bottoms', 'Black tailored trousers', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/bottoms/trouser_black.webp',
--  ARRAY['minimal', 'office', 'default'], 'dark', 'structured', 'smart-casual',
--  'fitted', 'straight', NULL, 10),
--
-- ('bottoms', 'Blue straight jeans', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/bottoms/jean_blue.webp',
--  ARRAY['casual', 'street', 'default'], 'neutral', 'structured', 'casual',
--  'regular', 'straight', NULL, 30),
--
-- ('bottoms', 'Black wide-leg trousers', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/bottoms/trouser_wideleg_black.webp',
--  ARRAY['minimal', 'office', 'feminine', 'default'], 'dark', 'structured', 'smart-casual',
--  'oversized', 'wide', NULL, 60),
--
-- ('bottoms', 'Black cargo pants', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/bottoms/cargo_black.webp',
--  ARRAY['street', 'sporty'], 'dark', 'structured', 'casual',
--  'oversized', 'cargo', NULL, 50),
--
-- -- ═══════════════════════════════════════════
-- -- DRESSES
-- -- ═══════════════════════════════════════════
-- ('dresses', 'Black midi dress', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/dresses/dress_midi_black.webp',
--  ARRAY['minimal', 'office', 'default'], 'dark', 'structured', 'smart-casual',
--  'fitted', 'bodycon', 'midi', 10),
--
-- ('dresses', 'Neutral slip dress', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/dresses/dress_slip_neutral.webp',
--  ARRAY['feminine', 'minimal', 'default'], 'neutral', 'soft', 'casual',
--  'fitted', 'slip', 'midi', 20),
--
-- ('dresses', 'Blue shirt dress', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/dresses/dress_shirt_blue.webp',
--  ARRAY['office', 'casual', 'default'], 'neutral', 'structured', 'smart-casual',
--  'regular', 'shirt', 'midi', 30),
--
-- -- ═══════════════════════════════════════════
-- -- SKIRTS
-- -- ═══════════════════════════════════════════
-- ('skirts', 'Black midi skirt', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/skirts/skirt_midi_black.webp',
--  ARRAY['minimal', 'office', 'feminine', 'default'], 'dark', 'structured', 'smart-casual',
--  'fitted', 'pencil', 'midi', 10),
--
-- ('skirts', 'Cream pleated skirt', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/skirts/skirt_pleated_cream.webp',
--  ARRAY['feminine', 'office', 'default'], 'light', 'soft', 'smart-casual',
--  'regular', 'pleated', 'midi', 30),
--
-- -- ═══════════════════════════════════════════
-- -- OUTERWEAR
-- -- ═══════════════════════════════════════════
-- ('outerwear', 'Black blazer', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/outerwear/blazer_black.webp',
--  ARRAY['minimal', 'office', 'default'], 'dark', 'structured', 'smart-casual',
--  'fitted', NULL, 'regular', 10),
--
-- ('outerwear', 'Beige trench', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/outerwear/trench_beige.webp',
--  ARRAY['minimal', 'office', 'feminine', 'default'], 'neutral', 'structured', 'smart-casual',
--  'regular', NULL, 'long', 20),
--
-- ('outerwear', 'Blue denim jacket', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/outerwear/jacket_denim_blue.webp',
--  ARRAY['casual', 'street', 'default'], 'neutral', 'structured', 'casual',
--  'regular', NULL, 'cropped', 40),
--
-- -- ═══════════════════════════════════════════
-- -- SHOES
-- -- ═══════════════════════════════════════════
-- ('shoes', 'White minimal sneakers', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/shoes/sneaker_white.webp',
--  ARRAY['minimal', 'casual', 'street', 'default'], 'light', 'structured', 'casual',
--  NULL, 'low_profile', NULL, 10),
--
-- ('shoes', 'Black loafers', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/shoes/loafer_black.webp',
--  ARRAY['minimal', 'office', 'default'], 'dark', 'structured', 'smart-casual',
--  NULL, 'low_profile', NULL, 20),
--
-- ('shoes', 'Simple black heels', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/shoes/heel_black.webp',
--  ARRAY['feminine', 'office', 'default'], 'dark', 'structured', 'formal',
--  NULL, 'heeled', NULL, 50),
--
-- ('shoes', 'Black ankle boots', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/shoes/boot_ankle_black.webp',
--  ARRAY['minimal', 'street', 'default'], 'dark', 'structured', 'casual',
--  NULL, 'boot', NULL, 60),
--
-- ('shoes', 'Chunky black sneakers', 'YOUR_PROJECT_URL/storage/v1/object/public/library-items/shoes/sneaker_chunky_black.webp',
--  ARRAY['street', 'sporty'], 'dark', 'structured', 'casual',
--  NULL, 'chunky', NULL, 80);

-- ─────────────────────────────────────────────
-- QUERY: Deterministic bundle selection
-- ─────────────────────────────────────────────

-- Use this pattern for bundle recipe filtering:
--
-- SELECT * FROM library_items
-- WHERE category = 'bottoms'
--   AND active = true
--   AND structure = 'structured'
--   AND (volume = 'fitted' OR volume = 'regular')
--   AND shape IN ('straight', 'tapered')
--   AND ('minimal' = ANY(vibes) OR 'default' = ANY(vibes))
-- ORDER BY
--   CASE WHEN 'minimal' = ANY(vibes) THEN 0 ELSE 1 END,  -- exact vibe first
--   rank ASC,
--   id ASC  -- stable tie-breaker
-- LIMIT 3;
