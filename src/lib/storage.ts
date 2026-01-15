/**
 * Storage Helpers
 * 
 * Handles local image storage and cloud upload to Supabase Storage.
 * 
 * Strategy: "Local-first with background sync"
 * 1. Save images locally immediately (instant UX)
 * 2. Upload to cloud in background (no blocking)
 * 3. Cross-device sync works via cloud URLs
 */

import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { enqueueUpload, processQueue, UploadJob, initUploadQueue, cancelUpload, logUploadEvent, UploadKind } from './uploadQueue';
import { updateWardrobeItemImageUriGuarded, updateRecentCheckImageUriGuarded } from './database';

// Re-export queue functions for use in UI
export { cancelUpload, isUploadFailed, getFailedUpload, retryFailedUpload, hasPendingUpload, getPendingUploadLocalUris, hasAnyPendingUploads, onQueueIdle } from './uploadQueue';

// ============================================
// RECENTLY CREATED URIs PROTECTION
// ============================================

// In-memory tracking of recently created local URIs
// Protects files in the brief window between creation and queue enqueue
const recentlyCreatedUris = new Map<string, number>(); // uri -> timestamp
const RECENT_URI_TTL_MS = 60_000; // 60 seconds protection window

/**
 * Track a recently created local URI (called from saveImageLocally)
 */
function trackRecentUri(uri: string): void {
  recentlyCreatedUris.set(uri, Date.now());
  // Cleanup old entries
  const cutoff = Date.now() - RECENT_URI_TTL_MS;
  for (const [oldUri, timestamp] of recentlyCreatedUris) {
    if (timestamp < cutoff) {
      recentlyCreatedUris.delete(oldUri);
    }
  }
}

/**
 * Get all recently created local URIs (within TTL window)
 * Used by orphan sweep to protect files that may not be in queue yet
 * Also prunes expired entries to prevent unbounded growth in long sessions
 */
export function getRecentlyCreatedUris(): Set<string> {
  const cutoff = Date.now() - RECENT_URI_TTL_MS;
  const result = new Set<string>();
  
  // Collect valid entries and prune expired ones in a single pass
  for (const [uri, timestamp] of recentlyCreatedUris) {
    if (timestamp >= cutoff) {
      result.add(uri);
    } else {
      // Prune expired entry
      recentlyCreatedUris.delete(uri);
    }
  }
  return result;
}

// ============================================
// CONSTANTS
// ============================================

const WARDROBE_BUCKET = 'wardrobe-images';
const SCAN_BUCKET = 'scan-images';

// Local storage directories
const LOCAL_WARDROBE_DIR = `${FileSystem.documentDirectory}wardrobe-images/`;
const LOCAL_SCAN_DIR = `${FileSystem.documentDirectory}scan-images/`;

// For backwards compatibility
const LOCAL_IMAGES_DIR = LOCAL_WARDROBE_DIR;

// Image upload settings
const COMPRESS_IMAGES = false; // Set to true to compress (faster uploads, lower quality)

// Storage kind type
export type StorageKind = 'wardrobe' | 'scan';

// ============================================
// LOCAL STORAGE FUNCTIONS
// ============================================

/**
 * Get the local directory for a storage kind
 */
function getLocalDir(kind: StorageKind): string {
  return kind === 'scan' ? LOCAL_SCAN_DIR : LOCAL_WARDROBE_DIR;
}

/**
 * Ensure the local images directory exists for a given kind
 */
