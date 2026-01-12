/**
 * ComboAssembler Unit Tests
 *
 * Locks the logic for:
 * 1. buildCandidatesBySlot - grouping CE evaluations by outfit slot
 * 2. generateCombos - tier bucket strategy
 * 3. rankCombos - tier floor + score ranking
 * 4. assembleCombos - end-to-end assembly
 *
 * Key invariants:
 * - CE is the single source of truth (no re-scoring)
 * - Tier floor ranking: HIGH > MEDIUM > LOW
 * - Stable, deterministic output (same inputs = same outputs)
 * - No duplicate items in a combo
 */

import {
  buildCandidatesBySlot,
  generateCombos,
  rankCombos,
  assembleCombos,
  getScannedItemSlot,
  getRequiredSlotsToFill,
  getDressTrackSlotsToFill,
  getMissingSlotsInfo,
  decorateWithOuterwear,
  type SlotCandidate,
  type CandidatesBySlot,
  type AssembledCombo,
  type OutfitSlot,
} from '../combo-assembler';
import type { PairEvaluation, ConfidenceTier } from '../confidence-engine/types';
import type { Category } from '../types';

// ============================================
// TEST HELPERS
// ============================================

function createMockEvaluation(
  itemId: string,
  tier: ConfidenceTier,
  score: number,
  pairType: string = 'tops_bottoms'
): PairEvaluation {
  return {
    item_a_id: 'scanned-item',
    item_b_id: itemId,
    pair_type: pairType as PairEvaluation['pair_type'],
    raw_score: score,
    confidence_tier: tier,
    forced_tier: tier === 'LOW' ? 'LOW' : null,
    hard_fail_reason: null,
    cap_reasons: [],
    features: {
      C: { value: 1, known: true },
      S: { value: 1, known: true },
      F: { value: 1, known: true },
      T: { value: 1, known: true },
      U: { value: 1, known: true },
      V: { value: 0, known: false },
    },
    explanation_allowed: tier === 'HIGH',
    explanation_forbidden_reason: null,
    explanation_template_id: null,
    explanation_specificity_level: null,
    both_statement: false,
    is_shoes_involved: pairType.includes('shoes'),
    high_threshold_used: pairType.includes('shoes') ? 0.82 : 0.78,
    weights_used: { C: 0.2, S: 0.2, F: 0.25, T: 0.15, U: 0.2, V: 0 },
  };
}

function createCategoryMap(items: { id: string; category: Category }[]): Map<string, Category> {
  const map = new Map<string, Category>();
  for (const item of items) {
    map.set(item.id, item.category);
  }
  return map;
}

// ============================================
// SLOT MAPPING TESTS
// ============================================

describe('Slot Mapping', () => {
  describe('getScannedItemSlot', () => {
    const cases: [Category, OutfitSlot | null][] = [
      ['tops', 'TOP'],
      ['bottoms', 'BOTTOM'],
      ['shoes', 'SHOES'],
      ['outerwear', 'OUTERWEAR'],
      ['skirts', 'BOTTOM'],
      ['dresses', 'DRESS'],
      ['bags', null],
      ['accessories', null],
    ];

    test.each(cases)('%s → %s', (category, expectedSlot) => {
      expect(getScannedItemSlot(category)).toBe(expectedSlot);
    });
  });

  describe('getRequiredSlotsToFill', () => {
    it('returns TOP and SHOES when scanning bottoms', () => {
      const slots = getRequiredSlotsToFill('bottoms');
      expect(slots).toContain('TOP');
      expect(slots).toContain('SHOES');
      expect(slots).not.toContain('BOTTOM');
    });

    it('returns BOTTOM and SHOES when scanning tops', () => {
      const slots = getRequiredSlotsToFill('tops');
      expect(slots).toContain('BOTTOM');
      expect(slots).toContain('SHOES');
      expect(slots).not.toContain('TOP');
    });

    it('returns TOP and BOTTOM when scanning shoes', () => {
      const slots = getRequiredSlotsToFill('shoes');
      expect(slots).toContain('TOP');
      expect(slots).toContain('BOTTOM');
      expect(slots).not.toContain('SHOES');
    });
  });
});

// ============================================
// BUILD CANDIDATES BY SLOT TESTS
// ============================================

