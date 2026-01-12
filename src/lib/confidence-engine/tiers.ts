/**
 * Confidence Engine - Tier Mapping Module
 *
 * Maps raw scores to confidence tiers using thresholds and gates.
 */

import type {
  ConfidenceTier,
  GateResult,
} from './types';

import { THRESHOLDS } from './config';

// ============================================
// TIER DETERMINATION
// ============================================

/**
 * Map raw score to confidence tier.
 *
 * Tier Determination Flow (unambiguous):
 * 1. If hard fail → tier = LOW (forced)
 * 2. maxTier is pre-computed: cap_reasons.length > 0 ? MEDIUM : HIGH
 * 3. Apply thresholds:
 *    - if raw_score >= HIGH_THRESHOLD AND maxTier === HIGH → HIGH
 *    - else if raw_score >= MEDIUM_THRESHOLD → MEDIUM
 *    - else → LOW
 *
 * IMPORTANT: Explanation eligibility uses the FINAL tier, never the pre-cap tier.
 * If a pair is capped from HIGH to MEDIUM, explanation_allowed should be false.
 *
 * Thresholds:
 * - HIGH: >= 0.78 (or 0.82 for shoes)
 * - MEDIUM: >= 0.58
 * - LOW: < 0.58
 */
export function mapScoreToTier(
  rawScore: number,
  gateResult: GateResult,
  isShoes: boolean
): ConfidenceTier {
  // Phase 1: Check for forced tier (hard fail)
  if (gateResult.forced_tier) {
    return gateResult.forced_tier;
  }

  // Determine which HIGH threshold to use
  const highThreshold = isShoes ? THRESHOLDS.HIGH_SHOES : THRESHOLDS.HIGH;

  // Apply thresholds to get base tier
  let baseTier: ConfidenceTier;

  if (rawScore >= highThreshold) {
    baseTier = 'HIGH';
  } else if (rawScore >= THRESHOLDS.MEDIUM) {
    baseTier = 'MEDIUM';
  } else {
    baseTier = 'LOW';
  }

  // Phase 2: Apply max_tier cap
  if (gateResult.max_tier === 'MEDIUM' && baseTier === 'HIGH') {
    return 'MEDIUM';
  }

  return baseTier;
}

// ============================================
// TIER UTILITIES
// ============================================

/**
 * Get the numeric value of a tier for comparison.
 */
export function tierToNumber(tier: ConfidenceTier): number {
  switch (tier) {
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    case 'LOW':
      return 1;
  }
}

/**
 * Compare two tiers.
 * Returns positive if a > b, negative if a < b, 0 if equal.
 */
export function compareTiers(a: ConfidenceTier, b: ConfidenceTier): number {
  return tierToNumber(a) - tierToNumber(b);
}

/**
 * Get the minimum of two tiers.
 */
export function minTier(a: ConfidenceTier, b: ConfidenceTier): ConfidenceTier {
  return compareTiers(a, b) <= 0 ? a : b;
}

/**
 * Get the maximum of two tiers.
 */
export function maxTier(a: ConfidenceTier, b: ConfidenceTier): ConfidenceTier {
  return compareTiers(a, b) >= 0 ? a : b;
}

/**
 * Check if a tier meets minimum requirement.
 */
export function meetsMinimum(
  tier: ConfidenceTier,
  minimum: ConfidenceTier
): boolean {
  return compareTiers(tier, minimum) >= 0;
}

// ============================================
// NEAR-MATCH DETECTION
// ============================================

/**
 * Check if this is a "near-match" for Mode B suggestions.
 *
 * Near-match types:
 * - Type 2a: Soft-capped from HIGH (preferred)
 *   - raw_score >= HIGH threshold
 *   - tier === MEDIUM (due to cap)
 *
 * - Type 2b: Strong MEDIUM (fallback)
 *   - raw_score >= NEAR_MATCH_STRONG_MEDIUM_MIN (0.70)
 *   - tier === MEDIUM
 */
export function isNearMatch(
  rawScore: number,
  tier: ConfidenceTier,
  gateResult: GateResult,
  isShoes: boolean
): { isNear: boolean; type: '2a' | '2b' | null } {
  // Must be MEDIUM tier
  if (tier !== 'MEDIUM') {
    return { isNear: false, type: null };
  }

  // Must not be forced LOW (hard fail)
  if (gateResult.forced_tier === 'LOW') {
    return { isNear: false, type: null };
  }

  const highThreshold = isShoes ? THRESHOLDS.HIGH_SHOES : THRESHOLDS.HIGH;

  // Type 2a: Would have been HIGH without cap
  if (rawScore >= highThreshold && gateResult.cap_reasons.length > 0) {
    return { isNear: true, type: '2a' };
  }

  // Type 2b: Strong MEDIUM
  if (rawScore >= THRESHOLDS.NEAR_MATCH_STRONG_MEDIUM_MIN) {
    return { isNear: true, type: '2b' };
  }

  return { isNear: false, type: null };
}

/**
 * Get the threshold that was used for this evaluation.
 */
export function getHighThresholdUsed(isShoes: boolean): 0.78 | 0.82 {
  return isShoes ? 0.82 : 0.78;
}

// ============================================
// SIMPLE TIER MAPPING (for testing)
// ============================================

/**
 * Simple score-to-tier mapping without gate complexity.
 * Useful for contract testing penalty effects.
 * 
 * @param score - The (potentially penalized) score in [0, 1]
 * @param isShoes - Whether shoes are involved (affects HIGH threshold)
 */
export function scoreToTier(score: number, isShoes: boolean = false): ConfidenceTier {
  const highThreshold = isShoes ? THRESHOLDS.HIGH_SHOES : THRESHOLDS.HIGH;
  
  if (score >= highThreshold) {
    return 'HIGH';
  } else if (score >= THRESHOLDS.MEDIUM) {
    return 'MEDIUM';
  } else {
    return 'LOW';
  }
}
