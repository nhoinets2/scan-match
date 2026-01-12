/**
 * Confidence Engine - Pair Evaluation
 *
 * Evaluates a single pair of items and produces a complete PairEvaluation.
 * This is the core function that combines all modules.
 */

import type {
  ConfidenceItem,
  PairType,
  PairEvaluation,
  FeatureCode,
  EvalContext,
} from './types';

import { getPairType, hasShoes } from './utils';
import { computeFeatureSignals } from './signals';
import { computeRawScore } from './scoring';
import { evaluateGates } from './gates';
import { mapScoreToTier, getHighThresholdUsed } from './tiers';

// ============================================
// PAIR EVALUATION
// ============================================

/**
 * Evaluate a single pair of items.
 *
 * This is the main entry point for pair evaluation.
 * It combines all modules to produce a complete PairEvaluation.
 * 
 * @param itemA - First item
 * @param itemB - Second item
 * @param ctx - Optional context for telemetry (scan_session_id, etc.)
 */
export function evaluatePair(
  itemA: ConfidenceItem,
  itemB: ConfidenceItem,
  ctx?: EvalContext
): PairEvaluation | null {
  // Determine pair type
  const pairType = getPairType(itemA.category, itemB.category);

  if (!pairType) {
    // Invalid pair (e.g., same category or unsupported combination)
    return null;
  }

  // Check if shoes are involved
  const isShoes = hasShoes(itemA, itemB);

  // Step 1: Compute feature signals
  const features = computeFeatureSignals(itemA, itemB, pairType);

  // Step 2: Compute raw score
  const { rawScore, weightsUsed } = computeRawScore(features, pairType);

  // Step 3: Evaluate gates
  const gateResult = evaluateGates(features, itemA, itemB, pairType);

  // Step 4: Map to confidence tier
  const confidenceTier = mapScoreToTier(rawScore, gateResult, isShoes);

  // Step 5: Determine if both items are "statement" pieces
  // (High saturation colors or strong style families)
  const bothStatement = checkBothStatement(itemA, itemB);

  // Step 6: Explanation eligibility (placeholder - detailed in explanations module)
  const explanationAllowed = false; // Will be set by explanations module
  const explanationForbiddenReason = null;
  const explanationTemplateId = null;
  const explanationSpecificityLevel = null;

  // Build the evaluation result
  const evaluation: PairEvaluation = {
    // Identity
    item_a_id: itemA.id,
    item_b_id: itemB.id,
    pair_type: pairType,

    // Scores
    raw_score: rawScore,
    confidence_tier: confidenceTier,

    // Gating results
    forced_tier: gateResult.forced_tier,
    hard_fail_reason: gateResult.hard_fail_reason,
    cap_reasons: gateResult.cap_reasons,

    // Features
    features: features,

    // Explanation eligibility (placeholders)
    explanation_allowed: explanationAllowed,
    explanation_forbidden_reason: explanationForbiddenReason,
    explanation_template_id: explanationTemplateId,
    explanation_specificity_level: explanationSpecificityLevel,

    // Statement detection
    both_statement: bothStatement,

    // Metadata
    is_shoes_involved: isShoes,
    high_threshold_used: getHighThresholdUsed(isShoes),
    weights_used: weightsUsed as Record<FeatureCode, number>,
  };

  return evaluation;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if both items are "statement" pieces.
 * Statement pieces are items that demand attention.
 *
 * Criteria:
 * - High saturation color
 * - Strong style family (edgy, romantic, street)
 * - High formality (4-5)
 */
function checkBothStatement(
  itemA: ConfidenceItem,
  itemB: ConfidenceItem
): boolean {
  const isStatementA = isStatementPiece(itemA);
  const isStatementB = isStatementPiece(itemB);

  return isStatementA && isStatementB;
}

/**
 * Check if a single item is a statement piece.
 */
function isStatementPiece(item: ConfidenceItem): boolean {
  // High saturation color
  if (!item.color_profile.is_neutral && item.color_profile.saturation === 'high') {
    return true;
  }

  // Strong style families
  const strongFamilies = ['edgy', 'romantic', 'street', 'boho'];
  if (strongFamilies.includes(item.style_family)) {
    return true;
  }

  // High formality
  if (item.formality_level >= 4) {
    return true;
  }

  return false;
}

// ============================================
// BATCH EVALUATION
// ============================================

/**
 * Evaluate all pairs from a list of items.
 * Returns evaluations for all valid pairs.
 */
export function evaluateAllPairs(
  items: ConfidenceItem[]
): PairEvaluation[] {
  const evaluations: PairEvaluation[] = [];

  // Generate all unique pairs
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const evaluation = evaluatePair(items[i], items[j]);
      if (evaluation) {
        evaluations.push(evaluation);
      }
    }
  }

  return evaluations;
}

/**
 * Evaluate pairs between a target item and a list of wardrobe items.
 * 
 * @param targetItem - The scanned item
 * @param wardrobeItems - Items from user's wardrobe
 * @param ctx - Optional context for telemetry
 */
export function evaluateAgainstWardrobe(
  targetItem: ConfidenceItem,
  wardrobeItems: ConfidenceItem[],
  ctx?: EvalContext
): PairEvaluation[] {
  const evaluations: PairEvaluation[] = [];

  for (const wardrobeItem of wardrobeItems) {
    // Skip same item
    if (wardrobeItem.id === targetItem.id) {
      continue;
    }

    const evaluation = evaluatePair(targetItem, wardrobeItem, ctx);
    if (evaluation) {
      evaluations.push(evaluation);
    }
  }

  return evaluations;
}
