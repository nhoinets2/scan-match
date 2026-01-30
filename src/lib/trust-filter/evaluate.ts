/**
 * Trust Filter v1 - Main Evaluation Function
 *
 * Pure function that evaluates a single pair and returns
 * keep/demote/hide decision with reason codes and debug info.
 */

import { TRUST_FILTER_CONFIG_V1 } from './config';
import {
  computeArchetypeDistance,
  computeFormalityGap,
  computeSeasonDiff,
  hasFormality,
  bothStatementGte,
  oneStatementGte,
  bothPatternGte,
  onePatternBold,
  getPairType,
  isBagsOrAccessories,
  isShoesTopsPair,
  hasSkirts,
  hasHighPrimaryConfidence,
  hasLowConfidenceInputs,
} from './helpers';
import type {
  TrustFilterInput,
  TrustFilterResult,
  TrustFilterAction,
  TrustFilterReasonCode,
  HardReasonCode,
  SoftReasonCode,
  TrustFilterDebug,
  TraceStep,
  ArchetypeDistance,
  TFCategory,
} from './types';

const config = TRUST_FILTER_CONFIG_V1;

// ============================================
// MAIN EVALUATION FUNCTION
// ============================================

/**
 * Evaluate a single pair through the Trust Filter.
 *
 * This is a pure function with no side effects.
 * Wrap calls in try/catch at the integration layer.
 *
 * @param input - The pair to evaluate
 * @param enableTrace - Whether to include detailed trace (for debugging)
 * @returns TrustFilterResult with action, reasons, and debug info
 */