async function ensureLocalDir(kind: StorageKind): Promise<void> {
  const dir = getLocalDir(kind);
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    console.log(`[Storage] Creating local ${kind} images directory...`);
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

/**
 * @deprecated Use ensureLocalDir(kind) instead
 */
async function ensureLocalImagesDir(): Promise<void> {
  await ensureLocalDir('wardrobe');
}

/**
 * Save an image to permanent local storage.
 * 
 * @param tempUri - Temporary image URI (from camera/gallery)
 * @param userId - User ID for wardrobe naming
 * @param kind - 'wardrobe' (random name) or 'scan' (deterministic name)
 * @param fixedName - For scans: the checkId to use as filename (deterministic)
 * @returns Permanent local URI
 */
export async function saveImageLocally(
  tempUri: string,
  userId: string,
  kind: StorageKind = 'wardrobe',
  fixedName?: string
): Promise<string> {
  console.log('[Storage] Saving image locally...', { tempUri, userId, kind, fixedName });
  
  try {
    await ensureLocalDir(kind);
    
    const dir = getLocalDir(kind);
    let filename: string;
    
    if (fixedName) {
      // Deterministic naming (scans): {fixedName}.jpg
      filename = `${fixedName}.jpg`;
    } else {
      // Random naming (wardrobe): {userId}_{timestamp}_{random}.jpg
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 9);
      filename = `${userId}_${timestamp}_${randomSuffix}.jpg`;
    }
    
    const permanentUri = `${dir}${filename}`;
    
    // Check if file already exists (for idempotent overwrites)
    const existingInfo = await FileSystem.getInfoAsync(permanentUri);
    if (existingInfo.exists) {
      console.log('[Storage] Overwriting existing file:', permanentUri);
      await FileSystem.deleteAsync(permanentUri, { idempotent: true });
    }
    
    // Copy from temp location to permanent location
    await FileSystem.copyAsync({
      from: tempUri,
      to: permanentUri,
    });
    
    // Track as recently created (protects from orphan sweep race condition)
    trackRecentUri(permanentUri);
    
    console.log('[Storage] Image saved locally:', permanentUri);
    return permanentUri;
  } catch (error) {
    console.error('[Storage] Failed to save image locally:', error);
    throw new Error('Failed to save image locally');
  }
}

/**
 * Delete a local image file (works for both wardrobe and scan images)
 */
export async function deleteLocalImage(localUri: string): Promise<void> {
  try {
    // Check if it's a local file in our managed directories
    const isManaged = localUri.startsWith(LOCAL_WARDROBE_DIR) || 
                      localUri.startsWith(LOCAL_SCAN_DIR) ||
                      localUri.startsWith('file://');
    
    if (isManaged) {
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
        console.log('[Storage] Deleted local image:', localUri);
      }
    }
  } catch (error) {
    console.error('[Storage] Failed to delete local image:', error);
    // Don't throw - deletion failure shouldn't block other operations
  }
}

