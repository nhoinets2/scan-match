// src/lib/inspiration/recipeSuggestions.ts
/**
 * Recipe-based suggestion filtering for TipSheet Mode A.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  CORE INVARIANTS (do not change without team discussion)       │
 * │                                                                 │
 * │  1. SELECTION is recipe-only: matchesFilters(item, filters)    │
 * │     - Vibe NEVER reduces the candidate pool                    │
 * │     - Only recipe filters + relaxation affect selection        │
 * │                                                                 │
 * │  2. VIBE is ranking-only: deterministicSort(items, vibeCtx)    │
 * │     - scannedVibes + userVibes determine display order         │
 * │     - Items matching both vibes appear first                   │
 * │                                                                 │
 * │  3. NO automatic fallback to "any item in category"            │
 * │     - If recipe filters find nothing → return empty list       │
 * │     - User must opt-in via getCategorySuggestions()            │
 * └─────────────────────────────────────────────────────────────────┘
 */
import type { Category, StyleVibe } from "../types";
import {
  type TipSheetVibe,
  type LibraryItemMeta,
  type TargetFilters,
  type AllFilterKeys,
  LIBRARY_BY_CATEGORY,
  getLibraryItemById,
} from "./tipsheets";

// ─────────────────────────────────────────────
// Library Source Type (for dependency injection)
// ─────────────────────────────────────────────

export interface LibrarySource {
  libraryByCategory: Record<Category, LibraryItemMeta[]>;
  getItemById: (id: string) => LibraryItemMeta | undefined;
}

/**
 * Default library source using hardcoded data
 */
const DEFAULT_LIBRARY_SOURCE: LibrarySource = {
  libraryByCategory: LIBRARY_BY_CATEGORY,
  getItemById: getLibraryItemById,
};

// ─────────────────────────────────────────────
// Filter Helpers
// ─────────────────────────────────────────────

/**
 * Check if an item matches all specified filters
 */