describe('buildCandidatesBySlot', () => {
  it('groups evaluations by slot based on category', () => {
    const evaluations = [
      createMockEvaluation('top-1', 'HIGH', 0.85, 'tops_bottoms'),
      createMockEvaluation('top-2', 'MEDIUM', 0.70, 'tops_bottoms'),
      createMockEvaluation('shoes-1', 'HIGH', 0.88, 'bottoms_shoes'),
    ];

    const categoryMap = createCategoryMap([
      { id: 'top-1', category: 'tops' },
      { id: 'top-2', category: 'tops' },
      { id: 'shoes-1', category: 'shoes' },
    ]);

    const candidates = buildCandidatesBySlot('bottoms', evaluations, categoryMap);

    expect(candidates.TOP).toHaveLength(2);
    expect(candidates.SHOES).toHaveLength(1);
    expect(candidates.BOTTOM).toHaveLength(0); // Scanned item fills this
  });

  it('excludes LOW tier by default', () => {
    const evaluations = [
      createMockEvaluation('top-1', 'HIGH', 0.85, 'tops_bottoms'),
      createMockEvaluation('top-2', 'LOW', 0.40, 'tops_bottoms'),
    ];

    const categoryMap = createCategoryMap([
      { id: 'top-1', category: 'tops' },
      { id: 'top-2', category: 'tops' },
    ]);

    const candidates = buildCandidatesBySlot('bottoms', evaluations, categoryMap);

    expect(candidates.TOP).toHaveLength(1);
    expect(candidates.TOP[0].itemId).toBe('top-1');
  });

  it('includes LOW tier when configured', () => {
    const evaluations = [
      createMockEvaluation('top-1', 'HIGH', 0.85, 'tops_bottoms'),
      createMockEvaluation('top-2', 'LOW', 0.40, 'tops_bottoms'),
    ];

    const categoryMap = createCategoryMap([
      { id: 'top-1', category: 'tops' },
      { id: 'top-2', category: 'tops' },
    ]);

    const candidates = buildCandidatesBySlot('bottoms', evaluations, categoryMap, {
      maxCandidatesPerSlot: 10,
      maxCombos: 12,
      includeLowTier: true,
      maxReasonsPerCombo: 4,
    });

    expect(candidates.TOP).toHaveLength(2);
  });

  it('sorts by tier (HIGH first), then by score (desc)', () => {
    const evaluations = [
      createMockEvaluation('top-medium-high-score', 'MEDIUM', 0.75, 'tops_bottoms'),
      createMockEvaluation('top-high-low-score', 'HIGH', 0.80, 'tops_bottoms'),
      createMockEvaluation('top-high-high-score', 'HIGH', 0.90, 'tops_bottoms'),
    ];

    const categoryMap = createCategoryMap([
      { id: 'top-medium-high-score', category: 'tops' },
      { id: 'top-high-low-score', category: 'tops' },
      { id: 'top-high-high-score', category: 'tops' },
    ]);

    const candidates = buildCandidatesBySlot('bottoms', evaluations, categoryMap);

    expect(candidates.TOP[0].itemId).toBe('top-high-high-score'); // HIGH, 0.90
    expect(candidates.TOP[1].itemId).toBe('top-high-low-score');  // HIGH, 0.80
    expect(candidates.TOP[2].itemId).toBe('top-medium-high-score'); // MEDIUM, 0.75
  });

  it('caps candidates per slot to maxCandidatesPerSlot', () => {
    const evaluations = Array.from({ length: 20 }, (_, i) =>
      createMockEvaluation(`top-${i}`, 'HIGH', 0.90 - i * 0.01, 'tops_bottoms')
    );

    const categoryMap = createCategoryMap(
      Array.from({ length: 20 }, (_, i) => ({ id: `top-${i}`, category: 'tops' as Category }))
    );

    const candidates = buildCandidatesBySlot('bottoms', evaluations, categoryMap, {
      maxCandidatesPerSlot: 5,
      maxCombos: 12,
      includeLowTier: false,
      maxReasonsPerCombo: 4,
    });

    expect(candidates.TOP).toHaveLength(5);
  });

  it('excludes items in same slot as scanned item', () => {
    const evaluations = [
      createMockEvaluation('bottom-1', 'HIGH', 0.85, 'tops_bottoms'),
    ];

    const categoryMap = createCategoryMap([
      { id: 'bottom-1', category: 'bottoms' },
    ]);

    // Scanning bottoms - should not include other bottoms
    const candidates = buildCandidatesBySlot('bottoms', evaluations, categoryMap);

    expect(candidates.BOTTOM).toHaveLength(0);
  });
});

// ============================================
// GENERATE COMBOS TESTS
// ============================================

