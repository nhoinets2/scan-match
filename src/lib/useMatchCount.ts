/**
 * useMatchCount Hook
 * 
 * Calculates the current match count for a scanned item against the user's wardrobe.
 * Recalculates in real-time when wardrobe changes, rather than using frozen snapshot data.
 * 
 * Performance: Memoized to recalculate only when check ID or wardrobe changes.
 */

import { useMemo } from 'react';
import type { RecentCheck, WardrobeItem, ScannedItem } from '@/lib/types';
import { 
  scannedItemToConfidenceItem, 
  wardrobeItemToConfidenceItem,
  evaluateAgainstWardrobe,
} from '@/lib/confidence-engine';

/**
 * Calculate match count for a check against current wardrobe
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
        
        // Convert items to confidence engine format
        const targetItem = scannedItemToConfidenceItem(scannedItem);
        const wardrobeConfidenceItems = wardrobeItems.map(wardrobeItemToConfidenceItem);
        
        // Evaluate against current wardrobe
        const evaluations = evaluateAgainstWardrobe(targetItem, wardrobeConfidenceItems);
        
        // Count by confidence tier
        const highCount = evaluations.filter(e => e.confidence_tier === 'HIGH').length;
        const nearCount = evaluations.filter(e => e.confidence_tier === 'MEDIUM').length;
        const totalMatches = highCount + nearCount;
        
        if (__DEV__) {
          console.log('[useMatchCount] Result for check', check.id, ':', { highCount, nearCount, totalMatches });
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

