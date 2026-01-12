/**
 * Results Tabs Hook
 *
 * Manages tab state for the redesigned results screen.
 * Separates HIGH ("Wear now") and NEAR ("Worth trying") content
 * into distinct tabs with proper visibility logic.
 *
 * Key principles:
 * 1. Tab visibility based on matches OR outfits (not just outfits)
 * 2. Per-scan tab persistence with reset on new scan
 * 3. Mode A bullets → Tab 1 only, Mode B bullets → Tab 2 only
 * 4. Empty outfit states handled inside tabs, not by hiding tabs
 */

import { useMemo, useState, useEffect, useCallback } from 'react';
import type { Category, WardrobeItem } from './types';
import type { ConfidenceEngineResult, EnrichedMatch } from './useConfidenceEngine';
import type { UseComboAssemblerResult, OutfitSlot } from './useComboAssembler';
import type { AssembledCombo, CandidatesBySlot } from './combo-assembler';
import type { PairEvaluation, ConfidenceTier } from './confidence-engine';

// ============================================
// TYPES
// ============================================

export type ResultsTab = 'high' | 'near';

/**
 * Details about why outfits section is empty within a tab.
 * null means outfits exist (not empty).
 */
export type OutfitEmptyReasonDetails =
  | { kind: 'missingCorePieces'; missing: { slot: string; category: string }[] }
  | { 
      kind: 'hasItemsButNoMatches';
      /** Slots with 0 candidates - true blockers preventing outfit formation */
      blockingCategories: string[];
      /** Slots with weak candidates - technically possible but low quality */
      weakCategories: string[];
    }
  | { kind: 'missingHighTierCorePieces'; missing: { slot: string; category: string }[] }
  | { kind: 'hasCorePiecesButNoCombos' };

// ============================================
// SLOT PRIORITY FOR DYNAMIC COPY
// ============================================

/**
 * Priority order for picking the "blocker" slot when multiple are missing HIGH.
 * Shoes most commonly gate "wear now", then bottoms/dress.
 */
const SLOT_PRIORITY: OutfitSlot[] = ['SHOES', 'BOTTOM', 'DRESS', 'TOP'];

/**
 * Maps slots to human-readable nouns for copy generation.
 */
const SLOT_NOUN: Record<string, string> = {
  SHOES: 'shoe',
  BOTTOM: 'bottom',
  TOP: 'top',
  DRESS: 'dress',
};

/**
 * Pick the primary missing HIGH slot based on priority.
 */
function pickPrimaryMissingHigh(
  missing: { slot: string; category: string }[]
): { slot: string; category: string } | null {
  const bySlot = new Map(missing.map(m => [m.slot, m]));
  for (const slot of SLOT_PRIORITY) {
    const hit = bySlot.get(slot);
    if (hit) return hit;
  }
  return missing[0] ?? null;
}

/**
 * Generate copy for missing HIGH tier pieces.
 */
function generateMissingHighCopy(primarySlot: string): string {
  const noun = SLOT_NOUN[primarySlot] ?? 'piece';
  return `We didn't find strong ${noun} matches — but you have close options in Worth trying.`;
}

/**
 * Maps slot categories to wardrobe category names.
 * Used to check if user has items in a category (even if none matched).
 */
const SLOT_TO_WARDROBE_CATEGORY: Record<string, string[]> = {
  SHOES: ['shoes'],
  BOTTOM: ['bottoms', 'skirts'], // Both count as "bottoms" for outfit purposes
  TOP: ['tops'],
  DRESS: ['dresses'],
};

/**
 * Check if user has items in their wardrobe for a given slot's category.
 * Returns true if ANY matching category has items.
 */
function wardrobeHasSlotCategory(
  slot: string,
  wardrobeCategoryCounts: Map<string, number>
): boolean {
  const categories = SLOT_TO_WARDROBE_CATEGORY[slot] ?? [slot.toLowerCase()];
  return categories.some(cat => (wardrobeCategoryCounts.get(cat) ?? 0) > 0);
}

// ============================================
// SLOT QUALITY CLASSIFICATION
// ============================================

/**
 * Quality classification for outfit slots.
 * Used for nuanced empty-state messaging.
 * 
 * - blocking: 0 candidates, cannot form outfits
 * - weak: has candidates but low quality (likely feels off)
 * - confident: has good candidates (HIGH or strong MEDIUM)
 */
export type SlotQuality = 'blocking' | 'weak' | 'confident';

/**
 * Thresholds for slot quality classification.
 * Tune based on real score distributions.
 */
const WEAK_BEST_SCORE_THRESHOLD = 0.70;  // Below this = weak
const WEAK_MIN_MEDIUM_COUNT = 2;          // Only 1 MEDIUM option = weak

/**
 * Candidate info needed for quality classification.
 */
interface SlotCandidate {
  tier: ConfidenceTier;
  score: number;
}

/**
 * Classify a slot's quality based on its candidates.
 * 
 * - blocking: no candidates at all
 * - weak: has candidates but they're low quality
 * - confident: has HIGH candidates OR multiple strong MEDIUM
 */
