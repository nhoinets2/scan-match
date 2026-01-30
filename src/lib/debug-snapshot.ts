/**
 * TEMPORARY: Debug snapshot builder for engine evaluation data
 * Remove this file when debug snapshot feature is no longer needed
 * 
 * Updated to capture decision table inputs, rule traces, and render model
 */

import type { ConfidenceEngineResult } from './useConfidenceEngine';
import type { Category, WardrobeItem } from './types';
import type { UiState } from './results-ui-policy';
import { buildResultsRenderModel } from './results-ui-policy';

export interface EngineSnapshot {
  version: string;
  createdAt: string;
  scanId: string;
  scannedCategory: Category;
  
  // ============================================
  // DECISION TABLE INPUTS (Phase 0)
  // ============================================
  inputs: {
    evaluated: boolean;
    highMatchCount: number;
    nearMatchCount: number;
    wardrobeCount: number;
    matchesLength: number;
    hasModeABullets: boolean;
    hasModeBBullets: boolean;
  };
  
  // ============================================
  // CATEGORY DEBUGGING (Category Mismatch Detection)
  // ============================================
  categoryDebug: {
    /** What the summary card uses (itemSummary.category) */
    itemCardCategory: Category;
    /** The single source of truth (scannedItem.category) */
    canonicalCategory: Category;
    /** CE scanned category (already exists as scannedCategory, but included here for clarity) */
    ceScannedCategory: Category;
    /** Suggestions reason (already exists, but included here for debugging) */
    suggestionsReason?: string[];
  };
  
  // ============================================
  // RULE TRACE (Decision Table Representation)
  // ============================================
  ruleTrace: {
    phase1: {
      ruleId: string; // e.g., "1.1", "1.2", "1.3", "1.4"
      uiState: UiState;
    };
    phase2: {
      ruleId: string; // e.g., "2.1", "2.2", "2.3", etc.
      variant: "matches" | "empty-cta" | "hidden";
      visible: boolean;
    };
    phase3: {
      ruleId: string; // e.g., "3.1", "3.2", "3.3", etc.
      mode: "A" | "B";
      visible: boolean;
      title: string;
      intro: string;
    };
    phase4: {
      ruleId: string; // e.g., "4.1", "4.2", etc.
      showRescanCta: boolean;
    };
  };
  
  // ============================================
  // RENDER MODEL OUTPUT
  // ============================================
  renderModel: {
    uiState: UiState;
    matchesSection: {
      visible: boolean;
      variant: "matches" | "empty-cta" | "hidden";
    };
    suggestionsSection: {
      visible: boolean;
      mode: "A" | "B";
      title: string;
      intro: string;
      bulletsCount: number;
    };
    showRescanCta: boolean;
  };
  
  // ============================================
  // DERIVED FLAGS & INVARIANTS
  // ============================================
  derived: {
    devAssertions: Array<{
      name: string;
      triggered: boolean;
      message?: string;
    }>;
  };
  
  // ============================================
  // LEGACY FIELDS (for backwards compatibility)
  // ============================================
  /**
   * ⚠️ WARNING: DO NOT USE FOR UI DISPLAY ⚠️
   * 
   * These values are FROZEN at scan time and become STALE when:
   * - User adds/removes wardrobe items
   * - Matching algorithm is updated
   * 
   * For current match counts, use evaluateAgainstWardrobe() from confidence-engine.ts
   * See useMatchCount.ts for the canonical pattern.
   * 
   * This data is ONLY for:
   * - DebugSnapshotModal (developer debugging)
   * - Analytics/logging of historical state
   */
  engines: {
    confidence: {
      evaluated: boolean;
      debugTier: "HIGH" | "MEDIUM" | "LOW";
      showMatchesSection: boolean;
      /** @deprecated DO NOT USE - frozen at scan time. Use evaluateAgainstWardrobe() instead */
      matchesHighCount: number;
      /** @deprecated DO NOT USE - frozen at scan time. Use evaluateAgainstWardrobe() instead */
      nearMatchesCount: number;
      suggestionsMode: "A" | "B";
      modeA: boolean;
      modeB: boolean;
    };
  };
  topMatches?: Array<{
    wardrobeItemId: string;
    pairType: string;
    tier: "HIGH" | "MEDIUM" | "LOW";
    rawScore: number;
    caps: string[];
    hardFail: string | null;
    isShoes: boolean;
  }>;
  nearMatches?: Array<{
    wardrobeItemId: string;
    pairType: string;
    tier: "MEDIUM";
    rawScore: number;
    caps: string[];
    isType2a: boolean;
    isType2b: boolean;
  }>;
  suggestions?: {
    modeAIntro?: string;
    modeABullets?: string[];
    modeBIntro?: string;
    modeBBullets?: string[];
  };
  suggestions_reason?: string[]; // Cap reasons for Mode B, or category for Mode A
}

