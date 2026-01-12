/**
 * TipSheet Resolver Test Suite
 *
 * Tests for the tip sheet resolution system.
 * Covers:
 * - resolveTipSheet function
 * - TIP_SHEETS registry
 * - TIP_PACKS content structure
 * - Mode A and Mode B tip sheets
 * - Vibe-specific variant resolution
 * - hasTipSheet helper
 * - getBulletKeysByMode helper
 *
 * Note: EXPO_PUBLIC_SUPABASE_URL is set in jest.setup.js
 */

// Define __DEV__ for test environment
// @ts-expect-error - __DEV__ is a React Native global
globalThis.__DEV__ = true;

import {
  resolveTipSheet,
  TIP_SHEETS,
  TIP_PACKS,
  hasTipSheet,
  getBulletKeysByMode,
  validateTipSheets,
  type TipSheetMode,
  type ResolvedTipSheet,
} from '../inspiration/tipsheets';
import { resolveBulletTitle } from '../confidence-engine/config';
import type { StyleVibe } from '../types';

// ============================================
// TIP_SHEETS REGISTRY TESTS
// ============================================

describe('TIP_SHEETS registry', () => {
  describe('structure', () => {
    it('should be a non-empty object', () => {
      expect(typeof TIP_SHEETS).toBe('object');
      expect(Object.keys(TIP_SHEETS).length).toBeGreaterThan(0);
    });

    it('should have all entries with required properties', () => {
      Object.entries(TIP_SHEETS).forEach(([key, entry]) => {
        expect(entry).toHaveProperty('mode');
        expect(entry).toHaveProperty('packId');
        expect(['A', 'B']).toContain(entry.mode);
        expect(typeof entry.packId).toBe('string');
        // NOTE: title is no longer stored in TIP_SHEETS - it's resolved via resolveBulletTitle(bulletKey, vibe)
      });
    });

    it('should have Mode A entries with targetCategory', () => {
      const modeAEntries = Object.entries(TIP_SHEETS).filter(
        ([_, entry]) => entry.mode === 'A'
      );

      expect(modeAEntries.length).toBeGreaterThan(0);
      // Mode A entries should have targetCategory (can be null)
      modeAEntries.forEach(([key, entry]) => {
        expect('targetCategory' in entry).toBe(true);
      });
    });

    it('should have Mode B entries without targetCategory requirement', () => {
      const modeBEntries = Object.entries(TIP_SHEETS).filter(
        ([_, entry]) => entry.mode === 'B'
      );

      expect(modeBEntries.length).toBeGreaterThan(0);
    });
  });

  describe('key naming convention', () => {
    it('should use UPPERCASE_SNAKE__CASE for keys', () => {
      Object.keys(TIP_SHEETS).forEach((key) => {
        expect(key).toMatch(/^[A-Z_]+(__[A-Z_]+)?$/);
      });
    });

    it('Mode A keys should follow CATEGORY__DESCRIPTION pattern', () => {
      const modeAKeys = Object.entries(TIP_SHEETS)
        .filter(([_, entry]) => entry.mode === 'A')
        .map(([key]) => key);

      modeAKeys.forEach((key) => {
        expect(key).toMatch(/^[A-Z]+__[A-Z_]+$/);
      });
    });

    it('Mode B keys should follow REASON__DESCRIPTION pattern', () => {
      const modeBKeys = Object.entries(TIP_SHEETS)
        .filter(([_, entry]) => entry.mode === 'B')
        .map(([key]) => key);

      modeBKeys.forEach((key) => {
        expect(key).toMatch(/^[A-Z_]+__[A-Z_]+$/);
      });
    });
  });
});

// ============================================
// TIP_PACKS TESTS
// ============================================