describe('generateCombos', () => {
  it('returns empty when missing required slots', () => {
    const candidates: CandidatesBySlot = {
      TOP: [{ itemId: 'top-1', slot: 'TOP', tier: 'HIGH', score: 0.85, evaluation: createMockEvaluation('top-1', 'HIGH', 0.85) }],
      BOTTOM: [],
      SHOES: [], // Missing!
      OUTERWEAR: [],
      DRESS: [],
    };

    const combos = generateCombos(candidates, 'bottoms');

    expect(combos).toHaveLength(0);
  });

  it('generates combos when all required slots are filled', () => {
    const candidates: CandidatesBySlot = {
      TOP: [{ itemId: 'top-1', slot: 'TOP', tier: 'HIGH', score: 0.85, evaluation: createMockEvaluation('top-1', 'HIGH', 0.85) }],
      BOTTOM: [],
      SHOES: [{ itemId: 'shoes-1', slot: 'SHOES', tier: 'HIGH', score: 0.88, evaluation: createMockEvaluation('shoes-1', 'HIGH', 0.88, 'bottoms_shoes') }],
      OUTERWEAR: [],
      DRESS: [],
    };

    const combos = generateCombos(candidates, 'bottoms');

    expect(combos.length).toBeGreaterThan(0);
    expect(combos[0].slots.TOP).toBe('top-1');
    expect(combos[0].slots.SHOES).toBe('shoes-1');
  });

  it('generates combos in tier bucket priority order', () => {
    const candidates: CandidatesBySlot = {
      TOP: [
        { itemId: 'top-high', slot: 'TOP', tier: 'HIGH', score: 0.85, evaluation: createMockEvaluation('top-high', 'HIGH', 0.85) },
        { itemId: 'top-medium', slot: 'TOP', tier: 'MEDIUM', score: 0.70, evaluation: createMockEvaluation('top-medium', 'MEDIUM', 0.70) },
      ],
      BOTTOM: [],
      SHOES: [
        { itemId: 'shoes-high', slot: 'SHOES', tier: 'HIGH', score: 0.88, evaluation: createMockEvaluation('shoes-high', 'HIGH', 0.88, 'bottoms_shoes') },
        { itemId: 'shoes-medium', slot: 'SHOES', tier: 'MEDIUM', score: 0.72, evaluation: createMockEvaluation('shoes-medium', 'MEDIUM', 0.72, 'bottoms_shoes') },
      ],
      OUTERWEAR: [],
      DRESS: [],
    };

    const combos = generateCombos(candidates, 'bottoms');

    // First combo should be HIGH+HIGH
    expect(combos[0].slots.TOP).toBe('top-high');
    expect(combos[0].slots.SHOES).toBe('shoes-high');
    expect(combos[0].tierFloor).toBe('HIGH');
  });

  it('does not reuse same item in a combo', () => {
    // This shouldn't happen in practice, but guard against it
    const candidates: CandidatesBySlot = {
      TOP: [{ itemId: 'item-1', slot: 'TOP', tier: 'HIGH', score: 0.85, evaluation: createMockEvaluation('item-1', 'HIGH', 0.85) }],
      BOTTOM: [],
      SHOES: [{ itemId: 'item-1', slot: 'SHOES', tier: 'HIGH', score: 0.88, evaluation: createMockEvaluation('item-1', 'HIGH', 0.88, 'bottoms_shoes') }],
      OUTERWEAR: [],
      DRESS: [],
    };

    const combos = generateCombos(candidates, 'bottoms');

    // Should not create combo with same item in multiple slots
    expect(combos).toHaveLength(0);
  });

  it('respects maxCombos limit', () => {
    const candidates: CandidatesBySlot = {
      TOP: Array.from({ length: 10 }, (_, i) => ({
        itemId: `top-${i}`,
        slot: 'TOP' as OutfitSlot,
        tier: 'HIGH' as ConfidenceTier,
        score: 0.85,
        evaluation: createMockEvaluation(`top-${i}`, 'HIGH', 0.85),
      })),
      BOTTOM: [],
      SHOES: Array.from({ length: 10 }, (_, i) => ({
        itemId: `shoes-${i}`,
        slot: 'SHOES' as OutfitSlot,
        tier: 'HIGH' as ConfidenceTier,
        score: 0.88,
        evaluation: createMockEvaluation(`shoes-${i}`, 'HIGH', 0.88, 'bottoms_shoes'),
      })),
      OUTERWEAR: [],
      DRESS: [],
    };

    const combos = generateCombos(candidates, 'bottoms', {
      maxCandidatesPerSlot: 10,
      maxCombos: 5,
      includeLowTier: false,
      maxReasonsPerCombo: 4,
    });

    expect(combos).toHaveLength(5);
  });
});

// ============================================
// RANK COMBOS TESTS
// ============================================

describe('rankCombos', () => {
  it('ranks by tier floor first (HIGH > MEDIUM > LOW)', () => {
    const combos: AssembledCombo[] = [
      { id: 'combo-medium', slots: {}, candidates: [], tierFloor: 'MEDIUM', avgScore: 0.90, reasons: [] },
      { id: 'combo-high', slots: {}, candidates: [], tierFloor: 'HIGH', avgScore: 0.70, reasons: [] },
      { id: 'combo-low', slots: {}, candidates: [], tierFloor: 'LOW', avgScore: 0.95, reasons: [] },
    ];

    const ranked = rankCombos(combos);

    expect(ranked[0].id).toBe('combo-high');
    expect(ranked[1].id).toBe('combo-medium');
    expect(ranked[2].id).toBe('combo-low');
  });

  it('ranks by avgScore second (when tier floor is equal)', () => {
    const combos: AssembledCombo[] = [
      { id: 'combo-low-score', slots: {}, candidates: [], tierFloor: 'HIGH', avgScore: 0.70, reasons: [] },
      { id: 'combo-high-score', slots: {}, candidates: [], tierFloor: 'HIGH', avgScore: 0.90, reasons: [] },
    ];

    const ranked = rankCombos(combos);

    expect(ranked[0].id).toBe('combo-high-score');
    expect(ranked[1].id).toBe('combo-low-score');
  });

  it('uses stable tiebreaker for equal tier and score', () => {
    const combos: AssembledCombo[] = [
      { id: 'z-combo', slots: {}, candidates: [], tierFloor: 'HIGH', avgScore: 0.85, reasons: [] },
      { id: 'a-combo', slots: {}, candidates: [], tierFloor: 'HIGH', avgScore: 0.85, reasons: [] },
    ];

    const ranked = rankCombos(combos);

    // Lexical order: 'a-combo' before 'z-combo'
    expect(ranked[0].id).toBe('a-combo');
    expect(ranked[1].id).toBe('z-combo');
  });

  it('is deterministic (same input = same output)', () => {
    const combos: AssembledCombo[] = [
      { id: 'combo-1', slots: {}, candidates: [], tierFloor: 'HIGH', avgScore: 0.85, reasons: [] },
      { id: 'combo-2', slots: {}, candidates: [], tierFloor: 'MEDIUM', avgScore: 0.75, reasons: [] },
      { id: 'combo-3', slots: {}, candidates: [], tierFloor: 'HIGH', avgScore: 0.80, reasons: [] },
    ];

    const ranked1 = rankCombos([...combos]);
    const ranked2 = rankCombos([...combos]);

    expect(ranked1.map(c => c.id)).toEqual(ranked2.map(c => c.id));
  });
});

// ============================================
// MEDIUM-COUNT RANKING TESTS (PR 2)
// ============================================

