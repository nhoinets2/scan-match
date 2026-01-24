/**
 * Trust Filter Integration
 *
 * Integrates Trust Filter v1 with the Confidence Engine results.
 * Applies post-CE filtering to HIGH matches using style signals.
 */

import {
  evaluateTrustFilterBatch,
  type TrustFilterBatchResult,
  type StyleSignalsV1,
  type TFCategory,
} from './trust-filter';
import {
  isTrustFilterEnabled,
  isTrustFilterTraceEnabled,
  isLazyEnrichmentEnabled,
} from './feature-flags';
import {
  fetchWardrobeStyleSignalsBatch,
  getItemsNeedingEnrichment,
  enqueueWardrobeEnrichmentBatch,
} from './style-signals-service';
import type { EnrichedMatch } from './useConfidenceEngine';
import type { WardrobeItem, Category } from './types';

// ============================================
// TYPES
// ============================================

export interface TrustFilterIntegrationResult {
  /** Matches that passed Trust Filter (keep in HIGH) */
  highFinal: EnrichedMatch[];

  /** Matches demoted by Trust Filter (move to Worth Trying) */
  demoted: EnrichedMatch[];

  /** Matches hidden by Trust Filter (remove completely) */
  hidden: EnrichedMatch[];

  /** Trust Filter statistics */
  stats: {
    wasApplied: boolean;
    totalEvaluated: number;
    hiddenCount: number;
    demotedCount: number;
    skippedCount: number;
  };

  /** Raw batch result for debugging */
  rawResult?: TrustFilterBatchResult;
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

  // Default fallback for unknown categories
  return 'tops';
}

// ============================================
// MAIN INTEGRATION FUNCTION
// ============================================

/**
 * Apply Trust Filter to HIGH matches from Confidence Engine.
 *
 * @param scanSignals - Style signals for the scanned item (null if not available)
 * @param scanCategory - Category of the scanned item
 * @param matches - HIGH confidence matches from CE
 * @param wardrobeItems - Full wardrobe items list (for fetching signals)
 * @returns Filtered matches split into highFinal, demoted, and hidden
 */
