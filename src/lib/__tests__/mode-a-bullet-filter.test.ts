/**
 * Mode A Bullet Filter Test Suite
 * 
 * Tests for filtering Mode A suggestion bullets based on wardrobe state.
 * Covers:
 * - Filtering out bullets with target: null when wardrobe is empty
 * - Keeping all bullets when wardrobe has items
 * - Edge cases (empty arrays, all null targets, etc.)
 */

import { filterModeABullets } from '../mode-a-bullet-filter';
import type { SuggestionBullet, SuggestionTargetCategory } from '../confidence-engine/types';

// Helper to create a mock bullet
function createBullet(
  text: string,
  target: SuggestionTargetCategory
): SuggestionBullet {
  return { key: `TEST_${text.toUpperCase().replace(/\s+/g, '_')}`, text, target };
}

describe('filterModeABullets', () => {
  describe('when wardrobeCount === 0 (empty wardrobe)', () => {
    it('should filter out bullets with target: null', () => {
      const bullets: SuggestionBullet[] = [
        createBullet('Dark or structured bottoms', 'bottoms'),
        createBullet('Clean, simple outfit pieces', null),
        createBullet('Neutral everyday shoes', 'shoes'),
        createBullet('Simple outfit pieces', null),
      ];

      const result = filterModeABullets(bullets, 0);

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Dark or structured bottoms');
      expect(result[0].target).toBe('bottoms');
      expect(result[1].text).toBe('Neutral everyday shoes');
      expect(result[1].target).toBe('shoes');
    });

    it('should return empty array if all bullets have target: null', () => {
      const bullets: SuggestionBullet[] = [
        createBullet('Keep the other pieces simple', null),
        createBullet('Choose neutral colors', null),
        createBullet('Avoid competing textures', null),
      ];

      const result = filterModeABullets(bullets, 0);

      expect(result).toHaveLength(0);
    });

    it('should return all bullets if none have target: null', () => {
      const bullets: SuggestionBullet[] = [
        createBullet('Dark or structured bottoms', 'bottoms'),
        createBullet('Neutral everyday shoes', 'shoes'),
        createBullet('Light layer for balance', 'outerwear'),
      ];

      const result = filterModeABullets(bullets, 0);

      expect(result).toHaveLength(3);
      expect(result).toEqual(bullets);
    });

    it('should handle empty input array', () => {
      const bullets: SuggestionBullet[] = [];

      const result = filterModeABullets(bullets, 0);

      expect(result).toHaveLength(0);
    });

    it('should handle mixed bullets with various targets', () => {
      const bullets: SuggestionBullet[] = [
        createBullet('Simple top in a neutral tone', 'tops'),
        createBullet('Clean, simple outfit pieces', null),
        createBullet('Everyday shoes that don\'t compete', 'shoes'),
        createBullet('Optional outer layer for structure', 'outerwear'),
        createBullet('Simple outfit pieces', null),
        createBullet('Minimal accessories', 'accessories'),
      ];

      const result = filterModeABullets(bullets, 0);

      expect(result).toHaveLength(4);
      expect(result.map(b => b.text)).toEqual([
        'Simple top in a neutral tone',
        'Everyday shoes that don\'t compete',
        'Optional outer layer for structure',
        'Minimal accessories',
      ]);
    });
  });

  describe('when wardrobeCount > 0 (wardrobe has items)', () => {
    it('should return all bullets unchanged when wardrobeCount > 0', () => {
      const bullets: SuggestionBullet[] = [
        createBullet('Dark or structured bottoms', 'bottoms'),
        createBullet('Clean, simple outfit pieces', null),
        createBullet('Neutral everyday shoes', 'shoes'),
        createBullet('Simple outfit pieces', null),
      ];

      const result = filterModeABullets(bullets, 1);

      expect(result).toHaveLength(4);
      expect(result).toEqual(bullets);
    });

    it('should return all bullets unchanged even if all have target: null', () => {
      const bullets: SuggestionBullet[] = [
        createBullet('Keep the other pieces simple', null),
        createBullet('Choose neutral colors', null),
        createBullet('Avoid competing textures', null),
      ];

      const result = filterModeABullets(bullets, 5);

      expect(result).toHaveLength(3);
      expect(result).toEqual(bullets);
    });

    it('should handle empty input array', () => {
      const bullets: SuggestionBullet[] = [];

      const result = filterModeABullets(bullets, 10);

      expect(result).toHaveLength(0);
    });

    it('should work with large wardrobe counts', () => {
      const bullets: SuggestionBullet[] = [
        createBullet('Dark or structured bottoms', 'bottoms'),
        createBullet('Clean, simple outfit pieces', null),
      ];

      const result = filterModeABullets(bullets, 100);

      expect(result).toHaveLength(2);
      expect(result).toEqual(bullets);
    });
  });

  describe('edge cases', () => {
    it('should handle single bullet with target', () => {
      const bullets: SuggestionBullet[] = [
        createBullet('Simple shoes', 'shoes'),
      ];

      const result = filterModeABullets(bullets, 0);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(bullets[0]);
    });

    it('should handle single bullet with null target when wardrobe is empty', () => {
      const bullets: SuggestionBullet[] = [
        createBullet('Keep the other pieces simple', null),
      ];

      const result = filterModeABullets(bullets, 0);

      expect(result).toHaveLength(0);
    });

    it('should preserve bullet order', () => {
      const bullets: SuggestionBullet[] = [
        createBullet('First bullet', 'tops'),
        createBullet('Second bullet', null),
        createBullet('Third bullet', 'bottoms'),
        createBullet('Fourth bullet', null),
        createBullet('Fifth bullet', 'shoes'),
      ];

      const result = filterModeABullets(bullets, 0);

      expect(result).toHaveLength(3);
      expect(result[0].text).toBe('First bullet');
      expect(result[1].text).toBe('Third bullet');
      expect(result[2].text).toBe('Fifth bullet');
    });
  });

  describe('with matchedCategories (filtering already-matched categories)', () => {
    it('should filter out bullets for categories that already have matches', () => {
      // User scans a skirt, has a top in wardrobe that matches
      const bullets: SuggestionBullet[] = [
        createBullet('A soft blouse or fitted top', 'tops'),
        createBullet('Ballet flats or strappy sandals', 'shoes'),
        createBullet('A soft cardigan or light jacket', 'outerwear'),
      ];

      const result = filterModeABullets(bullets, 1, ['tops']);

      expect(result).toHaveLength(2);
      expect(result.map(b => b.target)).toEqual(['shoes', 'outerwear']);
    });

    it('should keep bullets with null target even when matchedCategories provided', () => {
      const bullets: SuggestionBullet[] = [
        createBullet('A soft blouse or fitted top', 'tops'),
        createBullet('Keep it simple', null),
        createBullet('Ballet flats or strappy sandals', 'shoes'),
      ];

      const result = filterModeABullets(bullets, 1, ['tops']);

      expect(result).toHaveLength(2);
      expect(result[0].target).toBeNull();
      expect(result[1].target).toBe('shoes');
    });

    it('should filter out multiple matched categories', () => {
      const bullets: SuggestionBullet[] = [
        createBullet('A soft blouse or fitted top', 'tops'),
        createBullet('Dark structured bottoms', 'bottoms'),
        createBullet('Ballet flats or strappy sandals', 'shoes'),
        createBullet('A soft cardigan or light jacket', 'outerwear'),
      ];

      const result = filterModeABullets(bullets, 3, ['tops', 'bottoms']);

      expect(result).toHaveLength(2);
      expect(result.map(b => b.target)).toEqual(['shoes', 'outerwear']);
    });

    it('should return empty array if all bullets are for matched categories', () => {
      const bullets: SuggestionBullet[] = [
        createBullet('A soft blouse or fitted top', 'tops'),
        createBullet('Dark structured bottoms', 'bottoms'),
      ];

      const result = filterModeABullets(bullets, 2, ['tops', 'bottoms']);

      expect(result).toHaveLength(0);
    });

    it('should not filter when matchedCategories is empty', () => {
      const bullets: SuggestionBullet[] = [
        createBullet('A soft blouse or fitted top', 'tops'),
        createBullet('Ballet flats or strappy sandals', 'shoes'),
      ];

      const result = filterModeABullets(bullets, 1, []);

      expect(result).toHaveLength(2);
      expect(result).toEqual(bullets);
    });

    it('should not filter when matchedCategories is undefined', () => {
      const bullets: SuggestionBullet[] = [
        createBullet('A soft blouse or fitted top', 'tops'),
        createBullet('Ballet flats or strappy sandals', 'shoes'),
      ];

      const result = filterModeABullets(bullets, 1, undefined);

      expect(result).toHaveLength(2);
      expect(result).toEqual(bullets);
    });

    it('should handle skirts category scenario (user scans skirt, has top match)', () => {
      // Exact scenario from user bug report
      const skirtBullets: SuggestionBullet[] = [
        createBullet('A soft blouse or fitted top', 'tops'),
        createBullet('Ballet flats or strappy sandals', 'shoes'),
        createBullet('A soft cardigan or light jacket', 'outerwear'),
      ];

      // User has 1 top (black satin halter) that matches the skirt
      const result = filterModeABullets(skirtBullets, 1, ['tops']);

      // Should NOT suggest tops (already have), but SHOULD suggest shoes and outerwear
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Ballet flats or strappy sandals');
      expect(result[0].target).toBe('shoes');
      expect(result[1].text).toBe('A soft cardigan or light jacket');
      expect(result[1].target).toBe('outerwear');
    });
  });
});

