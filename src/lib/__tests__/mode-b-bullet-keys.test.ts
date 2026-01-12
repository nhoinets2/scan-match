/**
 * Mode B Bullet Keys Test Suite
 *
 * Tests for the structured Mode B bullet system with keys.
 * Covers:
 * - ModeBBulletResolved structure (key + text)
 * - buildModeBBullets returning keys
 * - generateModeBSuggestionsV2 returning structured bullets
 * - Key consistency across vibes
 * - Key mapping to TipSheets
 */

// Define __DEV__ for test environment
// @ts-expect-error - __DEV__ is a React Native global
globalThis.__DEV__ = true;

import {
  buildModeBBullets,
  generateModeBSuggestionsV2,
  generateOutfitModeBSuggestionsV2,
  type CapReason,
  type ModeBBulletResolved,
  type PairEvaluation,
} from '../confidence-engine';
import { hasTipSheet, TIP_SHEETS } from '../inspiration/tipsheets';

// ============================================
// ModeBBulletResolved STRUCTURE TESTS
// ============================================

describe('ModeBBulletResolved structure', () => {
  describe('buildModeBBullets', () => {
    it('should return bullets with key and text properties', () => {
      const reasons: CapReason[] = ['FORMALITY_TENSION'];
      const result = buildModeBBullets(reasons, 'casual');

      expect(result.bullets.length).toBeGreaterThan(0);
      result.bullets.forEach((bullet) => {
        expect(bullet).toHaveProperty('key');
        expect(bullet).toHaveProperty('text');
        expect(typeof bullet.key).toBe('string');
        expect(typeof bullet.text).toBe('string');
        expect(bullet.key.length).toBeGreaterThan(0);
        expect(bullet.text.length).toBeGreaterThan(0);
      });
    });

    it('should return unique keys for different reasons', () => {
      const reasons: CapReason[] = ['FORMALITY_TENSION', 'STYLE_TENSION', 'COLOR_TENSION'];
      const result = buildModeBBullets(reasons, 'casual');

      const keys = result.bullets.map((b) => b.key);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });

    it('should return consistent keys across different vibes', () => {
      const reasons: CapReason[] = ['FORMALITY_TENSION'];

      const casualResult = buildModeBBullets(reasons, 'casual');
      const officeResult = buildModeBBullets(reasons, 'office');
      const streetResult = buildModeBBullets(reasons, 'street');

      // Keys should be the same regardless of vibe
      expect(casualResult.bullets[0].key).toBe(officeResult.bullets[0].key);
      expect(casualResult.bullets[0].key).toBe(streetResult.bullets[0].key);
    });

    it('should vary text but keep same key for different vibes', () => {
      const reasons: CapReason[] = ['FORMALITY_TENSION'];

      const casualResult = buildModeBBullets(reasons, 'casual');
      const officeResult = buildModeBBullets(reasons, 'office');

      // Same key
      expect(casualResult.bullets[0].key).toBe(officeResult.bullets[0].key);

      // Text may differ based on vibe-specific overrides
      // Both should have non-empty text
      expect(casualResult.bullets[0].text.length).toBeGreaterThan(0);
      expect(officeResult.bullets[0].text.length).toBeGreaterThan(0);
    });
  });

  describe('generateModeBSuggestionsV2', () => {
    it('should return ModeBSuggestion with structured bullets', () => {
      const reasons: CapReason[] = ['STYLE_TENSION'];
      const result = generateModeBSuggestionsV2(reasons, 'casual');

      expect(result).toHaveProperty('bullets');
      expect(result).toHaveProperty('reasons_used');
      expect(Array.isArray(result.bullets)).toBe(true);

      result.bullets.forEach((bullet) => {
        expect(bullet).toHaveProperty('key');
        expect(bullet).toHaveProperty('text');
      });
    });

    it('should include reasons_used that match bullets', () => {
      const reasons: CapReason[] = ['FORMALITY_TENSION', 'STYLE_TENSION'];
      const result = generateModeBSuggestionsV2(reasons, 'casual');

      expect(result.reasons_used.length).toBeLessThanOrEqual(result.bullets.length);
      result.reasons_used.forEach((reason) => {
        expect(reasons).toContain(reason);
      });
    });
  });
});

