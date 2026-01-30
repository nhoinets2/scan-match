/**
 * Style Signals Service
 *
 * Client-side service for generating and fetching style signals.
 * Calls the style-signals Edge Function.
 * 
 * CACHING STRATEGY:
 * - Style signals are cached by image hash (SHA256) in the database
 * - Same image = same signals, even across different scans/users
 * - Cache is invalidated when prompt version changes
 */

import { supabase } from './supabase';
import * as Crypto from 'expo-crypto';
import type { StyleSignalsV1 } from './trust-filter/types';

// ============================================
// TYPES
// ============================================

export interface StyleSignalsResponse {
  ok: boolean;
  cached?: boolean;
  data?: StyleSignalsV1;
  error?: {
    kind: string;
    message: string;
  };
  fallbackData?: StyleSignalsV1;
}

// ============================================
// EDGE FUNCTION URL
// ============================================

function getStyleSignalsUrl(): string {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL not configured');
  }
  return `${supabaseUrl}/functions/v1/style-signals`;
}

// ============================================
// IMAGE HASH CACHE (DB-BACKED)
// ============================================

/**
 * Model version for style signals generation.
 * Bump when switching models to invalidate cache.
 * Updated 2026-01-30: Migrated from GPT-4o to Claude Sonnet 4.5
 */
export const STYLE_SIGNALS_MODEL_VERSION = 'claude-sonnet-4.5';

/**
 * Compute SHA-256 hash of a string (base64 image data).
 * Used for cache key generation.
 * 
 * IMPORTANT: Hash is computed from the resized/normalized bytes
 * (same bytes that would be sent to the API).
 */
async function sha256Hex(data: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    data
  );
  return hash;
}

/**
 * Get cached style signals by composite key.
 * Key: (user_id, image_sha256, prompt_version, model_version)
 * 
 * Returns null if not found or on error.
 * Automatic invalidation: different prompt/model version = cache miss.
 */
async function getStyleSignalsFromCache(
  userId: string,
  imageSha256: string
): Promise<StyleSignalsV1 | null> {
  try {
    const startMs = Date.now();
    
    const { data, error } = await supabase
      .from('style_signals_cache')
      .select('style_signals')
      .eq('user_id', userId)
      .eq('image_sha256', imageSha256)
      .eq('prompt_version', CURRENT_PROMPT_VERSION)
      .eq('model_version', STYLE_SIGNALS_MODEL_VERSION)
      .maybeSingle();

    const elapsedMs = Date.now() - startMs;

    if (error) {
      // DB error → return null → caller will fall through to API call
      // This keeps UX resilient if Supabase has a hiccup
      if (__DEV__) {
        console.log(`[StyleSignals] DB lookup error (${elapsedMs}ms): ${error.message} → falling back to API`);
      }
      return null;
    }

    if (!data) {
      if (__DEV__) {
        console.log(`[StyleSignals] DB MISS for hash ${imageSha256.slice(0, 8)} (${elapsedMs}ms)`);
      }
      return null;
    }

    if (__DEV__) {
      console.log(`[StyleSignals] DB HIT for hash ${imageSha256.slice(0, 8)} (${elapsedMs}ms)`);
    }

    // Fire-and-forget hit count increment
    void supabase.rpc('increment_style_signals_cache_hit', {
      p_user_id: userId,
      p_image_sha256: imageSha256,
      p_prompt_version: CURRENT_PROMPT_VERSION,
      p_model_version: STYLE_SIGNALS_MODEL_VERSION,
    });

    return data.style_signals as StyleSignalsV1;
  } catch (err) {
    // Exception → return null → caller will fall through to API call
    // Never let cache issues block the scan
    console.warn('[StyleSignals] Cache lookup exception (falling back to API):', err);
    return null;
  }
}

/**
 * Store style signals in cache using UPSERT.
 * 
 * Key: (user_id, image_sha256, prompt_version, model_version)
 * 
 * Uses UPSERT to handle race conditions:
 * - Two scans of same image might compute signals simultaneously
 * - "Last write wins" is fine since same input = same output
 * 
 * RESILIENCE: Fire-and-forget - errors are logged but NEVER block the scan.
 * If DB is down, we just skip caching and the scan still succeeds.
 */
