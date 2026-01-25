/**
 * Style Signals Service
 *
 * Client-side service for generating and fetching style signals.
 * Calls the style-signals Edge Function.
 */

import { supabase } from './supabase';
import type { StyleSignalsV1 } from './trust-filter/types';

// Declare __DEV__ for TypeScript (provided by React Native runtime)
declare const __DEV__: boolean;

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
 * Results are cached in-memory by image URI to avoid repeated API calls.
 *
 * @param localImageUri - Local file:// URI of the image
 * @returns StyleSignalsResponse with the generated signals
 */
export async function generateScanStyleSignalsDirect(
  localImageUri: string
): Promise<StyleSignalsResponse> {
  try {
    // Clean expired entries periodically
    cleanExpiredCache();

    // Check in-memory cache first (avoid repeated base64 + API calls on re-renders)
    const cached = directSignalsCache.get(localImageUri);
    const now = Date.now();
    
    if (cached && cached.expiresAt > now) {
      // Cache hit - skip compression and API call
      return { ok: true, data: cached.signals };
    }

    // Remove expired entry if exists
    if (cached) {
      directSignalsCache.delete(localImageUri);
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
      return {
        ok: false,
        error: { kind: 'unauthorized', message: 'Not authenticated' },
      };
    }

    // Resize and compress image before converting to base64
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

    if (__DEV__) {
      console.log(`[StyleSignals] Compressed to ${sizeKB}KB, calling API...`);
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
    });

    const result = await response.json();
    
    // Cache successful results with TTL
    if (result.ok && result.data) {
      directSignalsCache.set(localImageUri, {
        signals: result.data,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      
      // Limit cache size (keep last MAX_CACHE_ENTRIES scans, evict oldest)
      if (directSignalsCache.size > MAX_CACHE_ENTRIES) {
        const firstKey = directSignalsCache.keys().next().value;
        if (firstKey) directSignalsCache.delete(firstKey);
      }
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