export function evaluateTrustFilterPair(
  input: TrustFilterInput,
  enableTrace: boolean = false
): TrustFilterResult {
  const trace: TraceStep[] = [];
  const collectedHideReasons: HardReasonCode[] = [];
  const collectedDemoteReasons: SoftReasonCode[] = [];

  const { scanSignals, matchSignals, scanCategory, matchCategory } = input;

  // Initialize debug object
  const debug: TrustFilterDebug = {
    formality_gap: null,
    season_diff: null,
    archetype_distance: null,
    used_secondary: false,
    confidence_gate_hit: false,
  };

  // ============================================
  // STEP 1: Check for missing signals
  // ============================================

  if (!scanSignals || !matchSignals) {
    if (enableTrace) {
      trace.push({
        step: 'missing_signals_check',
        applied: true,
        inputs: {
          scanSignals: scanSignals ? 'present' : 'missing',
          matchSignals: matchSignals ? 'present' : 'missing',
        },
        output: { action: 'keep', reason: 'insufficient_info' },
      });
    }

    return {
      action: 'keep',
      primary_reason: 'insufficient_info',
      secondary_reasons: [],
      debug: { ...debug, confidence_gate_hit: true },
      trace: enableTrace ? trace : undefined,
    };
  }

  // ============================================
  // STEP 2: Compute derived values
  // ============================================

  const formalityGap = computeFormalityGap(scanSignals, matchSignals);
  debug.formality_gap = formalityGap;

  const seasonDiff = computeSeasonDiff(scanSignals, matchSignals);
  debug.season_diff = seasonDiff;

  const { distance: archetypeDistance, usedSecondary } = computeArchetypeDistance(
    scanSignals,
    matchSignals
  );
  debug.archetype_distance = archetypeDistance;
  debug.used_secondary = usedSecondary;

  if (enableTrace) {
    trace.push({
      step: 'compute_derived_values',
      applied: true,
      inputs: {
        scanFormality: scanSignals.formality.band,
        matchFormality: matchSignals.formality.band,
        scanAesthetic: scanSignals.aesthetic.primary,
        matchAesthetic: matchSignals.aesthetic.primary,
      },
      output: {},
    });
  }

  // ============================================
  // STEP 3: Evaluate HIDE triggers
  // ============================================

  // 3a. Formality hard clash
  if (formalityGap !== null) {
    for (const rule of config.formality.rules.hide_if) {
      if (rule.gap_gte && formalityGap >= rule.gap_gte) {
        if (!rule.either_is || hasFormality(scanSignals, matchSignals, rule.either_is)) {
          collectedHideReasons.push(rule.reason);
          if (enableTrace) {
            trace.push({
              step: `formality.hide_if.gap_gte_${rule.gap_gte}${rule.either_is ? `_${rule.either_is}` : ''}`,
              applied: true,
              inputs: { formalityGap, rule },
              output: { action: 'hide', reason: rule.reason },
            });
          }
        }
      }
    }
  }

  // 3b. Season hard clash
  if (seasonDiff !== null) {
    for (const rule of config.season.rules.hide_if) {
      if (seasonDiff >= rule.diff_gte) {
        collectedHideReasons.push(rule.reason);
        if (enableTrace) {
          trace.push({
            step: `season.hide_if.diff_gte_${rule.diff_gte}`,
            applied: true,
            inputs: { seasonDiff, rule },
            output: { action: 'hide', reason: rule.reason },
          });
        }
      }
    }
  }

  // 3c. Archetype hard clash
  if (archetypeDistance === 'far') {
    const clashConfig = config.aesthetic.hard_clash_rules.emit_style_archetype_hard_clash_if;

    if (hasHighPrimaryConfidence(scanSignals, matchSignals)) {
      // Check if secondary softening was applied
      if (usedSecondary && clashConfig.allow_secondary_to_soften) {
        // Secondary softened it, don't emit hard clash
        if (enableTrace) {
          trace.push({
            step: 'aesthetic.hard_clash_check.softened_by_secondary',
            applied: false,
            inputs: { archetypeDistance, usedSecondary },
            output: {},
          });
        }
      } else {
        collectedHideReasons.push('style_archetype_hard_clash');
        if (enableTrace) {
          trace.push({
            step: 'aesthetic.hard_clash_check',
            applied: true,
            inputs: { archetypeDistance, usedSecondary },
            output: { action: 'hide', reason: 'style_archetype_hard_clash' },
          });
        }
      }
    } else {
      debug.confidence_gate_hit = true;
      if (enableTrace) {
        trace.push({
          step: 'aesthetic.hard_clash_check.confidence_gate',
          applied: false,
          inputs: {
            archetypeDistance,
            scanPrimaryConf: scanSignals.aesthetic.primary_confidence,
            matchPrimaryConf: matchSignals.aesthetic.primary_confidence,
          },
          output: {},
        });
      }
    }
  }

  // ============================================
  // STEP 4: Evaluate DEMOTE triggers
  // ============================================

  // 4a. Formality demote rules
  if (formalityGap !== null) {
    for (const rule of config.formality.rules.demote_if) {
      const gapMatches =
        (rule.gap_eq !== undefined && formalityGap === rule.gap_eq) ||
        (rule.gap_gte !== undefined && formalityGap >= rule.gap_gte);

      if (gapMatches) {
        if (!rule.either_is || hasFormality(scanSignals, matchSignals, rule.either_is)) {
          // Only add as demote if it's a soft reason
          if (config.reason_codes.soft.includes(rule.reason as SoftReasonCode)) {
            collectedDemoteReasons.push(rule.reason as SoftReasonCode);
            if (enableTrace) {
              trace.push({
                step: `formality.demote_if.gap_${rule.gap_eq !== undefined ? 'eq' : 'gte'}_${rule.gap_eq ?? rule.gap_gte}`,
                applied: true,
                inputs: { formalityGap, rule },
                output: { action: 'demote_to_near', reason: rule.reason },
              });
            }
          }
        }
      }
    }
  }

  // 4b. Season demote rules
  if (seasonDiff !== null) {
    for (const rule of config.season.rules.demote_if) {
      if (seasonDiff === rule.diff_eq) {
        collectedDemoteReasons.push(rule.reason);
        if (enableTrace) {
          trace.push({
            step: `season.demote_if.diff_eq_${rule.diff_eq}`,
            applied: true,
            inputs: { seasonDiff, rule },
            output: { action: 'demote_to_near', reason: rule.reason },
          });
        }
      }
    }
  }

  // 4c. Statement demote rules
  for (const rule of config.statement.rules.demote_if) {
    let triggered = false;

    if (rule.both_gte !== undefined && archetypeDistance) {
      if (
        bothStatementGte(scanSignals, matchSignals, rule.both_gte) &&
        rule.archetype_distance_in.includes(archetypeDistance)
      ) {
        triggered = true;
      }
    }

    if (rule.one_gte !== undefined && archetypeDistance) {
      if (
        oneStatementGte(scanSignals, matchSignals, rule.one_gte) &&
        rule.archetype_distance_in.includes(archetypeDistance)
      ) {
        triggered = true;
      }
    }

    if (triggered) {
      collectedDemoteReasons.push(rule.reason);
      if (enableTrace) {
        trace.push({
          step: `statement.demote_if.${rule.both_gte !== undefined ? 'both' : 'one'}_gte_${rule.both_gte ?? rule.one_gte}`,
          applied: true,
          inputs: { archetypeDistance, rule },
          output: { action: 'demote_to_near', reason: rule.reason },
        });
      }
    }
  }

  // 4d. Pattern demote rules
  for (const rule of config.pattern.rules.demote_if) {
    if (bothPatternGte(scanSignals, matchSignals, rule.both_gte)) {
      collectedDemoteReasons.push(rule.reason);
      if (enableTrace) {
        trace.push({
          step: `pattern.demote_if.both_gte_${rule.both_gte}`,
          applied: true,
          inputs: { rule },
          output: { action: 'demote_to_near', reason: rule.reason },
        });
      }
    }
  }

  // 4e. Low confidence inputs
  if (hasLowConfidenceInputs(scanSignals, matchSignals)) {
    collectedDemoteReasons.push('low_confidence_inputs');
    if (enableTrace) {
      trace.push({
        step: 'low_confidence_inputs_check',
        applied: true,
        inputs: {
          scanAestheticConf: scanSignals.aesthetic.primary_confidence,
          matchAestheticConf: matchSignals.aesthetic.primary_confidence,
        },
        output: { action: 'demote_to_near', reason: 'low_confidence_inputs' },
      });
    }
  }

  // ============================================
  // STEP 5: Anchor rule
  // ============================================

  const pairType = getPairType(scanCategory, matchCategory);

  if (
    config.anchor_rule.enabled &&
    pairType === config.anchor_rule.trigger_if.pair_type_is &&
    archetypeDistance === config.anchor_rule.trigger_if.archetype_distance_is
  ) {
    const formalityOk =
      formalityGap === null ||
      formalityGap <= config.anchor_rule.trigger_if.formality_gap_lte;

    const anyOfTriggered = config.anchor_rule.trigger_if.any_of.some((condition) => {
      if (condition.statement_one_is === 'high') {
        return oneStatementGte(scanSignals, matchSignals, 2);
      }
      if (condition.pattern_one_is === 'bold') {
        return onePatternBold(scanSignals, matchSignals);
      }
      return false;
    });

    if (formalityOk && anyOfTriggered) {
      collectedDemoteReasons.push(config.anchor_rule.action.reason);
      if (enableTrace) {
        trace.push({
          step: 'anchor_rule',
          applied: true,
          inputs: { pairType, archetypeDistance, formalityGap },
          output: {
            action: config.anchor_rule.action.type,
            reason: config.anchor_rule.action.reason,
          },
        });
      }
    }
  }

  // ============================================
  // STEP 6: Apply category policies
  // ============================================

  let finalAction: TrustFilterAction = 'keep';
  let primaryReason: TrustFilterReasonCode | null = null;
  const secondaryReasons: TrustFilterReasonCode[] = [];

  // Determine initial action from collected reasons
  if (collectedHideReasons.length > 0) {
    // Pick hide reason by priority
    for (const reason of config.decision_priority.hide_order) {
      if (collectedHideReasons.includes(reason)) {
        primaryReason = reason;
        finalAction = 'hide';
        break;
      }
    }
  }

  if (finalAction !== 'hide' && collectedDemoteReasons.length > 0) {
    // Pick demote reason by priority
    for (const reason of config.decision_priority.demote_order) {
      if (collectedDemoteReasons.includes(reason)) {
        primaryReason = reason;
        finalAction = 'demote_to_near';
        break;
      }
    }
  }

  // Collect secondary reasons
  const allReasons = [...collectedHideReasons, ...collectedDemoteReasons];
  for (const reason of allReasons) {
    if (reason !== primaryReason) {
      secondaryReasons.push(reason);
    }
  }

  // ============================================
  // STEP 6a: Bags and accessories policy
  // ============================================

  if (isBagsOrAccessories(scanCategory, matchCategory)) {
    const policy = config.categories.special_policies.bags_and_accessories;

    // Check if we should override hide
    if (finalAction === 'hide') {
      const isArchetypeOnly = primaryReason === 'style_archetype_hard_clash';

      if (isArchetypeOnly && policy.never_hide_for_archetype_only) {
        // Downgrade to keep for archetype-only
        finalAction = policy.default_action_if_only_style_mismatch;
        if (enableTrace) {
          trace.push({
            step: 'category_policy.bags_accessories.archetype_only',
            applied: true,
            inputs: { originalAction: 'hide', primaryReason },
            output: { action: finalAction },
          });
        }
      } else if (!policy.allow_hide_only_for.includes(primaryReason as HardReasonCode)) {
        // Hide not allowed for this reason
        finalAction = 'demote_to_near';
        if (enableTrace) {
          trace.push({
            step: 'category_policy.bags_accessories.hide_not_allowed',
            applied: true,
            inputs: { originalAction: 'hide', primaryReason },
            output: { action: 'demote_to_near' },
          });
        }
      }
    }
  }

  // ============================================
  // STEP 6b: Shoes + tops policy
  // ============================================

  if (isShoesTopsPair(scanCategory, matchCategory)) {
    const policy = config.categories.special_policies.shoes_plus_tops;

    if (finalAction === 'hide' && policy.never_hide_for_archetype_only) {
      if (primaryReason === 'style_archetype_hard_clash') {
        // Downgrade to demote
        finalAction = 'demote_to_near';

        // Prefer anchor reason if available
        if (
          policy.prefer_anchor_reason_when_borderline &&
          collectedDemoteReasons.includes('context_dependent_needs_anchor')
        ) {
          primaryReason = 'context_dependent_needs_anchor';
        }

        if (enableTrace) {
          trace.push({
            step: 'category_policy.shoes_tops.archetype_only',
            applied: true,
            inputs: { originalAction: 'hide' },
            output: { action: 'demote_to_near', reason: primaryReason },
          });
        }
      }
    }
  }

  // ============================================
  // STEP 6c: Skirts policy
  // ============================================

  if (hasSkirts(scanCategory, matchCategory)) {
    const policy = config.categories.special_policies.skirts;

    if (finalAction === 'hide' && policy.never_escalate_statement_or_pattern_to_hide) {
      // Statement and pattern reasons should never cause hide for skirts
      // (These are soft reasons anyway, so this is defensive)
      const statementOrPatternReasons: TrustFilterReasonCode[] = [
        'statement_vs_statement_overload',
        'statement_context_mismatch',
        'pattern_texture_overload',
      ];

      if (statementOrPatternReasons.includes(primaryReason as TrustFilterReasonCode)) {
        finalAction = 'demote_to_near';
        if (enableTrace) {
          trace.push({
            step: 'category_policy.skirts.no_hide_for_statement_pattern',
            applied: true,
            inputs: { originalAction: 'hide', primaryReason },
            output: { action: 'demote_to_near' },
          });
        }
      }
    }
  }

  // ============================================
  // RETURN RESULT
  // ============================================

  return {
    action: finalAction,
    primary_reason: primaryReason,
    secondary_reasons: secondaryReasons,
    debug,
    trace: enableTrace ? trace : undefined,
  };
}

