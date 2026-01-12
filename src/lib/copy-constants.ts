/**
 * Centralized copy/text constants for the SnapToMatch app
 * 
 * This file contains all user-facing text strings to make it easier to:
 * - Update copy across the app
 * - Maintain consistency
 * - Prepare for internationalization
 */

// ============================================
// RESULTS SCREEN
// ============================================

export const RESULTS_COPY = {
  /** Main header title */
  mainHeader: "Your matches",
  
  /** Section titles */
  sections: {
    highMatches: "Matches",
    nearMatches: "Close matches",
    whatToAddFirst: "What to add first",
    expandLook: "If you want to expand this look",
    makeItWork: "Make it work",
    outfitsWearNow: "Outfits you can wear now",
    outfitsWorthTrying: "Outfits worth trying",
    optionalAddOns: "Optional add-ons",
  },
  
  /** Section subtitles */
  subtitles: {
    fromWardrobe: "From your wardrobe",
    suggestionsToAdd: "Suggestions to add to your wardrobe",
    stylingTweaks: "Small styling tweaks for these pairings",
    weakLinkTips: "Tips for this outfit's weak link",
  },
  
  /** Match explanation templates */
  matchExplanations: {
    /** HIGH matches (score ≥ 0.85) - "Wear now" tab */
    high: [
      "Pairs well with your {wardrobeLabel}",
      "A great match for your {wardrobeLabel}",
    ],
    /** NEAR/MEDIUM matches (score 0.70–0.85) - "Worth trying" tab */
    near: [
      "Worth trying with your {wardrobeLabel}",
      "Could work with your {wardrobeLabel}",
    ],
  },
  
  /** Bottom sheet copy */
  bottomSheet: {
    header: {
      high: "Your matches",
      near: "Your close matches",
    },
    subtitle: "From your wardrobe",
    scannedItemLabel: "Scanned item",
  },
  
  /** CTA buttons */
  cta: {
    seeAll: "See all",
    addToWardrobe: "Add to wardrobe",
    scanAnother: "Scan another item",
    saveCheck: "Save this check",
  },
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get a deterministic match explanation based on item ID
 * Uses hash of item ID to select from available templates
 * 
 * @param itemId - Unique identifier for the wardrobe item
 * @param wardrobeLabel - Formatted label (e.g., "black jeans", "brown jacket")
 * @param matchType - Type of match (high or near)
 * @returns Formatted explanation string
 */
export function getMatchExplanation(
  itemId: string,
  wardrobeLabel: string,
  matchType: "high" | "near"
): string {
  const templates = RESULTS_COPY.matchExplanations[matchType];
  
  // Use item ID as seed for deterministic selection
  let hash = 0;
  for (let i = 0; i < itemId.length; i++) {
    hash = ((hash << 5) - hash) + itemId.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  const index = Math.abs(hash) % templates.length;
  
  return templates[index].replace("{wardrobeLabel}", wardrobeLabel);
}