function matchesFilters(
  item: LibraryItemMeta,
  filters: TargetFilters
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;

    const itemValue = item[key as keyof LibraryItemMeta];
    if (itemValue === undefined) continue;

    // Handle array filters (e.g., tone: ["neutral", "light"])
    if (Array.isArray(value)) {
      if (!value.includes(itemValue as string)) {
        return false;
      }
    } else {
      // Handle single value filters
      if (itemValue !== value) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Create a relaxed copy of filters by removing specified keys
 */
function relaxFilters(
  filters: TargetFilters,
  keysToRemove: AllFilterKeys[]
): TargetFilters {
  const relaxed = { ...filters };
  for (const key of keysToRemove) {
    delete relaxed[key as keyof TargetFilters];
  }
  return relaxed;
}

// ─────────────────────────────────────────────
// Vibe Matching Helpers
// ─────────────────────────────────────────────

/**
 * Vibe sorting context for dual-array ranking.
 * Uses both scanned item vibes AND user preference vibes.
 */
export interface VibeSortContext {
  scannedVibes: StyleVibe[];
  userVibes: StyleVibe[];
}

/**
 * Returns true if ANY item vibe matches ANY target vibe.
 * Empty arrays on either side => false (no match).
 */
function intersects(
  itemVibes: TipSheetVibe[] | undefined,
  vibes: StyleVibe[]
): boolean {
  if (!itemVibes?.length || vibes.length === 0) return false;
  return vibes.some((v) => itemVibes.includes(v));
}

// ─────────────────────────────────────────────
// Deterministic Sort Helper (Dual-Array Vibe Ranking)
// ─────────────────────────────────────────────

/**
 * Deterministic sort for library items using dual-array vibe ranking.
 *
 * Bucket priority (lower = higher priority):
 *   0 = matches BOTH scannedVibes AND userVibes → "Perfect for this item AND your style"
 *   1 = matches scannedVibes only              → "Fits the scanned item"
 *   2 = matches userVibes only                 → "Fits your style"
 *   3 = has "default" vibe                     → "Works for everyone"
 *   4 = other                                  → "Available option"
 *
 * Within each bucket:
 *   - rank ascending (missing rank → 9999)
 *   - id ascending (stable tie-breaker)
 *
 * This ensures:
 *   - Items matching both vibes appear first (most relevant)
 *   - Same inputs = same results (deterministic)
 *   - Personalized feel without hard-filtering by vibe
 */
function deterministicSort(
  items: LibraryItemMeta[],
  ctx: VibeSortContext
): LibraryItemMeta[] {
  const { scannedVibes, userVibes } = ctx;

  return items.slice().sort((a, b) => {
    // Compute vibe matches for each item
    const aScan = intersects(a.vibes, scannedVibes);
    const bScan = intersects(b.vibes, scannedVibes);
    const aUser = intersects(a.vibes, userVibes);
    const bUser = intersects(b.vibes, userVibes);
    const aDefault = a.vibes?.includes("default") ?? false;
    const bDefault = b.vibes?.includes("default") ?? false;

    // Compute bucket (0-4)
    const getBucket = (scan: boolean, user: boolean, hasDefault: boolean): number => {
      if (scan && user) return 0; // Matches both
      if (scan) return 1;         // Matches scanned only
      if (user) return 2;         // Matches user only
      if (hasDefault) return 3;   // Has default
      return 4;                   // Other
    };

    const aBucket = getBucket(aScan, aUser, aDefault);
    const bBucket = getBucket(bScan, bUser, bDefault);

    if (aBucket !== bBucket) return aBucket - bBucket;

    // Within same bucket: rank ascending (missing → 9999)
    const aRank = a.rank ?? 9999;
    const bRank = b.rank ?? 9999;
    if (aRank !== bRank) return aRank - bRank;

    // Final tie-breaker: id ascending (stable)
    return a.id.localeCompare(b.id);
  });
}

// ─────────────────────────────────────────────
// Result Type with Relaxation Metadata
// ─────────────────────────────────────────────

export interface SuggestionResult {
  items: LibraryItemMeta[];
  /** Whether results were obtained by relaxing filters */
  wasRelaxed: boolean;
  /** Which filter keys were dropped to get results (empty if not relaxed) */
  relaxedKeys: AllFilterKeys[];
  /**
   * Always false - automatic category fallback is removed.
   * User-controlled fallback is handled separately via getCategorySuggestions().
   * @deprecated This field is kept for backward compatibility but always returns false.
   */
  didFallbackToAnyInCategory: boolean;
}

// ─────────────────────────────────────────────
// Dev Logging Helper
// ─────────────────────────────────────────────

interface RelaxationDebugInfo {
  category: Category;
  scannedVibes: StyleVibe[];
  userVibes: StyleVibe[];
  filters: TargetFilters;
  limit: number;
  strictCount: number;
  relaxSteps: Array<{ key: AllFilterKeys; count: number }>;
  finalCount: number;
  wasRelaxed: boolean;
  relaxedKeys: AllFilterKeys[];
}

/**
 * Log relaxation debug info in dev builds only.
 * Single console line for quick debugging.
 */
function logRelaxationDebug(info: RelaxationDebugInfo): void {
  if (!__DEV__) return;

  const filterStr = Object.entries(info.filters)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("|") : v}`)
    .join(", ");

  const stepsStr = info.relaxSteps.length > 0
    ? info.relaxSteps.map((s) => `−${s.key}→${s.count}`).join(" ")
    : "none";

  const vibeStr = `scanned=[${info.scannedVibes.join(",")}] user=[${info.userVibes.join(",")}]`;

  console.log(
    `[TipSheet] ${info.category} | ${vibeStr} | ` +
    `filters: {${filterStr}} | ` +
    `strict: ${info.strictCount}/${info.limit} | ` +
    `relax: [${stepsStr}] | ` +
    `final: ${info.finalCount} | ` +
    `relaxed: ${info.wasRelaxed ? info.relaxedKeys.join(",") || "all" : "no"}`
  );
}

// ─────────────────────────────────────────────
// Main Export: Get Filtered Suggestions
// ─────────────────────────────────────────────

/**
 * Get library items matching category and recipe filters.
 * Returns a list of suggestions ranked by vibe relevance.
 *
 * IMPORTANT: Selection vs Ranking separation
 * - Selection: Recipe filters only (no vibe pre-filtering)
 * - Ranking: Dual-array vibe sorting (scannedVibes + userVibes)
 *
 * Relaxation strategy:
 * 1. Try strict filters first
 * 2. Progressively drop keys in relaxOrder (never dropping neverRelax keys)
 * 3. Try with only neverRelax constraints
 * 4. Return empty list if nothing matches (NO automatic category fallback)
 *
 * For user-controlled fallback, use getCategorySuggestions() separately.
 */
export function getFilteredSuggestions(args: {
  category: Category;
  filters: TargetFilters;
  limit: number;
  scannedVibes: StyleVibe[];
  userVibes: StyleVibe[];
  relaxOrder?: AllFilterKeys[];
  neverRelax?: AllFilterKeys[];
  librarySource?: LibrarySource;
}): SuggestionResult {
  const {
    category,
    filters,
    limit,
    scannedVibes,
    userVibes,
    relaxOrder = [],
    neverRelax = [],
    librarySource = DEFAULT_LIBRARY_SOURCE,
  } = args;

  const candidates = librarySource.libraryByCategory[category] ?? [];
  const neverRelaxSet = new Set(neverRelax);
  const vibeCtx: VibeSortContext = { scannedVibes, userVibes };

  // Debug: log candidate pool size
  if (__DEV__) {
    console.log(
      `[TipSheet] ${category} candidates: ${candidates.length} items in library`
    );
    if (candidates.length === 0) {
      console.warn(
        `[TipSheet] ⚠️ No library items for category "${category}" - check Supabase data`
      );
    }
  }

  // Debug tracking
  const relaxSteps: Array<{ key: AllFilterKeys; count: number }> = [];
  let strictCount = 0;

  /**
   * Try to get results with given filters.
   * Selection is filter-based only; vibe affects ranking, not selection.
   */
  const tryFilters = (f: TargetFilters): LibraryItemMeta[] => {
    const filtered = candidates.filter((item) => matchesFilters(item, f));
    return deterministicSort(filtered, vibeCtx).slice(0, limit);
  };

  // 1. Try strict filters first
  const strictResults = tryFilters(filters);
  strictCount = strictResults.length;
  if (strictResults.length >= limit) {
    logRelaxationDebug({
      category, scannedVibes, userVibes, filters, limit, strictCount,
      relaxSteps, finalCount: strictResults.length,
      wasRelaxed: false, relaxedKeys: [],
    });
    return {
      items: strictResults,
      wasRelaxed: false,
      relaxedKeys: [],
      didFallbackToAnyInCategory: false,
    };
  }

  // 2. Progressively relax filters in relaxOrder
  const droppedKeys: AllFilterKeys[] = [];
  let currentFilters = { ...filters };

  for (const keyToRelax of relaxOrder) {
    // Never relax protected keys
    if (neverRelaxSet.has(keyToRelax)) continue;
    // Skip if key isn't in current filters
    if (!(keyToRelax in currentFilters)) continue;

    droppedKeys.push(keyToRelax);
    currentFilters = relaxFilters(currentFilters, [keyToRelax]);

    const relaxedResults = tryFilters(currentFilters);
    relaxSteps.push({ key: keyToRelax, count: relaxedResults.length });

    if (relaxedResults.length >= limit) {
      logRelaxationDebug({
        category, scannedVibes, userVibes, filters, limit, strictCount,
        relaxSteps, finalCount: relaxedResults.length,
        wasRelaxed: true, relaxedKeys: droppedKeys,
      });
      return {
        items: relaxedResults,
        wasRelaxed: true,
        relaxedKeys: droppedKeys,
        didFallbackToAnyInCategory: false,
      };
    }
  }

  // 3. Try with all relaxable keys dropped (only neverRelax constraints)
  const allRelaxableKeys = relaxOrder.filter((k) => !neverRelaxSet.has(k));
  const minimalFilters = relaxFilters(filters, allRelaxableKeys);
  const minimalResults = tryFilters(minimalFilters);

  if (minimalResults.length > 0) {
    const finalRelaxedKeys = allRelaxableKeys.filter((k) => k in filters);
    logRelaxationDebug({
      category, scannedVibes, userVibes, filters, limit, strictCount,
      relaxSteps, finalCount: minimalResults.length,
      wasRelaxed: true, relaxedKeys: finalRelaxedKeys,
    });
    return {
      items: minimalResults.slice(0, limit),
      wasRelaxed: true,
      relaxedKeys: finalRelaxedKeys,
      didFallbackToAnyInCategory: false,
    };
  }

  // 4. No matches found - return empty (NO automatic fallback)
  // User-controlled fallback via getCategorySuggestions() is handled separately
  logRelaxationDebug({
    category, scannedVibes, userVibes, filters, limit, strictCount,
    relaxSteps, finalCount: 0,
    wasRelaxed: true, relaxedKeys: Object.keys(filters) as AllFilterKeys[],
  });

  // Debug: explain why no matches
  if (__DEV__ && candidates.length > 0) {
    const neverRelaxFilters = Object.entries(minimalFilters)
      .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("|") : v}`)
      .join(", ");
    console.warn(
      `[TipSheet] ⚠️ ${category}: ${candidates.length} items in library, 0 match neverRelax filters {${neverRelaxFilters}}`
    );
    // Sample first 3 items to show what's available
    const sample = candidates.slice(0, 3).map((item) => ({
      label: item.label,
      tone: item.tone,
      structure: item.structure,
      formality: item.formality,
    }));
    console.log(`[TipSheet] Sample items:`, sample);
  }

  return {
    items: [],
    wasRelaxed: true,
    relaxedKeys: Object.keys(filters) as AllFilterKeys[],
    didFallbackToAnyInCategory: false, // Always false - no automatic fallback
  };
}

// ─────────────────────────────────────────────
// User-Controlled Fallback: Category Suggestions
// ─────────────────────────────────────────────

/**
 * Get all items from a category, ranked by vibe relevance.
 * Used for user-controlled "Show more items" fallback.
 *
 * This is explicitly separated from getFilteredSuggestions() to ensure
 * the user chooses to see broader results (not automatic).
 */
export function getCategorySuggestions(args: {
  category: Category;
  scannedVibes: StyleVibe[];
  userVibes: StyleVibe[];
  limit: number;
  librarySource?: LibrarySource;
}): LibraryItemMeta[] {
  const {
    category,
    scannedVibes,
    userVibes,
    limit,
    librarySource = DEFAULT_LIBRARY_SOURCE,
  } = args;

  const candidates = librarySource.libraryByCategory[category] ?? [];
  const vibeCtx: VibeSortContext = { scannedVibes, userVibes };

  return deterministicSort(candidates, vibeCtx).slice(0, limit);
}

// ─────────────────────────────────────────────
// Test Exports (for unit testing)
// ─────────────────────────────────────────────

export const __test__ = {
  deterministicSort,
  intersects,
  matchesFilters,
  relaxFilters,
};
