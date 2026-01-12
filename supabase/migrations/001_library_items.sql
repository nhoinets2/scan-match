-- Library Items Table Migration
-- Run this in Supabase SQL Editor to set up the library items table

-- Create the library_items table
CREATE TABLE IF NOT EXISTS library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('tops', 'bottoms', 'outerwear', 'shoes', 'bags', 'accessories', 'dresses', 'skirts')),
  label TEXT NOT NULL,
  image_url TEXT NOT NULL,
  vibes TEXT[] NOT NULL DEFAULT '{}',
  tone TEXT NOT NULL CHECK (tone IN ('light', 'neutral', 'dark')),
  structure TEXT NOT NULL CHECK (structure IN ('soft', 'structured')),
  shoe_profile TEXT CHECK (shoe_profile IN ('minimal', 'statement')),
  silhouette TEXT CHECK (silhouette IN ('fitted', 'straight', 'wide', 'oversized')),
  formality TEXT CHECK (formality IN ('casual', 'smart-casual', 'formal')),
  outerwear_weight TEXT CHECK (outerwear_weight IN ('light', 'medium', 'heavy')),
  rank INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_library_items_category ON library_items(category);
CREATE INDEX IF NOT EXISTS idx_library_items_active ON library_items(active);
CREATE INDEX IF NOT EXISTS idx_library_items_rank ON library_items(rank);

-- Enable Row Level Security
ALTER TABLE library_items ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access (library items are public content)
CREATE POLICY "Library items are publicly readable"
  ON library_items
  FOR SELECT
  TO public
  USING (active = true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_library_items_updated_at
  BEFORE UPDATE ON library_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────
-- Storage Bucket Setup (run separately in Storage settings)
-- ─────────────────────────────────────────────
-- 1. Go to Storage in Supabase Dashboard
-- 2. Create a new bucket called "library-items"
-- 3. Set it to PUBLIC (for CDN-backed image delivery)
-- 4. Upload images organized by category:
--    library-items/
--    ├── tops/
--    │   ├── top_tee_white.png
--    │   └── ...
--    ├── bottoms/
--    └── ...

-- ─────────────────────────────────────────────
-- Example: Insert a library item
-- ─────────────────────────────────────────────
-- INSERT INTO library_items (category, label, image_url, vibes, tone, structure, silhouette, formality, rank)
-- VALUES (
--   'tops',
--   'White classic tee',
--   'https://YOUR_PROJECT.supabase.co/storage/v1/object/public/library-items/tops/top_tee_white.png',
--   ARRAY['casual', 'minimal', 'street'],
--   'light',
--   'soft',
--   'fitted',
--   'casual',
--   1
-- );
