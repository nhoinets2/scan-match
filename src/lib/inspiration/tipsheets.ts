// src/lib/inspiration/tipsheets.ts
import type { StyleVibe, Category } from "../types";
import { resolveBulletTitle, MODE_B_COPY_BY_REASON } from "../confidence-engine/config";

export type TipSheetMode = "A" | "B";
export type TipSheetVibe = StyleVibe | "default";

export type TipSheetItem = { image: string; label: string };

/** Board kind for Mode B do/don't/try boards */
export type BoardKind = "do" | "dont" | "try";

/** Canonical order for Mode B boards */
export const BOARD_KIND_ORDER: BoardKind[] = ["do", "dont", "try"];

export type TipSheetBundle = {
  /** Board type: do/dont/try (required for Mode B) */
  kind: BoardKind;
  image: string;
  label: string;
  // Optional debug metadata (populated at runtime for better error messages)
  _debug?: {
    packId: string;
    variant: string;
    kind: BoardKind;
  };
};

export type TipSheetVariant = {
  /** @deprecated Hero is no longer used - "do" board serves as visual lead */
  hero?: string;
  examples?: TipSheetItem[]; // product shots (reusable library)
  bundles?: TipSheetBundle[]; // bundle boards (do/dont/try) - must be in order
};

export type TipSheetEntry = {
  mode: TipSheetMode;
  // NOTE: title removed - derive from resolveBulletTitle(bulletKey, vibe)
  subtitle?: string;
  targetCategory?: Category | null; // Mode A CTA uses this
  packId: string; // shared content pack
  order?: number; // optional ordering for UI
};

export type TipPack = {
  variants: Partial<Record<TipSheetVibe, TipSheetVariant>>;
};

export type ResolvedTipSheet = {
  mode: TipSheetMode;
  key: string; // bulletKey
  vibe: TipSheetVibe;
  // NOTE: title removed - derive from resolveBulletTitle(bulletKey, vibe)
  subtitle?: string;
  targetCategory: Category | null; // strict null (null = no CTA)
  /** @deprecated Hero is no longer used - "do" board serves as visual lead */
  hero?: string;
  examples: TipSheetItem[];
  /** Mode B boards in canonical order: [do, dont, try] */
  bundles: TipSheetBundle[];
};

// ─────────────────────────────────────────────
// Library Item Metadata Types (for dynamic bundles)
// ─────────────────────────────────────────────
export type Tone = "light" | "neutral" | "dark";
export type Structure = "soft" | "structured";
export type Formality = "casual" | "smart-casual" | "formal";
export type OuterwearWeight = "light" | "medium" | "heavy";

// DEPRECATED: Use Volume, Shape, Length from types.ts instead
// Kept for backward compatibility during migration
export type ShoeProfile = "minimal" | "statement";
/** @deprecated Use Volume from types.ts */
export type Silhouette = "fitted" | "straight" | "wide" | "oversized";

// Import new hybrid schema types
import type { Volume, Shape, Length, Tier } from "../types";

export interface LibraryItemMeta {
  id: string;
  rank: number; // stable sort order
  tier?: Tier; // classification: core | staple | style | statement
  image: string;
  label: string;
  category: Category;
  vibes: TipSheetVibe[];
  // Filtering tags
  tone?: Tone;
  structure?: Structure;
  formality?: Formality;
  outerwearWeight?: OuterwearWeight;
  // NEW: Hybrid schema fields (volume + shape + length)
  volume?: Volume;
  shape?: Shape;
  length?: Length;
  // DEPRECATED: Use volume/shape instead
  /** @deprecated Use shape instead for shoes */
  shoeProfile?: ShoeProfile;
  /** @deprecated Use volume instead */
  silhouette?: Silhouette;
}

/**
 * Paths for bundle assets
 *
 * Mode A: Local assets (legacy, not used - library items come from Supabase DB)
 * Mode B: Supabase Storage URLs for do/don't/try boards
 */
const BUNDLES_A = "assets/inspiration/bundles/modeA/packs";

// Supabase Storage config for Mode B boards
const BUCKET = "library-item";
const BOARDS_PATH = "boards";

/**
 * Get Supabase URL from environment (fail fast if missing)
 */
const getSupabaseUrl = (): string => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_SUPABASE_URL is missing. Set it in your environment or .env file."
    );
  }
  return url.replace(/\/$/, ""); // Remove trailing slash if present
};

/**
 * Get public bucket URL for Mode B boards (lazy, avoids crash-on-import)
 */
const getPublicBucketUrl = (): string => {
  return `${getSupabaseUrl()}/storage/v1/object/public/${BUCKET}`;
};

const modeABundle = (packId: string, vibe: TipSheetVibe, n: 1 | 2 | 3) =>
  `${BUNDLES_A}/${packId}/${vibe}/bundle_0${n}.webp`;

// Mode B variant type (currently only "default", but can add vibe variants later)
type ModeBVariant = "default" | TipSheetVibe;
/** File types for Mode B boards (hero deprecated, use "do" as visual lead) */
type ModeBFile = "do" | "dont" | "try";

/**
 * Generate Supabase Storage URL for Mode B boards (hero/do/don't/try)
 */
const modeBBundle = (packId: string, variant: ModeBVariant, file: ModeBFile) =>
  `${getPublicBucketUrl()}/${BOARDS_PATH}/${packId}/${variant}/${file}.webp`;

/**
 * Library items with metadata for dynamic bundle generation.
 *
 * NOTE: Local library data has been removed. Library items are now
 * fetched from Supabase Storage. These empty arrays serve as fallback
 * when Supabase is unavailable.
 *
 * To populate library items:
 * 1. Upload images to Supabase Storage "library-items" bucket
 * 2. Insert records into the library_items table with image URLs
 * 3. The app will fetch and display them via useLibraryItems() hook
 */

// ─────────────────────────────────────────────
// LIBRARY BY CATEGORY (indexed for dynamic bundles)
// ─────────────────────────────────────────────
export const LIBRARY_BY_CATEGORY: Record<Category, LibraryItemMeta[]> = {
  tops: [],
  bottoms: [],
  outerwear: [],
  shoes: [],
  bags: [],
  accessories: [],
  dresses: [],
  skirts: [],
  unknown: [],
};

// Helper to get item by ID across all categories
export function getLibraryItemById(id: string): LibraryItemMeta | undefined {
  for (const items of Object.values(LIBRARY_BY_CATEGORY)) {
    const found = items.find((item) => item.id === id);
    if (found) return found;
  }
  return undefined;
}

// ─────────────────────────────────────────────
// Legacy LIB_* accessors (for backward compatibility with TIP_PACKS)
// ─────────────────────────────────────────────
const toImageMap = <T extends string>(
  items: LibraryItemMeta[]
): Record<T, string> =>
  items.reduce(
    (acc, item) => {
      acc[item.id as T] = item.image;
      return acc;
    },
    {} as Record<T, string>
  );

const LIB_TOPS = toImageMap(LIBRARY_BY_CATEGORY.tops);
const LIB_BOTTOMS = toImageMap(LIBRARY_BY_CATEGORY.bottoms);
const LIB_OUTERWEAR = toImageMap(LIBRARY_BY_CATEGORY.outerwear);
const LIB_SHOES = toImageMap(LIBRARY_BY_CATEGORY.shoes);
const LIB_BAGS = toImageMap(LIBRARY_BY_CATEGORY.bags);
const LIB_ACCESSORIES = toImageMap(LIBRARY_BY_CATEGORY.accessories);
const LIB_DRESSES = toImageMap(LIBRARY_BY_CATEGORY.dresses);
const LIB_SKIRTS = toImageMap(LIBRARY_BY_CATEGORY.skirts);

/**
 * Packs (shared content buckets)
 * Add vibe variants later by creating folders:
 *  assets/inspiration/bundles/modeA/packs/<packId>/office/bundle_01.webp ...
 * This resolver will pick them automatically.
 */
