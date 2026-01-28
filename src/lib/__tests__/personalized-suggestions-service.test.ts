/**
 * Tests for personalized suggestions validation and repair logic
 */

// Mock expo-crypto before importing the service
jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn(),
  CryptoDigestAlgorithm: {
    SHA256: 'SHA256',
  },
}));

// Mock supabase
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { getSession: jest.fn() },
    rpc: jest.fn(),
  },
}));

// Mock analytics
jest.mock('../analytics', () => ({
  trackEvent: jest.fn(),
}));

import { validateAndRepairSuggestions } from '../personalized-suggestions-service';
import type { PersonalizedSuggestions } from '../types';

describe('validateAndRepairSuggestions', () => {
  const validIds = ['item-1', 'item-2', 'item-3'];

  describe('padding to exactly 2+2 bullets', () => {
    it('pads empty arrays to 2+2 with fallbacks', () => {
      const { suggestions, wasRepaired } = validateAndRepairSuggestions(
        { why_it_works: [], to_elevate: [] },
        validIds
      );

      expect(suggestions.why_it_works).toHaveLength(2);
      expect(suggestions.to_elevate).toHaveLength(2);
      expect(wasRepaired).toBe(true);
      
      // Check fallback content
      expect(suggestions.why_it_works[0].text).toBe('The colors and styles complement each other well');
      expect(suggestions.to_elevate[0].recommend.category).toBe('accessories');
    });

    it('pads single bullet to 2', () => {
      const { suggestions, wasRepaired } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'First bullet', mentions: ['item-1'] }
          ],
          to_elevate: [
            { text: 'Add this', recommend: { type: 'consider_adding', category: 'tops', attributes: ['blue'] } }
          ],
        },
        validIds
      );

      expect(suggestions.why_it_works).toHaveLength(2);
      expect(suggestions.to_elevate).toHaveLength(2);
      expect(wasRepaired).toBe(true);
      
      // First bullet is preserved
      expect(suggestions.why_it_works[0].text).toBe('First bullet');
      expect(suggestions.why_it_works[0].mentions).toEqual(['item-1']);
      
      // Second is fallback
      expect(suggestions.why_it_works[1].text).toBe('The colors and styles complement each other well');
    });

    it('trims extra bullets beyond 2', () => {
      const { suggestions, wasRepaired } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'First', mentions: [] },
            { text: 'Second', mentions: [] },
            { text: 'Third (should be removed)', mentions: [] },
          ],
          to_elevate: [
            { text: 'Add 1', recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
            { text: 'Add 2', recommend: { type: 'consider_adding', category: 'shoes', attributes: [] } },
            { text: 'Add 3 (should be removed)', recommend: { type: 'consider_adding', category: 'bags', attributes: [] } },
          ],
        },
        validIds
      );

      expect(suggestions.why_it_works).toHaveLength(2);
      expect(suggestions.to_elevate).toHaveLength(2);
      
      expect(suggestions.why_it_works[0].text).toBe('First');
      expect(suggestions.why_it_works[1].text).toBe('Second');
      
      expect(suggestions.to_elevate[0].text).toBe('Add 1');
      expect(suggestions.to_elevate[1].text).toBe('Add 2');
    });

    it('handles missing fields in input object', () => {
      const { suggestions, wasRepaired } = validateAndRepairSuggestions(
        {},
        validIds
      );

      expect(suggestions.why_it_works).toHaveLength(2);
      expect(suggestions.to_elevate).toHaveLength(2);
      expect(wasRepaired).toBe(true);
    });

    it('handles null/undefined input', () => {
      const { suggestions: nullResult } = validateAndRepairSuggestions(null, validIds);
      expect(nullResult.why_it_works).toHaveLength(2);

      const { suggestions: undefinedResult } = validateAndRepairSuggestions(undefined, validIds);
      expect(undefinedResult.why_it_works).toHaveLength(2);
    });
  });

  describe('mention ID validation', () => {
    it('strips invalid mention IDs', () => {
      const { suggestions, wasRepaired } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test 1', mentions: ['item-1', 'invalid-id', 'item-2'] },
            { text: 'Test 2', mentions: ['item-3', 'another-invalid'] },
          ],
          to_elevate: [
            { text: 'Add this', recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
            { text: 'Add that', recommend: { type: 'consider_adding', category: 'shoes', attributes: [] } },
          ],
        },
        validIds
      );

      expect(suggestions.why_it_works[0].mentions).toEqual(['item-1', 'item-2']);
      expect(suggestions.why_it_works[1].mentions).toEqual(['item-3']);
      expect(wasRepaired).toBe(true);
    });

    it('keeps empty mentions array if all IDs invalid', () => {
      const { suggestions, wasRepaired } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: ['invalid-1', 'invalid-2'] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Add', recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
            { text: 'Add', recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
          ],
        },
        validIds
      );

      expect(suggestions.why_it_works[0].mentions).toEqual([]);
      expect(suggestions.why_it_works[1].mentions).toEqual([]);
      expect(wasRepaired).toBe(true);
    });

    it('handles non-array mentions field', () => {
      const { suggestions } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: 'not-an-array' },
            { text: 'Test', mentions: null },
          ],
          to_elevate: [
            { text: 'Add', recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
            { text: 'Add', recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
          ],
        },
        validIds
      );

      expect(suggestions.why_it_works[0].mentions).toEqual([]);
      expect(suggestions.why_it_works[1].mentions).toEqual([]);
    });

    it('handles mentions with non-string values', () => {
      const { suggestions } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: ['item-1', 123, null, 'item-2', undefined] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Add', recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
            { text: 'Add', recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
          ],
        },
        validIds
      );

      expect(suggestions.why_it_works[0].mentions).toEqual(['item-1', 'item-2']);
    });
  });

  describe('text trimming', () => {
    it('trims long text to ~100 chars at word boundary', () => {
      const longText = 'This is a very long explanation that goes on and on and on and on and should definitely be trimmed at a word boundary to ensure good user experience';
      
      const { suggestions, wasRepaired } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: longText, mentions: ['item-1'] },
            { text: 'Short text', mentions: [] },
          ],
          to_elevate: [
            { text: 'Add this', recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
            { text: longText, recommend: { type: 'consider_adding', category: 'shoes', attributes: [] } },
          ],
        },
        validIds
      );

      expect(suggestions.why_it_works[0].text.length).toBeLessThanOrEqual(100);
      expect(suggestions.why_it_works[0].text).toContain('…');
      expect(suggestions.why_it_works[0].text).not.toContain('ensure good user experience');
      
      expect(suggestions.to_elevate[1].text.length).toBeLessThanOrEqual(100);
      expect(suggestions.to_elevate[1].text).toContain('…');
      
      expect(wasRepaired).toBe(true);
    });

    it('does not trim text under 100 chars', () => {
      const shortText = 'This is a perfectly reasonable length explanation';
      
      const { suggestions, wasRepaired } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: shortText, mentions: [] },
            { text: shortText, mentions: [] },
          ],
          to_elevate: [
            { text: shortText, recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
            { text: shortText, recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
          ],
        },
        validIds
      );

      expect(suggestions.why_it_works[0].text).toBe(shortText);
      expect(suggestions.why_it_works[0].text).not.toContain('…');
      expect(wasRepaired).toBe(false);
    });

    it('handles empty or missing text fields', () => {
      const { suggestions } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: '', mentions: [] },
            { mentions: [] }, // missing text
          ],
          to_elevate: [
            { recommend: { type: 'consider_adding', category: 'tops', attributes: [] } }, // missing text
            { text: null, recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
          ],
        },
        validIds
      );

      // Should use fallback text when empty
      expect(suggestions.why_it_works[0].text).toBe('The colors and styles complement each other well');
      expect(suggestions.why_it_works[1].text).toBe('The colors and styles complement each other well');
      
      expect(suggestions.to_elevate[0].text).toBe('Could add visual interest');
      expect(suggestions.to_elevate[1].text).toBe('Could add visual interest');
    });
  });

  describe('category validation', () => {
    it('forces invalid categories to accessories', () => {
      const { suggestions, wasRepaired } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Test', recommend: { type: 'consider_adding', category: 'invalid-category', attributes: [] } },
            { text: 'Test', recommend: { type: 'consider_adding', category: 'unknown', attributes: [] } },
          ],
        },
        validIds
      );

      expect(suggestions.to_elevate[0].recommend.category).toBe('accessories');
      expect(suggestions.to_elevate[1].recommend.category).toBe('accessories');
      expect(wasRepaired).toBe(true);
    });

    it('keeps valid categories', () => {
      const validCategories = ['tops', 'bottoms', 'shoes', 'outerwear', 'dresses', 'accessories', 'bags', 'skirts'];
      
      const toElevate = validCategories.map(cat => ({
        text: `Add ${cat}`,
        recommend: { type: 'consider_adding', category: cat, attributes: [] }
      }));

      const { suggestions, wasRepaired } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: toElevate.slice(0, 2), // Only use first 2
        },
        validIds
      );

      expect(suggestions.to_elevate[0].recommend.category).toBe('tops');
      expect(suggestions.to_elevate[1].recommend.category).toBe('bottoms');
      expect(wasRepaired).toBe(false);
    });

    it('handles missing category field', () => {
      const { suggestions } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Test', recommend: { type: 'consider_adding', attributes: [] } }, // missing category
            { text: 'Test', recommend: { type: 'consider_adding', category: null, attributes: [] } },
          ],
        },
        validIds
      );

      expect(suggestions.to_elevate[0].recommend.category).toBe('accessories');
      expect(suggestions.to_elevate[1].recommend.category).toBe('accessories');
    });
  });

  describe('type enforcement', () => {
    it('forces type to consider_adding', () => {
      const { suggestions, wasRepaired } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Test', recommend: { type: 'buy_now', category: 'tops', attributes: [] } },
            { text: 'Test', recommend: { type: 'shop_link', category: 'shoes', attributes: [] } },
          ],
        },
        validIds
      );

      expect(suggestions.to_elevate[0].recommend.type).toBe('consider_adding');
      expect(suggestions.to_elevate[1].recommend.type).toBe('consider_adding');
      expect(wasRepaired).toBe(true);
    });

    it('does not mark as repaired when type is already correct', () => {
      const { wasRepaired } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Test', recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
            { text: 'Test', recommend: { type: 'consider_adding', category: 'shoes', attributes: [] } },
          ],
        },
        validIds
      );

      expect(wasRepaired).toBe(false);
    });
  });

  describe('attributes validation', () => {
    it('keeps valid attributes array', () => {
      const { suggestions } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Test', recommend: { type: 'consider_adding', category: 'tops', attributes: ['blue', 'structured'] } },
            { text: 'Test', recommend: { type: 'consider_adding', category: 'shoes', attributes: ['casual', 'comfortable'] } },
          ],
        },
        validIds
      );

      expect(suggestions.to_elevate[0].recommend.attributes).toEqual(['blue', 'structured']);
      expect(suggestions.to_elevate[1].recommend.attributes).toEqual(['casual', 'comfortable']);
    });

    it('filters non-string attributes', () => {
      const { suggestions } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Test', recommend: { type: 'consider_adding', category: 'tops', attributes: ['blue', 123, null, 'structured', undefined] } },
            { text: 'Test', recommend: { type: 'consider_adding', category: 'shoes', attributes: [] } },
          ],
        },
        validIds
      );

      expect(suggestions.to_elevate[0].recommend.attributes).toEqual(['blue', 'structured']);
    });

    it('limits attributes to 4 items', () => {
      const { suggestions } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Test', recommend: { type: 'consider_adding', category: 'tops', attributes: ['a', 'b', 'c', 'd', 'e', 'f'] } },
            { text: 'Test', recommend: { type: 'consider_adding', category: 'shoes', attributes: [] } },
          ],
        },
        validIds
      );

      expect(suggestions.to_elevate[0].recommend.attributes).toHaveLength(4);
      expect(suggestions.to_elevate[0].recommend.attributes).toEqual(['a', 'b', 'c', 'd']);
    });

    it('uses fallback ["simple"] when attributes is not an array', () => {
      const { suggestions, wasRepaired } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Test', recommend: { type: 'consider_adding', category: 'tops', attributes: 'not-an-array' } },
            { text: 'Test', recommend: { type: 'consider_adding', category: 'shoes' } }, // missing attributes
          ],
        },
        validIds
      );

      expect(suggestions.to_elevate[0].recommend.attributes).toEqual(['simple']);
      expect(suggestions.to_elevate[1].recommend.attributes).toEqual(['simple']);
      expect(wasRepaired).toBe(true);
    });
  });

  describe('scan category filtering', () => {
    it('removes to_elevate that matches scanned category and backfills', () => {
      const { suggestions, wasRepaired } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Add tailored bottoms', recommend: { type: 'consider_adding', category: 'bottoms', attributes: ['tailored'] } },
            { text: 'Add shoes', recommend: { type: 'consider_adding', category: 'shoes', attributes: [] } },
          ],
        },
        validIds,
        'bottoms'
      );

      expect(suggestions.to_elevate).toHaveLength(2);
      expect(suggestions.to_elevate.some(b => b.recommend.category === 'bottoms')).toBe(false);
      expect(suggestions.to_elevate[0].recommend.category).toBe('shoes');
      expect(suggestions.to_elevate[1].recommend.category).toBe('accessories');
      expect(wasRepaired).toBe(true);
    });

    it('replaces both bullets when both match scanned category', () => {
      const { suggestions } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Add bottoms', recommend: { type: 'consider_adding', category: 'bottoms', attributes: [] } },
            { text: 'Add bottoms', recommend: { type: 'consider_adding', category: 'bottoms', attributes: [] } },
          ],
        },
        validIds,
        'bottoms'
      );

      expect(suggestions.to_elevate).toHaveLength(2);
      expect(suggestions.to_elevate[0].recommend.category).toBe('accessories');
      expect(suggestions.to_elevate[1].recommend.category).toBe('bags');
    });

    it('no-ops when scan category is null', () => {
      const { suggestions, wasRepaired } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Add bottoms', recommend: { type: 'consider_adding', category: 'bottoms', attributes: [] } },
            { text: 'Add shoes', recommend: { type: 'consider_adding', category: 'shoes', attributes: [] } },
          ],
        },
        validIds,
        null
      );

      expect(suggestions.to_elevate[0].recommend.category).toBe('bottoms');
      expect(suggestions.to_elevate[1].recommend.category).toBe('shoes');
      expect(wasRepaired).toBe(false);
    });
  });

  describe('add-on preference', () => {
    it('keeps only add-on categories when at least one exists', () => {
      const { suggestions } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Add bags', recommend: { type: 'consider_adding', category: 'bags', attributes: [] } },
            { text: 'Add shoes', recommend: { type: 'consider_adding', category: 'shoes', attributes: [] } },
          ],
        },
        validIds,
        null,
        true,
        ['bags', 'accessories']
      );

      expect(suggestions.to_elevate).toHaveLength(2);
      expect(suggestions.to_elevate[0].recommend.category).toBe('bags');
      expect(suggestions.to_elevate[1].recommend.category).toBe('accessories');
    });

    it('keeps core recommendations when no add-ons exist', () => {
      const { suggestions } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Add tops', recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
            { text: 'Add shoes', recommend: { type: 'consider_adding', category: 'shoes', attributes: [] } },
          ],
        },
        validIds,
        null,
        true,
        []
      );

      expect(suggestions.to_elevate[0].recommend.category).toBe('tops');
      expect(suggestions.to_elevate[1].recommend.category).toBe('shoes');
    });

    it('falls back to core when only one add-on category exists', () => {
      const { suggestions } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Add accessories', recommend: { type: 'consider_adding', category: 'accessories', attributes: [] } },
          ],
        },
        validIds,
        'tops',
        true,
        ['accessories']
      );

      expect(suggestions.to_elevate).toHaveLength(2);
      expect(suggestions.to_elevate[0].recommend.category).toBe('accessories');
      expect(suggestions.to_elevate[1].recommend.category).toBe('shoes');
    });

    it('keeps core shortlist away from outerwear', () => {
      const { suggestions } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Add outerwear', recommend: { type: 'consider_adding', category: 'outerwear', attributes: [] } },
          ],
        },
        validIds,
        null,
        true,
        ['outerwear']
      );

      expect(suggestions.to_elevate).toHaveLength(2);
      expect(suggestions.to_elevate[0].recommend.category).toBe('outerwear');
      expect(suggestions.to_elevate[1].recommend.category).toBe('shoes');
    });

    it('skips shoes when scan category is shoes', () => {
      const { suggestions } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Add outerwear', recommend: { type: 'consider_adding', category: 'outerwear', attributes: [] } },
          ],
        },
        validIds,
        'shoes',
        true,
        ['outerwear']
      );

      expect(suggestions.to_elevate).toHaveLength(2);
      expect(suggestions.to_elevate[0].recommend.category).toBe('outerwear');
      expect(suggestions.to_elevate[1].recommend.category).toBe('tops');
    });
  });

  describe('complete valid input (no repair needed)', () => {
    it('returns wasRepaired: false for perfect input', () => {
      const perfectInput: Partial<PersonalizedSuggestions> = {
        why_it_works: [
          { text: 'The silhouette creates balance', mentions: ['item-1'] },
          { text: 'The colors harmonize nicely', mentions: ['item-2', 'item-3'] },
        ],
        to_elevate: [
          { text: 'Would add depth', recommend: { type: 'consider_adding', category: 'outerwear', attributes: ['neutral', 'structured'] } },
          { text: 'Could complete the look', recommend: { type: 'consider_adding', category: 'shoes', attributes: ['casual'] } },
        ],
      };

      const { suggestions, wasRepaired } = validateAndRepairSuggestions(
        perfectInput,
        validIds
      );

      expect(wasRepaired).toBe(false);
      expect(suggestions.why_it_works).toHaveLength(2);
      expect(suggestions.to_elevate).toHaveLength(2);
      expect(suggestions.why_it_works[0].text).toBe('The silhouette creates balance');
    });
  });

  describe('structure validation', () => {
    it('returns proper schema version', () => {
      const { suggestions } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Test', recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
            { text: 'Test', recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
          ],
        },
        validIds
      );

      expect(suggestions.version).toBe(1);
    });
  });

  describe('solo mode (empty validIds)', () => {
    it('forces empty mentions even if model returns them', () => {
      const { suggestions, wasRepaired } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Great styling', mentions: ['item-1', 'item-2'] },
            { text: 'Nice look', mentions: ['item-3'] },
          ],
          to_elevate: [
            { text: 'Add tops', recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
            { text: 'Add shoes', recommend: { type: 'consider_adding', category: 'shoes', attributes: [] } },
          ],
        },
        [] // empty validIds = solo mode
      );

      // All mentions should be stripped
      expect(suggestions.why_it_works[0].mentions).toEqual([]);
      expect(suggestions.why_it_works[1].mentions).toEqual([]);
      expect(wasRepaired).toBe(true);
    });

    it('handles solo mode with scan category filter', () => {
      const { suggestions, removedCategories } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Add shoes', recommend: { type: 'consider_adding', category: 'shoes', attributes: ['casual'] } },
            { text: 'Add tops', recommend: { type: 'consider_adding', category: 'tops', attributes: [] } },
          ],
        },
        [], // solo mode
        'shoes' // scanCategory
      );

      // shoes should be removed, backfilled with accessories
      expect(suggestions.to_elevate).toHaveLength(2);
      expect(suggestions.to_elevate.some(b => b.recommend.category === 'shoes')).toBe(false);
      expect(removedCategories).toContain('shoes');
    });

    it('handles nasty edge case: scanCategory=shoes + preferAddOns + single add-on', () => {
      const { suggestions } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Add shoes', recommend: { type: 'consider_adding', category: 'shoes', attributes: [] } },
            { text: 'Add outerwear', recommend: { type: 'consider_adding', category: 'outerwear', attributes: [] } },
          ],
        },
        [], // solo mode
        'shoes', // scanCategory (removes shoes)
        true, // preferAddOnCategories
        ['outerwear'] // single add-on category
      );

      // Expected:
      // 1. shoes removed (scan filter)
      // 2. outerwear kept (add-on category)
      // 3. If only one add-on category remains, bullet2 uses core-shortlist
      //    → tops (since shoes is blocked by scanCategory)
      // 4. Final: ['outerwear', 'tops'], no duplicates
      expect(suggestions.to_elevate).toHaveLength(2);
      expect(suggestions.to_elevate[0].recommend.category).toBe('outerwear');
      expect(suggestions.to_elevate[1].recommend.category).toBe('tops');
    });

    it('solo mode with diversity filter works correctly', () => {
      const { suggestions } = validateAndRepairSuggestions(
        {
          why_it_works: [
            { text: 'Test', mentions: [] },
            { text: 'Test', mentions: [] },
          ],
          to_elevate: [
            { text: 'Add accessories', recommend: { type: 'consider_adding', category: 'accessories', attributes: [] } },
            { text: 'Add outerwear', recommend: { type: 'consider_adding', category: 'outerwear', attributes: [] } },
          ],
        },
        [], // solo mode
        null, // no scan category filter
        true, // preferAddOnCategories
        ['accessories', 'outerwear'] // 2+ add-on categories
      );

      // Should keep both add-on categories, no duplicates
      expect(suggestions.to_elevate).toHaveLength(2);
      expect(suggestions.to_elevate[0].recommend.category).toBe('accessories');
      expect(suggestions.to_elevate[1].recommend.category).toBe('outerwear');
    });
  });
});
