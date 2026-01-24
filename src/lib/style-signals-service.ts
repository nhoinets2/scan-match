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

    const CURRENT_PROMPT_VERSION = 1;
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
