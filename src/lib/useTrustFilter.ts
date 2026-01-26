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

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { ConfidenceEngineResult, EnrichedMatch } from './useConfidenceEngine';
import type { ScannedItem, WardrobeItem, Category } from './types';
import type { PairEvaluation } from './confidence-engine';
import type { StyleSignalsV1 } from './trust-filter/types';
import {
  isTrustFilterEnabled,
  isTrustFilterTraceEnabled,
  isStyleSignalsEnabled,
  isLazyEnrichmentEnabled,
  isAiSafetyEnabled,
  isAiSafetyDryRun,
  getAiSafetyRolloutPct,
} from './feature-flags';
import {
  aiSafetyCheckBatch,
  shouldRunAiSafety,
  inRollout,
  computePairType,
  type AiSafetyVerdict,
} from './ai-safety';
import {
  evaluateTrustFilterBatch,
  type TrustFilterBatchResult,
  type TFCategory,
  type ArchetypeDistance,
} from './trust-filter';
import {
  fetchScanStyleSignals,
  fetchWardrobeStyleSignalsBatch,
  getItemsNeedingEnrichment,
  enqueueWardrobeEnrichmentBatch,
  generateScanStyleSignals,
  generateScanStyleSignalsDirect,
} from './style-signals-service';
import {
  trackTrustFilterStarted,
  trackTrustFilterCompleted,
  trackTrustFilterPairDecision,
  trackTrustFilterError,
} from './analytics';

// ============================================
// TYPES
// ============================================

/** Final action for a match after all filtering */
export type FinalMatchAction = 'keep' | 'demote' | 'hide';

/**
 * Final tier for a match after all filtering.
 * 
 * Tier mapping:
 *   CE HIGH → final HIGH (if TF/AI keeps it)
 *   CE HIGH → final NEAR (if TF/AI demotes it)
 *   CE MEDIUM → final NEAR
 *   TF/AI hide → final HIDDEN
 * 
 * Note: CE uses 'MEDIUM', final uses 'NEAR' for clarity that it's "Worth trying" tab.
 */
export type FinalMatchTier = 'HIGH' | 'NEAR' | 'HIDDEN';

/**
 * Metadata about the finalization process.
 * 
 * AI Safety Merge Precedence (when apply-mode is enabled):
 *   - AI hide always wins (even if TF kept)
 *   - AI demote wins unless TF hid (hide wins)
 *   - AI keep never upgrades anything (never undo TF demote)
 * 
 * The merge is monotonic: it can only reduce confidence.
 */
export interface FinalizedMatchesMeta {
  /** Count of items demoted by Trust Filter */
  tfDemotedCount: number;
  /** Count of items hidden by Trust Filter */
  tfHiddenCount: number;
  /** Count of items demoted by AI Safety (0 in dry_run mode) */
  aiDemotedCount: number;
  /** Count of items hidden by AI Safety (0 in dry_run mode) */
  aiHiddenCount: number;
  /** Whether AI Safety ran in dry_run mode */
  aiDryRun: boolean;
  /** Whether Trust Filter was applied */
  tfApplied: boolean;
  /** Whether signals are still loading */
  isLoading: boolean;
}

/**
 * Finalized matches after Trust Filter + AI Safety.
 * This is the single source of truth for match display and outfit assembly.
 * 
 * NOTE: `hidden` is never rendered; only for telemetry/debug.
 */
export interface FinalizedMatches {
  /** HIGH matches after all filtering (use for "Wear now" tab) */
  highFinal: EnrichedMatch[];
  
  /** NEAR matches: CE MEDIUM + TF-demoted + AI-demoted (use for "Worth trying" tab) */
  nearFinal: EnrichedMatch[];
  
  /** Hidden matches: TF-hidden + AI-hidden (telemetry only, never rendered) */
  hidden: EnrichedMatch[];
  
  /** Metadata about the finalization process */
  meta: FinalizedMatchesMeta;
  
  /** Lookup: itemId → final action */
  actionById: Map<string, FinalMatchAction>;
  
  /** Lookup: itemId → final tier */
  finalTierById: Map<string, FinalMatchTier>;
  
