/**
 * Supabase Storage Helpers
 * 
 * Handles uploading and managing wardrobe item images in Supabase Storage.
 */

import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

const WARDROBE_BUCKET = 'wardrobe-images';

/**
 * Upload a wardrobe item image to Supabase Storage
 * @param localUri - Local file URI (file://, content://, or ph://)
 * @param userId - User ID for folder organization
 * @param itemId - Optional item ID (if updating existing item)
 * @returns Public URL of the uploaded image
 */
export async function uploadWardrobeImage(
  localUri: string,
  userId: string,
  itemId?: string
): Promise<string> {
  console.log('[Storage] Function called with:', { localUri, userId, itemId, platform: Platform.OS });
  
  // Validate inputs
  if (!localUri) {
    throw new Error('localUri is required');
  }
  if (!userId) {
    throw new Error('userId is required');
  }
  
  console.log('[Storage] Starting upload process...');
  
  try {
    // Verify bucket exists
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    console.log('[Storage] Available buckets:', buckets?.map(b => b.name));
    
    if (bucketsError) {
      console.error('[Storage] Error listing buckets:', bucketsError);
      throw bucketsError;
    }
    
    const bucketExists = buckets?.some(b => b.name === WARDROBE_BUCKET);
    if (!bucketExists) {
      throw new Error(`Storage bucket "${WARDROBE_BUCKET}" does not exist. Please run the migration first.`);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 9);
    const filename = itemId 
      ? `${itemId}.jpg` 
      : `${timestamp}_${randomSuffix}.jpg`;
    
    // Construct storage path: userId/filename
    const storagePath = `${userId}/${filename}`;
    console.log('[Storage] Upload path:', storagePath);

    // Fetch the file as blob (works on both web and native)
    console.log('[Storage] Fetching file as blob...');
    const response = await fetch(localUri);
    const blob = await response.blob();
    console.log('[Storage] Blob created, size:', blob.size, 'type:', blob.type);
    
    // Upload blob to Supabase
    console.log('[Storage] Uploading to Supabase...');
    const uploadResult = await supabase.storage
      .from(WARDROBE_BUCKET)
      .upload(storagePath, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    console.log('[Storage] Upload result:', JSON.stringify(uploadResult, null, 2));
    
    if (uploadResult.error) {
      console.error('[Storage] Upload error:', uploadResult.error);
      throw new Error(`Upload failed: ${uploadResult.error.message || 'Unknown error'}`);
    }

    // Get public URL
    console.log('[Storage] Getting public URL...');
    const { data: urlData } = supabase.storage
      .from(WARDROBE_BUCKET)
      .getPublicUrl(storagePath);

    console.log('[Storage] Public URL:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error('[Storage] Failed to upload wardrobe image:', error);
    console.error('[Storage] Error details:', JSON.stringify(error, null, 2));
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to upload image. Please try again.');
  }
}

/**
 * Delete a wardrobe item image from Supabase Storage
 * @param imageUrl - Public URL of the image to delete
 * @param userId - User ID for verification
 */
export async function deleteWardrobeImage(
  imageUrl: string,
  userId: string
): Promise<void> {
  try {
    // Extract path from URL
    // URL format: https://xxx.supabase.co/storage/v1/object/public/wardrobe-images/userId/filename.jpg
    const urlParts = imageUrl.split('/');
    const filename = urlParts[urlParts.length - 1];
    const storagePath = `${userId}/${filename}`;

    const { error } = await supabase.storage
      .from(WARDROBE_BUCKET)
      .remove([storagePath]);

    if (error) {
      console.error('[Storage] Failed to delete image:', error);
      // Don't throw - deletion failure shouldn't block other operations
    }
  } catch (error) {
    console.error('[Storage] Failed to delete wardrobe image:', error);
    // Don't throw - deletion failure shouldn't block other operations
  }
}

/**
 * Check if a URL is a cloud storage URL (vs local file path)
 */
export function isCloudUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Get the bucket name for wardrobe images
 */
export function getWardrobeBucket(): string {
  return WARDROBE_BUCKET;
}