// ============================================
// KEY NAMING CONVENTION TESTS
// ============================================

describe('Mode B bullet key naming convention', () => {
  it('should use REASON__DESCRIPTION format for keys', () => {
    const reasons: CapReason[] = ['FORMALITY_TENSION'];
    const result = buildModeBBullets(reasons, 'casual');

    // Keys should follow REASON__DESCRIPTION pattern
    expect(result.bullets[0].key).toMatch(/^[A-Z_]+__[A-Z_]+$/);
  });

  it('should prefix keys with the reason name', () => {
    const testCases: { reason: CapReason; expectedPrefix: string }[] = [
      { reason: 'FORMALITY_TENSION', expectedPrefix: 'FORMALITY_TENSION__' },
      { reason: 'STYLE_TENSION', expectedPrefix: 'STYLE_TENSION__' },
      { reason: 'COLOR_TENSION', expectedPrefix: 'COLOR_TENSION__' },
      { reason: 'USAGE_MISMATCH', expectedPrefix: 'USAGE_MISMATCH__' },
      { reason: 'SHOES_CONFIDENCE_DAMPEN', expectedPrefix: 'SHOES_CONFIDENCE_DAMPEN__' },
    ];

    testCases.forEach(({ reason, expectedPrefix }) => {
      const result = buildModeBBullets([reason], 'casual');
      if (result.bullets.length > 0 && result.reasonsUsed.includes(reason)) {
        expect(result.bullets[0].key.startsWith(expectedPrefix)).toBe(true);
      }
    });
  });

  it('should use DEFAULT__GENERIC_FALLBACK for empty reasons', () => {
    const result = buildModeBBullets([], 'casual');

    expect(result.bullets.length).toBeGreaterThanOrEqual(1);
    expect(result.bullets[0].key).toBe('DEFAULT__GENERIC_FALLBACK');
  });
});

// ============================================
// TIPSHEET MAPPING TESTS
// ============================================

describe('Mode B bullet keys to TipSheet mapping', () => {
  it('should have corresponding TipSheet entries for all Mode B keys', () => {
    const allReasons: CapReason[] = [
      'FORMALITY_TENSION',
      'STYLE_TENSION',
      'COLOR_TENSION',
      'USAGE_MISMATCH',
      'SHOES_CONFIDENCE_DAMPEN',
      'MISSING_KEY_SIGNAL',
    ];

    // Generate bullets for each reason and check TipSheet mapping
    allReasons.forEach((reason) => {
      const result = buildModeBBullets([reason], 'casual');

      result.bullets.forEach((bullet) => {
        // Skip the fallback key which may not have a TipSheet
        if (bullet.key !== 'DEFAULT__GENERIC_FALLBACK') {
          const tipSheetExists = hasTipSheet(bullet.key);
          expect(tipSheetExists).toBe(true);
        }
      });
    });
  });

  it('should have Mode B TipSheet entries with mode: "B"', () => {
    const modeBKeys = Object.entries(TIP_SHEETS)
      .filter(([_, entry]) => entry.mode === 'B')
      .map(([key]) => key);

    expect(modeBKeys.length).toBeGreaterThan(0);

    modeBKeys.forEach((key) => {
      expect(TIP_SHEETS[key].mode).toBe('B');
    });
  });

  it('FORMALITY_TENSION keys should map to B_formality_tension pack', () => {
    const result = buildModeBBullets(['FORMALITY_TENSION'], 'casual');

    result.bullets.forEach((bullet) => {
      if (bullet.key.startsWith('FORMALITY_TENSION__')) {
        const entry = TIP_SHEETS[bullet.key];
        expect(entry).toBeDefined();
        expect(entry.packId).toBe('B_formality_tension');
      }
    });
  });

  it('STYLE_TENSION keys should map to B_style_tension pack', () => {
    const result = buildModeBBullets(['STYLE_TENSION'], 'casual');

    result.bullets.forEach((bullet) => {
      if (bullet.key.startsWith('STYLE_TENSION__')) {
        const entry = TIP_SHEETS[bullet.key];
        expect(entry).toBeDefined();
        expect(entry.packId).toBe('B_style_tension');
      }
    });
  });
});

