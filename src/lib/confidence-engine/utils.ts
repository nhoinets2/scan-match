/**
 * Confidence Engine - Utility Functions
 *
 * Pure utility functions for the confidence engine.
 * No side effects, no gates, just calculations.
 */

import type {
  Category,
  PairType,
  ColorProfile,
  StyleFamily,
  ConfidenceItem,
} from './types';

import { getStyleDistance, COVERED_CATEGORIES_MAP, NEVER_COVERED_CATEGORIES } from './config';

// ============================================
// PAIR TYPE UTILITIES
// ============================================

/**
 * Check if either item is shoes
 */
export function hasShoes(itemA: ConfidenceItem, itemB: ConfidenceItem): boolean {
  return itemA.category === 'shoes' || itemB.category === 'shoes';
}

/**
 * Get canonical pair type from two categories.
 * Categories are alphabetically sorted to ensure consistent key.
 */
export function getPairType(catA: Category, catB: Category): PairType | null {
  // Sort alphabetically for consistent key
  const [first, second] = [catA, catB].sort();

  // Build the key
  const key = `${first}_${second}`;

  // Valid pair types
  const validPairTypes: PairType[] = [
    'tops_bottoms',
    'tops_shoes',
    'tops_outerwear',
    'bottoms_shoes',
    'bottoms_outerwear',
    'shoes_outerwear',
    'tops_accessories',
    'bottoms_accessories',
    'shoes_accessories',
    'outerwear_accessories',
    'tops_bags',
    'bottoms_bags',
    'dresses_shoes',
    'dresses_outerwear',
    'dresses_accessories',
    'dresses_bags',
    'skirts_tops',
    'skirts_shoes',
    'skirts_outerwear',
  ];

  // Check if this is a valid pair type
  if (validPairTypes.includes(key as PairType)) {
    return key as PairType;
  }

  // Handle special cases where order matters
  // e.g., 'bottoms_tops' should become 'tops_bottoms'
  const reversed = `${second}_${first}`;
  if (validPairTypes.includes(reversed as PairType)) {
    return reversed as PairType;
  }

  return null;
}

// ============================================
// COLOR UTILITIES
// ============================================

/**
 * Circular hue distance (0-180 range)
 * Hue is 0-360, so max distance is 180
 */
export function hueDist(hueA: number, hueB: number): number {
  const diff = Math.abs(hueA - hueB);
  return Math.min(diff, 360 - diff);
}

/**
 * Color compatibility score (-2 to +2, integers only)
 *
 * Rules:
 * - Both neutrals: +2
 * - One neutral: +1 (neutral pairs with anything, conservative)
 * - Same or analogous hue (≤30°): +2
 * - Complementary (150-180°): +2
 * - Split-comp (120-150°): +1
 * - Triadic (90-120°): 0
 * - Awkward (45-90°): -1
 * - Near-clash (30-45°): -2
 *
 * Saturation modifiers (applied before clamping):
 * - Both high sat + positive score: +1 bonus
 * - Both high sat + negative score: -1 penalty
 * - Both low sat: dampen toward 0
 *
 * Value modifiers:
 * - High contrast (high vs low): +1 bonus
 */
export function colorScore(a: ColorProfile, b: ColorProfile): number {
  // Both neutrals - always works
  if (a.is_neutral && b.is_neutral) {
    return 2;
  }

  // One neutral - pairs well with anything (conservative +1)
  if (a.is_neutral || b.is_neutral) {
    return 1;
  }

  // Both have hues - calculate based on hue distance
  const hueA = a.dominant_hue ?? 0;
  const hueB = b.dominant_hue ?? 0;
  const dist = hueDist(hueA, hueB);

  let score: number;

  if (dist <= 30) {
    // Same or analogous
    score = 2;
  } else if (dist <= 45) {
    // Near-clash zone
    score = -2;
  } else if (dist <= 90) {
    // Awkward zone
    score = -1;
  } else if (dist <= 120) {
    // Triadic
    score = 0;
  } else if (dist <= 150) {
    // Split-complementary
    score = 1;
  } else {
    // Complementary (150-180)
    score = 2;
  }

  // Saturation modifiers
  if (a.saturation === 'high' && b.saturation === 'high') {
    // Both high saturation - amplify (more risk/reward)
    score = score > 0 ? score + 1 : score - 1;
  } else if (a.saturation === 'low' && b.saturation === 'low') {
    // Both low saturation - dampen toward neutral
    // Use (x || 0) to convert -0 to 0
    score = Math.round(score * 0.5) || 0;
  }

  // Value modifiers
  const valueMap = { low: 1, med: 2, high: 3 };
  const valueDiff = Math.abs(valueMap[a.value] - valueMap[b.value]);

  if (valueDiff >= 2) {
    // High contrast - bonus
    score += 1;
  }

  // Clamp to valid range
  return Math.max(-2, Math.min(2, score));
}

// ============================================
// STYLE UTILITIES
// ============================================

/**
 * Style compatibility score (-2 to +2)
 * Wrapper around config's getStyleDistance for consistent API
 */
export function styleScore(a: StyleFamily, b: StyleFamily): number {
  return getStyleDistance(a, b);
}

// ============================================
// FORMALITY UTILITIES
// ============================================

/**
 * Formality alignment score (-2 to +2)
 *
 * Levels: 1 (athleisure) to 5 (formal/black-tie)
 * - Same level: +2
 * - 1 level apart: +1
 * - 2 levels apart: 0
 * - 3 levels apart: -1
 * - 4 levels apart: -2
 */