export function getSlotQuality(candidates: SlotCandidate[] | undefined): SlotQuality {
  if (!candidates || candidates.length === 0) {
    return 'blocking';
  }

  const highCount = candidates.filter(c => c.tier === 'HIGH').length;
  if (highCount > 0) {
    return 'confident';
  }

  const mediumCandidates = candidates.filter(c => c.tier === 'MEDIUM');
  const mediumCount = mediumCandidates.length;
  const bestScore = Math.max(...candidates.map(c => c.score));

  // "weak" = technically possible, but likely feels wrong
  if (bestScore < WEAK_BEST_SCORE_THRESHOLD) {
    return 'weak';
  }
  if (mediumCount < WEAK_MIN_MEDIUM_COUNT) {
    return 'weak';
  }

  return 'confident';
}

/**
 * Maps slot to its display category name for messaging.
 */
const SLOT_TO_DISPLAY_CATEGORY: Record<string, string> = {
  SHOES: 'shoes',
  BOTTOM: 'bottoms',
  TOP: 'tops',
  DRESS: 'dresses',
};

// ============================================
// CORE vs OPTIONAL CATEGORIES
// ============================================

/**
 * Core categories that drive tab visibility.
 * Tabs only show if there are core matches OR outfits.
 * Optional categories (outerwear, bags, accessories) don't drive tab visibility.
 */
const CORE_CATEGORIES = new Set<string>([
  'tops',
  'bottoms',
  'shoes',
  'dresses',
  'skirts',
]);

/**
 * Check if a category is a core category.
 */
function isCoreCategory(category: string): boolean {
  return CORE_CATEGORIES.has(category.toLowerCase());
}

// ============================================
// DIVERSITY PICKER (PR 3)
// ============================================

/**
 * Determine which slot to diversify on based on scanned category.
 * - If scanned item is SHOES → diversify on BOTTOM (or DRESS)
 * - Otherwise → diversify on SHOES (default)
 */
function getDiversitySlot(scannedCategory: Category | null): OutfitSlot {
  if (scannedCategory === 'shoes') {
    return 'BOTTOM'; // Will also check DRESS as fallback
  }
  return 'SHOES';
}

/**
 * Get the item ID for a slot from a combo.
 * For BOTTOM diversification, checks BOTTOM first, then DRESS.
 */
function getSlotItemId(combo: AssembledCombo, slot: OutfitSlot): string | null {
  if (slot === 'BOTTOM') {
    // Check BOTTOM first, then DRESS
    return combo.slots.BOTTOM ?? combo.slots.DRESS ?? null;
  }
  // OUTERWEAR is not stored in combo.slots (it's a decoration, not core slot)
  if (slot === 'OUTERWEAR') {
    return combo.optionalOuterwear?.itemId ?? null;
  }
  // Type-safe access for core slots (TOP, SHOES, DRESS)
  const coreSlot = slot as keyof typeof combo.slots;
  return combo.slots[coreSlot] ?? null;
}

/**
 * Apply diversity selection to outfits.
 * Two-pass strategy:
 *   Pass 1: Enforce diversity on the diversity slot (take unique items only)
 *   Pass 2: Fill remaining slots with best remaining combos (even if repeat)
 *
 * @param combos - Already sorted combos (by penalty, mediumCount, avgScore)
 * @param diversitySlot - Slot to diversify on (SHOES or BOTTOM)
 * @param maxCount - Maximum number of outfits to select
 * @returns Selected outfits with diversity applied
 */
function applyDiversitySelection(
  combos: AssembledCombo[],
  diversitySlot: OutfitSlot,
  maxCount: number
): { selected: AssembledCombo[]; debugTrace: DiversityDebugEntry[] } {
  const selected: AssembledCombo[] = [];
  const seenSlotIds = new Set<string>();
  const debugTrace: DiversityDebugEntry[] = [];

  // Pass 1: Take combos with unique diversity slot items
  for (const combo of combos) {
    if (selected.length >= maxCount) break;

    const slotId = getSlotItemId(combo, diversitySlot);

    if (slotId === null) {
      // Missing slot - always eligible (don't enforce diversity)
      selected.push(combo);
      debugTrace.push({
        comboId: combo.id,
        pass: 1,
        reason: 'missing_slot',
        slotId: null,
      });
    } else if (!seenSlotIds.has(slotId)) {
      // Unique slot - take it
      selected.push(combo);
      seenSlotIds.add(slotId);
      debugTrace.push({
        comboId: combo.id,
        pass: 1,
        reason: 'unique',
        slotId,
      });
    }
    // Skip duplicates in pass 1
  }

  // Pass 2: Fill remaining slots with best remaining combos (allow repeats)
  if (selected.length < maxCount) {
    const selectedIds = new Set(selected.map(c => c.id));

    for (const combo of combos) {
      if (selected.length >= maxCount) break;
      if (selectedIds.has(combo.id)) continue;

      selected.push(combo);
      debugTrace.push({
        comboId: combo.id,
        pass: 2,
        reason: 'fill',
        slotId: getSlotItemId(combo, diversitySlot),
      });
    }
  }

  return { selected, debugTrace };
}

