/**
 * Confidence Engine - Outfit Evaluation
 *
 * Aggregates pair evaluations into outfit-level results.
 * Determines what UI elements to show based on confidence levels.
 */

import type {
  ConfidenceItem,
  PairEvaluation,
  OutfitEvaluation,
  ConfidenceTier,
  SuggestionsMode,
  EvalContext,
  Category,
} from './types';

import { evaluateAgainstWardrobe } from './pair-evaluation';
import { selectNearMatches } from './suggestions';
import { minTier, compareTiers } from './tiers';
import { OUTFIT_CONFIG } from './config';

// ============================================
// OUTFIT EVALUATION
// ============================================

/**
 * Evaluate an outfit (target item + wardrobe matches).
 *
 * Aggregation rules:
 * 1. Outfit confidence = min tier across all pairs
 * 2. Show matches only for HIGH confidence pairs
 * 3. Select near-matches for Mode B suggestions
 * 4. Determine suggestions mode (A or B)
 * 
 * @param targetItem - The scanned item
 * @param wardrobeItems - Items from user's wardrobe
 * @param ctx - Optional context for telemetry
 */
export function evaluateOutfit(
  targetItem: ConfidenceItem,
  wardrobeItems: ConfidenceItem[],
  ctx?: EvalContext
): OutfitEvaluation {
  // Get all pair evaluations
  const allEvaluations = evaluateAgainstWardrobe(targetItem, wardrobeItems, ctx);

  // DEBUG: Log evaluation details for comparison with useMatchCount
  if (__DEV__) {
    const wardrobeCategories = wardrobeItems.map(item => item.category);
    const categoryCounts = wardrobeCategories.reduce((acc, cat) => {
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log('[evaluateOutfit] DEBUG scanned category:', targetItem.category, 'wardrobe categories:', categoryCounts);
    console.log('[evaluateOutfit] DEBUG wardrobe items count:', wardrobeItems.length, 'evaluations count:', allEvaluations.length);
    
    // Show tier distribution
    const tierCounts = allEvaluations.reduce((acc, e) => {
      acc[e.confidence_tier] = (acc[e.confidence_tier] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log('[evaluateOutfit] DEBUG tier distribution:', tierCounts);

    // DEBUG: Log detailed scores for shoe evaluations
    const shoeEvaluations = allEvaluations.filter(e => e.is_shoes_involved);
    if (shoeEvaluations.length > 0) {
      console.log('[CE Shoes Debug] Shoe evaluations:', shoeEvaluations.length);
      for (const e of shoeEvaluations) {
        const wardrobeItem = wardrobeItems.find(
          w => w.id === e.item_b_id || w.id === e.item_a_id
        );
        const label = wardrobeItem?.label || e.item_b_id.slice(0, 8);
        console.log(
          `[CE Shoes] ${label}: score=${e.raw_score.toFixed(3)} (threshold=${e.high_threshold_used}) → ${e.confidence_tier}`,
          {
            features: {
              C: e.features.C.value.toFixed(2),
              S: e.features.S.value.toFixed(2),
              F: e.features.F.value.toFixed(2),
              T: e.features.T.value.toFixed(2),
              U: e.features.U.value.toFixed(2),
              ...(e.features.V ? { V: e.features.V.value.toFixed(2) } : {}),
            },
            weights: e.weights_used,
            capReasons: e.cap_reasons,
          }
        );
      }
    }

    // DEBUG: Log detailed scores for non-shoe evaluations
    const nonShoeEvaluations = allEvaluations.filter(e => !e.is_shoes_involved);
    if (nonShoeEvaluations.length > 0) {
      console.log('[CE Non-Shoes Debug] Non-shoe evaluations:', nonShoeEvaluations.length);
      for (const e of nonShoeEvaluations) {
        const wardrobeItem = wardrobeItems.find(
          w => w.id === e.item_b_id || w.id === e.item_a_id
        );
        const label = wardrobeItem?.label || e.item_b_id.slice(0, 8);
        console.log(
          `[CE Non-Shoes] ${label}: score=${e.raw_score.toFixed(3)} (threshold=${e.high_threshold_used}) → ${e.confidence_tier}`,
          {
            features: {
              C: e.features.C.value.toFixed(2),
              S: e.features.S.value.toFixed(2),
              F: e.features.F.value.toFixed(2),
              T: e.features.T.value.toFixed(2),
              U: e.features.U.value.toFixed(2),
              ...(e.features.V ? { V: e.features.V.value.toFixed(2) } : {}),
            },
            weights: e.weights_used,
            capReasons: e.cap_reasons,
          }
        );
      }
    }
  }

  // Handle empty wardrobe
  if (allEvaluations.length === 0) {
    return {
      show_matches_section: false,
      outfit_confidence: 'LOW',
      matches: [],
      near_matches: [],
      suggestions_mode: 'A', // Show "what to add" suggestions
      matched_categories: [],
    };
  }

  // Separate by tier
  const highMatches = allEvaluations.filter(
    (e) => e.confidence_tier === 'HIGH'
  );
  const mediumMatches = allEvaluations.filter(
    (e) => e.confidence_tier === 'MEDIUM'
  );
  const lowMatches = allEvaluations.filter(
    (e) => e.confidence_tier === 'LOW'
  );

  // Calculate outfit confidence (min of all)
  const outfitConfidence = calculateOutfitConfidence(allEvaluations);

  // Determine if we should show matches section
  const showMatchesSection = highMatches.length > 0;

  // Sort HIGH matches by raw_score (descending)
  const sortedHighMatches = [...highMatches].sort(
    (a, b) => b.raw_score - a.raw_score
  );

  // Limit to top K matches
  const limitedMatches = sortedHighMatches.slice(
    0,
    OUTFIT_CONFIG.max_matches_shown
  );

  // Select ALL near-matches for UI display (Worth Trying tab, View all sheet)
  // Mode B suggestions will apply their own limit when generating tips
  const nearMatches = selectNearMatches(allEvaluations);

  // Determine suggestions mode (passes full nearMatches for hard tension check)
  const suggestionsMode = determineSuggestionsMode(
    highMatches.length,
    nearMatches,
    wardrobeItems.length,
    ctx
  );

  // Get best match
  const bestMatch = limitedMatches.length > 0 ? limitedMatches[0] : undefined;

  // Extract categories with MEDIUM+ matches for Mode A filtering
  // Only include categories that are ACTUALLY shown (HIGH matches + selected near-matches)
  // NOT all medium matches - weak MEDIUM (score < 0.70) shouldn't filter Mode A bullets
  const matchedCategories = extractMatchedCategories(
    [...highMatches, ...nearMatches],
    wardrobeItems
  );

  return {
    show_matches_section: showMatchesSection,
    outfit_confidence: outfitConfidence,
    best_match: bestMatch,
    matches: limitedMatches,
    near_matches: nearMatches,
    suggestions_mode: suggestionsMode,
    matched_categories: matchedCategories,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Extract unique categories from wardrobe items that have MEDIUM+ matches.
 * Used to filter Mode A suggestions (don't suggest categories user already has matches in).
 */
function extractMatchedCategories(
  evaluations: PairEvaluation[],
  wardrobeItems: ConfidenceItem[]
): Category[] {
  // Build lookup map: id -> category
  const itemCategoryMap = new Map<string, Category>();
  for (const item of wardrobeItems) {
    itemCategoryMap.set(item.id, item.category);
  }

  // Collect unique categories from matched items
  const matchedCategories = new Set<Category>();
  for (const evalItem of evaluations) {
    // The wardrobe item is typically item_b, but could be item_a
    const categoryB = itemCategoryMap.get(evalItem.item_b_id);
    const categoryA = itemCategoryMap.get(evalItem.item_a_id);
    
    if (categoryB) matchedCategories.add(categoryB);
    if (categoryA) matchedCategories.add(categoryA);
  }

  return Array.from(matchedCategories);
}

/**
 * Calculate outfit-level confidence from all pair evaluations.
 *
 * Logic (stable, interpretable rules):
 * - high >= 2 → HIGH
 * - high == 1 and no LOW (not risky) → HIGH
 * - high == 1 and has LOW (risky) → MEDIUM
 * - medium > 0 (no high) → MEDIUM
 * - all LOW → LOW
 */
function calculateOutfitConfidence(
  evaluations: PairEvaluation[]
): ConfidenceTier {
  if (evaluations.length === 0) {
    return 'LOW';
  }

  // Count by tier
  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const evalItem of evaluations) {
    counts[evalItem.confidence_tier]++;
  }

  // 2+ HIGH matches → outfit is HIGH
  if (counts.HIGH >= 2) {
    return 'HIGH';
  }

  // Exactly 1 HIGH match
  if (counts.HIGH === 1) {
    // If there are any LOW matches, it's risky → MEDIUM
    if (counts.LOW > 0) {
      return 'MEDIUM';
    }
    // No LOW matches, single HIGH is enough → HIGH
    return 'HIGH';
  }

  // No HIGH matches
  if (counts.MEDIUM > 0) {
    return 'MEDIUM';
  }

  // All LOW
  return 'LOW';
}

/**
 * Mode B trigger reason for telemetry.
 */
type ModeBTriggerReason = 
  | 'hasCapReasons'
  | null;

/**
 * Determine which suggestions mode to use.
 *
 * Mode A: "What to add" suggestions
 * - Used when wardrobe is empty, no matches found, or HIGH matches (optional/light)
 *
 * Mode B: "Make it work" suggestions
 * - Used when near-matches have cap reasons (something needs adjustment)
 * 
 * @param highMatchCount - Number of HIGH tier matches
 * @param nearMatches - Near matches (already sorted by score)
 * @param wardrobeSize - Size of user's wardrobe
 * @param ctx - Optional context for telemetry
 */
export function determineSuggestionsMode(
  highMatchCount: number,
  nearMatches: PairEvaluation[],
  wardrobeSize: number,
  ctx?: EvalContext
): SuggestionsMode {
  // Mode A: Empty wardrobe
  if (wardrobeSize === 0) {
    logModeDecision('A', null, { reason: 'emptyWardrobe' }, ctx);
    return 'A';
  }

  // Mode A: Have HIGH matches (suggestions are optional/light)
  if (highMatchCount > 0) {
    logModeDecision('A', null, { reason: 'hasHighMatches', highMatchCount }, ctx);
    return 'A';
  }

  // Check for Mode B trigger conditions
  if (nearMatches.length > 0) {
    // Mode B triggers when near-matches have cap reasons
    const hasCapReasons = nearMatches.some(m => m.cap_reasons.length > 0);

    if (hasCapReasons) {
      logModeDecision('B', 'hasCapReasons', {
        nearMatchCount: nearMatches.length,
      }, ctx);
      return 'B';
    }

    // No cap reasons → Mode A
    logModeDecision('A', null, {
      reason: 'noCapReasons',
      nearMatchCount: nearMatches.length,
    }, ctx);
    return 'A';
  }

  // Mode A: No good matches found (fallback to "what to add")
  logModeDecision('A', null, { reason: 'noNearMatches' }, ctx);
  return 'A';
}

/**
 * Log Mode A/B decision for telemetry (dev only).
 * Outputs structured JSON for easy parsing/analysis.
 */
function logModeDecision(
  mode: SuggestionsMode,
  trigger: ModeBTriggerReason,
  details: Record<string, unknown>,
  ctx?: EvalContext
): void {
  if (__DEV__) {
    console.debug('[ModeDecision]', JSON.stringify({
      scan_session_id: ctx?.scan_session_id ?? null,
      mode,
      trigger,
      ...details,
    }));
  }
}

// ============================================
// CATEGORY-GROUPED MATCHES
// ============================================

/**
 * Group matches by wardrobe item category.
 * Useful for displaying matches organized by category.
 */
export function groupMatchesByCategory(
  evaluations: PairEvaluation[],
  wardrobeItems: ConfidenceItem[]
): Map<string, PairEvaluation[]> {
  const grouped = new Map<string, PairEvaluation[]>();

  // Create lookup for wardrobe items
  const itemMap = new Map<string, ConfidenceItem>();
  for (const item of wardrobeItems) {
    itemMap.set(item.id, item);
  }

  for (const evalItem of evaluations) {
    // Determine which item is from wardrobe (item_b is typically wardrobe item)
    const wardrobeItem =
      itemMap.get(evalItem.item_b_id) ?? itemMap.get(evalItem.item_a_id);

    if (wardrobeItem) {
      const category = wardrobeItem.category;
      const existing = grouped.get(category) ?? [];
      existing.push(evalItem);
      grouped.set(category, existing);
    }
  }

  // Sort each category by raw_score
  for (const [category, evals] of grouped) {
    evals.sort((a, b) => b.raw_score - a.raw_score);
    grouped.set(category, evals);
  }

  return grouped;
}

/**
 * Get the best match per category.
 * Returns at most one match per wardrobe category.
 */
export function getBestMatchPerCategory(
  evaluations: PairEvaluation[],
  wardrobeItems: ConfidenceItem[]
): PairEvaluation[] {
  const grouped = groupMatchesByCategory(evaluations, wardrobeItems);
  const best: PairEvaluation[] = [];

  for (const [_category, evals] of grouped) {
    if (evals.length > 0) {
      best.push(evals[0]);
    }
  }

  // Sort overall by raw_score
  best.sort((a, b) => b.raw_score - a.raw_score);

  return best;
}