async function setStyleSignalsInCache(
  userId: string,
  imageSha256: string,
  signals: StyleSignalsV1
): Promise<void> {
  try {
    const { error } = await supabase
      .from('style_signals_cache')
      .upsert(
        {
          user_id: userId,
          image_sha256: imageSha256,
          prompt_version: CURRENT_PROMPT_VERSION,
          model_version: STYLE_SIGNALS_MODEL_VERSION,
          style_signals: signals,
          updated_at: new Date().toISOString(),
          hit_count: 0,
        },
        {
          // Composite key conflict handling
          onConflict: 'user_id,image_sha256,prompt_version,model_version',
        }
      );

    if (error) {
      // Log but don't throw - caching is optional, scan already succeeded
      console.warn('[StyleSignals] Cache store error (non-blocking):', error.message);
    } else if (__DEV__) {
      console.log(`[StyleSignals] Cached signals for hash ${imageSha256.slice(0, 8)}`);
    }
  } catch (err) {
    // Log but don't throw - caching is optional, scan already succeeded
    console.warn('[StyleSignals] Cache store exception (non-blocking):', err);
  }
}

// ============================================
// GENERATE STYLE SIGNALS
// ============================================

/**
 * Generate style signals for a scan result.
 * Calls the style-signals Edge Function.
 *
 * @param scanId - The scan ID to generate signals for
 * @returns StyleSignalsResponse with the generated signals
 */
export async function generateScanStyleSignals(
  scanId: string
): Promise<StyleSignalsResponse> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
      return {
        ok: false,
        error: { kind: 'unauthorized', message: 'Not authenticated' },
      };
    }

    const response = await fetch(getStyleSignalsUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'scan',
        scanId,
      }),
    });

    const result = await response.json();
    return result as StyleSignalsResponse;
  } catch (error) {
    console.error('[StyleSignalsService] Error generating scan signals:', error);
    return {
      ok: false,
      error: { kind: 'network_error', message: 'Failed to connect to server' },
    };
  }
}

// ============================================
// DIRECT SCAN SIGNALS (for unsaved local images)
// ============================================

// Cache entry with TTL
interface CacheEntry {
  signals: StyleSignalsV1;
  expiresAt: number;
}

// In-memory cache for direct signals (avoids repeated base64 + API calls)
const directSignalsCache = new Map<string, CacheEntry>();

// Cache TTL: 20 minutes
const CACHE_TTL_MS = 20 * 60 * 1000;

// Max cache entries
const MAX_CACHE_ENTRIES = 10;

// Max payload size for base64 image (6MB base64 ≈ 4.5MB raw image)
const MAX_BASE64_LENGTH = 6 * 1024 * 1024;

// Threshold for second-pass compression (1.5MB)
const SECOND_PASS_THRESHOLD = 1.5 * 1024 * 1024;

// First pass: 1280px, quality 0.75
const FIRST_PASS_DIMENSION = 1280;
const FIRST_PASS_QUALITY = 0.75;

// Second pass: 1024px, quality 0.70 (for large images)
const SECOND_PASS_DIMENSION = 1024;
const SECOND_PASS_QUALITY = 0.70;

/**
 * Resize and compress an image to reduce payload size.
 * If the first pass is still > 1.5MB, does a second pass with more aggressive compression.
 * Returns a base64 data URL ready for the Edge Function.
 */