// ============================================
// CLOUD UPLOAD FUNCTIONS
// ============================================

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
    // Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 9);
    const filename = itemId 
      ? `${itemId}.jpg` 
      : `${timestamp}_${randomSuffix}.jpg`;
    
    // Construct storage path: userId/filename
    const storagePath = `${userId}/${filename}`;
    console.log('[Storage] Upload path:', storagePath);

    // Prepare image for upload
    console.log('[Storage] Processing image...', { compress: COMPRESS_IMAGES });
    
    let uploadData: ArrayBuffer | Blob;
    let contentType = 'image/jpeg';
    
    if (Platform.OS === 'web') {
      // For web, use blob directly
      const response = await fetch(localUri);
      uploadData = await response.blob();
      console.log('[Storage] Blob created, size:', (uploadData as Blob).size);
    } else {
      // For native (iOS/Android)
      let base64Data: string;
      
      if (COMPRESS_IMAGES) {
        // Compress and resize (faster uploads, lower quality)
        console.log('[Storage] Compressing image...');
        const compressedImage = await ImageManipulator.manipulateAsync(
          localUri,
          [{ resize: { width: 1600, height: 2000 } }],
          { 
            compress: 0.92, 
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          }
        );
        
        if (!compressedImage.base64) {
          throw new Error('Failed to compress image');
        }
        base64Data = compressedImage.base64;
        console.log('[Storage] Image compressed, base64 length:', base64Data.length);
      } else {
        // Upload original quality (slower, but best quality)
        console.log('[Storage] Reading original file (no compression)...');
        base64Data = await FileSystem.readAsStringAsync(localUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        console.log('[Storage] Original file read, base64 length:', base64Data.length);
      }
      
      // Convert base64 to ArrayBuffer
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      uploadData = bytes.buffer;
      console.log('[Storage] ArrayBuffer created, size:', uploadData.byteLength, 'bytes');
    }
    
    // Upload to Supabase
    console.log('[Storage] Uploading to Supabase...');
    const uploadResult = await supabase.storage
      .from(WARDROBE_BUCKET)
      .upload(storagePath, uploadData, {
        contentType,
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
 * Check if a URL is a local file path
 */
export function isLocalUri(url: string): boolean {
  return url.startsWith('file://') || 
         url.startsWith(LOCAL_WARDROBE_DIR) || 
         url.startsWith(LOCAL_SCAN_DIR);
}

/**
 * Get the bucket name for wardrobe images
 */
export function getWardrobeBucket(): string {
  return WARDROBE_BUCKET;
}

/**
 * Get the bucket name for scan images
 */
export function getScanBucket(): string {
  return SCAN_BUCKET;
}

// ============================================
// BACKGROUND UPLOAD QUEUE (uses uploadQueue.ts)
// ============================================

/**
 * Upload worker - handles actual upload + guarded DB update
 * Called by the queue processor for each job (both wardrobe and scan)
 */
async function uploadWorker(job: UploadJob): Promise<void> {
  const jobId = job.id || job.itemId || '';
  const kind = job.kind || 'wardrobe'; // Default for legacy jobs
  const bucket = job.bucket || WARDROBE_BUCKET; // Default for legacy jobs
  
  console.log('[UploadWorker] Processing job:', { id: jobId, kind, bucket });
  
  // 1) Read file and prepare for upload
  const base64Data = await FileSystem.readAsStringAsync(job.localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  
  // Convert base64 to ArrayBuffer
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const uploadData = bytes.buffer;
  
  console.log('[UploadWorker] File read, size:', uploadData.byteLength, 'bytes');
  
  // 2) Upload with upsert (idempotent)
  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(job.storagePath, uploadData, {
      upsert: true,
      contentType: 'image/jpeg',
      cacheControl: '3600',
    });

  if (upErr) {
    console.error('[UploadWorker] Upload error:', upErr);
    throw upErr;
  }

  // 3) Get public URL
  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(job.storagePath);
  
  const publicUrl = urlData.publicUrl;
  console.log('[UploadWorker] Public URL:', publicUrl);

  // 4) Guarded DB update (prevents stale job overwriting new image)
  let updatedCount: number;
  
  if (kind === 'scan') {
    // Scan: also require outcome = 'saved_to_revisit'
    updatedCount = await updateRecentCheckImageUriGuarded({
      checkId: jobId,
      remoteUrl: publicUrl,
      expectedImageUri: job.expectedImageUri,
    });
  } else {
    // Wardrobe: standard guarded update
    updatedCount = await updateWardrobeItemImageUriGuarded({
      itemId: jobId,
      remoteUrl: publicUrl,
      expectedImageUri: job.expectedImageUri,
    });
  }

  // Telemetry
  if (updatedCount > 0) {
    logUploadEvent('upload_succeeded', jobId, { kind, publicUrl });
  } else {
    // 0 rows updated: item deleted OR image changed OR (for scans) unsaved
    logUploadEvent('upload_stale_ignored', jobId, { kind, reason: 'no_matching_row' });
  }
  
  console.log('[UploadWorker] DB update result, rows affected:', updatedCount);
}

/**
 * Initialize background uploads - call once on app start
 */
export async function initializeBackgroundUploads(): Promise<void> {
  console.log('[Storage] Initializing background uploads...');
  await initUploadQueue(uploadWorker);
}

/**
 * Queue a wardrobe image for background upload
 */
export async function queueBackgroundUpload(
  itemId: string,
  localUri: string,
  userId: string
): Promise<void> {
  console.log('[BackgroundUpload] Queuing wardrobe upload:', { itemId, localUri });
  
  const ext = guessExt(localUri) ?? 'jpg';
  const storagePath = `${userId}/${itemId}.${ext}`;
  
  await enqueueUpload({
    kind: 'wardrobe',
    id: itemId,
    userId,
    localUri,
    expectedImageUri: localUri, // Guard: only update if DB still has this URI
    bucket: WARDROBE_BUCKET,
    storagePath,
  });
  
  // Kick processing immediately (also kicked on init/foreground)
  void processQueue(uploadWorker);
}

/**
 * Queue a scan image for background upload (called when user saves a scan)
 */
export async function queueScanUpload(
  checkId: string,
  localUri: string,
  userId: string
): Promise<void> {
  console.log('[BackgroundUpload] Queuing scan upload:', { checkId, localUri });
  
  const ext = guessExt(localUri) ?? 'jpg';
  const storagePath = `${userId}/scans/${checkId}.${ext}`;
  
  await enqueueUpload({
    kind: 'scan',
    id: checkId,
    userId,
    localUri,
    expectedImageUri: localUri, // Guard: only update if DB still has this URI
    bucket: SCAN_BUCKET,
    storagePath,
  });
  
  // Kick processing immediately (also kicked on init/foreground)
  void processQueue(uploadWorker);
}

/**
 * Guess file extension from URI
 */
function guessExt(uri: string): string | null {
  const m = uri.toLowerCase().match(/\.(jpg|jpeg|png|webp)\b/);
  if (!m) return null;
  return m[1] === 'jpeg' ? 'jpg' : m[1];
}

// ============================================
// SCAN-SPECIFIC HELPERS
// ============================================

/**
 * Check if a URI is already in our managed scan directory
 */
export function isManagedScanUri(uri: string): boolean {
  return uri.startsWith(LOCAL_SCAN_DIR);
}

/**
 * Prepare a scan for saving: copy to local storage with deterministic name.
 * Call this when user taps "Save for later".
 * 
 * @param checkId - The check ID (used for deterministic filename)
 * @param currentImageUri - Current image URI (could be temp camera URI or already local)
 * @param userId - User ID
 * @returns The permanent local URI (for updating DB)
 */
export async function prepareScanForSave(
  checkId: string,
  currentImageUri: string,
  userId: string
): Promise<string> {
  console.log('[Storage] Preparing scan for save:', { checkId, currentImageUri });
  
  // If already in our managed directory, no need to copy
  if (isManagedScanUri(currentImageUri)) {
    console.log('[Storage] Scan already in managed directory');
    return currentImageUri;
  }
  
  // If it's a cloud URL, nothing to do (already synced)
  if (isCloudUrl(currentImageUri)) {
    console.log('[Storage] Scan already synced to cloud');
    return currentImageUri;
  }
  
  // Copy to managed directory with deterministic name
  const localUri = await saveImageLocally(currentImageUri, userId, 'scan', checkId);
  console.log('[Storage] Scan saved locally:', localUri);
  
  return localUri;
}

/**
 * Complete the save process for a scan: queue the upload.
 * Call this AFTER the DB has been updated with outcome='saved_to_revisit'.
 * 
 * @param checkId - The check ID
 * @param localUri - The local URI from prepareScanForSave
 * @param userId - User ID
 */
export async function completeScanSave(
  checkId: string,
  localUri: string,
  userId: string
): Promise<void> {
  console.log('[Storage] Completing scan save:', { checkId, localUri });
  
  // Only queue upload if it's a local file
  if (localUri.startsWith('file://')) {
    await queueScanUpload(checkId, localUri, userId);
    console.log('[Storage] Scan upload queued');
  } else {
    console.log('[Storage] Scan already synced, no upload needed');
  }
}

// ============================================
// CLEANUP HELPERS
// ============================================

/**
 * Clean up all storage for an item before deletion.
 * Call this BEFORE deleting the DB record.
 * 
 * Handles:
 * 1. Cancelling any pending upload for this item
 * 2. Deleting local file if it's a local URI
 * 3. Cloud storage deletion is optional (can be cleaned up later)
 * 
 * Works for both wardrobe items and scans.
 */
async function cleanupItemStorage(
  id: string,
  imageUri?: string,
  kind: StorageKind = 'wardrobe'
): Promise<void> {
  console.log(`[Storage] Cleaning up ${kind} storage for:`, id);
  
  // 1) Cancel any pending upload
  await cancelUpload(id);
  
  // 2) Delete local file if it's local
  if (imageUri?.startsWith('file://')) {
    // Sanitize URI - reject if it contains path traversal or invalid characters
    const hasPathTraversal = imageUri.includes('..') || imageUri.includes('/./');
    const isValidFileUri = /^file:\/\/[^?#]+\.(jpg|jpeg|png|gif|webp|heic)$/i.test(imageUri);

    if (hasPathTraversal) {
      console.warn('[Storage] Skipping delete - URI contains path traversal:', imageUri);
    } else if (!isValidFileUri) {
      console.warn('[Storage] Skipping delete - Invalid file URI format:', imageUri);
    } else {
      try {
        await FileSystem.deleteAsync(imageUri, { idempotent: true });
        console.log('[Storage] Deleted local file:', imageUri);
      } catch (error) {
        console.error('[Storage] Failed to delete local file:', error);
        // Don't throw - cleanup failure shouldn't block deletion
      }
    }
  }
  
  console.log('[Storage] Storage cleanup complete for:', id);
}

/**
 * Clean up storage for a wardrobe item before deletion.
 */
export async function cleanupWardrobeItemStorage(
  itemId: string,
  imageUri?: string
): Promise<void> {
  await cleanupItemStorage(itemId, imageUri, 'wardrobe');
}

/**
 * Clean up storage for a scan before deletion.
 */
export async function cleanupScanStorage(
  checkId: string,
  imageUri?: string
): Promise<void> {
  await cleanupItemStorage(checkId, imageUri, 'scan');
}

// ============================================
// ORPHAN FILE SWEEP (run on cold start)
// ============================================

/**
 * ORPHAN SWEEP - Safe local file cleanup
 * 
 * Sweep orphaned local image files not referenced by any item.
 * Call this once per cold start (or when queue becomes idle) to prevent storage creep.
 * 
 * SAFETY INVARIANT:
 * Only delete files that are:
 * 1. NOT in validLocalUris (items from DB query)
 * 2. NOT in pending upload queue (caller must include getPendingUploadLocalUris)
 * 3. NOT recently created (caller must include getRecentlyCreatedUris)
 * 4. Caller should NEVER call this while uploads are in progress (use hasAnyPendingUploads check)
 * 
 * This multi-layer protection prevents race conditions where newly-added items'
 * images get deleted before DB/cache updates propagate.
 * 
 * @param validLocalUris - Set of local URIs currently in use (MUST include pending + recent URIs!)
 * @param kind - 'wardrobe' or 'scan' to specify which directory to sweep
 * @returns Number of orphaned files deleted
 */
export async function sweepOrphanedLocalImages(
  validLocalUris: Set<string>,
  kind: StorageKind = 'wardrobe'
): Promise<number> {
  const dir = getLocalDir(kind);
  console.log(`[Storage] Starting ${kind} orphan sweep in:`, dir);
  console.log(`[Storage] Protected URIs count:`, validLocalUris.size);
  
  try {
    // Ensure directory exists
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) {
      console.log(`[Storage] No ${kind} images directory, skipping sweep`);
      return 0;
    }
    
    // List all files in the directory
    const files = await FileSystem.readDirectoryAsync(dir);
    console.log(`[Storage] Found ${files.length} local ${kind} files`);
    
    let deletedCount = 0;
    
    for (const filename of files) {
      const fullPath = `${dir}${filename}`;
      
      // Check if this file is referenced/protected
      if (!validLocalUris.has(fullPath)) {
        try {
          await FileSystem.deleteAsync(fullPath, { idempotent: true });
          deletedCount++;
          console.log('[Storage] Deleted orphan:', filename);
        } catch (error) {
          console.error('[Storage] Failed to delete orphan:', filename, error);
        }
      }
    }
    
    console.log(`[Storage] ${kind} orphan sweep complete, deleted:`, deletedCount);
    return deletedCount;
  } catch (error) {
    console.error(`[Storage] ${kind} orphan sweep failed:`, error);
    return 0;
  }
}

// ============================================
// INTEGRITY CHECK HELPERS
// ============================================

/**
 * Check if a local file exists. Use for debugging blank thumbnails.
 * Logs a warning if a file is referenced but missing.
 * 
 * @param localUri - The local file URI to check
 * @param context - Context for logging (e.g., 'wardrobe item abc123')
 * @returns true if file exists or URI is not local, false if local file is missing
 */
export async function checkLocalFileIntegrity(
  localUri: string | undefined,
  context: string
): Promise<boolean> {
  // No URI or not a local file - nothing to check
  if (!localUri || !localUri.startsWith('file://')) {
    return true;
  }
  
  try {
    const info = await FileSystem.getInfoAsync(localUri);
    if (!info.exists) {
      // INTEGRITY CHECK: Log when a referenced file is missing
      console.warn('[Storage] INTEGRITY: Local file missing', {
        context,
        localUri,
        message: 'File referenced by DB but not found on disk',
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Storage] INTEGRITY: Failed to check file:', { context, localUri, error });
    return false;
  }
}

// ============================================
// RENDER-TIME IMAGE HELPERS
// ============================================

/**
 * **RENDER-TIME ONLY** - Do NOT store the returned value in DB.
 * 
 * Appends a cache-busting query param to remote image URLs.
 * Use this when displaying images that may have been replaced.
 * 
 * Safe for:
 * - `<Image source={{ uri: getImageUriForRender(...) }} />`
 * 
 * NOT safe for:
 * - Database writes
 * - API calls
 * 
 * @param imageUri - The image URI (local or remote)
 * @param updatedAt - Optional timestamp for cache busting
 * @returns The URI with cache-buster if applicable (remote only)
 */
export function getImageUriForRender(
  imageUri: string,
  updatedAt?: number | string
): string {
  // Only add cache-buster to remote URLs
  if (!isCloudUrl(imageUri)) {
    return imageUri;
  }
  
  // If no updatedAt, return as-is
  if (!updatedAt) {
    return imageUri;
  }
  
  // Add cache-buster query param (handle existing query params)
  const separator = imageUri.includes('?') ? '&' : '?';
  const version = typeof updatedAt === 'number' ? updatedAt : new Date(updatedAt).getTime();
  
  return `${imageUri}${separator}v=${encodeURIComponent(String(version))}`;
}

/**
 * **RENDER-TIME ONLY** - Convenience wrapper for wardrobe item images.
 * 
 * Returns an Image source object with cache-busting applied.
 * Use directly in Image component:
 * 
 * ```tsx
 * <Image source={getWardrobeImageSource(item)} />
 * ```
 * 
 * @param item - Wardrobe item with imageUri and optional updatedAt
 * @returns Image source object `{ uri: string }`
 */
export function getWardrobeImageSource(item: { 
  imageUri: string; 
  updatedAt?: string | number;
}): { uri: string } {
  return { uri: getImageUriForRender(item.imageUri, item.updatedAt) };
}