/**
 * Tests for mediumCount ranking within MEDIUM tierFloor combos.
 * This logic is applied in useComboAssembler after coherence filtering.
 * 
 * Sort order for Worth trying (MEDIUM tierFloor):
 *   1. coherence penalty (0 before 1)
 *   2. mediumCount (fewer MEDIUM items first)
 *   3. avgScore desc
 *   4. stable tiebreaker (id)
 */
describe('MEDIUM-count ranking (Worth trying tab)', () => {
  // Helper to create combo with specific candidate tiers
  function createComboWithTiers(
    id: string,
    candidateTiers: ConfidenceTier[],
    avgScore: number = 0.80
  ): AssembledCombo {
    const candidates: SlotCandidate[] = candidateTiers.map((tier, i) => ({
      itemId: `item-${i}`,
      slot: ['TOP', 'BOTTOM', 'SHOES'][i] as OutfitSlot,
      tier,
      score: tier === 'HIGH' ? 0.85 : tier === 'MEDIUM' ? 0.72 : 0.50,
      evaluation: createMockEvaluation(`item-${i}`, tier, 0.80),
    }));

    // tierFloor is the minimum tier across candidates
    const tierFloor: ConfidenceTier = candidateTiers.includes('LOW')
      ? 'LOW'
      : candidateTiers.includes('MEDIUM')
        ? 'MEDIUM'
        : 'HIGH';

    return {
      id,
      slots: { TOP: 'item-0', BOTTOM: 'item-1', SHOES: 'item-2' },
      candidates,
      tierFloor,
      avgScore,
      reasons: [],
    };
  }

  /**
   * Simulates the sort logic from useComboAssembler.
   * For MEDIUM tierFloor combos, prefers fewer MEDIUM items.
   */
  function sortWithMediumCount(
    combos: AssembledCombo[],
    penaltyById: Map<string, number> = new Map()
  ): AssembledCombo[] {
    return [...combos].sort((a, b) => {
      // Primary: tier floor
      const tierOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const tierDiff = tierOrder[a.tierFloor] - tierOrder[b.tierFloor];
      if (tierDiff !== 0) return tierDiff;

      // Secondary: coherence penalty
      const penaltyA = penaltyById.get(a.id) ?? 0;
      const penaltyB = penaltyById.get(b.id) ?? 0;
      if (penaltyA !== penaltyB) return penaltyA - penaltyB;

      // Tertiary: mediumCount (only for MEDIUM tierFloor)
      if (a.tierFloor === 'MEDIUM') {
        const mediumCountA = a.candidates.filter(c => c.tier === 'MEDIUM').length;
        const mediumCountB = b.candidates.filter(c => c.tier === 'MEDIUM').length;
        if (mediumCountA !== mediumCountB) return mediumCountA - mediumCountB;
      }

      // Quaternary: avgScore desc
      const scoreDiff = b.avgScore - a.avgScore;
      if (Math.abs(scoreDiff) > 0.001) return scoreDiff;

      // Stable tiebreaker
      return a.id.localeCompare(b.id);
    });
  }

  it('ranks [HIGH, HIGH, MEDIUM] above [MEDIUM, MEDIUM, MEDIUM] despite lower avgScore', () => {
    const combos: AssembledCombo[] = [
      // 3 MEDIUM items, higher avgScore
      createComboWithTiers('all-medium', ['MEDIUM', 'MEDIUM', 'MEDIUM'], 0.90),
      // 1 MEDIUM item, lower avgScore
      createComboWithTiers('one-medium', ['HIGH', 'HIGH', 'MEDIUM'], 0.75),
    ];

    const sorted = sortWithMediumCount(combos);

    expect(sorted[0].id).toBe('one-medium');
    expect(sorted[1].id).toBe('all-medium');
  });

  it('ranks by mediumCount: 1 < 2 < 3', () => {
    const combos: AssembledCombo[] = [
      createComboWithTiers('three-medium', ['MEDIUM', 'MEDIUM', 'MEDIUM'], 0.85),
      createComboWithTiers('one-medium', ['HIGH', 'HIGH', 'MEDIUM'], 0.85),
      createComboWithTiers('two-medium', ['HIGH', 'MEDIUM', 'MEDIUM'], 0.85),
    ];

    const sorted = sortWithMediumCount(combos);

    expect(sorted[0].id).toBe('one-medium');
    expect(sorted[1].id).toBe('two-medium');
    expect(sorted[2].id).toBe('three-medium');
  });

  it('uses avgScore as tiebreaker when mediumCount is equal', () => {
    const combos: AssembledCombo[] = [
      createComboWithTiers('lower-score', ['HIGH', 'HIGH', 'MEDIUM'], 0.70),
      createComboWithTiers('higher-score', ['HIGH', 'HIGH', 'MEDIUM'], 0.90),
    ];

    const sorted = sortWithMediumCount(combos);

    expect(sorted[0].id).toBe('higher-score');
    expect(sorted[1].id).toBe('lower-score');
  });

  it('coherence penalty takes precedence over mediumCount', () => {
    const combos: AssembledCombo[] = [
      createComboWithTiers('penalized-one-medium', ['HIGH', 'HIGH', 'MEDIUM'], 0.90),
      createComboWithTiers('clean-three-medium', ['MEDIUM', 'MEDIUM', 'MEDIUM'], 0.75),
    ];

    const penaltyById = new Map([['penalized-one-medium', 1]]);
    const sorted = sortWithMediumCount(combos, penaltyById);

    // Clean combo wins despite more MEDIUM items
    expect(sorted[0].id).toBe('clean-three-medium');
    expect(sorted[1].id).toBe('penalized-one-medium');
  });

  it('does not affect HIGH tierFloor combos', () => {
    // HIGH combos don't have mediumCount sorting - only avgScore + id
    const highCombos: AssembledCombo[] = [
      { id: 'lower-score', slots: {}, candidates: [], tierFloor: 'HIGH', avgScore: 0.70, reasons: [] },
      { id: 'higher-score', slots: {}, candidates: [], tierFloor: 'HIGH', avgScore: 0.90, reasons: [] },
    ];

    const sorted = sortWithMediumCount(highCombos);

    // Should sort by avgScore, not mediumCount
    expect(sorted[0].id).toBe('higher-score');
    expect(sorted[1].id).toBe('lower-score');
  });

  it('is deterministic', () => {
    const combos: AssembledCombo[] = [
      createComboWithTiers('a-one', ['HIGH', 'HIGH', 'MEDIUM'], 0.85),
      createComboWithTiers('b-two', ['HIGH', 'MEDIUM', 'MEDIUM'], 0.85),
      createComboWithTiers('c-three', ['MEDIUM', 'MEDIUM', 'MEDIUM'], 0.85),
    ];

    const sorted1 = sortWithMediumCount([...combos]);
    const sorted2 = sortWithMediumCount([...combos]);

    expect(sorted1.map(c => c.id)).toEqual(sorted2.map(c => c.id));
  });
});

