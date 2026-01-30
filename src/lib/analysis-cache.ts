/**
 * Clothing Image Analysis Cache
 *
 * Caches AI analysis results by image hash to ensure deterministic results
 * when the same image is scanned multiple times.
 *
 * Cache key format: v{VERSION}:{model}:{promptVersion}:{sha256}
 * This ensures automatic invalidation when prompt/model/schema changes.
 */

import * as Crypto from 'expo-crypto';
import type { ClothingAnalysisResult } from './openai';

// ============================================
// CACHE CONFIGURATION
// ============================================

/**
 * Cache version - bump when cache format changes
 */
export const ANALYSIS_CACHE_VERSION = 'v1';

/**
 * Prompt version - bump when prompt/schema changes
 * Format: YYYY-MM-DD or semantic version
 * 
 * History:
 * - 2026-01-05: Initial version
 * - 2026-01-25: Reverted combined analysis (separate style signals fetch)
 */
export const PROMPT_VERSION = '2026-01-25-rev';

/**
 * Model used for analysis
 * Updated 2026-01-30: Migrated from GPT-4o to Claude Sonnet 4.5
 */
export const ANALYSIS_MODEL = 'claude-sonnet-4.5';

// ============================================
// SHA-256 HASHING (Cross-platform)
// ============================================

/**
 * Compute SHA-256 hash of a string (base64 image data).
 * Works on both web and React Native using expo-crypto.
 *
 * @param data - The string to hash (typically base64 image data)
 * @returns Hex-encoded SHA-256 hash
 */
export async function sha256Hex(data: string): Promise<string> {
  // Use expo-crypto for cross-platform SHA-256
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    data
  );
  return hash; // Already returns lowercase hex string
}

/**
 * Generate a versioned cache key.
 * Key changes when model, prompt, or image changes = automatic invalidation.
 */
export function generateCacheKey(imageSha256: string): string {
  return `${ANALYSIS_CACHE_VERSION}:${ANALYSIS_MODEL}:${PROMPT_VERSION}:${imageSha256}`;
}

// ============================================
// SUPABASE IMPORT (deferred to avoid polyfill issues in tests)
// ============================================

// Dynamic import to avoid React Native polyfill issues in Jest
let supabaseClient: typeof import('./supabase').supabase | null = null;
let isPrewarming = false;

async function getSupabase() {
  if (!supabaseClient) {
    const mod = await import('./supabase');
    supabaseClient = mod.supabase;
  }
  return supabaseClient;
}

/**
 * Pre-warm the Supabase connection.
 * Call this early (e.g., when scan screen opens) to avoid cold start latency.
 * Safe to call multiple times - only initializes once.
 */
export async function prewarmCacheConnection(): Promise<void> {
  if (supabaseClient || isPrewarming) return;
  
  isPrewarming = true;
  try {
    const start = Date.now();
    await getSupabase();
    console.log(`[Cache] Connection prewarmed in ${Date.now() - start}ms`);
  } catch (err) {
    console.log('[Cache] Prewarm failed (non-fatal):', err);
  } finally {
    isPrewarming = false;
  }
}

// ============================================
// CACHE OPERATIONS
// ============================================

export interface CachedAnalysis {
  analysis: ClothingAnalysisResult;
  hit_count: number;
  created_at: string;
}

/**
 * Get cached analysis by key.
 * Returns null if not found or on error.
 */
export async function getCachedAnalysis(
  analysisKey: string
): Promise<ClothingAnalysisResult | null> {
  try {
    const startTime = Date.now();
    
    // Get Supabase client (may involve dynamic import on first call)
    const supabase = await getSupabase();
    const clientTime = Date.now() - startTime;
    if (clientTime > 100) {
      console.log(`[Cache] Supabase client init: ${clientTime}ms (cold start)`);
    }
    
    // Query the cache
    const queryStart = Date.now();
    const { data, error } = await supabase
      .from('clothing_image_analysis_cache')
      .select('analysis')
      .eq('analysis_key', analysisKey)
      .maybeSingle(); // Use maybeSingle to return null instead of error when not found
    const queryTime = Date.now() - queryStart;

    if (error) {
      // Real error (not just "not found")
      console.log(`[Cache] Lookup error after ${queryTime}ms:`, error.message);
      return null;
    }
    
    if (!data) {
      // Normal cache miss - entry doesn't exist yet
      console.log(`[Cache] Miss (query: ${queryTime}ms)`);
      return null;
    }

    console.log(`[Cache] HIT (query: ${queryTime}ms)`);
    
    // Extract result BEFORE any hit tracking (so we can return it even if tracking fails)
    const cachedResult = data.analysis as ClothingAnalysisResult;
    
    // Fire-and-forget hit count increment (completely optional, don't block return)
    // Do this asynchronously and ignore all errors
    // Check if rpc method exists (mock client may not have it)
    if (typeof supabase.rpc === 'function') {
      setTimeout(async () => {
        try {
          await supabase.rpc('increment_cache_hit', { p_analysis_key: analysisKey });
        } catch {
          /* ignore hit tracking errors */
        }
      }, 0);
    }

    return cachedResult;
  } catch (err) {
    console.log('[Cache] Exception in getCachedAnalysis:', err);
    return null;
  }
}

/**
 * Store analysis in cache.
 * Uses upsert to handle race conditions gracefully.
 */
export async function setCachedAnalysis(params: {
  analysisKey: string;
  imageSha256: string;
  model: string;
  promptVersion: string;
  analysis: ClothingAnalysisResult;
}): Promise<boolean> {
  try {
    console.log('[Cache] Storing analysis for:', params.imageSha256.slice(0, 8));
    const supabase = await getSupabase();
    const { error } = await supabase
      .from('clothing_image_analysis_cache')
      .upsert(
        {
          analysis_key: params.analysisKey,
          image_sha256: params.imageSha256,
          model: params.model,
          prompt_version: params.promptVersion,
          analysis: params.analysis,
          hit_count: 0,
        },
        {
          onConflict: 'analysis_key',
          // Don't update if already exists (first-writer-wins)
          ignoreDuplicates: true,
        }
      );

    if (error) {
      console.log('[Cache] Store error:', error.message);
      return false;
    }
    
    console.log('[Cache] Successfully stored analysis');
    return true;
  } catch (err) {
    console.log('[Cache] Exception in setCachedAnalysis:', err);
    return false;
  }
}

// ============================================
// TELEMETRY
// ============================================

export interface AnalysisCacheTelemetry {
  scan_session_id?: string;
  cache_hit: boolean;
  analysis_key_version: string;
  model: string;
  prompt_version: string;
  image_sha256_prefix?: string; // First 8 chars for debugging
}

/**
 * Log cache telemetry (dev only).
 */
export function logCacheTelemetry(
  cacheHit: boolean,
  imageSha256: string,
  scanSessionId?: string
): void {
  if (__DEV__) {
    const telemetry: AnalysisCacheTelemetry = {
      scan_session_id: scanSessionId ?? undefined,
      cache_hit: cacheHit,
      analysis_key_version: ANALYSIS_CACHE_VERSION,
      model: ANALYSIS_MODEL,
      prompt_version: PROMPT_VERSION,
      image_sha256_prefix: imageSha256.slice(0, 8),
    };

    console.debug(
      cacheHit ? '[AnalyzeImage] cache_hit' : '[AnalyzeImage] cache_miss',
      JSON.stringify(telemetry)
    );
  }
}
