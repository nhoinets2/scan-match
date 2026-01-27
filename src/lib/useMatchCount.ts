/**
 * useMatchCount Hook & Utilities
 * 
 * CANONICAL SOURCE for match counts displayed on check cards/badges.
 * 
 * PRIORITY ORDER:
 * 1. Stored finalized counts (finalHighCount + finalNearCount) - from DB after TF + AI Safety
 * 2. Fallback: Recalculate using Confidence Engine only (for older checks without stored counts)
 * 
 * ⚠️ WARNING: Never use debugSnapshot.engines.confidence.matchesHighCount for UI display!
 * That data is FROZEN at scan time and becomes stale when wardrobe changes.
 * 
 * USE THIS MODULE INSTEAD:
 * - useMatchCount() - React hook for single item (use in components)
 * - calculateMatchCountsForChecks() - Batch function for grids/lists (use in useMemo)
 */

import { useMemo } from 'react';
import type { RecentCheck, WardrobeItem, ScannedItem, Category } from '@/lib/types';
import { 
  scannedItemToConfidenceItem, 
  wardrobeItemToConfidenceItem,
  evaluateAgainstWardrobe,
  selectNearMatches,
} from '@/lib/confidence-engine';

/**
 * Format match count for display
 */
function formatMatchCount(total: number): string {
  if (total === 0) return "0 matches";
  if (total === 1) return "1 match";
  return `${total} matches`;
}

/**
 * Core categories that drive match counts.
 * Must match CORE_CATEGORIES in results.tsx for consistency.
 * Optional categories (outerwear, bags, accessories) are shown separately
 * in the "Optional add-ons" section and don't count toward the match badge.
 */
const CORE_CATEGORIES = new Set<Category>(['tops', 'bottoms', 'shoes', 'dresses', 'skirts']);

function isCoreCategory(category: string): boolean {
  return CORE_CATEGORIES.has(category.toLowerCase() as Category);
}

/**
 * Calculate match counts for multiple checks at once (for grids/lists)
 * 
 * Use this in useMemo when displaying a list of checks to avoid N hook calls.
 * 
 * PRIORITY:
 * 1. Use stored finalized counts (finalHighCount + finalNearCount) if available
 * 2. Fallback: Recalculate using CE only (for older checks)
 * 
 * NOTE: Only counts CORE category matches (tops, bottoms, shoes, dresses, skirts).
 * Optional categories (outerwear, bags, accessories) are shown in "Optional add-ons"
 * section on Results screen and don't contribute to the badge count.
 * 
 * @example
 * const matchCountMap = useMemo(() => 
 *   calculateMatchCountsForChecks(checks, wardrobe),
 *   [checks, wardrobe]
 * );
 * 
 * @param checks - Array of recent checks with scanned item data
 * @param wardrobeItems - Current wardrobe items to evaluate against
 * @returns Map of check ID to formatted match count string (null if 0 matches)
 */
export function calculateMatchCountsForChecks(
  checks: RecentCheck[],
  wardrobeItems: WardrobeItem[]
): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  
  // Build lookup map for wardrobe item categories (for CE fallback)
  const wardrobeCategoryMap = new Map<string, string>();
  for (const item of wardrobeItems) {
    wardrobeCategoryMap.set(item.id, item.category);
  }
  
  // Convert wardrobe items once (optimization for CE fallback)
  const wardrobeConfidenceItems = wardrobeItems.length > 0 
    ? wardrobeItems.map(wardrobeItemToConfidenceItem)
    : [];
  
  for (const check of checks) {
    // PRIORITY 1: Use stored finalized counts if available
    if (check.finalHighCount != null && check.finalNearCount != null) {
      const total = check.finalHighCount + check.finalNearCount;
      map[check.id] = formatMatchCount(total);
      continue;
    }
    
    // PRIORITY 2: Fallback to CE recalculation (for older checks without stored counts)
    if (wardrobeItems.length === 0) {
      map[check.id] = null;
      continue;
    }
    
    if (check.scannedItem) {
      try {
        const targetItem = scannedItemToConfidenceItem(check.scannedItem as ScannedItem);
        const evaluations = evaluateAgainstWardrobe(targetItem, wardrobeConfidenceItems);
        
        // Filter to core categories only (matches Results screen behavior)
        const coreEvaluations = evaluations.filter(e => {
          const category = wardrobeCategoryMap.get(e.item_b_id) ?? wardrobeCategoryMap.get(e.item_a_id);
          return category && isCoreCategory(category);
        });
        
        // Count HIGH matches (all of them - no artificial limit on individual matches)
        const highCount = coreEvaluations.filter(e => e.confidence_tier === 'HIGH').length;
        
        // Count NEAR matches using selectNearMatches - SAME source of truth as UI
        // This ensures badge count matches what's displayed on Results screen
        const nearMatches = selectNearMatches(coreEvaluations);
        const nearCount = nearMatches.length;
        
        const totalMatches = highCount + nearCount;
        map[check.id] = formatMatchCount(totalMatches);
      } catch (error) {
        map[check.id] = null;
      }
    } else {
      map[check.id] = null;
    }
  }
  
  return map;
}

