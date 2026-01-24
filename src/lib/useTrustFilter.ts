/**
 * Trust Filter Hook
 *
 * Applies Trust Filter to Confidence Engine results.
 * Filters HIGH matches into: highFinal, demoted, hidden.
 *
 * Usage:
 *   const ceResult = useConfidenceEngine(scannedItem, wardrobe);
 *   const tfResult = useTrustFilter(ceResult, scannedItem, wardrobe);
 *
 *   // Use tfResult.matches instead of ceResult.matches for filtered HIGH
 *   // Use tfResult.demotedMatches to add to NEAR tab
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ConfidenceEngineResult, EnrichedMatch } from './useConfidenceEngine';
import type { ScannedItem, WardrobeItem, Category } from './types';
import type { StyleSignalsV1 } from './trust-filter/types';
import {
  isTrustFilterEnabled,
  isTrustFilterTraceEnabled,
  isStyleSignalsEnabled,
  isLazyEnrichmentEnabled,
} from './feature-flags';
import {
  evaluateTrustFilterBatch,
  type TrustFilterBatchResult,
  type TFCategory,
} from './trust-filter';
import {
  fetchScanStyleSignals,
  fetchWardrobeStyleSignalsBatch,
  getItemsNeedingEnrichment,
  enqueueWardrobeEnrichmentBatch,
  generateScanStyleSignals,
} from './style-signals-service';

// ============================================
// TYPES
// ============================================

export interface TrustFilterResult {
  /** HIGH matches that passed Trust Filter (keep in "Wear now") */
  matches: EnrichedMatch[];

  /** HIGH matches demoted by Trust Filter (move to "Worth trying") */
  demotedMatches: EnrichedMatch[];

  /** Count of hidden matches (for telemetry only) */
  hiddenCount: number;

  /** Whether Trust Filter was applied */
  wasApplied: boolean;

  /** Whether signals are still loading */
  isLoading: boolean;

  /** Style signals for the scanned item (if available) */
  scanSignals: StyleSignalsV1 | null;

  /** Debug stats (only when trace enabled) */
  stats?: {
    totalEvaluated: number;
    hiddenCount: number;
    demotedCount: number;
    skippedCount: number;
  };
}

// ============================================
// CATEGORY MAPPING
// ============================================

function mapCategory(category: Category | string): TFCategory {
  const validCategories: TFCategory[] = [
    'tops', 'bottoms', 'skirts', 'dresses', 'shoes', 'outerwear', 'bags', 'accessories'
  ];

  if (validCategories.includes(category as TFCategory)) {
    return category as TFCategory;
  }

  return 'tops'; // Default fallback
}

// ============================================
// MAIN HOOK
// ============================================

/**
 * Apply Trust Filter to Confidence Engine results.
 *
 * @param confidenceResult - Result from useConfidenceEngine
 * @param scannedItem - The scanned item (for fetching style signals)
 * @param wardrobeItems - Wardrobe items (for fetching style signals)
 * @param scanId - Scan ID (for fetching cached signals from DB)
 */