export const TIP_PACKS: Record<string, TipPack> = {
  // =========================
  // MODE A PACKS
  // =========================

  A_bottoms_dark_structured: {
    variants: {
      default: {
        hero: modeABundle("A_bottoms_dark_structured", "default", 1),
        examples: [
          { image: LIB_BOTTOMS.trouserBlack, label: "Black tailored trousers" },
          { image: LIB_BOTTOMS.widelegBlack, label: "Black wide-leg trousers" },
          { image: LIB_BOTTOMS.jeanDark, label: "Dark straight jeans" },
          { image: LIB_BOTTOMS.midiSkirtBlack, label: "Black midi skirt" },
          { image: LIB_BOTTOMS.trouserBeige, label: "Beige tailored trousers" },
          { image: LIB_BOTTOMS.cargoBlack, label: "Black cargos (street)" },
        ],
        bundles: [
          {
            kind: "do",
            image: modeABundle("A_bottoms_dark_structured", "default", 1),
            label: "Tailored bottom + simple top + clean shoes",
          },
          {
            kind: "dont",
            image: modeABundle("A_bottoms_dark_structured", "default", 2),
            label: "Skirt + polished top + understated shoes",
          },
          {
            kind: "try",
            image: modeABundle("A_bottoms_dark_structured", "default", 3),
            label: "Dark denim + knit + structured layer",
          },
        ],
      },
      minimal: {
        hero: modeABundle("A_bottoms_dark_structured", "minimal", 1),
        examples: [
          { image: LIB_BOTTOMS.trouserBeige, label: "Neutral tailored trousers" },
          { image: LIB_BOTTOMS.midiSkirtNeutral, label: "Neutral midi skirt" },
          { image: LIB_BOTTOMS.leggingBlack, label: "Neutral leggings" },
          { image: LIB_BOTTOMS.pleatedCream, label: "Cream pleated skirt" },
          { image: LIB_BOTTOMS.widelegBlack, label: "Neutral wide-leg trousers" },
          { image: LIB_BOTTOMS.jeanBlue, label: "Light neutral denim" },
        ],
        bundles: [
          {
            kind: "do",
            image: modeABundle("A_bottoms_dark_structured", "minimal", 1),
            label: "Neutral tailored bottom + simple top + minimal shoes",
          },
          {
            kind: "dont",
            image: modeABundle("A_bottoms_dark_structured", "minimal", 2),
            label: "Neutral skirt + clean top + understated shoes",
          },
          {
            kind: "try",
            image: modeABundle("A_bottoms_dark_structured", "minimal", 3),
            label: "Neutral leggings + knit + streamlined layer",
          },
        ],
      },
    },
  },

  A_shoes_neutral_everyday: {
    variants: {
      default: {
        hero: modeABundle("A_shoes_neutral_everyday", "default", 1),
        examples: [
          {
            image: LIB_SHOES.sneakerWhiteMinimal,
            label: "Minimal white sneakers",
          },
          { image: LIB_SHOES.loaferBlack, label: "Black loafers" },
          { image: LIB_SHOES.flatBlack, label: "Simple black flats" },
          { image: LIB_SHOES.balletNeutral, label: "Neutral ballet flats" },
          { image: LIB_SHOES.bootAnkleBlack, label: "Black ankle boots" },
          {
            image: LIB_SHOES.sandalStrappyNeutral,
            label: "Neutral strappy sandals",
          },
        ],
        bundles: [
          {
            kind: "do",
            image: modeABundle("A_shoes_neutral_everyday", "default", 1),
            label: "Jeans + tee + minimal sneakers",
          },
          {
            kind: "dont",
            image: modeABundle("A_shoes_neutral_everyday", "default", 2),
            label: "Tailored trousers + knit + loafers",
          },
          {
            kind: "try",
            image: modeABundle("A_shoes_neutral_everyday", "default", 3),
            label: "Dress + flats + simple layer",
          },
        ],
      },
    },
  },

  A_outerwear_light_layer: {
    variants: {
      default: {
        hero: modeABundle("A_outerwear_light_layer", "default", 1),
        examples: [
          { image: LIB_OUTERWEAR.cardiganNeutral, label: "Neutral cardigan" },
          { image: LIB_OUTERWEAR.trenchBeige, label: "Beige trench" },
          { image: LIB_OUTERWEAR.blazerBlack, label: "Black blazer" },
          { image: LIB_OUTERWEAR.denimBlue, label: "Blue denim jacket" },
          { image: LIB_OUTERWEAR.bomberBlack, label: "Black bomber" },
          {
            image: LIB_OUTERWEAR.oversizedBlazerGrey,
            label: "Oversized blazer (street)",
          },
        ],
        bundles: [
          {
            kind: "do",
            image: modeABundle("A_outerwear_light_layer", "default", 1),
            label: "Casual base + denim layer",
          },
          {
            kind: "dont",
            image: modeABundle("A_outerwear_light_layer", "default", 2),
            label: "Dress + trench",
          },
          {
            kind: "try",
            image: modeABundle("A_outerwear_light_layer", "default", 3),
            label: "Soft feminine base + cardigan",
          },
        ],
      },
    },
  },

  A_tops_neutral_simple: {
    variants: {
      default: {
        hero: modeABundle("A_tops_neutral_simple", "default", 1),
        examples: [
          { image: LIB_TOPS.teeWhite, label: "White tee" },
          { image: LIB_TOPS.tankCream, label: "Cream tank" },
          { image: LIB_TOPS.knitBlack, label: "Black knit" },
          { image: LIB_TOPS.turtleneckBlack, label: "Black turtleneck" },
          { image: LIB_TOPS.blouseWhite, label: "White blouse" },
          { image: LIB_TOPS.buttondownBlue, label: "Blue button-down" },
        ],
        bundles: [
          {
            kind: "do",
            image: modeABundle("A_tops_neutral_simple", "default", 1),
            label: "Neutral top + tailored bottom",
          },
          {
            kind: "dont",
            image: modeABundle("A_tops_neutral_simple", "default", 2),
            label: "Neutral top + denim + clean shoes",
          },
          {
            kind: "try",
            image: modeABundle("A_tops_neutral_simple", "default", 3),
            label: "Neutral top + skirt + simple shoes",
          },
        ],
      },
    },
  },

  A_shoes_dont_compete: {
    variants: {
      default: {
        hero: modeABundle("A_shoes_dont_compete", "default", 1),
        examples: [
          { image: LIB_SHOES.flatBlack, label: "Simple black flats" },
          { image: LIB_SHOES.loaferBlack, label: "Black loafers" },
          {
            image: LIB_SHOES.sneakerWhiteMinimal,
            label: "Minimal sneakers",
          },
          { image: LIB_SHOES.heelBlackSimple, label: "Simple heel" },
          { image: LIB_SHOES.balletNeutral, label: "Neutral ballet flats" },
          { image: LIB_SHOES.sandalStrappyNeutral, label: "Neutral sandals" },
        ],
        bundles: [
          {
            kind: "do",
            image: modeABundle("A_shoes_dont_compete", "default", 1),
            label: "Let the outfit lead, keep shoes quiet",
          },
          {
            kind: "dont",
            image: modeABundle("A_shoes_dont_compete", "default", 2),
            label: "Polished base + understated shoes",
          },
          {
            kind: "try",
            image: modeABundle("A_shoes_dont_compete", "default", 3),
            label: "Dress + minimal shoes",
          },
        ],
      },
    },
  },

  A_outerwear_optional_structure: {
    variants: {
      default: {
        hero: modeABundle("A_outerwear_optional_structure", "default", 1),
        examples: [
          { image: LIB_OUTERWEAR.blazerBlack, label: "Structured blazer" },
          { image: LIB_OUTERWEAR.trenchBeige, label: "Trench coat" },
          { image: LIB_OUTERWEAR.coatCharcoal, label: "Wool coat" },
          {
            image: LIB_OUTERWEAR.oversizedBlazerGrey,
            label: "Oversized blazer",
          },
          { image: LIB_OUTERWEAR.denimBlue, label: "Denim jacket" },
          { image: LIB_OUTERWEAR.bomberBlack, label: "Bomber jacket" },
        ],
        bundles: [
          {
            kind: "do",
            image: modeABundle("A_outerwear_optional_structure", "default", 1),
            label: "Add structure to a simple base",
          },
          {
            kind: "dont",
            image: modeABundle("A_outerwear_optional_structure", "default", 2),
            label: "Tailored layer for a polished look",
          },
          {
            kind: "try",
            image: modeABundle("A_outerwear_optional_structure", "default", 3),
            label: "Dress + blazer (easy upgrade)",
          },
        ],
      },
    },
  },

  A_tops_relaxed_everyday: {
    variants: {
      default: {
        hero: modeABundle("A_tops_relaxed_everyday", "default", 1),
        examples: [
          { image: LIB_TOPS.oversizedTeeBlack, label: "Oversized tee" },
          { image: LIB_TOPS.hoodieGrey, label: "Grey hoodie" },
          { image: LIB_TOPS.teeWhite, label: "White tee" },
          { image: LIB_TOPS.teeBlack, label: "Black tee" },
          { image: LIB_TOPS.knitBlack, label: "Simple knit" },
          { image: LIB_TOPS.tankCream, label: "Cream tank" },
        ],
        bundles: [
          {
            kind: "do",
            image: modeABundle("A_tops_relaxed_everyday", "default", 1),
            label: "Relaxed top + denim + sneakers",
          },
          {
            kind: "dont",
            image: modeABundle("A_tops_relaxed_everyday", "default", 2),
            label: "Hoodie + leggings + trainers",
          },
          {
            kind: "try",
            image: modeABundle("A_tops_relaxed_everyday", "default", 3),
            label: "Relaxed knit + wide-leg trousers",
          },
        ],
      },
    },
  },

  A_bottoms_simple_structured: {
    variants: {
      default: {
        hero: modeABundle("A_bottoms_simple_structured", "default", 1),
        examples: [
          { image: LIB_BOTTOMS.trouserBlack, label: "Black trousers" },
          { image: LIB_BOTTOMS.trouserBeige, label: "Beige trousers" },
          { image: LIB_BOTTOMS.jeanBlue, label: "Straight jeans" },
          { image: LIB_BOTTOMS.widelegBlack, label: "Wide-leg trousers" },
          { image: LIB_BOTTOMS.midiSkirtBlack, label: "Black midi skirt" },
          { image: LIB_BOTTOMS.midiSkirtNeutral, label: "Neutral midi skirt" },
        ],
        bundles: [
          {
            kind: "do",
            image: modeABundle("A_bottoms_simple_structured", "default", 1),
            label: "Tailored bottoms + simple top",
          },
          {
            kind: "dont",
            image: modeABundle("A_bottoms_simple_structured", "default", 2),
            label: "Straight jeans + clean knit",
          },
          {
            kind: "try",
            image: modeABundle("A_bottoms_simple_structured", "default", 3),
            label: "Wide-leg + streamlined top",
          },
        ],
      },
    },
  },

  A_outerwear_minimal_layering: {
    variants: {
      default: {
        hero: modeABundle("A_outerwear_minimal_layering", "default", 1),
        examples: [
          { image: LIB_OUTERWEAR.cardiganNeutral, label: "Neutral cardigan" },
          { image: LIB_OUTERWEAR.trenchBeige, label: "Trench" },
          { image: LIB_OUTERWEAR.blazerBlack, label: "Blazer" },
          { image: LIB_OUTERWEAR.denimBlue, label: "Denim jacket" },
          { image: LIB_OUTERWEAR.zipupTrackBlack, label: "Clean zip-up" },
          { image: LIB_OUTERWEAR.coatCharcoal, label: "Wool coat" },
        ],
        bundles: [
          {
            kind: "do",
            image: modeABundle("A_outerwear_minimal_layering", "default", 1),
            label: "One clean layer, no extra noise",
          },
          {
            kind: "dont",
            image: modeABundle("A_outerwear_minimal_layering", "default", 2),
            label: "Polished layer over a simple base",
          },
          {
            kind: "try",
            image: modeABundle("A_outerwear_minimal_layering", "default", 3),
            label: "Dress + single outer layer",
          },
        ],
      },
    },
  },

  A_tops_easy_base_layer: {
    variants: {
      default: {
        hero: modeABundle("A_tops_easy_base_layer", "default", 1),
        examples: [
          { image: LIB_TOPS.turtleneckBlack, label: "Thin turtleneck" },
          { image: LIB_TOPS.knitBlack, label: "Simple knit" },
          { image: LIB_TOPS.teeWhite, label: "White tee" },
          { image: LIB_TOPS.blouseWhite, label: "White blouse" },
          { image: LIB_TOPS.buttondownBlue, label: "Button-down" },
          { image: LIB_TOPS.tankCream, label: "Cream tank" },
        ],
        bundles: [
          {
            kind: "do",
            image: modeABundle("A_tops_easy_base_layer", "default", 1),
            label: "Base top + structured bottom",
          },
          {
            kind: "dont",
            image: modeABundle("A_tops_easy_base_layer", "default", 2),
            label: "Base top + denim + outer layer",
          },
          {
            kind: "try",
            image: modeABundle("A_tops_easy_base_layer", "default", 3),
            label: "Base top + skirt + light layer",
          },
        ],
      },
    },
  },

  A_bottoms_balanced: {
    variants: {
      default: {
        hero: modeABundle("A_bottoms_balanced", "default", 1),
        examples: [
          { image: LIB_BOTTOMS.jeanBlue, label: "Straight jeans" },
          { image: LIB_BOTTOMS.widelegBlack, label: "Wide-leg trousers" },
          { image: LIB_BOTTOMS.midiSkirtNeutral, label: "Neutral midi skirt" },
          { image: LIB_BOTTOMS.trouserBeige, label: "Tailored trousers" },
          { image: LIB_BOTTOMS.leggingBlack, label: "Black leggings (sporty)" },
          { image: LIB_BOTTOMS.cargoBlack, label: "Cargo pants (street)" },
        ],
        bundles: [
          {
            kind: "do",
            image: modeABundle("A_bottoms_balanced", "default", 1),
            label: "Balanced proportions",
          },
          {
            kind: "dont",
            image: modeABundle("A_bottoms_balanced", "default", 2),
            label: "Tonal and clean",
          },
          {
            kind: "try",
            image: modeABundle("A_bottoms_balanced", "default", 3),
            label: "Skirt + simple top + simple shoes",
          },
        ],
      },
    },
  },

  A_shoes_simple: {
    variants: {
      default: {
        hero: modeABundle("A_shoes_simple", "default", 1),
        examples: [
          { image: LIB_SHOES.loaferBlack, label: "Loafers" },
          { image: LIB_SHOES.flatBlack, label: "Flats" },
          { image: LIB_SHOES.sneakerWhiteMinimal, label: "Minimal sneakers" },
          { image: LIB_SHOES.bootAnkleBlack, label: "Ankle boots" },
          { image: LIB_SHOES.balletNeutral, label: "Ballet flats" },
          { image: LIB_SHOES.heelBlackSimple, label: "Simple heel" },
        ],
        bundles: [
          {
            kind: "do",
            image: modeABundle("A_shoes_simple", "default", 1),
            label: "Dress + simple shoes",
          },
          {
            kind: "dont",
            image: modeABundle("A_shoes_simple", "default", 2),
            label: "Denim + tee + clean shoes",
          },
          {
            kind: "try",
            image: modeABundle("A_shoes_simple", "default", 3),
            label: "Tailored base + understated shoes",
          },
        ],
      },
    },
  },

  A_accessories_minimal: {
    variants: {
      default: {
        hero: modeABundle("A_accessories_minimal", "default", 1),
        examples: [
          { image: LIB_ACCESSORIES.hoopsGold, label: "Small hoops" },
          { image: LIB_ACCESSORIES.chainGold, label: "Thin chain" },
          { image: LIB_ACCESSORIES.watchMinimal, label: "Minimal watch" },
          { image: LIB_ACCESSORIES.beltBlack, label: "Simple belt" },
          {
            image: LIB_ACCESSORIES.sunglassesClassic,
            label: "Classic sunglasses",
          },
          { image: LIB_ACCESSORIES.braceletMinimal, label: "Minimal bracelet" },
        ],
        bundles: [
          {
            kind: "do",
            image: modeABundle("A_accessories_minimal", "default", 1),
            label: "One simple detail",
          },
          {
            kind: "dont",
            image: modeABundle("A_accessories_minimal", "default", 2),
            label: "Polished but minimal",
          },
          {
            kind: "try",
            image: modeABundle("A_accessories_minimal", "default", 3),
            label: "Soft feminine accents",
          },
        ],
      },
    },
  },

  A_outfit_clean_simple: {
    variants: {
      default: {
        hero: modeABundle("A_outfit_clean_simple", "default", 1),
        examples: [
          { image: LIB_TOPS.teeWhite, label: "Simple top" },
          { image: LIB_BOTTOMS.jeanBlue, label: "Straight jeans" },
          { image: LIB_SHOES.sneakerWhiteMinimal, label: "Clean shoes" },
          { image: LIB_BAGS.crossbodyNeutral, label: "Neutral bag" },
          { image: LIB_OUTERWEAR.blazerBlack, label: "Structured layer" },
          { image: LIB_SHOES.loaferBlack, label: "Polished shoe option" },
        ],
        bundles: [
          {
            kind: "do",
            image: modeABundle("A_outfit_clean_simple", "default", 1),
            label: "Everyday clean basics",
          },
          {
            kind: "dont",
            image: modeABundle("A_outfit_clean_simple", "default", 2),
            label: "Neutral + structured",
          },
          {
            kind: "try",
            image: modeABundle("A_outfit_clean_simple", "default", 3),
            label: "Dress lane, still simple",
          },
        ],
      },
    },
  },

  A_palette_neutral: {
    variants: {
      default: {
        hero: modeABundle("A_palette_neutral", "default", 1),
        examples: [
          { image: LIB_TOPS.tankCream, label: "Cream" },
          { image: LIB_BOTTOMS.trouserBeige, label: "Beige" },
          { image: LIB_OUTERWEAR.trenchBeige, label: "Warm neutral" },
          { image: LIB_TOPS.teeWhite, label: "White" },
          { image: LIB_TOPS.teeBlack, label: "Black" },
          { image: LIB_SHOES.flatBlack, label: "Black shoe" },
        ],
        bundles: [
          {
            kind: "do",
            image: modeABundle("A_palette_neutral", "default", 1),
            label: "Warm neutrals",
          },
          {
            kind: "dont",
            image: modeABundle("A_palette_neutral", "default", 2),
            label: "Black & white",
          },
          {
            kind: "try",
            image: modeABundle("A_palette_neutral", "default", 3),
            label: "Neutral dress set",
          },
        ],
      },
    },
  },

  A_texture_avoid_competing: {
    variants: {
      default: {
        hero: modeABundle("A_texture_avoid_competing", "default", 1),
        examples: [
          { image: LIB_TOPS.knitBlack, label: "Knit (soft)" },
          { image: LIB_OUTERWEAR.denimBlue, label: "Denim (casual)" },
          { image: LIB_DRESSES.slipNeutral, label: "Slip (smooth)" },
          { image: LIB_BOTTOMS.trouserBlack, label: "Tailored (smooth)" },
          { image: LIB_SHOES.loaferBlack, label: "Simple leather" },
          { image: LIB_ACCESSORIES.beltBlack, label: "Minimal hardware" },
        ],
        bundles: [
          {
            kind: "do",
            image: modeABundle("A_texture_avoid_competing", "default", 1),
            label: "Keep textures in one lane",
          },
          {
            kind: "dont",
            image: modeABundle("A_texture_avoid_competing", "default", 2),
            label: "Casual textures together",
          },
          {
            kind: "try",
            image: modeABundle("A_texture_avoid_competing", "default", 3),
            label: "Smooth + structured combo",
          },
        ],
      },
    },
  },

  // =========================
  // MODE B PACKS
  // =========================

  B_formality_tension: {
    variants: {
      default: {
        bundles: [
          {
            kind: "do",
            image: modeBBundle("B_formality_tension", "default", "do"),
            label: "Do: keep dressiness consistent",
          },
          {
            kind: "dont",
            image: modeBBundle("B_formality_tension", "default", "dont"),
            label: "Avoid: mixing very formal + very casual",
          },
          {
            kind: "try",
            image: modeBBundle("B_formality_tension", "default", "try"),
            label: "Try: swap one piece to match the lane",
          },
        ],
      },
    },
  },

  B_style_tension: {
    variants: {
      default: {
        bundles: [
          {
            kind: "do",
            image: modeBBundle("B_style_tension", "default", "do"),
            label: "Do: let one piece lead, keep the rest quiet",
          },
          {
            kind: "dont",
            image: modeBBundle("B_style_tension", "default", "dont"),
            label: "Avoid: competing style signals",
          },
          {
            kind: "try",
            image: modeBBundle("B_style_tension", "default", "try"),
            label: "Try: simplify the surrounding pieces",
          },
        ],
      },
    },
  },

  B_color_tension: {
    variants: {
      default: {
        bundles: [
          {
            kind: "do",
            image: modeBBundle("B_color_tension", "default", "do"),
            label: "Do: one focal color + neutrals",
          },
          {
            kind: "dont",
            image: modeBBundle("B_color_tension", "default", "dont"),
            label: "Avoid: multiple competing colors",
          },
          {
            kind: "try",
            image: modeBBundle("B_color_tension", "default", "try"),
            label: "Try: tonal outfit with one accent",
          },
        ],
      },
    },
  },

  B_usage_mismatch: {
    variants: {
      default: {
        bundles: [
          {
            kind: "do",
            image: modeBBundle("B_usage_mismatch", "default", "do"),
            label: "Do: dress for one clear context",
          },
          {
            kind: "dont",
            image: modeBBundle("B_usage_mismatch", "default", "dont"),
            label: "Avoid: mixing work + workout cues",
          },
          {
            kind: "try",
            image: modeBBundle("B_usage_mismatch", "default", "try"),
            label: "Try: swap one piece to match the purpose",
          },
        ],
      },
    },
  },

  B_shoes_confidence_dampen: {
    variants: {
      default: {
        bundles: [
          {
            kind: "do",
            image: modeBBundle("B_shoes_confidence_dampen", "default", "do"),
            label: "Do: simple shoe shape",
          },
          {
            kind: "dont",
            image: modeBBundle("B_shoes_confidence_dampen", "default", "dont"),
            label: "Avoid: shoes that fight the outfit",
          },
          {
            kind: "try",
            image: modeBBundle("B_shoes_confidence_dampen", "default", "try"),
            label: "Try: same outfit, swap to minimal shoes",
          },
        ],
      },
    },
  },

  B_missing_key_signal: {
    variants: {
      default: {
        bundles: [
          {
            kind: "do",
            image: modeBBundle("B_missing_key_signal", "default", "do"),
            label: "Do: keep the rest versatile",
          },
          {
            kind: "dont",
            image: modeBBundle("B_missing_key_signal", "default", "dont"),
            label: "Avoid: too many statement pieces",
          },
          {
            kind: "try",
            image: modeBBundle("B_missing_key_signal", "default", "try"),
            label: "Try: one standout, everything else simple",
          },
        ],
      },
    },
  },
};

