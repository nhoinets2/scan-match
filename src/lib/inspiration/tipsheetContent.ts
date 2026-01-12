// src/lib/inspiration/tipsheetContent.ts
/**
 * TipSheet Content Resolver
 *
 * IMPORTANT: Mode A list content is RECIPE-DRIVEN only.
 * - TIP_PACKS and ResolvedTipSheet.bundles/examples are IGNORED for Mode A with targetCategory.
 * - The only data sources for Mode A list are:
 *   1. TIP_SHEETS[bulletKey].targetCategory
 *   2. BUNDLE_RECIPES[bulletKey]
 *   3. getFilteredSuggestions() → library items
 *
 * SELECTION vs RANKING:
 * - Selection: Recipe filters only (no vibe pre-filtering)
 * - Ranking: Dual-array vibe sorting (scannedVibes + userVibes)
 *
 * Mode B and Mode A with null targetCategory use TIP_PACKS for educational boards.
 */
import type { ScannedItem, Category, StyleVibe } from "../types";
import {
  type TipSheetMode,
  type TipSheetVibe,
  type TipSheetBundle,
  type LibraryItemMeta,
  type ResolvedTipSheet,
  type AllFilterKeys,
  type TargetFilters,
  BUNDLE_RECIPES,
} from "./tipsheets";
import {
  type LibrarySource,
  getFilteredSuggestions,
  getCategorySuggestions,
} from "./recipeSuggestions";

// ─────────────────────────────────────────────
// TipSheet Content Types
// ─────────────────────────────────────────────

/**
 * Metadata for suggestions content.
 * Provides transparency about filtering and relaxation.
 */
export interface SuggestionsMeta {
  /** Whether results were obtained by relaxing filters */
  wasRelaxed: boolean;
  /** Which filter keys were dropped to get results (empty if not relaxed) */
  relaxedKeys: AllFilterKeys[];
  /** Filter keys that were never relaxed (guaranteed constraints, for chip display) */
  lockedKeys: AllFilterKeys[];
}

/**
 * Suggestions - filtered library items that match the bullet criteria
 *
 * Used when: Mode A with targetCategory
 * Shows a simple grid of items the user could buy to complete the look
 *
 * NOTE: This content type does NOT use TIP_PACKS.
 * Content is derived purely from BUNDLE_RECIPES + library filtering.
 */
export interface SuggestionsContent {
  kind: "suggestions";
  /** Primary filtered items (recipe-based) */
  items: LibraryItemMeta[];
  /** Broader category items (for user-controlled fallback) - only populated when items is empty */
  moreItems: LibraryItemMeta[];
  /** Whether "Show more items" button should be displayed */
  canShowMore: boolean;
  /** Label for the items section */
  label: string;
  /** Metadata about filtering and relaxation (for UI transparency) */
  meta: SuggestionsMeta;
}

/**
 * Educational boards - do/don't/try static images
 * Used when: Mode B (styling tips) or Mode A with null targetCategory
 */
export interface EducationalContent {
  kind: "educational";
  scannedItem: ScannedItem | null; // Show at top for context
  boards: TipSheetBundle[];
}

export type TipSheetContent =
  | SuggestionsContent
  | EducationalContent;

// ─────────────────────────────────────────────
// Content Resolver
// ─────────────────────────────────────────────

/**
 * Resolve what content to show in a TipSheet modal
 *
 * Content routing:
 * - Mode B → Educational boards (do/don't/try) from TIP_PACKS
 * - Mode A + null targetCategory → Educational boards (concept advice) from TIP_PACKS
 * - Mode A + targetCategory → Filtered suggestions grid (RECIPE-DRIVEN, ignores TIP_PACKS)
 */
export function resolveTipSheetContent(args: {
  mode: TipSheetMode;
  bulletKey: string;
  scannedItem: ScannedItem | null;
  vibe: TipSheetVibe; // kept for copy/style note compatibility
  userVibes: StyleVibe[]; // user preference vibes from onboarding
  resolved: ResolvedTipSheet;
  /** Explicit targetCategory from results row (preferred over resolved.targetCategory) */
  targetCategory?: Category | string | null;
  librarySource?: LibrarySource;
}): TipSheetContent {
  const { mode, bulletKey, scannedItem, userVibes, resolved, librarySource } = args;

  // Use explicit targetCategory if provided, otherwise fall back to resolved
  const effectiveTargetCategory = args.targetCategory !== undefined
    ? args.targetCategory
    : resolved.targetCategory;

  // ─────────────────────────────────────────────
  // MODE B: Educational boards (do/don't/try)
  // Uses TIP_PACKS for static educational content
  // ─────────────────────────────────────────────
  if (mode === "B") {
    return {
      kind: "educational",
      scannedItem,
      boards: resolved.bundles,
    };
  }

  // ─────────────────────────────────────────────
  // MODE A with null targetCategory: Show educational boards
  // (concept advice like "Keep your palette simple")
  // Uses TIP_PACKS for static educational content
  // ─────────────────────────────────────────────
  if (!effectiveTargetCategory) {
    return {
      kind: "educational",
      scannedItem,
      boards: resolved.bundles,
    };
  }

  // ─────────────────────────────────────────────
  // MODE A with targetCategory: Show filtered suggestions
  // RECIPE-DRIVEN: Uses BUNDLE_RECIPES + library filtering
  // NOTE: TIP_PACKS content (bundles/examples) is IGNORED here
  // ─────────────────────────────────────────────
  const recipe = BUNDLE_RECIPES[bulletKey];
  const filters = recipe?.targetFilters ?? {};
  const neverRelax = recipe?.neverRelax ?? [];

  // Extract vibes for dual-array ranking
  const scannedVibes = (scannedItem?.styleTags ?? []) as StyleVibe[];

  // Get filtered suggestions (recipe-based)
  const suggestionResult = getFilteredSuggestions({
    category: effectiveTargetCategory as Category,
    filters,
    limit: 6,
    scannedVibes,
    userVibes,
    relaxOrder: recipe?.relaxOrder,
    neverRelax,
    librarySource,
  });

  // Compute "more items" fallback only when primary list is empty
  // This is for user-controlled fallback (not automatic)
  const moreItems =
    suggestionResult.items.length === 0
      ? getCategorySuggestions({
          category: effectiveTargetCategory as Category,
          scannedVibes,
          userVibes,
          limit: 6,
          librarySource,
        })
      : [];

  // Build meta for UI transparency
  const meta: SuggestionsMeta = {
    wasRelaxed: suggestionResult.wasRelaxed,
    relaxedKeys: suggestionResult.relaxedKeys,
    lockedKeys: neverRelax,
  };

  return {
    kind: "suggestions",
    items: suggestionResult.items,
    moreItems,
    canShowMore: moreItems.length > 0,
    label: "Items that would work",
    meta,
  };
}

// ─────────────────────────────────────────────
// Helper: Check if content has meaningful items
// ─────────────────────────────────────────────

export function hasContent(content: TipSheetContent): boolean {
  switch (content.kind) {
    case "suggestions":
      return content.items.length > 0 || content.moreItems.length > 0;
    case "educational":
      return content.boards.length > 0;
  }
}
