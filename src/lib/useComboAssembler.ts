/**
 * Hook for using ComboAssembler with ConfidenceEngine results.
 *
 * Bridges the CE output to ComboAssembler input.
 */

import { useMemo } from 'react';
import type { WardrobeItem, ScannedItem, Category } from './types';
import type { ConfidenceEngineResult } from './useConfidenceEngine';
import type { PairEvaluation } from './confidence-engine';
import {
  assembleCombos,
  compareCombosForShadowMode,
  logShadowModeComparison,
  type AssembledCombo,
  type ComboAssemblerResult,
  type ComboAssemblerConfig,
  type CandidatesBySlot,
  type OutfitSlot,
} from './combo-assembler';
import { filterIncoherentCombos } from './outfit-coherence';

// ============================================
// TYPES
// ============================================

/**
 * Debug info for diagnosing empty outfit scenarios.
 */
export interface ComboAssemblerDebug {
  /** Number of MEDIUM tierFloor combos before coherence filter */
  preFilterNearCount: number;
  /** Number of MEDIUM tierFloor combos rejected by coherence filter */
  rejectedNearCount: number;
  /** Number of HIGH tierFloor combos before coherence filter */
  preFilterHighCount: number;
  /** Number of HIGH tierFloor combos rejected by coherence filter */
  rejectedHighCount: number;
}

export interface UseComboAssemblerResult {
  /** Assembled and ranked combos */
  combos: AssembledCombo[];

  /** Whether we could form any combos */
  canFormCombos: boolean;

  /** Missing slots that prevent combo formation */
  missingSlots: { slot: string; category: string }[];

  /** Human-readable message for missing slots */
  missingMessage: string | null;

  /** Candidates by slot (for detecting missing HIGH tier pieces) */
  candidatesBySlot: CandidatesBySlot | null;

  /** Coherence penalty by combo ID (for selection trace) */
  penaltyById: Map<string, number>;

  /** Debug info for diagnosing empty outfit scenarios */
  debug: ComboAssemblerDebug;
}

// ============================================
// HOOK
// ============================================

/**
 * Use ComboAssembler with CE results to generate outfit combos.
 *
 * @param scannedItem - The scanned item
 * @param wardrobeItems - All wardrobe items (for category lookup)
 * @param confidenceResult - Result from useConfidenceEngine
 * @param config - Optional assembly configuration
 */