/**
 * BulletKey -> TipSheet entry (covers ALL bullets)
 */
export const TIP_SHEETS: Record<string, TipSheetEntry> = {
  // =========================
  // MODE A (Missing Pieces)
  // Title derived from resolveBulletTitle(bulletKey, vibe)
  // =========================
  TOPS__BOTTOMS_DARK_STRUCTURED: {
    mode: "A",
    subtitle: "These ground the look and make the top easier to wear.",
    targetCategory: "bottoms",
    packId: "A_bottoms_dark_structured",
  },
  TOPS__SHOES_NEUTRAL: {
    mode: "A",
    subtitle: "Simple shoes keep the outfit cohesive.",
    targetCategory: "shoes",
    packId: "A_shoes_neutral_everyday",
  },
  TOPS__OUTERWEAR_LIGHT_LAYER: {
    mode: "A",
    subtitle: "A single layer adds structure without feeling heavy.",
    targetCategory: "outerwear",
    packId: "A_outerwear_light_layer",
  },

  BOTTOMS__TOP_NEUTRAL_SIMPLE: {
    mode: "A",
    subtitle: "Neutral tops pair with more bottoms, more often.",
    targetCategory: "tops",
    packId: "A_tops_neutral_simple",
  },
  BOTTOMS__SHOES_EVERYDAY: {
    mode: "A",
    subtitle: "Keep shoes quiet so the outfit reads intentional.",
    targetCategory: "shoes",
    packId: "A_shoes_dont_compete",
  },
  BOTTOMS__OUTERWEAR_OPTIONAL: {
    mode: "A",
    subtitle: "A blazer/trench can instantly polish the look.",
    targetCategory: "outerwear",
    packId: "A_outerwear_optional_structure",
  },

  SHOES__TOP_RELAXED: {
    mode: "A",
    subtitle: "Easy tops make the shoe choice feel wearable.",
    targetCategory: "tops",
    packId: "A_tops_relaxed_everyday",
  },
  SHOES__BOTTOMS_STRUCTURED: {
    mode: "A",
    subtitle: "Clean bottoms help the outfit feel put together.",
    targetCategory: "bottoms",
    packId: "A_bottoms_simple_structured",
  },
  SHOES__OUTERWEAR_MINIMAL: {
    mode: "A",
    subtitle: "One clean layer keeps the look cohesive.",
    targetCategory: "outerwear",
    packId: "A_outerwear_minimal_layering",
  },

  OUTERWEAR__TOP_BASE: {
    mode: "A",
    subtitle: "A simple base makes outerwear feel effortless.",
    targetCategory: "tops",
    packId: "A_tops_easy_base_layer",
  },
  OUTERWEAR__BOTTOMS_BALANCED: {
    mode: "A",
    subtitle: "Balanced proportions keep the silhouette clean.",
    targetCategory: "bottoms",
    packId: "A_bottoms_balanced",
  },
  OUTERWEAR__SHOES_SIMPLE: {
    mode: "A",
    subtitle: "Understated shoes let the outerwear lead.",
    targetCategory: "shoes",
    packId: "A_shoes_simple",
  },

  DRESSES__SHOES_SIMPLE: {
    mode: "A",
    subtitle: "Minimal shoes keep the dress as the focal point.",
    targetCategory: "shoes",
    packId: "A_shoes_dont_compete",
  },
  DRESSES__OUTERWEAR_LIGHT: {
    mode: "A",
    subtitle: "A layer makes dresses more versatile day-to-day.",
    targetCategory: "outerwear",
    packId: "A_outerwear_light_layer",
  },
  DRESSES__ACCESSORIES_MINIMAL: {
    mode: "A",
    subtitle: "One understated detail is usually enough.",
    targetCategory: "accessories",
    packId: "A_accessories_minimal",
  },

  SKIRTS__TOP_COMPLEMENTARY: {
    mode: "A",
    subtitle: "A simple top keeps skirts easy to style.",
    targetCategory: "tops",
    packId: "A_tops_neutral_simple",
  },
  SKIRTS__SHOES_EVERYDAY: {
    mode: "A",
    subtitle: "Everyday shoes keep the skirt wearable.",
    targetCategory: "shoes",
    packId: "A_shoes_neutral_everyday",
  },
  SKIRTS__OUTERWEAR_OPTIONAL: {
    mode: "A",
    subtitle: "A layer makes the outfit feel finished.",
    targetCategory: "outerwear",
    packId: "A_outerwear_light_layer",
  },

  BAGS__OUTFIT_CLEAN: {
    mode: "A",
    subtitle: "Let the bag be the accent; keep everything else calm.",
    targetCategory: "tops",
    packId: "A_outfit_clean_simple",
  },
  BAGS__SHOES_NEUTRAL: {
    mode: "A",
    subtitle: "Neutral shoes keep the bag from competing.",
    targetCategory: "shoes",
    packId: "A_shoes_neutral_everyday",
  },
  BAGS__ACCESSORIES_MINIMAL: {
    mode: "A",
    subtitle: "Choose one focal point across bag + accessories.",
    targetCategory: "accessories",
    packId: "A_accessories_minimal",
  },

  ACCESSORIES__OUTFIT_SIMPLE: {
    mode: "A",
    subtitle: "Simple pieces let accessories feel intentional.",
    targetCategory: null,
    packId: "A_outfit_clean_simple",
  },
  ACCESSORIES__SHOES_NEUTRAL: {
    mode: "A",
    subtitle: "Neutral shoes keep the overall look cohesive.",
    targetCategory: "shoes",
    packId: "A_shoes_neutral_everyday",
  },
  ACCESSORIES__OUTERWEAR_CLEAN: {
    mode: "A",
    subtitle: "One clean layer ties the look together.",
    targetCategory: "outerwear",
    packId: "A_outerwear_minimal_layering",
  },

  DEFAULT__KEEP_SIMPLE: {
    mode: "A",
    subtitle: "Let one item lead; everything else supports it.",
    targetCategory: null,
    packId: "A_outfit_clean_simple",
  },
  DEFAULT__NEUTRAL_COLORS: {
    mode: "A",
    subtitle: "Neutrals reduce friction and increase matchability.",
    targetCategory: null,
    packId: "A_palette_neutral",
  },
  DEFAULT__AVOID_TEXTURE: {
    mode: "A",
    subtitle: "Keeping textures aligned makes the outfit feel cohesive.",
    targetCategory: null,
    packId: "A_texture_avoid_competing",
  },

  // =========================
  // MODE B (Styling Tips)
  // Title derived from resolveBulletTitle(bulletKey, vibe)
  // =========================
  FORMALITY_TENSION__MATCH_DRESSINESS: {
    mode: "B",
    subtitle:
      "When everything is equally casual or equally polished, it looks intentional.",
    packId: "B_formality_tension",
  },
  FORMALITY_TENSION__AVOID_MIX: {
    mode: "B",
    subtitle: "Pick one lane and let the whole outfit match it.",
    packId: "B_formality_tension",
  },

  STYLE_TENSION__LET_ONE_LEAD: {
    mode: "B",
    subtitle:
      "Keep surrounding pieces clean so the outfit reads cohesive.",
    packId: "B_style_tension",
  },
  STYLE_TENSION__STICK_CLASSIC: {
    mode: "B",
    subtitle: "Classic basics reduce style conflict instantly.",
    packId: "B_style_tension",
  },

  COLOR_TENSION__NEUTRAL_OTHERS: {
    mode: "B",
    subtitle: "One focal color works better than multiple competitors.",
    packId: "B_color_tension",
  },
  COLOR_TENSION__CONTRAST_OR_TONAL: {
    mode: "B",
    subtitle: "Pick one strategy so the outfit feels intentional.",
    packId: "B_color_tension",
  },

  USAGE_MISMATCH__CLEAR_CONTEXT: {
    mode: "B",
    subtitle:
      "Work vs weekend: choose one direction and align the pieces.",
    packId: "B_usage_mismatch",
  },
  USAGE_MISMATCH__CONSISTENT_PURPOSE: {
    mode: "B",
    subtitle: "Avoid mixing pieces that signal different purposes.",
    packId: "B_usage_mismatch",
  },

  SHOES_CONFIDENCE_DAMPEN__SIMPLE_SHOES: {
    mode: "B",
    subtitle: "A simpler shoe shape makes the whole outfit feel calmer.",
    packId: "B_shoes_confidence_dampen",
  },
  SHOES_CONFIDENCE_DAMPEN__MINIMAL_SHAPE: {
    mode: "B",
    subtitle: "Clean lines reduce noise in the outfit.",
    packId: "B_shoes_confidence_dampen",
  },

  MISSING_KEY_SIGNAL__SIMPLE_VERSATILE: {
    mode: "B",
    subtitle: "When in doubt, build around one strong piece.",
    packId: "B_missing_key_signal",
  },
};

