// Scan & Match Types

export type StyleVibe =
  | "casual"
  | "minimal"
  | "office"
  | "street"
  | "feminine"
  | "sporty";

// High-level style families for compatibility matching
export type StyleFamily =
  | "classic"
  | "casual"
  | "sporty"
  | "street"
  | "feminine"
  | "minimal";

export type Category =
  | "tops"
  | "bottoms"
  | "outerwear"
  | "shoes"
  | "bags"
  | "accessories"
  | "dresses"
  | "skirts"
  | "unknown"; // Non-fashion items

export type FitPreference = "oversized" | "regular" | "slim";

// ============================================
// HYBRID SCHEMA: Volume + Shape + Length
// Single source of truth for garment attributes
// ============================================

/**
 * Volume: How the garment fits the body (for preference matching & CE)
 * - fitted: Close to body
 * - regular: Standard fit
 * - oversized: Intentionally loose/large
 * - unknown: Fallback when not determinable
 */
export type Volume = "fitted" | "regular" | "oversized" | "unknown";

/**
 * Length: Garment length (category-scoped)
 * IMPORTANT: Never interpret length without category context
 *
 * - TopLength: cropped | regular | longline (for tops/outerwear)
 * - SkirtDressLength: mini | midi | maxi (for skirts/dresses)
 *
 * Stored as TEXT in DB, validated per category in app
 */
export type TopLength = "cropped" | "regular" | "longline";
export type OuterwearLength = "cropped" | "regular" | "long";
export type SkirtDressLength = "mini" | "midi" | "maxi";
export type Length = TopLength | OuterwearLength | SkirtDressLength;

/**
 * Shape: Category-specific garment cut/style (for recipe filtering)
 *
 * Only defined for categories where shape is meaningful:
 * - bottoms: skinny, straight, wide, tapered, flare, cargo
 * - skirts: pencil, a_line, pleated
 * - dresses: slip, wrap, shirt, bodycon, fit_flare
 * - shoes: low_profile, chunky, heeled, boot
 *
 * tops/outerwear: Use dedicated fields (neckline, outerwear_type) in future
 */
export type BottomShape = "skinny" | "straight" | "wide" | "tapered" | "flare" | "cargo";
export type SkirtShape = "pencil" | "a_line" | "pleated";
export type DressShape = "slip" | "wrap" | "shirt" | "bodycon" | "fit_flare";
export type ShoeShape = "low_profile" | "chunky" | "heeled" | "boot";

// Union of all shapes that exist today
export type Shape = BottomShape | SkirtShape | DressShape | ShoeShape;

/**
 * Tier: Item classification for maintainability and auditing
 * Helps answer "why is this rank X?" without guessing
 *
 * - core: Universal basics (rank 10-20) - 1-3 items per category
 * - staple: Versatile everyday pieces (rank 30-50)
 * - style: Vibe-specific items (rank 60-80)
 * - statement: Bold, specific use cases (rank 90+)
 *
 * IMPORTANT: Rank should never compensate for weak filters.
 * If a bulletKey implies "office/tailored", add structure/formality constraints.
 */
export type Tier = "core" | "staple" | "style" | "statement";

// Future expansion (don't overload shape - use dedicated fields):
// export type Neckline = "crew" | "v_neck" | "turtleneck" | "scoop";
// export type OuterwearType = "blazer" | "coat" | "jacket" | "cardigan";

// ============================================
// END HYBRID SCHEMA
// ============================================

export type ConfidenceLevel = "great" | "okay" | "risky";

// Item signal types for decision tree
export type SilhouetteVolume = "fitted" | "relaxed" | "oversized";
export type LengthCategory = "cropped" | "mid" | "long" | "mini" | "midi";
export type LegShape = "slim" | "straight" | "wide";
export type Rise = "low" | "mid" | "high";
export type StructureLevel = "soft" | "structured";
export type BulkLevel = "low" | "medium" | "high";
export type VersatilityLevel = "high" | "medium" | "low";
export type StatementLevel = "neutral" | "bold";
export type PreferenceAlignment = "aligned" | "neutral" | "misaligned";
export type StylingRisk = "low" | "medium" | "high";

// Category-specific item signals
export interface TopSignals {
  silhouetteVolume: SilhouetteVolume;
  lengthCategory: LengthCategory;
  layeringFriendly: boolean;
}

export interface BottomSignals {
  legShape: LegShape;
  rise: Rise;
  balanceRequirement: StylingRisk;
}

export interface SkirtSignals {
  length: LengthCategory;
  volume: "straight" | "flowy";
  stylingDependence: StylingRisk;
}

export interface DressSignals {
  silhouette: SilhouetteVolume | "structured";
  length: LengthCategory;
  stylingDependence: StylingRisk;
}

export interface OuterwearSignals {
  structure: StructureLevel;
  bulk: BulkLevel;
  layeringDependency: StylingRisk;
}

