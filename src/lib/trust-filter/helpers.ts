/**
 * Trust Filter v1 - Helper Functions
 *
 * Pure functions for computing distances, gaps, and other derived values.
 */

import { TRUST_FILTER_CONFIG_V1 } from './config';
import type {
  AestheticArchetype,
  AestheticCluster,
  ArchetypeDistance,
  FormalityBand,
  SeasonHeaviness,
  StatementLevel,
  PatternLevel,
  StyleSignalsV1,
  TFCategory,
  PairTypeCategory,
} from './types';

const config = TRUST_FILTER_CONFIG_V1;

// ============================================
// ARCHETYPE → CLUSTER MAPPING
// ============================================

/**
 * Get the cluster for an archetype.
 * Returns null for 'unknown' or 'none'.
 */
export function getClusterForArchetype(
  archetype: AestheticArchetype
): AestheticCluster | null {
  if (archetype === 'unknown' || archetype === 'none') {
    return null;
  }

  for (const [cluster, archetypes] of Object.entries(config.aesthetic.clusters)) {
    if ((archetypes as AestheticArchetype[]).includes(archetype)) {
      return cluster as AestheticCluster;
    }
  }

  return null;
}

// ============================================
// CLUSTER DISTANCE CALCULATION
// ============================================

/**
 * Get base distance between two clusters.
 */
export function getClusterDistance(
  clusterA: AestheticCluster,
  clusterB: AestheticCluster
): ArchetypeDistance {
  return config.aesthetic.cluster_distances[clusterA][clusterB];
}

/**
 * Check if a pair override exists (symmetric lookup).
 */
export function getPairOverride(
  archetypeA: AestheticArchetype,
  archetypeB: AestheticArchetype
): ArchetypeDistance | null {
  const key1 = `${archetypeA}:${archetypeB}`;
  const key2 = `${archetypeB}:${archetypeA}`;

  if (config.aesthetic.pair_overrides[key1]) {
    return config.aesthetic.pair_overrides[key1];
  }
  if (config.aesthetic.pair_overrides[key2]) {
    return config.aesthetic.pair_overrides[key2];
  }

  return null;
}

/**
 * Soften a distance by one level.
 * far → medium, medium → close, close → close
 */
export function softenDistance(distance: ArchetypeDistance): ArchetypeDistance {
  switch (distance) {
    case 'far':
      return 'medium';
    case 'medium':
      return 'close';
    case 'close':
      return 'close';
  }
}

/**
 * Distance comparison (for finding minimum).
 */
export function distanceToNumber(distance: ArchetypeDistance): number {
  switch (distance) {
    case 'close':
      return 0;
    case 'medium':
      return 1;
    case 'far':
      return 2;
  }
}

export function numberToDistance(num: number): ArchetypeDistance {
  if (num <= 0) return 'close';
  if (num === 1) return 'medium';
  return 'far';
}

/**
 * Compute archetype distance between two items.
 * Considers primary archetypes, pair overrides, and optional secondary softening.
 *
 * Returns { distance, usedSecondary }
 */
export function computeArchetypeDistance(
  scanSignals: StyleSignalsV1,
  matchSignals: StyleSignalsV1
): { distance: ArchetypeDistance | null; usedSecondary: boolean } {
  const scanPrimary = scanSignals.aesthetic.primary;
  const matchPrimary = matchSignals.aesthetic.primary;

  // If either primary is unknown, can't compute distance
  if (scanPrimary === 'unknown' || matchPrimary === 'unknown') {
    return { distance: null, usedSecondary: false };
  }

  // Check pair override first
  const override = getPairOverride(scanPrimary, matchPrimary);
  if (override) {
    return { distance: override, usedSecondary: false };
  }

  // Get clusters
  const scanCluster = getClusterForArchetype(scanPrimary);
  const matchCluster = getClusterForArchetype(matchPrimary);

  if (!scanCluster || !matchCluster) {
    return { distance: null, usedSecondary: false };
  }

  // Get base distance from cluster matrix
  let baseDistance = getClusterDistance(scanCluster, matchCluster);
  let usedSecondary = false;

  // Try secondary softening if enabled
  if (config.aesthetic.secondary_usage.allow_secondary_softening) {
    const scanSecondary = scanSignals.aesthetic.secondary;
    const scanSecondaryConf = scanSignals.aesthetic.secondary_confidence;
    const matchSecondary = matchSignals.aesthetic.secondary;
    const matchSecondaryConf = matchSignals.aesthetic.secondary_confidence;

    const secondaryMin = config.confidence_thresholds.secondary_min;

    // Collect valid secondaries
    const candidates: ArchetypeDistance[] = [baseDistance];

    // Try scan secondary with match primary
    if (
      scanSecondary !== 'none' &&
      scanSecondary !== 'unknown' &&
      scanSecondaryConf >= secondaryMin
    ) {
      const scanSecCluster = getClusterForArchetype(scanSecondary);
      if (scanSecCluster) {
        const overrideSec = getPairOverride(scanSecondary, matchPrimary);
        if (overrideSec) {
          candidates.push(overrideSec);
        } else {
          candidates.push(getClusterDistance(scanSecCluster, matchCluster));
        }
      }
    }

    // Try match secondary with scan primary
    if (
      matchSecondary !== 'none' &&
      matchSecondary !== 'unknown' &&
      matchSecondaryConf >= secondaryMin
    ) {
      const matchSecCluster = getClusterForArchetype(matchSecondary);
      if (matchSecCluster) {
        const overrideSec = getPairOverride(scanPrimary, matchSecondary);
        if (overrideSec) {
          candidates.push(overrideSec);
        } else {
          candidates.push(getClusterDistance(scanCluster, matchSecCluster));
        }
      }
    }

    // Find minimum distance (softening only, never strengthen)
    const minDistanceNum = Math.min(...candidates.map(distanceToNumber));
    const minDistance = numberToDistance(minDistanceNum);

    if (distanceToNumber(minDistance) < distanceToNumber(baseDistance)) {
      usedSecondary = true;
      baseDistance = minDistance;
    }
  }

  return { distance: baseDistance, usedSecondary };
}