/**
 * Debug entry for diversity selection (dev-only logging)
 */
interface DiversityDebugEntry {
  comboId: string;
  pass: 1 | 2;
  reason: 'unique' | 'missing_slot' | 'fill';
  slotId: string | null;
}

/**
 * Content for a single tab (Wear now or Worth trying)
 */
export interface TabContent {
  /** Matches to display in this tab */
  matches: EnrichedMatch[];

  /** Near matches (raw PairEvaluation) for Mode B bullet generation */
  nearMatches: PairEvaluation[];

  /** Outfits to display in this tab */
  outfits: AssembledCombo[];

  /** Why outfits section is empty, or null if outfits exist */
  outfitEmptyReason: OutfitEmptyReasonDetails | null;

  /** Human-readable message for missing pieces */
  missingMessage: string | null;
}

/**
 * Complete tab state for the results screen
 */
export interface ResultsTabsState {
  // ─────────────────────────────────────────────
  // Tab visibility
  // ─────────────────────────────────────────────

  /** Whether "Wear now" tab has content */
  showHigh: boolean;

  /** Whether "Worth trying" tab has content */
  showNear: boolean;

  /** Whether to show the segmented control (both tabs available) */
  showTabs: boolean;

  /** Whether to show the global empty state (no content at all) */
  showEmptyState: boolean;

  // ─────────────────────────────────────────────
  // Active tab state
  // ─────────────────────────────────────────────

  /** Currently active tab */
  activeTab: ResultsTab;

  /** Set active tab (persisted per scan) */
  setActiveTab: (tab: ResultsTab) => void;

  // ─────────────────────────────────────────────
  // Tab content
  // ─────────────────────────────────────────────

  /** Content for "Wear now" tab */
  highTab: TabContent;

  /** Content for "Worth trying" tab */
  nearTab: TabContent;

  // ─────────────────────────────────────────────
  // Display caps
  // ─────────────────────────────────────────────

  /**
   * Maximum outfits to display per tab.
   * - Single visible tab: 5
   * - Both tabs visible: 3 each
   */
  maxOutfitsPerTab: number;

  // ─────────────────────────────────────────────
  // Derived helpers
  // ─────────────────────────────────────────────

  /** Get content for the currently active tab */
  activeTabContent: TabContent;

  /** Total HIGH matches count (for display) */
  highMatchCount: number;

  /** Total NEAR matches count (for display) */
  nearMatchCount: number;

  /** Total HIGH outfits count (for display) */
  highOutfitCount: number;

  /** Total NEAR outfits count (for display) */
  nearOutfitCount: number;
}

// ============================================
// DEBUG FLAGS
// ============================================

/**
 * Enable detailed selection trace logging.
 * Set to true during QA to see why each outfit was picked.
 */
const DEBUG_SELECTION_TRACE = false;

// ============================================
// PER-SCAN TAB PERSISTENCE
// ============================================

// In-memory storage for tab state per scan
// Key: scanId, Value: last selected tab
const tabStateByScanId = new Map<string, ResultsTab>();

/**
 * Get stored tab for a scan, or null if none
 */
function getStoredTab(scanId: string): ResultsTab | null {
  return tabStateByScanId.get(scanId) ?? null;
}

/**
 * Store tab selection for a scan
 */
function storeTab(scanId: string, tab: ResultsTab): void {
  tabStateByScanId.set(scanId, tab);

  // Cleanup old entries (keep last 10 scans to avoid memory leak)
  if (tabStateByScanId.size > 10) {
    const oldestKey = tabStateByScanId.keys().next().value;
    if (oldestKey) {
      tabStateByScanId.delete(oldestKey);
    }
  }
}

// ============================================
// MAIN HOOK
// ============================================

/**
 * Hook for managing results screen tab state.
 *
 * @param scanId - Unique identifier for the current scan (for tab persistence)
 * @param confidenceResult - Result from useConfidenceEngine
 * @param comboResult - Result from useComboAssembler
 * @param wardrobeItems - Wardrobe items for category lookup
 * @param scannedCategory - Category of the scanned item (for diversity slot selection)
 */
