/**
 * Mode A Bullet Filter
 * 
 * Utility functions for filtering Mode A suggestion bullets based on wardrobe state.
 * 
 * Filtering rules:
 * 1. When wardrobe is empty: filters out bullets with target: null (generic advice)
 * 2. When wardrobe has items: filters out bullets for categories that already have MEDIUM+ matches
 */

import type { SuggestionBullet, Category } from './confidence-engine/types';

/**
 * Filters Mode A bullets based on wardrobe state and matched categories.
 * 
 * Filtering logic:
 * - Filters out bullets with target: null when wardrobeCount === 0
 * - Filters out bullets whose target category already has a MEDIUM+ match
 * 
 * @param bullets - Array of Mode A suggestion bullets
 * @param wardrobeCount - Current number of items in wardrobe
 * @param matchedCategories - Categories that already have MEDIUM+ matches (optional)
 * @returns Filtered array of bullets
 */
export function filterModeABullets(
  bullets: SuggestionBullet[],
  wardrobeCount: number,
  matchedCategories?: Category[]
): SuggestionBullet[] {
  // When wardrobe is empty, filter out bullets with target: null
  if (wardrobeCount === 0) {
    return bullets.filter((bullet) => bullet.target !== null);
  }
  
  // When wardrobe has items, filter out categories that already have matches
  if (matchedCategories && matchedCategories.length > 0) {
    const matchedSet = new Set(matchedCategories);
    return bullets.filter((bullet) => {
      // Keep bullets with no target (generic advice)
      if (bullet.target === null) return true;
      // Filter out bullets for categories that already have matches
      return !matchedSet.has(bullet.target as Category);
    });
  }
  
  // Default: return all bullets unchanged
  return bullets;
}

