/**
 * Trust Filter v1
 *
 * Post-CE guardrail that prevents trust-breaking HIGH matches
 * using style_signals_v1 (aesthetic, formality, statement, season, pattern).
 *
 * This module provides:
 * - evaluateTrustFilterPair: Evaluate a single pair
 * - evaluateTrustFilterBatch: Evaluate multiple HIGH matches
 * - TRUST_FILTER_CONFIG_V1: Compiled configuration
 * - mergeRemoteConfig: Apply remote config overrides
 *
 * @example
 * ```typescript
 * import { evaluateTrustFilterPair, TRUST_FILTER_CONFIG_V1 } from '@/lib/trust-filter';
 *
 * const result = evaluateTrustFilterPair({
 *   scanSignals: myScanSignals,
 *   matchSignals: myMatchSignals,
 *   scanCategory: 'shoes',
 *   matchCategory: 'tops',
 *   ceTier: 'HIGH',
 * });
 *
 * if (result.action === 'hide') {
 *   // Remove from HIGH matches
 * } else if (result.action === 'demote_to_near') {
 *   // Move to Worth Trying
 * }
 * ```
 */

// Main evaluation functions
export {
  evaluateTrustFilterPair,
  evaluateTrustFilterBatch,
} from './evaluate';

// Configuration
export {
  TRUST_FILTER_CONFIG_V1,
  mergeRemoteConfig,
  REMOTE_OVERRIDE_ALLOWED_KEYS,
} from './config';

// Types
export type {
  // Style Signals v1 types
  StyleSignalsV1,
  AestheticArchetype,
  FormalityBand,
  StatementLevel,
  SeasonHeaviness,
  PatternLevel,
  MaterialFamily,
  PaletteColor,
  // Trust Filter types
  TrustFilterInput,
  TrustFilterResult,
  TrustFilterAction,
  TrustFilterReasonCode,
  HardReasonCode,
  SoftReasonCode,
  InfoReasonCode,
  TrustFilterDebug,
  TraceStep,
  TFCategory,
  ArchetypeDistance,
  AestheticCluster,
  PairTypeCategory,
} from './types';

// Batch types
export type {
  TrustFilterBatchInput,
  TrustFilterBatchResult,
} from './evaluate';

// Helper functions (for advanced usage / testing)
export {
  computeArchetypeDistance,
  computeFormalityGap,
  computeSeasonDiff,
  getClusterForArchetype,
  getPairOverride,
  getPairType,
  isBagsOrAccessories,
  isShoesTopsPair,
  hasSkirts,
} from './helpers';