export function useComboAssembler(
  scannedItem: ScannedItem | null,
  wardrobeItems: WardrobeItem[],
  confidenceResult: ConfidenceEngineResult,
  config?: Partial<ComboAssemblerConfig>
): UseComboAssemblerResult {
  return useMemo(() => {
    // No scanned item or no evaluation = no combos
    if (!scannedItem || !confidenceResult.evaluated) {
      return {
        combos: [],
        canFormCombos: false,
        missingSlots: [],
        missingMessage: null,
        candidatesBySlot: null,
        penaltyById: new Map<string, number>(),
        debug: {
          preFilterNearCount: 0,
          rejectedNearCount: 0,
          preFilterHighCount: 0,
          rejectedHighCount: 0,
        },
      };
    }

    // Build wardrobe category map
    const wardrobeCategoryMap = new Map<string, Category>();
    for (const item of wardrobeItems) {
      wardrobeCategoryMap.set(item.id, item.category);
    }

    // Gather all evaluations from CE (HIGH matches + near matches)
    const allEvaluations: PairEvaluation[] = [];

    // Add HIGH matches
    for (const match of confidenceResult.matches) {
      allEvaluations.push(match.evaluation);
    }

    // Add near matches (MEDIUM tier) from raw evaluation
    if (confidenceResult.rawEvaluation?.near_matches) {
      for (const nearMatch of confidenceResult.rawEvaluation.near_matches) {
        // Avoid duplicates (shouldn't happen, but guard)
        if (!allEvaluations.some(e => e.item_b_id === nearMatch.item_b_id)) {
          allEvaluations.push(nearMatch);
        }
      }
    }

    // Run combo assembler
    const result = assembleCombos(
      scannedItem.category,
      allEvaluations,
      wardrobeCategoryMap,
      config
    );

    // Dev logging: combo assembly pipeline
    if (__DEV__) {
      console.log('[ComboAssembler] Pipeline start:', {
        scannedCategory: scannedItem.category,
        evaluationsCount: allEvaluations.length,
        rawCombosGenerated: result.combos.length,
        missingSlots: result.missingSlots,
        candidatesBySlot: {
          TOP: result.candidatesBySlot.TOP.length,
          BOTTOM: result.candidatesBySlot.BOTTOM.length,
          SHOES: result.candidatesBySlot.SHOES.length,
          DRESS: result.candidatesBySlot.DRESS.length,
          OUTERWEAR: result.candidatesBySlot.OUTERWEAR.length,
        },
      });

      // Log tier distribution of candidates per slot
      const logSlotTiers = (slot: string, candidates: any[]) => {
        if (candidates.length === 0) return;
        const tierCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
        candidates.forEach(c => tierCounts[c.tier as keyof typeof tierCounts]++);
        console.log(`  ${slot}: HIGH=${tierCounts.HIGH}, MEDIUM=${tierCounts.MEDIUM}, LOW=${tierCounts.LOW}`);
      };
      
      console.log('[ComboAssembler] Candidates tier breakdown:');
      logSlotTiers('TOP', result.candidatesBySlot.TOP);
      logSlotTiers('BOTTOM', result.candidatesBySlot.BOTTOM);
      logSlotTiers('SHOES', result.candidatesBySlot.SHOES);
      logSlotTiers('DRESS', result.candidatesBySlot.DRESS);
      logSlotTiers('OUTERWEAR', result.candidatesBySlot.OUTERWEAR);
    }

    // Compute pre-filter tier counts (for debug diagnostics)
    const preFilterHighCount = result.combos.filter(c => c.tierFloor === 'HIGH').length;
    const preFilterNearCount = result.combos.filter(c => c.tierFloor === 'MEDIUM').length;

    // Apply outfit coherence filter (Phase 1)
    // Filters out combos with incoherent wardrobe↔wardrobe pairings
    // (e.g., sporty pants + heels, big formality clashes)
    const coherenceResult = filterIncoherentCombos(result.combos, wardrobeItems);

    // Compute post-filter tier counts to get rejected counts
    const postFilterHighCount = coherenceResult.combos.filter(c => c.tierFloor === 'HIGH').length;
    const postFilterNearCount = coherenceResult.combos.filter(c => c.tierFloor === 'MEDIUM').length;
    const rejectedHighCount = preFilterHighCount - postFilterHighCount;
    const rejectedNearCount = preFilterNearCount - postFilterNearCount;
    
    // Re-sort with penalty + mediumCount awareness
    // Sort order for all combos:
    //   1. tierFloor (HIGH > MEDIUM > LOW)
    //   2. coherence penalty (0 before 1)
    //   3. mediumCount (fewer MEDIUM items first) - only for MEDIUM tierFloor
    //   4. avgScore desc
    //   5. stable tiebreaker (id)
    const filteredCombos = [...coherenceResult.combos].sort((a, b) => {
      // Primary: tier floor (HIGH > MEDIUM > LOW)
      const tierOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const tierDiff = tierOrder[a.tierFloor] - tierOrder[b.tierFloor];
      if (tierDiff !== 0) return tierDiff;

      // Secondary: coherence penalty (0 before 1)
      const penaltyA = coherenceResult.penaltyById.get(a.id) ?? 0;
      const penaltyB = coherenceResult.penaltyById.get(b.id) ?? 0;
      if (penaltyA !== penaltyB) return penaltyA - penaltyB;

      // Tertiary: mediumCount (fewer MEDIUM items first)
      // This only affects MEDIUM tierFloor combos (Worth trying)
      // Makes [HIGH, HIGH, MEDIUM] rank above [MEDIUM, MEDIUM, MEDIUM]
      if (a.tierFloor === 'MEDIUM') {
        const mediumCountA = a.candidates.filter(c => c.tier === 'MEDIUM').length;
        const mediumCountB = b.candidates.filter(c => c.tier === 'MEDIUM').length;
        if (mediumCountA !== mediumCountB) return mediumCountA - mediumCountB;
      }

      // Quaternary: avgScore (higher is better)
      const scoreDiff = b.avgScore - a.avgScore;
      if (Math.abs(scoreDiff) > 0.001) return scoreDiff;

      // Stable tiebreaker: lexical combo ID
      return a.id.localeCompare(b.id);
    });
    
    // Dev logging for coherence filter effectiveness
    if (__DEV__ && coherenceResult.rejectedCount > 0) {
      const byReason = Object.fromEntries(coherenceResult.rejectionsByReason);
      console.log(
        `[ComboAssembler] Coherence filter: ${coherenceResult.rejectedCount} rejected`,
        byReason
      );
    }

    // Dev warning when coherence filter removes ALL outfits
    if (__DEV__ && result.combos.length > 0 && filteredCombos.length === 0) {
      console.warn(
        '[ComboAssembler] 0 outfits after coherence filter! Filter may be too strict.',
        `Original: ${result.combos.length}`,
        coherenceResult.rejectionLog
      );
    }

    // Generate missing message
    let missingMessage: string | null = null;
    if (result.missingSlots.length > 0) {
      const categories = result.missingSlots.map(s => s.category);
      if (categories.length === 1) {
        missingMessage = `Add ${categories[0]} to see outfit ideas`;
      } else {
        const last = categories.pop();
        missingMessage = `Add ${categories.join(', ')} and ${last} to see outfit ideas`;
      }
    }

    return {
      combos: filteredCombos,
      canFormCombos: result.canFormCombos,
      missingSlots: result.missingSlots,
      missingMessage,
      candidatesBySlot: result.candidatesBySlot,
      penaltyById: coherenceResult.penaltyById,
      debug: {
        preFilterNearCount,
        rejectedNearCount,
        preFilterHighCount,
        rejectedHighCount,
      },
    };
  }, [scannedItem, wardrobeItems, confidenceResult, config]);
}

// Re-export OutfitSlot for use in useResultsTabs
export type { OutfitSlot };

/**
 * Run shadow mode comparison between CE combos and legacy combos.
 * Call this in __DEV__ to log comparison metrics.
 */
export function runShadowModeComparison(
  ceCombos: AssembledCombo[],
  legacyCombos: { items?: { id: string }[] }[] | undefined
): void {
  if (!__DEV__) return;
  if (!legacyCombos) return;

  const normalizedLegacy = legacyCombos.map(c => ({
    items: c.items ?? [],
  }));

  const comparison = compareCombosForShadowMode(ceCombos, normalizedLegacy);
  logShadowModeComparison(comparison);
}
