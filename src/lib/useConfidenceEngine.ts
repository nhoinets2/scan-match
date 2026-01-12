/**
 * Confidence Engine Hook
 *
 * React hook for evaluating outfits using the confidence engine.
 * Provides a clean interface for the results screen.
 */

import { useMemo } from 'react';
import type { WardrobeItem, ScannedItem, StyleVibe } from './types';
import type { ClothingAnalysisResult } from './openai';
import {
  evaluateOutfit,
  enrichWithExplanation,
  generateModeASuggestionsV2,
  generateOutfitModeBSuggestionsV2,
  wardrobeItemToConfidenceItem,
  scannedItemToConfidenceItem,
  scannedItemWithSignalsToConfidenceItem,
  getCoveredCategories,
  resolveUiVibeForCopy,
  type OutfitEvaluation,
  type PairEvaluation,
  type ConfidenceItem,
  type ConfidenceTier,
  type Category,
  type SuggestionBullet,
  type ModeBBulletResolved,
} from './confidence-engine';

// ============================================
// RESULT TYPES
// ============================================

export interface ConfidenceEngineResult {
  /** Whether the confidence engine was able to evaluate */
  evaluated: boolean;

  /**
   * Debug-only tier derived from outfit evaluation.
   * DO NOT use for UI state decisions - use highMatchCount/nearMatchCount instead.
   * This is kept for logging, debugging, and backwards compatibility.
   */
  debugTier: ConfidenceTier;

  /** Whether to show the matches section */
  showMatchesSection: boolean;

  /** HIGH confidence matches with explanations */
  matches: EnrichedMatch[];

  /** Count of HIGH confidence matches */
  highMatchCount: number;

  /** Count of near-matches (MEDIUM tier, for Mode B suggestions) */
  nearMatchCount: number;

  /** Best match (if any) */
  bestMatch: EnrichedMatch | null;

  /** Suggestions mode: A = missing pieces, B = styling tips */
  suggestionsMode: 'A' | 'B';

  /** Mode A suggestions (what to add) - structured bullets with target categories, filtered by covered categories */
  modeASuggestions: {
    intro: string;
    bullets: SuggestionBullet[];
  } | null;

  /** Mode B suggestions (styling tips) */
  modeBSuggestions: {
    intro: string;
    bullets: ModeBBulletResolved[];
  } | null;

  /** Computed style vibe used for copy generation (style-aware suggestions) */
  uiVibeForCopy: StyleVibe;

  /** Raw evaluation for debugging */
  rawEvaluation: OutfitEvaluation | null;
}

export interface EnrichedMatch {
  /** The pair evaluation */
  evaluation: PairEvaluation;

  /** The matched wardrobe item */
  wardrobeItem: WardrobeItem;

  /** Explanation text (if allowed) */
  explanation: string | null;

  /** Whether explanation is allowed */
  explanationAllowed: boolean;
}

// ============================================
// MAIN HOOK
// ============================================

/**
 * Evaluate a scanned item against wardrobe using confidence engine
 */