export async function applyTrustFilter(
  scanSignals: StyleSignalsV1 | null,
  scanCategory: Category | string,
  matches: EnrichedMatch[],
  wardrobeItems: WardrobeItem[]
): Promise<TrustFilterIntegrationResult> {
  // If Trust Filter is disabled, return all matches as HIGH
  if (!isTrustFilterEnabled()) {
    return {
      highFinal: matches,
      demoted: [],
      hidden: [],
      stats: {
        wasApplied: false,
        totalEvaluated: 0,
        hiddenCount: 0,
        demotedCount: 0,
        skippedCount: 0,
      },
    };
  }

  // If no matches, nothing to filter
  if (matches.length === 0) {
    return {
      highFinal: [],
      demoted: [],
      hidden: [],
      stats: {
        wasApplied: true,
        totalEvaluated: 0,
        hiddenCount: 0,
        demotedCount: 0,
        skippedCount: 0,
      },
    };
  }

  const enableTrace = isTrustFilterTraceEnabled();

  // Create lookup for wardrobe items
  const wardrobeMap = new Map<string, WardrobeItem>();
  for (const item of wardrobeItems) {
    wardrobeMap.set(item.id, item);
  }

  // Get wardrobe item IDs from matches
  const matchedItemIds = matches.map((m) => m.wardrobeItem.id);

  // Fetch style signals for matched wardrobe items
  const wardrobeSignals = await fetchWardrobeStyleSignalsBatch(matchedItemIds);

  // Check which items need enrichment and enqueue if lazy enrichment is enabled
  if (isLazyEnrichmentEnabled()) {
    const needsEnrichment = await getItemsNeedingEnrichment(matchedItemIds);
    if (needsEnrichment.length > 0) {
      enqueueWardrobeEnrichmentBatch(needsEnrichment);
    }
  }

  // Prepare batch input for Trust Filter
  const batchMatches = matches.map((m) => ({
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

  // Split matches into highFinal, demoted, and hidden
  const highFinal: EnrichedMatch[] = [];
  const demoted: EnrichedMatch[] = [];
  const hidden: EnrichedMatch[] = [];

  for (const id of batchResult.highFinal) {
    const match = matchMap.get(id);
    if (match) highFinal.push(match);
  }

  for (const id of batchResult.demoted) {
    const match = matchMap.get(id);
    if (match) demoted.push(match);
  }

  for (const id of batchResult.hidden) {
    const match = matchMap.get(id);
    if (match) hidden.push(match);
  }

  // Log telemetry in development
  if (__DEV__) {
    console.log('[TrustFilter] Applied:', {
      totalMatches: matches.length,
      highFinal: highFinal.length,
      demoted: demoted.length,
      hidden: hidden.length,
      stats: batchResult.stats,
    });

    if (enableTrace && batchResult.decisions.size > 0) {
      console.log('[TrustFilter] Decisions:', Object.fromEntries(batchResult.decisions));
    }
  }

  return {
    highFinal,
    demoted,
    hidden,
    stats: {
      wasApplied: true,
      totalEvaluated: batchResult.stats.totalEvaluated,
      hiddenCount: batchResult.stats.hiddenCount,
      demotedCount: batchResult.stats.demotedCount,
      skippedCount: batchResult.stats.skippedCount,
    },
    rawResult: enableTrace ? batchResult : undefined,
  };
}

// ============================================
// SYNCHRONOUS VERSION (NO ASYNC SIGNAL FETCH)
// ============================================

/**
 * Apply Trust Filter synchronously using pre-fetched signals.
 * Use this when signals are already loaded.
 *
 * @param scanSignals - Style signals for the scanned item
 * @param scanCategory - Category of the scanned item
 * @param matches - HIGH confidence matches from CE
 * @param signalsMap - Pre-fetched wardrobe signals map (itemId -> signals)
 * @returns Filtered matches
 */
export function applyTrustFilterSync(
  scanSignals: StyleSignalsV1 | null,
  scanCategory: Category | string,
  matches: EnrichedMatch[],
  signalsMap: Map<string, StyleSignalsV1>
): TrustFilterIntegrationResult {
  // If Trust Filter is disabled, return all matches as HIGH
  if (!isTrustFilterEnabled()) {
    return {
      highFinal: matches,
      demoted: [],
      hidden: [],
      stats: {
        wasApplied: false,
        totalEvaluated: 0,
        hiddenCount: 0,
        demotedCount: 0,
        skippedCount: 0,
      },
    };
  }

  if (matches.length === 0) {
    return {
      highFinal: [],
      demoted: [],
      hidden: [],
      stats: {
        wasApplied: true,
        totalEvaluated: 0,
        hiddenCount: 0,
        demotedCount: 0,
        skippedCount: 0,
      },
    };
  }

  const enableTrace = isTrustFilterTraceEnabled();

  // Prepare batch input
  const batchMatches = matches.map((m) => ({
    id: m.wardrobeItem.id,
    signals: signalsMap.get(m.wardrobeItem.id) ?? null,
    category: mapCategory(m.wardrobeItem.category),
    ceScore: m.evaluation.raw_score,
  }));

  // Run Trust Filter
  const batchResult = evaluateTrustFilterBatch({
    scanSignals,
    scanCategory: mapCategory(scanCategory),
    matches: batchMatches,
    enableTrace,
  });

  // Create lookup
  const matchMap = new Map<string, EnrichedMatch>();
  for (const match of matches) {
    matchMap.set(match.wardrobeItem.id, match);
  }

  // Split matches
  const highFinal = batchResult.highFinal
    .map((id) => matchMap.get(id))
    .filter((m): m is EnrichedMatch => m !== undefined);

  const demoted = batchResult.demoted
    .map((id) => matchMap.get(id))
    .filter((m): m is EnrichedMatch => m !== undefined);

  const hidden = batchResult.hidden
    .map((id) => matchMap.get(id))
    .filter((m): m is EnrichedMatch => m !== undefined);

  return {
    highFinal,
    demoted,
    hidden,
    stats: {
      wasApplied: true,
      totalEvaluated: batchResult.stats.totalEvaluated,
      hiddenCount: batchResult.stats.hiddenCount,
      demotedCount: batchResult.stats.demotedCount,
      skippedCount: batchResult.stats.skippedCount,
    },
    rawResult: enableTrace ? batchResult : undefined,
  };
}

// ============================================
// __DEV__ DECLARATION
// ============================================

declare const __DEV__: boolean;
