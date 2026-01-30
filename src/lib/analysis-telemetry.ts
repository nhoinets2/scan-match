/**
 * Image Analysis Telemetry
 * 
 * Tracks metrics to identify if/when preprocessing pipeline is needed.
 * 
 * Key signals to watch:
 * - Large images (may benefit from downscaling)
 * - Low context sufficiency (AI uncertain about item)
 * - Slow analysis times (latency issues)
 * - Cache hit rates (are we getting value from caching?)
 */

import { supabase } from './supabase';
import type { AnalyzeErrorKind } from './openai';

// ============================================
// ANALYSIS LIFECYCLE TELEMETRY TYPES
// ============================================

/**
 * Telemetry events for the analysis lifecycle (loading → success/failure → retry).
 * These are used in PR3 for tracking the results screen state machine.
 * 
 * Event types:
 * - analysis_started: Analysis began (loading state)
 * - analysis_succeeded: Analysis completed successfully
 * - analysis_failed: Analysis failed with an error
 * - analysis_retry_tapped: User tapped retry button
 * - analysis_retry_background: Auto-retry after backgrounding during analysis
 * - analysis_recovered_success: Succeeded after a previous failure
 * - analysis_cancelled: User navigated away during loading
 * - analysis_max_retries: Max retry limit reached
 */
export type AnalysisLifecycleEventName =
  | "analysis_started"
  | "analysis_succeeded"
  | "analysis_failed"
  | "analysis_retry_tapped"
  | "analysis_retry_background"
  | "analysis_recovered_success"
  | "analysis_cancelled"
  | "analysis_max_retries";

export interface AnalysisLifecycleEvent {
  name: AnalysisLifecycleEventName;
  props: {
    /** Source of the scan: camera, gallery, recent, saved */
    source?: "camera" | "gallery" | "recent" | "saved";
    /** Current attempt number (1-based) */
    attempt: number;
    /** Correlation key for linking events across retries */
    analysisKey?: string;
    /** Error kind (only for failed/max_retries events) */
    errorKind?: AnalyzeErrorKind;
    /** Duration in ms (for succeeded/failed events) */
    durationMs?: number;
    /** Whether this was a cache hit (for succeeded events) */
    cacheHit?: boolean;
  };
}

/**
 * Log an analysis lifecycle event.
 * These events help track user behavior through the analysis flow.
 */
export function logAnalysisLifecycleEvent(event: AnalysisLifecycleEvent): void {
  if (__DEV__) {
    console.log(`[AnalysisLifecycle] ${event.name}`, JSON.stringify(event.props));
  }
  
  // TODO (PR3): Send to telemetry backend when results screen owns analysis
  // For now, just log locally for debugging
}

// ============================================
// EXISTING TELEMETRY TYPES
// ============================================

export interface AnalysisTelemetryEvent {
  // Identifiers
  scan_session_id?: string;
  user_id?: string;
  
  // Image info
  image_width: number;
  image_height: number;
  image_size_bytes?: number;
  image_source: 'camera' | 'gallery' | 'unknown';
  
  // Analysis results
  analysis_success: boolean;
  analysis_duration_ms: number;
  context_sufficient: boolean;
  detected_category?: string;
  
  // Non-fashion detection
  is_fashion_item?: boolean;
  is_non_fashion_fallback_used?: boolean; // True if keyword fallback determined non-fashion
  descriptive_label?: string; // For debugging non-fashion false positives
  
  // Cache info
  cache_hit: boolean;
  cache_key_prefix?: string; // First 8 chars of hash
  
  // Quality signals (for future preprocessing decisions)
  style_tags_count?: number;
  colors_count?: number;
  
  // Timestamps
  timestamp: string;
}

export interface AnalysisTelemetrySummary {
  total_scans: number;
  cache_hit_rate: number;
  avg_duration_ms: number;
  context_insufficient_rate: number;
  avg_image_megapixels: number;
  large_image_rate: number; // > 2MP
  scans_by_source: Record<string, number>;
  scans_by_category: Record<string, number>;
}

// ============================================
// IN-MEMORY BUFFER (for batching)
// ============================================

const TELEMETRY_BUFFER: AnalysisTelemetryEvent[] = [];
const FLUSH_INTERVAL_MS = 30000; // Flush every 30s
const MAX_BUFFER_SIZE = 20;

let flushTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================
// TELEMETRY LOGGING
// ============================================

/**
 * Log an analysis telemetry event
 */
export function logAnalysisTelemetry(event: Omit<AnalysisTelemetryEvent, 'timestamp'>): void {
  const fullEvent: AnalysisTelemetryEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  
  // Always log to console in dev
  if (__DEV__) {
    console.log('[AnalysisTelemetry]', JSON.stringify({
      duration_ms: fullEvent.analysis_duration_ms,
      cache_hit: fullEvent.cache_hit,
      context_sufficient: fullEvent.context_sufficient,
      image_mp: ((fullEvent.image_width * fullEvent.image_height) / 1_000_000).toFixed(2),
      category: fullEvent.detected_category,
      source: fullEvent.image_source,
    }));
  }
  
  // Add to buffer
  TELEMETRY_BUFFER.push(fullEvent);
  
  // Flush if buffer is full
  if (TELEMETRY_BUFFER.length >= MAX_BUFFER_SIZE) {
    flushTelemetry();
  }
  
  // Start flush timer if not running
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTelemetry();
      flushTimer = null;
    }, FLUSH_INTERVAL_MS);
  }
}

/**
 * Flush telemetry buffer to Supabase
 */