export function useConfidenceEngine(
  scannedItem: ScannedItem | null,
  wardrobeItems: WardrobeItem[],
  analysisResult?: ClothingAnalysisResult
): ConfidenceEngineResult {
  return useMemo(() => {
    // No scanned item = no evaluation
    if (!scannedItem) {
      return getEmptyResult();
    }

    // Handle unknown/null category - return empty result with Mode A from 'default'
    // The category should always exist in practice, but we handle this edge case
    if (!scannedItem.category) {
      if (__DEV__) {
        console.warn('[ConfidenceEngine] scannedItem.category is null/undefined');
      }
      // Compute vibe for style-aware copy
      const uiVibeForCopy = resolveUiVibeForCopy({
        styleTags: scannedItem.styleTags,
        styleNotes: scannedItem.styleNotes,
      });
      // Still generate Mode A suggestions from default template
      const defaultModeA = generateModeASuggestionsV2('default' as Category, uiVibeForCopy);
      return {
        ...getEmptyResult(),
        uiVibeForCopy,
        modeASuggestions: defaultModeA,
      };
    }

    try {
      // Convert scanned item to ConfidenceItem
      let targetItem: ConfidenceItem;

      if (analysisResult?.confidenceSignals) {
        // Use explicit signals from AI analysis
        targetItem = scannedItemWithSignalsToConfidenceItem(
          scannedItem,
          analysisResult.confidenceSignals
        );
      } else {
        // Infer signals from existing data
        targetItem = scannedItemToConfidenceItem(scannedItem);
      }

      // Convert wardrobe items
      const wardrobeConfidenceItems = wardrobeItems.map(wardrobeItemToConfidenceItem);

      // Create lookup map for wardrobe items
      const wardrobeMap = new Map<string, WardrobeItem>();
      for (const item of wardrobeItems) {
        wardrobeMap.set(item.id, item);
      }

      // Evaluate outfit
      const evaluation = evaluateOutfit(targetItem, wardrobeConfidenceItems);

      // Enrich matches with explanations
      const enrichedMatches: EnrichedMatch[] = evaluation.matches.map(match => {
        // Find the wardrobe item (it could be item_a or item_b)
        const wardrobeItem = wardrobeMap.get(match.item_b_id) ??
                            wardrobeMap.get(match.item_a_id);

        if (!wardrobeItem) {
          // This shouldn't happen, but handle gracefully
          return {
            evaluation: match,
            wardrobeItem: wardrobeItems[0], // Fallback
            explanation: null,
            explanationAllowed: false,
          };
        }

        // Find the corresponding ConfidenceItem for enrichment
        const wardrobeConfItem = wardrobeConfidenceItems.find(
          ci => ci.id === wardrobeItem.id
        );

        if (wardrobeConfItem) {
          const enriched = enrichWithExplanation(match, targetItem, wardrobeConfItem);

          return {
            evaluation: enriched,
            wardrobeItem,
            explanation: enriched.explanation_allowed
              ? getExplanationForMatch(enriched, targetItem, wardrobeConfItem)
              : null,
            explanationAllowed: enriched.explanation_allowed,
          };
        }

        return {
          evaluation: match,
          wardrobeItem,
          explanation: null,
          explanationAllowed: false,
        };
      });

      // Get counts for UI state detection
      const highMatchCount = enrichedMatches.length;
      const nearMatchCount = evaluation.near_matches.length;

      // Dev assertions for invariants
      if (__DEV__) {
        // highMatchCount should match matches array length
        console.assert(
          highMatchCount === enrichedMatches.length,
          '[ConfidenceEngine] highMatchCount !== enrichedMatches.length'
        );
        // nearMatchCount should match near_matches array length
        console.assert(
          nearMatchCount === evaluation.near_matches.length,
          '[ConfidenceEngine] nearMatchCount !== near_matches.length'
        );
      }

      // Compute vibe for style-aware copy generation
      const uiVibeForCopy = resolveUiVibeForCopy({
        styleTags: scannedItem.styleTags,
        styleNotes: scannedItem.styleNotes,
      });

      // Generate suggestions based on mode
      let modeASuggestions: { intro: string; bullets: SuggestionBullet[] } | null = null;
      let modeBSuggestions: { intro: string; bullets: ModeBBulletResolved[] } | null = null;

      if (evaluation.suggestions_mode === 'A') {
        const rawModeA = generateModeASuggestionsV2(scannedItem.category as Category, uiVibeForCopy);

        /**
         * Mode A Filtering Policy:
         * - ONLY filter by covered categories in HIGH state (highMatchCount > 0)
         * - In MEDIUM or LOW states, show ALL Mode A bullets (no filtering)
         *
         * Rationale: When user has HIGH matches, we filter out suggestions
         * for categories they already have covered. In MEDIUM/LOW, they need
         * foundational guidance regardless of near-matches.
         */
        if (highMatchCount > 0) {
          const coveredCategories = getCoveredCategories(
            evaluation.matches.map(m => ({ pair_type: m.pair_type })),
            scannedItem.category
          );

          // Remove bullets whose target category is already covered by a HIGH match
          // Note: bullets with target === null are NEVER filtered (they're generic/not category-specific)
          const filteredBullets = rawModeA.bullets.filter(
            (bullet: SuggestionBullet) => !bullet.target || !coveredCategories.has(bullet.target)
          );

          // Only set suggestions if we have bullets remaining
          if (filteredBullets.length > 0) {
            modeASuggestions = {
              intro: rawModeA.intro,
              bullets: filteredBullets,
            };
          }
          // If no bullets remain, modeASuggestions stays null (hide section)
        } else {
          // No HIGH matches = show all Mode A suggestions (for LOW/MEDIUM fallback)
          modeASuggestions = rawModeA;
        }
      } else if (evaluation.suggestions_mode === 'B' && evaluation.near_matches.length > 0) {
        const rawModeBSuggestions = generateOutfitModeBSuggestionsV2(evaluation.near_matches, uiVibeForCopy);
        // Only set Mode B if we have actual bullets - never allow { bullets: [] }
        // Empty Mode B should be null, not an empty object
        if (rawModeBSuggestions && rawModeBSuggestions.bullets.length > 0) {
          modeBSuggestions = {
            intro: "To make this pairing work:",
            bullets: rawModeBSuggestions.bullets,
          };
        }
      }

      return {
        evaluated: true,
        debugTier: evaluation.outfit_confidence,
        showMatchesSection: evaluation.show_matches_section,
        matches: enrichedMatches,
        highMatchCount,
        nearMatchCount,
        bestMatch: enrichedMatches.length > 0 ? enrichedMatches[0] : null,
        suggestionsMode: evaluation.suggestions_mode,
        modeASuggestions,
        modeBSuggestions,
        uiVibeForCopy,
        rawEvaluation: evaluation,
      };
    } catch (error) {
      console.error('[ConfidenceEngine] Evaluation failed:', error);
      return getEmptyResult();
    }
  }, [scannedItem, wardrobeItems, analysisResult]);
}

