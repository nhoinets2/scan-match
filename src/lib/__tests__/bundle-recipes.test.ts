/**
 * Bundle Recipes Schema Lock Test Suite
 *
 * Prevents accidental reintroduction of removed fields (supportSlot)
 * and ensures recipe schema consistency.
 *
 * These tests lock the single-list suggestions model that replaced
 * the bundle composition model.
 */

// Define __DEV__ for test environment
// @ts-expect-error - __DEV__ is a React Native global
globalThis.__DEV__ = true;

import {
  BUNDLE_RECIPES,
  BUNDLE_RECIPE_ALLOWED_KEYS,
  ALLOWED_FILTER_KEYS,
  validateBundleRecipes,
  type BundleRecipe,
} from '../inspiration/tipsheets';

// ============================================
// SCHEMA LOCK TESTS
// ============================================

describe('Bundle Recipes Schema Lock', () => {
  describe('allowed keys enforcement', () => {
    it('should only allow defined keys in recipes', () => {
      const allowedKeysSet = new Set<string>(BUNDLE_RECIPE_ALLOWED_KEYS);

      for (const [recipeKey, recipe] of Object.entries(BUNDLE_RECIPES)) {
        const actualKeys = Object.keys(recipe);
        const unexpectedKeys = actualKeys.filter(k => !allowedKeysSet.has(k));

        expect(unexpectedKeys).toEqual([]);
      }
    });

    it('BUNDLE_RECIPE_ALLOWED_KEYS should NOT contain supportSlot', () => {
      expect(BUNDLE_RECIPE_ALLOWED_KEYS).not.toContain('supportSlot');
    });

    it('no recipe should contain supportSlot field', () => {
      for (const [recipeKey, recipe] of Object.entries(BUNDLE_RECIPES)) {
        expect(recipe).not.toHaveProperty('supportSlot');
      }
    });

    it('no recipe should contain fallbackId field', () => {
      for (const [recipeKey, recipe] of Object.entries(BUNDLE_RECIPES)) {
        expect(recipe).not.toHaveProperty('fallbackId');
      }
    });
  });

  describe('required fields', () => {
    it('every recipe should have targetCategory', () => {
      for (const [recipeKey, recipe] of Object.entries(BUNDLE_RECIPES)) {
        expect(recipe.targetCategory).toBeDefined();
        expect(typeof recipe.targetCategory).toBe('string');
      }
    });

    it('every recipe should have targetFilters', () => {
      for (const [recipeKey, recipe] of Object.entries(BUNDLE_RECIPES)) {
        expect(recipe.targetFilters).toBeDefined();
        expect(typeof recipe.targetFilters).toBe('object');
      }
    });

    it('every recipe should have targetLimit', () => {
      for (const [recipeKey, recipe] of Object.entries(BUNDLE_RECIPES)) {
        expect(recipe.targetLimit).toBeDefined();
        expect(typeof recipe.targetLimit).toBe('number');
        expect(recipe.targetLimit).toBeGreaterThan(0);
      }
    });
  });

  describe('filter key validation', () => {
    it('relaxOrder should only contain valid filter keys', () => {
      const allowedFilterKeysSet = new Set(ALLOWED_FILTER_KEYS);

      for (const [recipeKey, recipe] of Object.entries(BUNDLE_RECIPES)) {
        for (const key of recipe.relaxOrder ?? []) {
          expect(allowedFilterKeysSet.has(key)).toBe(true);
        }
      }
    });

    it('neverRelax should only contain valid filter keys', () => {
      const allowedFilterKeysSet = new Set(ALLOWED_FILTER_KEYS);

      for (const [recipeKey, recipe] of Object.entries(BUNDLE_RECIPES)) {
        for (const key of recipe.neverRelax ?? []) {
          expect(allowedFilterKeysSet.has(key)).toBe(true);
        }
      }
    });

    it('targetFilters should only contain valid filter keys', () => {
      const allowedFilterKeysSet = new Set<string>(ALLOWED_FILTER_KEYS);

      for (const [recipeKey, recipe] of Object.entries(BUNDLE_RECIPES)) {
        const filterKeys = Object.keys(recipe.targetFilters);
        for (const key of filterKeys) {
          expect(allowedFilterKeysSet.has(key)).toBe(true);
        }
      }
    });
  });

  describe('relaxation strategy coherence', () => {
    it('relaxOrder and neverRelax should not overlap', () => {
      for (const [recipeKey, recipe] of Object.entries(BUNDLE_RECIPES)) {
        const relaxSet = new Set(recipe.relaxOrder ?? []);
        const neverSet = new Set(recipe.neverRelax ?? []);

        for (const key of relaxSet) {
          expect(neverSet.has(key)).toBe(false);
        }
      }
    });

    it('neverRelax keys should be present in targetFilters', () => {
      for (const [recipeKey, recipe] of Object.entries(BUNDLE_RECIPES)) {
        const filterKeys = new Set(Object.keys(recipe.targetFilters));
        for (const key of recipe.neverRelax ?? []) {
          expect(filterKeys.has(key)).toBe(true);
        }
      }
    });
  });

  describe('validateBundleRecipes()', () => {
    it('should return no errors for current recipes', () => {
      const errors = validateBundleRecipes();
      expect(errors).toEqual([]);
    });
  });
});

