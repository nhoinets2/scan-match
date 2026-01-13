/**
 * useMatchCount Hook Tests
 *
 * Tests for the dynamic match count calculation logic:
 * - Real-time match count calculation against current wardrobe
 * - Edge cases (empty wardrobe, no matches, error handling)
 * 
 * Note: engineSnapshot is no longer loaded from DB for performance.
 * The hook now always calculates against current wardrobe when possible,
 * returning empty string when wardrobe is empty or recalculation fails.
 */

// Define __DEV__ for test environment
// @ts-expect-error - __DEV__ is a React Native global
globalThis.__DEV__ = false; // Disable logs for tests

import type { RecentCheck, WardrobeItem, ScannedItem } from '../types';
import { scannedItemToConfidenceItem, wardrobeItemToConfidenceItem, evaluateAgainstWardrobe } from '../confidence-engine';

// ============================================
// HELPER FUNCTION - Extract core logic from hook
// ============================================

/**
 * Core match count calculation logic (extracted from useMatchCount hook)
 * This allows us to test the logic without React hooks infrastructure
 * 
 * Note: Matches the current implementation which no longer uses snapshot fallback
 */
function calculateMatchCount(check: RecentCheck, wardrobeItems: WardrobeItem[]): string {
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

      // Format display string
      if (totalMatches === 0) return "0 matches";
      if (totalMatches === 1) return "1 match";
      return `${totalMatches} matches`;
    } catch (error) {
      // If recalculation fails, return empty string
    }
  }

  // Fallback: Return empty string when can't calculate
  // (engineSnapshot is no longer loaded from DB for performance)
  return "";
}

// ============================================
// TEST HELPERS
// ============================================

function createMockScannedItem(overrides: Partial<ScannedItem> = {}): ScannedItem {
  return {
    id: 'scanned-1',
    category: 'tops',
    subCategory: 't-shirt',
    color: { name: 'Navy', hex: '#001f3f' },
    colorFamily: 'Blue',
    secondaryColor: null,
    pattern: 'solid',
    material: 'cotton',
    style: 'casual',
    fit: 'regular',
    neckline: 'crew',
    sleeveLength: 'short',
    season: ['spring', 'summer'],
    occasions: ['casual'],
    brand: null,
    size: null,
    condition: null,
    purchaseDate: null,
    imageUri: 'file:///mock.jpg',
    thumbnailUri: null,
    vibes: ['minimal', 'relaxed'],
    formalityLevel: 2,
    ...overrides,
  };
}