// ============================================
// HELPERS
// ============================================

function getEmptyResult(): ConfidenceEngineResult {
  return {
    evaluated: false,
    debugTier: 'LOW',
    showMatchesSection: false,
    matches: [],
    highMatchCount: 0,
    nearMatchCount: 0,
    bestMatch: null,
    suggestionsMode: 'A',
    modeASuggestions: null,
    modeBSuggestions: null,
    uiVibeForCopy: 'casual', // Default fallback vibe
    rawEvaluation: null,
  };
}

/**
 * Get explanation text for a match
 * This uses the explanation templates from the engine
 */
function getExplanationForMatch(
  evaluation: PairEvaluation,
  _targetItem: ConfidenceItem,
  _wardrobeItem: ConfidenceItem
): string | null {
  if (!evaluation.explanation_allowed) {
    return null;
  }

  // The explanation template ID is set by enrichWithExplanation
  // For now, return a generic explanation based on the pair type
  // In a full implementation, this would use generateExplanation
  const pairTypeExplanations: Record<string, string> = {
    tops_bottoms: "Easy + easy: clean, effortless balance.",
    tops_shoes: "Simple shoes keep the look cohesive.",
    bottoms_shoes: "Balanced proportions from the ground up.",
    tops_outerwear: "Adds structure without changing the vibe.",
    dresses_shoes: "Same dressiness level — nothing feels off.",
  };

  return pairTypeExplanations[evaluation.pair_type] ??
    "Easy to wear together.";
}

// ============================================
// UTILITY EXPORTS
// ============================================

/**
 * Map confidence tier to UI verdict state
 */
export function tierToVerdictState(tier: ConfidenceTier): 'great' | 'okay' | 'risky' | 'context_needed' {
  switch (tier) {
    case 'HIGH':
      return 'great';
    case 'MEDIUM':
      return 'okay';
    case 'LOW':
      return 'risky';
    default:
      return 'context_needed';
  }
}

/**
 * Get human-readable label for confidence tier
 */
export function tierToLabel(tier: ConfidenceTier): string {
  switch (tier) {
    case 'HIGH':
      return 'Looks like a good match';
    case 'MEDIUM':
      return 'Could work with the right pieces';
    case 'LOW':
      return 'Might feel tricky to style';
    default:
      return 'Need more context';
  }
}

// ============================================
// HELPER: __DEV__ fallback for non-RN environments
// ============================================

declare const __DEV__: boolean;