// ============================================
// FORMALITY GAP CALCULATION
// ============================================

/**
 * Compute formality gap between two items.
 * Returns null if either formality is unknown or below confidence threshold.
 */
export function computeFormalityGap(
  scanSignals: StyleSignalsV1,
  matchSignals: StyleSignalsV1
): number | null {
  const scanBand = scanSignals.formality.band;
  const matchBand = matchSignals.formality.band;
  const scanConf = scanSignals.formality.confidence;
  const matchConf = matchSignals.formality.confidence;

  const minConf = config.confidence_thresholds.formality_min;

  if (scanConf < minConf || matchConf < minConf) {
    return null;
  }

  const scanLevel = config.formality.band_to_level[scanBand];
  const matchLevel = config.formality.band_to_level[matchBand];

  if (scanLevel === null || matchLevel === null) {
    return null;
  }

  return Math.abs(scanLevel - matchLevel);
}

/**
 * Check if either item has a specific formality band.
 */
export function hasFormality(
  scanSignals: StyleSignalsV1,
  matchSignals: StyleSignalsV1,
  band: FormalityBand
): boolean {
  return (
    scanSignals.formality.band === band || matchSignals.formality.band === band
  );
}

// ============================================
// SEASON DIFF CALCULATION
// ============================================

/**
 * Compute season heaviness difference.
 * Returns null if either is unknown or below confidence threshold.
 */
export function computeSeasonDiff(
  scanSignals: StyleSignalsV1,
  matchSignals: StyleSignalsV1
): number | null {
  const scanHeaviness = scanSignals.season.heaviness;
  const matchHeaviness = matchSignals.season.heaviness;
  const scanConf = scanSignals.season.confidence;
  const matchConf = matchSignals.season.confidence;

  const minConf = config.confidence_thresholds.season_min;

  if (scanConf < minConf || matchConf < minConf) {
    return null;
  }

  const scanLevel = config.season.heaviness_to_level[scanHeaviness];
  const matchLevel = config.season.heaviness_to_level[matchHeaviness];

  if (scanLevel === null || matchLevel === null) {
    return null;
  }

  return Math.abs(scanLevel - matchLevel);
}

// ============================================
// STATEMENT LEVEL HELPERS
// ============================================

/**
 * Get statement level as integer.
 * Returns null if unknown or below confidence threshold.
 */
export function getStatementInt(
  signals: StyleSignalsV1
): number | null {
  const level = signals.statement.level;
  const conf = signals.statement.confidence;

  if (conf < config.confidence_thresholds.statement_min) {
    return null;
  }

  return config.statement.level_to_int[level];
}

/**
 * Check if both items have statement level >= threshold.
 */
export function bothStatementGte(
  scanSignals: StyleSignalsV1,
  matchSignals: StyleSignalsV1,
  threshold: number
): boolean {
  const scanStatement = getStatementInt(scanSignals);
  const matchStatement = getStatementInt(matchSignals);

  if (scanStatement === null || matchStatement === null) {
    return false;
  }

  return scanStatement >= threshold && matchStatement >= threshold;
}

/**
 * Check if at least one item has statement level >= threshold.
 */
export function oneStatementGte(
  scanSignals: StyleSignalsV1,
  matchSignals: StyleSignalsV1,
  threshold: number
): boolean {
  const scanStatement = getStatementInt(scanSignals);
  const matchStatement = getStatementInt(matchSignals);

  return (
    (scanStatement !== null && scanStatement >= threshold) ||
    (matchStatement !== null && matchStatement >= threshold)
  );
}

// ============================================
// PATTERN LEVEL HELPERS
// ============================================

