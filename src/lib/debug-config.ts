/**
 * Debug Feature Flags
 * 
 * These flags control debug functionality throughout the app.
 * In production builds (__DEV__ = false), all debug features are disabled automatically.
 * 
 * Usage:
 * - Development: Full debug functionality (snapshots saved, debug UI available)
 * - Production: Zero debug overhead (no storage, no UI, no extra queries)
 */

// Check if we're in development mode (Expo/React Native provides __DEV__)
const isDevelopment = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

export const DEBUG_FEATURES = {
  /**
   * Save engine snapshots to database with each scan
   * - true: Snapshots stored in recent_checks.engine_snapshot
   * - false: No debug data stored (production)
   */
  SAVE_ENGINE_SNAPSHOTS: isDevelopment,
  
  /**
   * Show debug UI elements (long press for snapshot viewer, etc.)
   * - true: Debug gestures and modals available
   * - false: Standard user experience only
   */
  SHOW_DEBUG_UI: isDevelopment,
  
  /**
   * Log match count recalculations to console
   * Useful for debugging useMatchCount hook behavior
   */
  LOG_MATCH_COUNT_RECALC: false,
  
  /**
   * Emergency flag for production debugging
   * Can be enabled via remote config if needed to debug prod issues
   * Note: Requires app restart to take effect
   */
  FORCE_DEBUG_MODE: false,
} as const;

/**
 * Helper to check if debug data should be saved
 * Respects both development mode and emergency override
 */
export const shouldSaveDebugData = (): boolean => 
  DEBUG_FEATURES.SAVE_ENGINE_SNAPSHOTS || DEBUG_FEATURES.FORCE_DEBUG_MODE;

/**
 * Helper to check if debug UI should be shown
 */
export const shouldShowDebugUI = (): boolean => 
  DEBUG_FEATURES.SHOW_DEBUG_UI || DEBUG_FEATURES.FORCE_DEBUG_MODE;
