/**
 * Feature Flags
 *
 * Centralized feature flag management.
 * In production, these could be fetched from a remote config service.
 */

// ============================================
// FEATURE FLAG DEFINITIONS
// ============================================

export interface FeatureFlags {
  /**
   * Enable Trust Filter v1
   * When enabled, HIGH matches are post-processed to filter out trust-breaking combinations.
   * @default false
   */
  trust_filter_enabled: boolean;

  /**
   * Enable Trust Filter trace logging
   * When enabled, Trust Filter decisions include detailed trace arrays for debugging.
   * @default false in production, true in development
   */
  trust_filter_trace_enabled: boolean;

  /**
   * Enable style signals generation
   * When enabled, scan results and wardrobe items are enriched with style_signals_v1.
   * @default false
   */
  style_signals_enabled: boolean;

  /**
   * Enable lazy enrichment for wardrobe items
   * When enabled, wardrobe items are enriched with style signals in the background.
   * @default false
   */
  lazy_enrichment_enabled: boolean;
}

// ============================================
// DEFAULT VALUES
// ============================================

// Check if we're in development mode
declare const __DEV__: boolean;

const DEFAULT_FLAGS: FeatureFlags = {
  // Trust Filter is disabled by default until fully tested
  trust_filter_enabled: false,

  // Trace logging only in development
  trust_filter_trace_enabled: typeof __DEV__ !== 'undefined' ? __DEV__ : false,

  // Style signals disabled until Edge Function is deployed
  style_signals_enabled: false,

  // Lazy enrichment disabled until tested
  lazy_enrichment_enabled: false,
};

// ============================================
// CURRENT FLAGS (mutable for testing)
// ============================================

let currentFlags: FeatureFlags = { ...DEFAULT_FLAGS };

// ============================================
// PUBLIC API
// ============================================

/**
 * Get all current feature flags
 */
export function getFeatureFlags(): FeatureFlags {
  return { ...currentFlags };
}

/**
 * Get a specific feature flag value
 */
export function getFlag<K extends keyof FeatureFlags>(key: K): FeatureFlags[K] {
  return currentFlags[key];
}

/**
 * Check if Trust Filter is enabled
 */
export function isTrustFilterEnabled(): boolean {
  return currentFlags.trust_filter_enabled;
}

/**
 * Check if Trust Filter trace logging is enabled
 */
export function isTrustFilterTraceEnabled(): boolean {
  return currentFlags.trust_filter_trace_enabled;
}

/**
 * Check if style signals generation is enabled
 */
export function isStyleSignalsEnabled(): boolean {
  return currentFlags.style_signals_enabled;
}

/**
 * Check if lazy enrichment is enabled
 */
export function isLazyEnrichmentEnabled(): boolean {
  return currentFlags.lazy_enrichment_enabled;
}

// ============================================
// OVERRIDE API (for testing and remote config)
// ============================================

/**
 * Override feature flags (for testing or remote config)
 * @param overrides - Partial flags to override
 */
export function setFeatureFlags(overrides: Partial<FeatureFlags>): void {
  currentFlags = { ...currentFlags, ...overrides };

  if (__DEV__) {
    console.log('[FeatureFlags] Updated flags:', currentFlags);
  }
}

/**
 * Reset feature flags to defaults
 */
export function resetFeatureFlags(): void {
  currentFlags = { ...DEFAULT_FLAGS };

  if (__DEV__) {
    console.log('[FeatureFlags] Reset to defaults:', currentFlags);
  }
}

/**
 * Enable Trust Filter (convenience function for testing)
 */
export function enableTrustFilter(): void {
  setFeatureFlags({
    trust_filter_enabled: true,
    style_signals_enabled: true,
    lazy_enrichment_enabled: true,
  });
}

/**
 * Disable Trust Filter (convenience function for testing)
 */
export function disableTrustFilter(): void {
  setFeatureFlags({
    trust_filter_enabled: false,
  });
}

// ============================================
// REMOTE CONFIG INTEGRATION (PLACEHOLDER)
// ============================================

/**
 * Fetch feature flags from remote config.
 * Placeholder for future remote config integration.
 *
 * In production, this could fetch from:
 * - Supabase remote config table
 * - Firebase Remote Config
 * - LaunchDarkly
 * - etc.
 */
export async function fetchRemoteFlags(): Promise<void> {
  // TODO: Implement remote config fetching
  // For now, just use defaults

  if (__DEV__) {
    console.log('[FeatureFlags] Remote config not implemented, using defaults');
  }
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize feature flags.
 * Call this at app startup.
 */
export function initializeFeatureFlags(): void {
  currentFlags = { ...DEFAULT_FLAGS };

  if (__DEV__) {
    console.log('[FeatureFlags] Initialized with:', currentFlags);
  }
}