async function resizeAndCompressImage(localImageUri: string): Promise<string> {
  const ImageManipulator = await import('expo-image-manipulator');
  
  // First pass: 1280px + JPEG 0.75
  let result = await ImageManipulator.manipulateAsync(
    localImageUri,
    [{ resize: { width: FIRST_PASS_DIMENSION, height: FIRST_PASS_DIMENSION } }],
    { compress: FIRST_PASS_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  if (!result.base64) {
    throw new Error('Failed to compress image to base64');
  }

  let dataUrl = `data:image/jpeg;base64,${result.base64}`;

  // Second pass if still too large (> 1.5MB)
  if (dataUrl.length > SECOND_PASS_THRESHOLD) {
    result = await ImageManipulator.manipulateAsync(
      localImageUri,
      [{ resize: { width: SECOND_PASS_DIMENSION, height: SECOND_PASS_DIMENSION } }],
      { compress: SECOND_PASS_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    if (!result.base64) {
      throw new Error('Failed to compress image on second pass');
    }

    dataUrl = `data:image/jpeg;base64,${result.base64}`;
  }

  return dataUrl;
}

/**
 * Clean expired entries from cache
 */
function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of directSignalsCache.entries()) {
    if (entry.expiresAt < now) {
      directSignalsCache.delete(key);
    }
  }
}

/**
 * Generate style signals directly from a local image.
 * Resizes/compresses the image, converts to base64, and sends to the Edge Function.
 * Used for unsaved scans where the image hasn't been uploaded yet.
 * 
 * CACHING STRATEGY:
 * 
 * TIER 0 (Memory): In-memory cache by URI
 *   - Fast micro-optimization for re-renders
 *   - NOT the source of truth (same URI can point to different bytes)
 *   - Just a "nice to have" to avoid redundant work within a session
 * 
 * TIER 1 (DB): Cache by composite key (user_id, image_hash, prompt_version, model_version)
 *   - THE source of truth
 *   - Automatic invalidation: bump prompt_version or model_version
 *   - Hash computed from resized/normalized bytes (same bytes sent to API)
 *   - UPSERT handles race conditions (last write wins, same payload anyway)
 *
 * FLOW:
 *   Resize → compute SHA256 from final bytes → DB lookup → return or call API → UPSERT
 *
 * @param localImageUri - Local file:// URI of the image
 * @returns StyleSignalsResponse with the generated signals
 */
export async function generateScanStyleSignalsDirect(
  localImageUri: string,
  options?: { signal?: AbortSignal }
): Promise<StyleSignalsResponse> {
  try {
    // Clean expired entries periodically
    cleanExpiredCache();

    // TIER 0: Memory cache (micro-optimization, NOT source of truth)
    // Same URI can sometimes point to different bytes, so this is just "nice to have"
    const memoryCached = directSignalsCache.get(localImageUri);
    const now = Date.now();
    
    if (memoryCached && memoryCached.expiresAt > now) {
      if (__DEV__) {
        console.log('[StyleSignals] Memory cache hit (Tier 0)');
      }
      return { ok: true, data: memoryCached.signals, cached: true };
    }

    // Remove expired entry if exists
    if (memoryCached) {
      directSignalsCache.delete(localImageUri);
    }

    // Get auth session (need user_id for cache key)
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const userId = sessionData?.session?.user?.id;

    if (!token || !userId) {
      return {
        ok: false,
        error: { kind: 'unauthorized', message: 'Not authenticated' },
      };
    }

    // Step 1: Resize and normalize image (deterministic output)
    const imageDataUrl = await resizeAndCompressImage(localImageUri);
    const sizeKB = Math.round(imageDataUrl.length / 1024);

    // Client-side payload size check
    if (imageDataUrl.length > MAX_BASE64_LENGTH) {
      console.warn(`[StyleSignals] Image too large: ${sizeKB}KB > 6MB limit`);
      return {
        ok: false,
        error: { kind: 'payload_too_large', message: 'Image too large for analysis' },
      };
    }

    // Step 2: Compute SHA256 from the final resized bytes (same bytes we'd send to API)
    const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const imageSha256 = await sha256Hex(base64Data);

    // Step 3: TIER 1 - DB cache lookup by composite key
    // Key: (user_id, image_sha256, prompt_version, model_version)
    const dbCached = await getStyleSignalsFromCache(userId, imageSha256);
    if (dbCached) {
      // DB cache hit - also store in memory cache for faster re-renders
      directSignalsCache.set(localImageUri, {
        signals: dbCached,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return { ok: true, data: dbCached, cached: true };
    }

    // Step 4: Cache miss - call API
    if (__DEV__) {
      console.log(`[StyleSignals] Calling API (${sizeKB}KB, hash ${imageSha256.slice(0, 8)})...`);
    }

    const response = await fetch(getStyleSignalsUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'scan_direct',
        imageDataUrl,
      }),
      signal: options?.signal,
    });

    const result = await response.json();
    
    // Step 5: Cache successful results
    if (result.ok && result.data) {
      // Memory cache (Tier 0) - fast re-renders
      directSignalsCache.set(localImageUri, {
        signals: result.data,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      
      // Limit memory cache size
      if (directSignalsCache.size > MAX_CACHE_ENTRIES) {
        const firstKey = directSignalsCache.keys().next().value;
        if (firstKey) directSignalsCache.delete(firstKey);
      }

      // DB cache (Tier 1) - UPSERT handles races (last write wins)
      setStyleSignalsInCache(userId, imageSha256, result.data);
    }

    return result as StyleSignalsResponse;
  } catch (error) {
    console.error('[StyleSignalsService] Error generating direct scan signals:', error);
    return {
      ok: false,
      error: { kind: 'network_error', message: 'Failed to generate signals from local image' },
    };
  }
}

/**
 * Clear the direct signals cache.
 * Call this when user logs out or starts a new session.
 */
export function clearDirectSignalsCache(): void {
  directSignalsCache.clear();
}

/**
 * Generate style signals for a wardrobe item.
 * Calls the style-signals Edge Function.
 *
 * @param itemId - The wardrobe item ID to generate signals for
 * @returns StyleSignalsResponse with the generated signals
 */
export async function generateWardrobeStyleSignals(
  itemId: string
): Promise<StyleSignalsResponse> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
      return {
        ok: false,
        error: { kind: 'unauthorized', message: 'Not authenticated' },
      };
    }

    const response = await fetch(getStyleSignalsUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'wardrobe',
        itemId,
      }),
    });

    const result = await response.json();
    return result as StyleSignalsResponse;
  } catch (error) {
    console.error('[StyleSignalsService] Error generating wardrobe signals:', error);
    return {
      ok: false,
      error: { kind: 'network_error', message: 'Failed to connect to server' },
    };
  }
}

