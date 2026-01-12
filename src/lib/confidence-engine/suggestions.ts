/**
 * Confidence Engine - Suggestions
 *
 * Generates styling guidance for outfit matching:
 * - Mode A: "What to Add" suggestions for missing pieces
 * - Mode B: "Make it Work" styling tips for near-matches
 */

import type {
  CapReason,
  PairEvaluation,
  ModeBSuggestion,
  ModeBBulletResolved,
  ModeASuggestion,
  Category,
  SuggestionBullet,
} from './types';
import type { StyleVibe } from '../types';

import {
  SAFE_GENERIC_BULLET,
  REASON_PRIORITY,
  MODE_B_CONFIG,
  FEATURE_FLAGS,
  MODE_A_TEMPLATES_V2,
  MODE_B_COPY_BY_REASON,
  CAP_REASON_STABLE_ORDER,
  SAFE_GENERIC_BULLET_TEXT,
  THRESHOLDS,
  type EnhancedSuggestionBullet,
  type ModeBBullet,
} from './config';

// ============================================
// MODE B HELPERS
// ============================================

/**
 * Check if Mode B suggestions should be shown.
 *
 * Shows when:
 * - Feature flag allows it (mode_b_strong_medium_fallback)
 * - There are cap reasons to address
 * - Not a hard fail (those get no suggestions)
 */
export function shouldShowModeB(
  capReasons: CapReason[],
  isHardFail: boolean
): boolean {
  if (!FEATURE_FLAGS.mode_b_strong_medium_fallback) {
    return false;
  }

  if (isHardFail) {
    return false;
  }

  // Filter out excluded reasons
  const validReasons = capReasons.filter(
    (reason) => !MODE_B_CONFIG.excluded_reasons.includes(reason)
  );

  return validReasons.length > 0;
}

// ============================================
// NEAR-MATCH SELECTION
// ============================================

/**
 * Select near-matches from pair evaluations.
 * Near-matches are used for Mode B suggestion generation.
 *
 * Selection criteria:
 * 1. Type 2a (soft-capped HIGH) preferred
 * 2. Type 2b (strong MEDIUM) as fallback
 * 3. Limit to top N by raw_score
 */
export function selectNearMatches(
  evaluations: PairEvaluation[],
  limit: number = 5
): PairEvaluation[] {
  // Filter to only MEDIUM tier evaluations
  const mediumTier = evaluations.filter(
    (evalItem) => evalItem.confidence_tier === 'MEDIUM'
  );

  // Separate into type 2a and 2b
  const type2a: PairEvaluation[] = [];
  const type2b: PairEvaluation[] = [];

  for (const evalItem of mediumTier) {
    // Type 2a: Would have been HIGH without cap
    const highThreshold = evalItem.high_threshold_used;
    if (
      evalItem.raw_score >= highThreshold &&
      evalItem.cap_reasons.length > 0
    ) {
      type2a.push(evalItem);
    } else if (evalItem.raw_score >= 0.7) {
      // Type 2b: Strong MEDIUM
      type2b.push(evalItem);
    }
  }

  // Sort each by raw_score (descending)
  type2a.sort((a, b) => b.raw_score - a.raw_score);
  type2b.sort((a, b) => b.raw_score - a.raw_score);

  // Prefer 2a, then fill with 2b
  const nearMatches: PairEvaluation[] = [];

  for (const evalItem of type2a) {
    if (nearMatches.length >= limit) break;
    nearMatches.push(evalItem);
  }

  for (const evalItem of type2b) {
    if (nearMatches.length >= limit) break;
    nearMatches.push(evalItem);
  }

  return nearMatches;
}

// ============================================
// AGGREGATE CAP REASONS FROM NEAR-MATCHES
// ============================================

/**
 * Aggregate cap reasons from multiple near-matches.
 * Used to generate outfit-level Mode B suggestions.
 */
