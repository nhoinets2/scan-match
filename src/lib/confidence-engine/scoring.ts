/**
 * Confidence Engine - Scoring Module
 *
 * Computes weighted raw_score from feature signals.
 * Handles unknown feature redistribution.
 */

import type {
  FeatureSignals,
  FeatureCode,
  PairType,
} from './types';

import { getWeightsForPairType, FEATURE_FLAGS } from './config';
import { normalizeFeatureValue } from './utils';

// ============================================
// WEIGHT REDISTRIBUTION
// ============================================

/**
 * Redistributes weights from unknown features to known features.
 * Unknown features contribute 0 to the score, and their weight
 * is proportionally distributed to known features.
 *
 * Example:
 * - Base weights: C=0.20, S=0.20, F=0.25, T=0.15, U=0.20
 * - If T is unknown (0.15 weight), redistribute to known features
 * - New weights sum to 1.0, with T=0
 */
export function redistributeWeights(
  signals: FeatureSignals,
  baseWeights: Record<FeatureCode, number>
): Record<FeatureCode, number> {
  // Start with base weights
  const weights: Record<FeatureCode, number> = { ...baseWeights };

  // Collect known and unknown weights
  let knownTotal = 0;
  let unknownTotal = 0;

  const featureCodes: FeatureCode[] = ['C', 'S', 'F', 'T', 'U'];

  // Add V if silhouette is enabled
  if (FEATURE_FLAGS.silhouette_enabled) {
    featureCodes.push('V');
  }

  for (const code of featureCodes) {
    const signal = code === 'V' ? signals.V : signals[code as Exclude<FeatureCode, 'V'>];

    if (!signal || !signal.known) {
      unknownTotal += weights[code] ?? 0;
      weights[code] = 0; // Unknown features contribute 0
    } else {
      knownTotal += weights[code] ?? 0;
    }
  }

  // If no known features, return zero weights
  if (knownTotal === 0) {
    return weights;
  }

  // Redistribute unknown weight proportionally to known features
  if (unknownTotal > 0) {
    const redistributionFactor = (knownTotal + unknownTotal) / knownTotal;

    for (const code of featureCodes) {
      if (weights[code] > 0) {
        weights[code] *= redistributionFactor;
      }
    }
  }

  return weights;
}

// ============================================
// RAW SCORE CALCULATION
// ============================================

/**
 * Compute raw_score from feature signals using weighted sum.
 *
 * Steps:
 * 1. Get base weights for the pair type
 * 2. Redistribute weights from unknown to known features
 * 3. Normalize each feature value from [-2, +2] to [0, 1]
 * 4. Compute weighted sum
 *
 * Returns a score in [0, 1] range.
 */
export function computeRawScore(
  signals: FeatureSignals,
  pairType: PairType
): { rawScore: number; weightsUsed: Record<FeatureCode, number> } {
  // Get base weights for this pair type
  const baseWeights = getWeightsForPairType(pairType);

  // Redistribute weights based on known/unknown features
  const weightsUsed = redistributeWeights(signals, baseWeights);

  // Compute weighted sum of normalized values
  let weightedSum = 0;
  let totalWeight = 0;

  // Core features
  const coreFeatures: (keyof Omit<FeatureSignals, 'V'>)[] = ['C', 'S', 'F', 'T', 'U'];

  for (const code of coreFeatures) {
    const signal = signals[code];
    const weight = weightsUsed[code];

    if (weight > 0 && signal.known) {
      const normalized = normalizeFeatureValue(signal.value);
      weightedSum += normalized * weight;
      totalWeight += weight;
    }
  }

  // Add V (silhouette) if present and known
  if (signals.V && weightsUsed.V > 0 && signals.V.known) {
    const normalized = normalizeFeatureValue(signals.V.value);
    weightedSum += normalized * weightsUsed.V;
    totalWeight += weightsUsed.V;
  }

  // If no known features, return neutral score
  if (totalWeight === 0) {
    return { rawScore: 0.5, weightsUsed };
  }

  // Normalize to [0, 1]
  const rawScore = weightedSum / totalWeight;

  return { rawScore, weightsUsed };
}

// ============================================
// SCORE ANALYSIS HELPERS
// ============================================

/**
 * Get contribution of each feature to the raw score.
 * Useful for debugging and explanations.
 */
export function getFeatureContributions(
  signals: FeatureSignals,
  pairType: PairType
): Record<FeatureCode, { value: number; weight: number; contribution: number; known: boolean }> {
  const baseWeights = getWeightsForPairType(pairType);
  const weightsUsed = redistributeWeights(signals, baseWeights);

  const contributions: Record<FeatureCode, { value: number; weight: number; contribution: number; known: boolean }> = {
    C: { value: 0, weight: 0, contribution: 0, known: false },
    S: { value: 0, weight: 0, contribution: 0, known: false },
    F: { value: 0, weight: 0, contribution: 0, known: false },
    T: { value: 0, weight: 0, contribution: 0, known: false },
    U: { value: 0, weight: 0, contribution: 0, known: false },
    V: { value: 0, weight: 0, contribution: 0, known: false },
  };

  // Core features
  const coreFeatures: (keyof Omit<FeatureSignals, 'V'>)[] = ['C', 'S', 'F', 'T', 'U'];

  for (const code of coreFeatures) {
    const signal = signals[code];
    const weight = weightsUsed[code];

    contributions[code] = {
      value: signal.value,
      weight,
      contribution: signal.known ? normalizeFeatureValue(signal.value) * weight : 0,
      known: signal.known,
    };
  }

  // V (silhouette)
  if (signals.V) {
    contributions.V = {
      value: signals.V.value,
      weight: weightsUsed.V,
      contribution: signals.V.known
        ? normalizeFeatureValue(signals.V.value) * weightsUsed.V
        : 0,
      known: signals.V.known,
    };
  }

  return contributions;
}

/**
 * Check if the score is dominated by a single feature.
 * Returns the feature code if one feature contributes >50% of the total.
 */
export function getDominantFeature(
  signals: FeatureSignals,
  pairType: PairType
): FeatureCode | null {
  const contributions = getFeatureContributions(signals, pairType);

  let totalContribution = 0;
  let maxContribution = 0;
  let dominantCode: FeatureCode | null = null;

  const featureCodes: FeatureCode[] = ['C', 'S', 'F', 'T', 'U', 'V'];

  for (const code of featureCodes) {
    const contrib = Math.abs(contributions[code].contribution);
    totalContribution += contrib;

    if (contrib > maxContribution) {
      maxContribution = contrib;
      dominantCode = code;
    }
  }

  // Check if dominant feature is >50% of total
  if (totalContribution > 0 && maxContribution / totalContribution > 0.5) {
    return dominantCode;
  }

  return null;
}