/**
 * Fire-and-forget enrichment for wardrobe items.
 * Does not wait for response - used for lazy enrichment.
 *
 * @param itemId - The wardrobe item ID to enrich
 */
export function enqueueWardrobeEnrichment(itemId: string): void {
  // Fire and forget - don't await
  generateWardrobeStyleSignals(itemId).catch((error) => {
    console.warn('[StyleSignalsService] Background enrichment failed:', error);
  });
}

/**
 * Batch enqueue enrichment for multiple wardrobe items.
 * Each call is fire-and-forget.
 *
 * @param itemIds - Array of wardrobe item IDs to enrich
 */
export function enqueueWardrobeEnrichmentBatch(itemIds: string[]): void {
  for (const itemId of itemIds) {
    enqueueWardrobeEnrichment(itemId);
  }
}

// ============================================
// PERSIST SCAN SIGNALS TO DATABASE
// ============================================

/**
 * Persist scan signals to the database after direct generation.
 * Fire-and-forget with retry logic to handle race condition where
 * the recent_checks row might not exist yet (scan still being saved).
 * 
 * @param checkId - The scan check ID
 * @param signals - The generated StyleSignalsV1
 * @param maxRetries - Max retry attempts (default 3)
 * @param retryDelayMs - Delay between retries (default 500ms)
 */
export async function persistScanSignalsToDb(
  checkId: string,
  signals: StyleSignalsV1,
  maxRetries: number = 3,
  retryDelayMs: number = 500
): Promise<void> {
  const attempt = async (retryCount: number): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('recent_checks')
        .update({
          style_signals_v1: signals,
          style_signals_status: 'ready',
          style_signals_source: 'scan_ai',
          style_signals_prompt_version: CURRENT_PROMPT_VERSION,
          style_signals_updated_at: new Date().toISOString(),
        })
        .eq('id', checkId)
        .select('id');

      if (error) {
        console.warn(`[TF] Failed to persist scan signals (attempt ${retryCount + 1}):`, error.message);
        return false;
      }

      // Check if any row was updated
      const rowsUpdated = data?.length ?? 0;
      if (rowsUpdated === 0) {
        // Row doesn't exist yet - retry
        if (__DEV__) {
          console.log(`[TF] No row found for checkId ${checkId.slice(0, 8)}, will retry...`);
        }
        return false;
      }

      if (__DEV__) {
        console.log(`[TF] Persisted scan signals to DB: ${checkId.slice(0, 8)}`);
      }
      return true;
    } catch (e) {
      console.warn(`[TF] Error persisting scan signals (attempt ${retryCount + 1}):`, e);
      return false;
    }
  };

  // Fire-and-forget with retries
  (async () => {
    for (let i = 0; i < maxRetries; i++) {
      const success = await attempt(i);
      if (success) return;

      // Wait before retry (exponential backoff)
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * (i + 1)));
      }
    }

    // All retries failed - log but don't throw (signal regeneration is fallback)
    console.warn(`[TF] Failed to persist scan signals after ${maxRetries} attempts: ${checkId.slice(0, 8)}`);
  })();
}

// ============================================
// FETCH CACHED SIGNALS
// ============================================

