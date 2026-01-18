/**
 * Confidence Engine - Configuration
 *
 * All weights, thresholds, adjacency maps, templates, and feature flags.
 * Configuration-driven design allows tuning without code changes.
 */

import type {
  StyleFamily,
  PairType,
  FeatureCode,
  CapReason,
  SuggestionBullet,
  SuggestionTargetCategory,
  Category,
} from './types';
import type { StyleVibe } from '../types';

// ============================================
// FEATURE FLAGS
// ============================================

export const FEATURE_FLAGS = {
  explanations_enabled: true,
  explanations_min_confidence: 'HIGH' as const,
  explanations_allow_shoes: false,
  mode_b_strong_medium_fallback: true,
  silhouette_enabled: false,  // v2
} as const;

// ============================================
// THRESHOLDS
// ============================================

export const THRESHOLDS = {
  // Standard thresholds
  HIGH: 0.78,
  MEDIUM: 0.58,

  // Shoes-specific (stricter)
  HIGH_SHOES: 0.82,

  // Near-match thresholds
  NEAR_MATCH_STRONG_MEDIUM_MIN: 0.70,
} as const;

// ============================================
// FORMALITY TENSION PENALTIES
// ============================================

// ============================================
// WEIGHTS BY PAIR TYPE
// ============================================

type WeightConfig = Record<FeatureCode, number>;

const DEFAULT_WEIGHTS: WeightConfig = {
  C: 0.20,  // Color
  S: 0.20,  // Style
  F: 0.25,  // Formality
  T: 0.15,  // Texture
  U: 0.20,  // Usage/context
  V: 0.00,  // Silhouette (v2, disabled)
};

export const WEIGHTS_BY_PAIR_TYPE: Partial<Record<PairType, WeightConfig>> = {
  tops_bottoms: {
    C: 0.20,
    S: 0.20,
    F: 0.25,
    T: 0.15,
    U: 0.20,
    V: 0.00,  // Redistribute when V enabled in v2
  },
  tops_shoes: {
    C: 0.15,
    S: 0.20,
    F: 0.25,
    T: 0.10,
    U: 0.30,
    V: 0.00,
  },
  bottoms_shoes: {
    C: 0.15,
    S: 0.20,
    F: 0.25,
    T: 0.10,
    U: 0.30,
    V: 0.00,
  },
  tops_outerwear: {
    C: 0.15,
    S: 0.20,
    F: 0.20,
    T: 0.25,
    U: 0.20,
    V: 0.00,
  },
  bottoms_outerwear: {
    C: 0.15,
    S: 0.20,
    F: 0.20,
    T: 0.25,
    U: 0.20,
    V: 0.00,
  },
  shoes_outerwear: {
    C: 0.10,
    S: 0.20,
    F: 0.25,
    T: 0.20,
    U: 0.25,
    V: 0.00,
  },
  dresses_shoes: {
    C: 0.15,
    S: 0.20,
    F: 0.25,
    T: 0.10,
    U: 0.30,
    V: 0.00,
  },
  dresses_outerwear: {
    C: 0.15,
    S: 0.20,
    F: 0.20,
    T: 0.25,
    U: 0.20,
    V: 0.00,
  },
  skirts_tops: {
    C: 0.20,
    S: 0.20,
    F: 0.25,
    T: 0.15,
    U: 0.20,
    V: 0.00,
  },
  skirts_shoes: {
    C: 0.15,
    S: 0.20,
    F: 0.25,
    T: 0.10,
    U: 0.30,
    V: 0.00,
  },
};

export function getWeightsForPairType(pairType: PairType): WeightConfig {
  return WEIGHTS_BY_PAIR_TYPE[pairType] ?? DEFAULT_WEIGHTS;
}

// ============================================
// STYLE FAMILY ADJACENCY
// ============================================

type AdjacencyPair = [StyleFamily, StyleFamily];

// Natural neighbors (+2)
const NATURAL_NEIGHBORS: AdjacencyPair[] = [
  ['minimal', 'classic'],
  ['minimal', 'preppy'],
  ['classic', 'preppy'],
  ['classic', 'romantic'],
  ['street', 'athleisure'],
  ['street', 'edgy'],
  ['romantic', 'boho'],
  ['edgy', 'boho'],
  ['formal', 'classic'],
  ['formal', 'minimal'],
];

