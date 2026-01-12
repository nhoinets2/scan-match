/**
 * Suggestions Test Suite
 *
 * Tests for Mode B suggestion generation, particularly the Type 2b fallback logic.
 */

// Define __DEV__ for test environment
// @ts-expect-error - __DEV__ is a React Native global
globalThis.__DEV__ = true;

import {
  generateOutfitModeBSuggestionsV2,
} from '../suggestions';
import type { PairEvaluation, CapReason } from '../types';

// ============================================
// TEST HELPERS
// ============================================

function createMockPairEvaluation(overrides: Partial<PairEvaluation> = {}): PairEvaluation {
  return {
    item_a_id: 'scanned-1',
    item_b_id: 'wardrobe-1',
    pair_type: 'tops_bottoms',
    raw_score: 0.75,
    confidence_tier: 'MEDIUM',
    high_threshold_used: 0.78,
    forced_tier: null,
    hard_fail_reason: null,
    cap_reasons: [],
    features: {
      C: { value: 1, known: true },
      S: { value: 1, known: true },
      F: { value: 1, known: true },
      T: { value: 1, known: true },
      U: { value: 1, known: true },
    },
    is_shoes_involved: false,
    explanation_allowed: false,
    explanation_forbidden_reason: null,
    explanation_template_id: null,
    explanation_specificity_level: null,
    both_statement: false,
    weights_used: { C: 0.25, S: 0.25, F: 0.2, T: 0.15, U: 0.15, V: 0 },
    ...overrides,
  };
}

// ============================================
// generateOutfitModeBSuggestionsV2 TESTS
// ============================================