  /** Style signals for the scanned item */
  scanSignals: StyleSignalsV1 | null;
  
  /**
   * @deprecated Transitional adapter - use highFinal/nearFinal directly.
   * Maps to the old {matches, demotedMatches} shape for backwards compatibility.
   */
  effectiveEvaluations: {
    matches: EnrichedMatch[];
    demotedMatches: EnrichedMatch[];
  };
}

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
  
  /**
   * Finalized matches after Trust Filter + AI Safety.
   * This is the primary output - use this for display and outfit assembly.
   */
  finalized: FinalizedMatches;

  /** @internal Batch result for AI Safety integration */
  _batchResult?: TrustFilterBatchResult;
  
  /** @internal Wardrobe signals map for AI Safety integration */
  _wardrobeSignals?: Map<string, StyleSignalsV1>;
}

// ============================================
// EFFECTIVE EVALUATION HELPER
// ============================================

/**
 * Get the effective evaluation for a match, with tier adjusted based on final tier.
 * 
 * This is the centralized place for tier conversion:
 *   - NEAR final tier → confidence_tier: 'MEDIUM' (demoted items)
 *   - HIGH final tier → confidence_tier preserved
 *   - HIDDEN final tier → confidence_tier preserved (but should never be used in display)
 * 
 * Use this helper when you need tier-correct evaluations for scoring, tips, etc.
 */
