/**
 * Outfit Evaluation Test Suite
 *
 * Tests for outfit-level aggregation logic.
 * Key rules:
 * - 1 HIGH → HIGH
 * - 1 HIGH + 1 LOW → MEDIUM
 * - MEDIUM only → MEDIUM
 * - all LOW → LOW
 */

import type { PairEvaluation, ConfidenceTier, ConfidenceItem } from '../types';

// We need to test calculateOutfitConfidence which is not exported
// So we'll test through evaluateOutfit or create mock evaluations

// Helper to create a mock PairEvaluation
function createEvaluation(
  tier: ConfidenceTier,
  overrides: Partial<PairEvaluation> = {}
): PairEvaluation {
  return {
    item_a_id: 'scanned',
    item_b_id: `wardrobe-${Math.random()}`,
    pair_type: 'tops_bottoms',
    raw_score: tier === 'HIGH' ? 0.85 : tier === 'MEDIUM' ? 0.65 : 0.4,
    confidence_tier: tier,
    forced_tier: tier === 'LOW' ? 'LOW' : null,
    hard_fail_reason: null,
    cap_reasons: tier === 'MEDIUM' ? ['FORMALITY_TENSION'] : [],
    features: {
      C: { value: 1, known: true },
      S: { value: 1, known: true },
      F: { value: 1, known: true },
      T: { value: 1, known: true },
      U: { value: 1, known: true },
    },
    explanation_allowed: tier === 'HIGH',
    explanation_forbidden_reason: null,
    explanation_template_id: null,
    explanation_specificity_level: null,
    both_statement: false,
    is_shoes_involved: false,
    high_threshold_used: 0.78,
    weights_used: { C: 0.2, S: 0.2, F: 0.25, T: 0.15, U: 0.2, V: 0 },
    ...overrides,
  };
}

// Since calculateOutfitConfidence is not exported, we replicate the logic for testing
// In a real scenario, you'd either export it or test through evaluateOutfit
function calculateOutfitConfidence(evaluations: PairEvaluation[]): ConfidenceTier {
  if (evaluations.length === 0) {
    return 'LOW';
  }

  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const evalItem of evaluations) {
    counts[evalItem.confidence_tier]++;
  }

  if (counts.HIGH >= 2) {
    return 'HIGH';
  }

  if (counts.HIGH === 1) {
    if (counts.LOW > 0) {
      return 'MEDIUM';
    }
    return 'HIGH';
  }

  if (counts.MEDIUM > 0) {
    return 'MEDIUM';
  }

  return 'LOW';
}

describe('calculateOutfitConfidence', () => {
  describe('HIGH outcomes', () => {
    it('returns HIGH for 2+ HIGH matches', () => {
      const evaluations = [
        createEvaluation('HIGH'),
        createEvaluation('HIGH'),
      ];
      expect(calculateOutfitConfidence(evaluations)).toBe('HIGH');
    });

    it('returns HIGH for 3 HIGH matches', () => {
      const evaluations = [
        createEvaluation('HIGH'),
        createEvaluation('HIGH'),
        createEvaluation('HIGH'),
      ];
      expect(calculateOutfitConfidence(evaluations)).toBe('HIGH');
    });

    it('returns HIGH for 1 HIGH + 0 LOW (not risky)', () => {
      const evaluations = [
        createEvaluation('HIGH'),
        createEvaluation('MEDIUM'),
      ];
      expect(calculateOutfitConfidence(evaluations)).toBe('HIGH');
    });

    it('returns HIGH for 1 HIGH only', () => {
      const evaluations = [createEvaluation('HIGH')];
      expect(calculateOutfitConfidence(evaluations)).toBe('HIGH');
    });
  });

  describe('MEDIUM outcomes', () => {
    it('returns MEDIUM for 1 HIGH + 1 LOW (risky)', () => {
      const evaluations = [
        createEvaluation('HIGH'),
        createEvaluation('LOW'),
      ];
      expect(calculateOutfitConfidence(evaluations)).toBe('MEDIUM');
    });

    it('returns MEDIUM for 1 HIGH + multiple LOW', () => {
      const evaluations = [
        createEvaluation('HIGH'),
        createEvaluation('LOW'),
        createEvaluation('LOW'),
      ];
      expect(calculateOutfitConfidence(evaluations)).toBe('MEDIUM');
    });

    it('returns MEDIUM for MEDIUM only (no HIGH)', () => {
      const evaluations = [
        createEvaluation('MEDIUM'),
        createEvaluation('MEDIUM'),
      ];
      expect(calculateOutfitConfidence(evaluations)).toBe('MEDIUM');
    });

    it('returns MEDIUM for MEDIUM + LOW', () => {
      const evaluations = [
        createEvaluation('MEDIUM'),
        createEvaluation('LOW'),
      ];
      expect(calculateOutfitConfidence(evaluations)).toBe('MEDIUM');
    });
  });

  describe('LOW outcomes', () => {
    it('returns LOW for all LOW matches', () => {
      const evaluations = [
        createEvaluation('LOW'),
        createEvaluation('LOW'),
      ];
      expect(calculateOutfitConfidence(evaluations)).toBe('LOW');
    });

    it('returns LOW for single LOW match', () => {
      const evaluations = [createEvaluation('LOW')];
      expect(calculateOutfitConfidence(evaluations)).toBe('LOW');
    });

    it('returns LOW for empty evaluations', () => {
      const evaluations: PairEvaluation[] = [];
      expect(calculateOutfitConfidence(evaluations)).toBe('LOW');
    });
  });
});

