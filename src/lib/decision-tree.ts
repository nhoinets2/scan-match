// Decision tree for item check outcome selection
// Based on the Item Check Decision Tree specification

import {
  Category,
  FitPreference,
  OutcomeState,
  PreferenceAlignment,
  StylingRisk,
  SilhouetteVolume,
  VerdictUIState,
  OkayReasonCode,
} from "./types";
import { ItemSignalsResult } from "./openai";

export interface DecisionTreeInput {
  category: Category;
  itemSignals: ItemSignalsResult;
  userFitPreference: FitPreference;
  contextSufficient: boolean;
  wardrobeCount: number;
}

export interface DecisionTreeResult {
  outcome: OutcomeState;
  preferenceAlignment: PreferenceAlignment;
  stylingRisk: StylingRisk;
  showFitSection: boolean;
  explanation: string;
  // New fields for improved UI handling
  verdictUIState: VerdictUIState;
  reasonCode?: OkayReasonCode;
}

/**
 * Step 2: Category gate - determines if fit logic should be shown
 */
function shouldShowFitSection(category: Category): boolean {
  // Accessories and bags skip fit logic entirely
  if (category === "accessories" || category === "bags") {
    return false;
  }
  return true;
}

/**
 * Step 5: Preference alignment check
 * Does the item's silhouette align with user's fit preference?
 */
function calculatePreferenceAlignment(
  category: Category,
  itemSignals: ItemSignalsResult,
  userFitPreference: FitPreference
): PreferenceAlignment {
  // Shoes only use style compatibility, not body-fit logic
  if (category === "shoes") {
    return "neutral";
  }

  // Accessories/bags skip fit logic
  if (category === "accessories" || category === "bags") {
    return "neutral";
  }

  // Get the item's silhouette/volume
  let itemSilhouette: SilhouetteVolume | undefined;

  if (category === "tops" && itemSignals.silhouetteVolume) {
    itemSilhouette = itemSignals.silhouetteVolume;
  } else if (category === "dresses" && itemSignals.dressSilhouette) {
    // Map dress silhouette to volume
    if (itemSignals.dressSilhouette === "structured") {
      itemSilhouette = "fitted";
    } else {
      itemSilhouette = itemSignals.dressSilhouette as SilhouetteVolume;
    }
  } else if (category === "bottoms" && itemSignals.legShape) {
    // Map leg shape to silhouette equivalent
    if (itemSignals.legShape === "slim") {
      itemSilhouette = "fitted";
    } else if (itemSignals.legShape === "straight") {
      itemSilhouette = "relaxed";
    } else if (itemSignals.legShape === "wide") {
      itemSilhouette = "oversized";
    }
  } else if (category === "outerwear") {
    // Map outerwear structure and bulk to silhouette
    if (itemSignals.structure === "structured" && itemSignals.bulk === "low") {
      itemSilhouette = "fitted";
    } else if (itemSignals.bulk === "high") {
      itemSilhouette = "oversized";
    } else {
      itemSilhouette = "relaxed";
    }
  } else if (category === "skirts") {
    // Skirts: straight = fitted, flowy = relaxed
    if (itemSignals.skirtVolume === "straight") {
      itemSilhouette = "fitted";
    } else {
      itemSilhouette = "relaxed";
    }
  }

  if (!itemSilhouette) {
    return "neutral";
  }

  // Alignment matrix
  // Regular preference: aligned with relaxed, neutral with fitted/oversized
  // Slim preference: aligned with fitted, neutral with relaxed, misaligned with oversized
  // Oversized preference: aligned with oversized/relaxed, misaligned with fitted

  if (userFitPreference === "regular") {
    if (itemSilhouette === "relaxed") return "aligned";
    return "neutral";
  }

  if (userFitPreference === "slim") {
    if (itemSilhouette === "fitted") return "aligned";
    if (itemSilhouette === "relaxed") return "neutral";
    if (itemSilhouette === "oversized") return "misaligned";
  }

  if (userFitPreference === "oversized") {
    if (itemSilhouette === "oversized" || itemSilhouette === "relaxed") return "aligned";
    if (itemSilhouette === "fitted") return "misaligned";
  }

  return "neutral";
}

/**
 * Step 7: Outcome resolution
 * Apply decision rules to determine final outcome
 */
function resolveOutcome(
  contextSufficient: boolean,
  stylingRisk: StylingRisk,
  preferenceAlignment: PreferenceAlignment,
  wardrobeCount: number
): OutcomeState {
  // Rule 1: Context override
  if (!contextSufficient) {
    return "needs_more_context";
  }

  // Rule 1b: Empty wardrobe override (needs context to give good guidance)
  if (wardrobeCount === 0) {
    return "needs_more_context";
  }

  // Rule 2: High risk override
  if (stylingRisk === "high" && preferenceAlignment === "misaligned") {
    return "might_feel_tricky";
  }

  // Rule 3: Conditional middle state (default for most items)
  if (stylingRisk === "medium" || preferenceAlignment === "neutral") {
    return "could_work_with_pieces";
  }

  // Rule 4: Confident state
  if (stylingRisk === "low" && preferenceAlignment === "aligned") {
    return "looks_like_good_match";
  }

  // Rule 5: Conservative fallback - when in doubt, be cautious
  // High styling risk but aligned preference
  if (stylingRisk === "high") {
    return "might_feel_tricky";
  }

  // Misaligned preference but low styling risk
  if (preferenceAlignment === "misaligned") {
    return "could_work_with_pieces";
  }

  // Default to middle state
  return "could_work_with_pieces";
}

