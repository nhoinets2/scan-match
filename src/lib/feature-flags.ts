/**
 * Feature Flags
 *
 * Centralized feature flag management.
 * Reads from EXPO_PUBLIC_* environment variables with fallback defaults.
 *
 * Environment variables:
 *   EXPO_PUBLIC_TRUST_FILTER_ENABLED=true
 *   EXPO_PUBLIC_TRUST_FILTER_TRACE_ENABLED=true
 *   EXPO_PUBLIC_STYLE_SIGNALS_ENABLED=true
 *   EXPO_PUBLIC_LAZY_ENRICHMENT_ENABLED=true
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

  /**
   * Enable AI Safety Check
   * When enabled, risky HIGH matches are sent to AI for additional validation.
   * @default false
   */
  ai_safety_enabled: boolean;

  /**
   * AI Safety dry run mode
   * When enabled, AI Safety verdicts are logged but NOT applied to results.
   * Use this to validate verdict quality before enabling apply mode.
   * @default true
   */
  ai_safety_dry_run: boolean;

  /**
   * AI Safety rollout percentage (0-100)
   * Only users in this percentage bucket will have AI Safety enabled.
   * @default 10
   */
  ai_safety_rollout_pct: number;
}

// ============================================
// ENVIRONMENT VARIABLE HELPERS
// ============================================

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value === 'true' || value === '1';
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// ============================================
// DEFAULT VALUES (from env vars or hardcoded defaults)
// ============================================

// Check if we're in development mode
declare const __DEV__: boolean;

const DEFAULT_FLAGS: FeatureFlags = {
  // Trust Filter: EXPO_PUBLIC_TRUST_FILTER_ENABLED or default false
  trust_filter_enabled: getEnvBoolean('EXPO_PUBLIC_TRUST_FILTER_ENABLED', false),

  // Trace logging: EXPO_PUBLIC_TRUST_FILTER_TRACE_ENABLED or default to __DEV__
  trust_filter_trace_enabled: getEnvBoolean(
    'EXPO_PUBLIC_TRUST_FILTER_TRACE_ENABLED',
    typeof __DEV__ !== 'undefined' ? __DEV__ : false
  ),

  // Style signals: EXPO_PUBLIC_STYLE_SIGNALS_ENABLED or default false
  style_signals_enabled: getEnvBoolean('EXPO_PUBLIC_STYLE_SIGNALS_ENABLED', false),

  // Lazy enrichment: EXPO_PUBLIC_LAZY_ENRICHMENT_ENABLED or default false
  lazy_enrichment_enabled: getEnvBoolean('EXPO_PUBLIC_LAZY_ENRICHMENT_ENABLED', false),

  // AI Safety: EXPO_PUBLIC_AI_SAFETY_ENABLED or default false
  ai_safety_enabled: getEnvBoolean('EXPO_PUBLIC_AI_SAFETY_ENABLED', false),

  // AI Safety dry run: EXPO_PUBLIC_AI_SAFETY_DRY_RUN or default true (safe default)
  ai_safety_dry_run: getEnvBoolean('EXPO_PUBLIC_AI_SAFETY_DRY_RUN', true),

  // AI Safety rollout: EXPO_PUBLIC_AI_SAFETY_ROLLOUT_PCT or default 10%
  ai_safety_rollout_pct: getEnvNumber('EXPO_PUBLIC_AI_SAFETY_ROLLOUT_PCT', 10),
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

/**
 * Check if AI Safety is enabled
 */
export function isAiSafetyEnabled(): boolean {
  return currentFlags.ai_safety_enabled;
}

/**
 * Check if AI Safety is in dry run mode
 */
export function isAiSafetyDryRun(): boolean {
  return currentFlags.ai_safety_dry_run;
}

/**
 * Get AI Safety rollout percentage
 */
export function getAiSafetyRolloutPct(): number {
  return currentFlags.ai_safety_rollout_pct;
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
