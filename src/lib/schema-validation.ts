/**
 * Schema Validation Helpers
 *
 * Category-scoped validation for Volume, Shape, Length, and Tier fields.
 * These prevent TEXT columns from becoming chaos.
 *
 * RULE: Never interpret shape/length without category context.
 */

import type {
  Category,
  Volume,
  Length,
  Shape,
  Tier,
  TopLength,
  OuterwearLength,
  SkirtDressLength,
  BottomShape,
  SkirtShape,
  DressShape,
  ShoeShape,
} from "./types";

// ============================================
// ALLOWED VALUES BY CATEGORY
// ============================================

/**
 * Volume is universal across all categories
 */
export const VOLUME_VALUES: readonly Volume[] = [
  "fitted",
  "regular",
  "oversized",
  "unknown",
] as const;

/**
 * Tier values for item classification
 * - core: Universal basics (rank 10-20) - 1-3 items per category
 * - staple: Versatile everyday pieces (rank 30-50)
 * - style: Vibe-specific items (rank 60-80)
 * - statement: Bold, specific use cases (rank 90+)
 */
export const TIER_VALUES: readonly Tier[] = [
  "core",
  "staple",
  "style",
  "statement",
] as const;

/**
 * Tier to rank range mapping
 */
export const TIER_RANK_RANGES: Record<Tier, { min: number; max: number }> = {
  core: { min: 10, max: 29 },
  staple: { min: 30, max: 59 },
  style: { min: 60, max: 89 },
  statement: { min: 90, max: 999 },
} as const;

/**
 * Length values allowed per category
 * Empty array = length not applicable for this category
 */
export const LENGTH_BY_CATEGORY: Record<Category, readonly string[]> = {
  tops: ["cropped", "regular", "longline"] satisfies readonly TopLength[],
  outerwear: ["cropped", "regular", "long"] satisfies readonly OuterwearLength[],
  dresses: ["mini", "midi", "maxi"] satisfies readonly SkirtDressLength[],
  skirts: ["mini", "midi", "maxi"] satisfies readonly SkirtDressLength[],
  bottoms: [], // no length (use inseam separately if needed)
  shoes: [],
  bags: [],
  accessories: [],
  unknown: [],
} as const;

/**
 * Shape values allowed per category
 * Empty array = shape not applicable for this category
 */
export const SHAPE_BY_CATEGORY: Record<Category, readonly string[]> = {
  bottoms: ["skinny", "straight", "wide", "tapered", "flare", "cargo"] satisfies readonly BottomShape[],
  skirts: ["pencil", "a_line", "pleated"] satisfies readonly SkirtShape[],
  dresses: ["slip", "wrap", "shirt", "bodycon", "fit_flare"] satisfies readonly DressShape[],
  shoes: ["low_profile", "chunky", "heeled", "boot"] satisfies readonly ShoeShape[],
  tops: [], // future: neckline as separate field
  outerwear: [], // future: outerwear_type as separate field
  bags: [],
  accessories: [],
  unknown: [],
} as const;

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Check if a volume value is valid
 */
export function isValidVolume(volume: string | null | undefined): volume is Volume {
  if (!volume) return false;
  return (VOLUME_VALUES as readonly string[]).includes(volume);
}

/**
 * Check if a length value is valid for a given category
 * Returns true if:
 * - length is null/undefined (optional field)
 * - length is in the allowed list for this category
 */
export function isValidLength(
  category: Category,
  length: string | null | undefined
): length is Length | null | undefined {
  if (!length) return true; // optional field
  const allowed = LENGTH_BY_CATEGORY[category];
  return allowed.includes(length);
}

/**
 * Check if a shape value is valid for a given category
 * Returns true if:
 * - shape is null/undefined (optional field)
 * - shape is in the allowed list for this category
 */
export function isValidShape(
  category: Category,
  shape: string | null | undefined
): shape is Shape | null | undefined {
  if (!shape) return true; // optional field
  const allowed = SHAPE_BY_CATEGORY[category];
  return allowed.includes(shape);
}

/**
 * Check if a category supports length
 */
export function categoryHasLength(category: Category): boolean {
  return LENGTH_BY_CATEGORY[category].length > 0;
}

/**
 * Check if a category supports shape
 */
export function categoryHasShape(category: Category): boolean {
  return SHAPE_BY_CATEGORY[category].length > 0;
}

/**
 * Check if a tier value is valid
 */
export function isValidTier(tier: string | null | undefined): tier is Tier {
  if (!tier) return false;
  return (TIER_VALUES as readonly string[]).includes(tier);
}

