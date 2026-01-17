/**
 * Confidence Engine - Type Definitions
 *
 * Core types for the styling confidence system.
 * These types define the contract between all modules.
 */

// ============================================
// EVALUATION CONTEXT (for telemetry)
// ============================================

/**
 * Optional context passed through evaluation functions for telemetry.
 * Functions should not depend on this context; it's purely for logging.
 */
export interface EvalContext {
  /** Unique ID for this scan session (for flip detection across rescans) */
  scan_session_id?: string;
}

// ============================================
// CATEGORY & PAIR TYPES
// ============================================

export type Category =
  | 'tops'
  | 'bottoms'
  | 'shoes'
  | 'outerwear'
  | 'dresses'
  | 'accessories'
  | 'bags'
  | 'skirts';

export type PairType =
  | 'tops_bottoms'
  | 'tops_shoes'
  | 'tops_outerwear'
  | 'bottoms_shoes'
  | 'bottoms_outerwear'
  | 'shoes_outerwear'
  | 'tops_accessories'
  | 'bottoms_accessories'
  | 'shoes_accessories'
  | 'outerwear_accessories'
  | 'tops_bags'
  | 'bottoms_bags'
  | 'dresses_shoes'
  | 'dresses_outerwear'
  | 'dresses_accessories'
  | 'dresses_bags'
  | 'skirts_tops'
  | 'skirts_shoes'
  | 'skirts_outerwear';

// ============================================
// STYLE FAMILY
// ============================================

export type StyleFamily =
  | 'minimal'
  | 'classic'
  | 'street'
  | 'athleisure'
  | 'romantic'
  | 'edgy'
  | 'boho'
  | 'preppy'
  | 'formal'
  | 'unknown';

// ============================================
// COLOR PROFILE
// ============================================

export type Saturation = 'low' | 'med' | 'high';
export type Value = 'low' | 'med' | 'high';

export interface ColorProfile {
  is_neutral: boolean;
  dominant_hue?: number;  // 0-360, omit if neutral
  saturation: Saturation;
  value: Value;
}

// ============================================
// FORMALITY & TEXTURE
// ============================================

/**
 * Formality level (1-5 scale)
 * 1 = athleisure/loungewear
 * 2 = casual everyday
 * 3 = smart casual
 * 4 = business
 * 5 = formal/black-tie
 */
export type FormalityLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Texture/material profile
 */
export type TextureType =
  | 'smooth'
  | 'textured'
  | 'soft'
  | 'structured'
  | 'mixed'
  | 'unknown';

// ============================================
// SILHOUETTE (V2)
// ============================================

export type SilhouetteVolume = 'fitted' | 'regular' | 'oversized' | 'unknown';
export type SilhouetteLength = 'short' | 'regular' | 'long' | 'unknown';

export interface SilhouetteProfile {
  volume: SilhouetteVolume;
  length: SilhouetteLength;
}

// ============================================
// ITEM (INPUT)
// ============================================

export interface ConfidenceItem {
  id: string;
  category: Category;

  // Required for scoring
  color_profile: ColorProfile;
  style_family: StyleFamily;
  formality_level: FormalityLevel;
  texture_type: TextureType;

  // Optional (v2)
  silhouette_profile?: SilhouetteProfile;
  season_weight?: 'light' | 'mid' | 'heavy';

  // Metadata
  image_uri?: string;
  label?: string;
}

// ============================================
// FEATURE SIGNALS
// ============================================

export type FeatureCode = 'C' | 'S' | 'F' | 'T' | 'U' | 'V';

export interface FeatureResult {
  value: number;    // -2 to +2
  known: boolean;   // false = unknown, contribute 0
}

export interface FeatureSignals {
  C: FeatureResult;  // Color compatibility
  S: FeatureResult;  // Style family overlap
  F: FeatureResult;  // Formality alignment
  T: FeatureResult;  // Texture/material harmony
  U: FeatureResult;  // Function/context alignment
  V?: FeatureResult; // Silhouette balance (v2, optional)
}

// ============================================
// CAP REASONS
// ============================================