// Compatible with restraint (+1)
const COMPATIBLE: AdjacencyPair[] = [
  ['minimal', 'edgy'],
  ['classic', 'boho'],
  ['preppy', 'romantic'],
  ['minimal', 'romantic'],
];

// Tension (-1)
const TENSION: AdjacencyPair[] = [
  ['preppy', 'street'],
  ['romantic', 'street'],
  ['formal', 'boho'],
  ['romantic', 'athleisure'],
  ['athleisure', 'minimal'],   // Sporty/relaxed vs sleek/refined
  ['athleisure', 'classic'],   // Sporty vs polished everyday
];

// Opposing (-2)
const OPPOSING: AdjacencyPair[] = [
  ['formal', 'athleisure'],
  ['formal', 'street'],
  ['preppy', 'edgy'],
];

// Build lookup map
function buildAdjacencyMap(): Map<string, number> {
  const map = new Map<string, number>();

  const addPairs = (pairs: AdjacencyPair[], value: number) => {
    for (const [a, b] of pairs) {
      const key1 = `${a}_${b}`;
      const key2 = `${b}_${a}`;
      map.set(key1, value);
      map.set(key2, value);
    }
  };

  addPairs(NATURAL_NEIGHBORS, 2);
  addPairs(COMPATIBLE, 1);
  addPairs(TENSION, -1);
  addPairs(OPPOSING, -2);

  return map;
}

const STYLE_ADJACENCY_MAP = buildAdjacencyMap();

/**
 * Get style distance between two families.
 * Same family = +2
 * Unknown = 0 (neutral)
 * Otherwise lookup in adjacency map, default 0
 */
export function getStyleDistance(a: StyleFamily, b: StyleFamily): number {
  // Same family = natural neighbors
  if (a === b) return 2;

  // Unknown = neutral
  if (a === 'unknown' || b === 'unknown') return 0;

  // Lookup
  const key = `${a}_${b}`;
  return STYLE_ADJACENCY_MAP.get(key) ?? 0;
}

// ============================================
// MODE B CONFIG
// ============================================

export const SAFE_GENERIC_BULLET = "Let one piece stand out and keep the rest simple.";

export const REASON_PRIORITY: Record<CapReason, number> = {
  FORMALITY_TENSION: 5,
  STYLE_TENSION: 4,
  COLOR_TENSION: 3,
  USAGE_MISMATCH: 2,
  SHOES_CONFIDENCE_DAMPEN: 1,
  TEXTURE_CLASH: 0,
  MISSING_KEY_SIGNAL: 0,
};

// ============================================
// EXPLANATION TEMPLATES
// ============================================

export interface ExplanationTemplate {
  id: string;
  pair_type: PairType | 'any';
  max_specificity_level: 1 | 2 | 3;
  base_text: string;           // Level 1 (abstract)
  soft_variant?: string;       // Level 2 (soft attributes)
  concrete_variant?: string;   // Level 3 (rare)
}

export const EXPLANATION_TEMPLATES: ExplanationTemplate[] = [
  // Top × Bottom
  {
    id: 'top_bottom_balance',
    pair_type: 'tops_bottoms',
    max_specificity_level: 2,
    base_text: "Easy + easy: clean, effortless balance.",
    soft_variant: "The shapes feel consistent, so the outfit reads put-together.",
  },
  {
    id: 'top_bottom_relaxed',
    pair_type: 'tops_bottoms',
    max_specificity_level: 2,
    base_text: "Same level of relaxedness — it looks intentional.",
    soft_variant: "The shapes feel consistent, so the outfit reads put-together.",
  },

  // Top × Shoes
  {
    id: 'top_shoes_cohesive',
    pair_type: 'tops_shoes',
    max_specificity_level: 2,
    base_text: "Simple shoes keep the look cohesive.",
    soft_variant: "The shoe vibe matches the top's energy.",
  },
  {
    id: 'top_shoes_casual',
    pair_type: 'tops_shoes',
    max_specificity_level: 1,
    base_text: "Keeps the outfit grounded and everyday.",
  },

  // Bottom × Shoes
  {
    id: 'bottom_shoes_ground',
    pair_type: 'bottoms_shoes',
    max_specificity_level: 2,
    base_text: "Balanced proportions from the ground up.",
    soft_variant: "They share the same level of polish.",
  },
  {
    id: 'bottom_shoes_function',
    pair_type: 'bottoms_shoes',
    max_specificity_level: 1,
    base_text: "A clean finish that doesn't compete with the silhouette.",
  },

  // Top × Outerwear
  {
    id: 'top_outerwear_structure',
    pair_type: 'tops_outerwear',
    max_specificity_level: 2,
    base_text: "Adds structure without changing the vibe.",
    soft_variant: "A light layer makes it feel finished.",
  },

  // Dress combinations
  {
    id: 'dress_shoes_balance',
    pair_type: 'dresses_shoes',
    max_specificity_level: 2,
    base_text: "Same dressiness level — nothing feels off.",
    soft_variant: "A simple pairing that lets the dress lead.",
  },

  // Generic fallback
  {
    id: 'generic_harmony',
    pair_type: 'any',
    max_specificity_level: 1,
    base_text: "Easy to wear together.",
  },
  {
    id: 'generic_no_compete',
    pair_type: 'any',
    max_specificity_level: 1,
    base_text: "A safe, cohesive pairing.",
  },
];