/**
 * Schema lock: allowed keys in BUNDLE_RECIPES
 * Adding a new recipe field? Add it here (one-line change).
 * This prevents copy fields from creeping back in.
 * Note: supportSlot removed when bundles were replaced by Suggestions grid (single-list).
 */
export const BUNDLE_RECIPE_ALLOWED_KEYS = [
  'targetCategory',
  'targetFilters',
  'targetLimit',
  'relaxOrder',
  'neverRelax',
] as const;

/**
 * Allowed filter keys for targetFilters.
 * These map to LibraryItemMeta fields (library catalog), NOT scan signal types like OuterwearSignals.
 * Adding a new filter field? Add it here (one-line change).
 */
export const ALLOWED_FILTER_KEYS = [
  'tone',
  'structure',
  'formality',
  'volume',
  'shape',
  'length',
  'tier',
  'outerwearWeight', // Valid for outerwear category
] as const;

type AllowedFilterKey = (typeof ALLOWED_FILTER_KEYS)[number];

/** Copy fields that must never appear in BUNDLE_RECIPES */
const BUNDLE_RECIPE_DISALLOWED_COPY_KEYS = [
  'displayTitle',
  'displayDescription',
  'title',
  'subtitle',
  'description',
] as const;

/**
 * Runtime validator (dev only)
 * Call once at startup: if (__DEV__) validateTipSheets();
 *
 * Validates:
 * 1. Every TipSheetEntry packId exists in TIP_PACKS
 * 2. Every pack has at least default variant
 * 3. No duplicate bulletKeys in TIP_SHEETS
 * 4. Every Mode A bulletKey with targetCategory has a matching BUNDLE_RECIPES entry
 * 4b. Mode B bulletKeys should NOT have BUNDLE_RECIPES entry
 * 5. All BUNDLE_RECIPES have targetLimit defined
 * 7. Every TIP_SHEETS bulletKey resolves via resolveBulletTitle
 * 8. Schema lock: BUNDLE_RECIPES only contains allowed keys
 * 9. Mode A entries have non-empty subtitle
 * 10. No orphan recipes + targetCategory consistency between TIP_SHEETS and BUNDLE_RECIPES
 * 11. Filter keys in targetFilters are valid
 * 12. relaxOrder/neverRelax keys are valid filter keys
 *
 * MODE B SPECIFIC:
 * 13. Mode B copy key completeness: every Mode B bulletKey exists in MODE_B_COPY_BY_REASON
 * 14. Mode B pack structure: exactly 3 bundles in [do, dont, try] order with valid URLs
 * 15. Mode B variant coverage: tracks packs with only default (informational, not error)
 * 16. Mode B duplicate packId: warns when multiple bulletKeys share a packId (unless whitelisted)
 *
 * NOTE: hero is deprecated - "do" board serves as visual lead
 */
