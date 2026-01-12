/**
 * Confidence Engine - Analytics Module
 *
 * Phase 1: Observe only - no kill switches.
 * Tracks confidence engine behavior for future optimization.
 */

import type {
  ConfidenceTier,
  CapReason,
  HardFailReason,
  PairType,
  PairEvaluation,
  OutfitEvaluation,
} from './types';

// ============================================
// EVENT TYPES
// ============================================

export interface ConfidenceEngineEvent {
  name: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

export interface PairEvaluationEvent extends ConfidenceEngineEvent {
  name: 'confidence_pair_evaluated';
  properties: {
    pair_type: PairType;
    raw_score: number;
    confidence_tier: ConfidenceTier;
    is_hard_fail: boolean;
    hard_fail_reason: HardFailReason | null;
    cap_reasons: CapReason[];
    is_shoes_involved: boolean;
    is_near_match: boolean;
    explanation_allowed: boolean;
    explanation_forbidden_reason: string | null;
  };
}

export interface OutfitEvaluationEvent extends ConfidenceEngineEvent {
  name: 'confidence_outfit_evaluated';
  properties: {
    wardrobe_size: number;
    pair_count: number;
    high_match_count: number;
    medium_match_count: number;
    low_match_count: number;
    near_match_count: number;
    outfit_confidence: ConfidenceTier;
    suggestions_mode: 'A' | 'B';
    show_matches_section: boolean;
  };
}

export interface TierDistributionEvent extends ConfidenceEngineEvent {
  name: 'confidence_tier_distribution';
  properties: {
    session_id: string;
    high_count: number;
    medium_count: number;
    low_count: number;
    hard_fail_count: number;
    total_evaluations: number;
  };
}

export interface CapReasonFrequencyEvent extends ConfidenceEngineEvent {
  name: 'confidence_cap_reason_frequency';
  properties: {
    session_id: string;
    reason_counts: Record<CapReason, number>;
    total_capped: number;
  };
}

// ============================================
// ANALYTICS TRACKER
// ============================================

type EventCallback = (event: ConfidenceEngineEvent) => void;

let eventCallback: EventCallback | null = null;
let sessionId: string = generateSessionId();

function generateSessionId(): string {
  return `ce_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Set the callback for receiving analytics events.
 * Integrate with your analytics service here.
 */
export function setAnalyticsCallback(callback: EventCallback | null): void {
  eventCallback = callback;
}

/**
 * Start a new analytics session.
 */
export function startNewSession(): string {
  sessionId = generateSessionId();
  return sessionId;
}

/**
 * Get current session ID.
 */
export function getSessionId(): string {
  return sessionId;
}

/**
 * Track an event.
 */
function trackEvent(event: ConfidenceEngineEvent): void {
  // Always log in development
  if (__DEV__) {
    console.log(`[ConfidenceEngine] ${event.name}`, event.properties);
  }

  // Call registered callback
  if (eventCallback) {
    eventCallback(event);
  }
}

// ============================================
// TRACKING FUNCTIONS
// ============================================

/**
 * Track a pair evaluation.
 */
export function trackPairEvaluation(evaluation: PairEvaluation): void {
  const isNearMatch =
    evaluation.confidence_tier === 'MEDIUM' &&
    (evaluation.raw_score >= evaluation.high_threshold_used ||
      evaluation.raw_score >= 0.7);

  trackEvent({
    name: 'confidence_pair_evaluated',
    timestamp: new Date().toISOString(),
    properties: {
      pair_type: evaluation.pair_type,
      raw_score: evaluation.raw_score,
      confidence_tier: evaluation.confidence_tier,
      is_hard_fail: evaluation.forced_tier === 'LOW',
      hard_fail_reason: evaluation.hard_fail_reason,
      cap_reasons: evaluation.cap_reasons,
      is_shoes_involved: evaluation.is_shoes_involved,
      is_near_match: isNearMatch,
      explanation_allowed: evaluation.explanation_allowed,
      explanation_forbidden_reason: evaluation.explanation_forbidden_reason,
    },
  });
}

/**
 * Track an outfit evaluation.
 */
export function trackOutfitEvaluation(
  evaluation: OutfitEvaluation,
  allPairs: PairEvaluation[],
  wardrobeSize: number
): void {
  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const pair of allPairs) {
    counts[pair.confidence_tier]++;
  }

  trackEvent({
    name: 'confidence_outfit_evaluated',
    timestamp: new Date().toISOString(),
    properties: {
      wardrobe_size: wardrobeSize,
      pair_count: allPairs.length,
      high_match_count: counts.HIGH,
      medium_match_count: counts.MEDIUM,
      low_match_count: counts.LOW,
      near_match_count: evaluation.near_matches.length,
      outfit_confidence: evaluation.outfit_confidence,
      suggestions_mode: evaluation.suggestions_mode,
      show_matches_section: evaluation.show_matches_section,
    },
  });
}

/**
 * Track tier distribution for a session.
 * Call periodically or at end of session.
 */
export function trackTierDistribution(pairs: PairEvaluation[]): void {
  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  let hardFailCount = 0;

  for (const pair of pairs) {
    counts[pair.confidence_tier]++;
    if (pair.forced_tier === 'LOW') {
      hardFailCount++;
    }
  }

  trackEvent({
    name: 'confidence_tier_distribution',
    timestamp: new Date().toISOString(),
    properties: {
      session_id: sessionId,
      high_count: counts.HIGH,
      medium_count: counts.MEDIUM,
      low_count: counts.LOW,
      hard_fail_count: hardFailCount,
      total_evaluations: pairs.length,
    },
  });
}

/**
 * Track cap reason frequency.
 */
export function trackCapReasonFrequency(pairs: PairEvaluation[]): void {
  const reasonCounts: Record<CapReason, number> = {
    FORMALITY_TENSION: 0,
    STYLE_TENSION: 0,
    COLOR_TENSION: 0,
    TEXTURE_CLASH: 0,
    USAGE_MISMATCH: 0,
    SHOES_CONFIDENCE_DAMPEN: 0,
    MISSING_KEY_SIGNAL: 0,
  };

  let totalCapped = 0;

  for (const pair of pairs) {
    if (pair.cap_reasons.length > 0) {
      totalCapped++;
      for (const reason of pair.cap_reasons) {
        reasonCounts[reason]++;
      }
    }
  }

  trackEvent({
    name: 'confidence_cap_reason_frequency',
    timestamp: new Date().toISOString(),
    properties: {
      session_id: sessionId,
      reason_counts: reasonCounts,
      total_capped: totalCapped,
    },
  });
}

// ============================================
// AGGREGATE HELPERS
// ============================================

/**
 * Calculate average raw score for a set of evaluations.
 */
export function calculateAverageScore(pairs: PairEvaluation[]): number {
  if (pairs.length === 0) return 0;
  const sum = pairs.reduce((acc, p) => acc + p.raw_score, 0);
  return sum / pairs.length;
}

/**
 * Calculate tier percentages.
 */
export function calculateTierPercentages(
  pairs: PairEvaluation[]
): { high: number; medium: number; low: number } {
  if (pairs.length === 0) {
    return { high: 0, medium: 0, low: 0 };
  }

  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const pair of pairs) {
    counts[pair.confidence_tier]++;
  }

  const total = pairs.length;
  return {
    high: (counts.HIGH / total) * 100,
    medium: (counts.MEDIUM / total) * 100,
    low: (counts.LOW / total) * 100,
  };
}
