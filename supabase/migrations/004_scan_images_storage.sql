-- Scan Images Storage Bucket Migration
-- Run this in Supabase SQL Editor to set up the scan images storage bucket

-- ─────────────────────────────────────────────
-- Storage Bucket Creation
-- ─────────────────────────────────────────────
-- This migration creates the "scan-images" bucket for storing saved scan photos
-- Images are organized by userId: scan-images/{userId}/scans/{checkId}.jpg

-- Create the storage bucket (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scan-images',
  'scan-images',
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
-- They control access to files in the scan-images bucket

-- Drop existing policies if they exist (to allow re-running migration)
DROP POLICY IF EXISTS "Users can upload their own scan images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own scan images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own scan images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read scan images" ON storage.objects;

-- Policy: Users can insert (upload) their own images
CREATE POLICY "Users can upload their own scan images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can update their own images
CREATE POLICY "Users can update their own scan images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own images
CREATE POLICY "Users can delete their own scan images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Anyone can read images (public bucket - for displaying images)
CREATE POLICY "Anyone can read scan images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'scan-images');

-- ─────────────────────────────────────────────
-- Notes
-- ─────────────────────────────────────────────
-- - Images are stored with path: {userId}/scans/{checkId}.jpg
-- - Public read access allows images to be displayed without authentication
-- - Users can only upload/update/delete their own images (userId folder)
-- - Only saved scans (outcome = 'saved_to_revisit') are uploaded to cloud
-- - Unsaved scans remain local-only for performance
-- - TTL/quota cleanup happens locally via orphan sweep