// ============================================
// BATCH EVALUATION
// ============================================

export interface TrustFilterBatchInput {
  scanSignals: StyleSignalsV1 | null;
  scanCategory: TFCategory;
  matches: Array<{
    id: string;
    signals: StyleSignalsV1 | null;
    category: TFCategory;
    ceScore?: number;
  }>;
  maxCandidates?: number;
  enableTrace?: boolean;
}

export interface TrustFilterBatchResult {
  highFinal: string[];
  demoted: string[];
  hidden: string[];
  decisions: Map<string, TrustFilterResult>;
  stats: {
    totalEvaluated: number;
    skippedCount: number;
    hiddenCount: number;
    demotedCount: number;
    reasonCounts: Record<string, number>;
    usedSecondaryCount: number;
  };
}

/**
 * Evaluate multiple HIGH matches through the Trust Filter.
 * Sorts by CE score and evaluates top N.
 */
export function evaluateTrustFilterBatch(
  input: TrustFilterBatchInput
): TrustFilterBatchResult {
  const {
    scanSignals,
    scanCategory,
    matches,
    maxCandidates = config.apply_to.max_candidates_per_scan,
    enableTrace = false,
  } = input;

  // Sort by CE score descending
  const sorted = [...matches].sort((a, b) => (b.ceScore ?? 0) - (a.ceScore ?? 0));

  // Take top N for evaluation
  const toEvaluate = sorted.slice(0, maxCandidates);
  const skipped = sorted.slice(maxCandidates);

  const highFinal: string[] = [];
  const demoted: string[] = [];
  const hidden: string[] = [];
  const decisions = new Map<string, TrustFilterResult>();

  const reasonCounts: Record<string, number> = {};
  let usedSecondaryCount = 0;

  for (const match of toEvaluate) {
    const result = evaluateTrustFilterPair(
      {
        scanSignals,
        matchSignals: match.signals,
        scanCategory,
        matchCategory: match.category,
        ceTier: 'HIGH',
        ceScore: match.ceScore,
      },
      enableTrace
    );

    decisions.set(match.id, result);

    switch (result.action) {
      case 'keep':
        highFinal.push(match.id);
        break;
      case 'demote_to_near':
        demoted.push(match.id);
        break;
      case 'hide':
        hidden.push(match.id);
        break;
    }

    if (result.primary_reason) {
      reasonCounts[result.primary_reason] =
        (reasonCounts[result.primary_reason] || 0) + 1;
    }

    if (result.debug.used_secondary) {
      usedSecondaryCount++;
    }
  }

  // Skipped matches remain in highFinal (unchanged)
  for (const match of skipped) {
    highFinal.push(match.id);
  }

  return {
    highFinal,
    demoted,
    hidden,
    decisions,
    stats: {
      totalEvaluated: toEvaluate.length,
      skippedCount: skipped.length,
      hiddenCount: hidden.length,
      demotedCount: demoted.length,
      reasonCounts,
      usedSecondaryCount,
    },
  };
}

// Re-export StyleSignalsV1 for convenience
import type { StyleSignalsV1 } from './types';
export type { StyleSignalsV1 };