/**
 * Check if a rank is within the valid range for a tier
 */
export function isRankInTierRange(tier: Tier, rank: number): boolean {
  const range = TIER_RANK_RANGES[tier];
  return rank >= range.min && rank <= range.max;
}

/**
 * Get the expected tier for a given rank
 */
export function getTierForRank(rank: number): Tier {
  if (rank >= 10 && rank <= 29) return "core";
  if (rank >= 30 && rank <= 59) return "staple";
  if (rank >= 60 && rank <= 89) return "style";
  return "statement";
}

// ============================================
// MAPPING FUNCTIONS
// ============================================

/**
 * Map Volume to FitPreference for alignment checks
 * Used by decision tree and preference matching
 */
export function volumeToFitPreference(
  volume: Volume
): "slim" | "regular" | "oversized" | null {
  switch (volume) {
    case "fitted":
      return "slim";
    case "regular":
      return "regular";
    case "oversized":
      return "oversized";
    case "unknown":
      return null;
  }
}

/**
 * Infer volume hint from shape (only when strongly implied)
 * Returns null if no strong inference possible
 */
export function shapeToVolumeHint(shape: Shape): Volume | null {
  switch (shape) {
    // Bottoms
    case "skinny":
      return "fitted";
    case "wide":
      return "oversized";
    // Dresses
    case "bodycon":
      return "fitted";
    case "fit_flare":
      return "fitted"; // fitted bodice
    // Everything else - no strong volume implication
    default:
      return null;
  }
}

// ============================================
// SAFE GETTERS (with fallbacks)
// ============================================

/**
 * Get volume with fallback to "unknown"
 */
export function safeVolume(volume: string | null | undefined): Volume {
  if (isValidVolume(volume)) return volume;
  return "unknown";
}

/**
 * Get length if valid for category, otherwise null
 */
export function safeLength(
  category: Category,
  length: string | null | undefined
): Length | null {
  if (!length) return null;
  if (isValidLength(category, length)) return length as Length;
  return null;
}

/**
 * Get shape if valid for category, otherwise null
 */
export function safeShape(
  category: Category,
  shape: string | null | undefined
): Shape | null {
  if (!shape) return null;
  if (isValidShape(category, shape)) return shape as Shape;
  return null;
}

// ============================================
// VALIDATION FOR DB RECORDS
// ============================================

export interface LibraryItemValidation {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate a library item's volume/shape/length/tier fields
 * Use this when inserting/updating library items
 */
export function validateLibraryItem(item: {
  category: Category;
  volume?: string | null;
  shape?: string | null;
  length?: string | null;
  tier?: string | null;
  rank?: number | null;
}): LibraryItemValidation {
  const errors: string[] = [];

  // Volume validation
  if (item.volume && !isValidVolume(item.volume)) {
    errors.push(
      `Invalid volume "${item.volume}". Allowed: ${VOLUME_VALUES.join(", ")}`
    );
  }

  // Shape validation (category-scoped)
  if (item.shape) {
    const allowedShapes = SHAPE_BY_CATEGORY[item.category];
    if (allowedShapes.length === 0) {
      errors.push(
        `Category "${item.category}" does not support shape. Remove shape field.`
      );
    } else if (!allowedShapes.includes(item.shape)) {
      errors.push(
        `Invalid shape "${item.shape}" for category "${item.category}". Allowed: ${allowedShapes.join(", ")}`
      );
    }
  }

  // Length validation (category-scoped)
  if (item.length) {
    const allowedLengths = LENGTH_BY_CATEGORY[item.category];
    if (allowedLengths.length === 0) {
      errors.push(
        `Category "${item.category}" does not support length. Remove length field.`
      );
    } else if (!allowedLengths.includes(item.length)) {
      errors.push(
        `Invalid length "${item.length}" for category "${item.category}". Allowed: ${allowedLengths.join(", ")}`
      );
    }
  }

  // Tier validation
  if (item.tier && !isValidTier(item.tier)) {
    errors.push(
      `Invalid tier "${item.tier}". Allowed: ${TIER_VALUES.join(", ")}`
    );
  }

  // Tier-rank consistency validation
  if (item.tier && item.rank != null && isValidTier(item.tier)) {
    if (!isRankInTierRange(item.tier, item.rank)) {
      const range = TIER_RANK_RANGES[item.tier as Tier];
      const expectedTier = getTierForRank(item.rank);
      errors.push(
        `Rank ${item.rank} is out of range for tier "${item.tier}" (${range.min}-${range.max}). ` +
        `Expected tier: "${expectedTier}"`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