export function validateTipSheets(): void {
  const errors: string[] = [];

  // 1) every TipSheetEntry pack exists
  for (const [key, entry] of Object.entries(TIP_SHEETS)) {
    if (!TIP_PACKS[entry.packId]) {
      errors.push(
        `Missing TIP_PACKS["${entry.packId}"] referenced by TIP_SHEETS["${key}"]`
      );
    }
  }

  // 2) every pack has at least default or one vibe variant
  for (const [packId, pack] of Object.entries(TIP_PACKS)) {
    const hasAnyVariant =
      pack.variants && Object.keys(pack.variants).length > 0;
    if (!hasAnyVariant) {
      errors.push(`TIP_PACKS["${packId}"] has no variants`);
      continue;
    }
    if (!pack.variants.default) {
      errors.push(
        `TIP_PACKS["${packId}"] missing variants.default (recommended fallback)`
      );
    }
  }

  // 3) No duplicate bulletKeys (TIP_SHEETS is a Record so keys are unique by design,
  //    but check for any bulletKey collisions with different packIds)
  const bulletKeyToPackId = new Map<string, string>();
  for (const [key, entry] of Object.entries(TIP_SHEETS)) {
    const existing = bulletKeyToPackId.get(key);
    if (existing && existing !== entry.packId) {
      errors.push(
        `Duplicate bulletKey "${key}" with different packIds: "${existing}" vs "${entry.packId}"`
      );
    }
    bulletKeyToPackId.set(key, entry.packId);
  }

  // 4) Mode A bulletKeys with targetCategory must have BUNDLE_RECIPES entry
  for (const [key, entry] of Object.entries(TIP_SHEETS)) {
    if (entry.mode === "A" && entry.targetCategory) {
      if (!BUNDLE_RECIPES[key]) {
        errors.push(
          `TIP_SHEETS["${key}"] (Mode A) has targetCategory "${entry.targetCategory}" but no BUNDLE_RECIPES entry. ` +
          `Fix: add BUNDLE_RECIPES["${key}"] or remove targetCategory from TIP_SHEETS`
        );
      }
    }
  }

  // 4b) Mode B bulletKeys should NOT have BUNDLE_RECIPES entry (Mode B uses static educational content)
  for (const [key, entry] of Object.entries(TIP_SHEETS)) {
    if (entry.mode === "B") {
      if (BUNDLE_RECIPES[key]) {
        errors.push(
          `TIP_SHEETS["${key}"] (Mode B) should not have BUNDLE_RECIPES entry. ` +
          `Fix: delete BUNDLE_RECIPES["${key}"] (Mode B uses static content from TIP_PACKS)`
        );
      }
    }
  }

  // 5) All BUNDLE_RECIPES should have targetLimit defined
  for (const [bulletKey, recipe] of Object.entries(BUNDLE_RECIPES)) {
    if (recipe.targetLimit === undefined) {
      errors.push(
        `BUNDLE_RECIPES["${bulletKey}"] missing targetLimit (recommended for layout consistency)`
      );
    }
  }

  // 7) Validate every TIP_SHEETS bulletKey has a matching entry in resolveBulletTitle
  // This ensures we can always derive a title
  for (const bulletKey of Object.keys(TIP_SHEETS)) {
    const canonicalTitle = resolveBulletTitle(bulletKey, 'casual');
    if (!canonicalTitle) {
      errors.push(
        `TIP_SHEETS["${bulletKey}"] has no matching bullet in MODE_A_TEMPLATES_V2 or MODE_B_COPY_BY_REASON`
      );
    }
  }

  // 8) Schema lock: BUNDLE_RECIPES must only contain allowed keys (no copy fields)
  // This prevents displayTitle/displayDescription or other copy from reappearing
  const allowedKeysSet = new Set<string>(BUNDLE_RECIPE_ALLOWED_KEYS);
  const sortedAllowedKeys = [...BUNDLE_RECIPE_ALLOWED_KEYS].sort().join(', ');

  for (const [bulletKey, recipe] of Object.entries(BUNDLE_RECIPES)) {
    const recipeKeys = Object.keys(recipe);
    const unexpectedKeys = recipeKeys.filter(k => !allowedKeysSet.has(k)).sort();

    if (unexpectedKeys.length > 0) {
      for (const key of unexpectedKeys) {
        const isCopyField = (BUNDLE_RECIPE_DISALLOWED_COPY_KEYS as readonly string[]).includes(key);
        errors.push(
          `BUNDLE_RECIPES["${bulletKey}"] has disallowed key "${key}". ` +
          (isCopyField
            ? `Fix: remove "${key}" (copy fields belong in TIP_SHEETS or resolveBulletTitle)`
            : `Fix: remove "${key}" (allowed keys: ${sortedAllowedKeys})`)
        );
      }
    }
  }

  // 9) Validate Mode A TIP_SHEETS entries have non-empty subtitle (user-facing description)
  // Mode B may not always need subtitle, so only enforce for Mode A
  for (const [bulletKey, entry] of Object.entries(TIP_SHEETS)) {
    if (entry.mode === 'A') {
      if (!entry.subtitle || entry.subtitle.trim().length === 0) {
        errors.push(
          `TIP_SHEETS["${bulletKey}"] (Mode A) missing or empty subtitle. ` +
          `Fix: add subtitle field with user-facing description`
        );
      }
    }
  }

  // 10) Validate no orphan recipes: every BUNDLE_RECIPES key must have a TIP_SHEETS entry
  // Also verify that if a recipe exists, TIP_SHEETS.targetCategory matches recipe.targetCategory
  // This prevents dead config from piling up and catches dynamic/static mismatches
  for (const recipeKey of Object.keys(BUNDLE_RECIPES)) {
    const tipSheetEntry = TIP_SHEETS[recipeKey];
    if (!tipSheetEntry) {
      errors.push(
        `BUNDLE_RECIPES["${recipeKey}"] is orphaned (no TIP_SHEETS entry). ` +
        `Fix: add TIP_SHEETS["${recipeKey}"] or delete BUNDLE_RECIPES["${recipeKey}"]`
      );
      continue;
    }

    // Verify targetCategory matches between TIP_SHEETS and BUNDLE_RECIPES
    const recipe = BUNDLE_RECIPES[recipeKey];
    if (tipSheetEntry.targetCategory !== recipe.targetCategory) {
      errors.push(
        `TIP_SHEETS["${recipeKey}"].targetCategory is "${tipSheetEntry.targetCategory}" but ` +
        `BUNDLE_RECIPES["${recipeKey}"].targetCategory is "${recipe.targetCategory}". ` +
        `Fix: ensure both have the same targetCategory`
      );
    }

    // Verify Mode A with recipe has targetCategory (not null/undefined)
    if (tipSheetEntry.mode === 'A' && !tipSheetEntry.targetCategory) {
      errors.push(
        `TIP_SHEETS["${recipeKey}"] (Mode A) has a BUNDLE_RECIPES entry but targetCategory is null. ` +
        `Fix: set targetCategory to "${recipe.targetCategory}" in TIP_SHEETS`
      );
    }
  }

  // 11) Validate filter keys in targetFilters
  // Catches invalid keys like "texture_type" that don't exist on LibraryItemMeta
  const allowedFilterKeysSet = new Set<string>(ALLOWED_FILTER_KEYS);
  const sortedFilterKeys = [...ALLOWED_FILTER_KEYS].sort().join(', ');

  function validateFilterKeys(where: string, filters: Record<string, unknown>) {
    for (const [key, value] of Object.entries(filters)) {
      if (!allowedFilterKeysSet.has(key)) {
        errors.push(
          `${where} has invalid filter key "${key}". ` +
          `Fix: remove "${key}" (allowed keys: ${sortedFilterKeys})`
        );
      }
      // Check for empty arrays (will never match)
      if (Array.isArray(value) && value.length === 0) {
        errors.push(
          `${where} has empty array for "${key}". ` +
          `Fix: remove "${key}" or provide at least one value`
        );
      }
    }
  }

  for (const [bulletKey, recipe] of Object.entries(BUNDLE_RECIPES)) {
    validateFilterKeys(
      `BUNDLE_RECIPES["${bulletKey}"].targetFilters`,
      recipe.targetFilters as Record<string, unknown>
    );
  }

  // 12) Validate relaxOrder and neverRelax keys are valid filter keys
  for (const [bulletKey, recipe] of Object.entries(BUNDLE_RECIPES)) {
    for (const key of recipe.relaxOrder ?? []) {
      if (!allowedFilterKeysSet.has(key)) {
        errors.push(
          `BUNDLE_RECIPES["${bulletKey}"].relaxOrder has invalid key "${key}". ` +
          `Fix: remove "${key}" (allowed keys: ${sortedFilterKeys})`
        );
      }
    }
    for (const key of recipe.neverRelax ?? []) {
      if (!allowedFilterKeysSet.has(key)) {
        errors.push(
          `BUNDLE_RECIPES["${bulletKey}"].neverRelax has invalid key "${key}". ` +
          `Fix: remove "${key}" (allowed keys: ${sortedFilterKeys})`
        );
      }
    }
  }

  // ─────────────────────────────────────────────
  // MODE B VALIDATIONS
  // ─────────────────────────────────────────────

  // 13) Mode B copy key completeness: every Mode B bulletKey must exist in MODE_B_COPY_BY_REASON
  // Build a set of all Mode B keys from the source of truth
  const allModeBKeysFromCopy = new Set<string>();
  for (const bullets of Object.values(MODE_B_COPY_BY_REASON)) {
    for (const bullet of bullets) {
      allModeBKeysFromCopy.add(bullet.key);
    }
  }

  for (const [bulletKey, entry] of Object.entries(TIP_SHEETS)) {
    if (entry.mode === 'B') {
      if (!allModeBKeysFromCopy.has(bulletKey)) {
        errors.push(
          `TIP_SHEETS["${bulletKey}"] (Mode B) has no matching entry in MODE_B_COPY_BY_REASON. ` +
          `Fix: add bullet with key "${bulletKey}" to MODE_B_COPY_BY_REASON`
        );
      }
    }
  }

  // 14) Mode B pack structure validation:
  // - Every referenced pack must have exactly 3 bundles in [do, dont, try] order
  // - Each bundle must have non-empty image URL
  // NOTE: hero is deprecated - "do" board serves as visual lead
  for (const [bulletKey, entry] of Object.entries(TIP_SHEETS)) {
    if (entry.mode === 'B') {
      const pack = TIP_PACKS[entry.packId];
      if (!pack) continue; // Already caught by rule 1

      // Check default variant has bundles
      const defaultVariant = pack.variants?.default;
      if (!defaultVariant) {
        errors.push(
          `TIP_PACKS["${entry.packId}"] (used by Mode B "${bulletKey}") missing variants.default. ` +
          `Fix: add default variant with bundles [do, dont, try]`
        );
        continue;
      }

      const bundles = defaultVariant.bundles ?? [];
      if (bundles.length !== 3) {
        errors.push(
          `TIP_PACKS["${entry.packId}"].variants.default (used by Mode B "${bulletKey}") must have exactly 3 bundles. ` +
          `Found: ${bundles.length}. Fix: add [do, dont, try] bundles`
        );
        continue;
      }

      // Validate each bundle has correct kind and non-empty image
      const kinds = bundles.map(b => b.kind);
      const expectedKinds = ['do', 'dont', 'try'];
      if (JSON.stringify(kinds) !== JSON.stringify(expectedKinds)) {
        errors.push(
          `TIP_PACKS["${entry.packId}"].variants.default (used by Mode B "${bulletKey}") bundles must be in [do, dont, try] order. ` +
          `Found: [${kinds.join(', ')}]. Fix: reorder bundles`
        );
      }

      bundles.forEach((bundle, idx) => {
        if (!bundle.image || bundle.image.trim().length === 0) {
          errors.push(
            `TIP_PACKS["${entry.packId}"].variants.default.bundles[${idx}] (${bundle.kind}) has empty image URL. ` +
            `Fix: add valid Supabase Storage URL`
          );
        }
        if (!bundle.label || bundle.label.trim().length === 0) {
          errors.push(
            `TIP_PACKS["${entry.packId}"].variants.default.bundles[${idx}] (${bundle.kind}) has empty label. ` +
            `Fix: add descriptive label`
          );
        }
      });
    }
  }

  // 15) Mode B variant coverage: warn if pack only has default (no vibe-specific variants)
  // This is a soft warning - default is acceptable but vibe variants improve UX
  const modeBPacksWithVibeVariants = new Set<string>();
  const modeBPacksDefaultOnly = new Set<string>();

  for (const [bulletKey, entry] of Object.entries(TIP_SHEETS)) {
    if (entry.mode === 'B') {
      const pack = TIP_PACKS[entry.packId];
      if (!pack?.variants) continue;

      const variantKeys = Object.keys(pack.variants);
      const hasNonDefaultVariant = variantKeys.some(k => k !== 'default');

      if (hasNonDefaultVariant) {
        modeBPacksWithVibeVariants.add(entry.packId);
      } else {
        modeBPacksDefaultOnly.add(entry.packId);
      }
    }
  }

  // Note: This is informational, not an error. Uncomment if you want strict variant coverage.
  // for (const packId of modeBPacksDefaultOnly) {
  //   errors.push(
  //     `TIP_PACKS["${packId}"] (Mode B) only has default variant. ` +
  //     `Consider: add office/minimal/street variants for better vibe matching`
  //   );
  // }

  // 16) Mode B duplicate packId warning: warn when multiple bulletKeys share a packId (unless whitelisted)
  // This catches accidental duplication while allowing intentional 2-bullets-per-pack patterns
  const MODE_B_PACK_DUPLICATE_ALLOWLIST = new Set<string>([
    // Format: "packId::sortedBulletKey1|sortedBulletKey2"
    "B_formality_tension::FORMALITY_TENSION__AVOID_MIX|FORMALITY_TENSION__MATCH_DRESSINESS",
    "B_style_tension::STYLE_TENSION__LET_ONE_LEAD|STYLE_TENSION__STICK_CLASSIC",
    "B_color_tension::COLOR_TENSION__CONTRAST_OR_TONAL|COLOR_TENSION__NEUTRAL_OTHERS",
    "B_usage_mismatch::USAGE_MISMATCH__CLEAR_CONTEXT|USAGE_MISMATCH__CONSISTENT_PURPOSE",
    "B_shoes_confidence_dampen::SHOES_CONFIDENCE_DAMPEN__MINIMAL_SHAPE|SHOES_CONFIDENCE_DAMPEN__SIMPLE_SHOES",
  ]);

  // Group Mode B bulletKeys by packId
  const modeBPackIdToBulletKeys = new Map<string, string[]>();
  for (const [bulletKey, entry] of Object.entries(TIP_SHEETS)) {
    if (entry.mode === 'B') {
      const existing = modeBPackIdToBulletKeys.get(entry.packId) ?? [];
      existing.push(bulletKey);
      modeBPackIdToBulletKeys.set(entry.packId, existing);
    }
  }

  // Check for duplicates not in allowlist
  for (const [packId, bulletKeys] of modeBPackIdToBulletKeys) {
    if (bulletKeys.length > 1) {
      const sortedKeys = bulletKeys.slice().sort();
      const signature = `${packId}::${sortedKeys.join('|')}`;
      if (!MODE_B_PACK_DUPLICATE_ALLOWLIST.has(signature)) {
        errors.push(
          `Mode B packId "${packId}" is referenced by ${bulletKeys.length} bulletKeys: [${sortedKeys.join(', ')}]. ` +
          `Fix: add to MODE_B_PACK_DUPLICATE_ALLOWLIST if intentional, or use separate packs`
        );
      }
    }
  }

  if (errors.length) {
    throw new Error(`TipSheet validation failed:\n- ${errors.join("\n- ")}`);
  }
}