export function formalityScore(levelA: number, levelB: number): number {
  const diff = Math.abs(levelA - levelB);

  switch (diff) {
    case 0:
      return 2;
    case 1:
      return 1;
    case 2:
      return 0;
    case 3:
      return -1;
    case 4:
    default:
      return -2;
  }
}

// ============================================
// TEXTURE UTILITIES
// ============================================

import type { TextureType } from './types';

/**
 * Texture compatibility score (-2 to +2)
 *
 * Rules:
 * - Same texture: +1 (safe, not exciting)
 * - Unknown involved: 0 (neutral)
 * - Complementary pairs: +2
 *   - smooth + textured
 *   - soft + structured
 * - Neutral pairs: +1
 *   - mixed + anything
 * - Tension pairs: -1
 *   - textured + textured (too busy)
 *   - structured + structured (too rigid)
 */
export function textureScore(a: TextureType, b: TextureType): number {
  // Unknown = neutral
  if (a === 'unknown' || b === 'unknown') {
    return 0;
  }

  // Same texture = safe
  if (a === b) {
    return 1;
  }

  // Check complementary pairs
  const complementaryPairs: [TextureType, TextureType][] = [
    ['smooth', 'textured'],
    ['soft', 'structured'],
  ];

  for (const [t1, t2] of complementaryPairs) {
    if ((a === t1 && b === t2) || (a === t2 && b === t1)) {
      return 2;
    }
  }

  // Mixed pairs with anything = neutral positive
  if (a === 'mixed' || b === 'mixed') {
    return 1;
  }

  // Tension pairs
  const tensionTypes: TextureType[] = ['textured', 'structured'];
  if (tensionTypes.includes(a) && tensionTypes.includes(b) && a !== b) {
    // Different high-impact textures
    return -1;
  }

  // Double textured or double structured
  if (
    (a === 'textured' && b === 'textured') ||
    (a === 'structured' && b === 'structured')
  ) {
    return -1;
  }

  // Default neutral
  return 0;
}

// ============================================
// USAGE/CONTEXT UTILITIES
// ============================================

/**
 * Usage context alignment score (-2 to +2, integers only)
 *
 * This is derived from formality and style alignment.
 * High formality + opposing style = usage mismatch
 * Low formality + matching style = good usage alignment
 */
export function usageScore(
  formalityA: number,
  formalityB: number,
  styleA: StyleFamily,
  styleB: StyleFamily
): number {
  const fScore = formalityScore(formalityA, formalityB);
  const sScore = styleScore(styleA, styleB);

  // Average the two, weighted slightly toward formality
  // Formality is more critical for usage context
  const weighted = fScore * 0.6 + sScore * 0.4;

  // Round to nearest integer, convert -0 to 0
  return Math.round(weighted) || 0;
}

// ============================================
// NORMALIZATION UTILITIES
// ============================================

/**
 * Normalize a raw feature value (-2 to +2) to 0-1 scale
 * -2 → 0.0
 * -1 → 0.25
 *  0 → 0.5
 * +1 → 0.75
 * +2 → 1.0
 */
export function normalizeFeatureValue(value: number): number {
  // Clamp to valid range first
  const clamped = Math.max(-2, Math.min(2, value));
  // Linear transform from [-2, 2] to [0, 1]
  return (clamped + 2) / 4;
}

/**
 * Denormalize a 0-1 value back to -2 to +2 scale
 */
export function denormalizeFeatureValue(normalized: number): number {
  // Clamp to valid range first
  const clamped = Math.max(0, Math.min(1, normalized));
  // Linear transform from [0, 1] to [-2, 2]
  return clamped * 4 - 2;
}

// ============================================
// COVERED CATEGORY UTILITIES
// ============================================

/**
 * Get the "covered" category from a pairType relative to the scanned item.
 *
 * Uses the canonical COVERED_CATEGORIES_MAP from config.
 *
 * Given a pairType and a scannedCategory:
 * - Looks up the pair in COVERED_CATEGORIES_MAP
 * - If scannedCategory matches one of the categories, returns the other
 * - Returns null if:
 *   - pairType is not in the map
 *   - scannedCategory doesn't match either category
 *   - The covered category is in NEVER_COVERED_CATEGORIES (accessories, bags)
 *
 * @example
 * getCoveredCategory('tops_bottoms', 'tops') // returns 'bottoms'
 * getCoveredCategory('tops_bottoms', 'bottoms') // returns 'tops'
 * getCoveredCategory('tops_bottoms', 'shoes') // returns null
 * getCoveredCategory('tops_accessories', 'tops') // returns null (accessories never covered)
 */
export function getCoveredCategory(
  pairType: string,
  scannedCategory: string
): Category | null {
  const mapping = COVERED_CATEGORIES_MAP[pairType];
  if (!mapping) return null;

  const [catA, catB] = mapping;
  let coveredCategory: Category | null = null;

  if (scannedCategory === catA) {
    coveredCategory = catB;
  } else if (scannedCategory === catB) {
    coveredCategory = catA;
  }

  // Never cover accessories or bags - they're always optional
  if (coveredCategory && NEVER_COVERED_CATEGORIES.includes(coveredCategory)) {
    return null;
  }

  return coveredCategory;
}

/**
 * Get all covered categories from a list of HIGH matches.
 *
 * @param matches - Array of pair evaluations with HIGH tier
 * @param scannedCategory - The category of the scanned item
 * @returns Set of categories that are covered by HIGH matches
 */
export function getCoveredCategories(
  matches: Array<{ pair_type: string }>,
  scannedCategory: string
): Set<Category> {
  const covered = new Set<Category>();

  for (const match of matches) {
    const category = getCoveredCategory(match.pair_type, scannedCategory);
    if (category) {
      covered.add(category);
    }
  }

  return covered;
}
