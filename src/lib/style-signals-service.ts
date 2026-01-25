/**
 * Style Signals Service
 *
 * Client-side service for generating and fetching style signals.
 * Calls the style-signals Edge Function.
 */

import { supabase } from './supabase';
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

/**
 * Generate style signals directly from a local image.
 * Converts the local image to base64 and sends to the Edge Function.
 * Used for unsaved scans where the image hasn't been uploaded yet.
 *
 * @param localImageUri - Local file:// URI of the image
 * @returns StyleSignalsResponse with the generated signals
 */
export async function generateScanStyleSignalsDirect(
  localImageUri: string
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

    // Convert local image to base64 data URL
    const { readAsStringAsync, EncodingType } = await import('expo-file-system');
    const base64Data = await readAsStringAsync(localImageUri, {
      encoding: EncodingType.Base64,
    });

    // Determine MIME type from extension
    const extension = localImageUri.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
    const imageDataUrl = `data:${mimeType};base64,${base64Data}`;

    if (__DEV__) {
      console.log('[StyleSignalsService] Generating direct signals for local image');
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
    return result as StyleSignalsResponse;
  } catch (error) {
    console.error('[StyleSignalsService] Error generating direct scan signals:', error);
    return {
      ok: false,
      error: { kind: 'network_error', message: 'Failed to generate signals from local image' },
    };
  }
}

// Declare __DEV__ for TypeScript
declare const __DEV__: boolean;

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
// __DEV__ DECLARATION
// ============================================

declare const __DEV__: boolean;
