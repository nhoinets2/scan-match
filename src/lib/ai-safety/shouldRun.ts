/**
 * AI Safety - Trigger Conditions
 *
 * Determines whether a scan+match pair should be evaluated by AI Safety Check.
 * Tight v1: only trigger on high-risk combinations to conserve AI calls.
 */

import type { StyleSignalsV1, ArchetypeDistance } from '../trust-filter/types';

export interface ShouldRunInput {
  scanSignals: StyleSignalsV1 | null;
  matchSignals: StyleSignalsV1 | null;
  distance: ArchetypeDistance;
}

/**
 * Check if AI Safety should run for this pair
 *
 * v1 Trigger Conditions (conservative):
 * - Statement level is HIGH on either side (eye-catching items)
 * - Athleisure formality involved (common source of clashes)
 * - Trust Filter distance is MEDIUM (grey zone - not obviously bad, not obviously good)
 *
 * This targets the exact scenario that caused the original issue:
 * cowboy boots (statement high) + athleisure joggers (distance medium)
 *
 * @returns true if this pair should be sent to AI Safety Check
 */
export function shouldRunAiSafety({ scanSignals, matchSignals, distance }: ShouldRunInput): boolean {
  // Skip if either signals are missing
  if (!scanSignals || !matchSignals) {
    return false;
  }

  // Condition 1: Statement HIGH on either side
  const statementHigh =
    scanSignals.statement?.level === 'high' ||
    matchSignals.statement?.level === 'high';

  // Condition 2: Athleisure involved on either side
  const athleisureInvolved =
    scanSignals.formality?.band === 'athleisure' ||
    matchSignals.formality?.band === 'athleisure';

  // Condition 3: Distance is medium (grey zone)
  const distanceMedium = distance === 'medium';

  // All conditions must be met for v1 (conservative)
  return statementHigh && athleisureInvolved && distanceMedium;
}

/**
 * Extended trigger conditions for future expansion
 * (not used in v1, but available for testing)
 */
export function shouldRunAiSafetyExtended({
  scanSignals,
  matchSignals,
  distance,
}: ShouldRunInput): { shouldRun: boolean; reason: string } {
  if (!scanSignals || !matchSignals) {
    return { shouldRun: false, reason: 'missing_signals' };
  }

  const statementHigh =
    scanSignals.statement?.level === 'high' ||
    matchSignals.statement?.level === 'high';

  const athleisureInvolved =
    scanSignals.formality?.band === 'athleisure' ||
    matchSignals.formality?.band === 'athleisure';

  const distanceMedium = distance === 'medium';

  // Check v1 conditions
  if (statementHigh && athleisureInvolved && distanceMedium) {
    return { shouldRun: true, reason: 'statement_athleisure_medium' };
  }

  // Future: Add more trigger conditions here
  // Example: formal vs casual clash
  // const formalityCrossContext =
  //   (scanSignals.formality?.band === 'formal' && matchSignals.formality?.band === 'casual') ||
  //   (scanSignals.formality?.band === 'casual' && matchSignals.formality?.band === 'formal');
  // if (formalityCrossContext && distanceMedium) {
  //   return { shouldRun: true, reason: 'formality_cross_context' };
  // }

  return { shouldRun: false, reason: 'no_trigger' };
}
