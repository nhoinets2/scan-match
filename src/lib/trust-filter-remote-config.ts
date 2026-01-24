/**
 * Trust Filter Remote Config Service
 *
 * Fetches and applies remote config overrides for Trust Filter.
 * Validates overrides against allowed keys before applying.
 */

import { supabase } from './supabase';
import {
  TRUST_FILTER_CONFIG_V1,
  mergeRemoteConfig,
  type TrustFilterConfigV1,
} from './trust-filter/config';
import { trackTrustFilterRemoteConfigInvalid } from './analytics';

// ============================================
// TYPES
// ============================================

interface RemoteConfigRow {
  id: string;
  version: number;
  is_active: boolean;
  config_overrides: Record<string, unknown>;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface FetchResult {
  config: TrustFilterConfigV1;
  version: number;
  fromRemote: boolean;
  errors: string[];
}

// ============================================
// CACHING
// ============================================

let cachedConfig: TrustFilterConfigV1 | null = null;
let cachedVersion: number | null = null;
let lastFetchTime: number = 0;

/** Cache duration: 5 minutes */
const CACHE_DURATION_MS = 5 * 60 * 1000;

/**
 * Clear the cached config (call on logout or when forcing refresh)
 */
export function clearRemoteConfigCache(): void {
  cachedConfig = null;
  cachedVersion = null;
  lastFetchTime = 0;
}

// ============================================
// FETCH CONFIG
// ============================================

/**
 * Fetch the active Trust Filter config from Supabase.
 * Returns the merged config (base + remote overrides).
 *
 * - Caches for 5 minutes to avoid excessive fetches
 * - Falls back to compiled config if fetch fails
 * - Validates remote overrides before applying
 */
export async function fetchTrustFilterConfig(): Promise<FetchResult> {
  // Return cached config if still valid
  const now = Date.now();
  if (cachedConfig && (now - lastFetchTime) < CACHE_DURATION_MS) {
    return {
      config: cachedConfig,
      version: cachedVersion ?? 1,
      fromRemote: true,
      errors: [],
    };
  }

  try {
    // Fetch active config from Supabase
    const { data, error } = await supabase
      .from('trust_filter_config')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error) {
      // No active config or fetch error - use compiled config
      if (__DEV__) {
        console.log('[RemoteConfig] No active config found, using compiled config');
      }
      return {
        config: TRUST_FILTER_CONFIG_V1,
        version: 1,
        fromRemote: false,
        errors: [],
      };
    }

    const row = data as RemoteConfigRow;

    // Merge remote overrides with base config
    const { config: mergedConfig, valid, errors } = mergeRemoteConfig(
      TRUST_FILTER_CONFIG_V1,
      row.config_overrides
    );

    if (!valid) {
      // Track invalid config
      trackTrustFilterRemoteConfigInvalid({ errors });

      if (__DEV__) {
        console.warn('[RemoteConfig] Invalid remote config:', errors);
      }

      // Still use merged config (safe keys are applied, invalid ones skipped)
    }

    // Cache the merged config
    cachedConfig = mergedConfig;
    cachedVersion = row.version;
    lastFetchTime = now;

    if (__DEV__) {
      console.log('[RemoteConfig] Loaded remote config:', {
        version: row.version,
        valid,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    return {
      config: mergedConfig,
      version: row.version,
      fromRemote: true,
      errors,
    };
  } catch (error) {
    console.error('[RemoteConfig] Fetch error:', error);

    // Fall back to compiled config
    return {
      config: TRUST_FILTER_CONFIG_V1,
      version: 1,
      fromRemote: false,
      errors: ['Fetch failed: ' + (error instanceof Error ? error.message : 'Unknown error')],
    };
  }
}

/**
 * Get the current config (from cache or fetch).
 * Synchronous version - returns cached or compiled config immediately.
 * Use this in hot paths where you can't await.
 */
export function getTrustFilterConfigSync(): TrustFilterConfigV1 {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Trigger async fetch for next time (fire and forget)
  fetchTrustFilterConfig().catch(() => {
    // Silently ignore - we'll use compiled config
  });

  return TRUST_FILTER_CONFIG_V1;
}

/**
 * Preload the remote config (call at app start).
 * Non-blocking - just starts the fetch.
 */
export function preloadRemoteConfig(): void {
  fetchTrustFilterConfig().catch(() => {
    // Silently ignore - we'll use compiled config
  });
}

// ============================================
// __DEV__ DECLARATION
// ============================================

declare const __DEV__: boolean;