// ============================================
// RECIPE COVERAGE TESTS
// ============================================

describe('Bundle Recipes Coverage', () => {
  const SCANNED_CATEGORIES = ['TOPS', 'BOTTOMS', 'SHOES', 'OUTERWEAR', 'DRESSES', 'SKIRTS', 'BAGS', 'ACCESSORIES'];

  it('should have recipes for all scanned categories', () => {
    for (const category of SCANNED_CATEGORIES) {
      const categoryRecipes = Object.keys(BUNDLE_RECIPES).filter(key =>
        key.startsWith(`${category}__`)
      );
      // Most categories should have at least one recipe
      // (some like DEFAULT may not have any - that's OK)
      if (category !== 'DEFAULT') {
        expect(categoryRecipes.length).toBeGreaterThan(0);
      }
    }
  });

  it('should have consistent naming convention (CATEGORY__DESCRIPTION)', () => {
    for (const recipeKey of Object.keys(BUNDLE_RECIPES)) {
      expect(recipeKey).toMatch(/^[A-Z]+__[A-Z_]+$/);
    }
  });
});

// ============================================
// OUTERWEAR WEIGHT TESTS
// ============================================

describe('Outerwear Weight Validation', () => {
  it('outerwear recipes should have outerwearWeight filter', () => {
    const outerwearRecipes = Object.entries(BUNDLE_RECIPES).filter(
      ([_, recipe]) => recipe.targetCategory === 'outerwear'
    );

    for (const [recipeKey, recipe] of outerwearRecipes) {
      // Check if outerwearWeight exists in targetFilters
      expect('outerwearWeight' in recipe.targetFilters).toBe(true);
    }
  });

  it('non-outerwear recipes should NOT have outerwearWeight filter', () => {
    const nonOuterwearRecipes = Object.entries(BUNDLE_RECIPES).filter(
      ([_, recipe]) => recipe.targetCategory !== 'outerwear'
    );

    for (const [recipeKey, recipe] of nonOuterwearRecipes) {
      expect('outerwearWeight' in recipe.targetFilters).toBe(false);
    }
  });
});

// ============================================
// RELAXATION BEHAVIOR TESTS
// ============================================

import { getFilteredSuggestions, getCategorySuggestions, type LibrarySource } from '../inspiration/recipeSuggestions';
import type { LibraryItemMeta, TipSheetVibe } from '../inspiration/tipsheets';
import type { Category, StyleVibe } from '../types';

