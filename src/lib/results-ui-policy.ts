/**
 * Results Screen UI Policy
 *
 * THE SINGLE SOURCE OF TRUTH for results screen rendering.
 *
 * This module exports `buildResultsRenderModel()` which returns a complete
 * render model. The results screen should consume this directly without
 * any additional conditionals or logic.
 *
 * This prevents "UI drift" as the screen evolves and makes testing trivial.
 */

import type { ConfidenceEngineResult, EnrichedMatch } from './useConfidenceEngine';
import type { Category, SuggestionBullet, PairEvaluation } from './confidence-engine';
import type { WardrobeItem } from './types';

// ============================================
// UI STATE
// ============================================

/**
 * UI State determines how the results screen renders.
 * - HIGH: Show matches section, Mode A suggestions are optional/bonus
 * - MEDIUM: Hide matches, show Mode B "make it work" suggestions (fallback to Mode A)
 * - LOW: Hide matches, show Mode A "what would help" suggestions
 */
export type UiState = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Derive UI state from confidence engine result.
 *
 * Rules (order matters):
 * 1. If highMatchCount > 0 → HIGH
 * 2. If nearMatchCount > 0 → MEDIUM
 * 3. Otherwise → LOW
 *
 * Note: debugTier is derived/display-only, not used for UI state.
 */
export function getUiState(confidenceResult: ConfidenceEngineResult): UiState {
  // Guard: If not evaluated, treat as LOW
  if (!confidenceResult.evaluated) {
    return 'LOW';
  }

  // HIGH: We have visible HIGH matches
  if (confidenceResult.highMatchCount > 0) {
    return 'HIGH';
  }

  // MEDIUM: We have near-matches (Mode B territory)
  if (confidenceResult.nearMatchCount > 0) {
    return 'MEDIUM';
  }

  // LOW: No matches, no near-matches
  return 'LOW';
}

// ============================================
// RENDER MODEL
// ============================================

/**
 * Matches section variant determines both what to show AND visibility.
 * - 'matches': Show wardrobe matches (visible)
 * - 'empty-cta': Show add-to-wardrobe prompt (visible)
 * - 'hidden': Don't show section (not visible)
 */
export type MatchesSectionVariant = 'matches' | 'empty-cta' | 'hidden';

/**
 * Matches section render model
 */
export interface MatchesSectionModel {
  visible: boolean;
  variant: MatchesSectionVariant;
  /** Enriched near-matches for the "Worth trying" tab */
  nearMatches: EnrichedMatch[];
}

/**
 * Suggestions section render model
 */
export interface SuggestionsSectionModel {
  visible: boolean;
  mode: 'A' | 'B';
  title: string;
  intro: string;
  bullets: SuggestionBullet[];
}

/**
 * Complete render model for results screen.
 * The screen should consume this directly without additional logic.
 */
export interface ResultsRenderModel {
  uiState: UiState;
  matchesSection: MatchesSectionModel;
  suggestionsSection: SuggestionsSectionModel;

  /**
   * Show a "rescan" or "add items" CTA when nothing actionable is displayed.
   * This prevents completely blank results screens.
   */
  showRescanCta: boolean;
}

// ============================================
// SECTION COPY
// ============================================

interface SectionCopy {
  title: string;
  intro: string;
}

/**
 * Get section title and intro based on UI state.
 */
function getSuggestionsCopyForState(uiState: UiState): SectionCopy {
  switch (uiState) {
    case 'HIGH':
      return {
        title: "If you want to expand this look",
        intro: "Optional ideas to try:",
      };
    case 'MEDIUM':
      return {
        title: "To make this work",
        intro: "To make this pairing work:",
      };
    case 'LOW':
      return {
        title: "What would help",
        intro: "To make this easier to style:",
      };
  }
}

// ============================================
// NEAR MATCHES HELPER
// ============================================

/**
 * Build enriched near-matches from confidence result.
 *
 * Near-matches are MEDIUM tier pairs that didn't make HIGH.
 * We enrich them with wardrobe item data for display in the bottom sheet.
 */
function buildNearMatches(
  confidenceResult: ConfidenceEngineResult,
  wardrobeItems: WardrobeItem[]
): EnrichedMatch[] {
  const rawEval = confidenceResult.rawEvaluation;
  if (!rawEval || !rawEval.near_matches || rawEval.near_matches.length === 0) {
    return [];
  }

  // Create lookup map for wardrobe items
  const wardrobeMap = new Map<string, WardrobeItem>();
  for (const item of wardrobeItems) {
    wardrobeMap.set(item.id, item);
  }

  // Enrich each near-match with wardrobe item data
  const enriched: EnrichedMatch[] = [];
  for (const match of rawEval.near_matches) {
    // Find the wardrobe item (it could be item_a or item_b)
    const wardrobeItem = wardrobeMap.get(match.item_b_id) ??
                        wardrobeMap.get(match.item_a_id);

    if (wardrobeItem) {
      enriched.push({
        evaluation: match,
        wardrobeItem,
        // Near-matches don't show explanations (trust guardrail)
        explanation: null,
        explanationAllowed: false,
      });
    }
  }

  // Sort by raw_score descending, then by pair_type for stable ordering
  enriched.sort((a, b) => {
    const scoreDiff = b.evaluation.raw_score - a.evaluation.raw_score;
    if (scoreDiff !== 0) return scoreDiff;
    return a.evaluation.pair_type.localeCompare(b.evaluation.pair_type);
  });

  return enriched;
}