/**
 * Generate explanation based on outcome
 */
function generateExplanation(
  outcome: OutcomeState,
  category: Category,
  preferenceAlignment: PreferenceAlignment,
  stylingRisk: StylingRisk,
  itemSignals: ItemSignalsResult
): string {
  switch (outcome) {
    case "looks_like_good_match":
      return "This aligns well with your fit preferences and should be easy to style with your wardrobe.";

    case "could_work_with_pieces":
      if (preferenceAlignment === "neutral") {
        return "This could work well with the right styling choices from your wardrobe.";
      }
      if (stylingRisk === "medium") {
        return "With thoughtful pairing, this could integrate nicely into your wardrobe.";
      }
      return "This could work with the right pieces from your wardrobe.";

    case "might_feel_tricky":
      if (stylingRisk === "high") {
        return "This piece may require more deliberate styling effort to make it work.";
      }
      if (preferenceAlignment === "misaligned") {
        return "This differs from your usual fit preference, so it may need more thought to style.";
      }
      return "This might take some extra thought to style well.";

    case "needs_more_context":
      return "Add some items to your wardrobe for more personalized guidance.";

    case "saved_to_revisit":
      return "Saved for later consideration.";

    default:
      return "We can help you figure out how this might work.";
  }
}

/**
 * Main decision tree function
 * Takes item analysis and user preferences, returns outcome
 */
export function runDecisionTree(input: DecisionTreeInput): DecisionTreeResult {
  const {
    category,
    itemSignals,
    userFitPreference,
    contextSufficient,
    wardrobeCount,
  } = input;

  // Step 2: Category gate
  const showFitSection = shouldShowFitSection(category);

  // Step 5: Preference alignment (skip for shoes/accessories)
  const preferenceAlignment = calculatePreferenceAlignment(
    category,
    itemSignals,
    userFitPreference
  );

  // Step 6: Get styling risk from AI analysis
  const stylingRisk = itemSignals.stylingRisk;

  // Step 7: Outcome resolution
  const outcome = resolveOutcome(
    contextSufficient,
    stylingRisk,
    preferenceAlignment,
    wardrobeCount
  );

  // Step 8: Determine UI state and reason code
  const { verdictUIState, reasonCode } = outcomeToVerdictUI(
    outcome,
    stylingRisk,
    preferenceAlignment
  );

  // Step 9: Generate explanation
  const explanation = generateExplanation(
    outcome,
    category,
    preferenceAlignment,
    stylingRisk,
    itemSignals
  );

  return {
    outcome,
    preferenceAlignment,
    stylingRisk,
    showFitSection,
    explanation,
    verdictUIState,
    reasonCode,
  };
}

/**
 * Convert outcome state to VerdictUIState and optional reason code
 * This is the primary mapping for UI display
 */
export function outcomeToVerdictUI(
  outcome: OutcomeState,
  stylingRisk?: StylingRisk,
  preferenceAlignment?: PreferenceAlignment
): { verdictUIState: VerdictUIState; reasonCode?: OkayReasonCode } {
  switch (outcome) {
    case "looks_like_good_match":
      return { verdictUIState: "great" };

    case "could_work_with_pieces":
      // Determine specific reason for "okay"
      let reasonCode: OkayReasonCode = "OK_NEEDS_STYLING";
      if (preferenceAlignment === "neutral") {
        reasonCode = "OK_NEUTRAL_PREFERENCE";
      } else if (stylingRisk === "medium") {
        reasonCode = "OK_MEDIUM_RISK";
      }
      return { verdictUIState: "okay", reasonCode };

    case "needs_more_context":
      // This is NOT "okay" - it's a distinct informational state
      return { verdictUIState: "context_needed", reasonCode: "OK_CONTEXT_INSUFFICIENT" };

    case "might_feel_tricky":
      return { verdictUIState: "risky" };

    case "saved_to_revisit":
      // saved_to_revisit is not a verdict - should be handled as badge/status
      // Default to okay for legacy compatibility but UI should check outcome directly
      return { verdictUIState: "okay", reasonCode: "OK_NEEDS_STYLING" };

    default:
      return { verdictUIState: "okay", reasonCode: "OK_NEEDS_STYLING" };
  }
}

/**
 * Convert outcome state to legacy confidence level for backward compatibility
 * @deprecated Use outcomeToVerdictUI for new code
 */
export function outcomeToConfidence(outcome: OutcomeState): "great" | "okay" | "risky" {
  switch (outcome) {
    case "looks_like_good_match":
      return "great";
    case "could_work_with_pieces":
    case "saved_to_revisit":
      return "okay";
    case "needs_more_context":
      // Now maps to "okay" for legacy compatibility only
      // New code should use outcomeToVerdictUI which returns "context_needed"
      return "okay";
    case "might_feel_tricky":
      return "risky";
    default:
      return "okay";
  }
}