async function flushTelemetry(): Promise<void> {
  if (TELEMETRY_BUFFER.length === 0) return;
  
  const events = [...TELEMETRY_BUFFER];
  TELEMETRY_BUFFER.length = 0; // Clear buffer
  
  try {
    // Store in Supabase (table created lazily)
    const { error } = await supabase
      .from('analysis_telemetry')
      .insert(events.map(e => ({
        scan_session_id: e.scan_session_id,
        user_id: e.user_id,
        image_width: e.image_width,
        image_height: e.image_height,
        image_size_bytes: e.image_size_bytes,
        image_source: e.image_source,
        analysis_success: e.analysis_success,
        analysis_duration_ms: e.analysis_duration_ms,
        context_sufficient: e.context_sufficient,
        detected_category: e.detected_category,
        cache_hit: e.cache_hit,
        cache_key_prefix: e.cache_key_prefix,
        style_tags_count: e.style_tags_count,
        colors_count: e.colors_count,
        created_at: e.timestamp,
      })));
    
    if (error) {
      // Don't crash on telemetry errors - just log
      if (__DEV__) {
        console.log('[AnalysisTelemetry] Flush error:', error.message);
      }
      // Table might not exist yet - that's okay
    }
  } catch (err) {
    // Silently fail - telemetry should never break the app
    if (__DEV__) {
      console.log('[AnalysisTelemetry] Flush exception:', err);
    }
  }
}

// ============================================
// LOCAL SUMMARY (in-memory stats)
// ============================================

// Keep recent stats in memory for quick access
const RECENT_STATS = {
  scans: 0,
  cache_hits: 0,
  total_duration_ms: 0,
  context_insufficient: 0,
  large_images: 0, // > 2MP
  total_megapixels: 0,
  by_source: {} as Record<string, number>,
  by_category: {} as Record<string, number>,
};

/**
 * Update local stats (called by logAnalysisTelemetry)
 */
export function updateLocalStats(event: AnalysisTelemetryEvent): void {
  RECENT_STATS.scans++;
  if (event.cache_hit) RECENT_STATS.cache_hits++;
  RECENT_STATS.total_duration_ms += event.analysis_duration_ms;
  if (!event.context_sufficient) RECENT_STATS.context_insufficient++;
  
  const megapixels = (event.image_width * event.image_height) / 1_000_000;
  RECENT_STATS.total_megapixels += megapixels;
  if (megapixels > 2) RECENT_STATS.large_images++;
  
  RECENT_STATS.by_source[event.image_source] = 
    (RECENT_STATS.by_source[event.image_source] || 0) + 1;
  
  if (event.detected_category) {
    RECENT_STATS.by_category[event.detected_category] = 
      (RECENT_STATS.by_category[event.detected_category] || 0) + 1;
  }
}

/**
 * Get current session summary (for debugging)
 */
export function getSessionTelemetrySummary(): AnalysisTelemetrySummary {
  const { scans, cache_hits, total_duration_ms, context_insufficient, large_images, total_megapixels, by_source, by_category } = RECENT_STATS;
  
  return {
    total_scans: scans,
    cache_hit_rate: scans > 0 ? cache_hits / scans : 0,
    avg_duration_ms: scans > 0 ? total_duration_ms / scans : 0,
    context_insufficient_rate: scans > 0 ? context_insufficient / scans : 0,
    avg_image_megapixels: scans > 0 ? total_megapixels / scans : 0,
    large_image_rate: scans > 0 ? large_images / scans : 0,
    scans_by_source: by_source,
    scans_by_category: by_category,
  };
}

/**
 * Reset local stats (e.g., on new session)
 */
export function resetSessionStats(): void {
  RECENT_STATS.scans = 0;
  RECENT_STATS.cache_hits = 0;
  RECENT_STATS.total_duration_ms = 0;
  RECENT_STATS.context_insufficient = 0;
  RECENT_STATS.large_images = 0;
  RECENT_STATS.total_megapixels = 0;
  RECENT_STATS.by_source = {};
  RECENT_STATS.by_category = {};
}

// ============================================
// HELPER: Create telemetry event from analysis
// ============================================

export interface CreateTelemetryParams {
  scanSessionId?: string;
  userId?: string;
  imageWidth: number;
  imageHeight: number;
  imageSizeBytes?: number;
  imageSource: 'camera' | 'gallery' | 'unknown';
  analysisSuccess: boolean;
  analysisDurationMs: number;
  contextSufficient: boolean;
  detectedCategory?: string;
  cacheHit: boolean;
  cacheKeyPrefix?: string;
  styleTagsCount?: number;
  colorsCount?: number;
  // Non-fashion detection
  isFashionItem?: boolean;
  isNonFashionFallbackUsed?: boolean;
  descriptiveLabel?: string;
}

export function createAnalysisTelemetryEvent(params: CreateTelemetryParams): Omit<AnalysisTelemetryEvent, 'timestamp'> {
  return {
    scan_session_id: params.scanSessionId,
    user_id: params.userId,
    image_width: params.imageWidth,
    image_height: params.imageHeight,
    image_size_bytes: params.imageSizeBytes,
    image_source: params.imageSource,
    analysis_success: params.analysisSuccess,
    analysis_duration_ms: params.analysisDurationMs,
    context_sufficient: params.contextSufficient,
    detected_category: params.detectedCategory,
    cache_hit: params.cacheHit,
    cache_key_prefix: params.cacheKeyPrefix,
    style_tags_count: params.styleTagsCount,
    colors_count: params.colorsCount,
    // Non-fashion detection
    is_fashion_item: params.isFashionItem,
    is_non_fashion_fallback_used: params.isNonFashionFallbackUsed,
    descriptive_label: params.descriptiveLabel,
  };
}