/**
 * Get pattern level as integer.
 * Returns null if unknown or below confidence threshold.
 */
export function getPatternInt(signals: StyleSignalsV1): number | null {
  const level = signals.pattern.level;
  const conf = signals.pattern.confidence;

  if (conf < config.confidence_thresholds.pattern_min) {
    return null;
  }

  return config.pattern.level_to_int[level];
}

/**
 * Check if both items have pattern level >= threshold.
 */
export function bothPatternGte(
  scanSignals: StyleSignalsV1,
  matchSignals: StyleSignalsV1,
  threshold: number
): boolean {
  const scanPattern = getPatternInt(scanSignals);
  const matchPattern = getPatternInt(matchSignals);

  if (scanPattern === null || matchPattern === null) {
    return false;
  }

  return scanPattern >= threshold && matchPattern >= threshold;
}

/**
 * Check if at least one item has pattern level >= threshold (bold).
 */
export function onePatternBold(
  scanSignals: StyleSignalsV1,
  matchSignals: StyleSignalsV1
): boolean {
  const scanPattern = getPatternInt(scanSignals);
  const matchPattern = getPatternInt(matchSignals);
  const boldLevel = config.pattern.level_to_int['bold'];

  return (
    (scanPattern !== null && scanPattern >= (boldLevel ?? 2)) ||
    (matchPattern !== null && matchPattern >= (boldLevel ?? 2))
  );
}

// ============================================
// CATEGORY HELPERS
// ============================================

/**
 * Determine pair type for two categories.
 * Returns 'outfit_completing', 'anchor_dependent', or 'other'.
 */
export function getPairType(
  catA: TFCategory,
  catB: TFCategory
): PairTypeCategory {
  const normalized = [catA, catB].sort() as [TFCategory, TFCategory];

  // Check outfit_completing
  for (const pair of config.categories.pair_types.outfit_completing) {
    const sortedPair = [...pair].sort() as [TFCategory, TFCategory];
    if (sortedPair[0] === normalized[0] && sortedPair[1] === normalized[1]) {
      return 'outfit_completing';
    }
  }

  // Check anchor_dependent
  for (const pair of config.categories.pair_types.anchor_dependent) {
    const sortedPair = [...pair].sort() as [TFCategory, TFCategory];
    if (sortedPair[0] === normalized[0] && sortedPair[1] === normalized[1]) {
      return 'anchor_dependent';
    }
  }

  return 'other';
}

/**
 * Check if either category is bags or accessories.
 */
export function isBagsOrAccessories(
  catA: TFCategory,
  catB: TFCategory
): boolean {
  return (
    catA === 'bags' ||
    catA === 'accessories' ||
    catB === 'bags' ||
    catB === 'accessories'
  );
}

/**
 * Check if this is a shoes + tops pair.
 */
export function isShoesTopsPair(catA: TFCategory, catB: TFCategory): boolean {
  return (
    (catA === 'shoes' && catB === 'tops') ||
    (catA === 'tops' && catB === 'shoes')
  );
}

/**
 * Check if either category is skirts.
 */
export function hasSkirts(catA: TFCategory, catB: TFCategory): boolean {
  return catA === 'skirts' || catB === 'skirts';
}

// ============================================
// CONFIDENCE GATE HELPERS
// ============================================

/**
 * Check if both items have sufficient primary aesthetic confidence.
 */
export function hasHighPrimaryConfidence(
  scanSignals: StyleSignalsV1,
  matchSignals: StyleSignalsV1
): boolean {
  const minConf =
    config.aesthetic.hard_clash_rules.emit_style_archetype_hard_clash_if
      .require_primary_confidence_gte;

  return (
    scanSignals.aesthetic.primary_confidence >= minConf &&
    matchSignals.aesthetic.primary_confidence >= minConf
  );
}

/**
 * Check if signals have low confidence on critical fields.
 * Used for low_confidence_inputs reason.
 */
export function hasLowConfidenceInputs(
  scanSignals: StyleSignalsV1,
  matchSignals: StyleSignalsV1
): boolean {
  const thresholds = config.confidence_thresholds;

  // Check if aesthetic confidence is present but low
  const scanAestheticLow =
    scanSignals.aesthetic.primary !== 'unknown' &&
    scanSignals.aesthetic.primary_confidence < thresholds.aesthetic_primary_min;

  const matchAestheticLow =
    matchSignals.aesthetic.primary !== 'unknown' &&
    matchSignals.aesthetic.primary_confidence < thresholds.aesthetic_primary_min;

  // Check if formality confidence is present but low
  const scanFormalityLow =
    scanSignals.formality.band !== 'unknown' &&
    scanSignals.formality.confidence < thresholds.formality_min;

  const matchFormalityLow =
    matchSignals.formality.band !== 'unknown' &&
    matchSignals.formality.confidence < thresholds.formality_min;

  return scanAestheticLow || matchAestheticLow || scanFormalityLow || matchFormalityLow;
}