// ============================================
// MAIN POLICY FUNCTION
// ============================================

/**
 * Build the complete render model for the results screen.
 *
 * THIS IS THE SINGLE SOURCE OF TRUTH.
 *
 * The screen calls this once and uses the returned model directly,
 * without additional conditionals or logic.
 *
 * @param confidenceResult - Result from useConfidenceEngine hook
 * @param wardrobeCount - Number of items in user's wardrobe
 * @param wardrobeItems - Wardrobe items for enriching near-matches (optional for backwards compat)
 * @returns Complete render model for the results screen
 */
export function buildResultsRenderModel(
  confidenceResult: ConfidenceEngineResult,
  wardrobeCount: number,
  wardrobeItems: WardrobeItem[] = []
): ResultsRenderModel {
  const uiState = getUiState(confidenceResult);
  const copy = getSuggestionsCopyForState(uiState);

  // --- MATCHES SECTION ---
  // Derive variant first, then visible from variant (prevents invalid states)
  // Rules:
  // - 'matches' ONLY if uiState === 'HIGH' AND matches.length > 0
  // - 'empty-cta' ONLY if wardrobeCount === 0
  // - 'hidden' otherwise
  const matchesSectionVariant: MatchesSectionVariant =
    uiState === 'HIGH' && confidenceResult.matches.length > 0
      ? 'matches'
      : wardrobeCount === 0
        ? 'empty-cta'
        : 'hidden';

  // Derive visible from variant — single source of truth
  const matchesSectionVisible = matchesSectionVariant !== 'hidden';

  // Build enriched near-matches for the "Worth trying" tab
  const nearMatches: EnrichedMatch[] = confidenceResult.nearMatchCount > 0
    ? buildNearMatches(confidenceResult, wardrobeItems)
    : [];

  const matchesSection: MatchesSectionModel = {
    visible: matchesSectionVisible,
    variant: matchesSectionVariant,
    nearMatches,
  };

  // --- SUGGESTIONS SECTION ---
  // Determine what content we have
  // Note: Mode B null means no suggestions, { bullets: [] } is treated as null
  const hasModeABullets = (confidenceResult.modeASuggestions?.bullets?.length ?? 0) > 0;
  const hasModeBBullets = (confidenceResult.modeBSuggestions?.bullets?.length ?? 0) > 0;

  // Determine visibility and mode based on UI state
  let suggestionsVisible = false;
  let suggestionsMode: 'A' | 'B' = 'A';
  let suggestionsBullets: SuggestionBullet[] = [];
  let suggestionsIntro = copy.intro;

  switch (uiState) {
    case 'HIGH':
      // Mode A only if we have bullets after filtering
      suggestionsVisible = hasModeABullets;
      suggestionsMode = 'A';
      suggestionsBullets = confidenceResult.modeASuggestions?.bullets ?? [];
      break;

    case 'MEDIUM':
      // Mode B if available, otherwise fallback to Mode A
      if (hasModeBBullets) {
        suggestionsVisible = true;
        suggestionsMode = 'B';
        // Convert Mode B bullets to SuggestionBullet format (they already have key and text)
        suggestionsBullets = (confidenceResult.modeBSuggestions?.bullets ?? []).map((bullet) => ({
          key: bullet.key,
          text: bullet.text,
          target: null,
        }));
        suggestionsIntro = confidenceResult.modeBSuggestions?.intro ?? copy.intro;
      } else if (hasModeABullets) {
        // Fallback to Mode A when Mode B is empty
        suggestionsVisible = true;
        suggestionsMode = 'A';
        suggestionsBullets = confidenceResult.modeASuggestions?.bullets ?? [];
        // Keep the MEDIUM copy even when falling back to Mode A
      } else {
        suggestionsVisible = false;
      }
      break;

    case 'LOW':
      // Mode A if available
      suggestionsVisible = hasModeABullets;
      suggestionsMode = 'A';
      suggestionsBullets = confidenceResult.modeASuggestions?.bullets ?? [];
      break;
  }

  const suggestionsSection: SuggestionsSectionModel = {
    visible: suggestionsVisible,
    mode: suggestionsMode,
    title: copy.title,
    intro: suggestionsIntro,
    bullets: suggestionsBullets,
  };

  // --- RESCAN CTA ---
  // Show when nothing actionable is displayed (Scenario E: empty state)
  // Guards:
  // - Engine must have evaluated (not a crash/early-return)
  // - User must have wardrobe items (otherwise empty-cta handles it)
  // - No actionable content visible
  const hasActionableContent = matchesSectionVisible || suggestionsVisible;
  const showRescanCta =
    confidenceResult.evaluated &&
    wardrobeCount > 0 &&
    !hasActionableContent;

  // --- DEV ASSERTIONS ---
  if (__DEV__) {
    // highMatchCount should match matches array length
    if (confidenceResult.evaluated && confidenceResult.highMatchCount !== confidenceResult.matches.length) {
      console.warn(
        '[UiPolicy] Invariant violation: highMatchCount !== matches.length. ' +
        `highMatchCount=${confidenceResult.highMatchCount}, ` +
        `matches.length=${confidenceResult.matches.length}`
      );
    }

    // If uiState is HIGH, matches.length must be > 0 (or we have a bug)
    if (uiState === 'HIGH' && confidenceResult.matches.length === 0) {
      console.warn(
        '[UiPolicy] Invariant violation: uiState === HIGH but matches.length === 0. ' +
        `highMatchCount=${confidenceResult.highMatchCount}`
      );
    }

    // If uiState is HIGH, debugTier should also be HIGH
    if (uiState === 'HIGH' && confidenceResult.debugTier !== 'HIGH') {
      console.warn(
        '[UiPolicy] Invariant violation: uiState === HIGH but debugTier !== HIGH. ' +
        `highMatchCount=${confidenceResult.highMatchCount}, ` +
        `debugTier=${confidenceResult.debugTier}`
      );
    }

    // If suggestionsSection.visible, bullets must have content
    if (suggestionsSection.visible && suggestionsSection.bullets.length === 0) {
      console.warn(
        '[UiPolicy] Invariant violation: suggestionsSection.visible but bullets.length === 0'
      );
    }

    // If matchesSection shows 'matches' variant, there must be matches
    if (matchesSection.visible && matchesSection.variant === 'matches' && confidenceResult.matches.length === 0) {
      console.warn(
        '[UiPolicy] Invariant violation: matchesSection variant is "matches" but matches.length === 0'
      );
    }

    // If matchesSection shows 'empty-cta' variant, wardrobeCount must be 0
    if (matchesSection.variant === 'empty-cta' && wardrobeCount !== 0) {
      console.warn(
        '[UiPolicy] Invariant violation: matchesSection variant is "empty-cta" but wardrobeCount !== 0. ' +
        `wardrobeCount=${wardrobeCount}`
      );
    }

    // showRescanCta is mutually exclusive with visible sections
    // If showRescanCta === true, both sections must be hidden
    if (showRescanCta && (matchesSectionVisible || suggestionsVisible)) {
      console.warn(
        '[UiPolicy] Invariant violation: showRescanCta is true but sections are visible. ' +
        `matchesSection.visible=${matchesSectionVisible}, suggestionsSection.visible=${suggestionsVisible}`
      );
    }
  }

  return {
    uiState,
    matchesSection,
    suggestionsSection,
    showRescanCta,
  };
}