export function effectiveEvaluation(
  match: EnrichedMatch,
  finalTier: FinalMatchTier
): PairEvaluation {
  if (finalTier === 'NEAR') {
    return { ...match.evaluation, confidence_tier: 'MEDIUM' };
  }
  return match.evaluation;
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
 * @param userId - User ID (optional, for AI Safety rollout bucketing)
 */
export function useTrustFilter(
  confidenceResult: ConfidenceEngineResult,
  scannedItem: ScannedItem | null,
  wardrobeItems: WardrobeItem[],
  scanId: string | null,
  userId?: string | null
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

        // Get the scan's image URI
        const scanImageUri = scannedItem?.imageUri || '';
        const isLocalImage = scanImageUri.startsWith('file://');

        // DEBUG: Log image URI detection (key for diagnosing direct generation path)
        if (__DEV__) {
          console.log('[TF] Image:', isLocalImage ? 'LOCAL' : (scanImageUri ? 'CLOUD' : 'EMPTY'), 
            scanImageUri ? `(${scanImageUri.substring(0, 40)}...)` : '');
        }

        if (scanId) {
          // Try to fetch from DB first
          fetchedScanSignals = await fetchScanStyleSignals(scanId);

          // If not cached and style signals are enabled, generate
          if (!fetchedScanSignals && isStyleSignalsEnabled()) {
            if (isLocalImage && scanImageUri) {
              // For local images (unsaved scans), use direct generation with base64
              const response = await generateScanStyleSignalsDirect(scanImageUri);
              if (__DEV__) {
                console.log('[TF] Direct generation:', response.ok ? 'SUCCESS' : `FAILED (${response.error?.kind})`);
              }
              if (response.ok && response.data) {
                fetchedScanSignals = response.data;
              }
            } else {
              // For cloud images (saved scans), use server-side generation
              const response = await generateScanStyleSignals(scanId);
              if (__DEV__) {
                console.log('[TF] Server generation:', response.ok ? 'SUCCESS' : `FAILED (${response.error?.kind})`);
              }
              if (response.ok && response.data) {
                fetchedScanSignals = response.data;
              }
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
  }, [scanId, matchedItemIds, confidenceResult.matches.length, signalsFetched, scannedItem?.imageUri]);

  // Reset when scan changes
  useEffect(() => {
    setScanSignals(null);
    setWardrobeSignals(new Map());
    setSignalsFetched(false);
  }, [scanId]);

  // Track if we've already sent telemetry for this evaluation
  const telemetrySentRef = useRef<string | null>(null);

  // Track if AI Safety has been called for this scan
  const aiSafetyCalledRef = useRef<string | null>(null);

  // State for AI Safety results (dry_run mode logging)
  const [aiSafetyResult, setAiSafetyResult] = useState<{
    verdicts: AiSafetyVerdict[];
    dryRun: boolean;
    stats: { cacheHits: number; aiCalls: number; totalLatencyMs: number };
  } | null>(null);

  // Apply Trust Filter
  const result = useMemo((): TrustFilterResult => {
    const matches = confidenceResult.matches;
    const startTime = Date.now();

    // Helper to build finalized for early returns
    const buildEarlyFinalized = (
      highFinal: EnrichedMatch[],
      nearFinal: EnrichedMatch[],
      tfApplied: boolean,
      loading: boolean,
      signals: StyleSignalsV1 | null
    ): FinalizedMatches => {
      const actionById = new Map<string, FinalMatchAction>();
      const finalTierById = new Map<string, FinalMatchTier>();
      
      for (const match of highFinal) {
        actionById.set(match.wardrobeItem.id, 'keep');
        finalTierById.set(match.wardrobeItem.id, 'HIGH');
      }
      for (const match of nearFinal) {
        actionById.set(match.wardrobeItem.id, 'keep');
        finalTierById.set(match.wardrobeItem.id, 'NEAR');
      }
      
      return {
        highFinal,
        nearFinal,
        hidden: [],
        meta: {
          tfDemotedCount: 0,
          tfHiddenCount: 0,
          aiDemotedCount: 0,
          aiHiddenCount: 0,
          aiDryRun: true,
          tfApplied,
          isLoading: loading,
        },
        actionById,
        finalTierById,
        scanSignals: signals,
        effectiveEvaluations: {
          matches: highFinal,
          demotedMatches: [],
        },
      };
    };

    // Build wardrobe lookup for converting PairEvaluation to EnrichedMatch
    const wardrobeMap = new Map<string, WardrobeItem>();
    for (const item of wardrobeItems) {
      wardrobeMap.set(item.id, item);
    }

    // Helper to convert CE MEDIUM matches to EnrichedMatch array
    const convertCeNearMatches = (): EnrichedMatch[] => {
      const ceNearMatches = confidenceResult.rawEvaluation?.near_matches ?? [];
      const result: EnrichedMatch[] = [];
      for (const evaluation of ceNearMatches) {
        const wardrobeItem = wardrobeMap.get(evaluation.item_b_id);
        if (wardrobeItem) {
          result.push({
            evaluation,
            wardrobeItem,
            explanation: null,
            explanationAllowed: false,
          });
        }
      }
      return result;
    };

    // If Trust Filter is disabled, return original matches
    if (!isTrustFilterEnabled()) {
      const nearFromCE = convertCeNearMatches();
      const finalized = buildEarlyFinalized(matches, nearFromCE, false, false, null);
      return {
        matches,
        demotedMatches: [],
        hiddenCount: 0,
        wasApplied: false,
        isLoading: false,
        scanSignals: null,
        finalized,
      };
    }

    // If no matches, nothing to filter
    if (matches.length === 0) {
      const nearFromCE = convertCeNearMatches();
      const finalized = buildEarlyFinalized([], nearFromCE, true, isLoading, scanSignals);
      return {
        matches: [],
        demotedMatches: [],
        hiddenCount: 0,
        wasApplied: true,
        isLoading,
        scanSignals,
        finalized,
      };
    }

    // If still loading, return original matches temporarily
    if (isLoading) {
      const nearFromCE = convertCeNearMatches();
      const finalized = buildEarlyFinalized(matches, nearFromCE, false, true, null);
      return {
        matches,
        demotedMatches: [],
        hiddenCount: 0,
        wasApplied: false,
        isLoading: true,
        scanSignals: null,
        finalized,
      };
    }

    const enableTrace = isTrustFilterTraceEnabled();
    const scanCategory = scannedItem?.category ?? 'tops';

    // Telemetry: Track start (only once per scan)
    const telemetryKey = `${scanId}-${matches.length}-${wardrobeSignals.size}`;
    if (scanId && telemetrySentRef.current !== telemetryKey) {
      trackTrustFilterStarted({
        scanId,
        scanCategory,
        highMatchCount: matches.length,
        hasScanSignals: !!scanSignals,
      });
    }

    // Prepare batch input for Trust Filter
    const batchMatches = matches.map(m => ({
      id: m.wardrobeItem.id,
      signals: wardrobeSignals.get(m.wardrobeItem.id) ?? null,
      category: mapCategory(m.wardrobeItem.category),
      ceScore: m.evaluation.raw_score,
    }));

    let batchResult: TrustFilterBatchResult;
    try {
      // Run Trust Filter batch evaluation
      batchResult = evaluateTrustFilterBatch({
        scanSignals,
        scanCategory: mapCategory(scanCategory),
        matches: batchMatches,
        enableTrace,
      });
    } catch (error) {
      // Telemetry: Track error
      if (scanId) {
        trackTrustFilterError({
          scanId,
          errorType: 'evaluation_error',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      // On error, return original matches
      const nearFromCE = convertCeNearMatches();
      const finalized = buildEarlyFinalized(matches, nearFromCE, false, false, scanSignals);
      return {
        matches,
        demotedMatches: [],
        hiddenCount: 0,
        wasApplied: false,
        isLoading: false,
        scanSignals,
        finalized,
      };
    }

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

    // Telemetry: Track completion and pair decisions (only once per scan)
    if (scanId && telemetrySentRef.current !== telemetryKey) {
      const durationMs = Date.now() - startTime;

      // Track completion
      trackTrustFilterCompleted({
        scanId,
        scanCategory,
        originalHighCount: matches.length,
        finalHighCount: highFinal.length,
        demotedCount: demoted.length,
        hiddenCount,
        skippedCount: batchResult.stats.skippedCount,
        durationMs,
      });

      // Track individual pair decisions (sampled at 5% in analytics.ts)
      for (const [matchId, decision] of batchResult.decisions) {
        // Map TF action to analytics action type ('demote_to_near' -> 'demote')
        const analyticsAction = decision.action === 'demote_to_near' ? 'demote' : decision.action;
        trackTrustFilterPairDecision({
          scanId,
          matchId,
          action: analyticsAction,
          reason: decision.primary_reason ?? 'none',
          archetypeDistance: decision.debug.archetype_distance ?? undefined,
          formalityGap: decision.debug.formality_gap ?? undefined,
          seasonDiff: decision.debug.season_diff ?? undefined,
          promptVersion: 1, // Current prompt version
        });
      }

      telemetrySentRef.current = telemetryKey;
    }

    // Log summary in development (single line)
    if (__DEV__) {
      const signalsStatus = scanSignals ? 'scan+' : 'scan-';
      const wardrobeStatus = wardrobeSignals.size > 0 ? `ward${wardrobeSignals.size}` : 'ward-';
      console.log(`[TF] Result: ${highFinal.length} keep, ${demoted.length} demoted, ${hiddenCount} hidden (${signalsStatus}/${wardrobeStatus})`);
      
      // Debug: Log scan signals
      if (scanSignals) {
        console.log(`[TF] Scan signals: aesthetic=${scanSignals.aesthetic.primary}(${scanSignals.aesthetic.primary_confidence.toFixed(2)}), formality=${scanSignals.formality.band}, statement=${scanSignals.statement.level}`);
      }
      
      // Debug: Log each match evaluation
      for (const [matchId, decision] of batchResult.decisions) {
        const matchSignals = wardrobeSignals.get(matchId);
        const matchSignalsStr = matchSignals 
          ? `aesthetic=${matchSignals.aesthetic.primary}, formality=${matchSignals.formality.band}`
          : 'NO_SIGNALS';
        console.log(`[TF] Match ${matchId.slice(0, 8)}: ${decision.action} (reason=${decision.primary_reason ?? 'none'}) | ${matchSignalsStr} | gap=${decision.debug.formality_gap}, dist=${decision.debug.archetype_distance}, season=${decision.debug.season_diff}`);
      }
    }

    // ============================================
    // BUILD FINALIZED MATCHES
    // ============================================
    // This is the single source of truth for match display and outfit assembly.
    // Rule: ComboAssembler uses highFinal for "Wear now" and nearFinal for "Worth trying".

    // Convert CE MEDIUM matches to EnrichedMatch (using helper defined at top of useMemo)
    const ceNearMatches = confidenceResult.rawEvaluation?.near_matches ?? [];
    const nearFromCE = convertCeNearMatches();

    // Build hidden array (TF-hidden items as EnrichedMatch)
    const hiddenMatches: EnrichedMatch[] = [];
    for (const id of batchResult.hidden) {
      const match = matchMap.get(id);
      if (match) hiddenMatches.push(match);
    }

    // Build nearFinal = CE MEDIUM + TF-demoted (deduplicated by itemId)
    // INVARIANTS:
    //   - If an item is in highFinal, it must NOT appear in nearFinal
    //   - If an item is in hidden, it must NOT appear anywhere else
    // Order: TF-demoted first (they were HIGH, now NEAR), then CE MEDIUM
    // This ensures demoted items appear higher in Worth Trying since they were originally stronger
    
    // Create exclusion sets for deduping
    const highFinalIds = new Set(highFinal.map(m => m.wardrobeItem.id));
    const hiddenIds = new Set(batchResult.hidden);
    
    const nearFinalSet = new Set<string>();
    const nearFinal: EnrichedMatch[] = [];

    // Add TF-demoted first (maintain their order by CE score)
    // Note: demoted items should NOT be in highFinal or hidden (TF guarantees this)
    for (const match of demoted) {
      const id = match.wardrobeItem.id;
      if (!nearFinalSet.has(id) && !highFinalIds.has(id) && !hiddenIds.has(id)) {
        nearFinalSet.add(id);
        nearFinal.push(match);
      }
    }

    // Add CE MEDIUM (deduplicate, exclude highFinal and hidden)
    for (const match of nearFromCE) {
      const id = match.wardrobeItem.id;
      if (!nearFinalSet.has(id) && !highFinalIds.has(id) && !hiddenIds.has(id)) {
        nearFinalSet.add(id);
        nearFinal.push(match);
      }
    }

    // Build actionById and finalTierById maps
    const actionById = new Map<string, FinalMatchAction>();
    const finalTierById = new Map<string, FinalMatchTier>();

    // HIGH_FINAL items: keep action, HIGH tier
    for (const match of highFinal) {
      actionById.set(match.wardrobeItem.id, 'keep');
      finalTierById.set(match.wardrobeItem.id, 'HIGH');
    }

    // NEAR items (TF-demoted): demote action, NEAR tier
    for (const match of demoted) {
      actionById.set(match.wardrobeItem.id, 'demote');
      finalTierById.set(match.wardrobeItem.id, 'NEAR');
    }

    // NEAR items (CE MEDIUM): keep action (they weren't demoted, just MEDIUM from CE), NEAR tier
    for (const match of nearFromCE) {
      if (!actionById.has(match.wardrobeItem.id)) {
        actionById.set(match.wardrobeItem.id, 'keep');
        finalTierById.set(match.wardrobeItem.id, 'NEAR');
      }
    }

    // Hidden items: hide action, HIDDEN tier
    for (const match of hiddenMatches) {
      actionById.set(match.wardrobeItem.id, 'hide');
      finalTierById.set(match.wardrobeItem.id, 'HIDDEN');
    }

    // Build finalized structure
    const finalized: FinalizedMatches = {
      highFinal,
      nearFinal,
      hidden: hiddenMatches,
      meta: {
        tfDemotedCount: demoted.length,
        tfHiddenCount: hiddenMatches.length,
        aiDemotedCount: 0, // AI Safety not applied yet (handled in useEffect)
        aiHiddenCount: 0,
        aiDryRun: true, // Will be updated by AI Safety
        tfApplied: true,
        isLoading: false,
      },
      actionById,
      finalTierById,
      scanSignals,
      effectiveEvaluations: {
        matches: highFinal,
        demotedMatches: demoted,
      },
    };

    // Log FinalizedMatches summary in development
    if (__DEV__) {
      console.log('[FinalizedMatches]', {
        ceHigh: matches.length,
        ceMed: ceNearMatches.length,
        highFinal: highFinal.length,
        nearFinal: nearFinal.length,
        hidden: hiddenMatches.length,
        tf: { demoted: demoted.length, hidden: hiddenMatches.length },
        ai: { demoted: 0, hidden: 0, dryRun: true },
      });

      // ─────────────────────────────────────────────
      // INVARIANT CHECKS
      // ─────────────────────────────────────────────

      // 1. ID type assertion: all IDs should be strings (wardrobeItem.id)
      for (const id of hiddenIds) {
        if (typeof id !== 'string') {
          console.error('[FinalizedMatches] INVARIANT VIOLATED: Hidden id not string', id);
        }
      }

      // 2. Ghost demote/hide check: demoted/hidden IDs should be subset of CE HIGH
      // (prevents stale IDs from polluting nearFinal)
      const ceHighIds = new Set(matches.map(m => m.wardrobeItem.id));
      for (const id of batchResult.demoted) {
        if (!ceHighIds.has(id)) {
          console.error('[FinalizedMatches] INVARIANT VIOLATED: Demoted id not in CE HIGH', id);
        }
      }
      for (const id of batchResult.hidden) {
        if (!ceHighIds.has(id)) {
          console.error('[FinalizedMatches] INVARIANT VIOLATED: Hidden id not in CE HIGH', id);
        }
      }

      // 3. Bucket exclusivity: no overlap between highFinal, nearFinal, hidden
      const nearFinalIds = new Set(nearFinal.map(m => m.wardrobeItem.id));
      const highOverlap = highFinal.filter(m => nearFinalIds.has(m.wardrobeItem.id));
      const hiddenOverlap = hiddenMatches.filter(m => 
        nearFinalIds.has(m.wardrobeItem.id) || highFinalIds.has(m.wardrobeItem.id)
      );
      
      if (highOverlap.length > 0) {
        console.error('[FinalizedMatches] INVARIANT VIOLATED: highFinal overlaps with nearFinal', 
          highOverlap.map(m => m.wardrobeItem.id));
      }
      if (hiddenOverlap.length > 0) {
        console.error('[FinalizedMatches] INVARIANT VIOLATED: hidden overlaps with high/near', 
          hiddenOverlap.map(m => m.wardrobeItem.id));
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
      finalized,
      // Expose batch result for AI Safety (internal use)
      _batchResult: batchResult,
      _wardrobeSignals: wardrobeSignals,
    };
  }, [confidenceResult.matches, confidenceResult.rawEvaluation, wardrobeItems, scanSignals, wardrobeSignals, scannedItem?.category, isLoading, scanId]);

  // ============================================
  // AI SAFETY CHECK (after Trust Filter)
  // ============================================

  useEffect(() => {
    // Skip if AI Safety is disabled
    if (!isAiSafetyEnabled()) return;

    // Skip if Trust Filter wasn't applied or is still loading
    if (!result.wasApplied || result.isLoading) return;

    // Skip if no scan signals
    if (!result.scanSignals) return;

    // Skip if no HIGH matches to evaluate
    if (result.matches.length === 0) return;

    // Skip if already called for this scan
    const aiSafetyKey = `${scanId}-${result.matches.length}`;
    if (aiSafetyCalledRef.current === aiSafetyKey) return;

    // Check rollout
    const rolloutPct = getAiSafetyRolloutPct();
    const inAiSafetyRollout = inRollout(userId, rolloutPct);
    if (!inAiSafetyRollout) {
      if (__DEV__) {
        console.log(`[AI Safety] User not in rollout (bucket check failed for ${rolloutPct}%)`);
      }
      return;
    }

    const dryRun = isAiSafetyDryRun();
    const scanCategory = scannedItem?.category ?? 'tops';

    // Run AI Safety asynchronously
    const runAiSafety = async () => {
      try {
        // Get batch result internals (safely typed)
        const batchResult = (result as unknown as { _batchResult?: TrustFilterBatchResult })._batchResult;
        const wardrobeSignalsMap = (result as unknown as { _wardrobeSignals?: Map<string, StyleSignalsV1> })._wardrobeSignals;

        if (!batchResult || !wardrobeSignalsMap) return;

        // Select top K HIGH_FINAL matches (sorted by CE score)
        const topK = 5;
        const highFinalSorted = [...result.matches].sort(
          (a, b) => (b.evaluation.raw_score ?? 0) - (a.evaluation.raw_score ?? 0)
        );
        const candidates = highFinalSorted.slice(0, topK);

        // Filter to "risky" pairs that match trigger conditions
        const riskyPairs: Array<{
          match: EnrichedMatch;
          matchSignals: StyleSignalsV1;
          decision: TrustFilterBatchResult['decisions'] extends Map<string, infer V> ? V : never;
        }> = [];

        for (const match of candidates) {
          const matchSignals = wardrobeSignalsMap.get(match.wardrobeItem.id);
          const decision = batchResult.decisions.get(match.wardrobeItem.id);

          if (!matchSignals || !decision) continue;

          // Check trigger conditions
          const distance = decision.debug.archetype_distance ?? 'medium';
          const shouldRun = shouldRunAiSafety({
            scanSignals: result.scanSignals!,
            matchSignals,
            distance,
          });

          if (shouldRun) {
            riskyPairs.push({ match, matchSignals, decision });
          }
        }

        if (riskyPairs.length === 0) {
          if (__DEV__) {
            console.log(`[AI Safety] No risky pairs found (0/${candidates.length} matched trigger conditions)`);
          }
          return;
        }

        if (__DEV__) {
          console.log(`[AI Safety] Calling for ${riskyPairs.length} risky pairs (dry_run=${dryRun})...`);
        }

        // Mark as called to prevent duplicate calls
        aiSafetyCalledRef.current = aiSafetyKey;

        // Call AI Safety Edge Function
        const aiResponse = await aiSafetyCheckBatch({
          scanSignals: result.scanSignals!,
          pairs: riskyPairs.map((p) => ({
            itemId: p.match.wardrobeItem.id,
            pairType: computePairType(
              mapCategory(scanCategory),
              mapCategory(p.match.wardrobeItem.category)
            ),
            distance: p.decision.debug.archetype_distance ?? 'medium',
            matchSignals: p.matchSignals,
          })),
        });

        // Store result for potential future use (and debugging)
        setAiSafetyResult({
          verdicts: aiResponse.verdicts,
          dryRun: aiResponse.dry_run,
          stats: {
            cacheHits: aiResponse.stats?.cache_hits ?? 0,
            aiCalls: aiResponse.stats?.ai_calls ?? 0,
            totalLatencyMs: aiResponse.stats?.total_latency_ms ?? 0,
          },
        });

        // Log results in development
        if (__DEV__) {
          console.log(`[AI Safety] Completed: ${aiResponse.verdicts.length} verdicts, ` +
            `${aiResponse.stats?.cache_hits ?? 0} cache hits, ` +
            `${aiResponse.stats?.total_latency_ms ?? 0}ms`);

          // Log what would be hidden/demoted (dry_run visibility)
          const wouldHide = aiResponse.verdicts.filter(v => v.action === 'hide');
          const wouldDemote = aiResponse.verdicts.filter(v => v.action === 'demote');
          const wouldKeep = aiResponse.verdicts.filter(v => v.action === 'keep');

          if (dryRun) {
            console.log(`[AI Safety DRY_RUN] Would hide: ${wouldHide.length}, demote: ${wouldDemote.length}, keep: ${wouldKeep.length}`);
          }

          // Log each verdict
          for (const verdict of aiResponse.verdicts) {
            const emoji = verdict.action === 'hide' ? '🚫' : verdict.action === 'demote' ? '⬇️' : '✅';
            console.log(`[AI Safety] ${emoji} ${verdict.itemId.slice(0, 8)}: ${verdict.action} (${verdict.reason_code}) - "${verdict.ai_reason}"`);
          }
        }

        // In apply mode (not dry_run), we would modify the results here
        // For now, we only log - apply mode will be added in Step 4
        if (!dryRun) {
          // TODO: Apply AI Safety overrides to result
          // This will be implemented when we enable apply mode
          console.log('[AI Safety] Apply mode not yet implemented - verdicts logged only');
        }

      } catch (error) {
        console.error('[AI Safety] Error:', error);
        // Fail silently - AI Safety should never break the main flow
      }
    };

    void runAiSafety();
  }, [result, scanId, userId, scannedItem?.category]);

  // Return the Trust Filter result (AI Safety runs async and logs in dry_run mode)
  return result;
}

// ============================================
// __DEV__ DECLARATION
// ============================================

declare const __DEV__: boolean;