describe('getFilteredSuggestions relaxation behavior', () => {
  // Mock library for controlled testing
  const createMockLibrary = (items: Partial<LibraryItemMeta>[]): LibrarySource => {
    const fullItems: LibraryItemMeta[] = items.map((item, i) => ({
      id: item.id ?? `item-${i}`,
      category: item.category ?? 'bottoms',
      rank: item.rank ?? 50,
      vibes: item.vibes ?? ['default'],
      tone: item.tone ?? 'neutral',
      structure: item.structure ?? 'soft',
      formality: item.formality ?? 'casual',
      ...item,
    })) as LibraryItemMeta[];

    const byCategory: Record<Category, LibraryItemMeta[]> = {
      tops: [],
      bottoms: [],
      shoes: [],
      outerwear: [],
      dresses: [],
      skirts: [],
      bags: [],
      accessories: [],
    };

    for (const item of fullItems) {
      byCategory[item.category].push(item);
    }

    return {
      libraryByCategory: byCategory,
      getItemById: (id) => fullItems.find((i) => i.id === id),
    };
  };

  // Default vibe context for tests (empty arrays = no vibe filtering, just recipe filters)
  const defaultVibeCtx = { scannedVibes: [] as StyleVibe[], userVibes: [] as StyleVibe[] };

  describe('strict filters first', () => {
    it('should return strict matches when available', () => {
      const library = createMockLibrary([
        { id: 'dark-structured-1', tone: 'dark', structure: 'structured', category: 'bottoms', rank: 10 },
        { id: 'dark-structured-2', tone: 'dark', structure: 'structured', category: 'bottoms', rank: 20 },
        { id: 'dark-structured-3', tone: 'dark', structure: 'structured', category: 'bottoms', rank: 30 },
        { id: 'dark-soft', tone: 'dark', structure: 'soft', category: 'bottoms' },
        { id: 'light-structured', tone: 'light', structure: 'structured', category: 'bottoms' },
      ]);

      const result = getFilteredSuggestions({
        category: 'bottoms',
        scannedVibes: [],
        userVibes: [],
        filters: { tone: 'dark', structure: 'structured' },
        limit: 3,
        relaxOrder: ['tone'],
        neverRelax: ['structure'],
        librarySource: library,
      });

      expect(result.wasRelaxed).toBe(false);
      expect(result.relaxedKeys).toEqual([]);
      expect(result.didFallbackToAnyInCategory).toBe(false);
      expect(result.items).toHaveLength(3);
      // All should match strict filters
      for (const item of result.items) {
        expect(item.tone).toBe('dark');
        expect(item.structure).toBe('structured');
      }
    });
  });

  describe('progressive relaxation', () => {
    it('should relax filters in relaxOrder when strict matches insufficient', () => {
      const library = createMockLibrary([
        // No dark+structured items
        { id: 'light-structured', tone: 'light', structure: 'structured', category: 'bottoms' },
        { id: 'neutral-structured', tone: 'neutral', structure: 'structured', category: 'bottoms' },
      ]);

      const result = getFilteredSuggestions({
        category: 'bottoms',
        scannedVibes: [],
        userVibes: [],
        filters: { tone: 'dark', structure: 'structured' },
        limit: 2,
        relaxOrder: ['tone'], // tone can be relaxed
        neverRelax: ['structure'], // structure must stay
        librarySource: library,
      });

      expect(result.wasRelaxed).toBe(true);
      expect(result.relaxedKeys).toContain('tone');
      expect(result.didFallbackToAnyInCategory).toBe(false);
      expect(result.items).toHaveLength(2);
      // Should still match structure: structured
      for (const item of result.items) {
        expect(item.structure).toBe('structured');
      }
    });

    it('should relax in order specified by relaxOrder', () => {
      const library = createMockLibrary([
        // Only items with neither dark tone nor straight shape
        { id: 'light-wide', tone: 'light', structure: 'structured', shape: 'wide', category: 'bottoms' },
        { id: 'neutral-tapered', tone: 'neutral', structure: 'structured', shape: 'tapered', category: 'bottoms' },
      ]);

      const result = getFilteredSuggestions({
        category: 'bottoms',
        scannedVibes: [],
        userVibes: [],
        filters: { tone: 'dark', shape: 'straight', structure: 'structured' },
        limit: 2,
        relaxOrder: ['shape', 'tone'], // shape first, then tone
        neverRelax: ['structure'],
        librarySource: library,
      });

      expect(result.wasRelaxed).toBe(true);
      // Both shape and tone should be relaxed since neither alone gives enough results
      expect(result.relaxedKeys).toContain('shape');
      expect(result.didFallbackToAnyInCategory).toBe(false);
    });
  });

  describe('neverRelax enforcement', () => {
    it('should return empty when neverRelax keys cannot be satisfied (no automatic fallback)', () => {
      const library = createMockLibrary([
        // Only soft items - no structured
        { id: 'dark-soft', tone: 'dark', structure: 'soft', category: 'bottoms' },
        { id: 'light-soft', tone: 'light', structure: 'soft', category: 'bottoms' },
      ]);

      const result = getFilteredSuggestions({
        category: 'bottoms',
        scannedVibes: [],
        userVibes: [],
        filters: { tone: 'dark', structure: 'structured' },
        limit: 2,
        relaxOrder: ['tone', 'structure'], // structure in relaxOrder
        neverRelax: ['structure'], // but protected in neverRelax
        librarySource: library,
      });

      // Should return EMPTY since structure can't be relaxed and no structured items exist
      // (no automatic category fallback - user must opt-in via getCategorySuggestions)
      expect(result.wasRelaxed).toBe(true);
      expect(result.didFallbackToAnyInCategory).toBe(false); // Always false now
      expect(result.items).toHaveLength(0);
    });
  });

  describe('deterministic ordering', () => {
    it('should return same order for same inputs', () => {
      const library = createMockLibrary([
        { id: 'item-c', rank: 30, vibes: ['default'], category: 'bottoms' },
        { id: 'item-a', rank: 10, vibes: ['default'], category: 'bottoms' },
        { id: 'item-b', rank: 20, vibes: ['default'], category: 'bottoms' },
      ]);

      const result1 = getFilteredSuggestions({
        category: 'bottoms',
        scannedVibes: [],
        userVibes: [],
        filters: {},
        limit: 3,
        librarySource: library,
      });

      const result2 = getFilteredSuggestions({
        category: 'bottoms',
        scannedVibes: [],
        userVibes: [],
        filters: {},
        limit: 3,
        librarySource: library,
      });

      // Same inputs should produce same order
      expect(result1.items.map((i) => i.id)).toEqual(result2.items.map((i) => i.id));
      // Should be sorted by rank ascending (within same vibe bucket)
      expect(result1.items.map((i) => i.id)).toEqual(['item-a', 'item-b', 'item-c']);
    });

    it('should prioritize scannedVibes match over default', () => {
      const library = createMockLibrary([
        { id: 'default-item', rank: 10, vibes: ['default'], category: 'bottoms' },
        { id: 'casual-item', rank: 20, vibes: ['casual'], category: 'bottoms' },
      ]);

      const result = getFilteredSuggestions({
        category: 'bottoms',
        scannedVibes: ['casual'],
        userVibes: [],
        filters: {},
        limit: 2,
        librarySource: library,
      });

      // Exact scannedVibes match (casual) should come first despite higher rank
      expect(result.items[0].id).toBe('casual-item');
      expect(result.items[1].id).toBe('default-item');
    });
  });

  describe('no automatic fallback (user-controlled via getCategorySuggestions)', () => {
    it('should return empty when all filters fail (no automatic fallback)', () => {
      const library = createMockLibrary([
        { id: 'only-item', tone: 'light', structure: 'soft', category: 'bottoms' },
      ]);

      const result = getFilteredSuggestions({
        category: 'bottoms',
        scannedVibes: [],
        userVibes: [],
        filters: { tone: 'dark', structure: 'structured' }, // No matches
        limit: 1,
        relaxOrder: [], // Nothing to relax
        neverRelax: ['tone', 'structure'], // Can't relax anything
        librarySource: library,
      });

      // Should return EMPTY - no automatic fallback
      expect(result.items).toHaveLength(0);
      expect(result.wasRelaxed).toBe(true);
      expect(result.didFallbackToAnyInCategory).toBe(false); // Always false now
    });

    it('user-controlled fallback via getCategorySuggestions returns all category items', () => {
      const library = createMockLibrary([
        { id: 'item-1', tone: 'light', structure: 'soft', category: 'bottoms', rank: 10 },
        { id: 'item-2', tone: 'dark', structure: 'soft', category: 'bottoms', rank: 20 },
      ]);

      const moreItems = getCategorySuggestions({
        category: 'bottoms',
        scannedVibes: [],
        userVibes: [],
        limit: 2,
        librarySource: library,
      });

      // Should return items regardless of filters
      expect(moreItems).toHaveLength(2);
      expect(moreItems.map((i) => i.id)).toEqual(['item-1', 'item-2']);
    });
  });
});