// ============================================
// EXPLANATION FORBIDDEN RULES
// ============================================

export interface ForbiddenRule {
  id: string;
  reason: string;
}

export const FORBIDDEN_RULE_IDS = {
  STATEMENT_STATEMENT: 'statement_statement',
  SHOES_CONTENTIOUS: 'shoes_contentious',
  TEXTURE_CLASH: 'texture_clash',
  STYLE_OPPOSITION: 'style_opposition',
} as const;

// ============================================
// MODE B CONFIG
// ============================================

export const MODE_B_CONFIG = {
  max_bullets: 3,
  min_bullets: 2,
  excluded_reasons: ['TEXTURE_CLASH'] as CapReason[],
} as const;

// ============================================
// OUTFIT CONFIG
// ============================================

export const OUTFIT_CONFIG = {
  // Individual HIGH matches - show all (no artificial limit on wardrobe items displayed)
  max_matches_shown: 100,
  
  // NOTE: NEAR matches are NOT limited here anymore.
  // - UI (Worth Trying tab, View all) shows ALL qualifying NEAR matches
  // - Mode B suggestions apply their own limit (5) in useConfidenceEngine
  
  // NOTE: Outfit combination limits are handled separately in useResultsTabs:
  // - maxOutfitsPerTab: 5 for single tab, 3 for both tabs
} as const;

// ============================================
// COVERED CATEGORIES MAPPING
// ============================================

/**
 * Canonical mapping of which categories are "covered" by each pair type.
 *
 * When a HIGH match exists for a pair type, the non-scanned category is
 * "covered" - meaning we don't need to suggest items from that category
 * in Mode A suggestions.
 *
 * Key: pair_type
 * Value: [categoryA, categoryB] - the two categories involved
 *
 * To determine covered category:
 * - If scannedCategory === categoryA → coveredCategory = categoryB
 * - If scannedCategory === categoryB → coveredCategory = categoryA
 *
 * Note: Accessories are NEVER "covered" by a match - they're always
 * optional styling pieces, not foundational items.
 */
export const COVERED_CATEGORIES_MAP: Record<string, [Category, Category]> = {
  // Core outfit pairs
  tops_bottoms: ['tops', 'bottoms'],
  tops_shoes: ['tops', 'shoes'],
  tops_outerwear: ['tops', 'outerwear'],
  bottoms_shoes: ['bottoms', 'shoes'],
  bottoms_outerwear: ['bottoms', 'outerwear'],
  shoes_outerwear: ['shoes', 'outerwear'],

  // Dress pairs
  dresses_shoes: ['dresses', 'shoes'],
  dresses_outerwear: ['dresses', 'outerwear'],

  // Skirt pairs
  skirts_tops: ['skirts', 'tops'],
  skirts_shoes: ['skirts', 'shoes'],
  skirts_outerwear: ['skirts', 'outerwear'],

  // Accessory pairs - these do NOT cover the accessory category
  // because accessories are always optional
  tops_accessories: ['tops', 'accessories'],
  bottoms_accessories: ['bottoms', 'accessories'],
  shoes_accessories: ['shoes', 'accessories'],
  outerwear_accessories: ['outerwear', 'accessories'],
  dresses_accessories: ['dresses', 'accessories'],

  // Bag pairs - bags are also optional
  tops_bags: ['tops', 'bags'],
  bottoms_bags: ['bottoms', 'bags'],
  dresses_bags: ['dresses', 'bags'],
} as const;