export function useTrustFilter(
  confidenceResult: ConfidenceEngineResult,
  scannedItem: ScannedItem | null,
  wardrobeItems: WardrobeItem[],
  scanId: string | null
): TrustFilterResult {
  // State for style signals
  const [scanSignals, setScanSignals] = useState<StyleSignalsV1 | null>(null);
  const [wardrobeSignals, setWardrobeSignals] = useState<Map<string, StyleSignalsV1>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [signalsFetched, setSignalsFetched] = useState(false);

  // Get matched wardrobe item IDs
  const matchedItemIds = useMemo(() => {
    return confidenceResult.matches.map(m => m.wardrobeItem.id);
  }, [confidenceResult.matches]);

  // Fetch style signals when Trust Filter is enabled
  useEffect(() => {
    // Skip if Trust Filter is disabled
    if (!isTrustFilterEnabled()) {
      return;
    }

    // Skip if no matches to filter
    if (confidenceResult.matches.length === 0) {
      return;
    }

    // Skip if already fetched for this scan
    if (signalsFetched && scanId) {
      return;
    }

    const fetchSignals = async () => {
      setIsLoading(true);

      try {
        // Fetch scan signals (from DB cache or generate)
        let fetchedScanSignals: StyleSignalsV1 | null = null;

        if (scanId) {
          // Try to fetch from DB first
          fetchedScanSignals = await fetchScanStyleSignals(scanId);

          // If not cached and style signals are enabled, generate
          if (!fetchedScanSignals && isStyleSignalsEnabled()) {
            if (__DEV__) {
              console.log('[useTrustFilter] Generating scan style signals...');
            }
            const response = await generateScanStyleSignals(scanId);
            if (response.ok && response.data) {
              fetchedScanSignals = response.data;
            }
          }
        }

        setScanSignals(fetchedScanSignals);

        // Fetch wardrobe signals for matched items
        if (matchedItemIds.length > 0) {
          const fetchedWardrobeSignals = await fetchWardrobeStyleSignalsBatch(matchedItemIds);
          setWardrobeSignals(fetchedWardrobeSignals);

          // Enqueue enrichment for items without signals
          if (isLazyEnrichmentEnabled()) {
            const needsEnrichment = await getItemsNeedingEnrichment(matchedItemIds);
            if (needsEnrichment.length > 0) {
              if (__DEV__) {
                console.log('[useTrustFilter] Enqueueing enrichment for:', needsEnrichment.length, 'items');
              }
              enqueueWardrobeEnrichmentBatch(needsEnrichment);
            }
          }
        }

        setSignalsFetched(true);
      } catch (error) {
        console.error('[useTrustFilter] Error fetching signals:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSignals();
  }, [scanId, matchedItemIds, confidenceResult.matches.length, signalsFetched]);

  // Reset when scan changes
  useEffect(() => {
    setScanSignals(null);
    setWardrobeSignals(new Map());
    setSignalsFetched(false);
  }, [scanId]);

  // Apply Trust Filter
  const result = useMemo((): TrustFilterResult => {
    const matches = confidenceResult.matches;

    // If Trust Filter is disabled, return original matches
    if (!isTrustFilterEnabled()) {
      return {
        matches,
        demotedMatches: [],
        hiddenCount: 0,
        wasApplied: false,
        isLoading: false,
        scanSignals: null,
      };
    }

    // If no matches, nothing to filter
    if (matches.length === 0) {
      return {
        matches: [],
        demotedMatches: [],
        hiddenCount: 0,
        wasApplied: true,
        isLoading,
        scanSignals,
      };
    }

    // If still loading, return original matches temporarily
    if (isLoading) {
      return {
        matches,
        demotedMatches: [],
        hiddenCount: 0,
        wasApplied: false,
        isLoading: true,
        scanSignals: null,
      };
    }

    const enableTrace = isTrustFilterTraceEnabled();
    const scanCategory = scannedItem?.category ?? 'tops';

    // Prepare batch input for Trust Filter
    const batchMatches = matches.map(m => ({
      id: m.wardrobeItem.id,
      signals: wardrobeSignals.get(m.wardrobeItem.id) ?? null,
      category: mapCategory(m.wardrobeItem.category),
      ceScore: m.evaluation.raw_score,
    }));

    // Run Trust Filter batch evaluation
    const batchResult = evaluateTrustFilterBatch({
      scanSignals,
      scanCategory: mapCategory(scanCategory),
      matches: batchMatches,
      enableTrace,
    });

    // Create lookup from match ID to EnrichedMatch
    const matchMap = new Map<string, EnrichedMatch>();
    for (const match of matches) {
      matchMap.set(match.wardrobeItem.id, match);
    }

    // Split matches into keep/demoted/hidden
    const highFinal: EnrichedMatch[] = [];
    const demoted: EnrichedMatch[] = [];
    let hiddenCount = 0;

    for (const id of batchResult.highFinal) {
      const match = matchMap.get(id);
      if (match) highFinal.push(match);
    }

    for (const id of batchResult.demoted) {
      const match = matchMap.get(id);
      if (match) demoted.push(match);
    }

    hiddenCount = batchResult.hidden.length;

    // Log in development
    if (__DEV__) {
      console.log('[useTrustFilter] Applied:', {
        originalMatches: matches.length,
        highFinal: highFinal.length,
        demoted: demoted.length,
        hidden: hiddenCount,
        hasScanSignals: !!scanSignals,
        wardrobeSignalsCount: wardrobeSignals.size,
      });

      if (enableTrace && batchResult.decisions.size > 0) {
        console.log('[useTrustFilter] Decisions:', Object.fromEntries(batchResult.decisions));
      }
    }

    return {
      matches: highFinal,
      demotedMatches: demoted,
      hiddenCount,
      wasApplied: true,
      isLoading: false,
      scanSignals,
      stats: enableTrace ? {
        totalEvaluated: batchResult.stats.totalEvaluated,
        hiddenCount: batchResult.stats.hiddenCount,
        demotedCount: batchResult.stats.demotedCount,
        skippedCount: batchResult.stats.skippedCount,
      } : undefined,
    };
  }, [confidenceResult.matches, scanSignals, wardrobeSignals, scannedItem?.category, isLoading]);

  return result;
}

// ============================================
// __DEV__ DECLARATION
// ============================================

declare const __DEV__: boolean;