// ============================================
// RULE DETECTION HELPERS
// ============================================

/**
 * Determine which Phase 1 rule fired (UI State determination)
 */
function detectPhase1Rule(
  evaluated: boolean,
  highMatchCount: number,
  nearMatchCount: number
): { ruleId: string; uiState: UiState } {
  if (!evaluated) {
    return { ruleId: "1.1", uiState: "LOW" };
  }
  if (highMatchCount > 0) {
    return { ruleId: "1.2", uiState: "HIGH" };
  }
  if (nearMatchCount > 0) {
    return { ruleId: "1.3", uiState: "MEDIUM" };
  }
  return { ruleId: "1.4", uiState: "LOW" };
}

/**
 * Determine which Phase 2 rule fired (Matches Section)
 */
function detectPhase2Rule(
  uiState: UiState,
  matchesLength: number,
  wardrobeCount: number
): { ruleId: string; variant: "matches" | "empty-cta" | "hidden"; visible: boolean } {
  if (uiState === "HIGH" && matchesLength > 0) {
    return { ruleId: "2.1", variant: "matches", visible: true };
  }
  if (uiState === "HIGH" && matchesLength === 0) {
    return { ruleId: "2.2", variant: "hidden", visible: false };
  }
  if (uiState === "MEDIUM" && wardrobeCount === 0) {
    return { ruleId: "2.3", variant: "empty-cta", visible: true };
  }
  if (uiState === "MEDIUM" && wardrobeCount > 0) {
    return { ruleId: "2.4", variant: "hidden", visible: false };
  }
  if (uiState === "LOW" && wardrobeCount === 0) {
    return { ruleId: "2.5", variant: "empty-cta", visible: true };
  }
  // uiState === "LOW" && wardrobeCount > 0
  return { ruleId: "2.6", variant: "hidden", visible: false };
}

/**
 * Determine which Phase 3 rule fired (Suggestions Section)
 */
function detectPhase3Rule(
  uiState: UiState,
  hasModeBBullets: boolean,
  hasModeABullets: boolean,
  title: string,
  intro: string
): { ruleId: string; mode: "A" | "B"; visible: boolean; title: string; intro: string } {
  if (uiState === "HIGH") {
    if (hasModeABullets) {
      return { ruleId: "3.1", mode: "A", visible: true, title, intro };
    }
    return { ruleId: "3.2", mode: "A", visible: false, title, intro };
  }
  if (uiState === "MEDIUM") {
    if (hasModeBBullets) {
      return { ruleId: "3.3", mode: "B", visible: true, title, intro };
    }
    if (hasModeABullets) {
      return { ruleId: "3.4", mode: "A", visible: true, title, intro };
    }
    return { ruleId: "3.5", mode: "A", visible: false, title, intro };
  }
  // uiState === "LOW"
  if (hasModeABullets) {
    return { ruleId: "3.6", mode: "A", visible: true, title, intro };
  }
  return { ruleId: "3.7", mode: "A", visible: false, title, intro };
}

/**
 * Determine which Phase 4 rule fired (Rescan CTA)
 */
function detectPhase4Rule(
  evaluated: boolean,
  wardrobeCount: number,
  matchesSectionVisible: boolean,
  suggestionsVisible: boolean
): { ruleId: string; showRescanCta: boolean } {
  const hasActionableContent = matchesSectionVisible || suggestionsVisible;
  if (evaluated && wardrobeCount > 0 && !hasActionableContent) {
    return { ruleId: "4.1", showRescanCta: true };
  }
  if (!evaluated) {
    return { ruleId: "4.2", showRescanCta: false };
  }
  if (evaluated && wardrobeCount === 0) {
    return { ruleId: "4.3", showRescanCta: false };
  }
  if (evaluated && wardrobeCount > 0 && matchesSectionVisible) {
    return { ruleId: "4.4", showRescanCta: false };
  }
  // evaluated && wardrobeCount > 0 && suggestionsVisible
  return { ruleId: "4.5", showRescanCta: false };
}