// ============================================
// MISSING SLOTS INFO TESTS
// ============================================

describe('getMissingSlotsInfo', () => {
  it('returns empty when all required slots have candidates', () => {
    const candidates: CandidatesBySlot = {
      TOP: [{ itemId: 'top-1', slot: 'TOP', tier: 'HIGH', score: 0.85, evaluation: createMockEvaluation('top-1', 'HIGH', 0.85) }],
      BOTTOM: [],
      SHOES: [{ itemId: 'shoes-1', slot: 'SHOES', tier: 'HIGH', score: 0.88, evaluation: createMockEvaluation('shoes-1', 'HIGH', 0.88, 'bottoms_shoes') }],
      OUTERWEAR: [],
      DRESS: [],
    };

    const missing = getMissingSlotsInfo(candidates, ['TOP', 'SHOES']);

    expect(missing).toHaveLength(0);
  });

  it('returns missing slots with category info', () => {
    const candidates: CandidatesBySlot = {
      TOP: [{ itemId: 'top-1', slot: 'TOP', tier: 'HIGH', score: 0.85, evaluation: createMockEvaluation('top-1', 'HIGH', 0.85) }],
      BOTTOM: [],
      SHOES: [],
      OUTERWEAR: [],
      DRESS: [],
    };

    const missing = getMissingSlotsInfo(candidates, ['TOP', 'SHOES']);

    expect(missing).toHaveLength(1);
    expect(missing[0].slot).toBe('SHOES');
    expect(missing[0].category).toBe('shoes');
  });
});

// ============================================
// ASSEMBLE COMBOS (END-TO-END) TESTS
// ============================================

describe('assembleCombos', () => {
  it('returns canFormCombos=false when missing required slots', () => {
    const evaluations = [
      createMockEvaluation('top-1', 'HIGH', 0.85, 'tops_bottoms'),
      // No shoes!
    ];

    const categoryMap = createCategoryMap([
      { id: 'top-1', category: 'tops' },
    ]);

    const result = assembleCombos('bottoms', evaluations, categoryMap);

    expect(result.canFormCombos).toBe(false);
    expect(result.combos).toHaveLength(0);
    expect(result.missingSlots).toHaveLength(1);
    expect(result.missingSlots[0].category).toBe('shoes');
  });

  it('returns ranked combos when all required slots are filled', () => {
    const evaluations = [
      createMockEvaluation('top-1', 'HIGH', 0.85, 'tops_bottoms'),
      createMockEvaluation('top-2', 'MEDIUM', 0.70, 'tops_bottoms'),
      createMockEvaluation('shoes-1', 'HIGH', 0.88, 'bottoms_shoes'),
      createMockEvaluation('shoes-2', 'MEDIUM', 0.72, 'bottoms_shoes'),
    ];

    const categoryMap = createCategoryMap([
      { id: 'top-1', category: 'tops' },
      { id: 'top-2', category: 'tops' },
      { id: 'shoes-1', category: 'shoes' },
      { id: 'shoes-2', category: 'shoes' },
    ]);

    const result = assembleCombos('bottoms', evaluations, categoryMap);

    expect(result.canFormCombos).toBe(true);
    expect(result.combos.length).toBeGreaterThan(0);
    expect(result.missingSlots).toHaveLength(0);

    // First combo should be HIGH+HIGH
    expect(result.combos[0].tierFloor).toBe('HIGH');
  });

  it('produces deterministic results', () => {
    const evaluations = [
      createMockEvaluation('top-1', 'HIGH', 0.85, 'tops_bottoms'),
      createMockEvaluation('top-2', 'MEDIUM', 0.70, 'tops_bottoms'),
      createMockEvaluation('shoes-1', 'HIGH', 0.88, 'bottoms_shoes'),
    ];

    const categoryMap = createCategoryMap([
      { id: 'top-1', category: 'tops' },
      { id: 'top-2', category: 'tops' },
      { id: 'shoes-1', category: 'shoes' },
    ]);

    const result1 = assembleCombos('bottoms', evaluations, categoryMap);
    const result2 = assembleCombos('bottoms', evaluations, categoryMap);

    expect(result1.combos.map(c => c.id)).toEqual(result2.combos.map(c => c.id));
  });

  it('computes correct tierFloor (minimum tier across items)', () => {
    const evaluations = [
      createMockEvaluation('top-high', 'HIGH', 0.85, 'tops_bottoms'),
      createMockEvaluation('shoes-medium', 'MEDIUM', 0.72, 'bottoms_shoes'),
    ];

    const categoryMap = createCategoryMap([
      { id: 'top-high', category: 'tops' },
      { id: 'shoes-medium', category: 'shoes' },
    ]);

    const result = assembleCombos('bottoms', evaluations, categoryMap);

    // HIGH + MEDIUM = MEDIUM floor
    expect(result.combos[0].tierFloor).toBe('MEDIUM');
  });

  it('computes correct avgScore', () => {
    const evaluations = [
      createMockEvaluation('top-1', 'HIGH', 0.80, 'tops_bottoms'),
      createMockEvaluation('shoes-1', 'HIGH', 0.90, 'bottoms_shoes'),
    ];

    const categoryMap = createCategoryMap([
      { id: 'top-1', category: 'tops' },
      { id: 'shoes-1', category: 'shoes' },
    ]);

    const result = assembleCombos('bottoms', evaluations, categoryMap);

    // (0.80 + 0.90) / 2 = 0.85
    expect(result.combos[0].avgScore).toBeCloseTo(0.85, 2);
  });
});