/**
 * Resolver used by your Bottom Sheet.
 * - Finds sheet entry by bulletKey
 * - Loads pack variant by vibe, falling back to default
 * - Returns null if pack has no usable variant
 */
/**
 * Resolve a TipSheet entry for display.
 *
 * IMPORTANT: For Mode A + targetCategory, pack content (hero/examples/bundles)
 * is resolved but IGNORED by resolveTipSheetContent(). Mode A suggestions
 * come purely from BUNDLE_RECIPES + library filtering.
 *
 * Content routing in resolveTipSheetContent():
 * - Mode B → Uses bundles from TIP_PACKS (educational boards)
 * - Mode A + null targetCategory → Uses bundles from TIP_PACKS (concept advice)
 * - Mode A + targetCategory → IGNORES pack content (recipe-driven suggestions)
 */
export function resolveTipSheet(args: {
  mode: TipSheetMode;
  bulletKey: string;
  vibe: StyleVibe;
}): ResolvedTipSheet | null {
  const { mode, bulletKey, vibe } = args;

  const entry = TIP_SHEETS[bulletKey];
  if (!entry || entry.mode !== mode) return null;

  const pack = TIP_PACKS[entry.packId];
  if (!pack || !pack.variants) return null;

  const hasVibeVariant = !!pack.variants[vibe];
  const variant = pack.variants[vibe] ?? pack.variants.default;
  if (!variant) return null;

  const usedVibe: TipSheetVibe = hasVibeVariant ? vibe : "default";

  // For Mode A + targetCategory, pack content is ignored by resolveTipSheetContent.
  // We still resolve it for type consistency, but it won't be displayed.
  const isModeADynamic = mode === "A" && entry.targetCategory != null;

  // Normalize bundles: ensure [do, dont, try] order + add debug metadata
  const rawBundles = isModeADynamic ? [] : (variant.bundles ?? []);
  const normalizedBundles = BOARD_KIND_ORDER
    .map(kind => rawBundles.find(b => b.kind === kind))
    .filter((b): b is TipSheetBundle => b != null)
    .map(bundle => ({
      ...bundle,
      _debug: {
        packId: entry.packId,
        variant: usedVibe,
        kind: bundle.kind,
      },
    }));

  return {
    mode,
    key: bulletKey,
    vibe: usedVibe,
    // NOTE: title removed - use resolveBulletTitle(bulletKey, vibe) instead
    subtitle: entry.subtitle,
    targetCategory: entry.targetCategory ?? null,
    // Pack content: only used for Mode B and Mode A concept advice
    // NOTE: hero deprecated - "do" board serves as visual lead
    hero: variant.hero,
    examples: isModeADynamic ? [] : (variant.examples ?? []),
    bundles: normalizedBundles,
  };
}