export type CapReason =
  | 'FORMALITY_TENSION'
  | 'STYLE_TENSION'
  | 'COLOR_TENSION'
  | 'TEXTURE_CLASH'
  | 'USAGE_MISMATCH'
  | 'SHOES_CONFIDENCE_DAMPEN'
  | 'MISSING_KEY_SIGNAL';

export type HardFailReason =
  | 'FORMALITY_CLASH_WITH_USAGE'
  | 'STYLE_OPPOSITION_NO_OVERLAP'
  | 'SHOES_TEXTURE_FORMALITY_CLASH';

// ============================================
// CONFIDENCE TIERS
// ============================================

export type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW';

// ============================================
// GATE RESULTS
// ============================================

export interface HardFailResult {
  failed: boolean;
  reason: HardFailReason | null;
}

export interface GateResult {
  forced_tier: 'LOW' | null;
  hard_fail_reason: HardFailReason | null;
  max_tier: 'HIGH' | 'MEDIUM';
  cap_reasons: CapReason[];
}

// ============================================
// PAIR EVALUATION (OUTPUT)
// ============================================

export interface PairEvaluation {
  // Identity
  item_a_id: string;
  item_b_id: string;
  pair_type: PairType;

  // Scores
  raw_score: number;  // 0-1, weighted sum
  confidence_tier: ConfidenceTier;

  // Gating results
  forced_tier: 'LOW' | null;
  hard_fail_reason: HardFailReason | null;
  cap_reasons: CapReason[];  // Empty if forced_tier = LOW

  // Features
  features: FeatureSignals;

  // Explanation eligibility
  explanation_allowed: boolean;
  explanation_forbidden_reason: string | null;
  explanation_template_id: string | null;
  explanation_specificity_level: 1 | 2 | 3 | null;

  // Statement detection (for forbidden rules)
  both_statement: boolean;

  // Debugging metadata
  is_shoes_involved: boolean;
  high_threshold_used: 0.78 | 0.82;
  weights_used: Record<FeatureCode, number>;
}

// ============================================
// OUTFIT EVALUATION (AGGREGATED OUTPUT)
// ============================================

export type SuggestionsMode = 'A' | 'B';

export interface OutfitEvaluation {
  show_matches_section: boolean;
  outfit_confidence: ConfidenceTier;
  best_match?: PairEvaluation;
  matches: PairEvaluation[];        // HIGH only, ranked by score
  /**
   * All qualifying NEAR matches (Type 2a + Type 2b). NOT capped.
   * Sorted: Type 2a first (by score desc), then Type 2b (by score desc).
   * 
   * - UI (Worth Trying tab, View all): uses full list
   * - Mode B suggestions: uses near_matches.slice(0, 5)
   */
  near_matches: PairEvaluation[];
  suggestions_mode: SuggestionsMode;
  matched_categories: Category[];   // Categories with MEDIUM+ matches (for Mode A filtering)
}

// ============================================
// SUGGESTION TYPES
// ============================================

/**
 * Target category for Mode A suggestions.
 * Used to filter out redundant suggestions and
 * drive UI (icons, "Add from wardrobe" modal).
 */
export type SuggestionTargetCategory = Category | null;

/**
 * Structured suggestion bullet.
 * - key: Unique identifier that maps to TIP_SHEETS for tip sheet content
 * - text: The human-readable suggestion
 * - target: The category this suggestion relates to (for filtering/UI)
 */
export interface SuggestionBullet {
  key: string;
  text: string;
  target: SuggestionTargetCategory;
}

/**
 * Mode A suggestions (missing pieces / what to add)
 */
export interface ModeASuggestion {
  intro: string;
  bullets: SuggestionBullet[];
}

/**
 * Mode B suggestions (styling tips for near-matches)
 */
export interface ModeBBulletResolved {
  key: string;
  text: string;
}

export interface ModeBSuggestion {
  bullets: ModeBBulletResolved[];
  reasons_used: CapReason[];
}

// ============================================
// EXPLANATION
// ============================================

export interface ExplanationResult {
  allowed: boolean;
  forbidden_reason: string | null;
  template_id: string | null;
  specificity_level: 1 | 2 | 3 | null;
  text: string | null;
}
