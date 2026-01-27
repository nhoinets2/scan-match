/**
 * AI Safety - Client
 *
 * Client wrapper for the /ai-safety-check Edge Function.
 * Handles request formatting, error handling, and response parsing.
 *
 * Features:
 * - Policy versioning for cache invalidation on prompt changes
 * - In-flight request deduplication
 * - Proper error handling with fallback behavior
 */

import { supabase } from '../supabase';
import { signalsHash } from './signalsHash';
import type { StyleSignalsV1, ArchetypeDistance, TFCategory } from '../trust-filter/types';

// ============================================
// POLICY VERSION
// ============================================

/**
 * Policy version for cache invalidation.
 *
 * BUMP THIS when you change:
 * - AI Safety prompt
 * - Verdict logic
 * - Response parsing
 *
 * This causes immediate cache miss for all existing verdicts,
 * ensuring prompt updates propagate without waiting for TTL.
 */
export const AI_SAFETY_POLICY_VERSION = 1;

// ============================================
// IN-FLIGHT REQUEST DEDUPLICATION
// ============================================

/**
 * Module-level map tracking in-flight requests.
 * Key: unique request key (scanHash + matchHashes + policyVersion)
 * Value: Promise that resolves to the API response
 *
 * This prevents duplicate API calls when:
 * - React Strict Mode double-mounts
 * - Dependencies cause effects to rerun
 * - User navigates quickly / results screen remounts
 */
const inFlightRequests = new Map<string, Promise<AiSafetyResponse>>();

/**
 * Compute a stable key for deduplication.
 * Includes all inputs that affect the result.
 */
function computeRequestKey(
  scanHash: string,
  pairHashes: string[],
  policyVersion: number
): string {
  // Sort pair hashes for consistent key regardless of order
  const sortedHashes = [...pairHashes].sort().join('|');
  return `${scanHash}:${sortedHashes}:v${policyVersion}`;
}

// ============================================
// TYPES
// ============================================

export interface AiSafetyPairInput {
  itemId: string;
  pairType: string; // e.g., "shoes+bottoms"
  distance: ArchetypeDistance;
  matchSignals: StyleSignalsV1;
}

export interface AiSafetyVerdict {
  itemId: string;
  action: 'keep' | 'demote' | 'hide';
  reason_code: 'ai_keep' | 'ai_sanity_veto' | 'ai_sanity_demote' | 'timeout_fallback' | 'error_fallback';
  ai_confidence: number | null;
  ai_reason: string | null;
  source: 'ai_call' | 'cache_hit';
  latency_ms: number | null;
  cached: boolean;
}

export interface AiSafetyResponse {
  ok: boolean;
  verdicts: AiSafetyVerdict[];
  /** What the client requested (may be null if not specified) */
  requested_dry_run: boolean | null;
  /** What the server decided (this is what matters for logic) */
  effective_dry_run: boolean;
  /** @deprecated Use effective_dry_run instead. Kept for backwards compatibility. */
  dry_run?: boolean;
  rate_limited?: boolean;
  stats?: {
    total_pairs: number;
    cache_hits: number;
    ai_calls: number;
    ai_latency_ms?: number | null;
    total_latency_ms: number;
    rate_limit_remaining?: number | null;
  };
  error?: {
    kind: string;
    message: string;
  };
}

// ============================================
// PAIR TYPE HELPER
// ============================================

/**
 * Compute pair type from scan + match categories
 * Format: "scanCategory+matchCategory" (e.g., "shoes+bottoms")
 */
export function computePairType(scanCategory: TFCategory, matchCategory: TFCategory): string {
  return `${scanCategory}+${matchCategory}`;
}

// ============================================
// CLIENT FUNCTION
// ============================================

/**
 * Call the AI Safety Check Edge Function
 *
 * Features:
 * - In-flight request deduplication (returns same promise for concurrent calls)
 * - Policy versioning for cache invalidation
 * - Proper cleanup on both success and error
 *
 * @param scanSignals - Style signals for the scanned item
 * @param pairs - Array of match pairs to evaluate
 * @param requestedDryRun - Client's requested dry_run preference (server may override)
 * @returns AI Safety response with verdicts
 * @throws Error on network failure
 */
export async function aiSafetyCheckBatch({
  scanSignals,
  pairs,
  requestedDryRun,
}: {
  scanSignals: StyleSignalsV1;
  pairs: AiSafetyPairInput[];
  requestedDryRun?: boolean;
}): Promise<AiSafetyResponse> {
  // Compute hashes for cache key
  const scanHash = signalsHash(scanSignals);
  const pairHashes = pairs.map((p) => signalsHash(p.matchSignals));
  
  // Compute deduplication key
  const requestKey = computeRequestKey(scanHash, pairHashes, AI_SAFETY_POLICY_VERSION);
  
  // Check for in-flight request with same key
  const existingRequest = inFlightRequests.get(requestKey);
  if (existingRequest) {
    if (__DEV__) {
      console.log('[AI Safety] Reusing in-flight request:', requestKey.slice(0, 20) + '...');
    }
    return existingRequest;
  }
  
  // Build request body with hashed signals
  const body = {
    scan: {
      input_hash: scanHash,
      signals: scanSignals,
    },
    pairs: pairs.map((p) => ({
      itemId: p.itemId,
      match_input_hash: signalsHash(p.matchSignals),
      pairType: p.pairType,
      trust_filter_distance: p.distance,
      match_signals: p.matchSignals,
    })),
    // Pass client's requested dry_run preference (server decides final value)
    dry_run: requestedDryRun,
    // Pass policy version for server-side cache key validation
    policy_version: AI_SAFETY_POLICY_VERSION,
  };

  // Create and track the request promise
  const requestPromise = (async (): Promise<AiSafetyResponse> => {
    try {
      // Call Edge Function
      const { data, error } = await supabase.functions.invoke('ai-safety-check', { body });

      if (error) {
        throw new Error(`AI Safety Check failed: ${error.message}`);
      }

      // Handle non-ok response
      if (!data?.ok) {
        const errorKind = data?.error?.kind ?? 'unknown';
        const errorMessage = data?.error?.message ?? 'Unknown error';
        throw new Error(`AI Safety Check error (${errorKind}): ${errorMessage}`);
      }

      return data as AiSafetyResponse;
    } finally {
      // ALWAYS clean up in-flight map, even on error
      // This ensures subsequent calls don't get stuck waiting on a failed promise
      inFlightRequests.delete(requestKey);
    }
  })();
  
  // Track the in-flight request
  inFlightRequests.set(requestKey, requestPromise);
  
  return requestPromise;
}

// TypeScript declaration for __DEV__
declare const __DEV__: boolean;