/**
 * Get all bullet keys for a given mode
 */
export function getBulletKeysByMode(mode: TipSheetMode): string[] {
  return Object.entries(TIP_SHEETS)
    .filter(([_, entry]) => entry.mode === mode)
    .map(([key]) => key);
}

/**
 * Check if a bullet key exists
 */
export function hasTipSheet(bulletKey: string): boolean {
  return bulletKey in TIP_SHEETS;
}

// ─────────────────────────────────────────────
// BUNDLE RECIPES (for dynamic bundle generation)
// ─────────────────────────────────────────────
// Each bulletKey maps to a recipe with:
// - targetFilters: constraints for the main suggestion item
// - targetLimit: max items to fetch (default: 3)
// - relaxOrder/neverRelax: controls filter relaxation when no matches
//
// Note: supportSlot removed when bundles were replaced by Suggestions grid (single-list).
//
// IMPORTANT: Filters are evaluated against LibraryItemMeta fields (library catalog),
// NOT scan signal types like OuterwearSignals. For example, `structure: "structured"`
// filters against the library item's structure field, which exists on ALL categories
// (not just outerwear). See ALLOWED_FILTER_KEYS for the complete list.
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Common filters (applicable to all categories)
// ─────────────────────────────────────────────
export interface CommonFilters {
  tone?: Tone | Tone[];
  structure?: Structure;
  formality?: Formality | Formality[];
  // Hybrid schema filters
  volume?: Volume | Volume[];
  shape?: Shape | Shape[];
  length?: Length | Length[];
  tier?: Tier | Tier[];
}

// ─────────────────────────────────────────────
// Category-specific filters (validated at runtime)
// ─────────────────────────────────────────────
export interface OuterwearFilters extends CommonFilters {
  outerwearWeight?: OuterwearWeight | OuterwearWeight[];
}

// Union type for all target filters
export type TargetFilters = CommonFilters | OuterwearFilters;

// All possible filter keys (for relaxation config)
export type AllFilterKeys = keyof CommonFilters | keyof OuterwearFilters;

// Helper to check if filters have outerwear-specific fields
export function hasOuterwearFilters(filters: TargetFilters): filters is OuterwearFilters {
  return 'outerwearWeight' in filters && filters.outerwearWeight !== undefined;
}

/**
 * Bundle recipe for Mode A suggestions.
 * Simplified model: single-list suggestions grid (no supportSlot).
 * supportSlot removed when bundles were replaced by Suggestions grid (single-list).
 */
export interface BundleRecipe {
  targetCategory: Category;
  targetFilters: TargetFilters;
  targetLimit?: number; // max items to fetch for target (default: 3)
  // Relaxation strategy for when no candidates match
  relaxOrder?: AllFilterKeys[]; // drop these filters in order
  neverRelax?: AllFilterKeys[]; // never drop these filters
  // NOTE: No copy fields here - title comes from resolveBulletTitle,
  // subtitle comes from TIP_SHEETS[bulletKey].subtitle
}

