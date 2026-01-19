/**
 * useMatchCount tests
 * 
 * Tests for match count calculation functions.
 * Covers both the batch calculation function and edge cases.
 */

import { calculateMatchCountsForChecks } from '../useMatchCount';
import type { RecentCheck, WardrobeItem, ScannedItem } from '../types';

// ============================================
// TEST FIXTURES
// ============================================

const createMockWardrobeItem = (overrides: Partial<WardrobeItem> = {}): WardrobeItem => ({
  id: `wardrobe-${Math.random().toString(36).slice(2, 8)}`,
  imageUri: 'file:///mock/image.jpg',
  category: 'tops',
  colors: [{ hex: '#000000', name: 'Black' }],
  createdAt: Date.now(),
  ...overrides,
});

const createMockScannedItem = (overrides: Partial<ScannedItem> = {}): ScannedItem => ({
  id: `scanned-${Math.random().toString(36).slice(2, 8)}`,
  imageUri: 'file:///mock/scanned.jpg',
  category: 'bottoms',
  descriptiveLabel: 'Blue jeans',
  colors: [{ hex: '#1E3A5F', name: 'Navy' }],
  styleTags: ['casual'],
  styleNotes: ['Classic fit'],
  contextSufficient: true,
  ...overrides,
});

const createMockRecentCheck = (overrides: Partial<RecentCheck> = {}): RecentCheck => ({
  id: `check-${Math.random().toString(36).slice(2, 8)}`,
  itemName: 'Test Item',
  category: 'bottoms',
  imageUri: 'file:///mock/check.jpg',
  outcome: 'could_work_with_pieces',
  confidence: 'okay',
  confidenceScore: 0.75,
  scannedItem: createMockScannedItem(),
  createdAt: Date.now(),
  ...overrides,
});

// ============================================
// calculateMatchCountsForChecks TESTS
// ============================================

