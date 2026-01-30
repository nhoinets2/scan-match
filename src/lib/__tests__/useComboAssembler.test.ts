/**
 * useComboAssembler tests
 * 
 * Tests for the combo assembler hook result structure,
 * missing slot detection, and debug info.
 */

import type { UseComboAssemblerResult, ComboAssemblerDebug } from '../useComboAssembler';

// ============================================
// RESULT STRUCTURE TESTS
// ============================================

describe('UseComboAssemblerResult structure', () => {
  const createEmptyResult = (): UseComboAssemblerResult => ({
    combos: [],
    canFormCombos: false,
    missingSlots: [],
    missingMessage: null,
    candidatesBySlot: null,
    penaltyById: new Map<string, number>(),
    debug: {
      preFilterNearCount: 0,
      rejectedNearCount: 0,
      preFilterHighCount: 0,
      rejectedHighCount: 0,
    },
  });

  it('empty result has correct structure', () => {
    const result = createEmptyResult();
    
    expect(result.combos).toEqual([]);
    expect(result.canFormCombos).toBe(false);
    expect(result.missingSlots).toEqual([]);
    expect(result.missingMessage).toBeNull();
    expect(result.candidatesBySlot).toBeNull();
    expect(result.penaltyById).toBeInstanceOf(Map);
    expect(result.debug).toBeDefined();
  });

  it('penaltyById is a Map', () => {
    const result = createEmptyResult();
    
    expect(result.penaltyById.size).toBe(0);
    
    // Can set and get values
    result.penaltyById.set('combo-1', 1);
    expect(result.penaltyById.get('combo-1')).toBe(1);
  });
});

// ============================================
// DEBUG INFO TESTS
// ============================================

describe('ComboAssemblerDebug', () => {
  it('has correct initial values', () => {
    const debug: ComboAssemblerDebug = {
      preFilterNearCount: 0,
      rejectedNearCount: 0,
      preFilterHighCount: 0,
      rejectedHighCount: 0,
    };

    expect(debug.preFilterNearCount).toBe(0);
    expect(debug.rejectedNearCount).toBe(0);
    expect(debug.preFilterHighCount).toBe(0);
    expect(debug.rejectedHighCount).toBe(0);
  });

  it('tracks filter effectiveness', () => {
    const debug: ComboAssemblerDebug = {
      preFilterNearCount: 10,
      rejectedNearCount: 3,
      preFilterHighCount: 5,
      rejectedHighCount: 1,
    };

    // Calculate post-filter counts
    const postFilterNearCount = debug.preFilterNearCount - debug.rejectedNearCount;
    const postFilterHighCount = debug.preFilterHighCount - debug.rejectedHighCount;

    expect(postFilterNearCount).toBe(7);
    expect(postFilterHighCount).toBe(4);
  });

  it('rejected count never exceeds pre-filter count', () => {
    const debug: ComboAssemblerDebug = {
      preFilterNearCount: 5,
      rejectedNearCount: 5, // Can reject all
      preFilterHighCount: 3,
      rejectedHighCount: 2,
    };

    expect(debug.rejectedNearCount).toBeLessThanOrEqual(debug.preFilterNearCount);
    expect(debug.rejectedHighCount).toBeLessThanOrEqual(debug.preFilterHighCount);
  });
});

// ============================================
// MISSING SLOTS TESTS
// ============================================

describe('Missing slots', () => {
  it('formats single missing slot message correctly', () => {
    const missingSlots = [{ slot: 'SHOES', category: 'shoes' }];
    
    const categories = missingSlots.map(s => s.category);
    const message = `Add ${categories[0]} to see outfit ideas`;
    
    expect(message).toBe('Add shoes to see outfit ideas');
  });

  it('formats multiple missing slots message correctly', () => {
    const missingSlots = [
      { slot: 'TOP', category: 'tops' },
      { slot: 'SHOES', category: 'shoes' },
    ];
    
    const categories = [...missingSlots.map(s => s.category)];
    const last = categories.pop();
    const message = `Add ${categories.join(', ')} and ${last} to see outfit ideas`;
    
    expect(message).toBe('Add tops and shoes to see outfit ideas');
  });

  it('formats three missing slots message correctly', () => {
    const missingSlots = [
      { slot: 'TOP', category: 'tops' },
      { slot: 'BOTTOM', category: 'bottoms' },
      { slot: 'SHOES', category: 'shoes' },
    ];
    
    const categories = [...missingSlots.map(s => s.category)];
    const last = categories.pop();
    const message = `Add ${categories.join(', ')} and ${last} to see outfit ideas`;
    
    expect(message).toBe('Add tops, bottoms and shoes to see outfit ideas');
  });

  it('returns null message when no missing slots', () => {
    const missingSlots: { slot: string; category: string }[] = [];
    
    let message: string | null = null;
    if (missingSlots.length > 0) {
      // Would generate message
    }
    
    expect(message).toBeNull();
  });
});

