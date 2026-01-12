/**
 * Confidence Engine - Gates Module
 *
 * Two-phase gating system:
 * 1. Hard fails - Force LOW tier (deal breakers)
 * 2. Soft caps - Cap at MEDIUM tier (manageable tensions)
 */

import type {
  ConfidenceItem,
  FeatureSignals,
  PairType,
  HardFailReason,
  CapReason,
  HardFailResult,
  GateResult,
} from './types';

import { hasShoes } from './utils';

// ============================================
// HARD FAIL CHECKS (PHASE 1)
// ============================================

/**
 * Check for formality clash combined with usage mismatch.
 * Example: Athleisure joggers (level 1) + Black-tie blazer (level 5)
 *
 * Canonical trigger: F == -2 AND U <= -1
 * (F == -2 means 4-level formality gap, the most extreme mismatch)
 */
function checkFormalityClashWithUsage(
  signals: FeatureSignals,
  _itemA: ConfidenceItem,
  _itemB: ConfidenceItem
): boolean {
  // Must have extreme formality clash (F == -2)
  if (!signals.F.known || signals.F.value !== -2) {
    return false;
  }

  // Must also have usage conflict (U <= -1)
  if (signals.U.known && signals.U.value <= -1) {
    return true;
  }

  return false;
}

/**
 * Check for style opposition with no overlap.
 * Example: Preppy polo + Punk leather jacket (opposing styles, both statement)
 *
 * Canonical trigger: S == -2 AND U <= -1
 * (Opposing styles that also conflict in usage context)
 */
function checkStyleOppositionNoOverlap(
  signals: FeatureSignals,
  _itemA: ConfidenceItem,
  _itemB: ConfidenceItem
): boolean {
  // Must have opposing styles (S == -2)
  if (!signals.S.known || signals.S.value !== -2) {
    return false;
  }

  // Must also have usage conflict (U <= -1)
  if (signals.U.known && signals.U.value <= -1) {
    return true;
  }

  return false;
}

/**
 * Check for shoes texture/formality clash.
 * Example: Canvas sneakers + Silk formal blouse
 *
 * Canonical trigger: isShoes AND T == -2 AND F <= -1
 */
function checkShoesTextureFormality(
  signals: FeatureSignals,
  itemA: ConfidenceItem,
  itemB: ConfidenceItem
): boolean {
  // Only applies when shoes are involved
  if (!hasShoes(itemA, itemB)) {
    return false;
  }

  // Must have strong texture clash (T == -2)
  if (!signals.T.known || signals.T.value !== -2) {
    return false;
  }

  // Must also have formality tension (F <= -1)
  if (signals.F.known && signals.F.value <= -1) {
    return true;
  }

  return false;
}

/**
 * Phase 1: Check all hard fail conditions.
 * Returns on first match (short-circuit).
 */
export function checkHardFails(
  signals: FeatureSignals,
  itemA: ConfidenceItem,
  itemB: ConfidenceItem,
  _pairType: PairType
): HardFailResult {
  // Check formality clash with usage
  if (checkFormalityClashWithUsage(signals, itemA, itemB)) {
    return {
      failed: true,
      reason: 'FORMALITY_CLASH_WITH_USAGE',
    };
  }

  // Check style opposition
  if (checkStyleOppositionNoOverlap(signals, itemA, itemB)) {
    return {
      failed: true,
      reason: 'STYLE_OPPOSITION_NO_OVERLAP',
    };
  }

  // Check shoes texture/formality clash
  if (checkShoesTextureFormality(signals, itemA, itemB)) {
    return {
      failed: true,
      reason: 'SHOES_TEXTURE_FORMALITY_CLASH',
    };
  }

  return { failed: false, reason: null };
}

// ============================================
// SOFT CAP CHECKS (PHASE 2)
// ============================================

/**
 * Check for formality tension (caps at MEDIUM).
 * Triggers when there's a 2+ level formality gap.
 * 
 * Note: Hard fails (F == -2 with U <= -1) are handled separately
 * in checkFormalityClashWithUsage.
 */
function checkFormalityTension(
  signals: FeatureSignals,
  _itemA: ConfidenceItem,
  _itemB: ConfidenceItem
): boolean {
  // Trigger for 2+ level gap (F <= 0)
  return signals.F.known && signals.F.value <= 0;
}

/**
 * Check for style tension (caps at MEDIUM).
 * Triggers only when style score is -2 (opposing styles).
 * Tension-level pairs (S === -1) no longer cap — only true opposites do.
 * Note: S === -2 combined with U <= -1 is handled by hard fail.
 */