/**
 * Categories that are NEVER considered "covered" by a match.
 * These are always optional styling pieces.
 */
export const NEVER_COVERED_CATEGORIES: Category[] = ['accessories', 'bags'];

// ============================================
// STYLE-AWARE SUGGESTION TYPES (Internal)
// ============================================

// ============================================
// BULLET KEY TYPES
// ============================================

/**
 * All valid Mode A bullet keys.
 * These are the canonical keys used for tip sheet lookups.
 */
export type ModeABulletKey =
  // TOPS scanned
  | 'TOPS__BOTTOMS_DARK_STRUCTURED'
  | 'TOPS__SHOES_NEUTRAL'
  | 'TOPS__OUTERWEAR_LIGHT_LAYER'
  // BOTTOMS scanned
  | 'BOTTOMS__TOP_NEUTRAL_SIMPLE'
  | 'BOTTOMS__SHOES_EVERYDAY'
  | 'BOTTOMS__OUTERWEAR_OPTIONAL'
  // SHOES scanned
  | 'SHOES__TOP_RELAXED'
  | 'SHOES__BOTTOMS_STRUCTURED'
  | 'SHOES__OUTERWEAR_MINIMAL'
  // OUTERWEAR scanned
  | 'OUTERWEAR__TOP_BASE'
  | 'OUTERWEAR__BOTTOMS_BALANCED'
  | 'OUTERWEAR__SHOES_SIMPLE'
  // DRESSES scanned
  | 'DRESSES__SHOES_SIMPLE'
  | 'DRESSES__OUTERWEAR_LIGHT'
  | 'DRESSES__ACCESSORIES_MINIMAL'
  // SKIRTS scanned
  | 'SKIRTS__TOP_COMPLEMENTARY'
  | 'SKIRTS__SHOES_EVERYDAY'
  | 'SKIRTS__OUTERWEAR_OPTIONAL'
  // BAGS scanned
  | 'BAGS__OUTFIT_CLEAN'
  | 'BAGS__SHOES_NEUTRAL'
  | 'BAGS__ACCESSORIES_MINIMAL'
  // ACCESSORIES scanned
  | 'ACCESSORIES__SHOES_NEUTRAL'
  | 'ACCESSORIES__OUTERWEAR_CLEAN'
  // DEFAULT (fallback)
  | 'DEFAULT__KEEP_SIMPLE'
  | 'DEFAULT__NEUTRAL_COLORS'
  | 'DEFAULT__AVOID_TEXTURE';

/**
 * All valid Mode B bullet keys.
 */
export type ModeBBulletKey =
  // FORMALITY_TENSION
  | 'FORMALITY_TENSION__MATCH_DRESSINESS'
  | 'FORMALITY_TENSION__AVOID_MIX'
  // STYLE_TENSION
  | 'STYLE_TENSION__LET_ONE_LEAD'
  | 'STYLE_TENSION__STICK_CLASSIC'
  // COLOR_TENSION
  | 'COLOR_TENSION__NEUTRAL_OTHERS'
  | 'COLOR_TENSION__CONTRAST_OR_TONAL'
  // USAGE_MISMATCH
  | 'USAGE_MISMATCH__CLEAR_CONTEXT'
  | 'USAGE_MISMATCH__CONSISTENT_PURPOSE'
  // SHOES_CONFIDENCE_DAMPEN
  | 'SHOES_CONFIDENCE_DAMPEN__SIMPLE_SHOES'
  | 'SHOES_CONFIDENCE_DAMPEN__MINIMAL_SHAPE'
  // MISSING_KEY_SIGNAL
  | 'MISSING_KEY_SIGNAL__SIMPLE_VERSATILE'
  // DEFAULT
  | 'DEFAULT__GENERIC_FALLBACK';

/**
 * Union of all valid bullet keys (Mode A + Mode B).
 */
export type BulletKey = ModeABulletKey | ModeBBulletKey;

/**
 * Enhanced bullet with stable key and optional style overrides.
 * Internal only - output is converted to standard SuggestionBullet.
 */
export interface EnhancedSuggestionBullet {
  key: ModeABulletKey;
  text: string;
  target: SuggestionTargetCategory;
  textByStyle?: Partial<Record<StyleVibe, string>>;
}