/**
 * Check dev assertions and return triggered ones
 */
function checkDevAssertions(
  confidenceResult: ConfidenceEngineResult,
  uiState: UiState,
  matchesLength: number,
  wardrobeCount: number,
  matchesSectionVisible: boolean,
  suggestionsVisible: boolean,
  showRescanCta: boolean,
  matchesSectionVariant: "matches" | "empty-cta" | "hidden",
  suggestionsBulletsCount: number
): Array<{ name: string; triggered: boolean; message?: string }> {
  const assertions: Array<{ name: string; triggered: boolean; message?: string }> = [];
  
  // Assertion 1: highMatchCount should match matches.length
  if (confidenceResult.evaluated && confidenceResult.highMatchCount !== matchesLength) {
    assertions.push({
      name: "highMatchCount_mismatch",
      triggered: true,
      message: `highMatchCount=${confidenceResult.highMatchCount} !== matches.length=${matchesLength}`,
    });
  } else {
    assertions.push({ name: "highMatchCount_mismatch", triggered: false });
  }
  
  // Assertion 2: If uiState is HIGH, matches.length must be > 0
  if (uiState === "HIGH" && matchesLength === 0) {
    assertions.push({
      name: "uiState_HIGH_no_matches",
      triggered: true,
      message: `uiState=HIGH but matches.length=0, highMatchCount=${confidenceResult.highMatchCount}`,
    });
  } else {
    assertions.push({ name: "uiState_HIGH_no_matches", triggered: false });
  }
  
  // Assertion 3: If uiState is HIGH, debugTier should also be HIGH
  if (uiState === "HIGH" && confidenceResult.debugTier !== "HIGH") {
    assertions.push({
      name: "uiState_HIGH_debugTier_mismatch",
      triggered: true,
      message: `uiState=HIGH but debugTier=${confidenceResult.debugTier}`,
    });
  } else {
    assertions.push({ name: "uiState_HIGH_debugTier_mismatch", triggered: false });
  }
  
  // Assertion 4: If suggestionsSection.visible, bullets must have content
  if (suggestionsVisible && suggestionsBulletsCount === 0) {
    assertions.push({
      name: "suggestions_visible_no_bullets",
      triggered: true,
      message: "suggestionsSection.visible but bullets.length === 0",
    });
  } else {
    assertions.push({ name: "suggestions_visible_no_bullets", triggered: false });
  }
  
  // Assertion 5: If matchesSection shows 'matches' variant, there must be matches
  if (matchesSectionVisible && matchesSectionVariant === "matches" && matchesLength === 0) {
    assertions.push({
      name: "matches_variant_no_matches",
      triggered: true,
      message: "matchesSection variant is 'matches' but matches.length === 0",
    });
  } else {
    assertions.push({ name: "matches_variant_no_matches", triggered: false });
  }
  
  // Assertion 6: If matchesSection shows 'empty-cta' variant, wardrobeCount must be 0
  if (matchesSectionVariant === "empty-cta" && wardrobeCount !== 0) {
    assertions.push({
      name: "empty_cta_wardrobe_not_empty",
      triggered: true,
      message: `matchesSection variant is 'empty-cta' but wardrobeCount=${wardrobeCount}`,
    });
  } else {
    assertions.push({ name: "empty_cta_wardrobe_not_empty", triggered: false });
  }
  
  // Assertion 7: showRescanCta is mutually exclusive with visible sections
  if (showRescanCta && (matchesSectionVisible || suggestionsVisible)) {
    assertions.push({
      name: "rescan_cta_with_visible_sections",
      triggered: true,
      message: `showRescanCta=true but matchesSection.visible=${matchesSectionVisible}, suggestionsSection.visible=${suggestionsVisible}`,
    });
  } else {
    assertions.push({ name: "rescan_cta_with_visible_sections", triggered: false });
  }
  
  return assertions;
}

/**
 * Check category mismatch assertions
 */
