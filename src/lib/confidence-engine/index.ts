/**
 * Confidence Engine - Main Export
 *
 * A deterministic, rules-based confidence scoring system for outfit matching.
 * The engine reasons about how clothes are worn, not whether they're stylish.
 *
 * Core philosophy: "Silence is a trust-preserving feature, not a failure state."
 *
 * Confidence Tiers:
 * - HIGH: Show matches, allow explanations
 * - MEDIUM: Hide matches, show Mode B suggestions
 * - LOW: Stay silent
 */

// Types
export type {
  Category,
  PairType,
  StyleFamily,
  Saturation,
  Value,
  ColorProfile,
  FormalityLevel,
  TextureType,
  SilhouetteVolume,
  SilhouetteLength,
  SilhouetteProfile,
  ConfidenceItem,
  FeatureCode,
  FeatureResult,
  FeatureSignals,
  CapReason,
  HardFailReason,
  ConfidenceTier,
  HardFailResult,
  GateResult,
  PairEvaluation,
  SuggestionsMode,
  OutfitEvaluation,
  ModeBSuggestion,
  ModeBBulletResolved,
  ModeASuggestion,
  SuggestionBullet,
  SuggestionTargetCategory,
  ExplanationResult,
  EvalContext,
} from './types';

// Config
export {
  FEATURE_FLAGS,
  THRESHOLDS,
  WEIGHTS_BY_PAIR_TYPE,
  getWeightsForPairType,
  getStyleDistance,
  SAFE_GENERIC_BULLET,
  REASON_PRIORITY,
  MODE_B_CONFIG,
  OUTFIT_CONFIG,
  EXPLANATION_TEMPLATES,
  FORBIDDEN_RULE_IDS,
  resolveBulletTitle,
  isValidBulletKey,
  type BulletKey,
  type ModeABulletKey,
  type ModeBBulletKey,
  type ExplanationTemplate,
} from './config';

// Utilities
export {
  hasShoes,
  getPairType,
  hueDist,
  colorScore,
  styleScore,
  formalityScore,
  textureScore,
  usageScore,
  normalizeFeatureValue,
  denormalizeFeatureValue,
  getCoveredCategory,
  getCoveredCategories,
} from './utils';

// Feature Signals
export {
  computeFeatureSignals,
  countKnownFeatures,
  getMinFeatureValue,
  getMaxFeatureValue,
  hasStrongNegative,
} from './signals';

// Scoring
export {
  redistributeWeights,
  computeRawScore,
  getFeatureContributions,
  getDominantFeature,
} from './scoring';

// Gates
export {
  checkHardFails,
  computeCapReasons,
  evaluateGates,
} from './gates';

// Tier Mapping
export {
  mapScoreToTier,
  scoreToTier,
  tierToNumber,
  compareTiers,
  minTier,
  maxTier,
  meetsMinimum,
  isNearMatch,
  getHighThresholdUsed,
} from './tiers';

// Suggestions
export {
  shouldShowModeB,
  selectNearMatches,
  aggregateCapReasons,
  // V2 Style-Aware (primary API)
  generateModeASuggestionsV2,
  generateModeBSuggestionsV2,
  generateOutfitModeBSuggestionsV2,
  buildModeBBullets,
  getModeBBullets,
} from './suggestions';

// Pair Evaluation
export {
  evaluatePair,
  evaluateAllPairs,
  evaluateAgainstWardrobe,
} from './pair-evaluation';

// Outfit Evaluation
export {
  evaluateOutfit,
  determineSuggestionsMode,
  groupMatchesByCategory,
  getBestMatchPerCategory,
} from './outfit-evaluation';

// Explanations
export {
  checkForbiddenRules,
  isExplanationEligible,
  selectTemplate,
  determineSpecificityLevel,
  getExplanationText,
  generateExplanation,
  enrichWithExplanation,
} from './explanations';

// Integration (App type conversion)
export {
  toColorProfile,
  toStyleFamily,
  inferFormalityLevel,
  inferTextureType,
  wardrobeItemToConfidenceItem,
  scannedItemToConfidenceItem,
  convertWardrobe,
  scannedItemWithSignalsToConfidenceItem,
  mergeWithExplicitSignals,
  // V2 Style-Aware
  resolveUiVibeForCopy,
  VIBE_PRIORITY,
  STYLE_FAMILY_TO_UI_VIBE,
  type EnhancedColorProfile,
  type ConfidenceSignals,
} from './integration';

// Analytics
export {
  setAnalyticsCallback,
  startNewSession,
  getSessionId,
  trackPairEvaluation,
  trackOutfitEvaluation,
  trackTierDistribution,
  trackCapReasonFrequency,
  calculateAverageScore,
  calculateTierPercentages,
  type ConfidenceEngineEvent,
  type PairEvaluationEvent,
  type OutfitEvaluationEvent,
} from './analytics';