function checkStyleTension(signals: FeatureSignals): boolean {
  return signals.S.known && signals.S.value <= -2;
}

/**
 * Check for color tension (caps at MEDIUM).
 * Triggers when color score is <= -1 (noticeable clash).
 */
function checkColorTension(signals: FeatureSignals): boolean {
  return signals.C.known && signals.C.value <= -1;
}

/**
 * Check for texture clash (caps at MEDIUM).
 * Triggers only when texture score is -2 (strong clash).
 * Note: T === -1 is mild and doesn't cap; T === -2 is excluded from Mode B.
 */
function checkTextureClash(signals: FeatureSignals): boolean {
  return signals.T.known && signals.T.value === -2;
}

/**
 * Check for usage mismatch (caps at MEDIUM).
 * Triggers only when usage score is -2 (strong mismatch).
 */
function checkUsageMismatch(signals: FeatureSignals): boolean {
  return signals.U.known && signals.U.value === -2;
}

/**
 * Check for shoes confidence dampening (caps at MEDIUM).
 * Only triggers when shoes are involved AND there's formality or style tension.
 * Shoes alone don't cap — only shoes + signal tension.
 */
function checkShoesConfidenceDampen(
  signals: FeatureSignals,
  itemA: ConfidenceItem,
  itemB: ConfidenceItem
): boolean {
  // Only applies when shoes are involved
  if (!hasShoes(itemA, itemB)) {
    return false;
  }

  // Shoes dampen only when there's formality or style tension
  const hasFormalityTension = signals.F.known && signals.F.value <= -1;
  const hasStyleTension = signals.S.known && signals.S.value <= -1;

  return hasFormalityTension || hasStyleTension;
}

/**
 * Check for missing key signals (caps at MEDIUM).
 * If critical features are unknown, we can't be confident.
 */
function checkMissingKeySignal(signals: FeatureSignals): boolean {
  // Style and texture are key signals
  const styleMissing = !signals.S.known;
  const textureMissing = !signals.T.known;

  // If both are missing, cap at MEDIUM
  return styleMissing && textureMissing;
}

/**
 * Phase 2: Compute all applicable cap reasons.
 * Returns array of all matching cap reasons (no short-circuit).
 */
export function computeCapReasons(
  signals: FeatureSignals,
  itemA: ConfidenceItem,
  itemB: ConfidenceItem,
  _pairType: PairType
): CapReason[] {
  const reasons: CapReason[] = [];

  if (checkFormalityTension(signals, itemA, itemB)) {
    reasons.push('FORMALITY_TENSION');
  }

  if (checkStyleTension(signals)) {
    reasons.push('STYLE_TENSION');
  }

  if (checkColorTension(signals)) {
    reasons.push('COLOR_TENSION');
  }

  if (checkTextureClash(signals)) {
    reasons.push('TEXTURE_CLASH');
  }

  if (checkUsageMismatch(signals)) {
    reasons.push('USAGE_MISMATCH');
  }

  if (checkShoesConfidenceDampen(signals, itemA, itemB)) {
    reasons.push('SHOES_CONFIDENCE_DAMPEN');
  }

  if (checkMissingKeySignal(signals)) {
    reasons.push('MISSING_KEY_SIGNAL');
  }

  return reasons;
}

// ============================================
// COMBINED GATE EVALUATION
// ============================================

/**
 * Full gate evaluation combining both phases.
 *
 * Phase 1: Hard fails → forced_tier = LOW
 * Phase 2: Soft caps → max_tier = MEDIUM (only if no hard fail)
 */
export function evaluateGates(
  signals: FeatureSignals,
  itemA: ConfidenceItem,
  itemB: ConfidenceItem,
  pairType: PairType
): GateResult {
  // Phase 1: Check hard fails
  const hardFail = checkHardFails(signals, itemA, itemB, pairType);

  if (hardFail.failed) {
    return {
      forced_tier: 'LOW',
      hard_fail_reason: hardFail.reason,
      max_tier: 'MEDIUM', // Irrelevant when forced to LOW
      cap_reasons: [], // No cap reasons when forced to LOW
    };
  }

  // Phase 2: Compute cap reasons
  const capReasons = computeCapReasons(signals, itemA, itemB, pairType);

  // Determine max tier based on cap reasons
  const maxTier = capReasons.length > 0 ? 'MEDIUM' : 'HIGH';

  return {
    forced_tier: null,
    hard_fail_reason: null,
    max_tier: maxTier,
    cap_reasons: capReasons,
  };
}