export interface ShoeSignals {
  styleVersatility: VersatilityLevel;
  statementLevel: StatementLevel;
}

export interface AccessorySignals {
  // Accessories skip fit logic
  styleVersatility: VersatilityLevel;
}

export type ItemSignals =
  | { category: "tops"; signals: TopSignals }
  | { category: "bottoms"; signals: BottomSignals }
  | { category: "skirts"; signals: SkirtSignals }
  | { category: "dresses"; signals: DressSignals }
  | { category: "outerwear"; signals: OuterwearSignals }
  | { category: "shoes"; signals: ShoeSignals }
  | { category: "bags" | "accessories"; signals: AccessorySignals };

export interface ColorInfo {
  hex: string;
  name: string;
}

// Auto-analyzed attributes from image analysis
export interface WardrobeItemAttributes {
  silhouette?: string;
  length?: "cropped" | "regular" | "long" | "unknown";
  structure?: "soft" | "structured" | "unknown";
  layering?: boolean;
}

export interface WardrobeItem {
  id: string;
  imageUri: string;
  category: Category;
  createdAt: number;
  // Auto-analyzed fields (system-generated)
  detectedLabel?: string;
  attributes?: WardrobeItemAttributes;
  colors: ColorInfo[];
  styleNotes?: string[]; // Brief style descriptors from AI analysis
  // Optional user-provided fields
  brand?: string;
  userStyleTags?: StyleVibe[];
}

export interface UserPreferences {
  styleVibes: StyleVibe[];
  wardrobeColors: ColorInfo[];
  sizes: {
    top: string;
    bottom: string;
    shoes: string;
  };
  fitPreference?: FitPreference;
  onboardingComplete: boolean;
}

import type { StyleSignalsV1 } from './trust-filter/types';

export interface ScannedItem {
  id: string;
  imageUri: string;
  category: Category;
  colors: ColorInfo[];
  styleTags: StyleVibe[];
  descriptiveLabel?: string;
  styleNotes?: string[];
  store?: string;
  scannedAt: number;
  // Item signals for decision tree
  itemSignals?: {
    silhouetteVolume?: SilhouetteVolume;
    lengthCategory?: LengthCategory;
    layeringFriendly?: boolean;
    legShape?: LegShape;
    rise?: Rise;
    balanceRequirement?: StylingRisk;
    skirtVolume?: "straight" | "flowy";
    dressSilhouette?: SilhouetteVolume | "structured";
    structure?: StructureLevel;
    bulk?: BulkLevel;
    layeringDependency?: StylingRisk;
    styleVersatility?: VersatilityLevel;
    statementLevel?: StatementLevel;
    stylingRisk: StylingRisk;
  };
  contextSufficient?: boolean;
  /** False if image is not wearable fashion (mug, electronics, food, etc.) */
  isFashionItem?: boolean;
  /** Style signals from combined analysis (for Trust Filter) */
  styleSignals?: StyleSignalsV1;
}

export interface OutfitCombo {
  id: string;
  items: WardrobeItem[];
  scannedItem: ScannedItem;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  explanation: string;
  cappedByWardrobeSize?: boolean;
}

export interface MissingPiece {
  category: Category;
  description: string;
  found: boolean;
  /** True if this is a required category (blocker), false if optional (enhancer) */
  isRequired: boolean;
  /** Role-based explanation for why this category helps the outfit */
  explanation?: string;
}

export type WardrobeCoverage = "low" | "normal";

export interface MatchResult {
  scannedItem: ScannedItem;
  itemSummary: {
    category: Category;
    colors: ColorInfo[];
    styleTags: StyleVibe[];
  };
  outfitCombos: OutfitCombo[];
  missingPieces: MissingPiece[];
  wardrobeCoverage: WardrobeCoverage;
  /** True when required wardrobe categories are missing - UI should use softer "add one of these" language */
  missingRequiredCategories: boolean;
  /** True when wardrobe has items but none match the scanned item's style - UI should show "Nothing that naturally fits this style" */
  noStyleCompatibleItems?: boolean;
}

// Outcome states for recent checks
export type OutcomeState =
  | "looks_like_good_match"
  | "could_work_with_pieces"
  | "might_feel_tricky"
  | "needs_more_context"
  | "saved_to_revisit";

// UI state for verdict display - determines visual treatment
// This is separate from OutcomeState to allow different visual representations
export type VerdictUIState =
  | "great"           // Green - confident good match
  | "okay"            // Amber - could work with pieces
  | "risky"           // Red - might feel tricky
  | "context_needed"; // Gray/Neutral - need more info

// Internal reason codes for "okay" state - enables context-appropriate copy
export type OkayReasonCode =
  | "OK_NEEDS_STYLING"          // could_work_with_pieces - real styling "okay"
  | "OK_NEUTRAL_PREFERENCE"     // Preference is neutral
  | "OK_MEDIUM_RISK"            // Medium styling risk
  | "OK_LOW_WARDROBE_DATA"      // Wardrobe has < 6 items (capped from great)
  | "OK_CONTEXT_INSUFFICIENT";  // needs_more_context - maps to context_needed UI state