// ============================================
// INVARIANT TESTS
// ============================================

describe('Invariants', () => {
  it('CE is single source of truth - no score modification', () => {
    const originalScore = 0.85;
    const evaluations = [
      createMockEvaluation('top-1', 'HIGH', originalScore, 'tops_bottoms'),
      createMockEvaluation('shoes-1', 'HIGH', 0.88, 'bottoms_shoes'),
    ];

    const categoryMap = createCategoryMap([
      { id: 'top-1', category: 'tops' },
      { id: 'shoes-1', category: 'shoes' },
    ]);

    const result = assembleCombos('bottoms', evaluations, categoryMap);

    // Find the candidate for top-1
    const topCandidate = result.combos[0].candidates.find(c => c.itemId === 'top-1');
    expect(topCandidate?.score).toBe(originalScore);
  });

  it('combo ID is deterministic from item IDs', () => {
    const evaluations = [
      createMockEvaluation('top-abc', 'HIGH', 0.85, 'tops_bottoms'),
      createMockEvaluation('shoes-xyz', 'HIGH', 0.88, 'bottoms_shoes'),
    ];

    const categoryMap = createCategoryMap([
      { id: 'top-abc', category: 'tops' },
      { id: 'shoes-xyz', category: 'shoes' },
    ]);

    const result = assembleCombos('bottoms', evaluations, categoryMap);

    // ID should be sorted item IDs joined
    expect(result.combos[0].id).toBe('shoes-xyz_top-abc');
  });
});

// ============================================
// DRESS-BASED COMBO TESTS
// ============================================

