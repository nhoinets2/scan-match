/**
 * Trust Filter v1 - Type Definitions
 *
 * Types for the post-CE trust guardrail that prevents
 * trust-breaking HIGH matches using style_signals_v1.
 */

// ============================================
// STYLE SIGNALS V1 TYPES (Epic 1)
// ============================================

/**
 * Aesthetic archetype enum (12 archetypes + special values)
 */
export type AestheticArchetype =
  | 'minimalist'
  | 'classic'
  | 'workwear'
  | 'romantic'
  | 'boho'
  | 'western'
  | 'street'
  | 'sporty'
  | 'edgy'
  | 'glam'
  | 'preppy'
  | 'outdoor_utility'
  | 'unknown'
  | 'none';

/**
 * Formality band enum
 */
export type FormalityBand =
  | 'athleisure'
  | 'casual'
  | 'smart_casual'
  | 'office'
  | 'formal'
  | 'evening'
  | 'unknown';

/**
 * Statement level enum
 */
export type StatementLevel = 'low' | 'medium' | 'high' | 'unknown';

/**
 * Season heaviness enum
 */
export type SeasonHeaviness = 'light' | 'mid' | 'heavy' | 'unknown';

/**
 * Pattern level enum
 */
export type PatternLevel = 'solid' | 'subtle' | 'bold' | 'unknown';

/**
 * Material family enum
 */
export type MaterialFamily =
  | 'denim'
  | 'knit'
  | 'leather'
  | 'silk_satin'
  | 'cotton'
  | 'wool'
  | 'synthetic_tech'
  | 'other'
  | 'unknown';

/**
 * Palette color enum
 */
export type PaletteColor =
  | 'black'
  | 'white'
  | 'cream'
  | 'gray'
  | 'brown'
  | 'tan'
  | 'beige'
  | 'navy'
  | 'denim_blue'
  | 'blue'
  | 'red'
  | 'pink'
  | 'green'
  | 'olive'
  | 'yellow'
  | 'orange'
  | 'purple'
  | 'metallic'
  | 'multicolor'
  | 'unknown';

/**
 * Style Signals v1 JSON schema
 * Keys are NEVER omitted.
 */
export interface StyleSignalsV1 {
  version: 1;

  aesthetic: {
    primary: AestheticArchetype;
    primary_confidence: number; // 0..1
    secondary: AestheticArchetype;
    secondary_confidence: number; // 0..1
  };

  formality: {
    band: FormalityBand;
    confidence: number;
  };

  statement: {
    level: StatementLevel;
    confidence: number;
  };

  season: {
    heaviness: SeasonHeaviness;
    confidence: number;
  };

  palette: {
    colors: PaletteColor[];
    confidence: number;
  };

  pattern: {
    level: PatternLevel;
    confidence: number;
  };

  material: {
    family: MaterialFamily;
    confidence: number;
  };
}

// ============================================
// TRUST FILTER TYPES
// ============================================

/**
 * Category enum (matches CE categories)
 */
export type TFCategory =
  | 'tops'
  | 'bottoms'
  | 'skirts'
  | 'dresses'
  | 'shoes'
  | 'outerwear'
  | 'bags'
  | 'accessories';

/**
 * Trust Filter action outcomes
 */
export type TrustFilterAction = 'keep' | 'demote_to_near' | 'hide';

/**
 * Archetype distance levels
 */
export type ArchetypeDistance = 'close' | 'medium' | 'far';

/**
 * Hard reason codes (default action: hide)
 */
export type HardReasonCode =
  | 'formality_hard_clash'
  | 'style_archetype_hard_clash'
  | 'weather_season_hard_clash'
  | 'function_incompatible'; // placeholder for v1.1

/**
 * Soft reason codes (default action: demote)
 */
export type SoftReasonCode =
  | 'athleisure_vs_polished_clash'
  | 'statement_vs_statement_overload'
  | 'statement_context_mismatch'
  | 'context_dependent_needs_anchor'
  | 'weather_season_soft_mismatch'
  | 'silhouette_conflict_strong' // placeholder for v1.1
  | 'length_proportion_conflict' // placeholder for v1.1
  | 'pattern_texture_overload'
  | 'low_confidence_inputs';

/**
 * Info reason codes (action: keep, for observability)
 */
export type InfoReasonCode = 'insufficient_info' | 'evaluation_error';

/**
 * All reason codes
 */
export type TrustFilterReasonCode =
  | HardReasonCode
  | SoftReasonCode
  | InfoReasonCode;

/**
 * Debug information for a Trust Filter decision
 */
export interface TrustFilterDebug {
  formality_gap: number | null;
  season_diff: number | null;
  archetype_distance: ArchetypeDistance | null;
  used_secondary: boolean;
  confidence_gate_hit: boolean;
  error_code?: string;
  error_message?: string;
}

/**
 * Single step in the evaluation trace
 */
export interface TraceStep {
  step: string;
  applied: boolean;
  inputs: Record<string, unknown>;
  output: {
    action?: TrustFilterAction;
    reason?: TrustFilterReasonCode;
  };
}

/**
 * Trust Filter evaluation result for a single pair
 */
export interface TrustFilterResult {
  action: TrustFilterAction;
  primary_reason: TrustFilterReasonCode | null;
  secondary_reasons: TrustFilterReasonCode[];
  debug: TrustFilterDebug;
  trace?: TraceStep[];
}

/**
 * Input for Trust Filter evaluation
 */
export interface TrustFilterInput {
  scanSignals: StyleSignalsV1 | null;
  matchSignals: StyleSignalsV1 | null;
  scanCategory: TFCategory;
  matchCategory: TFCategory;
  ceTier: 'HIGH' | 'MEDIUM' | 'LOW';
  ceScore?: number;
}

/**
 * Pair type for category combinations
 */
export type PairTypeCategory = 'outfit_completing' | 'anchor_dependent' | 'other';

/**
 * Category group
 */
export type CategoryGroup = 'core' | 'footwear' | 'carriers' | 'finishers';

// ============================================
// CLUSTER TYPES
// ============================================

/**
 * Aesthetic cluster names
 */
export type AestheticCluster =
  | 'tailored_core'
  | 'soft_feminine'
  | 'casual_urban'
  | 'night_edge'
  | 'western'
  | 'utility';

/**
 * Cluster distance matrix type
 */
export type ClusterDistanceMatrix = Record<
  AestheticCluster,
  Record<AestheticCluster, ArchetypeDistance>
>;