// ============================================
// LEGACY EXPORTS (for backwards compatibility)
// ============================================

/**
 * @deprecated Use buildResultsRenderModel instead
 */
export function shouldShowMatchesSection(uiState: UiState): boolean {
  return uiState === 'HIGH';
}

/**
 * @deprecated Use buildResultsRenderModel instead
 */
export function shouldShowSuggestionsSection(args: {
  modeASuggestions: { bullets: unknown[] } | null;
  modeBSuggestions: { bullets: unknown[] } | null;
  uiState: UiState;
}): boolean {
  const { modeASuggestions, modeBSuggestions, uiState } = args;

  const hasModeABullets = (modeASuggestions?.bullets?.length ?? 0) > 0;
  const hasModeBBullets = (modeBSuggestions?.bullets?.length ?? 0) > 0;

  switch (uiState) {
    case 'HIGH':
      return hasModeABullets;
    case 'MEDIUM':
      // Fallback to Mode A if Mode B empty
      return hasModeBBullets || hasModeABullets;
    case 'LOW':
      return hasModeABullets;
    default:
      return false;
  }
}

/**
 * @deprecated Use buildResultsRenderModel instead
 */
export function getSuggestionsCopy(uiState: UiState): { title: string; intro: string } {
  return getSuggestionsCopyForState(uiState);
}

// ============================================
// HELPER: __DEV__ fallback for non-RN environments
// ============================================

declare const __DEV__: boolean;