export const BUNDLE_RECIPES: Record<string, BundleRecipe> = {
  // ─────────────────────────────────────────────
  // TOPS scanned → suggest bottoms/shoes/outerwear
  // ─────────────────────────────────────────────
  TOPS__BOTTOMS_DARK_STRUCTURED: {
    targetCategory: "bottoms",
    targetFilters: {
      tone: "dark",
      structure: "structured",
      formality: "smart-casual",
      shape: ["straight", "tapered"],
      tier: ["core", "staple"],
    },
    targetLimit: 3,
    relaxOrder: ["shape", "tier"],
    neverRelax: ["tone", "structure", "formality"],
  },
  TOPS__SHOES_NEUTRAL: {
    targetCategory: "shoes",
    targetFilters: { shape: "low_profile", tone: ["neutral", "dark", "light"] },
    targetLimit: 3,
    relaxOrder: ["tone"],
    neverRelax: ["shape"],
  },
  TOPS__OUTERWEAR_LIGHT_LAYER: {
    targetCategory: "outerwear",
    targetFilters: { outerwearWeight: "light", structure: "soft" },
    targetLimit: 3,
    relaxOrder: ["structure"],
    neverRelax: ["outerwearWeight"],
  },

  // ─────────────────────────────────────────────
  // BOTTOMS scanned → suggest tops/shoes/outerwear
  // ─────────────────────────────────────────────
  BOTTOMS__TOP_NEUTRAL_SIMPLE: {
    targetCategory: "tops",
    targetFilters: { tone: ["neutral", "light"], structure: "soft" },
    targetLimit: 3,
    relaxOrder: ["tone"],
    neverRelax: ["structure"],
  },
  BOTTOMS__SHOES_EVERYDAY: {
    targetCategory: "shoes",
    targetFilters: { shape: "low_profile" },
    targetLimit: 3,
    neverRelax: ["shape"],
  },
  BOTTOMS__OUTERWEAR_OPTIONAL: {
    targetCategory: "outerwear",
    targetFilters: { structure: "structured", formality: "smart-casual", outerwearWeight: ["light", "medium"] },
    targetLimit: 3,
    relaxOrder: ["formality"],
    neverRelax: ["structure"],
  },

  // ─────────────────────────────────────────────
  // SHOES scanned → suggest tops/bottoms/outerwear
  // ─────────────────────────────────────────────
  SHOES__TOP_RELAXED: {
    targetCategory: "tops",
    targetFilters: { structure: "soft", volume: ["fitted", "oversized"] },
    targetLimit: 3,
    relaxOrder: ["volume"],
    neverRelax: ["structure"],
  },
  SHOES__BOTTOMS_STRUCTURED: {
    targetCategory: "bottoms",
    targetFilters: { structure: "structured", shape: ["straight", "tapered"] },
    targetLimit: 3,
    relaxOrder: ["shape"],
    neverRelax: ["structure"],
  },
  SHOES__OUTERWEAR_MINIMAL: {
    targetCategory: "outerwear",
    targetFilters: { outerwearWeight: "light" },
    targetLimit: 3,
    neverRelax: ["outerwearWeight"],
  },

  // ─────────────────────────────────────────────
  // OUTERWEAR scanned → suggest tops/bottoms/shoes
  // ─────────────────────────────────────────────
  OUTERWEAR__TOP_BASE: {
    targetCategory: "tops",
    targetFilters: { structure: "soft", volume: "fitted" },
    targetLimit: 3,
    relaxOrder: ["volume"],
    neverRelax: ["structure"],
  },
  OUTERWEAR__BOTTOMS_BALANCED: {
    targetCategory: "bottoms",
    targetFilters: { shape: ["straight", "wide", "tapered"] },
    targetLimit: 3,
    relaxOrder: ["shape"],
  },
  OUTERWEAR__SHOES_SIMPLE: {
    targetCategory: "shoes",
    targetFilters: { shape: "low_profile" },
    targetLimit: 3,
    neverRelax: ["shape"],
  },

  // ─────────────────────────────────────────────
  // DRESSES scanned → suggest shoes/outerwear/accessories
  // ─────────────────────────────────────────────
  DRESSES__SHOES_SIMPLE: {
    targetCategory: "shoes",
    targetFilters: { shape: ["low_profile", "heeled"] },
    targetLimit: 3,
    relaxOrder: ["shape"],
  },
  DRESSES__OUTERWEAR_LIGHT: {
    targetCategory: "outerwear",
    targetFilters: { outerwearWeight: "light" },
    targetLimit: 3,
    neverRelax: ["outerwearWeight"],
  },
  DRESSES__ACCESSORIES_MINIMAL: {
    targetCategory: "accessories",
    targetFilters: { tier: ["core", "staple"], tone: ["neutral", "light"] },
    targetLimit: 3,
    neverRelax: ["tier"],
  },

  // ─────────────────────────────────────────────
  // SKIRTS scanned → suggest tops/shoes/outerwear
  // ─────────────────────────────────────────────
  SKIRTS__TOP_COMPLEMENTARY: {
    targetCategory: "tops",
    targetFilters: { tone: ["neutral", "light"], structure: "soft" },
    targetLimit: 3,
    relaxOrder: ["tone"],
    neverRelax: ["structure"],
  },
  SKIRTS__SHOES_EVERYDAY: {
    targetCategory: "shoes",
    targetFilters: { shape: ["low_profile", "heeled"] },
    targetLimit: 3,
    relaxOrder: ["shape"],
  },
  SKIRTS__OUTERWEAR_OPTIONAL: {
    targetCategory: "outerwear",
    targetFilters: { outerwearWeight: "light" },
    targetLimit: 3,
    neverRelax: ["outerwearWeight"],
  },

  // ─────────────────────────────────────────────
  // BAGS scanned → suggest outfit/shoes/accessories
  // Note: Bags are conceptual - show "base pieces" not just one category
  // ─────────────────────────────────────────────
  BAGS__OUTFIT_CLEAN: {
    targetCategory: "tops",
    targetFilters: { tone: ["neutral", "light"], structure: "soft" },
    targetLimit: 3,
    relaxOrder: ["tone"],
    neverRelax: ["structure"],
  },
  BAGS__SHOES_NEUTRAL: {
    targetCategory: "shoes",
    targetFilters: { shape: "low_profile", tone: ["neutral", "dark"] },
    targetLimit: 3,
    relaxOrder: ["tone"],
    neverRelax: ["shape"],
  },
  BAGS__ACCESSORIES_MINIMAL: {
    targetCategory: "accessories",
    targetFilters: {},
    targetLimit: 3,
  },

  // ─────────────────────────────────────────────
  // ACCESSORIES scanned → suggest outfit/shoes/outerwear
  // NOTE: ACCESSORIES__OUTFIT_SIMPLE has targetCategory: null (concept advice)
  // so it doesn't have a recipe - user sees educational boards instead
  // ─────────────────────────────────────────────
  ACCESSORIES__SHOES_NEUTRAL: {
    targetCategory: "shoes",
    targetFilters: { shape: "low_profile" },
    targetLimit: 3,
    neverRelax: ["shape"],
  },
  ACCESSORIES__OUTERWEAR_CLEAN: {
    targetCategory: "outerwear",
    targetFilters: { outerwearWeight: "light" },
    targetLimit: 3,
    neverRelax: ["outerwearWeight"],
  },

  // ─────────────────────────────────────────────
  // DEFAULT bullets have targetCategory: null (concept advice)
  // They show educational boards, not suggestions
  // ─────────────────────────────────────────────
};

// ─────────────────────────────────────────────
// RECIPE VALIDATION
// ─────────────────────────────────────────────

interface RecipeValidationError {
  recipeKey: string;
  field: string;
  message: string;
}

/**
 * Validates all bundle recipes at startup.
 * Checks:
 * 1. outerwearWeight is only used on outerwear recipes (and required for "light layer" recipes)
 *
 * Note: supportSlot validation removed - now single-list model only.
 */
export function validateBundleRecipes(): RecipeValidationError[] {
  const errors: RecipeValidationError[] = [];

  // Recipes that should have outerwearWeight set
  const OUTERWEAR_WEIGHT_REQUIRED_PATTERNS = [
    'OUTERWEAR_LIGHT',
    'OUTERWEAR_MINIMAL',
    'OUTERWEAR_OPTIONAL',
    'OUTERWEAR_CLEAN',
  ];

  for (const [key, recipe] of Object.entries(BUNDLE_RECIPES)) {
    // 1. Validate outerwearWeight usage
    if (hasOuterwearFilters(recipe.targetFilters)) {
      if (recipe.targetCategory !== 'outerwear') {
        errors.push({
          recipeKey: key,
          field: 'targetFilters.outerwearWeight',
          message: `outerwearWeight is set but targetCategory is "${recipe.targetCategory}" (expected "outerwear")`,
        });
      }
    } else if (recipe.targetCategory === 'outerwear') {
      // Check if this is a recipe that should have outerwearWeight
      const shouldHaveWeight = OUTERWEAR_WEIGHT_REQUIRED_PATTERNS.some(pattern =>
        key.includes(pattern)
      );
      if (shouldHaveWeight) {
        errors.push({
          recipeKey: key,
          field: 'targetFilters.outerwearWeight',
          message: `Recipe targets outerwear and matches pattern but missing outerwearWeight filter`,
        });
      }
    }
    // Note: supportSlot validation removed - supportSlot was removed when bundles
    // were replaced by Suggestions grid (single-list model)
  }

  return errors;
}

/**
 * Run validation and throw if errors found (for dev/startup)
 */
export function assertValidRecipes(): void {
  const errors = validateBundleRecipes();
  if (errors.length > 0) {
    const formatted = errors
      .map(e => `  [${e.recipeKey}] ${e.field}: ${e.message}`)
      .join('\n');
    throw new Error(`Bundle recipe validation failed:\n${formatted}`);
  }
}