// ============================================
// DUAL-ARRAY VIBE RANKING TESTS
// ============================================

describe('deterministicSort dual-array vibe ranking', () => {
  // Access internal test exports
  const { __test__ } = require('../inspiration/recipeSuggestions');
  const { deterministicSort, intersects } = __test__;

  describe('intersects helper', () => {
    it('returns true when item vibe matches any target vibe', () => {
      expect(intersects(['casual', 'minimal'], ['casual'])).toBe(true);
      expect(intersects(['office'], ['office', 'minimal'])).toBe(true);
    });

    it('returns false when no overlap', () => {
      expect(intersects(['casual'], ['office'])).toBe(false);
      expect(intersects(['street', 'sporty'], ['feminine', 'minimal'])).toBe(false);
    });

    it('returns false for empty arrays', () => {
      expect(intersects([], ['casual'])).toBe(false);
      expect(intersects(['casual'], [])).toBe(false);
      expect(intersects([], [])).toBe(false);
    });

    it('returns false for undefined item vibes', () => {
      expect(intersects(undefined, ['casual'])).toBe(false);
    });
  });

  describe('bucket priority', () => {
    const items = [
      { id: 'both', vibes: ['casual', 'office'], rank: 50 },
      { id: 'scanned-only', vibes: ['casual'], rank: 50 },
      { id: 'user-only', vibes: ['office'], rank: 50 },
      { id: 'default-only', vibes: ['default'], rank: 50 },
      { id: 'other', vibes: ['street'], rank: 50 },
    ];

    it('bucket 0: items matching BOTH scannedVibes AND userVibes come first', () => {
      const sorted = deterministicSort(items, {
        scannedVibes: ['casual'],
        userVibes: ['office'],
      });

      expect(sorted[0].id).toBe('both');
    });

    it('bucket 1: items matching scannedVibes only come second', () => {
      const sorted = deterministicSort(items, {
        scannedVibes: ['casual'],
        userVibes: ['office'],
      });

      expect(sorted[1].id).toBe('scanned-only');
    });

    it('bucket 2: items matching userVibes only come third', () => {
      const sorted = deterministicSort(items, {
        scannedVibes: ['casual'],
        userVibes: ['office'],
      });

      expect(sorted[2].id).toBe('user-only');
    });

    it('bucket 3: items with "default" come fourth', () => {
      const sorted = deterministicSort(items, {
        scannedVibes: ['casual'],
        userVibes: ['office'],
      });

      expect(sorted[3].id).toBe('default-only');
    });

    it('bucket 4: other items come last', () => {
      const sorted = deterministicSort(items, {
        scannedVibes: ['casual'],
        userVibes: ['office'],
      });

      expect(sorted[4].id).toBe('other');
    });
  });

  describe('within-bucket tie-breakers', () => {
    it('sorts by rank ascending within same bucket', () => {
      const items = [
        { id: 'high-rank', vibes: ['casual'], rank: 100 },
        { id: 'low-rank', vibes: ['casual'], rank: 10 },
        { id: 'mid-rank', vibes: ['casual'], rank: 50 },
      ];

      const sorted = deterministicSort(items, {
        scannedVibes: ['casual'],
        userVibes: [],
      });

      expect(sorted.map((i: any) => i.id)).toEqual(['low-rank', 'mid-rank', 'high-rank']);
    });

    it('treats missing rank as 9999 (low priority)', () => {
      const items = [
        { id: 'no-rank', vibes: ['casual'] },
        { id: 'has-rank', vibes: ['casual'], rank: 50 },
      ];

      const sorted = deterministicSort(items, {
        scannedVibes: ['casual'],
        userVibes: [],
      });

      expect(sorted[0].id).toBe('has-rank');
      expect(sorted[1].id).toBe('no-rank');
    });

    it('uses id as final tie-breaker (stable sort)', () => {
      const items = [
        { id: 'item-c', vibes: ['casual'], rank: 50 },
        { id: 'item-a', vibes: ['casual'], rank: 50 },
        { id: 'item-b', vibes: ['casual'], rank: 50 },
      ];

      const sorted = deterministicSort(items, {
        scannedVibes: ['casual'],
        userVibes: [],
      });

      expect(sorted.map((i: any) => i.id)).toEqual(['item-a', 'item-b', 'item-c']);
    });
  });

  describe('empty vibe arrays', () => {
    it('handles empty scannedVibes (no bucket 0 or 1 matches)', () => {
      const items = [
        { id: 'casual', vibes: ['casual'], rank: 10 },
        { id: 'default', vibes: ['default'], rank: 20 },
      ];

      const sorted = deterministicSort(items, {
        scannedVibes: [],
        userVibes: ['casual'],
      });

      // casual matches userVibes (bucket 2), default is bucket 3
      expect(sorted[0].id).toBe('casual');
      expect(sorted[1].id).toBe('default');
    });

    it('handles empty userVibes (no bucket 0 or 2 matches)', () => {
      const items = [
        { id: 'casual', vibes: ['casual'], rank: 10 },
        { id: 'default', vibes: ['default'], rank: 20 },
      ];

      const sorted = deterministicSort(items, {
        scannedVibes: ['casual'],
        userVibes: [],
      });

      // casual matches scannedVibes (bucket 1), default is bucket 3
      expect(sorted[0].id).toBe('casual');
      expect(sorted[1].id).toBe('default');
    });

    it('handles both empty (fall back to default → other → rank → id)', () => {
      const items = [
        { id: 'other', vibes: ['street'], rank: 10 },
        { id: 'default', vibes: ['default'], rank: 20 },
      ];

      const sorted = deterministicSort(items, {
        scannedVibes: [],
        userVibes: [],
      });

      // default (bucket 3) beats other (bucket 4) regardless of rank
      expect(sorted[0].id).toBe('default');
      expect(sorted[1].id).toBe('other');
    });
  });
});