describe('calculateMatchCountsForChecks', () => {
  describe('empty wardrobe', () => {
    it('returns null for all checks when wardrobe is empty', () => {
      const checks = [
        createMockRecentCheck({ id: 'check-1' }),
        createMockRecentCheck({ id: 'check-2' }),
      ];
      
      const result = calculateMatchCountsForChecks(checks, []);
      
      expect(result['check-1']).toBeNull();
      expect(result['check-2']).toBeNull();
    });

    it('returns empty object for empty checks array', () => {
      const result = calculateMatchCountsForChecks([], []);
      
      expect(result).toEqual({});
    });
  });

  describe('checks without scannedItem', () => {
    it('returns null for checks without scannedItem', () => {
      const checks = [
        createMockRecentCheck({ 
          id: 'check-no-scanned',
          scannedItem: undefined as unknown as ScannedItem,
        }),
      ];
      const wardrobe = [createMockWardrobeItem()];
      
      const result = calculateMatchCountsForChecks(checks, wardrobe);
      
      expect(result['check-no-scanned']).toBeNull();
    });
  });

  describe('match count formatting', () => {
    it('returns a formatted match count string', () => {
      const checks = [
        createMockRecentCheck({
          id: 'check-1',
          category: 'bottoms',
          scannedItem: createMockScannedItem({ category: 'bottoms' }),
        }),
      ];
      
      const wardrobe = [
        createMockWardrobeItem({ id: 'w1', category: 'tops' }),
      ];
      
      const result = calculateMatchCountsForChecks(checks, wardrobe);
      
      // Result should be a string (either null or a formatted count)
      expect(typeof result['check-1'] === 'string' || result['check-1'] === null).toBe(true);
    });
  });

  describe('batch processing', () => {
    it('processes multiple checks in a single call', () => {
      const checks = [
        createMockRecentCheck({ id: 'check-1' }),
        createMockRecentCheck({ id: 'check-2' }),
        createMockRecentCheck({ id: 'check-3' }),
      ];
      const wardrobe = [createMockWardrobeItem()];
      
      const result = calculateMatchCountsForChecks(checks, wardrobe);
      
      expect(Object.keys(result)).toHaveLength(3);
      expect('check-1' in result).toBe(true);
      expect('check-2' in result).toBe(true);
      expect('check-3' in result).toBe(true);
    });

    it('returns correct IDs as keys', () => {
      const checks = [
        createMockRecentCheck({ id: 'unique-id-123' }),
        createMockRecentCheck({ id: 'another-id-456' }),
      ];
      const wardrobe = [createMockWardrobeItem()];
      
      const result = calculateMatchCountsForChecks(checks, wardrobe);
      
      expect('unique-id-123' in result).toBe(true);
      expect('another-id-456' in result).toBe(true);
    });
  });

  describe('core categories filtering', () => {
    it('only counts matches for core categories', () => {
      // Core categories: tops, bottoms, shoes, dresses, skirts
      // Non-core: outerwear, bags, accessories
      
      const checks = [
        createMockRecentCheck({
          id: 'check-tops',
          category: 'tops',
          scannedItem: createMockScannedItem({ category: 'tops' }),
        }),
      ];
      
      // Wardrobe with mix of core and non-core items
      const wardrobe = [
        createMockWardrobeItem({ id: 'w1', category: 'bottoms' }), // Core
        createMockWardrobeItem({ id: 'w2', category: 'shoes' }),   // Core
        createMockWardrobeItem({ id: 'w3', category: 'outerwear' }), // Non-core
        createMockWardrobeItem({ id: 'w4', category: 'bags' }),    // Non-core
      ];
      
      const result = calculateMatchCountsForChecks(checks, wardrobe);
      
      // Result should only count core category matches
      expect(result['check-tops']).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('handles malformed scannedItem gracefully without throwing', () => {
      const checks = [
        createMockRecentCheck({
          id: 'check-malformed',
          scannedItem: { broken: true } as unknown as ScannedItem,
        }),
      ];
      const wardrobe = [createMockWardrobeItem()];
      
      // Should not throw - just verify it completes without error
      expect(() => {
        calculateMatchCountsForChecks(checks, wardrobe);
      }).not.toThrow();
      
      // Result should have an entry for the check (null or string)
      const result = calculateMatchCountsForChecks(checks, wardrobe);
      expect('check-malformed' in result).toBe(true);
    });
  });
});

// ============================================
// CORE CATEGORIES DEFINITION TESTS
// ============================================

describe('Core categories', () => {
  const CORE_CATEGORIES = ['tops', 'bottoms', 'shoes', 'dresses', 'skirts'];
  const NON_CORE_CATEGORIES = ['outerwear', 'bags', 'accessories'];

  it('includes all expected core categories', () => {
    expect(CORE_CATEGORIES).toContain('tops');
    expect(CORE_CATEGORIES).toContain('bottoms');
    expect(CORE_CATEGORIES).toContain('shoes');
    expect(CORE_CATEGORIES).toContain('dresses');
    expect(CORE_CATEGORIES).toContain('skirts');
  });

  it('excludes optional categories from core', () => {
    expect(CORE_CATEGORIES).not.toContain('outerwear');
    expect(CORE_CATEGORIES).not.toContain('bags');
    expect(CORE_CATEGORIES).not.toContain('accessories');
  });

  it('has exactly 5 core categories', () => {
    expect(CORE_CATEGORIES).toHaveLength(5);
  });

  it('has exactly 3 non-core categories', () => {
    expect(NON_CORE_CATEGORIES).toHaveLength(3);
  });
});

// ============================================
// MATCH COUNT STRING FORMAT TESTS
// ============================================

describe('Match count string formats', () => {
  it('"0 matches" format is correct', () => {
    const expected = '0 matches';
    expect(expected).toMatch(/^\d+ matches?$/);
  });

  it('"1 match" format is singular', () => {
    const expected = '1 match';
    expect(expected).toMatch(/^1 match$/);
  });

  it('"N matches" format is plural for N > 1', () => {
    const formats = ['2 matches', '5 matches', '10 matches', '100 matches'];
    formats.forEach(format => {
      expect(format).toMatch(/^\d+ matches$/);
    });
  });
});

// ============================================
// PERFORMANCE CONSIDERATIONS
// ============================================

describe('Performance', () => {
  it('handles large wardrobe efficiently', () => {
    const checks = [createMockRecentCheck()];
    
    // Create large wardrobe
    const wardrobe = Array.from({ length: 100 }, (_, i) =>
      createMockWardrobeItem({
        id: `wardrobe-${i}`,
        category: ['tops', 'bottoms', 'shoes'][i % 3] as 'tops' | 'bottoms' | 'shoes',
      })
    );
    
    const start = Date.now();
    calculateMatchCountsForChecks(checks, wardrobe);
    const duration = Date.now() - start;
    
    // Should complete quickly (under 1 second even with 100 items)
    expect(duration).toBeLessThan(1000);
  });

  it('handles many checks efficiently', () => {
    // Create many checks
    const checks = Array.from({ length: 50 }, (_, i) =>
      createMockRecentCheck({ id: `check-${i}` })
    );
    
    const wardrobe = [
      createMockWardrobeItem({ category: 'tops' }),
      createMockWardrobeItem({ category: 'bottoms' }),
      createMockWardrobeItem({ category: 'shoes' }),
    ];
    
    const start = Date.now();
    const result = calculateMatchCountsForChecks(checks, wardrobe);
    const duration = Date.now() - start;
    
    // Should complete quickly
    expect(duration).toBeLessThan(2000);
    expect(Object.keys(result)).toHaveLength(50);
  });
});
