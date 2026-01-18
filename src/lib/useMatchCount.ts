/**
 * useMatchCount Hook & Utilities
 * 
 * CANONICAL SOURCE for calculating match counts against the user's wardrobe.
 * 
 * ⚠️ WARNING: Never use debugSnapshot.engines.confidence.matchesHighCount for UI display!
 * That data is FROZEN at scan time and becomes stale when wardrobe changes.
 * 
 * USE THIS MODULE INSTEAD:
 * - useMatchCount() - React hook for single item (use in components)
 * - calculateMatchCountsForChecks() - Batch function for grids/lists (use in useMemo)
 * 
 * Performance: Both functions recalculate in real-time against current wardrobe.
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
  
  // Skip if no wardrobe items
  if (wardrobeItems.length === 0) {
    for (const check of checks) {
      map[check.id] = null;
    }
    return map;
  }
  
  // Build lookup map for wardrobe item categories
  const wardrobeCategoryMap = new Map<string, string>();
  for (const item of wardrobeItems) {
    wardrobeCategoryMap.set(item.id, item.category);
  }
  
  // Convert wardrobe items once (optimization)
  const wardrobeConfidenceItems = wardrobeItems.map(wardrobeItemToConfidenceItem);
  
  for (const check of checks) {
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
        
        if (totalMatches === 0) {
          map[check.id] = "0 matches";
        } else if (totalMatches === 1) {
          map[check.id] = "1 match";
        } else {
          map[check.id] = `${totalMatches} matches`;
        }
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
    if (__DEV__) {
      console.log('[useMatchCount] Recalculating for check:', check.id, 'wardrobe size:', wardrobeItems.length, 'IDs:', wardrobeIds);
    }
    
    // Attempt to recalculate against current wardrobe
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
        
        // DEBUG: Log scanned item category and wardrobe categories
        if (__DEV__) {
          const wardrobeCategories = wardrobeItems.map(item => item.category);
          const categoryCounts = wardrobeCategories.reduce((acc, cat) => {
            acc[cat] = (acc[cat] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          console.log('[useMatchCount] DEBUG scanned category:', scannedItem.category, 'wardrobe categories:', categoryCounts);
        }
        
        // Evaluate against current wardrobe
        const evaluations = evaluateAgainstWardrobe(targetItem, wardrobeConfidenceItems);
        
        // DEBUG: Log evaluation details
        if (__DEV__) {
          const tierCounts = evaluations.reduce((acc, e) => {
            acc[e.confidence_tier] = (acc[e.confidence_tier] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          console.log('[useMatchCount] DEBUG evaluations:', evaluations.length, 'tiers:', tierCounts);
          
          // Show which categories were evaluated
          const evalCategories = evaluations.map(e => {
            const cat = wardrobeCategoryMap.get(e.item_b_id) ?? wardrobeCategoryMap.get(e.item_a_id);
            return cat;
          });
          console.log('[useMatchCount] DEBUG evaluated categories:', evalCategories);
        }
        
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
          console.log('[useMatchCount] Result for check', check.id, ':', { highCount, nearCount, totalMatches, coreEvaluations: coreEvaluations.length });
        }
        
        // Format display string
        if (totalMatches === 0) return "0 matches";
        if (totalMatches === 1) return "1 match";
        return `${totalMatches} matches`;
      } catch (error) {
        // If recalculation fails, fall back to snapshot
        if (__DEV__) {
          console.warn('[useMatchCount] Failed to recalculate matches for check:', check.id, error);
        }
      }
    }
    
    // Fallback: If recalculation fails or wardrobe is empty
    // Note: engineSnapshot is no longer loaded from DB for performance,
    // so this path will typically return empty string
    if (__DEV__) {
      console.log('[useMatchCount] No matches calculated for check:', check.id);
    }
    return "";
  }, [
    check.id,
    check.scannedItem,
    wardrobeIds, // Stable string that changes when wardrobe IDs change
    wardrobeItems, // Still need this for access to actual items inside useMemo
  ]);
}