/**
 * Fetch cached style signals for a wardrobe item from the database.
 * Does NOT call the Edge Function - just reads from DB.
 *
 * @param itemId - The wardrobe item ID
 * @returns StyleSignalsV1 or null if not cached
 */
export async function fetchWardrobeStyleSignals(
  itemId: string
): Promise<StyleSignalsV1 | null> {
  try {
    const { data, error } = await supabase
      .from('wardrobe_items')
      .select('style_signals_v1, style_signals_status')
      .eq('id', itemId)
      .single();

    if (error || !data) {
      return null;
    }

    if (data.style_signals_status !== 'ready') {
      return null;
    }

    return data.style_signals_v1 as StyleSignalsV1;
  } catch (error) {
    console.error('[StyleSignalsService] Error fetching wardrobe signals:', error);
    return null;
  }
}

/**
 * Fetch cached style signals for a scan from the database.
 *
 * @param scanId - The scan ID
 * @returns StyleSignalsV1 or null if not cached
 */
export async function fetchScanStyleSignals(
  scanId: string
): Promise<StyleSignalsV1 | null> {
  try {
    const { data, error } = await supabase
      .from('recent_checks')
      .select('style_signals_v1, style_signals_status')
      .eq('id', scanId)
      .single();

    if (error || !data) {
      return null;
    }

    if (data.style_signals_status !== 'ready') {
      return null;
    }

    return data.style_signals_v1 as StyleSignalsV1;
  } catch (error) {
    console.error('[StyleSignalsService] Error fetching scan signals:', error);
    return null;
  }
}

/**
 * Batch fetch style signals for multiple wardrobe items.
 *
 * @param itemIds - Array of wardrobe item IDs
 * @returns Map of itemId to StyleSignalsV1 (only includes items with ready signals)
 */
export async function fetchWardrobeStyleSignalsBatch(
  itemIds: string[]
): Promise<Map<string, StyleSignalsV1>> {
  const result = new Map<string, StyleSignalsV1>();

  if (itemIds.length === 0) {
    return result;
  }

  try {
    const { data, error } = await supabase
      .from('wardrobe_items')
      .select('id, style_signals_v1, style_signals_status')
      .in('id', itemIds);

    if (error || !data) {
      return result;
    }

    for (const item of data) {
      if (item.style_signals_status === 'ready' && item.style_signals_v1) {
        result.set(item.id, item.style_signals_v1 as StyleSignalsV1);
      }
    }

    return result;
  } catch (error) {
    console.error('[StyleSignalsService] Error fetching batch signals:', error);
    return result;
  }
}

/** Current prompt version - must match Edge Function */
export const CURRENT_PROMPT_VERSION = 1;

/**
 * Check which wardrobe items need enrichment.
 *
 * @param itemIds - Array of wardrobe item IDs to check
 * @returns Array of item IDs that need enrichment
 */
export async function getItemsNeedingEnrichment(
  itemIds: string[]
): Promise<string[]> {
  if (itemIds.length === 0) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('wardrobe_items')
      .select('id, style_signals_status, style_signals_prompt_version')
      .in('id', itemIds);

    if (error || !data) {
      return itemIds; // Assume all need enrichment on error
    }

    const needsEnrichment: string[] = [];

    const statusMap = new Map<string, { status: string; version: number }>();
    for (const item of data) {
      statusMap.set(item.id, {
        status: item.style_signals_status || 'none',
        version: item.style_signals_prompt_version || 0,
      });
    }

    for (const itemId of itemIds) {
      const info = statusMap.get(itemId);
      if (!info) {
        needsEnrichment.push(itemId);
        continue;
      }

      if (info.status !== 'ready' || info.version < CURRENT_PROMPT_VERSION) {
        needsEnrichment.push(itemId);
      }
    }

    return needsEnrichment;
  } catch (error) {
    console.error('[StyleSignalsService] Error checking enrichment status:', error);
    return itemIds;
  }
}

// ============================================
// RE-ENRICHMENT TRIGGERS
// ============================================

/**
 * Check if a wardrobe item's signals are outdated (prompt version mismatch).
 *
 * @param itemId - The wardrobe item ID
 * @returns True if signals need re-generation
 */