function checkCategoryAssertions(
  itemCardCategory: Category,
  canonicalCategory: Category,
  itemLabel: string,
  suggestionsVisible: boolean
): Array<{ name: string; triggered: boolean; message?: string }> {
  const assertions: Array<{ name: string; triggered: boolean; message?: string }> = [];
  
  // Assertion 8: item_card_category_mismatch triggered when:
  // - itemCard.category !== canonicalCategory
  // - OR itemLabel === "Unknown item" while suggestionsSection.visible === true
  const categoryMismatch = itemCardCategory !== canonicalCategory;
  const unknownItemWithSuggestions = itemLabel === "Unknown item" && suggestionsVisible;
  
  if (categoryMismatch || unknownItemWithSuggestions) {
    let message = '';
    if (categoryMismatch) {
      message = `itemCard.category=${itemCardCategory} !== canonicalCategory=${canonicalCategory}`;
    }
    if (unknownItemWithSuggestions) {
      message += (message ? '; ' : '') + `itemLabel="Unknown item" while suggestionsSection.visible=true`;
    }
    
    assertions.push({
      name: "item_card_category_mismatch",
      triggered: true,
      message,
    });
  } else {
    assertions.push({ name: "item_card_category_mismatch", triggered: false });
  }
  
  return assertions;
}

/**
 * Build engine snapshot from evaluation results
 */