describe('generateOutfitModeBSuggestionsV2', () => {
  describe('empty near matches', () => {
    it('returns null for empty array', () => {
      const result = generateOutfitModeBSuggestionsV2([], 'casual');
      expect(result).toBeNull();
    });
  });

  describe('Type 2b with no cap reasons → generic bullet', () => {
    it('returns MISSING_KEY_SIGNAL bullet for Type 2b (score >= 0.70, no caps)', () => {
      const nearMatch = createMockPairEvaluation({
        raw_score: 0.75, // Type 2b range (0.70-0.78)
        cap_reasons: [],  // No cap reasons
      });

      const result = generateOutfitModeBSuggestionsV2([nearMatch], 'casual');

      expect(result).not.toBeNull();
      expect(result?.reasons_used).toContain('MISSING_KEY_SIGNAL');
      expect(result?.bullets.length).toBeGreaterThan(0);
    });

    it('works with multiple Type 2b near matches', () => {
      const nearMatches = [
        createMockPairEvaluation({ raw_score: 0.72, cap_reasons: [] }),
        createMockPairEvaluation({ raw_score: 0.76, cap_reasons: [] }),
      ];

      const result = generateOutfitModeBSuggestionsV2(nearMatches, 'minimal');

      expect(result).not.toBeNull();
      expect(result?.reasons_used).toContain('MISSING_KEY_SIGNAL');
    });

    it('works at exact lower bound (0.70)', () => {
      const nearMatch = createMockPairEvaluation({
        raw_score: 0.70, // Exactly at lower bound
        high_threshold_used: 0.78,
        cap_reasons: [],
      });

      const result = generateOutfitModeBSuggestionsV2([nearMatch], 'casual');

      expect(result).not.toBeNull();
      expect(result?.reasons_used).toContain('MISSING_KEY_SIGNAL');
    });

    it('works just below HIGH threshold (0.779)', () => {
      const nearMatch = createMockPairEvaluation({
        raw_score: 0.779, // Just below HIGH threshold
        high_threshold_used: 0.78,
        cap_reasons: [],
      });

      const result = generateOutfitModeBSuggestionsV2([nearMatch], 'casual');

      expect(result).not.toBeNull();
      expect(result?.reasons_used).toContain('MISSING_KEY_SIGNAL');
    });
  });

  describe('Type 2b with cap reasons → uses actual cap reasons', () => {
    it('returns actual cap reasons, NOT generic bullet', () => {
      const nearMatch = createMockPairEvaluation({
        raw_score: 0.75,
        cap_reasons: ['FORMALITY_TENSION'] as CapReason[],
      });

      const result = generateOutfitModeBSuggestionsV2([nearMatch], 'casual');

      expect(result).not.toBeNull();
      expect(result?.reasons_used).toContain('FORMALITY_TENSION');
      expect(result?.reasons_used).not.toContain('MISSING_KEY_SIGNAL');
    });

    it('aggregates cap reasons from multiple near matches', () => {
      const nearMatches = [
        createMockPairEvaluation({
          raw_score: 0.75,
          cap_reasons: ['FORMALITY_TENSION'] as CapReason[],
        }),
        createMockPairEvaluation({
          raw_score: 0.72,
          cap_reasons: ['STYLE_TENSION'] as CapReason[],
        }),
      ];

      const result = generateOutfitModeBSuggestionsV2(nearMatches, 'office');

      expect(result).not.toBeNull();
      // Should include both cap reasons
      expect(result?.reasons_used).toContain('FORMALITY_TENSION');
      expect(result?.reasons_used).toContain('STYLE_TENSION');
      expect(result?.reasons_used).not.toContain('MISSING_KEY_SIGNAL');
    });
  });

  describe('Not Type 2b and no cap reasons → null', () => {
    it('returns null for low score with no cap reasons (not Type 2b)', () => {
      const nearMatch = createMockPairEvaluation({
        raw_score: 0.65, // Below Type 2b threshold (0.70)
        cap_reasons: [],
      });

      const result = generateOutfitModeBSuggestionsV2([nearMatch], 'casual');

      // Should return null because it's not Type 2b
      expect(result).toBeNull();
    });

    it('returns null for HIGH score with no cap reasons (above Type 2b range)', () => {
      // Regression guard: score >= HIGH_THRESHOLD should NOT use generic fallback
      const nearMatch = createMockPairEvaluation({
        raw_score: 0.85, // Above HIGH threshold (0.78)
        high_threshold_used: 0.78,
        cap_reasons: [],
      });

      const result = generateOutfitModeBSuggestionsV2([nearMatch], 'casual');

      // Should return null because score >= HIGH means it's NOT Type 2b
      // (even with no caps, a HIGH score shouldn't get generic fallback)
      expect(result).toBeNull();
    });

    it('returns null for score exactly at HIGH threshold with no caps', () => {
      const nearMatch = createMockPairEvaluation({
        raw_score: 0.78, // Exactly at HIGH threshold
        high_threshold_used: 0.78,
        cap_reasons: [],
      });

      const result = generateOutfitModeBSuggestionsV2([nearMatch], 'casual');

      // At threshold = not Type 2b, should return null
      expect(result).toBeNull();
    });
  });

  describe('mixed near matches', () => {
    it('uses cap reasons if any match has them', () => {
      const nearMatches = [
        createMockPairEvaluation({
          raw_score: 0.75,
          cap_reasons: [], // Type 2b, no caps
        }),
        createMockPairEvaluation({
          raw_score: 0.72,
          cap_reasons: ['COLOR_TENSION'] as CapReason[], // Has cap reason
        }),
      ];

      const result = generateOutfitModeBSuggestionsV2(nearMatches, 'street');

      expect(result).not.toBeNull();
      expect(result?.reasons_used).toContain('COLOR_TENSION');
      expect(result?.reasons_used).not.toContain('MISSING_KEY_SIGNAL');
    });
  });

  describe('vibe-specific bullets', () => {
    it('passes vibe through to bullet generation', () => {
      const nearMatch = createMockPairEvaluation({
        raw_score: 0.75,
        cap_reasons: ['FORMALITY_TENSION'] as CapReason[],
      });

      const casualResult = generateOutfitModeBSuggestionsV2([nearMatch], 'casual');
      const officeResult = generateOutfitModeBSuggestionsV2([nearMatch], 'office');

      // Both should generate bullets (vibe affects text, not presence)
      expect(casualResult).not.toBeNull();
      expect(officeResult).not.toBeNull();
    });
  });

  describe('MISSING_KEY_SIGNAL should not double up with generic fallback', () => {
    it('Type 2b returns exactly 1 bullet (no redundant generic)', () => {
      const nearMatch = createMockPairEvaluation({
        raw_score: 0.75, // Type 2b range
        cap_reasons: [],  // No cap reasons
      });

      const result = generateOutfitModeBSuggestionsV2([nearMatch], 'casual');

      expect(result).not.toBeNull();
      expect(result?.reasons_used).toContain('MISSING_KEY_SIGNAL');
      // Should have exactly 1 bullet, not 2 (no DEFAULT__GENERIC_FALLBACK)
      expect(result?.bullets.length).toBe(1);
      expect(result?.bullets[0].key).toBe('MISSING_KEY_SIGNAL__SIMPLE_VERSATILE');
    });
  });
});