export function useResultsTabs(
  scanId: string | null,
  confidenceResult: ConfidenceEngineResult,
  comboResult: UseComboAssemblerResult,
  wardrobeItems: WardrobeItem[] = [],
  scannedCategory: Category | null = null
): ResultsTabsState {
  // ─────────────────────────────────────────────
  // Split content by tier
  // ─────────────────────────────────────────────

  const { highOutfits, nearOutfits } = useMemo(() => {
    const high: AssembledCombo[] = [];
    const near: AssembledCombo[] = [];

    for (const combo of comboResult.combos) {
      if (combo.tierFloor === 'HIGH') {
        high.push(combo);
      } else if (combo.tierFloor === 'MEDIUM') {
        near.push(combo);
      }
      // LOW tier combos are excluded (includeLowTier is false by default)
    }

    // Dev logging: tier split results
    if (__DEV__) {
      console.log('[useResultsTabs] Tier split:', {
        totalCombosFromAssembler: comboResult.combos.length,
        highOutfits: high.length,
        nearOutfits: near.length,
      });
      
      // If we have 0 HIGH but expected some, log what we DO have
      if (high.length === 0 && comboResult.combos.length > 0) {
        console.log('[useResultsTabs] No HIGH outfits - all combos:', 
          comboResult.combos.map(c => ({
            id: c.id,
            tierFloor: c.tierFloor,
            tiers: c.candidates.map(cand => `${cand.slot}=${cand.tier}`).join(', ')
          }))
        );
      }
    }

    // Detailed selection trace for HIGH outfits
    if (__DEV__ && DEBUG_SELECTION_TRACE && high.length > 0) {
      const selectionTrace = high.map((combo, rank) => {
        const penalty = comboResult.penaltyById.get(combo.id) ?? 0;
        return {
          rank: rank + 1,
          comboId: combo.id,
          tierFloor: combo.tierFloor,
          penalty,
          avgScore: combo.avgScore.toFixed(3),
        };
      });
      console.debug('[SelectionTrace] Wear now outfits:', selectionTrace);
    }

    return { highOutfits: high, nearOutfits: near };
  }, [comboResult.combos, comboResult.penaltyById]);

  // ─────────────────────────────────────────────
  // Apply diversity selection to Worth trying outfits
  // ─────────────────────────────────────────────
  // Diversify on the opposite slot from scanned item:
  // - If scanned=shoes → diversify on BOTTOM/DRESS
  // - Otherwise → diversify on SHOES

  const diversifiedNearOutfits = useMemo(() => {
    if (nearOutfits.length === 0) {
      return nearOutfits;
    }

    const diversitySlot = getDiversitySlot(scannedCategory);
    // Apply diversity to full list - capping happens at render time
    const { selected, debugTrace } = applyDiversitySelection(
      nearOutfits,
      diversitySlot,
      nearOutfits.length // Take all, let display cap handle the limit
    );

    // Dev logging for diversity selection
    if (__DEV__ && debugTrace.length > 0) {
      const pass1Count = debugTrace.filter(e => e.pass === 1).length;
      const pass2Count = debugTrace.filter(e => e.pass === 2).length;
      console.debug(
        `[useResultsTabs] Diversity selection: slot=${diversitySlot}, pass1=${pass1Count}, pass2=${pass2Count}`,
        debugTrace.slice(0, 5) // Log first 5 for brevity
      );
    }

    // Detailed selection trace (enable DEBUG_SELECTION_TRACE for QA)
    if (__DEV__ && DEBUG_SELECTION_TRACE && selected.length > 0) {
      const traceByComboId = new Map(debugTrace.map(e => [e.comboId, e]));
      const selectionTrace = selected.map((combo, rank) => {
        const diversityInfo = traceByComboId.get(combo.id);
        const mediumCount = combo.candidates.filter(c => c.tier === 'MEDIUM').length;
        const penalty = comboResult.penaltyById.get(combo.id) ?? 0;
        return {
          rank: rank + 1,
          comboId: combo.id,
          tierFloor: combo.tierFloor,
          penalty,
          mediumCount,
          diversitySlotId: diversityInfo?.slotId ?? null,
          diversityPass: diversityInfo?.pass ?? null,
          avgScore: combo.avgScore.toFixed(3),
        };
      });
      console.debug('[SelectionTrace] Worth trying outfits:', selectionTrace);
    }

    return selected;
  }, [nearOutfits, scannedCategory, comboResult.penaltyById]);

  // Get matches from confidence engine
  const highMatches = confidenceResult.matches; // Already HIGH only
  const nearMatches = confidenceResult.rawEvaluation?.near_matches ?? [];

  // ─────────────────────────────────────────────
  // Compute tab visibility
  // ─────────────────────────────────────────────
  // Tabs are driven by CORE content only (tops, bottoms, shoes, dresses, skirts).
  // Optional categories (outerwear, bags, accessories) don't drive tab visibility.
  // This prevents showing an "empty" tab with only add-ons.

  // Create wardrobe lookup map for category resolution
  const wardrobeMap = useMemo(() => {
    const map = new Map<string, WardrobeItem>();
    for (const item of wardrobeItems) {
      map.set(item.id, item);
    }
    return map;
  }, [wardrobeItems]);

  // Count wardrobe items by category (for distinguishing "missing" vs "no matches")
  const wardrobeCategoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of wardrobeItems) {
      const cat = item.category.toLowerCase();
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return counts;
  }, [wardrobeItems]);

  // Filter matches to core categories only for tab visibility
  const coreHighMatches = highMatches.filter(m => 
    isCoreCategory(m.wardrobeItem.category)
  );
  const coreNearMatches = nearMatches.filter(m => {
    // Near matches have item_a (scanned) and item_b (wardrobe)
    // We need to look up the wardrobe item's category
    const wardrobeItem = wardrobeMap.get(m.item_b_id) ?? wardrobeMap.get(m.item_a_id);
    return wardrobeItem ? isCoreCategory(wardrobeItem.category) : false;
  });

  const showHigh = highOutfits.length > 0 || coreHighMatches.length > 0;
  const showNear = nearOutfits.length > 0 || coreNearMatches.length > 0;
  const showTabs = showHigh && showNear;
  const showEmptyState = !showHigh && !showNear;

  // ─────────────────────────────────────────────
  // Dev-only invariants (ensure tab logic consistency)
  // ─────────────────────────────────────────────
  // Core invariants:
  // - If coreNearMatches exist, showNear must be true
  // - If both showHigh and showNear, showTabs must be true
  // - If showTabs is false, at least one of showHigh/showNear must be false

  if (__DEV__) {
    if (coreNearMatches.length > 0 && !showNear) {
      console.warn('[useResultsTabs] Invariant violated: coreNearMatches.length > 0 but showNear is false');
    }
    if (coreHighMatches.length > 0 && !showHigh) {
      console.warn('[useResultsTabs] Invariant violated: coreHighMatches.length > 0 but showHigh is false');
    }
    if (showHigh && showNear && !showTabs) {
      console.warn('[useResultsTabs] Invariant violated: showHigh && showNear but showTabs is false');
    }
    if (!showTabs && showHigh && showNear) {
      console.warn('[useResultsTabs] Invariant violated: !showTabs but both showHigh and showNear are true');
    }
  }

  // ─────────────────────────────────────────────
  // Compute empty reasons per tab
  // ─────────────────────────────────────────────

  const highOutfitEmptyReason = useMemo((): OutfitEmptyReasonDetails | null => {
    if (highOutfits.length > 0) {
      return null; // Not empty
    }

    // Check if missing core pieces vs has items but no matches
    // Split missing slots into: truly missing (not in wardrobe) vs has items (but no matches)
    if (comboResult.missingSlots.length > 0) {
      const trulyMissing = comboResult.missingSlots.filter(
        s => !wardrobeHasSlotCategory(s.slot, wardrobeCategoryCounts)
      );
      const hasItemsNoMatch = comboResult.missingSlots.filter(
        s => wardrobeHasSlotCategory(s.slot, wardrobeCategoryCounts)
      );

      // If any are truly missing, report that first (actionable: add items)
      if (trulyMissing.length > 0) {
        return {
          kind: 'missingCorePieces',
          missing: trulyMissing,
        };
      }

      // User has items in all required categories but none matched
      // Compute blocking (0 candidates) vs weak (has candidates but low quality)
      if (hasItemsNoMatch.length > 0) {
        const candidatesBySlot = comboResult.candidatesBySlot;
        
        // Blocking = slots with 0 candidates (from hasItemsNoMatch)
        const blockingCategories = hasItemsNoMatch.map(s => 
          SLOT_TO_DISPLAY_CATEGORY[s.slot] ?? s.category
        );
        
        // Weak = non-blocking required slots with weak quality
        const requiredSlots: OutfitSlot[] = candidatesBySlot?.DRESS?.length 
          ? ['DRESS', 'SHOES'] 
          : ['TOP', 'BOTTOM', 'SHOES'];
        const blockingSlots = new Set(hasItemsNoMatch.map(s => s.slot));
        
        const weakCategories: string[] = [];
        if (candidatesBySlot) {
          for (const slot of requiredSlots) {
            if (blockingSlots.has(slot)) continue; // Already blocking
            const candidates = candidatesBySlot[slot] ?? [];
            if (candidates.length === 0) continue;
            
            const quality = getSlotQuality(candidates);
            if (quality === 'weak') {
              weakCategories.push(SLOT_TO_DISPLAY_CATEGORY[slot] ?? slot.toLowerCase());
            }
          }
        }

        // Dev logging for threshold tuning
        if (__DEV__) {
          console.log('[useResultsTabs] hasItemsButNoMatches classification:', {
            blockingCategories,
            weakCategories,
            candidateDetails: candidatesBySlot ? Object.fromEntries(
              requiredSlots.map(slot => [
                slot,
                {
                  count: candidatesBySlot[slot]?.length ?? 0,
                  quality: getSlotQuality(candidatesBySlot[slot]),
                  bestScore: candidatesBySlot[slot]?.length 
                    ? Math.max(...candidatesBySlot[slot].map(c => c.score))
                    : null,
                }
              ])
            ) : null,
          });
        }

        return {
          kind: 'hasItemsButNoMatches',
          blockingCategories,
          weakCategories,
        };
      }
    }

    // Core pieces exist - check if any required slot lacks HIGH candidates
    // This is the common "shoes are only MEDIUM" case
    const candidatesBySlot = comboResult.candidatesBySlot;
    if (candidatesBySlot) {
      // Check each required slot for HIGH candidates
      const requiredSlots: OutfitSlot[] = candidatesBySlot.DRESS?.length > 0
        ? ['DRESS', 'SHOES'] // Dress track
        : ['TOP', 'BOTTOM', 'SHOES']; // Standard track
      
      const slotsWithoutHigh = requiredSlots.filter(slot => {
        const candidates = candidatesBySlot[slot] ?? [];
        return candidates.length > 0 && !candidates.some(c => c.tier === 'HIGH');
      });

      if (slotsWithoutHigh.length > 0) {
        // Map slots to { slot, category } format
        const slotToCategory: Record<string, string> = {
          SHOES: 'shoes',
          BOTTOM: 'bottoms',
          TOP: 'tops',
          DRESS: 'dresses',
        };
        
        return {
          kind: 'missingHighTierCorePieces',
          missing: slotsWithoutHigh.map(slot => ({
            slot,
            category: slotToCategory[slot] ?? slot.toLowerCase(),
          })),
        };
      }
    }

    // Has core pieces and all have HIGH candidates, but no combos formed
    // This is unexpected - dev warning
    if (__DEV__) {
      // Check if coherence filter explains the missing HIGH outfits
      const { preFilterHighCount, rejectedHighCount } = comboResult.debug;
      const explainedByCoherence = preFilterHighCount > 0 && rejectedHighCount === preFilterHighCount;

      if (!explainedByCoherence) {
        console.warn(
          '[useResultsTabs] Has HIGH candidates in all slots but no HIGH outfits - unexpected state',
          { 
            highMatchCount: highMatches.length,
            preFilterHighCount,
            rejectedHighCount,
            totalCombos: comboResult.combos.length,
            combosBreakdown: comboResult.combos.map(c => ({
              tierFloor: c.tierFloor,
              slots: c.candidates.map(cand => `${cand.slot}:${cand.tier}`).join(', ')
            }))
          }
        );
      } else {
        console.log(
          '[useResultsTabs] No HIGH outfits - explained by coherence filter',
          { preFilterHighCount, rejectedHighCount }
        );
      }
    }
    return { kind: 'hasCorePiecesButNoCombos' };
  }, [highOutfits.length, highMatches.length, comboResult.missingSlots, comboResult.candidatesBySlot, comboResult.debug, wardrobeCategoryCounts]);

  const nearOutfitEmptyReason = useMemo((): OutfitEmptyReasonDetails | null => {
    if (nearOutfits.length > 0) {
      return null; // Not empty
    }

    // Check if missing core pieces vs has items but no matches
    if (comboResult.missingSlots.length > 0) {
      const trulyMissing = comboResult.missingSlots.filter(
        s => !wardrobeHasSlotCategory(s.slot, wardrobeCategoryCounts)
      );
      const hasItemsNoMatch = comboResult.missingSlots.filter(
        s => wardrobeHasSlotCategory(s.slot, wardrobeCategoryCounts)
      );

      // If any are truly missing, report that first
      if (trulyMissing.length > 0) {
        return {
          kind: 'missingCorePieces',
          missing: trulyMissing,
        };
      }

      // User has items but none matched - compute blocking vs weak
      if (hasItemsNoMatch.length > 0) {
        const candidatesBySlot = comboResult.candidatesBySlot;
        
        // Blocking = slots with 0 candidates
        const blockingCategories = hasItemsNoMatch.map(s => 
          SLOT_TO_DISPLAY_CATEGORY[s.slot] ?? s.category
        );
        
        // Weak = non-blocking required slots with weak quality
        const requiredSlots: OutfitSlot[] = candidatesBySlot?.DRESS?.length 
          ? ['DRESS', 'SHOES'] 
          : ['TOP', 'BOTTOM', 'SHOES'];
        const blockingSlots = new Set(hasItemsNoMatch.map(s => s.slot));
        
        const weakCategories: string[] = [];
        if (candidatesBySlot) {
          for (const slot of requiredSlots) {
            if (blockingSlots.has(slot)) continue;
            const candidates = candidatesBySlot[slot] ?? [];
            if (candidates.length === 0) continue;
            
            const quality = getSlotQuality(candidates);
            if (quality === 'weak') {
              weakCategories.push(SLOT_TO_DISPLAY_CATEGORY[slot] ?? slot.toLowerCase());
            }
          }
        }

        return {
          kind: 'hasItemsButNoMatches',
          blockingCategories,
          weakCategories,
        };
      }
    }

    // Has core pieces but no NEAR combos
    if (nearMatches.length > 0) {
      // Check if NEAR outfits SHOULD be possible (pure inventory logic)
      const candidatesBySlot = comboResult.candidatesBySlot;
      
      if (__DEV__ && candidatesBySlot) {
        // Determine required slots
        const requiredSlots: OutfitSlot[] = candidatesBySlot.DRESS?.length > 0
          ? ['DRESS', 'SHOES']
          : ['TOP', 'BOTTOM', 'SHOES'];

        // Check if all required slots have at least one candidate
        const hasAllRequiredSlots = requiredSlots.every(slot => 
          (candidatesBySlot[slot] ?? []).length > 0
        );

        // Check if any required slot has a MEDIUM candidate
        const hasAnyMediumInRequiredSlots = requiredSlots.some(slot => 
          (candidatesBySlot[slot] ?? []).some(c => c.tier === 'MEDIUM')
        );

        // If true, there exists at least one combo whose tierFloor could be MEDIUM
        const canMakeNearOutfits = hasAllRequiredSlots && hasAnyMediumInRequiredSlots;

        // Only warn if NEAR outfits should be possible
        if (canMakeNearOutfits) {
          // Check if coherence filter explains the missing NEAR outfits
          const { preFilterNearCount, rejectedNearCount } = comboResult.debug;
          const explainedByCoherence = preFilterNearCount > 0 && rejectedNearCount === preFilterNearCount;

          if (!explainedByCoherence) {
            // Compute slot quality for debugging
            const slotQualities = requiredSlots.map(slot => {
              const candidates = candidatesBySlot[slot] ?? [];
              return {
                slot,
                quality: getSlotQuality(candidates),
                count: candidates.length,
                bestScore: candidates.length > 0 ? Math.max(...candidates.map(c => c.score)) : null,
              };
            });
            const blockingSlots = slotQualities.filter(s => s.quality === 'blocking').map(s => SLOT_TO_DISPLAY_CATEGORY[s.slot] ?? s.slot);
            const weakSlots = slotQualities.filter(s => s.quality === 'weak').map(s => SLOT_TO_DISPLAY_CATEGORY[s.slot] ?? s.slot);

            console.warn(
              '[useResultsTabs] Has NEAR matches but no NEAR outfits - unexpected state',
              { 
                nearMatchCount: nearMatches.length,
                canMakeNearOutfits,
                preFilterNearCount,
                rejectedNearCount,
                totalCombos: comboResult.combos.length,
                requiredSlots,
                slotQualities,
                blockingSlots,
                weakSlots,
              }
            );
          } else if (__DEV__) {
            console.log(
              '[useResultsTabs] No NEAR outfits - explained by coherence filter',
              { preFilterNearCount, rejectedNearCount }
            );
          }
        }
      }
      
      return { kind: 'hasCorePiecesButNoCombos' };
    }

    // Fallback: this shouldn't normally be reached since we handle missingSlots above
    // But if we get here with missingSlots, apply the same logic
    if (comboResult.missingSlots.length > 0) {
      const trulyMissing = comboResult.missingSlots.filter(
        s => !wardrobeHasSlotCategory(s.slot, wardrobeCategoryCounts)
      );
      if (trulyMissing.length > 0) {
        return { kind: 'missingCorePieces', missing: trulyMissing };
      }
      // Fallback hasItemsButNoMatches (blocking only, no weak info available)
      const blockingCategories = comboResult.missingSlots.map(s => 
        SLOT_TO_DISPLAY_CATEGORY[s.slot] ?? s.category
      );
      return { kind: 'hasItemsButNoMatches', blockingCategories, weakCategories: [] };
    }

    return { kind: 'hasCorePiecesButNoCombos' };
  }, [nearOutfits.length, nearMatches.length, comboResult.missingSlots, comboResult.candidatesBySlot, comboResult.debug, wardrobeCategoryCounts]);

  // ─────────────────────────────────────────────
  // Build missing message per tab
  // ─────────────────────────────────────────────

  const buildMissingMessage = useCallback(
    (emptyReason: OutfitEmptyReasonDetails | null): string | null => {
      if (emptyReason === null) {
        return null; // Outfits exist, no message needed
      }

      if (emptyReason.kind === 'hasCorePiecesButNoCombos') {
        return 'No outfit combinations found yet.';
      }

      if (emptyReason.kind === 'missingHighTierCorePieces') {
        // Use dynamic copy based on primary blocker
        const primaryBlocker = pickPrimaryMissingHigh(emptyReason.missing);
        if (primaryBlocker) {
          return generateMissingHighCopy(primaryBlocker.slot);
        }
        // Fallback (shouldn't happen)
        return 'Not quite "wear now" yet — but you have close options in Worth trying.';
      }

      // hasItemsButNoMatches - user has items but none match (blocking + weak)
      if (emptyReason.kind === 'hasItemsButNoMatches') {
        const { blockingCategories, weakCategories } = emptyReason;
        
        // Helper to format category list with OR (for "None of your X or Y")
        const formatOrList = (cats: string[]): string => {
          if (cats.length === 1) return cats[0];
          if (cats.length === 2) return `${cats[0]} or ${cats[1]}`;
          return `${cats.slice(0, -1).join(', ')}, or ${cats[cats.length - 1]}`;
        };

        // Helper to format category list with AND (for "X and Y are close")
        const formatAndList = (cats: string[]): string => {
          if (cats.length === 1) return cats[0];
          if (cats.length === 2) return `${cats[0]} and ${cats[1]}`;
          return `${cats.slice(0, -1).join(', ')}, and ${cats[cats.length - 1]}`;
        };

        // Helper to capitalize first letter
        const capitalizeFirst = (str: string): string => 
          str.charAt(0).toUpperCase() + str.slice(1);

        // Case A: blocking only (no weak)
        if (blockingCategories.length > 0 && weakCategories.length === 0) {
          return `None of your ${formatOrList(blockingCategories)} match this item's style.`;
        }
        
        // Case B: blocking + weak - concise, truthy copy
        // Use OR list for "None of your...", AND list for "are close" / "are what's blocking"
        if (blockingCategories.length > 0 && weakCategories.length > 0) {
          const weakAndLabel = capitalizeFirst(formatAndList(weakCategories));
          const blockingOrLabel = formatOrList(blockingCategories);
          const blockingAndLabel = formatAndList(blockingCategories);
          return `None of your ${blockingOrLabel} match this item's style. ${weakAndLabel} are close, but ${blockingAndLabel} are what's blocking outfits.`;
        }

        // Case C: only weak (no blockers) - shouldn't reach empty state, but handle gracefully
        if (weakCategories.length > 0) {
          return `Only close matches found for ${formatOrList(weakCategories)}.`;
        }

        return null;
      }

      // missingCorePieces - user doesn't have items in this category
      const categories = emptyReason.missing.map((s) => s.category);
      if (categories.length === 0) {
        return null;
      }

      if (categories.length === 1) {
        return `Add ${categories[0]} to put complete outfits together from these matches.`;
      }

      const last = categories[categories.length - 1];
      const rest = categories.slice(0, -1);
      return `Add ${rest.join(', ')} and ${last} to put complete outfits together.`;
    },
    []
  );

  // ─────────────────────────────────────────────
  // Tab content objects
  // ─────────────────────────────────────────────

  const highTab: TabContent = useMemo(
    () => ({
      matches: highMatches,
      nearMatches: [], // HIGH tab doesn't use near matches for bullets
      outfits: highOutfits,
      outfitEmptyReason: highOutfitEmptyReason,
      missingMessage: buildMissingMessage(highOutfitEmptyReason),
    }),
    [highMatches, highOutfits, highOutfitEmptyReason, buildMissingMessage]
  );

  const nearTab: TabContent = useMemo(
    () => ({
      matches: [], // NEAR tab shows near matches differently
      nearMatches,
      outfits: diversifiedNearOutfits, // Use diversity-selected outfits
      outfitEmptyReason: nearOutfitEmptyReason,
      missingMessage: buildMissingMessage(nearOutfitEmptyReason),
    }),
    [nearMatches, diversifiedNearOutfits, nearOutfitEmptyReason, buildMissingMessage]
  );

  // ─────────────────────────────────────────────
  // Active tab state with persistence
  // ─────────────────────────────────────────────

  // Compute default tab
  const defaultTab: ResultsTab = showHigh ? 'high' : 'near';

  // Get initial tab from storage or default
  const getInitialTab = useCallback((): ResultsTab => {
    if (!scanId) return defaultTab;

    const stored = getStoredTab(scanId);
    if (stored) {
      // Validate stored tab is still valid
      if (stored === 'high' && showHigh) return 'high';
      if (stored === 'near' && showNear) return 'near';
    }

    return defaultTab;
  }, [scanId, defaultTab, showHigh, showNear]);

  const [activeTab, setActiveTabInternal] = useState<ResultsTab>(getInitialTab);

  // Reset tab on scan change
  useEffect(() => {
    if (!scanId) return;

    const stored = getStoredTab(scanId);
    if (!stored) {
      // New scan - reset to default
      const newDefault = showHigh ? 'high' : 'near';
      setActiveTabInternal(newDefault);
    }
  }, [scanId, showHigh]);

  // Wrap setActiveTab to persist
  const setActiveTab = useCallback(
    (tab: ResultsTab) => {
      setActiveTabInternal(tab);
      if (scanId) {
        storeTab(scanId, tab);
      }
    },
    [scanId]
  );

  // Ensure active tab is valid
  useEffect(() => {
    if (activeTab === 'high' && !showHigh && showNear) {
      setActiveTab('near');
    } else if (activeTab === 'near' && !showNear && showHigh) {
      setActiveTab('high');
    }
  }, [activeTab, showHigh, showNear, setActiveTab]);

  // ─────────────────────────────────────────────
  // Derived helpers
  // ─────────────────────────────────────────────

  const activeTabContent = activeTab === 'high' ? highTab : nearTab;

  // ─────────────────────────────────────────────
  // Display cap logic
  // ─────────────────────────────────────────────
  // Single visible tab: max 5 outfits
  // Both tabs visible: max 3 outfits per tab
  const maxOutfitsPerTab = showTabs ? 3 : 5;

  // ─────────────────────────────────────────────
  // Return state
  // ─────────────────────────────────────────────

  return {
    // Tab visibility
    showHigh,
    showNear,
    showTabs,
    showEmptyState,

    // Active tab
    activeTab,
    setActiveTab,

    // Tab content
    highTab,
    nearTab,

    // Display caps
    maxOutfitsPerTab,

    // Derived
    activeTabContent,
    highMatchCount: highMatches.length,
    nearMatchCount: nearMatches.length,
    highOutfitCount: highOutfits.length,
    nearOutfitCount: nearOutfits.length,
  };
}

// ============================================
// HELPER: __DEV__ fallback
// ============================================

declare const __DEV__: boolean;