export function buildEngineSnapshot(
  confidenceResult: ConfidenceEngineResult,
  scanId: string,
  scannedCategory: Category,
  wardrobeCount: number = 0,
  wardrobeItems: WardrobeItem[] = [],
  itemCardCategory?: Category,
  itemLabel?: string
): EngineSnapshot | null {
  // Always build snapshot, even if confidence engine didn't evaluate
  // This helps debug why it didn't evaluate (empty wardrobe, etc.)
  
  const rawEval = confidenceResult.rawEvaluation;
  
  // ============================================
  // CAPTURE INPUTS (Phase 0)
  // ============================================
  const hasModeABullets = (confidenceResult.modeASuggestions?.bullets?.length ?? 0) > 0;
  const hasModeBBullets = (confidenceResult.modeBSuggestions?.bullets?.length ?? 0) > 0;
  
  const inputs = {
    evaluated: confidenceResult.evaluated,
    highMatchCount: confidenceResult.highMatchCount,
    nearMatchCount: confidenceResult.nearMatchCount,
    wardrobeCount,
    matchesLength: confidenceResult.matches.length,
    hasModeABullets,
    hasModeBBullets,
  };
  
  // ============================================
  // BUILD RENDER MODEL (needed for rule detection)
  // ============================================
  const renderModel = buildResultsRenderModel(confidenceResult, wardrobeCount, wardrobeItems);
  const uiState = renderModel.uiState;
  
  // ============================================
  // DETECT RULES (Phase 1-4)
  // ============================================
  const phase1 = detectPhase1Rule(
    inputs.evaluated,
    inputs.highMatchCount,
    inputs.nearMatchCount
  );
  
  const phase2 = detectPhase2Rule(
    uiState,
    inputs.matchesLength,
    wardrobeCount
  );
  
  const phase3 = detectPhase3Rule(
    uiState,
    hasModeBBullets,
    hasModeABullets,
    renderModel.suggestionsSection.title,
    renderModel.suggestionsSection.intro
  );
  
  const phase4 = detectPhase4Rule(
    inputs.evaluated,
    wardrobeCount,
    renderModel.matchesSection.visible,
    renderModel.suggestionsSection.visible
  );
  
  // ============================================
  // DERIVED FLAGS
  // ============================================
  const derivedFlags = {
  };
  
  // ============================================
  // DEV ASSERTIONS
  // ============================================
  const devAssertions = checkDevAssertions(
    confidenceResult,
    uiState,
    inputs.matchesLength,
    wardrobeCount,
    renderModel.matchesSection.visible,
    renderModel.suggestionsSection.visible,
    renderModel.showRescanCta,
    renderModel.matchesSection.variant,
    renderModel.suggestionsSection.bullets.length
  );

  // ============================================
  // LEGACY DATA (for backwards compatibility)
  // ============================================
  
  // Build top matches (HIGH tier only, from matches array)
  const topMatches = confidenceResult.matches.slice(0, 5).map(m => ({
    wardrobeItemId: m.wardrobeItem.id,
    pairType: m.evaluation.pair_type,
    tier: m.evaluation.confidence_tier,
    rawScore: m.evaluation.raw_score,
    caps: m.evaluation.cap_reasons,
    hardFail: m.evaluation.hard_fail_reason,
    isShoes: m.evaluation.is_shoes_involved,
  }));

  // Build near matches (MEDIUM tier, from rawEvaluation)
  const nearMatches = rawEval?.near_matches?.slice(0, 3).map(m => {
    const highThreshold = m.is_shoes_involved ? 0.82 : 0.78;
    const isType2a = m.raw_score >= highThreshold && m.cap_reasons.length > 0;
    const isType2b = m.raw_score >= 0.70 && !isType2a;

    return {
      wardrobeItemId: m.item_b_id, // Simplified - wardrobe item is typically item_b
      pairType: m.pair_type,
      tier: m.confidence_tier as "MEDIUM",
      rawScore: m.raw_score,
      caps: m.cap_reasons,
      isType2a,
      isType2b,
    };
  }) ?? [];

  // Extract suggestions reason
  let suggestionsReason: string[] | undefined;
  if (confidenceResult.suggestionsMode === 'B' && rawEval?.near_matches) {
    // For Mode B: aggregate cap reasons from near matches
    const reasonCounts = new Map<string, number>();
    for (const match of rawEval.near_matches) {
      for (const reason of match.cap_reasons) {
        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      }
    }
    // Sort by count (descending) and return as array
    suggestionsReason = Array.from(reasonCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([reason]) => reason);
  } else if (confidenceResult.suggestionsMode === 'A') {
    // For Mode A: use category as reason
    suggestionsReason = [`category_based:${scannedCategory}`];
  }

  // ============================================
  // CATEGORY DEBUGGING
  // ============================================
  // Use provided itemCardCategory or fallback to scannedCategory
  const itemCardCat = itemCardCategory ?? scannedCategory;
  const canonicalCat = scannedCategory; // This is the single source of truth
  
  const categoryDebug = {
    itemCardCategory: itemCardCat,
    canonicalCategory: canonicalCat,
    ceScannedCategory: scannedCategory,
    suggestionsReason: suggestionsReason,
  };
  
  // Category mismatch assertions
  const categoryAssertions = checkCategoryAssertions(
    itemCardCat,
    canonicalCat,
    itemLabel ?? "Unknown item",
    renderModel.suggestionsSection.visible
  );
  
  // Merge all assertions
  const allAssertions = [...devAssertions, ...categoryAssertions];

  // ============================================
  // BUILD COMPLETE SNAPSHOT
  // ============================================
  return {
    version: "ce-v2.0", // Updated version for decision table support
    createdAt: new Date().toISOString(),
    scanId,
    scannedCategory,
    
    // Decision table inputs
    inputs,
    
    // Rule trace
    ruleTrace: {
      phase1,
      phase2,
      phase3,
      phase4,
    },
    
    // Render model output
    renderModel: {
      uiState: renderModel.uiState,
      matchesSection: {
        visible: renderModel.matchesSection.visible,
        variant: renderModel.matchesSection.variant,
      },
      suggestionsSection: {
        visible: renderModel.suggestionsSection.visible,
        mode: renderModel.suggestionsSection.mode,
        title: renderModel.suggestionsSection.title,
        intro: renderModel.suggestionsSection.intro,
        bulletsCount: renderModel.suggestionsSection.bullets.length,
      },
      showRescanCta: renderModel.showRescanCta,
    },
    
    // Category debugging
    categoryDebug,
    
    // Derived flags & invariants
    derived: {
      devAssertions: allAssertions,
    },
    
    // Legacy fields (for backwards compatibility)
    engines: {
      confidence: {
        evaluated: confidenceResult.evaluated,
        debugTier: confidenceResult.debugTier,
        showMatchesSection: confidenceResult.showMatchesSection,
        matchesHighCount: confidenceResult.highMatchCount,
        nearMatchesCount: confidenceResult.nearMatchCount,
        suggestionsMode: confidenceResult.suggestionsMode,
        modeA: !!confidenceResult.modeASuggestions,
        modeB: !!confidenceResult.modeBSuggestions,
      },
    },
    topMatches: topMatches.length > 0 ? topMatches : undefined,
    nearMatches: nearMatches.length > 0 ? nearMatches : undefined,
    suggestions: confidenceResult.modeASuggestions || confidenceResult.modeBSuggestions ? {
      modeAIntro: confidenceResult.modeASuggestions?.intro,
      modeABullets: confidenceResult.modeASuggestions?.bullets.map(b => b.text),
      modeBIntro: confidenceResult.modeBSuggestions?.intro,
      modeBBullets: confidenceResult.modeBSuggestions?.bullets.map(b => b.text),
    } : undefined,
    suggestions_reason: suggestionsReason,
  };
}