export interface ModeATemplateV2 {
  intro: string;
  bullets: EnhancedSuggestionBullet[];
}

export interface ModeBBullet {
  key: ModeBBulletKey;
  text: string;
  textByStyle?: Partial<Record<StyleVibe, string>>;
}

// ============================================
// MODE A V2 TEMPLATES (Style-Aware)
// ============================================

/**
 * Mode A templates with stable keys and optional style-aware copy.
 *
 * Keys are namespaced: CATEGORY__DESCRIPTION
 * textByStyle overrides are optional - falls back to default text.
 */
export const MODE_A_TEMPLATES_V2: Record<Category | 'default', ModeATemplateV2> = {
  tops: {
    intro: 'To make this item easy to wear:',
    bullets: [
      {
        key: 'TOPS__BOTTOMS_DARK_STRUCTURED',
        text: 'Dark, structured bottoms',
        target: 'bottoms',
        textByStyle: {
          office: 'Tailored dark trousers',
          minimal: 'Clean-line trousers in a dark neutral',
          street: 'Dark straight-leg jeans or cargo pants',
        },
      },
      {
        key: 'TOPS__SHOES_NEUTRAL',
        text: 'Neutral everyday shoes',
        target: 'shoes',
        textByStyle: {
          office: 'Loafers or simple flats',
          minimal: 'Clean low-profile shoes',
          street: 'Clean white sneakers or simple flats',
        },
      },
      {
        key: 'TOPS__OUTERWEAR_LIGHT_LAYER',
        text: 'Light layer for balance',
        target: 'outerwear',
        textByStyle: {
          office: 'A light blazer or refined cardigan',
          minimal: 'A streamlined coat or simple cardigan',
          street: 'An oversized jacket or zip-up hoodie',
        },
      },
    ],
  },
  bottoms: {
    intro: 'To complete this look:',
    bullets: [
      {
        key: 'BOTTOMS__TOP_NEUTRAL_SIMPLE',
        text: 'Simple top in a neutral tone',
        target: 'tops',
        textByStyle: {
          office: 'A crisp button-down or polished blouse',
          minimal: 'A clean tee or sleek knit top',
          street: 'A relaxed graphic tee or oversized shirt',
        },
      },
      {
        key: 'BOTTOMS__SHOES_EVERYDAY',
        text: "Everyday shoes that don't compete",
        target: 'shoes',
        textByStyle: {
          office: 'Classic loafers or understated heels',
          minimal: 'Simple leather sneakers or ballet flats',
          street: 'Clean sneakers or simple flats',
        },
      },
      {
        key: 'BOTTOMS__OUTERWEAR_OPTIONAL',
        text: 'Optional outer layer for structure',
        target: 'outerwear',
        textByStyle: {
          office: 'A tailored blazer or trench coat',
          minimal: 'A sleek jacket or structured cardigan',
          street: 'A denim jacket or leather jacket',
        },
      },
    ],
  },
  shoes: {
    intro: 'This works best with:',
    bullets: [
      {
        key: 'SHOES__TOP_RELAXED',
        text: 'Relaxed everyday top',
        target: 'tops',
        textByStyle: {
          office: 'A tucked blouse or fitted knit',
          minimal: 'A simple tee or clean sweater',
          street: 'An oversized tee or hoodie',
        },
      },
      {
        key: 'SHOES__BOTTOMS_STRUCTURED',
        text: 'Simple structured bottoms',
        target: 'bottoms',
        textByStyle: {
          office: 'Tailored trousers or straight-leg pants',
          minimal: 'Straight-leg pants in a neutral tone',
          street: 'Relaxed jeans or cargo pants',
        },
      },
      {
        key: 'SHOES__OUTERWEAR_MINIMAL',
        text: 'Minimal layering',
        target: 'outerwear',
        textByStyle: {
          office: 'A light blazer or lightweight jacket',
          minimal: 'A simple jacket or lightweight layer',
          street: 'A utility jacket or lightweight outer layer',
        },
      },
    ],
  },
  outerwear: {
    intro: 'This pairs well with:',
    bullets: [
      {
        key: 'OUTERWEAR__TOP_BASE',
        text: 'Easy base layer',
        target: 'tops',
        textByStyle: {
          office: 'A button-down or fine-knit sweater',
          minimal: 'A fitted tee or simple turtleneck',
          street: 'A graphic tee or relaxed hoodie',
        },
      },
      {
        key: 'OUTERWEAR__BOTTOMS_BALANCED',
        text: 'Balanced bottoms',
        target: 'bottoms',
        textByStyle: {
          office: 'Tailored trousers or wide-leg pants',
          minimal: 'Clean straight-leg pants',
          street: 'Relaxed jeans or wide-leg pants',
        },
      },
      {
        key: 'OUTERWEAR__SHOES_SIMPLE',
        text: 'Simple shoes',
        target: 'shoes',
        textByStyle: {
          office: 'Loafers or simple flats',
          minimal: 'Low-profile sneakers or simple flats',
          street: 'Clean sneakers or simple flats',
        },
      },
    ],
  },
  dresses: {
    intro: 'To complete this look:',
    bullets: [
      {
        key: 'DRESSES__SHOES_SIMPLE',
        text: "Simple shoes that don't compete",
        target: 'shoes',
        textByStyle: {
          office: 'Classic pumps or elegant flats',
          minimal: 'Sleek sandals or simple mules',
          street: 'Clean sneakers or simple flats',
          feminine: 'Ballet flats or delicate heeled sandals',
        },
      },
      {
        key: 'DRESSES__OUTERWEAR_LIGHT',
        text: 'Light outer layer for cooler moments',
        target: 'outerwear',
        textByStyle: {
          office: 'A lightweight blazer or structured cardigan',
          minimal: 'A lightweight trench or light coat',
          street: 'A denim jacket or lightweight blazer',
          feminine: 'A soft cardigan or cropped jacket',
        },
      },
      {
        key: 'DRESSES__ACCESSORIES_MINIMAL',
        text: 'Minimal accessories',
        target: 'accessories',
        textByStyle: {
          office: 'Simple jewelry and a structured bag',
          minimal: 'One understated piece',
          street: 'A cap or simple chain',
          feminine: 'Delicate jewelry or a small bag',
        },
      },
    ],
  },
  skirts: {
    intro: 'To make this item easy to wear:',
    bullets: [
      {
        key: 'SKIRTS__TOP_COMPLEMENTARY',
        text: 'Simple top in a complementary tone',
        target: 'tops',
        textByStyle: {
          office: 'A tucked blouse or fine knit',
          minimal: 'A fitted tee or simple tank',
          street: 'A cropped tee or relaxed button-down',
          feminine: 'A soft blouse or fitted top',
        },
      },
      {
        key: 'SKIRTS__SHOES_EVERYDAY',
        text: 'Everyday shoes',
        target: 'shoes',
        textByStyle: {
          office: 'Loafers or kitten heels',
          minimal: 'Simple flats or low sneakers',
          street: 'Clean sneakers or simple flats',
          feminine: 'Ballet flats or strappy sandals',
        },
      },
      {
        key: 'SKIRTS__OUTERWEAR_OPTIONAL',
        text: 'Optional light layer',
        target: 'outerwear',
        textByStyle: {
          office: 'A cropped blazer or cardigan',
          minimal: 'A simple jacket',
          street: 'A denim or utility jacket',
          feminine: 'A soft cardigan or light jacket',
        },
      },
    ],
  },
  bags: {
    intro: 'This works well with:',
    bullets: [
      {
        key: 'BAGS__OUTFIT_CLEAN',
        text: 'Clean, simple outfit pieces',
        target: 'tops',
        textByStyle: {
          office: 'A polished blouse or fine knit',
          minimal: 'A clean tee or simple top',
          street: 'A relaxed tee or simple sweatshirt',
        },
      },
      {
        key: 'BAGS__SHOES_NEUTRAL',
        text: 'Neutral everyday shoes',
        target: 'shoes',
        textByStyle: {
          office: 'Classic loafers or simple heels',
          minimal: 'Sleek flats or low-profile sneakers',
          street: 'Clean sneakers',
        },
      },
      {
        key: 'BAGS__ACCESSORIES_MINIMAL',
        text: 'Minimal competing accessories',
        target: 'accessories',
      },
    ],
  },
  accessories: {
    intro: 'This complements:',
    bullets: [
      {
        key: 'ACCESSORIES__SHOES_NEUTRAL',
        text: 'Neutral everyday shoes',
        target: 'shoes',
      },
      {
        key: 'ACCESSORIES__OUTERWEAR_CLEAN',
        text: 'Clean layering',
        target: 'outerwear',
      },
    ],
  },
  default: {
    intro: 'To make this item easy to wear:',
    bullets: [
      {
        key: 'DEFAULT__KEEP_SIMPLE',
        text: 'Keep the other pieces simple',
        target: null,
      },
      {
        key: 'DEFAULT__NEUTRAL_COLORS',
        text: 'Choose neutral colors',
        target: null,
      },
      {
        key: 'DEFAULT__AVOID_TEXTURE',
        text: 'Avoid competing textures',
        target: null,
      },
    ],
  },
};

