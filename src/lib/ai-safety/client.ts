/**
 * AI Safety - Client
 *
 * Client wrapper for the /ai-safety-check Edge Function.
 * Handles request formatting, error handling, and response parsing.
 */

import { supabase } from '../supabase';
import { signalsHash } from './signalsHash';
import type { StyleSignalsV1, ArchetypeDistance, TFCategory } from '../trust-filter/types';

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
  dry_run: boolean;
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
 * @param scanSignals - Style signals for the scanned item
 * @param pairs - Array of match pairs to evaluate
 * @returns AI Safety response with verdicts
 * @throws Error on network failure
 */
export async function aiSafetyCheckBatch({
  scanSignals,
  pairs,
}: {
  scanSignals: StyleSignalsV1;
  pairs: AiSafetyPairInput[];
}): Promise<AiSafetyResponse> {
  // Build request body with hashed signals
  const body = {
    scan: {
      input_hash: signalsHash(scanSignals),
      signals: scanSignals,
    },
    pairs: pairs.map((p) => ({
      itemId: p.itemId,
      match_input_hash: signalsHash(p.matchSignals),
      pairType: p.pairType,
      trust_filter_distance: p.distance,
      match_signals: p.matchSignals,
    })),
  };

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
}
