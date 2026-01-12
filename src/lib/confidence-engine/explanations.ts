/**
 * Confidence Engine - Explanations Module
 *
 * Determines explanation eligibility and selects appropriate templates.
 * Explanations are only shown for HIGH confidence matches to preserve trust.
 */

import type {
  PairEvaluation,
  PairType,
  ConfidenceItem,
  ExplanationResult,
} from './types';

import {
  FEATURE_FLAGS,
  EXPLANATION_TEMPLATES,
  FORBIDDEN_RULE_IDS,
  type ExplanationTemplate,
} from './config';

// ============================================
// FORBIDDEN RULES
// ============================================

/**
 * Check if explanation is forbidden for this pair.
 *
 * Forbidden scenarios:
 * 1. Both items are statement pieces (too subjective)
 * 2. Shoes involved and flag disabled
 * 3. Texture clash detected (too contentious)
 * 4. Style opposition (shouldn't explain bad matches)
 */
export function checkForbiddenRules(
  evaluation: PairEvaluation,
  _itemA: ConfidenceItem,
  _itemB: ConfidenceItem
): { forbidden: boolean; reason: string | null } {
  // Rule 1: Both statement pieces
  if (evaluation.both_statement) {
    return {
      forbidden: true,
      reason: FORBIDDEN_RULE_IDS.STATEMENT_STATEMENT,
    };
  }

  // Rule 2: Shoes with flag disabled
  if (
    evaluation.is_shoes_involved &&
    !FEATURE_FLAGS.explanations_allow_shoes
  ) {
    return {
      forbidden: true,
      reason: FORBIDDEN_RULE_IDS.SHOES_CONTENTIOUS,
    };
  }

  // Rule 3: Texture clash in cap reasons
  if (evaluation.cap_reasons.includes('TEXTURE_CLASH')) {
    return {
      forbidden: true,
      reason: FORBIDDEN_RULE_IDS.TEXTURE_CLASH,
    };
  }

  // Rule 4: Style opposition (hard fail)
  if (evaluation.hard_fail_reason === 'STYLE_OPPOSITION_NO_OVERLAP') {
    return {
      forbidden: true,
      reason: FORBIDDEN_RULE_IDS.STYLE_OPPOSITION,
    };
  }

  return { forbidden: false, reason: null };
}

// ============================================
// ELIGIBILITY CHECK
// ============================================

/**
 * Check if an explanation should be shown for this pair.
 *
 * Requirements:
 * 1. Feature flag enabled
 * 2. Confidence tier >= min threshold
 * 3. Not forbidden by rules
 */
export function isExplanationEligible(
  evaluation: PairEvaluation,
  itemA: ConfidenceItem,
  itemB: ConfidenceItem
): { eligible: boolean; reason: string | null } {
  // Check feature flag
  if (!FEATURE_FLAGS.explanations_enabled) {
    return { eligible: false, reason: 'feature_disabled' };
  }

  // Check confidence tier - only show explanations for HIGH confidence
  // Currently we only allow HIGH, but config can extend to MEDIUM in future
  if (evaluation.confidence_tier !== 'HIGH') {
    return { eligible: false, reason: 'confidence_too_low' };
  }

  // Check forbidden rules
  const forbidden = checkForbiddenRules(evaluation, itemA, itemB);
  if (forbidden.forbidden) {
    return { eligible: false, reason: forbidden.reason };
  }

  return { eligible: true, reason: null };
}

// ============================================
// TEMPLATE SELECTION
// ============================================

/**
 * Select the best explanation template for a pair.
 *
 * Selection criteria:
 * 1. Match pair_type (or 'any')
 * 2. Prefer pair-specific templates over generic
 * 3. Randomly select from matching templates
 */
export function selectTemplate(
  pairType: PairType
): ExplanationTemplate | null {
  // Find templates that match this pair type
  const matchingTemplates = EXPLANATION_TEMPLATES.filter(
    (t) => t.pair_type === pairType || t.pair_type === 'any'
  );

  if (matchingTemplates.length === 0) {
    return null;
  }

  // Prefer pair-specific templates
  const specific = matchingTemplates.filter((t) => t.pair_type === pairType);

  if (specific.length > 0) {
    // Random selection from specific templates
    return specific[Math.floor(Math.random() * specific.length)];
  }

  // Fall back to generic templates
  const generic = matchingTemplates.filter((t) => t.pair_type === 'any');
  if (generic.length > 0) {
    return generic[Math.floor(Math.random() * generic.length)];
  }

  return null;
}

/**
 * Determine specificity level for explanation.
 *
 * Levels:
 * 1. Abstract (always safe)
 * 2. Soft attributes (e.g., "relaxed feel")
 * 3. Concrete (rare, e.g., specific colors - usually avoided)
 *
 * Selection based on:
 * - Feature signal strength (stronger signals = more specific)
 * - Template's max_specificity_level
 */
export function determineSpecificityLevel(
  evaluation: PairEvaluation,
  template: ExplanationTemplate
): 1 | 2 | 3 {
  const maxLevel = template.max_specificity_level;

  // Check if we have strong positive signals
  const strongPositive =
    (evaluation.features.S.known && evaluation.features.S.value >= 2) ||
    (evaluation.features.F.known && evaluation.features.F.value >= 2);

  // Level 3: Only for very strong matches with concrete variant available
  if (maxLevel >= 3 && strongPositive && template.concrete_variant) {
    // Still rare - only 10% of the time
    if (Math.random() < 0.1) {
      return 3;
    }
  }

  // Level 2: For good matches with soft variant available
  if (maxLevel >= 2 && strongPositive && template.soft_variant) {
    return 2;
  }

  // Level 1: Default (abstract)
  return 1;
}

/**
 * Get explanation text for the selected template and specificity level.
 */
export function getExplanationText(
  template: ExplanationTemplate,
  level: 1 | 2 | 3
): string {
  switch (level) {
    case 3:
      return template.concrete_variant ?? template.soft_variant ?? template.base_text;
    case 2:
      return template.soft_variant ?? template.base_text;
    case 1:
    default:
      return template.base_text;
  }
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Generate explanation for a pair evaluation.
 * Returns null if not eligible or no suitable template.
 */
export function generateExplanation(
  evaluation: PairEvaluation,
  itemA: ConfidenceItem,
  itemB: ConfidenceItem
): ExplanationResult {
  // Check eligibility
  const eligibility = isExplanationEligible(evaluation, itemA, itemB);

  if (!eligibility.eligible) {
    return {
      allowed: false,
      forbidden_reason: eligibility.reason,
      template_id: null,
      specificity_level: null,
      text: null,
    };
  }

  // Select template
  const template = selectTemplate(evaluation.pair_type);

  if (!template) {
    return {
      allowed: false,
      forbidden_reason: 'no_template_found',
      template_id: null,
      specificity_level: null,
      text: null,
    };
  }

  // Determine specificity level
  const level = determineSpecificityLevel(evaluation, template);

  // Get text
  const text = getExplanationText(template, level);

  return {
    allowed: true,
    forbidden_reason: null,
    template_id: template.id,
    specificity_level: level,
    text: text,
  };
}

/**
 * Enrich a PairEvaluation with explanation data.
 */
export function enrichWithExplanation(
  evaluation: PairEvaluation,
  itemA: ConfidenceItem,
  itemB: ConfidenceItem
): PairEvaluation {
  const result = generateExplanation(evaluation, itemA, itemB);

  return {
    ...evaluation,
    explanation_allowed: result.allowed,
    explanation_forbidden_reason: result.forbidden_reason,
    explanation_template_id: result.template_id,
    explanation_specificity_level: result.specificity_level,
  };
}