// ============================================
// MODE B V2 TEMPLATES (Style-Aware, Deterministic)
// ============================================

/**
 * Safe fallback bullet when no cap reasons produce bullets.
 */
export const SAFE_GENERIC_BULLET_TEXT =
  'Let one piece stand out and keep the rest simple.';

/**
 * Stable ordering for cap reasons (used as tie-breaker when priorities match).
 * Includes TEXTURE_CLASH for completeness even though Mode B excludes it.
 * Unknown reasons (if any) will sort to the end (index 999).
 */
export const CAP_REASON_STABLE_ORDER: CapReason[] = [
  'FORMALITY_TENSION',
  'STYLE_TENSION',
  'COLOR_TENSION',
  'USAGE_MISMATCH',
  'SHOES_CONFIDENCE_DAMPEN',
  'TEXTURE_CLASH',
  'MISSING_KEY_SIGNAL',
];

/**
 * Mode B bullets by cap reason with stable keys and optional style overrides.
 *
 * Keys are namespaced: REASON__DESCRIPTION to prevent cross-reason collisions.
 * TEXTURE_CLASH is empty (excluded from Mode B via MODE_B_CONFIG).
 */
export const MODE_B_COPY_BY_REASON: Record<CapReason, ModeBBullet[]> = {
  FORMALITY_TENSION: [
    {
      key: 'FORMALITY_TENSION__MATCH_DRESSINESS',
      text: 'Keep the rest of the outfit at the same level of dressiness.',
      textByStyle: {
        office: 'Stick to equally polished pieces throughout.',
        street: 'Keep everything at the same relaxed level.',
      },
    },
    {
      key: 'FORMALITY_TENSION__AVOID_MIX',
      text: 'Avoid mixing very dressy pieces with very casual ones.',
      textByStyle: {
        office: "Don't pair this with overly casual items.",
        street: 'Skip the formal pieces with this.',
      },
    },
  ],
  STYLE_TENSION: [
    {
      key: 'STYLE_TENSION__LET_ONE_LEAD',
      text: 'Let one piece set the vibe, and keep the rest simple.',
      textByStyle: {
        minimal: 'Let this piece stand alone with quiet basics.',
        street:
          'Let this be the statement and keep everything else low-key.',
      },
    },
    {
      key: 'STYLE_TENSION__STICK_CLASSIC',
      text: 'Stick to clean, classic pieces around this item.',
      textByStyle: {
        minimal: 'Pair with understated, streamlined pieces.',
        office: 'Surround it with tailored, neutral staples.',
      },
    },
  ],
  COLOR_TENSION: [
    {
      key: 'COLOR_TENSION__NEUTRAL_OTHERS',
      text: 'Keep the other pieces neutral to avoid competing colors.',
      textByStyle: {
        minimal: 'Stick to tonal neutrals for the rest.',
        street: 'Let this color pop against simple black or white.',
      },
    },
    {
      key: 'COLOR_TENSION__CONTRAST_OR_TONAL',
      text: 'Choose either contrast or tonal color — not both.',
    },
  ],
  USAGE_MISMATCH: [
    {
      key: 'USAGE_MISMATCH__CLEAR_CONTEXT',
      text: 'Match the outfit to one clear context (everyday vs dressy).',
      textByStyle: {
        office: 'Decide: is this for work or weekend?',
        street: 'Keep the whole outfit in the same casual lane.',
      },
    },
    {
      key: 'USAGE_MISMATCH__CONSISTENT_PURPOSE',
      text: 'Keep the look consistent rather than mixing purposes.',
    },
  ],
  SHOES_CONFIDENCE_DAMPEN: [
    {
      key: 'SHOES_CONFIDENCE_DAMPEN__SIMPLE_SHOES',
      text: "Choose simple shoes that don't compete with the outfit.",
      textByStyle: {
        minimal: 'Go for sleek, low-profile shoes.',
        street: 'Clean sneakers work best here.',
        office: "Simple loafers or flats won't fight the look.",
      },
    },
    {
      key: 'SHOES_CONFIDENCE_DAMPEN__MINIMAL_SHAPE',
      text: 'A minimal shoe shape keeps the look more cohesive.',
    },
  ],
  TEXTURE_CLASH: [], // Excluded from Mode B
  MISSING_KEY_SIGNAL: [
    {
      key: 'MISSING_KEY_SIGNAL__SIMPLE_VERSATILE',
      text: 'Keep the other pieces simple and versatile.',
    },
  ],
};