export async function isSignalsOutdated(itemId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('wardrobe_items')
      .select('style_signals_status, style_signals_prompt_version')
      .eq('id', itemId)
      .single();

    if (error || !data) {
      return true; // Assume outdated if we can't check
    }

    // Outdated if: not ready, or prompt version is old
    if (data.style_signals_status !== 'ready') {
      return true;
    }

    const version = data.style_signals_prompt_version ?? 0;
    return version < CURRENT_PROMPT_VERSION;
  } catch (error) {
    console.error('[StyleSignalsService] Error checking outdated status:', error);
    return true;
  }
}

/**
 * Force re-enrichment of a wardrobe item's style signals.
 * Resets the status to 'none' and triggers generation.
 *
 * @param itemId - The wardrobe item ID to re-enrich
 * @returns Result of the regeneration
 */
export async function forceReEnrichWardrobe(
  itemId: string
): Promise<StyleSignalsResponse> {
  try {
    // Reset status to 'none' to force regeneration
    const { error: resetError } = await supabase
      .from('wardrobe_items')
      .update({
        style_signals_status: 'none',
        style_signals_v1: null,
        style_signals_error: null,
      })
      .eq('id', itemId);

    if (resetError) {
      console.error('[StyleSignalsService] Error resetting signals:', resetError);
      return {
        ok: false,
        error: { kind: 'reset_error', message: resetError.message },
      };
    }

    // Trigger regeneration
    return await generateWardrobeStyleSignals(itemId);
  } catch (error) {
    console.error('[StyleSignalsService] Error forcing re-enrichment:', error);
    return {
      ok: false,
      error: { kind: 'unknown', message: 'Re-enrichment failed' },
    };
  }
}

/**
 * Force re-enrichment of a scan's style signals.
 *
 * @param scanId - The scan ID to re-enrich
 * @returns Result of the regeneration
 */
export async function forceReEnrichScan(
  scanId: string
): Promise<StyleSignalsResponse> {
  try {
    // Reset status to 'none' to force regeneration
    const { error: resetError } = await supabase
      .from('recent_checks')
      .update({
        style_signals_status: 'none',
        style_signals_v1: null,
        style_signals_error: null,
      })
      .eq('id', scanId);

    if (resetError) {
      console.error('[StyleSignalsService] Error resetting scan signals:', resetError);
      return {
        ok: false,
        error: { kind: 'reset_error', message: resetError.message },
      };
    }

    // Trigger regeneration
    return await generateScanStyleSignals(scanId);
  } catch (error) {
    console.error('[StyleSignalsService] Error forcing scan re-enrichment:', error);
    return {
      ok: false,
      error: { kind: 'unknown', message: 'Scan re-enrichment failed' },
    };
  }
}

/**
 * Get all wardrobe items with outdated signals (for bulk re-enrichment).
 *
 * @returns Array of item IDs with outdated signals
 */
export async function getOutdatedWardrobeItems(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('wardrobe_items')
      .select('id')
      .or(`style_signals_status.neq.ready,style_signals_prompt_version.lt.${CURRENT_PROMPT_VERSION}`);

    if (error || !data) {
      console.error('[StyleSignalsService] Error fetching outdated items:', error);
      return [];
    }

    return data.map(item => item.id);
  } catch (error) {
    console.error('[StyleSignalsService] Error fetching outdated items:', error);
    return [];
  }
}

/**
 * Trigger bulk re-enrichment for all outdated wardrobe items.
 * Fire-and-forget - runs in background.
 *
 * @param batchSize - Number of items to enrich at once (default 5)
 * @param delayMs - Delay between batches in ms (default 1000)
 */
export async function triggerBulkReEnrichment(
  batchSize: number = 5,
  delayMs: number = 1000
): Promise<{ total: number; started: boolean }> {
  const outdatedIds = await getOutdatedWardrobeItems();

  if (outdatedIds.length === 0) {
    return { total: 0, started: false };
  }

  // Process in background (fire and forget)
  (async () => {
    for (let i = 0; i < outdatedIds.length; i += batchSize) {
      const batch = outdatedIds.slice(i, i + batchSize);
      enqueueWardrobeEnrichmentBatch(batch);

      // Delay between batches to avoid overwhelming the server
      if (i + batchSize < outdatedIds.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    if (__DEV__) {
      console.log(`[StyleSignalsService] Bulk re-enrichment completed: ${outdatedIds.length} items`);
    }
  })().catch(error => {
    console.error('[StyleSignalsService] Bulk re-enrichment error:', error);
  });

  return { total: outdatedIds.length, started: true };
}

// ============================================