export function aggregateCapReasons(
  nearMatches: PairEvaluation[]
): CapReason[] {
  const reasonCounts = new Map<CapReason, number>();

  for (const evalItem of nearMatches) {
    for (const reason of evalItem.cap_reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }

  // Sort by count (descending), then by priority
  const sortedReasons = Array.from(reasonCounts.entries()).sort((a, b) => {
    // First by count
    if (b[1] !== a[1]) return b[1] - a[1];
    // Then by priority
    return REASON_PRIORITY[b[0]] - REASON_PRIORITY[a[0]];
  });

  return sortedReasons.map(([reason]) => reason);
}

// ============================================
// STYLE-AWARE SUGGESTIONS (V2)
// ============================================

/**
 * Resolve text for an enhanced bullet based on vibe.
 * Falls back to default text if no style override exists.
 */
function resolveEnhancedBulletText(
  bullet: EnhancedSuggestionBullet,
  vibe: StyleVibe
): string {
  return bullet.textByStyle?.[vibe] ?? bullet.text;
}

/**
 * Resolve text for a Mode B bullet based on vibe.
 * Falls back to default text if no style override exists.
 */
function resolveModeBBulletText(bullet: ModeBBullet, vibe: StyleVibe): string {
  return bullet.textByStyle?.[vibe] ?? bullet.text;
}

/**
 * Generate style-aware Mode A suggestions using V2 templates.
 * Returns structured bullets with resolved text for the given vibe.
 */
export function generateModeASuggestionsV2(
  category: Category,
  vibe: StyleVibe
): ModeASuggestion {
  const template = MODE_A_TEMPLATES_V2[category] ?? MODE_A_TEMPLATES_V2.default;

  const resolvedBullets: SuggestionBullet[] = template.bullets.map((bullet) => ({
    key: bullet.key,
    text: resolveEnhancedBulletText(bullet, vibe),
    target: bullet.target,
  }));

  return {
    intro: template.intro,
    bullets: resolvedBullets,
  };
}

/**
 * Build Mode B bullets deterministically from cap reasons.
 *
 * Algorithm:
 * 1. Filter out excluded reasons (TEXTURE_CLASH)
 * 2. Sort by priority (REASON_PRIORITY), then by stable order (CAP_REASON_STABLE_ORDER) for ties
 * 3. Take top N reasons (max_bullets)
 * 4. For each reason, select first bullet from its template (deterministic)
 * 5. Resolve text based on vibe
 * 6. Track which reasons actually contributed bullets
 * 7. If empty, add generic fallback bullet
 */
export function buildModeBBullets(
  capReasons: CapReason[],
  vibe: StyleVibe
): { bullets: ModeBBulletResolved[]; reasonsUsed: CapReason[] } {
  // Normalize excluded_reasons to Set for consistent lookup
  const excludedSet = new Set(MODE_B_CONFIG.excluded_reasons);

  // Filter out excluded reasons
  const validReasons = capReasons.filter((reason) => !excludedSet.has(reason));

  // Sort by priority (descending), then by stable order for ties
  const sortedReasons = [...validReasons].sort((a, b) => {
    const priorityDiff = REASON_PRIORITY[b] - REASON_PRIORITY[a];
    if (priorityDiff !== 0) return priorityDiff;

    // Stable order tie-breaker
    const indexA = CAP_REASON_STABLE_ORDER.indexOf(a);
    const indexB = CAP_REASON_STABLE_ORDER.indexOf(b);
    // Unknown reasons (indexOf === -1) sort to end
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  // Take top reasons (up to max_bullets)
  const topReasons = sortedReasons.slice(0, MODE_B_CONFIG.max_bullets);

  // Generate bullets deterministically
  const bullets: ModeBBulletResolved[] = [];
  const reasonsUsed: CapReason[] = [];

  for (const reason of topReasons) {
    const reasonBullets = MODE_B_COPY_BY_REASON[reason];

    // Only add if template has bullets
    if (reasonBullets && reasonBullets.length > 0) {
      // Deterministic: always pick first bullet
      const bullet = reasonBullets[0];
      const text = resolveModeBBulletText(bullet, vibe);
      bullets.push({ key: bullet.key, text });
      reasonsUsed.push(reason);
    }
    // Skip reasons with empty templates (like TEXTURE_CLASH)
  }

  // Ensure minimum bullets with fallback
  // Add generic fallback ONLY if:
  // - We need more bullets (bullets.length < min_bullets), AND
  // - We haven't used MISSING_KEY_SIGNAL (avoid double generic), AND  
  // - We don't have real cap reasons (avoid mixing generic with specific advice)
  const usedGenericReason = reasonsUsed.includes('MISSING_KEY_SIGNAL');
  const hasRealCapReasons = reasonsUsed.length > 0 && !usedGenericReason;
  
  if (bullets.length < MODE_B_CONFIG.min_bullets && !usedGenericReason && !hasRealCapReasons) {
    bullets.push({ key: 'DEFAULT__GENERIC_FALLBACK', text: SAFE_GENERIC_BULLET_TEXT });
  }

  return { bullets, reasonsUsed };
}

/**
 * Generate style-aware Mode B suggestions.
 * Uses deterministic bullet selection and style-aware text resolution.
 */
export function generateModeBSuggestionsV2(
  capReasons: CapReason[],
  vibe: StyleVibe
): ModeBSuggestion {
  const { bullets, reasonsUsed } = buildModeBBullets(capReasons, vibe);

  return {
    bullets,
    reasons_used: reasonsUsed,
  };
}

/**
 * Check if a near match is Type 2b (strong MEDIUM with no cap reasons).
 * Type 2b: rawScore in [0.70, HIGH_THRESHOLD) AND cap_reasons is empty.
 *
 * Uses the item's specific HIGH threshold (which may differ for shoes).
 */
function isType2bMatch(evalItem: PairEvaluation): boolean {
  const caps = evalItem.cap_reasons ?? [];
  const highThreshold = evalItem.high_threshold_used ?? THRESHOLDS.HIGH;

  return (
    evalItem.raw_score >= THRESHOLDS.NEAR_MATCH_STRONG_MEDIUM_MIN &&
    evalItem.raw_score < highThreshold &&
    caps.length === 0
  );
}

/**
 * Generate outfit-level style-aware Mode B suggestions from near-matches.
 *
 * IMPORTANT: Handles the "Type 2b no-cap" edge case where a near match has
 * a strong MEDIUM score (0.70-0.78) but no specific cap reasons.
 * In this case, we show a generic fallback bullet.
 *
 * @param nearMatches - Near matches to generate suggestions from
 * @param vibe - Style vibe for copy generation
 * @param context - Optional context for debugging ('selected_outfit' | 'aggregate')
 */
export function generateOutfitModeBSuggestionsV2(
  nearMatches: PairEvaluation[],
  vibe: StyleVibe,
  context?: 'selected_outfit' | 'aggregate'
): ModeBSuggestion | null {
  if (nearMatches.length === 0) {
    return null;
  }

  const aggregatedReasons = aggregateCapReasons(nearMatches);

  if (aggregatedReasons.length === 0) {
    // Check if ANY near match is Type 2b (score 0.70-0.78, no cap reasons)
    const hasType2b = nearMatches.some(isType2bMatch);

    if (hasType2b) {
      // Type 2b with no cap reasons: score is naturally MEDIUM
      // without any specific styling issue. Fall back to generic advice.
      if (__DEV__) {
        const bestMatch = nearMatches.reduce((a, b) =>
          a.raw_score > b.raw_score ? a : b
        );
        console.debug('[ModeB] Type2b no cap reasons → generic bullet', {
          context: context ?? 'unknown',
          pairType: bestMatch.pair_type,
          scoreBand: `${THRESHOLDS.NEAR_MATCH_STRONG_MEDIUM_MIN}-${bestMatch.high_threshold_used ?? THRESHOLDS.HIGH}`,
          nearMatches: nearMatches.length,
          bestScore: Number(bestMatch.raw_score.toFixed(3)),
        });
      }
      return generateModeBSuggestionsV2(['MISSING_KEY_SIGNAL'], vibe);
    }

    // Not Type 2b and no cap reasons → unexpected state, return null
    if (__DEV__) {
      console.warn(
        '[ModeB] Near matches with no cap reasons and not Type2b - unexpected state',
        { context: context ?? 'unknown', nearMatches: nearMatches.length }
      );
    }
    return null;
  }

  return generateModeBSuggestionsV2(aggregatedReasons, vibe);
}

// ============================================
// SELECTED OUTFIT MODE B HELPER
// ============================================

/**
 * SlotCandidate shape (from AssembledCombo.candidates)
 * We inline this type here to avoid circular dependencies with combo-assembler.
 */
interface SlotCandidateShape {
  itemId: string;
  tier: 'HIGH' | 'MEDIUM' | 'LOW';
  evaluation: PairEvaluation;
}

/**
 * Generate Mode B suggestions with support for selected outfit precision.
 *
 * When a NEAR outfit is selected:
 * - Extracts MEDIUM candidates from the outfit
 * - Uses only those items' cap reasons for bullet generation
 *
 * When no outfit is selected:
 * - Falls back to aggregate across all nearMatches
 *
 * This keeps Mode B bullets relevant to what the user is looking at.
 *
 * @param selectedOutfitCandidates - Candidates from a selected outfit (null = aggregate mode)
 * @param nearMatches - All NEAR matches (fallback when no selection)
 * @param vibe - Style vibe for copy generation
 */
export function getModeBBullets(
  selectedOutfitCandidates: SlotCandidateShape[] | null,
  nearMatches: PairEvaluation[],
  vibe: StyleVibe
): ModeBSuggestion | null {
  // Determine context for debugging
  const context: 'selected_outfit' | 'aggregate' = 
    selectedOutfitCandidates && selectedOutfitCandidates.length > 0 
      ? 'selected_outfit' 
      : 'aggregate';

  // If outfit is selected, extract MEDIUM candidates and use their evals
  if (selectedOutfitCandidates && selectedOutfitCandidates.length > 0) {
    const mediumEvals = selectedOutfitCandidates
      .filter((candidate) => candidate.tier === 'MEDIUM')
      .map((candidate) => candidate.evaluation);

    if (mediumEvals.length === 0) {
      // Selected outfit has no MEDIUM candidates - shouldn't happen for NEAR outfits
      // but fall back to aggregate as safety
      if (__DEV__) {
        console.warn('[getModeBBullets] Selected outfit has no MEDIUM candidates, falling back to aggregate');
      }
      return generateOutfitModeBSuggestionsV2(nearMatches, vibe, 'aggregate');
    }

    // Use only the MEDIUM evals from the selected outfit
    return generateOutfitModeBSuggestionsV2(mediumEvals, vibe, context);
  }

  // No selection: aggregate across all nearMatches
  return generateOutfitModeBSuggestionsV2(nearMatches, vibe, context);
}
