-- Wardrobe Images Storage Bucket Migration
-- Run this in Supabase SQL Editor to set up the wardrobe images storage bucket

-- ─────────────────────────────────────────────
-- Storage Bucket Creation
-- ─────────────────────────────────────────────
-- This migration creates the "wardrobe-images" bucket for storing user wardrobe item photos
-- Images are organized by userId: wardrobe-images/{userId}/{filename}.jpg

-- Create the storage bucket (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'wardrobe-images',
  'wardrobe-images',
  true, -- Public bucket for easy image delivery
  10485760, -- 10MB file size limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- ─────────────────────────────────────────────
-- Storage Policies (RLS on storage.objects)
-- ─────────────────────────────────────────────

-- Note: These policies apply to the storage.objects table
-- They control access to files in the wardrobe-images bucket

-- Drop existing policies if they exist (to allow re-running migration)
DROP POLICY IF EXISTS "Users can upload their own wardrobe images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own wardrobe images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own wardrobe images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read wardrobe images" ON storage.objects;

-- Policy: Users can insert (upload) their own images
CREATE POLICY "Users can upload their own wardrobe images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'wardrobe-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can update their own images
CREATE POLICY "Users can update their own wardrobe images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'wardrobe-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'wardrobe-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own images
CREATE POLICY "Users can delete their own wardrobe images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'wardrobe-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Anyone can read images (public bucket - for displaying images)
CREATE POLICY "Anyone can read wardrobe images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'wardrobe-images');

-- ─────────────────────────────────────────────
-- Notes
-- ─────────────────────────────────────────────
-- - Images are stored with path: {userId}/{timestamp}_{random}.jpg
-- - Public read access allows images to be displayed without authentication
-- - Users can only upload/update/delete their own images (userId folder)
-- - Consider adding a cleanup job to remove orphaned images (images without DB records)