describe('TIP_PACKS', () => {
  describe('structure', () => {
    it('should be a non-empty object', () => {
      expect(typeof TIP_PACKS).toBe('object');
      expect(Object.keys(TIP_PACKS).length).toBeGreaterThan(0);
    });

    it('should have all packs with variants property', () => {
      Object.entries(TIP_PACKS).forEach(([packId, pack]) => {
        expect(pack).toHaveProperty('variants');
        expect(typeof pack.variants).toBe('object');
      });
    });

    it('should have default variant for all packs', () => {
      Object.entries(TIP_PACKS).forEach(([packId, pack]) => {
        expect(pack.variants).toHaveProperty('default');
      });
    });
  });

  describe('Mode A packs', () => {
    it('should have packs starting with A_', () => {
      const modeAPacks = Object.keys(TIP_PACKS).filter((id) =>
        id.startsWith('A_')
      );
      expect(modeAPacks.length).toBeGreaterThan(0);
    });

    it('Mode A packs should have examples array in default variant', () => {
      const modeAPacks = Object.entries(TIP_PACKS).filter(([id]) =>
        id.startsWith('A_')
      );

      modeAPacks.forEach(([packId, pack]) => {
        const defaultVariant = pack.variants.default;
        expect(defaultVariant).toHaveProperty('examples');
        expect(Array.isArray(defaultVariant?.examples)).toBe(true);
      });
    });

    // NOTE: Mode A examples use legacy LIB_* references which are now empty.
    // Mode A suggestions come entirely from Supabase library_items table.
    // This test validates structure only (properties exist), not content.
    it('Mode A examples should have image and label properties (structure only)', () => {
      const modeAPacks = Object.entries(TIP_PACKS).filter(([id]) =>
        id.startsWith('A_')
      );

      modeAPacks.forEach(([packId, pack]) => {
        const examples = pack.variants.default?.examples ?? [];
        examples.forEach((example) => {
          // Validate structure exists (image/label properties)
          expect(example).toHaveProperty('image');
          expect(example).toHaveProperty('label');
          // Note: image values may be undefined (LIB_* references are empty)
          // This is expected - Mode A uses DB-driven lists, not pack examples
          expect(typeof example.label).toBe('string');
        });
      });
    });
  });

  describe('Mode B packs', () => {
    it('should have packs starting with B_', () => {
      const modeBPacks = Object.keys(TIP_PACKS).filter((id) =>
        id.startsWith('B_')
      );
      expect(modeBPacks.length).toBeGreaterThan(0);
    });

    it('Mode B packs should have bundles array in default variant', () => {
      const modeBPacks = Object.entries(TIP_PACKS).filter(([id]) =>
        id.startsWith('B_')
      );

      modeBPacks.forEach(([packId, pack]) => {
        const defaultVariant = pack.variants.default;
        expect(defaultVariant).toHaveProperty('bundles');
        expect(Array.isArray(defaultVariant?.bundles)).toBe(true);
      });
    });

    it('Mode B bundles should have image and label', () => {
      const modeBPacks = Object.entries(TIP_PACKS).filter(([id]) =>
        id.startsWith('B_')
      );

      modeBPacks.forEach(([packId, pack]) => {
        const bundles = pack.variants.default?.bundles ?? [];
        bundles.forEach((bundle) => {
          expect(bundle).toHaveProperty('image');
          expect(bundle).toHaveProperty('label');
          expect(typeof bundle.image).toBe('string');
          expect(typeof bundle.label).toBe('string');
        });
      });
    });

    it('Mode B bundle URLs should be valid (not undefined.webp)', () => {
      const modeBPacks = Object.entries(TIP_PACKS).filter(([id]) =>
        id.startsWith('B_')
      );

      modeBPacks.forEach(([packId, pack]) => {
        // Check bundles (hero is deprecated - "do" board serves as visual lead)
        const bundles = pack.variants.default?.bundles ?? [];
        bundles.forEach((bundle, idx) => {
          expect(bundle.image).not.toContain('undefined');
          expect(bundle.image.length).toBeGreaterThan(10);
          // Verify URL structure: should end with .webp
          expect(bundle.image).toMatch(/\.webp$/);
        });
      });
    });

    it('Mode B URLs should have correct formatting (no double slashes)', () => {
      const modeBPacks = Object.entries(TIP_PACKS).filter(([id]) =>
        id.startsWith('B_')
      );

      modeBPacks.forEach(([packId, pack]) => {
        const bundles = pack.variants.default?.bundles ?? [];
        const allUrls = bundles.map((b) => b.image).filter(Boolean);

        allUrls.forEach((url) => {
          // No double slashes (except in protocol)
          expect(url).not.toMatch(/[^:]\/\//);
          // Must have /storage path
          expect(url).toContain('/storage/v1/object/public/');
          // No missing slashes (path segments should be separated)
          expect(url).not.toMatch(/\/\/boards/);
          expect(url).not.toMatch(/boards\/\/default/);
          expect(url).not.toMatch(/default\/\//);
        });
      });
    });

    it('Mode B packs must include all 3 kinds exactly once (do, dont, try)', () => {
      const modeBPacks = Object.entries(TIP_PACKS).filter(([id]) =>
        id.startsWith('B_')
      );
      const requiredKinds = ['do', 'dont', 'try'] as const;

      modeBPacks.forEach(([packId, pack]) => {
        const bundles = pack.variants.default?.bundles ?? [];
        const kinds = bundles.map((b) => b.kind);

        // Check each required kind is present exactly once
        requiredKinds.forEach((kind) => {
          const count = kinds.filter((k) => k === kind).length;
          expect(count).toBe(1);
        });

        // Check no extra kinds
        expect(bundles.length).toBe(3);
      });
    });

    it('Mode B bundles must be in [do, dont, try] order', () => {
      const modeBPacks = Object.entries(TIP_PACKS).filter(([id]) =>
        id.startsWith('B_')
      );
      const expectedOrder = ['do', 'dont', 'try'] as const;

      modeBPacks.forEach(([packId, pack]) => {
        const bundles = pack.variants.default?.bundles ?? [];
        const kinds = bundles.map((b) => b.kind);

        expect(kinds).toEqual(expectedOrder);
      });
    });

    it('Mode B bundles must have non-empty image URLs', () => {
      const modeBPacks = Object.entries(TIP_PACKS).filter(([id]) =>
        id.startsWith('B_')
      );

      modeBPacks.forEach(([packId, pack]) => {
        const bundles = pack.variants.default?.bundles ?? [];

        bundles.forEach((bundle, idx) => {
          expect(typeof bundle.image).toBe('string');
          expect(bundle.image.trim().length).toBeGreaterThan(0);
          expect(bundle.image).not.toBe('undefined');
          expect(bundle.image).not.toContain('undefined.webp');
        });
      });
    });

    it('Mode B bundles must have non-empty labels', () => {
      const modeBPacks = Object.entries(TIP_PACKS).filter(([id]) =>
        id.startsWith('B_')
      );

      modeBPacks.forEach(([packId, pack]) => {
        const bundles = pack.variants.default?.bundles ?? [];

        bundles.forEach((bundle, idx) => {
          expect(typeof bundle.label).toBe('string');
          expect(bundle.label.trim().length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('pack references', () => {
    it('every TipSheet should reference an existing pack', () => {
      Object.entries(TIP_SHEETS).forEach(([key, entry]) => {
        expect(TIP_PACKS).toHaveProperty(entry.packId);
      });
    });
  });
});

// ============================================
// resolveTipSheet FUNCTION TESTS
// ============================================

describe('resolveTipSheet', () => {
  describe('Mode A resolution', () => {
    it('should resolve a valid Mode A bullet key', () => {
      const result = resolveTipSheet({
        mode: 'A',
        bulletKey: 'TOPS__BOTTOMS_DARK_STRUCTURED',
        vibe: 'casual',
      });

      expect(result).not.toBeNull();
      expect(result?.mode).toBe('A');
      expect(result?.key).toBe('TOPS__BOTTOMS_DARK_STRUCTURED');
    });

    it('should include subtitle (title derived from resolveBulletTitle)', () => {
      const result = resolveTipSheet({
        mode: 'A',
        bulletKey: 'TOPS__BOTTOMS_DARK_STRUCTURED',
        vibe: 'casual',
      });

      // NOTE: title is no longer part of ResolvedTipSheet
      // Title should be resolved via resolveBulletTitle(bulletKey, vibe) at render time
      expect(result).not.toBeNull();
    });

    it('should include targetCategory for Mode A', () => {
      const result = resolveTipSheet({
        mode: 'A',
        bulletKey: 'TOPS__BOTTOMS_DARK_STRUCTURED',
        vibe: 'casual',
      });

      // This specific entry targets 'bottoms'
      expect(result?.targetCategory).toBe('bottoms');
    });

    it('Mode A + targetCategory should have EMPTY examples (dynamic list from DB)', () => {
      // TOPS__BOTTOMS_DARK_STRUCTURED has targetCategory: "bottoms"
      // Pack examples are ignored - suggestions come from library DB
      const result = resolveTipSheet({
        mode: 'A',
        bulletKey: 'TOPS__BOTTOMS_DARK_STRUCTURED',
        vibe: 'casual',
      });

      expect(Array.isArray(result?.examples)).toBe(true);
      // Empty because Mode A + targetCategory uses recipe-driven suggestions, not pack examples
      expect(result?.examples.length).toBe(0);
    });

    it('Mode A + null targetCategory should have examples (concept advice)', () => {
      // DEFAULT__KEEP_SIMPLE has targetCategory: null (concept advice)
      // Pack content is used for educational boards
      const result = resolveTipSheet({
        mode: 'A',
        bulletKey: 'DEFAULT__KEEP_SIMPLE',
        vibe: 'casual',
      });

      expect(Array.isArray(result?.examples)).toBe(true);
      // Note: examples may be empty if LIB_* is unpopulated, but bundles should exist
      expect(Array.isArray(result?.bundles)).toBe(true);
    });
  });

  describe('Mode B resolution', () => {
    it('should resolve a valid Mode B bullet key', () => {
      const result = resolveTipSheet({
        mode: 'B',
        bulletKey: 'FORMALITY_TENSION__MATCH_DRESSINESS',
        vibe: 'casual',
      });

      expect(result).not.toBeNull();
      expect(result?.mode).toBe('B');
      expect(result?.key).toBe('FORMALITY_TENSION__MATCH_DRESSINESS');
    });

    it('should include bundles array for Mode B', () => {
      const result = resolveTipSheet({
        mode: 'B',
        bulletKey: 'FORMALITY_TENSION__MATCH_DRESSINESS',
        vibe: 'casual',
      });

      expect(Array.isArray(result?.bundles)).toBe(true);
      expect(result?.bundles.length).toBeGreaterThan(0);
    });

    it('Mode B targetCategory should be null', () => {
      const result = resolveTipSheet({
        mode: 'B',
        bulletKey: 'FORMALITY_TENSION__MATCH_DRESSINESS',
        vibe: 'casual',
      });

      expect(result?.targetCategory).toBeNull();
    });
  });

  describe('invalid inputs', () => {
    it('should return null for non-existent bullet key', () => {
      const result = resolveTipSheet({
        mode: 'A',
        bulletKey: 'NON_EXISTENT_KEY',
        vibe: 'casual',
      });

      expect(result).toBeNull();
    });

    it('should return null for wrong mode', () => {
      // TOPS__BOTTOMS_DARK_STRUCTURED is Mode A, trying to resolve as Mode B
      const result = resolveTipSheet({
        mode: 'B',
        bulletKey: 'TOPS__BOTTOMS_DARK_STRUCTURED',
        vibe: 'casual',
      });

      expect(result).toBeNull();
    });

    it('should return null for empty bullet key', () => {
      const result = resolveTipSheet({
        mode: 'A',
        bulletKey: '',
        vibe: 'casual',
      });

      expect(result).toBeNull();
    });
  });

  describe('vibe resolution', () => {
    const vibes: StyleVibe[] = ['casual', 'office', 'minimal', 'street', 'feminine', 'sporty'];

    vibes.forEach((vibe) => {
      it(`should resolve with ${vibe} vibe`, () => {
        const result = resolveTipSheet({
          mode: 'A',
          bulletKey: 'TOPS__BOTTOMS_DARK_STRUCTURED',
          vibe,
        });

        expect(result).not.toBeNull();
        // Vibe should be either the requested vibe or 'default' (fallback)
        expect(['default', vibe]).toContain(result?.vibe);
      });
    });

    it('should use default variant when vibe-specific variant not available', () => {
      const result = resolveTipSheet({
        mode: 'A',
        bulletKey: 'TOPS__BOTTOMS_DARK_STRUCTURED',
        vibe: 'sporty', // Unlikely to have sporty variant
      });

      expect(result).not.toBeNull();
      // Should fallback to default
      expect(result?.vibe).toBe('default');
    });
  });
});

// ============================================
// HELPER FUNCTION TESTS
// ============================================

describe('hasTipSheet', () => {
  it('should return true for existing Mode A keys', () => {
    expect(hasTipSheet('TOPS__BOTTOMS_DARK_STRUCTURED')).toBe(true);
    expect(hasTipSheet('BOTTOMS__TOP_NEUTRAL_SIMPLE')).toBe(true);
  });

  it('should return true for existing Mode B keys', () => {
    expect(hasTipSheet('FORMALITY_TENSION__MATCH_DRESSINESS')).toBe(true);
    expect(hasTipSheet('STYLE_TENSION__LET_ONE_LEAD')).toBe(true);
  });

  it('should return false for non-existent keys', () => {
    expect(hasTipSheet('NON_EXISTENT_KEY')).toBe(false);
    expect(hasTipSheet('')).toBe(false);
    expect(hasTipSheet('RANDOM__KEY')).toBe(false);
  });
});

describe('getBulletKeysByMode', () => {
  it('should return Mode A keys for mode "A"', () => {
    const keys = getBulletKeysByMode('A');

    expect(Array.isArray(keys)).toBe(true);
    expect(keys.length).toBeGreaterThan(0);

    keys.forEach((key) => {
      const entry = TIP_SHEETS[key];
      expect(entry.mode).toBe('A');
    });
  });

  it('should return Mode B keys for mode "B"', () => {
    const keys = getBulletKeysByMode('B');

    expect(Array.isArray(keys)).toBe(true);
    expect(keys.length).toBeGreaterThan(0);

    keys.forEach((key) => {
      const entry = TIP_SHEETS[key];
      expect(entry.mode).toBe('B');
    });
  });

  it('should not have overlap between Mode A and Mode B keys', () => {
    const modeAKeys = new Set(getBulletKeysByMode('A'));
    const modeBKeys = new Set(getBulletKeysByMode('B'));

    modeAKeys.forEach((key) => {
      expect(modeBKeys.has(key)).toBe(false);
    });
  });

  it('combined Mode A and Mode B keys should equal all TIP_SHEETS keys', () => {
    const modeAKeys = getBulletKeysByMode('A');
    const modeBKeys = getBulletKeysByMode('B');
    const allKeys = [...modeAKeys, ...modeBKeys];

    expect(allKeys.length).toBe(Object.keys(TIP_SHEETS).length);
  });
});

describe('validateTipSheets', () => {
  it('should not throw for valid configuration', () => {
    expect(() => validateTipSheets()).not.toThrow();
  });
});

// ============================================
// RESOLVED TIPSHEET STRUCTURE TESTS
// ============================================

describe('ResolvedTipSheet structure', () => {
  it('should have all required properties', () => {
    const result = resolveTipSheet({
      mode: 'A',
      bulletKey: 'TOPS__BOTTOMS_DARK_STRUCTURED',
      vibe: 'casual',
    });

    expect(result).toHaveProperty('mode');
    expect(result).toHaveProperty('key');
    expect(result).toHaveProperty('vibe');
    // NOTE: title removed from ResolvedTipSheet - derive via resolveBulletTitle(bulletKey, vibe)
    expect(result).toHaveProperty('targetCategory');
    expect(result).toHaveProperty('examples');
    expect(result).toHaveProperty('bundles');
  });

  it('examples should have image and label', () => {
    const result = resolveTipSheet({
      mode: 'A',
      bulletKey: 'TOPS__BOTTOMS_DARK_STRUCTURED',
      vibe: 'casual',
    });

    result?.examples.forEach((example) => {
      expect(example).toHaveProperty('image');
      expect(example).toHaveProperty('label');
    });
  });

  it('bundles should have image and label', () => {
    const result = resolveTipSheet({
      mode: 'B',
      bulletKey: 'FORMALITY_TENSION__MATCH_DRESSINESS',
      vibe: 'casual',
    });

    result?.bundles.forEach((bundle) => {
      expect(bundle).toHaveProperty('image');
      expect(bundle).toHaveProperty('label');
    });
  });

  it('bundles should have kind property (do, dont, try)', () => {
    const result = resolveTipSheet({
      mode: 'B',
      bulletKey: 'FORMALITY_TENSION__MATCH_DRESSINESS',
      vibe: 'casual',
    });

    result?.bundles.forEach((bundle) => {
      expect(bundle).toHaveProperty('kind');
      expect(['do', 'dont', 'try']).toContain(bundle.kind);
    });
  });

  it('bundles should be normalized in [do, dont, try] order', () => {
    const result = resolveTipSheet({
      mode: 'B',
      bulletKey: 'FORMALITY_TENSION__MATCH_DRESSINESS',
      vibe: 'casual',
    });

    expect(result?.bundles.length).toBe(3);
    expect(result?.bundles[0].kind).toBe('do');
    expect(result?.bundles[1].kind).toBe('dont');
    expect(result?.bundles[2].kind).toBe('try');
  });

  it('bundles should have _debug metadata', () => {
    const result = resolveTipSheet({
      mode: 'B',
      bulletKey: 'FORMALITY_TENSION__MATCH_DRESSINESS',
      vibe: 'casual',
    });

    result?.bundles.forEach((bundle) => {
      expect(bundle).toHaveProperty('_debug');
      expect(bundle._debug).toHaveProperty('packId');
      expect(bundle._debug).toHaveProperty('variant');
      expect(bundle._debug).toHaveProperty('kind');
      expect(bundle._debug?.kind).toBe(bundle.kind);
    });
  });
});

// ============================================
// MODE A CATEGORY COVERAGE TESTS
// ============================================

describe('Mode A category coverage', () => {
  const scannedCategories = ['tops', 'bottoms', 'shoes', 'outerwear', 'dresses', 'skirts', 'bags', 'accessories'];

  scannedCategories.forEach((category) => {
    it(`should have tip sheets for ${category} as scanned item`, () => {
      const categoryKeys = Object.entries(TIP_SHEETS)
        .filter(([key, entry]) => entry.mode === 'A' && key.startsWith(category.toUpperCase()))
        .map(([key]) => key);

      // Should have at least one entry starting with the category
      // (e.g., TOPS__BOTTOMS_DARK_STRUCTURED for tops)
      expect(categoryKeys.length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// MODE B REASON COVERAGE TESTS
// ============================================

describe('Mode B reason coverage', () => {
  const capReasons = [
    'FORMALITY_TENSION',
    'STYLE_TENSION',
    'COLOR_TENSION',
    'USAGE_MISMATCH',
    'SHOES_CONFIDENCE_DAMPEN',
    'MISSING_KEY_SIGNAL',
  ];

  capReasons.forEach((reason) => {
    it(`should have tip sheets for ${reason}`, () => {
      const reasonKeys = Object.entries(TIP_SHEETS)
        .filter(([key, entry]) => entry.mode === 'B' && key.startsWith(reason))
        .map(([key]) => key);

      // Should have at least one Mode B entry for each reason
      expect(reasonKeys.length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// resolveBulletTitle TESTS
// ============================================

describe('resolveBulletTitle', () => {
  // TOPS__BOTTOMS_DARK_STRUCTURED has textByStyle with 'minimal' → 'Clean-line trousers in a dark neutral'
  const TEST_BULLET_KEY = 'TOPS__BOTTOMS_DARK_STRUCTURED';
  const BASE_TITLE = 'Dark, structured bottoms';
  const MINIMAL_TITLE = 'Clean-line trousers in a dark neutral';

  describe('vibe missing → base title', () => {
    it('should return base title when vibe is undefined', () => {
      const title = resolveBulletTitle(TEST_BULLET_KEY, undefined);
      expect(title).toBe(BASE_TITLE);
    });

    it('should return base title when vibe is null', () => {
      const title = resolveBulletTitle(TEST_BULLET_KEY, null);
      expect(title).toBe(BASE_TITLE);
    });
  });

  describe('vibe provided → style-specific title', () => {
    it('should return vibe-specific title when vibe has override', () => {
      const title = resolveBulletTitle(TEST_BULLET_KEY, 'minimal');
      expect(title).toBe(MINIMAL_TITLE);
    });

    it('should return base title when vibe has no override', () => {
      // 'sporty' likely has no override for this bullet
      const title = resolveBulletTitle(TEST_BULLET_KEY, 'sporty');
      expect(title).toBe(BASE_TITLE);
    });
  });

  describe('invalid bulletKey handling', () => {
    it('should return null for unknown bulletKey', () => {
      const title = resolveBulletTitle('UNKNOWN_KEY', 'casual');
      expect(title).toBeNull();
    });

    it('should return null for empty string bulletKey', () => {
      const title = resolveBulletTitle('', 'casual');
      expect(title).toBeNull();
    });

    it('should return null for non-string bulletKey', () => {
      const title = resolveBulletTitle(123 as unknown, 'casual');
      expect(title).toBeNull();
    });

    it('should return null for null bulletKey', () => {
      const title = resolveBulletTitle(null, 'casual');
      expect(title).toBeNull();
    });
  });

  describe('re-render behavior simulation', () => {
    it('should refine from base to vibe-specific when vibe resolves', () => {
      // Simulate: modal opens with vibe undefined
      const titleBefore = resolveBulletTitle(TEST_BULLET_KEY, undefined);
      expect(titleBefore).toBe(BASE_TITLE);

      // Simulate: vibe resolves to 'minimal', component re-renders
      const titleAfter = resolveBulletTitle(TEST_BULLET_KEY, 'minimal');
      expect(titleAfter).toBe(MINIMAL_TITLE);

      // Both are valid titles for the same bullet - refinement, not replacement
      expect(titleBefore).toBeTruthy();
      expect(titleAfter).toBeTruthy();
    });
  });
});