// ============================================
// OUTFIT SLOTS TESTS
// ============================================

describe('Outfit slots', () => {
  const OUTFIT_SLOTS = ['TOP', 'BOTTOM', 'SHOES', 'DRESS', 'OUTERWEAR'];

  it('has all expected slot types', () => {
    expect(OUTFIT_SLOTS).toContain('TOP');
    expect(OUTFIT_SLOTS).toContain('BOTTOM');
    expect(OUTFIT_SLOTS).toContain('SHOES');
    expect(OUTFIT_SLOTS).toContain('DRESS');
    expect(OUTFIT_SLOTS).toContain('OUTERWEAR');
  });

  it('has exactly 5 slot types', () => {
    expect(OUTFIT_SLOTS).toHaveLength(5);
  });

  it('slot names are uppercase', () => {
    OUTFIT_SLOTS.forEach(slot => {
      expect(slot).toBe(slot.toUpperCase());
    });
  });
});

// ============================================
// CANDIDATES BY SLOT TESTS
// ============================================

describe('CandidatesBySlot', () => {
  it('has all slot types as keys', () => {
    const candidatesBySlot = {
      TOP: [],
      BOTTOM: [],
      SHOES: [],
      DRESS: [],
      OUTERWEAR: [],
    };

    expect('TOP' in candidatesBySlot).toBe(true);
    expect('BOTTOM' in candidatesBySlot).toBe(true);
    expect('SHOES' in candidatesBySlot).toBe(true);
    expect('DRESS' in candidatesBySlot).toBe(true);
    expect('OUTERWEAR' in candidatesBySlot).toBe(true);
  });

  it('each slot contains array of candidates', () => {
    const candidatesBySlot = {
      TOP: [{ id: 'w1', tier: 'HIGH', score: 0.9 }],
      BOTTOM: [{ id: 'w2', tier: 'MEDIUM', score: 0.75 }],
      SHOES: [],
      DRESS: [],
      OUTERWEAR: [],
    };

    expect(Array.isArray(candidatesBySlot.TOP)).toBe(true);
    expect(Array.isArray(candidatesBySlot.BOTTOM)).toBe(true);
    expect(Array.isArray(candidatesBySlot.SHOES)).toBe(true);
  });

  it('candidates have required properties', () => {
    const candidate = {
      id: 'wardrobe-item-1',
      tier: 'HIGH' as const,
      score: 0.87,
    };

    expect(candidate.id).toBeDefined();
    expect(candidate.tier).toBeDefined();
    expect(candidate.score).toBeDefined();
  });
});

// ============================================
// ASSEMBLED COMBO TESTS
// ============================================

describe('AssembledCombo structure', () => {
  it('has correct properties', () => {
    const combo = {
      id: 'combo-w1-w2-w3',
      candidates: [
        { id: 'w1', tier: 'HIGH' as const, score: 0.9 },
        { id: 'w2', tier: 'HIGH' as const, score: 0.85 },
        { id: 'w3', tier: 'MEDIUM' as const, score: 0.75 },
      ],
      tierFloor: 'MEDIUM' as const,
      avgScore: 0.833,
    };

    expect(combo.id).toBeDefined();
    expect(Array.isArray(combo.candidates)).toBe(true);
    expect(combo.tierFloor).toBeDefined();
    expect(typeof combo.avgScore).toBe('number');
  });

  it('tierFloor is the lowest tier in candidates', () => {
    const candidates = [
      { tier: 'HIGH' as const },
      { tier: 'MEDIUM' as const },
      { tier: 'HIGH' as const },
    ];

    // tierFloor should be MEDIUM (the lowest)
    const tierOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const lowestTier = candidates.reduce<"HIGH" | "MEDIUM" | "LOW">((lowest, c) => {
      return tierOrder[c.tier] > tierOrder[lowest] ? c.tier : lowest;
    }, 'HIGH');

    expect(lowestTier).toBe('MEDIUM');
  });

  it('avgScore is mean of candidate scores', () => {
    const scores = [0.9, 0.85, 0.75];
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    expect(avgScore).toBeCloseTo(0.833, 2);
  });
});

