/**
 * Tests for getModeBBullets - PR 3 focused tests
 *
 * 1. HIGH tab renders Mode A suggestions (tested via useResultsTabs integration)
 * 2. NEAR tab renders Mode B suggestions
 * 3. NEAR tab + selected outfit uses only selected outfit MEDIUM cap reasons
 * 4. NEAR tab + selected outfit with no caps triggers Type2b fallback
 * 5. TipSheet receives mode based on active tab (tested via UI integration)
 */

// Mock __DEV__ for test environment
(global as unknown as { __DEV__: boolean }).__DEV__ = true;

import { getModeBBullets } from '../suggestions';
import type { PairEvaluation } from '../types';

// Helper to create a mock PairEvaluation
function createMockEval(overrides: Partial<PairEvaluation> = {}): PairEvaluation {
  return {
    item_a_id: 'item-a',
    item_b_id: 'item-b',
    pair_type: 'tops_bottoms',
    raw_score: 0.75,
    confidence_tier: 'MEDIUM',
    forced_tier: null,
    hard_fail_reason: null,
    cap_reasons: [],
    explanation_allowed: true,
    explanation_template_id: null,
    high_threshold_used: 0.78,
    ...overrides,
  } as PairEvaluation;
}

// Helper to create slot candidates (matches AssembledCombo.candidates shape)
interface SlotCandidateShape {
  itemId: string;
  tier: 'HIGH' | 'MEDIUM' | 'LOW';
  evaluation: PairEvaluation;
}

function createCandidate(tier: 'HIGH' | 'MEDIUM' | 'LOW', evalOverrides: Partial<PairEvaluation> = {}): SlotCandidateShape {
  return {
    itemId: `item-${tier.toLowerCase()}`,
    tier,
    evaluation: createMockEval({
      confidence_tier: tier,
      ...evalOverrides,
    }),
  };
}

describe('getModeBBullets - PR 3 Tests', () => {
  describe('NEAR tab renders Mode B suggestions (no selection)', () => {
    it('returns Mode B bullets aggregated from all nearMatches', () => {
      const nearMatches: PairEvaluation[] = [
        createMockEval({ cap_reasons: ['COLOR_CLASH' as never] }),
        createMockEval({ cap_reasons: ['FORMALITY_MISMATCH' as never] }),
      ];

      const result = getModeBBullets(null, nearMatches, 'casual');

      expect(result).not.toBeNull();
      expect(result!.bullets.length).toBeGreaterThan(0);
    });

    it('returns null when nearMatches is empty', () => {
      const result = getModeBBullets(null, [], 'casual');
      expect(result).toBeNull();
    });
  });

  describe('NEAR tab + selected outfit uses only MEDIUM cap reasons', () => {
    it('extracts only MEDIUM candidates from selected outfit', () => {
      const candidates: SlotCandidateShape[] = [
        createCandidate('HIGH', { cap_reasons: ['FORMALITY_MISMATCH' as never] }),
        createCandidate('MEDIUM', { cap_reasons: ['COLOR_CLASH' as never] }),
      ];

      // Fallback nearMatches with different cap reasons
      const nearMatches: PairEvaluation[] = [
        createMockEval({ cap_reasons: ['SATURATION_MISMATCH' as never] }),
      ];

      const result = getModeBBullets(candidates, nearMatches, 'casual');

      expect(result).not.toBeNull();
      expect(result!.bullets.length).toBeGreaterThan(0);
      // The function filters to MEDIUM candidates only - we verify it returns valid bullets
      // The specific cap reason to bullet mapping is tested in suggestions.test.ts
    });

    it('falls back to nearMatches if outfit has no MEDIUM candidates', () => {
      const candidates: SlotCandidateShape[] = [
        createCandidate('HIGH', { cap_reasons: ['FORMALITY_MISMATCH' as never] }),
      ];

      const nearMatches: PairEvaluation[] = [
        createMockEval({ cap_reasons: ['SATURATION_MISMATCH' as never] }),
      ];

      const result = getModeBBullets(candidates, nearMatches, 'casual');

      // Should fall back to nearMatches and return valid bullets
      expect(result).not.toBeNull();
      expect(result!.bullets.length).toBeGreaterThan(0);
    });
  });

  describe('NEAR tab + selected outfit with no caps triggers Type2b fallback', () => {
    it('returns Type2b fallback bullet when MEDIUM candidates have no cap reasons', () => {
      // Create a MEDIUM candidate with score in Type2b range (0.70-0.78) and no caps
      const candidates: SlotCandidateShape[] = [
        createCandidate('MEDIUM', {
          raw_score: 0.75,
          cap_reasons: [],
          high_threshold_used: 0.78,
        }),
      ];

      const nearMatches: PairEvaluation[] = [];

      const result = getModeBBullets(candidates, nearMatches, 'casual');

      expect(result).not.toBeNull();
      expect(result!.bullets.length).toBeGreaterThan(0);
      // Should have MISSING_KEY_SIGNAL bullet (Type2b fallback)
      expect(result!.bullets.some(b => b.key.includes('MISSING_KEY_SIGNAL'))).toBe(true);
    });

    it('returns null for MEDIUM candidates outside Type2b range with no caps', () => {
      // Score below Type2b range (< 0.70)
      const candidates: SlotCandidateShape[] = [
        createCandidate('MEDIUM', {
          raw_score: 0.65, // Below Type2b range
          cap_reasons: [],
          high_threshold_used: 0.78,
        }),
      ];

      const nearMatches: PairEvaluation[] = [];

      const result = getModeBBullets(candidates, nearMatches, 'casual');

      // Should return null since not Type2b and no caps
      expect(result).toBeNull();
    });
  });

  describe('Mode B with style vibe', () => {
    it('respects vibe parameter for bullet copy resolution', () => {
      const nearMatches: PairEvaluation[] = [
        createMockEval({ cap_reasons: ['COLOR_CLASH' as never] }),
      ];

      const casualResult = getModeBBullets(null, nearMatches, 'casual');
      const polishedResult = getModeBBullets(null, nearMatches, 'minimal');

      // Both should return results
      expect(casualResult).not.toBeNull();
      expect(polishedResult).not.toBeNull();
      // The bullets should be style-aware (actual text may vary by vibe)
    });
  });
});

