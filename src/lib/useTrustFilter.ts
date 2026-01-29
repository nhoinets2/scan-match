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
  AI_SAFETY_POLICY_VERSION,
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
  persistScanSignalsToDb,
} from './style-signals-service';
import {
  trackTrustFilterStarted,
  trackTrustFilterCompleted,
  trackTrustFilterPairDecision,
  trackTrustFilterError,
  trackFinalizedMatchesInvariantViolation,
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

  /**
   * Whether all processing (TF + AI Safety) is complete.
   * Use this to gate UI display - don't show matches until isFullyReady.
   * 
   * false when: signals loading, AI Safety pending
   * true when: all filtering complete (or AI Safety not needed)
   */
  isFullyReady: boolean;

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
  const [signalsFetchTimeout, setSignalsFetchTimeout] = useState(false);
  const SIGNALS_TIMEOUT_MS = 10000; // 10 seconds max wait for signals

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

    // Note: Don't skip when matches.length === 0
    // Solo mode needs scanSignals even with 0 matches
    // Wardrobe signals fetching has its own guard (matchedItemIds.length > 0)

    // Skip if already fetched for this scan
    if (signalsFetched && scanId) {
      return;
    }

    const fetchSignals = async () => {
      setIsLoading(true);

      try {
        // Fetch scan signals (from inline, DB cache, or generate)
        let fetchedScanSignals: StyleSignalsV1 | null = null;

        // Fetch from DB or generate style signals
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
                // Persist to DB for instant reopen (fire-and-forget with retry)
                // scanId is the checkId - row may not exist yet, so persist retries
                persistScanSignalsToDb(scanId, response.data);
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

        // Always mark as fetched after attempt completes
        setSignalsFetched(true);
        
        if (__DEV__) {
          if (fetchedScanSignals) {
            console.log('[TF] Signals fetched successfully');
          } else {
            console.log('[TF] No scan signals available - will proceed with insufficient_info');
          }
        }
      } catch (error) {
        console.error('[useTrustFilter] Error fetching signals:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSignals();
  }, [scanId, matchedItemIds, signalsFetched, scannedItem?.imageUri]);

  // Reset when scan changes
  useEffect(() => {
    setScanSignals(null);
    setWardrobeSignals(new Map());
    setSignalsFetched(false);
    setSignalsFetchTimeout(false);
    setAiSafetyResult(null);
    setAiSafetyPending(false);
    aiSafetyCalledRef.current = null;
  }, [scanId]);

  // Timeout fallback: if signals aren't available within SIGNALS_TIMEOUT_MS, proceed anyway
  // This prevents infinite loading if the signal generation fails or takes too long
  useEffect(() => {
    if (!isTrustFilterEnabled() || signalsFetched || signalsFetchTimeout) {
      return;
    }
    
    const timeoutId = setTimeout(() => {
      if (!signalsFetched && !scanSignals) {
        if (__DEV__) {
          console.log(`[TF] Timeout reached (${SIGNALS_TIMEOUT_MS}ms) - proceeding with insufficient_info`);
        }
        setSignalsFetchTimeout(true);
      }
    }, SIGNALS_TIMEOUT_MS);
    
    return () => clearTimeout(timeoutId);
  }, [signalsFetched, scanSignals, signalsFetchTimeout]);

  // Note: AI Safety reset on matches change is handled below, after tfMatchesKey is defined

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

  // Track if AI Safety is currently pending (for isFullyReady calculation)
  const [aiSafetyPending, setAiSafetyPending] = useState(false);

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

    // If still loading OR signals haven't been fetched yet, return loading state
    // This prevents showing "kept by insufficient_info" results before signals are available
    // The signalsFetched flag ensures we wait for the fetch attempt to complete
    // 
    // SAFETY: Check signalsFetchTimeout to prevent infinite loading on connection loss
    // In normal flow (online), signalsFetchTimeout is always false, so:
    //   - effectivelyLoading = isLoading && true = isLoading (unchanged)
    //   - needsSignals = !signalsFetched && true && matches > 0 (unchanged)
    // Only when timeout fires (offline 10s+), signalsFetchTimeout = true, which:
    //   - effectivelyLoading = isLoading && false = false (stops waiting)
    //   - needsSignals = !signalsFetched && false && matches > 0 = false (stops waiting)
    const effectivelyLoading = isLoading && !signalsFetchTimeout;
    const needsSignals = !signalsFetched && !signalsFetchTimeout && matches.length > 0;
    if (effectivelyLoading || needsSignals) {
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
      // INVARIANT CHECKS (with production telemetry)
      // ─────────────────────────────────────────────

      // Capture flag states for telemetry correlation
      const flagStates = {
        tfEnabled: isTrustFilterEnabled(),
        aiEnabled: isAiSafetyEnabled(),
        aiDryRun: isAiSafetyDryRun(),
      };

      // 1. ID type assertion: all IDs should be strings (wardrobeItem.id)
      const nonStringIds = [...hiddenIds].filter(id => typeof id !== 'string');
      if (nonStringIds.length > 0) {
        trackFinalizedMatchesInvariantViolation({
          type: 'hidden_id_not_string',
          scanId: scanId || 'unknown',
          itemIdsCount: nonStringIds.length,
          severity: 'warning',
          context: `Non-string ID types found in hidden set`,
          ...flagStates,
        });
      }

      // 2. Ghost demote/hide check: demoted/hidden IDs should be subset of CE HIGH
      // (prevents stale IDs from polluting nearFinal)
      const ceHighIds = new Set(matches.map(m => m.wardrobeItem.id));
      const ghostDemotes = batchResult.demoted.filter(id => !ceHighIds.has(id));
      const ghostHides = batchResult.hidden.filter(id => !ceHighIds.has(id));
      
      if (ghostDemotes.length > 0) {
        trackFinalizedMatchesInvariantViolation({
          type: 'ghost_demote',
          scanId: scanId || 'unknown',
          itemIdsCount: ghostDemotes.length,
          severity: 'critical',
          context: `Demoted IDs not in CE HIGH: ${ghostDemotes.slice(0, 3).join(', ')}${ghostDemotes.length > 3 ? '...' : ''}`,
          ...flagStates,
        });
      }
      if (ghostHides.length > 0) {
        trackFinalizedMatchesInvariantViolation({
          type: 'ghost_hide',
          scanId: scanId || 'unknown',
          itemIdsCount: ghostHides.length,
          severity: 'critical',
          context: `Hidden IDs not in CE HIGH: ${ghostHides.slice(0, 3).join(', ')}${ghostHides.length > 3 ? '...' : ''}`,
          ...flagStates,
        });
      }

      // 3. Bucket exclusivity: no overlap between highFinal, nearFinal, hidden
      const nearFinalIds = new Set(nearFinal.map(m => m.wardrobeItem.id));
      const highOverlap = highFinal.filter(m => nearFinalIds.has(m.wardrobeItem.id));
      const hiddenOverlap = hiddenMatches.filter(m => 
        nearFinalIds.has(m.wardrobeItem.id) || highFinalIds.has(m.wardrobeItem.id)
      );
      
      if (highOverlap.length > 0) {
        trackFinalizedMatchesInvariantViolation({
          type: 'high_near_overlap',
          scanId: scanId || 'unknown',
          itemIdsCount: highOverlap.length,
          severity: 'critical',
          context: `Items in both highFinal and nearFinal: ${highOverlap.slice(0, 3).map(m => m.wardrobeItem.id).join(', ')}`,
          ...flagStates,
        });
      }
      if (hiddenOverlap.length > 0) {
        trackFinalizedMatchesInvariantViolation({
          type: 'hidden_overlap',
          scanId: scanId || 'unknown',
          itemIdsCount: hiddenOverlap.length,
          severity: 'critical',
          context: `Hidden items overlapping with high/near: ${hiddenOverlap.slice(0, 3).map(m => m.wardrobeItem.id).join(', ')}`,
          ...flagStates,
        });
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
  }, [confidenceResult.matches, confidenceResult.rawEvaluation, wardrobeItems, scanSignals, wardrobeSignals, scannedItem?.category, isLoading, scanId, signalsFetched]);

  // ============================================
  // AI SAFETY CHECK (after Trust Filter)
  // ============================================

  // Extract stable primitives from result for dependency array
  // This prevents re-triggers when result object identity changes
  const tfIsLoading = result.isLoading;
  const tfWasApplied = result.wasApplied;
  const tfScanSignals = result.scanSignals;
  const tfMatchCount = result.matches.length;
  
  // Stable key for matches - prevents re-triggers when array identity changes but content is same
  // Sort to ensure consistent key regardless of match order
  const tfMatchesKey = useMemo(
    () => result.matches.map(m => m.wardrobeItem.id).sort().join('|'),
    [result.matches]
  );

  // Reset AI Safety when matches change (e.g., wardrobe add/delete)
  // This prevents stale verdicts from being applied to new/different matches
  // Uses tfMatchesKey as single source of truth for match identity
  const prevMatchesKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevMatchesKeyRef.current !== null && prevMatchesKeyRef.current !== tfMatchesKey) {
      // Matches changed - clear AI Safety state to force re-evaluation
      if (__DEV__) {
        console.log('[AI Safety] Matches changed, resetting AI Safety state');
      }
      setAiSafetyResult(null);
      setAiSafetyPending(false);
      aiSafetyCalledRef.current = null;
    }
    prevMatchesKeyRef.current = tfMatchesKey;
  }, [tfMatchesKey]);

  // ============================================
  // COMPUTE RISKY PAIRS SYNCHRONOUSLY (in useMemo)
  // ============================================
  // This prevents the timing gap where isFullyReady briefly becomes true
  // before AI Safety starts. By computing risky pairs synchronously,
  // we can determine IMMEDIATELY if AI Safety will run.

  type RiskyPair = {
    match: EnrichedMatch;
    matchSignals: StyleSignalsV1;
    decision: TrustFilterBatchResult['decisions'] extends Map<string, infer V> ? V : never;
  };

  const riskyPairsComputation = useMemo((): {
    riskyPairs: RiskyPair[];
    willRun: boolean;
    skipReason: string | null;
  } => {
    // Early exits - compute skip reason for debugging
    if (!isAiSafetyEnabled()) {
      return { riskyPairs: [], willRun: false, skipReason: 'ai_safety_disabled' };
    }

    if (!tfWasApplied || tfIsLoading) {
      return { riskyPairs: [], willRun: false, skipReason: 'tf_not_ready' };
    }

    if (!tfScanSignals) {
      return { riskyPairs: [], willRun: false, skipReason: 'no_scan_signals' };
    }

    if (tfMatchCount === 0) {
      return { riskyPairs: [], willRun: false, skipReason: 'no_high_matches' };
    }

    // Check rollout (deterministic, safe to call in memo)
    const rolloutPct = getAiSafetyRolloutPct();
    const inAiSafetyRollout = inRollout(userId, rolloutPct);
    if (!inAiSafetyRollout) {
      return { riskyPairs: [], willRun: false, skipReason: `not_in_rollout_${rolloutPct}` };
    }

    // Get batch result internals
    const batchResult = (result as unknown as { _batchResult?: TrustFilterBatchResult })._batchResult;
    const wardrobeSignalsMap = (result as unknown as { _wardrobeSignals?: Map<string, StyleSignalsV1> })._wardrobeSignals;

    if (!batchResult || !wardrobeSignalsMap) {
      return { riskyPairs: [], willRun: false, skipReason: 'no_batch_result' };
    }

    // Select top K HIGH_FINAL matches (sorted by CE score)
    const topK = 5;
    const highFinalSorted = [...result.matches].sort(
      (a, b) => (b.evaluation.raw_score ?? 0) - (a.evaluation.raw_score ?? 0)
    );
    const candidates = highFinalSorted.slice(0, topK);

    // Filter to "risky" pairs that match trigger conditions
    const riskyPairs: RiskyPair[] = [];

    for (const match of candidates) {
      const matchSignals = wardrobeSignalsMap.get(match.wardrobeItem.id);
      const decision = batchResult.decisions.get(match.wardrobeItem.id);

      if (!matchSignals || !decision) continue;

      // Check trigger conditions
      const distance = decision.debug.archetype_distance ?? 'medium';
      const shouldRun = shouldRunAiSafety({
        scanSignals: tfScanSignals,
        matchSignals,
        distance,
      });

      if (shouldRun) {
        riskyPairs.push({ match, matchSignals, decision });
      }
    }

    if (riskyPairs.length === 0) {
      return { riskyPairs: [], willRun: false, skipReason: `no_risky_pairs_0_of_${candidates.length}` };
    }

    return { riskyPairs, willRun: true, skipReason: null };
  }, [tfIsLoading, tfWasApplied, tfScanSignals, tfMatchCount, result, userId]);

  // Derive whether AI Safety will run but hasn't completed yet
  // This is used to keep isFullyReady=false until AI Safety completes (or is skipped)
  const aiSafetyWillRunButNotDone = riskyPairsComputation.willRun && aiSafetyResult === null;

  // These are needed inside the effect but we access them via result to avoid stale closures
  // The aiSafetyCalledRef check prevents actual duplicate API calls even if effect re-runs

  useEffect(() => {
    // Helper to mark AI Safety as complete
    const markComplete = () => {
      setAiSafetyPending(false);
    };

    // If AI Safety won't run, ensure pending is false
    if (!riskyPairsComputation.willRun) {
      if (__DEV__ && riskyPairsComputation.skipReason && tfWasApplied && !tfIsLoading) {
        // Only log skip reason when TF is done (to avoid spamming during loading)
        if (riskyPairsComputation.skipReason.startsWith('no_risky_pairs')) {
          console.log(`[AI Safety] No risky pairs found (${riskyPairsComputation.skipReason})`);
        } else if (riskyPairsComputation.skipReason.startsWith('not_in_rollout')) {
          console.log(`[AI Safety] User not in rollout (${riskyPairsComputation.skipReason})`);
        }
        // Don't log other reasons (disabled, not ready, etc.) as they're expected
      }
      markComplete();
      return;
    }

    // Skip if already called for this exact configuration
    // Include policy version in key so prompt updates invalidate locally
    const dryRun = isAiSafetyDryRun();
    const aiSafetyKey = `${scanId}-${tfMatchesKey}-dry=${dryRun}-policy=${AI_SAFETY_POLICY_VERSION}`;
    if (aiSafetyCalledRef.current === aiSafetyKey) {
      // Already called, check if we have a result
      if (aiSafetyResult !== null) {
        markComplete();
      }
      return;
    }

    // ============================================
    // NOW we know we have risky pairs - set pending and call API
    // ============================================
    setAiSafetyPending(true);

    const scanCategory = scannedItem?.category ?? 'tops';
    const riskyPairs = riskyPairsComputation.riskyPairs;

    if (__DEV__) {
      console.log(`[AI Safety] Calling for ${riskyPairs.length} risky pairs (requested_dry_run=${dryRun})...`);
    }

    // Mark as called to prevent duplicate calls
    aiSafetyCalledRef.current = aiSafetyKey;

    // Run AI Safety asynchronously
    const runAiSafety = async () => {
      try {
        // Call AI Safety Edge Function
        const aiResponse = await aiSafetyCheckBatch({
          scanSignals: tfScanSignals!,
          pairs: riskyPairs.map((p) => ({
            itemId: p.match.wardrobeItem.id,
            pairType: computePairType(
              mapCategory(scanCategory),
              mapCategory(p.match.wardrobeItem.category)
            ),
            distance: p.decision.debug.archetype_distance ?? 'medium',
            matchSignals: p.matchSignals,
          })),
          // Pass client's requested dry_run preference
          requestedDryRun: dryRun,
        });

        // Use server's effective_dry_run for all logic (this is what actually matters)
        const effectiveDryRun = aiResponse.effective_dry_run;

        // Store result for potential future use (and debugging)
        setAiSafetyResult({
          verdicts: aiResponse.verdicts,
          dryRun: effectiveDryRun, // Use server's decision
          stats: {
            cacheHits: aiResponse.stats?.cache_hits ?? 0,
            aiCalls: aiResponse.stats?.ai_calls ?? 0,
            totalLatencyMs: aiResponse.stats?.total_latency_ms ?? 0,
          },
        });

        // Log results in development
        if (__DEV__) {
          // Log dry_run status clearly showing both client request and server decision
          console.log(`[AI Safety] Completed: ${aiResponse.verdicts.length} verdicts, ` +
            `${aiResponse.stats?.cache_hits ?? 0} cache hits, ` +
            `${aiResponse.stats?.total_latency_ms ?? 0}ms ` +
            `(requested_dry_run=${aiResponse.requested_dry_run}, effective_dry_run=${effectiveDryRun})`);

          // Log what would be hidden/demoted
          const wouldHide = aiResponse.verdicts.filter(v => v.action === 'hide');
          const wouldDemote = aiResponse.verdicts.filter(v => v.action === 'demote');
          const wouldKeep = aiResponse.verdicts.filter(v => v.action === 'keep');

          if (effectiveDryRun) {
            console.log(`[AI Safety DRY_RUN] Would hide: ${wouldHide.length}, demote: ${wouldDemote.length}, keep: ${wouldKeep.length}`);
          }

          // Log each verdict
          for (const verdict of aiResponse.verdicts) {
            const emoji = verdict.action === 'hide' ? '🚫' : verdict.action === 'demote' ? '⬇️' : '✅';
            console.log(`[AI Safety] ${emoji} ${verdict.itemId.slice(0, 8)}: ${verdict.action} (${verdict.reason_code}) - "${verdict.ai_reason}"`);
          }
        }

        // Apply mode logging (actual application happens in finalResult below)
        if (!effectiveDryRun) {
          const aiHideCount = aiResponse.verdicts.filter(v => v.action === 'hide').length;
          const aiDemoteCount = aiResponse.verdicts.filter(v => v.action === 'demote').length;
          console.log(`[AI Safety APPLY] Will apply ${aiHideCount} hides, ${aiDemoteCount} demotes`);
        }

      } catch (error) {
        console.error('[AI Safety] Error:', error);
        // Fail silently - AI Safety should never break the main flow
      } finally {
        // ALWAYS mark complete - whether success, empty response, or error
        markComplete();
      }
    };

    void runAiSafety();
  }, [
    // Use risky pairs computation result as dependency
    riskyPairsComputation,
    tfIsLoading,
    tfWasApplied,
    tfScanSignals,
    tfMatchesKey,
    scanId,
    scannedItem?.category,
    aiSafetyResult,
  ]);

  // ============================================
  // APPLY AI SAFETY VERDICTS (when not dry_run)
  // ============================================

  const finalResult = useMemo((): TrustFilterResult => {
    // Compute isFullyReady:
    // 1. finalized buckets must exist
    // 2. not loading TF signals
    // 3. not waiting for AI Safety (use BOTH: pending state AND computed willRun flag)
    //    - aiSafetyPending: true when API call is in progress
    //    - aiSafetyWillRunButNotDone: true when risky pairs exist but no result yet
    //    Using both ensures NO timing gap where isFullyReady becomes true before AI Safety starts
    // 4. Either TF is disabled OR we have meaningful scan signals OR timeout reached (fallback)
    const hasMeaningfulSignals = !isTrustFilterEnabled() || !!result.scanSignals || signalsFetchTimeout;
    const waitingForAiSafety = aiSafetyPending || aiSafetyWillRunButNotDone;
    const isFullyReady = !!result.finalized && !result.isLoading && !waitingForAiSafety && hasMeaningfulSignals;

    // Debug log isFullyReady computation
    if (__DEV__) {
      console.log('[isFullyReady]', {
        isFullyReady,
        hasFinalized: !!result.finalized,
        isLoading: result.isLoading,
        aiSafetyPending,
        aiSafetyWillRunButNotDone,
        waitingForAiSafety,
        hasMeaningfulSignals,
        signalsFetchTimeout,
        hasActualSignals: !!result.scanSignals,
        wasApplied: result.wasApplied,
      });
    }

    // If no AI Safety results, or dry_run mode, return original result with isFullyReady
    if (!aiSafetyResult || aiSafetyResult.dryRun) {
      return {
        ...result,
        isFullyReady,
      };
    }

    // Apply AI Safety verdicts to the result
    const verdicts = aiSafetyResult.verdicts;
    if (verdicts.length === 0) {
      return {
        ...result,
        isFullyReady,
      };
    }

    // Build verdict lookup
    const verdictById = new Map<string, AiSafetyVerdict>();
    for (const verdict of verdicts) {
      verdictById.set(verdict.itemId, verdict);
    }

    // Apply verdicts to finalized buckets
    // Merge precedence: hide > demote > keep
    // AI hide always wins, AI demote wins unless TF hid, AI keep never upgrades
    const newHighFinal: EnrichedMatch[] = [];
    const newNearFinal: EnrichedMatch[] = [...result.finalized.nearFinal];
    const newHidden: EnrichedMatch[] = [...result.finalized.hidden];
    const newActionById = new Map(result.finalized.actionById);
    const newFinalTierById = new Map(result.finalized.finalTierById);

    let aiHiddenCount = 0;
    let aiDemotedCount = 0;

    for (const match of result.finalized.highFinal) {
      const verdict = verdictById.get(match.wardrobeItem.id);

      if (!verdict) {
        // No AI verdict for this item, keep as-is
        newHighFinal.push(match);
        continue;
      }

      if (verdict.action === 'hide') {
        // AI says hide → move to hidden
        newHidden.push(match);
        newActionById.set(match.wardrobeItem.id, 'hide');
        newFinalTierById.set(match.wardrobeItem.id, 'HIDDEN');
        aiHiddenCount++;
        if (__DEV__) {
          console.log(`[AI Safety APPLY] 🚫 Hiding ${match.wardrobeItem.id.slice(0, 8)} - "${verdict.ai_reason}"`);
        }
      } else if (verdict.action === 'demote') {
        // AI says demote → move to nearFinal
        newNearFinal.unshift(match); // Add at front (AI-demoted first)
        newActionById.set(match.wardrobeItem.id, 'demote');
        newFinalTierById.set(match.wardrobeItem.id, 'NEAR');
        aiDemotedCount++;
        if (__DEV__) {
          console.log(`[AI Safety APPLY] ⬇️ Demoting ${match.wardrobeItem.id.slice(0, 8)} - "${verdict.ai_reason}"`);
        }
      } else {
        // AI says keep → keep in highFinal
        newHighFinal.push(match);
      }
    }

    // Build updated finalized
    const updatedFinalized: FinalizedMatches = {
      highFinal: newHighFinal,
      nearFinal: newNearFinal,
      hidden: newHidden,
      meta: {
        ...result.finalized.meta,
        aiDemotedCount,
        aiHiddenCount,
        aiDryRun: false,
      },
      actionById: newActionById,
      finalTierById: newFinalTierById,
      scanSignals: result.finalized.scanSignals,
      effectiveEvaluations: {
        matches: newHighFinal,
        demotedMatches: [
          // TF-demoted + AI-demoted
          ...result.demotedMatches,
          ...result.finalized.highFinal.filter(m => verdictById.get(m.wardrobeItem.id)?.action === 'demote'),
        ],
      },
    };

    if (__DEV__) {
      console.log('[AI Safety APPLY] Result:', {
        before: { high: result.finalized.highFinal.length, near: result.finalized.nearFinal.length },
        after: { high: newHighFinal.length, near: newNearFinal.length, hidden: newHidden.length },
        aiActions: { hidden: aiHiddenCount, demoted: aiDemotedCount },
      });
    }

    // Return updated result
    return {
      ...result,
      matches: newHighFinal,
      finalized: updatedFinalized,
      isFullyReady,
    };
  }, [result, aiSafetyResult, aiSafetyPending, aiSafetyWillRunButNotDone, signalsFetchTimeout]);

  // Return the final result (with AI Safety applied if not dry_run)
  return finalResult;
}

// ============================================
// __DEV__ DECLARATION
// ============================================

declare const __DEV__: boolean;
