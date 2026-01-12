/**
 * Confidence Engine - Feature Signal Computation
 *
 * Computes individual feature signals (C, S, F, T, U, V) for a pair of items.
 * Each signal returns a value (-2 to +2) and a "known" flag.
 */

import type {
  ConfidenceItem,
  FeatureSignals,
  FeatureResult,
  PairType,
} from './types';

import {
  colorScore,
  styleScore,
  formalityScore,
  textureScore,
  usageScore,
} from './utils';

import { FEATURE_FLAGS } from './config';

// ============================================
// INDIVIDUAL FEATURE COMPUTATIONS
// ============================================

/**
 * Color compatibility (C)
 * Always known - we always have color profile
 */
function computeColorSignal(
  itemA: ConfidenceItem,
  itemB: ConfidenceItem
): FeatureResult {
  const value = colorScore(itemA.color_profile, itemB.color_profile);
  return { value, known: true };
}

/**
 * Style family alignment (S)
 * Unknown if either style is 'unknown'
 */
function computeStyleSignal(
  itemA: ConfidenceItem,
  itemB: ConfidenceItem
): FeatureResult {
  const known =
    itemA.style_family !== 'unknown' && itemB.style_family !== 'unknown';

  if (!known) {
    return { value: 0, known: false };
  }

  const value = styleScore(itemA.style_family, itemB.style_family);
  return { value, known: true };
}

/**
 * Formality alignment (F)
 * Always known - formality level is required
 */
function computeFormalitySignal(
  itemA: ConfidenceItem,
  itemB: ConfidenceItem
): FeatureResult {
  const value = formalityScore(itemA.formality_level, itemB.formality_level);
  return { value, known: true };
}

/**
 * Texture/material harmony (T)
 * Unknown if either texture is 'unknown'
 */
function computeTextureSignal(
  itemA: ConfidenceItem,
  itemB: ConfidenceItem
): FeatureResult {
  const known =
    itemA.texture_type !== 'unknown' && itemB.texture_type !== 'unknown';

  if (!known) {
    return { value: 0, known: false };
  }

  const value = textureScore(itemA.texture_type, itemB.texture_type);
  return { value, known: true };
}

/**
 * Usage/context alignment (U)
 * Derived from formality and style.
 * Always known in v1: category + formality are always present.
 * When style is unknown, we use formality alone with a conservative default.
 */
function computeUsageSignal(
  itemA: ConfidenceItem,
  itemB: ConfidenceItem
): FeatureResult {
  const styleAKnown = itemA.style_family !== 'unknown';
  const styleBKnown = itemB.style_family !== 'unknown';

  // If both styles known, use full calculation
  if (styleAKnown && styleBKnown) {
    const value = usageScore(
      itemA.formality_level,
      itemB.formality_level,
      itemA.style_family,
      itemB.style_family
    );
    return { value, known: true };
  }

  // Fallback: use formality only with conservative adjustment
  // Formality is always known, so we can always compute a value
  const fScore = formalityScore(itemA.formality_level, itemB.formality_level);

  // When style is unknown, dampen the score slightly toward neutral
  // This makes us less confident without the style context
  // Round to integer after dampening
  const dampened = fScore * 0.7;
  const value = Math.round(dampened);

  return { value, known: true };
}

/**
 * Silhouette balance (V) - v2 feature
 * Only computed if silhouette_enabled flag is true
 * Unknown if either item lacks silhouette profile
 */
function computeSilhouetteSignal(
  itemA: ConfidenceItem,
  itemB: ConfidenceItem
): FeatureResult | undefined {
  // Check if feature is enabled
  if (!FEATURE_FLAGS.silhouette_enabled) {
    return undefined;
  }

  // Check if both items have silhouette profiles
  if (!itemA.silhouette_profile || !itemB.silhouette_profile) {
    return { value: 0, known: false };
  }

  const profA = itemA.silhouette_profile;
  const profB = itemB.silhouette_profile;

  // Unknown volumes = unknown signal
  if (profA.volume === 'unknown' || profB.volume === 'unknown') {
    return { value: 0, known: false };
  }

  // Silhouette scoring rules:
  // - Balanced (fitted + oversized): +2
  // - Regular + anything: +1
  // - Same volume: 0 (can work, not optimal)
  // - Unknown length doesn't affect score

  let value = 0;

  // Volume compatibility
  if (
    (profA.volume === 'fitted' && profB.volume === 'oversized') ||
    (profA.volume === 'oversized' && profB.volume === 'fitted')
  ) {
    // Classic balance
    value = 2;
  } else if (profA.volume === 'regular' || profB.volume === 'regular') {
    // Regular is versatile
    value = 1;
  } else if (profA.volume === profB.volume) {
    // Same volume - neutral
    value = 0;
  }

  return { value, known: true };
}

// ============================================
// MAIN COMPUTATION FUNCTION
// ============================================

/**
 * Compute all feature signals for a pair of items
 */
export function computeFeatureSignals(
  itemA: ConfidenceItem,
  itemB: ConfidenceItem,
  _pairType: PairType // Reserved for future pair-specific logic
): FeatureSignals {
  const signals: FeatureSignals = {
    C: computeColorSignal(itemA, itemB),
    S: computeStyleSignal(itemA, itemB),
    F: computeFormalitySignal(itemA, itemB),
    T: computeTextureSignal(itemA, itemB),
    U: computeUsageSignal(itemA, itemB),
  };

  // Add silhouette signal if enabled
  const vSignal = computeSilhouetteSignal(itemA, itemB);
  if (vSignal !== undefined) {
    signals.V = vSignal;
  }

  return signals;
}

// ============================================
// SIGNAL ANALYSIS HELPERS
// ============================================

/**
 * Count how many features are known
 */
export function countKnownFeatures(signals: FeatureSignals): number {
  let count = 0;
  if (signals.C.known) count++;
  if (signals.S.known) count++;
  if (signals.F.known) count++;
  if (signals.T.known) count++;
  if (signals.U.known) count++;
  if (signals.V?.known) count++;
  return count;
}

/**
 * Get the minimum feature value (most negative signal)
 */
export function getMinFeatureValue(signals: FeatureSignals): number {
  const values: number[] = [];

  if (signals.C.known) values.push(signals.C.value);
  if (signals.S.known) values.push(signals.S.value);
  if (signals.F.known) values.push(signals.F.value);
  if (signals.T.known) values.push(signals.T.value);
  if (signals.U.known) values.push(signals.U.value);
  if (signals.V?.known) values.push(signals.V.value);

  return values.length > 0 ? Math.min(...values) : 0;
}

/**
 * Get the maximum feature value (most positive signal)
 */
export function getMaxFeatureValue(signals: FeatureSignals): number {
  const values: number[] = [];

  if (signals.C.known) values.push(signals.C.value);
  if (signals.S.known) values.push(signals.S.value);
  if (signals.F.known) values.push(signals.F.value);
  if (signals.T.known) values.push(signals.T.value);
  if (signals.U.known) values.push(signals.U.value);
  if (signals.V?.known) values.push(signals.V.value);

  return values.length > 0 ? Math.max(...values) : 0;
}

/**
 * Check if any feature has a strongly negative value (-2)
 */
export function hasStrongNegative(signals: FeatureSignals): boolean {
  if (signals.C.known && signals.C.value <= -2) return true;
  if (signals.S.known && signals.S.value <= -2) return true;
  if (signals.F.known && signals.F.value <= -2) return true;
  if (signals.T.known && signals.T.value <= -2) return true;
  if (signals.U.known && signals.U.value <= -2) return true;
  if (signals.V?.known && signals.V.value <= -2) return true;
  return false;
}
