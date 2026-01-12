/**
 * Schema Validation Test Suite
 *
 * Tests for the hybrid schema validation helpers.
 * Covers:
 * - Volume validation
 * - Category-scoped shape validation
 * - Category-scoped length validation
 * - Mapping functions (volumeToFitPreference, shapeToVolumeHint)
 * - Full library item validation
 */

import {
  VOLUME_VALUES,
  TIER_VALUES,
  TIER_RANK_RANGES,
  LENGTH_BY_CATEGORY,
  SHAPE_BY_CATEGORY,
  isValidVolume,
  isValidLength,
  isValidShape,
  isValidTier,
  isRankInTierRange,
  getTierForRank,
  categoryHasLength,
  categoryHasShape,
  volumeToFitPreference,
  shapeToVolumeHint,
  safeVolume,
  safeLength,
  safeShape,
  validateLibraryItem,
} from '../schema-validation';
import type { Category, Volume, Shape, Length, Tier } from '../types';

describe('Schema Validation', () => {
  // ─────────────────────────────────────────────
  // VOLUME VALIDATION
  // ─────────────────────────────────────────────
  describe('isValidVolume', () => {
    it('should accept valid volume values', () => {
      expect(isValidVolume('fitted')).toBe(true);
      expect(isValidVolume('regular')).toBe(true);
      expect(isValidVolume('oversized')).toBe(true);
      expect(isValidVolume('unknown')).toBe(true);
    });

    it('should reject invalid volume values', () => {
      expect(isValidVolume('relaxed')).toBe(false);
      expect(isValidVolume('slim')).toBe(false);
      expect(isValidVolume('tight')).toBe(false);
      expect(isValidVolume('')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidVolume(null)).toBe(false);
      expect(isValidVolume(undefined)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // LENGTH VALIDATION (Category-Scoped)
  // ─────────────────────────────────────────────
  describe('isValidLength', () => {
    describe('tops', () => {
      it('should accept valid top lengths', () => {
        expect(isValidLength('tops', 'cropped')).toBe(true);
        expect(isValidLength('tops', 'regular')).toBe(true);
        expect(isValidLength('tops', 'longline')).toBe(true);
      });

      it('should reject invalid top lengths', () => {
        expect(isValidLength('tops', 'mini')).toBe(false);
        expect(isValidLength('tops', 'midi')).toBe(false);
        expect(isValidLength('tops', 'maxi')).toBe(false);
        expect(isValidLength('tops', 'long')).toBe(false);
      });
    });

    describe('outerwear', () => {
      it('should accept valid outerwear lengths', () => {
        expect(isValidLength('outerwear', 'cropped')).toBe(true);
        expect(isValidLength('outerwear', 'regular')).toBe(true);
        expect(isValidLength('outerwear', 'long')).toBe(true);
      });

      it('should reject invalid outerwear lengths', () => {
        expect(isValidLength('outerwear', 'longline')).toBe(false);
        expect(isValidLength('outerwear', 'midi')).toBe(false);
      });
    });

    describe('dresses and skirts', () => {
      it('should accept valid dress/skirt lengths', () => {
        expect(isValidLength('dresses', 'mini')).toBe(true);
        expect(isValidLength('dresses', 'midi')).toBe(true);
        expect(isValidLength('dresses', 'maxi')).toBe(true);
        expect(isValidLength('skirts', 'mini')).toBe(true);
        expect(isValidLength('skirts', 'midi')).toBe(true);
        expect(isValidLength('skirts', 'maxi')).toBe(true);
      });

      it('should reject invalid dress/skirt lengths', () => {
        expect(isValidLength('dresses', 'cropped')).toBe(false);
        expect(isValidLength('dresses', 'regular')).toBe(false);
        expect(isValidLength('skirts', 'longline')).toBe(false);
      });
    });

    describe('categories without length', () => {
      const categoriesWithoutLength: Category[] = ['bottoms', 'shoes', 'bags', 'accessories'];

      it.each(categoriesWithoutLength)('%s should accept null/undefined length', (category) => {
        expect(isValidLength(category, null)).toBe(true);
        expect(isValidLength(category, undefined)).toBe(true);
      });

      it.each(categoriesWithoutLength)('%s should reject any length value', (category) => {
        expect(isValidLength(category, 'regular')).toBe(false);
        expect(isValidLength(category, 'cropped')).toBe(false);
        expect(isValidLength(category, 'midi')).toBe(false);
      });
    });

    it('should accept null/undefined for any category (optional field)', () => {
      expect(isValidLength('tops', null)).toBe(true);
      expect(isValidLength('tops', undefined)).toBe(true);
      expect(isValidLength('dresses', null)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // SHAPE VALIDATION (Category-Scoped)
  // ─────────────────────────────────────────────
  describe('isValidShape', () => {
    describe('bottoms', () => {
      it('should accept valid bottom shapes', () => {
        expect(isValidShape('bottoms', 'skinny')).toBe(true);
        expect(isValidShape('bottoms', 'straight')).toBe(true);
        expect(isValidShape('bottoms', 'wide')).toBe(true);
        expect(isValidShape('bottoms', 'tapered')).toBe(true);
        expect(isValidShape('bottoms', 'flare')).toBe(true);
        expect(isValidShape('bottoms', 'cargo')).toBe(true);
      });

      it('should reject invalid bottom shapes', () => {
        expect(isValidShape('bottoms', 'pencil')).toBe(false);
        expect(isValidShape('bottoms', 'a_line')).toBe(false);
        expect(isValidShape('bottoms', 'chunky')).toBe(false);
      });
    });

    describe('skirts', () => {
      it('should accept valid skirt shapes', () => {
        expect(isValidShape('skirts', 'pencil')).toBe(true);
        expect(isValidShape('skirts', 'a_line')).toBe(true);
        expect(isValidShape('skirts', 'pleated')).toBe(true);
      });

      it('should reject invalid skirt shapes', () => {
        expect(isValidShape('skirts', 'straight')).toBe(false);
        expect(isValidShape('skirts', 'skinny')).toBe(false);
        expect(isValidShape('skirts', 'wrap')).toBe(false);
      });
    });

    describe('dresses', () => {
      it('should accept valid dress shapes', () => {
        expect(isValidShape('dresses', 'slip')).toBe(true);
        expect(isValidShape('dresses', 'wrap')).toBe(true);
        expect(isValidShape('dresses', 'shirt')).toBe(true);
        expect(isValidShape('dresses', 'bodycon')).toBe(true);
        expect(isValidShape('dresses', 'fit_flare')).toBe(true);
      });

      it('should reject invalid dress shapes', () => {
        expect(isValidShape('dresses', 'pencil')).toBe(false);
        expect(isValidShape('dresses', 'straight')).toBe(false);
      });
    });

    describe('shoes', () => {
      it('should accept valid shoe shapes', () => {
        expect(isValidShape('shoes', 'low_profile')).toBe(true);
        expect(isValidShape('shoes', 'chunky')).toBe(true);
        expect(isValidShape('shoes', 'heeled')).toBe(true);
        expect(isValidShape('shoes', 'boot')).toBe(true);
      });

      it('should reject invalid shoe shapes', () => {
        expect(isValidShape('shoes', 'skinny')).toBe(false);
        expect(isValidShape('shoes', 'wide')).toBe(false);
        expect(isValidShape('shoes', 'minimal')).toBe(false);
      });
    });

    describe('categories without shape', () => {
      const categoriesWithoutShape: Category[] = ['tops', 'outerwear', 'bags', 'accessories'];

      it.each(categoriesWithoutShape)('%s should accept null/undefined shape', (category) => {
        expect(isValidShape(category, null)).toBe(true);
        expect(isValidShape(category, undefined)).toBe(true);
      });

      it.each(categoriesWithoutShape)('%s should reject any shape value', (category) => {
        expect(isValidShape(category, 'fitted')).toBe(false);
        expect(isValidShape(category, 'straight')).toBe(false);
      });
    });
  });

  // ─────────────────────────────────────────────
  // CATEGORY HELPERS
  // ─────────────────────────────────────────────
  describe('categoryHasLength', () => {
    it('should return true for categories with length', () => {
      expect(categoryHasLength('tops')).toBe(true);
      expect(categoryHasLength('outerwear')).toBe(true);
      expect(categoryHasLength('dresses')).toBe(true);
      expect(categoryHasLength('skirts')).toBe(true);
    });

    it('should return false for categories without length', () => {
      expect(categoryHasLength('bottoms')).toBe(false);
      expect(categoryHasLength('shoes')).toBe(false);
      expect(categoryHasLength('bags')).toBe(false);
      expect(categoryHasLength('accessories')).toBe(false);
    });
  });

  describe('categoryHasShape', () => {
    it('should return true for categories with shape', () => {
      expect(categoryHasShape('bottoms')).toBe(true);
      expect(categoryHasShape('skirts')).toBe(true);
      expect(categoryHasShape('dresses')).toBe(true);
      expect(categoryHasShape('shoes')).toBe(true);
    });

    it('should return false for categories without shape', () => {
      expect(categoryHasShape('tops')).toBe(false);
      expect(categoryHasShape('outerwear')).toBe(false);
      expect(categoryHasShape('bags')).toBe(false);
      expect(categoryHasShape('accessories')).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // MAPPING FUNCTIONS
  // ─────────────────────────────────────────────
  describe('volumeToFitPreference', () => {
    it('should map volume to fit preference', () => {
      expect(volumeToFitPreference('fitted')).toBe('slim');
      expect(volumeToFitPreference('regular')).toBe('regular');
      expect(volumeToFitPreference('oversized')).toBe('oversized');
    });

    it('should return null for unknown volume', () => {
      expect(volumeToFitPreference('unknown')).toBe(null);
    });
  });

  describe('shapeToVolumeHint', () => {
    it('should infer fitted from skinny/bodycon', () => {
      expect(shapeToVolumeHint('skinny')).toBe('fitted');
      expect(shapeToVolumeHint('bodycon')).toBe('fitted');
      expect(shapeToVolumeHint('fit_flare')).toBe('fitted');
    });

    it('should infer oversized from wide', () => {
      expect(shapeToVolumeHint('wide')).toBe('oversized');
    });

    it('should return null when no strong inference possible', () => {
      expect(shapeToVolumeHint('straight')).toBe(null);
      expect(shapeToVolumeHint('tapered')).toBe(null);
      expect(shapeToVolumeHint('flare')).toBe(null);
      expect(shapeToVolumeHint('pencil')).toBe(null);
      expect(shapeToVolumeHint('a_line')).toBe(null);
      expect(shapeToVolumeHint('pleated')).toBe(null);
      expect(shapeToVolumeHint('slip')).toBe(null);
      expect(shapeToVolumeHint('wrap')).toBe(null);
      expect(shapeToVolumeHint('shirt')).toBe(null);
      expect(shapeToVolumeHint('low_profile')).toBe(null);
      expect(shapeToVolumeHint('chunky')).toBe(null);
      expect(shapeToVolumeHint('heeled')).toBe(null);
      expect(shapeToVolumeHint('boot')).toBe(null);
      expect(shapeToVolumeHint('cargo')).toBe(null);
    });
  });

  // ─────────────────────────────────────────────
  // SAFE GETTERS
  // ─────────────────────────────────────────────
  describe('safeVolume', () => {
    it('should return valid volume as-is', () => {
      expect(safeVolume('fitted')).toBe('fitted');
      expect(safeVolume('regular')).toBe('regular');
      expect(safeVolume('oversized')).toBe('oversized');
      expect(safeVolume('unknown')).toBe('unknown');
    });

    it('should fallback to unknown for invalid values', () => {
      expect(safeVolume('relaxed')).toBe('unknown');
      expect(safeVolume('slim')).toBe('unknown');
      expect(safeVolume(null)).toBe('unknown');
      expect(safeVolume(undefined)).toBe('unknown');
      expect(safeVolume('')).toBe('unknown');
    });
  });

  describe('safeLength', () => {
    it('should return valid length for category', () => {
      expect(safeLength('tops', 'cropped')).toBe('cropped');
      expect(safeLength('dresses', 'midi')).toBe('midi');
      expect(safeLength('outerwear', 'long')).toBe('long');
    });

    it('should return null for invalid length', () => {
      expect(safeLength('tops', 'midi')).toBe(null);
      expect(safeLength('dresses', 'cropped')).toBe(null);
      expect(safeLength('bottoms', 'regular')).toBe(null);
    });

    it('should return null for null/undefined input', () => {
      expect(safeLength('tops', null)).toBe(null);
      expect(safeLength('tops', undefined)).toBe(null);
    });
  });

  describe('safeShape', () => {
    it('should return valid shape for category', () => {
      expect(safeShape('bottoms', 'straight')).toBe('straight');
      expect(safeShape('dresses', 'wrap')).toBe('wrap');
      expect(safeShape('shoes', 'chunky')).toBe('chunky');
    });

    it('should return null for invalid shape', () => {
      expect(safeShape('bottoms', 'wrap')).toBe(null);
      expect(safeShape('tops', 'straight')).toBe(null);
      expect(safeShape('shoes', 'skinny')).toBe(null);
    });

    it('should return null for null/undefined input', () => {
      expect(safeShape('bottoms', null)).toBe(null);
      expect(safeShape('bottoms', undefined)).toBe(null);
    });
  });

  // ─────────────────────────────────────────────
  // FULL LIBRARY ITEM VALIDATION
  // ─────────────────────────────────────────────
  describe('validateLibraryItem', () => {
    describe('valid items', () => {
      it('should validate a complete top', () => {
        const result = validateLibraryItem({
          category: 'tops',
          volume: 'fitted',
          length: 'regular',
        });
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate a complete bottom', () => {
        const result = validateLibraryItem({
          category: 'bottoms',
          volume: 'regular',
          shape: 'straight',
        });
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate a complete dress', () => {
        const result = validateLibraryItem({
          category: 'dresses',
          volume: 'fitted',
          shape: 'bodycon',
          length: 'midi',
        });
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate shoes with shape only', () => {
        const result = validateLibraryItem({
          category: 'shoes',
          shape: 'chunky',
        });
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should validate item with only category (all optional fields omitted)', () => {
        const result = validateLibraryItem({
          category: 'accessories',
        });
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('invalid items', () => {
      it('should reject invalid volume', () => {
        const result = validateLibraryItem({
          category: 'tops',
          volume: 'relaxed' as any,
        });
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Invalid volume');
      });

      it('should reject shape for category without shape support', () => {
        const result = validateLibraryItem({
          category: 'tops',
          shape: 'straight' as any,
        });
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('does not support shape');
      });

      it('should reject length for category without length support', () => {
        const result = validateLibraryItem({
          category: 'shoes',
          length: 'regular' as any,
        });
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('does not support length');
      });

      it('should reject wrong shape for category', () => {
        const result = validateLibraryItem({
          category: 'bottoms',
          shape: 'wrap' as any,
        });
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Invalid shape');
        expect(result.errors[0]).toContain('bottoms');
      });

      it('should reject wrong length for category', () => {
        const result = validateLibraryItem({
          category: 'tops',
          length: 'midi' as any,
        });
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Invalid length');
        expect(result.errors[0]).toContain('tops');
      });

      it('should collect multiple errors', () => {
        const result = validateLibraryItem({
          category: 'tops',
          volume: 'relaxed' as any,
          shape: 'straight' as any,
          length: 'midi' as any,
        });
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('tier and rank validation', () => {
      it('should validate valid tier', () => {
        const result = validateLibraryItem({
          category: 'tops',
          tier: 'core',
          rank: 10,
        });
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject invalid tier', () => {
        const result = validateLibraryItem({
          category: 'tops',
          tier: 'premium' as any,
        });
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain('Invalid tier');
      });

      it('should reject mismatched tier and rank', () => {
        const result = validateLibraryItem({
          category: 'tops',
          tier: 'core', // core is 10-29
          rank: 50, // but rank is 50 (staple range)
        });
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain('out of range');
        expect(result.errors[0]).toContain('staple'); // expected tier
      });

      it('should accept tier without rank', () => {
        const result = validateLibraryItem({
          category: 'tops',
          tier: 'style',
        });
        expect(result.isValid).toBe(true);
      });

      it('should accept rank without tier', () => {
        const result = validateLibraryItem({
          category: 'tops',
          rank: 50,
        });
        expect(result.isValid).toBe(true);
      });
    });
  });

  // ─────────────────────────────────────────────
  // TIER VALIDATION
  // ─────────────────────────────────────────────
  describe('isValidTier', () => {
    it('should accept valid tier values', () => {
      expect(isValidTier('core')).toBe(true);
      expect(isValidTier('staple')).toBe(true);
      expect(isValidTier('style')).toBe(true);
      expect(isValidTier('statement')).toBe(true);
    });

    it('should reject invalid tier values', () => {
      expect(isValidTier('premium')).toBe(false);
      expect(isValidTier('basic')).toBe(false);
      expect(isValidTier('')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidTier(null)).toBe(false);
      expect(isValidTier(undefined)).toBe(false);
    });
  });

  describe('isRankInTierRange', () => {
    it('should validate core tier ranks (10-29)', () => {
      expect(isRankInTierRange('core', 10)).toBe(true);
      expect(isRankInTierRange('core', 20)).toBe(true);
      expect(isRankInTierRange('core', 29)).toBe(true);
      expect(isRankInTierRange('core', 30)).toBe(false);
      expect(isRankInTierRange('core', 9)).toBe(false);
    });

    it('should validate staple tier ranks (30-59)', () => {
      expect(isRankInTierRange('staple', 30)).toBe(true);
      expect(isRankInTierRange('staple', 50)).toBe(true);
      expect(isRankInTierRange('staple', 59)).toBe(true);
      expect(isRankInTierRange('staple', 29)).toBe(false);
      expect(isRankInTierRange('staple', 60)).toBe(false);
    });

    it('should validate style tier ranks (60-89)', () => {
      expect(isRankInTierRange('style', 60)).toBe(true);
      expect(isRankInTierRange('style', 70)).toBe(true);
      expect(isRankInTierRange('style', 89)).toBe(true);
      expect(isRankInTierRange('style', 59)).toBe(false);
      expect(isRankInTierRange('style', 90)).toBe(false);
    });

    it('should validate statement tier ranks (90+)', () => {
      expect(isRankInTierRange('statement', 90)).toBe(true);
      expect(isRankInTierRange('statement', 100)).toBe(true);
      expect(isRankInTierRange('statement', 500)).toBe(true);
      expect(isRankInTierRange('statement', 89)).toBe(false);
    });
  });

  describe('getTierForRank', () => {
    it('should return core for ranks 10-29', () => {
      expect(getTierForRank(10)).toBe('core');
      expect(getTierForRank(20)).toBe('core');
      expect(getTierForRank(29)).toBe('core');
    });

    it('should return staple for ranks 30-59', () => {
      expect(getTierForRank(30)).toBe('staple');
      expect(getTierForRank(45)).toBe('staple');
      expect(getTierForRank(59)).toBe('staple');
    });

    it('should return style for ranks 60-89', () => {
      expect(getTierForRank(60)).toBe('style');
      expect(getTierForRank(70)).toBe('style');
      expect(getTierForRank(89)).toBe('style');
    });

    it('should return statement for ranks 90+', () => {
      expect(getTierForRank(90)).toBe('statement');
      expect(getTierForRank(100)).toBe('statement');
      expect(getTierForRank(999)).toBe('statement');
    });

    it('should return statement for edge case ranks below 10', () => {
      // Edge case: ranks below 10 default to statement (no tier defined)
      expect(getTierForRank(5)).toBe('statement');
    });
  });

  // ─────────────────────────────────────────────
  // LOOKUP TABLE INTEGRITY
  // ─────────────────────────────────────────────
  describe('Lookup table integrity', () => {
    it('VOLUME_VALUES should contain all Volume type values', () => {
      expect(VOLUME_VALUES).toContain('fitted');
      expect(VOLUME_VALUES).toContain('regular');
      expect(VOLUME_VALUES).toContain('oversized');
      expect(VOLUME_VALUES).toContain('unknown');
      expect(VOLUME_VALUES).toHaveLength(4);
    });

    it('TIER_VALUES should contain all Tier type values', () => {
      expect(TIER_VALUES).toContain('core');
      expect(TIER_VALUES).toContain('staple');
      expect(TIER_VALUES).toContain('style');
      expect(TIER_VALUES).toContain('statement');
      expect(TIER_VALUES).toHaveLength(4);
    });

    it('TIER_RANK_RANGES should define correct ranges', () => {
      expect(TIER_RANK_RANGES.core).toEqual({ min: 10, max: 29 });
      expect(TIER_RANK_RANGES.staple).toEqual({ min: 30, max: 59 });
      expect(TIER_RANK_RANGES.style).toEqual({ min: 60, max: 89 });
      expect(TIER_RANK_RANGES.statement).toEqual({ min: 90, max: 999 });
    });

    it('TIER_RANK_RANGES should have non-overlapping ranges', () => {
      const tiers: Tier[] = ['core', 'staple', 'style', 'statement'];
      for (let i = 0; i < tiers.length - 1; i++) {
        const currentMax = TIER_RANK_RANGES[tiers[i]].max;
        const nextMin = TIER_RANK_RANGES[tiers[i + 1]].min;
        expect(currentMax).toBeLessThan(nextMin);
      }
    });

    it('LENGTH_BY_CATEGORY should cover all categories', () => {
      const categories: Category[] = ['tops', 'bottoms', 'outerwear', 'shoes', 'bags', 'accessories', 'dresses', 'skirts'];
      categories.forEach(cat => {
        expect(LENGTH_BY_CATEGORY[cat]).toBeDefined();
        expect(Array.isArray(LENGTH_BY_CATEGORY[cat])).toBe(true);
      });
    });

    it('SHAPE_BY_CATEGORY should cover all categories', () => {
      const categories: Category[] = ['tops', 'bottoms', 'outerwear', 'shoes', 'bags', 'accessories', 'dresses', 'skirts'];
      categories.forEach(cat => {
        expect(SHAPE_BY_CATEGORY[cat]).toBeDefined();
        expect(Array.isArray(SHAPE_BY_CATEGORY[cat])).toBe(true);
      });
    });

    it('tops/outerwear should have no shape values (future expansion)', () => {
      expect(SHAPE_BY_CATEGORY['tops']).toHaveLength(0);
      expect(SHAPE_BY_CATEGORY['outerwear']).toHaveLength(0);
    });

    it('bottoms/shoes should have no length values', () => {
      expect(LENGTH_BY_CATEGORY['bottoms']).toHaveLength(0);
      expect(LENGTH_BY_CATEGORY['shoes']).toHaveLength(0);
    });
  });
});