// Recent check - memory of a decision
export interface RecentCheck {
  id: string;
  itemName: string;
  category: Category;
  imageUri: string;
  outcome: OutcomeState;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  scannedItem: ScannedItem;
  createdAt: number;
  engineSnapshot?: any; // TEMPORARY: Debug snapshot (remove when feature is removed)
}

// Color palette for wardrobe selection
export const COLOR_PALETTE: ColorInfo[] = [
  // Neutrals
  { hex: "#000000", name: "Black" },
  { hex: "#FFFFFF", name: "White" },
  { hex: "#FFFFF0", name: "Ivory" },
  { hex: "#FFFDD0", name: "Cream" },
  { hex: "#F5F5DC", name: "Beige" },
  { hex: "#C19A6B", name: "Camel" },
  { hex: "#D2B48C", name: "Tan" },
  { hex: "#F4A460", name: "Khaki" },
  
  // Grays
  { hex: "#1C1917", name: "Charcoal" },
  { hex: "#505050", name: "Dark Gray" },
  { hex: "#78716C", name: "Gray" },
  { hex: "#D6D3D1", name: "Light Gray" },
  { hex: "#C0C0C0", name: "Silver" },
  
  // Browns
  { hex: "#3B2414", name: "Dark Brown" },
  { hex: "#5C4033", name: "Brown" },
  { hex: "#8B4513", name: "Light Brown" },
  
  // Blues
  { hex: "#000080", name: "Navy" },
  { hex: "#003366", name: "Dark Blue" },
  { hex: "#0000FF", name: "Blue" },
  { hex: "#4169E1", name: "Royal Blue" },
  { hex: "#6495ED", name: "Cornflower Blue" },
  { hex: "#87CEEB", name: "Sky Blue" },
  { hex: "#ADD8E6", name: "Light Blue" },
  { hex: "#4682B4", name: "Denim Blue" },
  { hex: "#5F9EA0", name: "Teal" },
  { hex: "#40E0D0", name: "Turquoise" },
  
  // Greens
  { hex: "#013220", name: "Dark Green" },
  { hex: "#006400", name: "Forest Green" },
  { hex: "#228B22", name: "Green" },
  { hex: "#808000", name: "Olive" },
  { hex: "#90EE90", name: "Light Green" },
  { hex: "#90EE90", name: "Sage" },
  { hex: "#98FF98", name: "Mint" },
  
  // Reds & Pinks
  { hex: "#8B0000", name: "Dark Red" },
  { hex: "#DC143C", name: "Red" },
  { hex: "#800020", name: "Burgundy" },
  { hex: "#800000", name: "Maroon" },
  { hex: "#C41E3A", name: "Cardinal" },
  { hex: "#FF1493", name: "Hot Pink" },
  { hex: "#FF69B4", name: "Pink" },
  { hex: "#FFB6C1", name: "Light Pink" },
  { hex: "#FFB6C1", name: "Blush" },
  { hex: "#FF7F50", name: "Coral" },
  { hex: "#FFE5B4", name: "Peach" },
  
  // Purples
  { hex: "#4B0082", name: "Indigo" },
  { hex: "#800080", name: "Purple" },
  { hex: "#E6E6FA", name: "Lavender" },
  { hex: "#DDA0DD", name: "Plum" },
  
  // Yellows & Oranges
  { hex: "#FFFF00", name: "Yellow" },
  { hex: "#FFD700", name: "Gold" },
  { hex: "#FFD700", name: "Mustard" },
  { hex: "#FFA500", name: "Orange" },
  { hex: "#FF8C00", name: "Dark Orange" },
];

export const STYLE_VIBES: { id: StyleVibe; label: string; emoji: string }[] = [
  { id: "casual", label: "Casual", emoji: "👕" },
  { id: "minimal", label: "Minimal", emoji: "◻️" },
  { id: "office", label: "Office", emoji: "💼" },
  { id: "street", label: "Street", emoji: "🔥" },
  { id: "feminine", label: "Feminine", emoji: "🌸" },
  { id: "sporty", label: "Sporty", emoji: "⚡" },
];

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "tops", label: "Tops" },
  { id: "bottoms", label: "Bottoms" },
  { id: "skirts", label: "Skirts" },
  { id: "dresses", label: "Dresses" },
  { id: "outerwear", label: "Outerwear" },
  { id: "shoes", label: "Shoes" },
  { id: "bags", label: "Bags" },
  { id: "accessories", label: "Accessories" },
];

export const SIZE_OPTIONS = {
  top: ["XS", "S", "M", "L", "XL", "XXL"],
  bottom: ["24", "26", "28", "30", "32", "34", "36", "38"],
  shoes: ["5", "6", "7", "8", "9", "10", "11", "12"],
};