// ============================================
// OUTFIT-LEVEL MODE B TESTS
// ============================================

describe('generateOutfitModeBSuggestionsV2', () => {
  const createMockPairEvaluation = (capReasons: CapReason[]): PairEvaluation => ({
    item_a_id: 'scanned-item',
    item_b_id: 'wardrobe-item',
    pair_type: 'tops_bottoms',
    raw_score: 0.6,
    confidence_tier: 'MEDIUM',
    forced_tier: null,
    hard_fail_reason: null,
    cap_reasons: capReasons,
    features: {
      C: { value: 1.0, known: true },
      S: { value: 1.0, known: true },
      F: { value: 1.0, known: true },
      T: { value: 1.0, known: true },
      U: { value: 1.0, known: true },
    },
    explanation_allowed: true,
    explanation_forbidden_reason: null,
    explanation_template_id: null,
    explanation_specificity_level: null,
    both_statement: false,
    is_shoes_involved: false,
    high_threshold_used: 0.78,
    weights_used: { C: 0.25, S: 0.25, F: 0.2, T: 0.15, U: 0.15, V: 0 },
  });

  it('should return null for empty near matches', () => {
    const result = generateOutfitModeBSuggestionsV2([], 'casual');
    expect(result).toBeNull();
  });

  it('should aggregate cap reasons from multiple near matches', () => {
    const nearMatches: PairEvaluation[] = [
      createMockPairEvaluation(['FORMALITY_TENSION']),
      createMockPairEvaluation(['STYLE_TENSION']),
    ];

    const result = generateOutfitModeBSuggestionsV2(nearMatches, 'casual');

    expect(result).not.toBeNull();
    expect(result!.bullets.length).toBeGreaterThan(0);

    // Should have bullets from both reasons
    const keys = result!.bullets.map((b) => b.key);
    const hasFormality = keys.some((k) => k.startsWith('FORMALITY_TENSION__'));
    const hasStyle = keys.some((k) => k.startsWith('STYLE_TENSION__'));

    expect(hasFormality || hasStyle).toBe(true);
  });

  it('should return structured bullets with keys', () => {
    const nearMatches: PairEvaluation[] = [
      createMockPairEvaluation(['COLOR_TENSION']),
    ];

    const result = generateOutfitModeBSuggestionsV2(nearMatches, 'casual');

    expect(result).not.toBeNull();
    result!.bullets.forEach((bullet) => {
      expect(bullet).toHaveProperty('key');
      expect(bullet).toHaveProperty('text');
    });
  });
});

// ============================================
// DETERMINISM TESTS
// ============================================

describe('Mode B bullet determinism', () => {
  it('should return same bullets for same input (deterministic)', () => {
    const reasons: CapReason[] = ['FORMALITY_TENSION', 'STYLE_TENSION'];

    const result1 = buildModeBBullets(reasons, 'casual');
    const result2 = buildModeBBullets(reasons, 'casual');

    expect(result1.bullets).toEqual(result2.bullets);
    expect(result1.reasonsUsed).toEqual(result2.reasonsUsed);
  });

  it('should return same keys regardless of reason order', () => {
    const reasons1: CapReason[] = ['FORMALITY_TENSION', 'STYLE_TENSION'];
    const reasons2: CapReason[] = ['STYLE_TENSION', 'FORMALITY_TENSION'];

    const result1 = buildModeBBullets(reasons1, 'casual');
    const result2 = buildModeBBullets(reasons2, 'casual');

    // Due to priority ordering, results should be identical
    expect(result1.bullets).toEqual(result2.bullets);
  });

  it('should always pick first bullet from reason template (deterministic)', () => {
    // Run multiple times to verify determinism
    const reasons: CapReason[] = ['FORMALITY_TENSION'];

    const results = Array.from({ length: 5 }, () =>
      buildModeBBullets(reasons, 'casual')
    );

    // All results should be identical
    const firstResult = results[0];
    results.forEach((result) => {
      expect(result.bullets[0].key).toBe(firstResult.bullets[0].key);
      expect(result.bullets[0].text).toBe(firstResult.bullets[0].text);
    });
  });
});