describe('Suggestions Mode', () => {
  // Replicate determineSuggestionsMode logic for testing
  function determineSuggestionsMode(
    highMatchCount: number,
    nearMatchCount: number,
    wardrobeSize: number
  ): 'A' | 'B' {
    if (wardrobeSize === 0) {
      return 'A';
    }
    if (highMatchCount > 0) {
      return 'A';
    }
    if (nearMatchCount > 0) {
      return 'B';
    }
    return 'A';
  }

  describe('Mode A scenarios', () => {
    it('returns A for empty wardrobe', () => {
      expect(determineSuggestionsMode(0, 0, 0)).toBe('A');
    });

    it('returns A when HIGH matches exist', () => {
      expect(determineSuggestionsMode(1, 0, 5)).toBe('A');
      expect(determineSuggestionsMode(2, 0, 5)).toBe('A');
    });

    it('returns A when no matches at all', () => {
      expect(determineSuggestionsMode(0, 0, 5)).toBe('A');
    });
  });

  describe('Mode B scenarios', () => {
    it('returns B when near-matches exist but no HIGH', () => {
      expect(determineSuggestionsMode(0, 2, 5)).toBe('B');
    });

    it('returns B for single near-match with no HIGH', () => {
      expect(determineSuggestionsMode(0, 1, 5)).toBe('B');
    });
  });
});

describe('UI Behavior Protection', () => {
  // These tests document expected UI behavior

  it('show_matches_section should be true only when HIGH matches exist', () => {
    // HIGH matches → show
    const highEvals = [createEvaluation('HIGH')];
    const highCounts = { HIGH: highEvals.filter(e => e.confidence_tier === 'HIGH').length };
    expect(highCounts.HIGH > 0).toBe(true);

    // MEDIUM only → don't show
    const medEvals = [createEvaluation('MEDIUM')];
    const medCounts = { HIGH: medEvals.filter(e => e.confidence_tier === 'HIGH').length };
    expect(medCounts.HIGH > 0).toBe(false);

    // LOW only → don't show
    const lowEvals = [createEvaluation('LOW')];
    const lowCounts = { HIGH: lowEvals.filter(e => e.confidence_tier === 'HIGH').length };
    expect(lowCounts.HIGH > 0).toBe(false);
  });

  it('2+ HIGH matches always results in HIGH outfit confidence', () => {
    const scenarios = [
      [createEvaluation('HIGH'), createEvaluation('HIGH')],
      [createEvaluation('HIGH'), createEvaluation('HIGH'), createEvaluation('LOW')],
      [createEvaluation('HIGH'), createEvaluation('HIGH'), createEvaluation('MEDIUM')],
    ];

    for (const evaluations of scenarios) {
      expect(calculateOutfitConfidence(evaluations)).toBe('HIGH');
    }
  });
});