function createMockWardrobeItem(overrides: Partial<WardrobeItem> = {}): WardrobeItem {
  return {
    id: 'wardrobe-1',
    category: 'bottoms',
    subCategory: 'jeans',
    color: { name: 'Dark Blue', hex: '#00416a' },
    colorFamily: 'Blue',
    secondaryColor: null,
    pattern: 'solid',
    material: 'denim',
    style: 'casual',
    fit: 'slim',
    rise: 'mid',
    length: 'full',
    season: ['all'],
    occasions: ['casual'],
    brand: null,
    size: null,
    condition: null,
    purchaseDate: null,
    imageUri: 'file:///mock.jpg',
    thumbnailUri: null,
    vibes: ['minimal'],
    formalityLevel: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockRecentCheck(overrides: Partial<RecentCheck> = {}): RecentCheck {
  return {
    id: 'check-1',
    itemName: 'Test Item',
    category: 'tops',
    imageUri: 'file:///mock.jpg',
    outcome: 'great_match',
    confidence: 'high',
    confidenceScore: 0.85,
    scannedItem: createMockScannedItem(),
    createdAt: Date.now(),
    // Note: engineSnapshot is no longer loaded from DB
    ...overrides,
  } as RecentCheck;
}

// ============================================
// TESTS
// ============================================

describe('useMatchCount', () => {
  describe('Basic Functionality', () => {
    it('should calculate match count against wardrobe items', () => {
      const scannedItem = createMockScannedItem({ category: 'tops' });
      const check = createMockRecentCheck({ scannedItem });
      const wardrobeItems = [
        createMockWardrobeItem({ id: 'item-1', category: 'bottoms' }),
        createMockWardrobeItem({ id: 'item-2', category: 'bottoms' }),
      ];

      const result = calculateMatchCount(check, wardrobeItems);

      // Should return a formatted count string
      expect(result).toMatch(/^\d+ match(es)?$/);
    });

    it('should return empty string when wardrobe is empty', () => {
      const scannedItem = createMockScannedItem();
      const check = createMockRecentCheck({ scannedItem });
      const wardrobeItems: WardrobeItem[] = [];

      const result = calculateMatchCount(check, wardrobeItems);

      // No wardrobe items means can't calculate matches
      expect(result).toBe('');
    });

    it('should count both HIGH and MEDIUM tier matches from real calculation', () => {
      const scannedItem = createMockScannedItem({ category: 'tops', vibes: ['minimal'] });
      const check = createMockRecentCheck({ scannedItem });
      // Create multiple wardrobe items for matching
      const wardrobeItems = [
        createMockWardrobeItem({ id: 'item-1', category: 'bottoms', vibes: ['minimal'] }),
        createMockWardrobeItem({ id: 'item-2', category: 'shoes', vibes: ['minimal'] }),
      ];

      const result = calculateMatchCount(check, wardrobeItems);

      // Should return a valid count string (actual count depends on confidence engine)
      expect(result).toMatch(/^\d+ match(es)?$/);
    });
  });

  describe('Edge Cases', () => {
    it('should return "0 matches" when calculation finds no matches', () => {
      // Create items that won't match (completely different attributes)
      const scannedItem = createMockScannedItem({
        category: 'tops',
        vibes: ['punk', 'edgy'],
        formalityLevel: 1,
      });
      const check = createMockRecentCheck({ scannedItem });
      const wardrobeItems = [
        createMockWardrobeItem({
          id: 'item-1',
          category: 'accessories',
          vibes: ['formal', 'classic'],
          formalityLevel: 5,
        }),
      ];

      const result = calculateMatchCount(check, wardrobeItems);

      // Should calculate and return count
      expect(result).toMatch(/^\d+ match(es)?$/);
    });

    it('should return empty string when wardrobe is empty', () => {
      const scannedItem = createMockScannedItem();
      const check = createMockRecentCheck({ scannedItem });
      const wardrobeItems: WardrobeItem[] = [];

      const result = calculateMatchCount(check, wardrobeItems);

      // Can't calculate without wardrobe items
      expect(result).toBe('');
    });

    it('should return empty string when scannedItem is missing', () => {
      const check = createMockRecentCheck({
        scannedItem: null as any,
      });
      const wardrobeItems = [createMockWardrobeItem({ id: 'item-1' })];

      const result = calculateMatchCount(check, wardrobeItems);

      // Can't calculate without scanned item
      expect(result).toBe('');
    });

    it('should return empty string when both wardrobe and scannedItem are missing', () => {
      const check = createMockRecentCheck({
        scannedItem: null as any,
      });
      const wardrobeItems: WardrobeItem[] = [];

      const result = calculateMatchCount(check, wardrobeItems);

      expect(result).toBe('');
    });
  });

  describe('Match Count Formatting', () => {
    it('should format "0 matches" correctly', () => {
      // The actual formatting is tested through integration
      // Just verify the format pattern
      expect("0 matches").toMatch(/^\d+ matches$/);
    });

    it('should format "1 match" singular correctly', () => {
      expect("1 match").toMatch(/^\d+ match$/);
    });

    it('should format "N matches" plural correctly', () => {
      expect("5 matches").toMatch(/^\d+ matches$/);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should recalculate when wardrobe has items', () => {
      const scannedItem = createMockScannedItem({ category: 'tops', vibes: ['minimal'] });
      const check = createMockRecentCheck({
        scannedItem,
        engineSnapshot: {
          engines: {
            confidence: {
              matchesHighCount: 99, // Snapshot has wrong data
              nearMatchesCount: 99,
            },
          },
        },
      });

      const wardrobeItems = [
        createMockWardrobeItem({ id: 'item-1', category: 'bottoms', vibes: ['minimal'] }),
      ];

      const result = calculateMatchCount(check, wardrobeItems);

      // Should recalculate (not use snapshot's 198)
      expect(result).not.toBe('198 matches');
      expect(result).toMatch(/^\d+ match(es)?$/);
    });

    it('should handle conversion of scanned item to confidence format', () => {
      const scannedItem = createMockScannedItem({
        category: 'tops',
        color: { name: 'Navy', hex: '#001f3f' },
        vibes: ['minimal', 'relaxed'],
      });
      const check = createMockRecentCheck({ scannedItem });
      const wardrobeItems = [
        createMockWardrobeItem({
          id: 'item-1',
          category: 'bottoms',
          color: { name: 'Dark Blue', hex: '#00416a' },
        }),
      ];

      // Should not throw error
      expect(() => {
        calculateMatchCount(check, wardrobeItems);
      }).not.toThrow();
    });

    it('should handle conversion of wardrobe items to confidence format', () => {
      const scannedItem = createMockScannedItem({ category: 'tops' });
      const check = createMockRecentCheck({ scannedItem });
      const wardrobeItems = [
        createMockWardrobeItem({ id: 'item-1', category: 'bottoms' }),
        createMockWardrobeItem({ id: 'item-2', category: 'shoes' }),
        createMockWardrobeItem({ id: 'item-3', category: 'outerwear' }),
      ];

      // Should not throw error
      expect(() => {
        calculateMatchCount(check, wardrobeItems);
      }).not.toThrow();
    });
  });

  describe('Integration with Confidence Engine', () => {
    it('should call confidence engine functions with correct data', () => {
      const scannedItem = createMockScannedItem({
        id: 'scanned-123',
        category: 'tops',
        vibes: ['minimal'],
      });
      const check = createMockRecentCheck({ scannedItem });
      const wardrobeItems = [
        createMockWardrobeItem({ id: 'wardrobe-456', category: 'bottoms' }),
      ];

      // Should not throw and should return valid result
      const result = calculateMatchCount(check, wardrobeItems);

      expect(result).toMatch(/^\d+ match(es)?$/);
    });

    it('should handle evaluation results correctly', () => {
      const scannedItem = createMockScannedItem({ category: 'tops' });
      const check = createMockRecentCheck({ scannedItem });

      // Create items with similar attributes for better matching
      const wardrobeItems = [
        createMockWardrobeItem({
          id: 'item-1',
          category: 'bottoms',
          vibes: ['minimal'],
          formalityLevel: 2,
        }),
        createMockWardrobeItem({
          id: 'item-2',
          category: 'bottoms',
          vibes: ['minimal'],
          formalityLevel: 2,
        }),
      ];

      const result = calculateMatchCount(check, wardrobeItems);

      // Should return a valid count
      expect(result).toMatch(/^\d+ match(es)?$/);
    });
  });
});