// ============================================
// BULLET TITLE RESOLUTION (Single Source of Truth)
// ============================================

/**
 * Build a flat lookup of all Mode A bullets by key.
 * Used by resolveBulletTitle for O(1) access.
 */
const MODE_A_BULLETS_BY_KEY: Record<string, EnhancedSuggestionBullet> = {};
for (const template of Object.values(MODE_A_TEMPLATES_V2)) {
  for (const bullet of template.bullets) {
    MODE_A_BULLETS_BY_KEY[bullet.key] = bullet;
  }
}

/**
 * Build a flat lookup of all Mode B bullets by key.
 */
const MODE_B_BULLETS_BY_KEY: Record<string, ModeBBullet> = {};
for (const bullets of Object.values(MODE_B_COPY_BY_REASON)) {
  for (const bullet of bullets) {
    MODE_B_BULLETS_BY_KEY[bullet.key] = bullet;
  }
}

/**
 * Check if a string is a valid BulletKey.
 */
export function isValidBulletKey(key: string): key is BulletKey {
  return key in MODE_A_BULLETS_BY_KEY || key in MODE_B_BULLETS_BY_KEY;
}

/**
 * Resolve bullet title from bulletKey + vibe.
 * This is the SINGLE SOURCE OF TRUTH for bullet titles.
 *
 * Resolution order:
 * 1. If vibe is null/undefined → return base title (no style overrides)
 * 2. Mode A bullet with vibe-specific text (textByStyle[vibe])
 * 3. Mode A bullet default text (fallback)
 * 4. Mode B bullet with vibe-specific text
 * 5. Mode B bullet default text
 * 6. null if bulletKey not found (logs warning once per unknown key)
 *
 * @param bulletKey - Typed BulletKey, string, or unknown (for deep links/params)
 * @param vibe - Style vibe for text resolution. If null/undefined, returns base title.
 * @returns Resolved title or null if key not found/invalid
 */