/**
 * Calculate match count for a check against current wardrobe
 * 
 * PRIORITY:
 * 1. Use stored finalized counts (finalHighCount + finalNearCount) if available
 * 2. Fallback: Recalculate using CE only (for older checks)
 * 
 * NOTE: Only counts CORE category matches (tops, bottoms, shoes, dresses, skirts).
 * Optional categories (outerwear, bags, accessories) are shown in "Optional add-ons"
 * section on Results screen and don't contribute to the badge count.
 * 
 * @param check - The recent check with scanned item data
 * @param wardrobeItems - Current wardrobe items to evaluate against
 * @returns Formatted match count string (e.g., "3 matches", "1 match", "0 matches")
 */
export function useMatchCount(check: RecentCheck, wardrobeItems: WardrobeItem[]): string {
  // Create stable reference that changes when wardrobe content changes
  // This ensures recalculation even if React Query returns a new array reference
  const wardrobeIds = useMemo(
    () => wardrobeItems.map(item => item.id).sort().join(','),
    [wardrobeItems]
  );
  
  return useMemo(() => {
    // PRIORITY 1: Use stored finalized counts if available
    if (check.finalHighCount != null && check.finalNearCount != null) {
      const total = check.finalHighCount + check.finalNearCount;
      if (__DEV__) {
        console.log('[useMatchCount] Using stored counts for check:', check.id, { high: check.finalHighCount, near: check.finalNearCount, total });
      }
      return formatMatchCount(total);
    }
    
    if (__DEV__) {
      console.log('[useMatchCount] No stored counts, falling back to CE for check:', check.id, 'wardrobe size:', wardrobeItems.length);
    }
    
    // PRIORITY 2: Fallback to CE recalculation (for older checks without stored counts)
    if (check.scannedItem && wardrobeItems.length > 0) {
      try {
        const scannedItem = check.scannedItem as ScannedItem;
        
        // Build lookup map for wardrobe item categories
        const wardrobeCategoryMap = new Map<string, string>();
        for (const item of wardrobeItems) {
          wardrobeCategoryMap.set(item.id, item.category);
        }
        
        // Convert items to confidence engine format
        const targetItem = scannedItemToConfidenceItem(scannedItem);
        const wardrobeConfidenceItems = wardrobeItems.map(wardrobeItemToConfidenceItem);
        
        // Evaluate against current wardrobe
        const evaluations = evaluateAgainstWardrobe(targetItem, wardrobeConfidenceItems);
        
        // Filter to core categories only (matches Results screen behavior)
        const coreEvaluations = evaluations.filter(e => {
          const category = wardrobeCategoryMap.get(e.item_b_id) ?? wardrobeCategoryMap.get(e.item_a_id);
          return category && isCoreCategory(category);
        });
        
        // Count HIGH matches (all of them - no artificial limit on individual matches)
        const highCount = coreEvaluations.filter(e => e.confidence_tier === 'HIGH').length;
        
        // Count NEAR matches using selectNearMatches - SAME source of truth as UI
        // This ensures badge count matches what's displayed on Results screen
        const nearMatches = selectNearMatches(coreEvaluations);
        const nearCount = nearMatches.length;
        
        const totalMatches = highCount + nearCount;
        
        if (__DEV__) {
          console.log('[useMatchCount] CE fallback result for check', check.id, ':', { highCount, nearCount, totalMatches });
        }
        
        return formatMatchCount(totalMatches);
      } catch (error) {
        if (__DEV__) {
          console.warn('[useMatchCount] CE fallback failed for check:', check.id, error);
        }
      }
    }
    
    // Fallback: If everything fails or wardrobe is empty
    if (__DEV__) {
      console.log('[useMatchCount] No matches calculated for check:', check.id);
    }
    return "";
  }, [
    check.id,
    check.scannedItem,
    check.finalHighCount,
    check.finalNearCount,
    wardrobeIds, // Stable string that changes when wardrobe IDs change
    wardrobeItems, // Still need this for access to actual items inside useMemo
  ]);
}