describe('Dress-based Combos', () => {
  describe('getRequiredSlotsToFill with dresses', () => {
    it('returns only SHOES when scanning a dress', () => {
      const slots = getRequiredSlotsToFill('dresses');
      expect(slots).toEqual(['SHOES']);
    });
  });

  describe('getDressTrackSlotsToFill', () => {
    it('returns null when scanning a dress (already using dress)', () => {
      expect(getDressTrackSlotsToFill('dresses')).toBeNull();
    });

    it('returns null when scanning tops (dress replaces top)', () => {
      expect(getDressTrackSlotsToFill('tops')).toBeNull();
    });

    it('returns null when scanning bottoms (dress replaces bottom)', () => {
      expect(getDressTrackSlotsToFill('bottoms')).toBeNull();
    });

    it('returns [DRESS] when scanning shoes', () => {
      expect(getDressTrackSlotsToFill('shoes')).toEqual(['DRESS']);
    });

    it('returns [DRESS, SHOES] when scanning outerwear', () => {
      expect(getDressTrackSlotsToFill('outerwear')).toEqual(['DRESS', 'SHOES']);
    });
  });

  describe('generateCombos with dress track', () => {
    it('generates DRESS + scanned SHOES combos when scanning shoes', () => {
      const candidates: CandidatesBySlot = {
        TOP: [{ itemId: 'top-1', slot: 'TOP', tier: 'HIGH', score: 0.85, evaluation: createMockEvaluation('top-1', 'HIGH', 0.85) }],
        BOTTOM: [{ itemId: 'bottom-1', slot: 'BOTTOM', tier: 'HIGH', score: 0.82, evaluation: createMockEvaluation('bottom-1', 'HIGH', 0.82) }],
        SHOES: [],
        OUTERWEAR: [],
        DRESS: [{ itemId: 'dress-1', slot: 'DRESS', tier: 'HIGH', score: 0.90, evaluation: createMockEvaluation('dress-1', 'HIGH', 0.90, 'dresses_shoes') }],
      };

      const combos = generateCombos(candidates, 'shoes');

      // Should have both standard (TOP+BOTTOM) and dress track combos
      expect(combos.length).toBeGreaterThan(0);

      // Find dress combo
      const dressCombo = combos.find(c => c.slots.DRESS);
      expect(dressCombo).toBeDefined();
      expect(dressCombo?.slots.DRESS).toBe('dress-1');
      expect(dressCombo?.slots.TOP).toBeUndefined();
      expect(dressCombo?.slots.BOTTOM).toBeUndefined();
    });

    it('generates only dress-based combos when scanning a dress', () => {
      const candidates: CandidatesBySlot = {
        TOP: [],
        BOTTOM: [],
        SHOES: [{ itemId: 'shoes-1', slot: 'SHOES', tier: 'HIGH', score: 0.88, evaluation: createMockEvaluation('shoes-1', 'HIGH', 0.88, 'dresses_shoes') }],
        OUTERWEAR: [],
        DRESS: [],
      };

      const combos = generateCombos(candidates, 'dresses');

      expect(combos.length).toBeGreaterThan(0);
      expect(combos[0].slots.SHOES).toBe('shoes-1');
      // No TOP or BOTTOM needed when dress is scanned
      expect(combos[0].slots.TOP).toBeUndefined();
      expect(combos[0].slots.BOTTOM).toBeUndefined();
    });
  });

  describe('assembleCombos with dresses', () => {
    it('assembles DRESS + SHOES combo when scanning a dress', () => {
      const evaluations = [
        createMockEvaluation('shoes-1', 'HIGH', 0.88, 'dresses_shoes'),
      ];

      const categoryMap = createCategoryMap([
        { id: 'shoes-1', category: 'shoes' },
      ]);

      const result = assembleCombos('dresses', evaluations, categoryMap);

      expect(result.canFormCombos).toBe(true);
      expect(result.combos.length).toBeGreaterThan(0);
      expect(result.combos[0].slots.SHOES).toBe('shoes-1');
    });

    it('includes both standard and dress combos when scanning shoes', () => {
      const evaluations = [
        createMockEvaluation('top-1', 'HIGH', 0.85, 'tops_shoes'),
        createMockEvaluation('bottom-1', 'HIGH', 0.82, 'bottoms_shoes'),
        createMockEvaluation('dress-1', 'HIGH', 0.90, 'dresses_shoes'),
      ];

      const categoryMap = createCategoryMap([
        { id: 'top-1', category: 'tops' },
        { id: 'bottom-1', category: 'bottoms' },
        { id: 'dress-1', category: 'dresses' },
      ]);

      const result = assembleCombos('shoes', evaluations, categoryMap);

      expect(result.canFormCombos).toBe(true);

      // Should have standard combo (TOP + BOTTOM)
      const standardCombo = result.combos.find(c => c.slots.TOP && c.slots.BOTTOM);
      expect(standardCombo).toBeDefined();

      // Should have dress combo (DRESS only, since shoes is scanned)
      const dressCombo = result.combos.find(c => c.slots.DRESS);
      expect(dressCombo).toBeDefined();
    });

    it('returns missing slots for dress track when no dresses available', () => {
      const evaluations = [
        createMockEvaluation('top-1', 'HIGH', 0.85, 'tops_shoes'),
        createMockEvaluation('bottom-1', 'HIGH', 0.82, 'bottoms_shoes'),
        // No dress evaluations
      ];

      const categoryMap = createCategoryMap([
        { id: 'top-1', category: 'tops' },
        { id: 'bottom-1', category: 'bottoms' },
      ]);

      const result = assembleCombos('shoes', evaluations, categoryMap);

      // Should still form standard combos even without dresses
      expect(result.canFormCombos).toBe(true);
      expect(result.combos.length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// OUTERWEAR DECORATION TESTS
// ============================================

describe('Outerwear Decoration', () => {
  describe('decorateWithOuterwear', () => {
    it('attaches HIGH tier outerwear to combos', () => {
      const baseCombos: AssembledCombo[] = [
        {
          id: 'combo-1',
          slots: { TOP: 'top-1', BOTTOM: 'bottom-1', SHOES: 'shoes-1' },
          candidates: [],
          tierFloor: 'HIGH',
          avgScore: 0.85,
          reasons: [],
        },
      ];

      const outerwearCandidates: SlotCandidate[] = [
        {
          itemId: 'coat-1',
          slot: 'OUTERWEAR',
          tier: 'HIGH',
          score: 0.90,
          evaluation: createMockEvaluation('coat-1', 'HIGH', 0.90, 'tops_outerwear'),
        },
      ];

      const decorated = decorateWithOuterwear(baseCombos, outerwearCandidates, 'bottoms');

      expect(decorated[0].optionalOuterwear).toBeDefined();
      expect(decorated[0].optionalOuterwear?.itemId).toBe('coat-1');
      expect(decorated[0].optionalOuterwear?.tier).toBe('HIGH');
      // tierFloor should remain unchanged (outerwear is bonus)
      expect(decorated[0].tierFloor).toBe('HIGH');
    });

    it('prefers HIGH tier over MEDIUM tier outerwear', () => {
      const baseCombos: AssembledCombo[] = [
        {
          id: 'combo-1',
          slots: { TOP: 'top-1', BOTTOM: 'bottom-1', SHOES: 'shoes-1' },
          candidates: [],
          tierFloor: 'HIGH',
          avgScore: 0.85,
          reasons: [],
        },
      ];

      const outerwearCandidates: SlotCandidate[] = [
        {
          itemId: 'coat-medium',
          slot: 'OUTERWEAR',
          tier: 'MEDIUM',
          score: 0.95, // Higher score but lower tier
          evaluation: createMockEvaluation('coat-medium', 'MEDIUM', 0.95, 'tops_outerwear'),
        },
        {
          itemId: 'coat-high',
          slot: 'OUTERWEAR',
          tier: 'HIGH',
          score: 0.80, // Lower score but higher tier
          evaluation: createMockEvaluation('coat-high', 'HIGH', 0.80, 'tops_outerwear'),
        },
      ];

      const decorated = decorateWithOuterwear(baseCombos, outerwearCandidates, 'bottoms');

      expect(decorated[0].optionalOuterwear?.itemId).toBe('coat-high');
      expect(decorated[0].optionalOuterwear?.tier).toBe('HIGH');
    });

    it('excludes LOW tier outerwear when includeLowTier=false', () => {
      const baseCombos: AssembledCombo[] = [
        {
          id: 'combo-1',
          slots: { TOP: 'top-1', BOTTOM: 'bottom-1', SHOES: 'shoes-1' },
          candidates: [],
          tierFloor: 'HIGH',
          avgScore: 0.85,
          reasons: [],
        },
      ];

      const outerwearCandidates: SlotCandidate[] = [
        {
          itemId: 'coat-low',
          slot: 'OUTERWEAR',
          tier: 'LOW',
          score: 0.50,
          evaluation: createMockEvaluation('coat-low', 'LOW', 0.50, 'tops_outerwear'),
        },
      ];

      const decorated = decorateWithOuterwear(baseCombos, outerwearCandidates, 'bottoms', {
        maxCandidatesPerSlot: 10,
        maxCombos: 12,
        includeLowTier: false,
        maxReasonsPerCombo: 4,
      });

      // Should not attach LOW tier outerwear
      expect(decorated[0].optionalOuterwear).toBeUndefined();
    });

    it('includes LOW tier outerwear when includeLowTier=true', () => {
      const baseCombos: AssembledCombo[] = [
        {
          id: 'combo-1',
          slots: { TOP: 'top-1', BOTTOM: 'bottom-1', SHOES: 'shoes-1' },
          candidates: [],
          tierFloor: 'HIGH',
          avgScore: 0.85,
          reasons: [],
        },
      ];

      const outerwearCandidates: SlotCandidate[] = [
        {
          itemId: 'coat-low',
          slot: 'OUTERWEAR',
          tier: 'LOW',
          score: 0.50,
          evaluation: createMockEvaluation('coat-low', 'LOW', 0.50, 'tops_outerwear'),
        },
      ];

      const decorated = decorateWithOuterwear(baseCombos, outerwearCandidates, 'bottoms', {
        maxCandidatesPerSlot: 10,
        maxCombos: 12,
        includeLowTier: true,
        maxReasonsPerCombo: 4,
      });

      expect(decorated[0].optionalOuterwear).toBeDefined();
      expect(decorated[0].optionalOuterwear?.itemId).toBe('coat-low');
    });

    it('skips outerwear decoration when scanning outerwear', () => {
      const baseCombos: AssembledCombo[] = [
        {
          id: 'combo-1',
          slots: { TOP: 'top-1', BOTTOM: 'bottom-1', SHOES: 'shoes-1' },
          candidates: [],
          tierFloor: 'HIGH',
          avgScore: 0.85,
          reasons: [],
        },
      ];

      const outerwearCandidates: SlotCandidate[] = [
        {
          itemId: 'coat-1',
          slot: 'OUTERWEAR',
          tier: 'HIGH',
          score: 0.90,
          evaluation: createMockEvaluation('coat-1', 'HIGH', 0.90, 'tops_outerwear'),
        },
      ];

      // Scanning outerwear - should not add more outerwear
      const decorated = decorateWithOuterwear(baseCombos, outerwearCandidates, 'outerwear');

      expect(decorated[0].optionalOuterwear).toBeUndefined();
    });

    it('returns combos unchanged when no outerwear candidates', () => {
      const baseCombos: AssembledCombo[] = [
        {
          id: 'combo-1',
          slots: { TOP: 'top-1', BOTTOM: 'bottom-1', SHOES: 'shoes-1' },
          candidates: [],
          tierFloor: 'HIGH',
          avgScore: 0.85,
          reasons: [],
        },
      ];

      const decorated = decorateWithOuterwear(baseCombos, [], 'bottoms');

      expect(decorated[0].optionalOuterwear).toBeUndefined();
    });
  });

  describe('assembleCombos with outerwear', () => {
    it('attaches outerwear to dress + shoes combo when scanning dress', () => {
      const evaluations = [
        createMockEvaluation('shoes-1', 'HIGH', 0.88, 'dresses_shoes'),
        createMockEvaluation('coat-1', 'HIGH', 0.85, 'dresses_outerwear'),
      ];

      const categoryMap = createCategoryMap([
        { id: 'shoes-1', category: 'shoes' },
        { id: 'coat-1', category: 'outerwear' },
      ]);

      const result = assembleCombos('dresses', evaluations, categoryMap);

      expect(result.canFormCombos).toBe(true);
      expect(result.combos[0].slots.SHOES).toBe('shoes-1');
      expect(result.combos[0].optionalOuterwear).toBeDefined();
      expect(result.combos[0].optionalOuterwear?.itemId).toBe('coat-1');
      expect(result.combos[0].optionalOuterwear?.tier).toBe('HIGH');
    });

    it('outerwear does not affect tierFloor', () => {
      const evaluations = [
        createMockEvaluation('shoes-1', 'HIGH', 0.88, 'dresses_shoes'),
        createMockEvaluation('coat-1', 'MEDIUM', 0.70, 'dresses_outerwear'),
      ];

      const categoryMap = createCategoryMap([
        { id: 'shoes-1', category: 'shoes' },
        { id: 'coat-1', category: 'outerwear' },
      ]);

      const result = assembleCombos('dresses', evaluations, categoryMap);

      // tierFloor should be HIGH (from shoes), not MEDIUM (from coat)
      expect(result.combos[0].tierFloor).toBe('HIGH');
      expect(result.combos[0].optionalOuterwear?.tier).toBe('MEDIUM');
    });
  });
});