// Warn-once tracker to prevent log spam from repeated deep links
const _warnedBulletKeys = new Set<string>();

export function resolveBulletTitle(
  bulletKey: BulletKey | unknown,
  vibe: StyleVibe | null | undefined
): string | null {
  // Type guard: bulletKey must be a non-empty string
  if (typeof bulletKey !== 'string' || bulletKey.length === 0) {
    if (__DEV__ && bulletKey !== null && bulletKey !== undefined) {
      const keyStr = String(bulletKey);
      if (!_warnedBulletKeys.has(keyStr)) {
        _warnedBulletKeys.add(keyStr);
        console.warn(`[resolveBulletTitle] Invalid bulletKey type: ${typeof bulletKey}`);
      }
    }
    return null;
  }

  // Try Mode A first
  const modeABullet = MODE_A_BULLETS_BY_KEY[bulletKey];
  if (modeABullet) {
    // If vibe not provided, return base title (no style overrides)
    // This prevents showing "wrong vibe" copy before vibe resolves
    if (!vibe) return modeABullet.text;
    return modeABullet.textByStyle?.[vibe] ?? modeABullet.text;
  }

  // Try Mode B
  const modeBBullet = MODE_B_BULLETS_BY_KEY[bulletKey];
  if (modeBBullet) {
    // Same logic: base title if no vibe
    if (!vibe) return modeBBullet.text;
    return modeBBullet.textByStyle?.[vibe] ?? modeBBullet.text;
  }

  // Unknown key - log once for tracking (only in dev)
  if (__DEV__ && !_warnedBulletKeys.has(bulletKey)) {
    _warnedBulletKeys.add(bulletKey);
    console.warn(`[resolveBulletTitle] Unknown bulletKey: "${bulletKey}"`);
  }

  return null;
}