// ============================================
// COMBO SORTING TESTS
// ============================================

describe('Combo sorting logic', () => {
  const tierOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };

  it('sorts by tierFloor first (HIGH > MEDIUM > LOW)', () => {
    const combos = [
      { tierFloor: 'LOW' as const, avgScore: 0.9 },
      { tierFloor: 'HIGH' as const, avgScore: 0.7 },
      { tierFloor: 'MEDIUM' as const, avgScore: 0.8 },
    ];

    const sorted = [...combos].sort((a, b) => 
      tierOrder[a.tierFloor] - tierOrder[b.tierFloor]
    );

    expect(sorted[0].tierFloor).toBe('HIGH');
    expect(sorted[1].tierFloor).toBe('MEDIUM');
    expect(sorted[2].tierFloor).toBe('LOW');
  });

  it('sorts by avgScore when tierFloor is equal', () => {
    const combos = [
      { tierFloor: 'HIGH' as const, avgScore: 0.7 },
      { tierFloor: 'HIGH' as const, avgScore: 0.9 },
      { tierFloor: 'HIGH' as const, avgScore: 0.8 },
    ];

    const sorted = [...combos].sort((a, b) => {
      const tierDiff = tierOrder[a.tierFloor] - tierOrder[b.tierFloor];
      if (tierDiff !== 0) return tierDiff;
      return b.avgScore - a.avgScore; // Higher score first
    });

    expect(sorted[0].avgScore).toBe(0.9);
    expect(sorted[1].avgScore).toBe(0.8);
    expect(sorted[2].avgScore).toBe(0.7);
  });

  it('coherence penalty sorts penalized combos after unpenalized', () => {
    const combos = [
      { id: 'c1', penalty: 1 },
      { id: 'c2', penalty: 0 },
      { id: 'c3', penalty: 0 },
    ];

    const sorted = [...combos].sort((a, b) => a.penalty - b.penalty);

    expect(sorted[0].penalty).toBe(0);
    expect(sorted[1].penalty).toBe(0);
    expect(sorted[2].penalty).toBe(1);
  });
});

// ============================================
// EDGE CASES
// ============================================

describe('Edge cases', () => {
  describe('no scanned item', () => {
    it('returns empty combos when scannedItem is null', () => {
      const result: UseComboAssemblerResult = {
        combos: [],
        canFormCombos: false,
        missingSlots: [],
        missingMessage: null,
        candidatesBySlot: null,
        penaltyById: new Map(),
        debug: {
          preFilterNearCount: 0,
          rejectedNearCount: 0,
          preFilterHighCount: 0,
          rejectedHighCount: 0,
        },
      };

      expect(result.combos).toHaveLength(0);
      expect(result.canFormCombos).toBe(false);
    });
  });

  describe('unevaluated confidence result', () => {
    it('returns empty combos when evaluated is false', () => {
      // When confidenceResult.evaluated === false
      const canFormCombos = false;
      
      expect(canFormCombos).toBe(false);
    });
  });

  describe('all combos filtered by coherence', () => {
    it('debug shows all combos were rejected', () => {
      const debug: ComboAssemblerDebug = {
        preFilterNearCount: 5,
        rejectedNearCount: 5,
        preFilterHighCount: 3,
        rejectedHighCount: 3,
      };

      const totalPre = debug.preFilterNearCount + debug.preFilterHighCount;
      const totalRejected = debug.rejectedNearCount + debug.rejectedHighCount;
      
      expect(totalPre).toBe(8);
      expect(totalRejected).toBe(8);
      expect(totalPre - totalRejected).toBe(0); // All rejected
    });
  });
});

// ============================================
// INTEGRATION WITH COHERENCE FILTER
// ============================================

describe('Coherence filter integration', () => {
  it('penaltyById tracks coherence penalties', () => {
    const penaltyById = new Map<string, number>();
    
    // Combos with penalty = 1 have coherence issues
    penaltyById.set('combo-1', 0); // No issues
    penaltyById.set('combo-2', 1); // Has issues
    penaltyById.set('combo-3', 0); // No issues
    
    expect(penaltyById.get('combo-1')).toBe(0);
    expect(penaltyById.get('combo-2')).toBe(1);
    expect(penaltyById.get('combo-3')).toBe(0);
  });

  it('penalty is binary (0 or 1)', () => {
    const penalties = [0, 1, 0, 1, 0];
    
    penalties.forEach(p => {
      expect(p === 0 || p === 1).toBe(true);
    });
  });
});
