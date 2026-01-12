/**
 * useResultsTabs Hook Tests
 *
 * Tests for the results screen tab state logic:
 * - Tab visibility (showHigh, showNear, showTabs, showEmptyState)
 * - Outfit filtering by tierFloor
 * - Empty reason discriminator
 * - Tab persistence behavior
 */

// Define __DEV__ for test environment
// @ts-expect-error - __DEV__ is a React Native global
globalThis.__DEV__ = true;

import type { ConfidenceEngineResult, EnrichedMatch } from '../useConfidenceEngine';
import type { UseComboAssemblerResult } from '../useComboAssembler';
import type { AssembledCombo, SlotCandidate } from '../combo-assembler';
import type { PairEvaluation, ConfidenceTier } from '../confidence-engine';
import type { WardrobeItem } from '../types';

// ============================================
// TEST HELPERS
// ============================================

function createMockPairEvaluation(
  overrides: Partial<PairEvaluation> = {}
): PairEvaluation {
  return {
    pair_type: 'tops_bottoms',
    raw_score: 0.85,
    confidence_tier: 'HIGH',
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
    item_a_id: 'scanned-1',
    item_b_id: 'wardrobe-1',
    ...overrides,
  };
}

function createMockEnrichedMatch(
  overrides: Partial<EnrichedMatch> = {}
): EnrichedMatch {
  return {
    evaluation: createMockPairEvaluation(),
    wardrobeItem: {
      id: 'wardrobe-1',
      category: 'tops',
      imageUri: 'test.jpg',
      colors: [{ hex: '#000000', name: 'black' }],
      createdAt: Date.now(),
    } as WardrobeItem,
    explanation: null,
    explanationAllowed: false,
    ...overrides,
  };
}

function createMockSlotCandidate(
  overrides: Partial<SlotCandidate> = {}
): SlotCandidate {
  return {
    itemId: 'item-1',
    slot: 'TOP',
    tier: 'HIGH',
    score: 0.85,
    evaluation: createMockPairEvaluation(),
    ...overrides,
  };
}

function createMockCombo(
  tierFloor: ConfidenceTier,
  id: string = 'combo-1'
): AssembledCombo {
  return {
    id,
    slots: { TOP: 'top-1', BOTTOM: 'bottom-1', SHOES: 'shoes-1' },
    candidates: [
      createMockSlotCandidate({ tier: tierFloor }),
      createMockSlotCandidate({ tier: tierFloor, slot: 'BOTTOM' }),
      createMockSlotCandidate({ tier: tierFloor, slot: 'SHOES' }),
    ],
    tierFloor,
    avgScore: 0.85,
    reasons: [],
  };
}

function createMockConfidenceResult(
  overrides: Partial<ConfidenceEngineResult> = {}
): ConfidenceEngineResult {
  return {
    evaluated: true,
    debugTier: 'HIGH',
    showMatchesSection: true,
    matches: [],
    highMatchCount: 0,
    nearMatchCount: 0,
    bestMatch: null,
    suggestionsMode: 'A',
    modeASuggestions: null,
    modeBSuggestions: null,
    uiVibeForCopy: 'casual',
    rawEvaluation: {
      show_matches_section: true,
      outfit_confidence: 'HIGH',
      matches: [],
      near_matches: [],
      suggestions_mode: 'A',
      matched_categories: [],
    },
    ...overrides,
  };
}

function createMockComboResult(
  overrides: Partial<UseComboAssemblerResult> = {}
): UseComboAssemblerResult {
  const defaultDebug = {
    preFilterNearCount: 0,
    rejectedNearCount: 0,
    preFilterHighCount: 0,
    rejectedHighCount: 0,
  };
  const { debug, ...rest } = overrides;
  return {
    combos: [],
    canFormCombos: true,
    missingSlots: [],
    missingMessage: null,
    candidatesBySlot: null,
    penaltyById: new Map<string, number>(),
    debug: debug ?? defaultDebug,
    ...rest,
  };
}

// ============================================
// PURE LOGIC TESTS (without React hooks)
// ============================================

/**
 * Since useResultsTabs is a React hook, we test the core logic functions directly.
 * These mirror the computations inside the hook.
 */

describe('Tab visibility logic', () => {
  function computeTabVisibility(
    highOutfits: AssembledCombo[],
    nearOutfits: AssembledCombo[],
    highMatches: EnrichedMatch[],
    nearMatches: PairEvaluation[]
  ) {
    const showHigh = highOutfits.length > 0 || highMatches.length > 0;
    const showNear = nearOutfits.length > 0 || nearMatches.length > 0;
    const showTabs = showHigh && showNear;
    const showEmptyState = !showHigh && !showNear;

    return { showHigh, showNear, showTabs, showEmptyState };
  }

  describe('Scenario: HIGH only', () => {
    it('shows HIGH tab, hides NEAR tab, no segmented control', () => {
      const highOutfits = [createMockCombo('HIGH')];
      const nearOutfits: AssembledCombo[] = [];
      const highMatches = [createMockEnrichedMatch()];
      const nearMatches: PairEvaluation[] = [];

      const result = computeTabVisibility(
        highOutfits,
        nearOutfits,
        highMatches,
        nearMatches
      );

      expect(result.showHigh).toBe(true);
      expect(result.showNear).toBe(false);
      expect(result.showTabs).toBe(false);
      expect(result.showEmptyState).toBe(false);
    });

    it('shows HIGH tab even with only matches (no outfits)', () => {
      const highOutfits: AssembledCombo[] = [];
      const nearOutfits: AssembledCombo[] = [];
      const highMatches = [createMockEnrichedMatch()];
      const nearMatches: PairEvaluation[] = [];

      const result = computeTabVisibility(
        highOutfits,
        nearOutfits,
        highMatches,
        nearMatches
      );

      expect(result.showHigh).toBe(true);
      expect(result.showNear).toBe(false);
      expect(result.showTabs).toBe(false);
    });
  });

  describe('Scenario: NEAR only', () => {
    it('shows NEAR tab, hides HIGH tab, no segmented control', () => {
      const highOutfits: AssembledCombo[] = [];
      const nearOutfits = [createMockCombo('MEDIUM')];
      const highMatches: EnrichedMatch[] = [];
      const nearMatches = [createMockPairEvaluation({ confidence_tier: 'MEDIUM' })];

      const result = computeTabVisibility(
        highOutfits,
        nearOutfits,
        highMatches,
        nearMatches
      );

      expect(result.showHigh).toBe(false);
      expect(result.showNear).toBe(true);
      expect(result.showTabs).toBe(false);
      expect(result.showEmptyState).toBe(false);
    });

    it('shows NEAR tab even with only near matches (no outfits)', () => {
      const highOutfits: AssembledCombo[] = [];
      const nearOutfits: AssembledCombo[] = [];
      const highMatches: EnrichedMatch[] = [];
      const nearMatches = [createMockPairEvaluation({ confidence_tier: 'MEDIUM' })];

      const result = computeTabVisibility(
        highOutfits,
        nearOutfits,
        highMatches,
        nearMatches
      );

      expect(result.showHigh).toBe(false);
      expect(result.showNear).toBe(true);
      expect(result.showTabs).toBe(false);
    });
  });

  describe('Scenario: Both tabs', () => {
    it('shows both tabs with segmented control', () => {
      const highOutfits = [createMockCombo('HIGH')];
      const nearOutfits = [createMockCombo('MEDIUM')];
      const highMatches = [createMockEnrichedMatch()];
      const nearMatches = [createMockPairEvaluation({ confidence_tier: 'MEDIUM' })];

      const result = computeTabVisibility(
        highOutfits,
        nearOutfits,
        highMatches,
        nearMatches
      );

      expect(result.showHigh).toBe(true);
      expect(result.showNear).toBe(true);
      expect(result.showTabs).toBe(true);
      expect(result.showEmptyState).toBe(false);
    });

    it('shows segmented control even with only matches (no outfits)', () => {
      const highOutfits: AssembledCombo[] = [];
      const nearOutfits: AssembledCombo[] = [];
      const highMatches = [createMockEnrichedMatch()];
      const nearMatches = [createMockPairEvaluation({ confidence_tier: 'MEDIUM' })];

      const result = computeTabVisibility(
        highOutfits,
        nearOutfits,
        highMatches,
        nearMatches
      );

      expect(result.showHigh).toBe(true);
      expect(result.showNear).toBe(true);
      expect(result.showTabs).toBe(true);
    });
  });

  describe('Scenario: Neither tab (empty state)', () => {
    it('shows empty state when no matches and no outfits', () => {
      const highOutfits: AssembledCombo[] = [];
      const nearOutfits: AssembledCombo[] = [];
      const highMatches: EnrichedMatch[] = [];
      const nearMatches: PairEvaluation[] = [];

      const result = computeTabVisibility(
        highOutfits,
        nearOutfits,
        highMatches,
        nearMatches
      );

      expect(result.showHigh).toBe(false);
      expect(result.showNear).toBe(false);
      expect(result.showTabs).toBe(false);
      expect(result.showEmptyState).toBe(true);
    });
  });
});

describe('Outfit filtering by tierFloor', () => {
  function splitCombosByTier(combos: AssembledCombo[]) {
    const highOutfits: AssembledCombo[] = [];
    const nearOutfits: AssembledCombo[] = [];

    for (const combo of combos) {
      if (combo.tierFloor === 'HIGH') {
        highOutfits.push(combo);
      } else if (combo.tierFloor === 'MEDIUM') {
        nearOutfits.push(combo);
      }
    }

    return { highOutfits, nearOutfits };
  }

  it('splits combos correctly by tierFloor', () => {
    const combos = [
      createMockCombo('HIGH', 'high-1'),
      createMockCombo('HIGH', 'high-2'),
      createMockCombo('MEDIUM', 'medium-1'),
      createMockCombo('MEDIUM', 'medium-2'),
      createMockCombo('MEDIUM', 'medium-3'),
    ];

    const result = splitCombosByTier(combos);

    expect(result.highOutfits).toHaveLength(2);
    expect(result.nearOutfits).toHaveLength(3);
    expect(result.highOutfits.every((c) => c.tierFloor === 'HIGH')).toBe(true);
    expect(result.nearOutfits.every((c) => c.tierFloor === 'MEDIUM')).toBe(true);
  });

  it('excludes LOW tier combos', () => {
    const combos = [
      createMockCombo('HIGH', 'high-1'),
      createMockCombo('MEDIUM', 'medium-1'),
      createMockCombo('LOW', 'low-1'),
    ];

    const result = splitCombosByTier(combos);

    expect(result.highOutfits).toHaveLength(1);
    expect(result.nearOutfits).toHaveLength(1);
    // LOW is not included in either
  });

  it('handles empty combos array', () => {
    const result = splitCombosByTier([]);

    expect(result.highOutfits).toHaveLength(0);
    expect(result.nearOutfits).toHaveLength(0);
  });

  it('handles all HIGH combos', () => {
    const combos = [
      createMockCombo('HIGH', 'high-1'),
      createMockCombo('HIGH', 'high-2'),
    ];

    const result = splitCombosByTier(combos);

    expect(result.highOutfits).toHaveLength(2);
    expect(result.nearOutfits).toHaveLength(0);
  });

  it('handles all MEDIUM combos', () => {
    const combos = [
      createMockCombo('MEDIUM', 'medium-1'),
      createMockCombo('MEDIUM', 'medium-2'),
    ];

    const result = splitCombosByTier(combos);

    expect(result.highOutfits).toHaveLength(0);
    expect(result.nearOutfits).toHaveLength(2);
  });
});

describe('OutfitEmptyReasonDetails discriminator', () => {
  type OutfitEmptyReasonDetails =
    | { kind: 'missingCorePieces'; missing: { slot: string; category: string }[] }
    | { kind: 'missingHighTierCorePieces'; missing: { slot: string; category: string }[] }
    | { kind: 'hasCorePiecesButNoCombos' };

  function computeEmptyReason(
    outfits: AssembledCombo[],
    matches: EnrichedMatch[] | PairEvaluation[],
    missingSlots: { slot: string; category: string }[]
  ): OutfitEmptyReasonDetails | null {
    if (outfits.length > 0) {
      return null; // Not empty
    }

    if (missingSlots.length > 0) {
      return { kind: 'missingCorePieces', missing: missingSlots };
    }

    if (matches.length > 0) {
      return { kind: 'hasCorePiecesButNoCombos' };
    }

    return { kind: 'missingCorePieces', missing: [] };
  }

  it('returns null when outfits exist', () => {
    const result = computeEmptyReason(
      [createMockCombo('HIGH')],
      [createMockEnrichedMatch()],
      []
    );

    expect(result).toBeNull();
  });

  it('returns missingCorePieces when slots are missing', () => {
    const missingSlots = [{ slot: 'SHOES', category: 'shoes' }];

    const result = computeEmptyReason([], [createMockEnrichedMatch()], missingSlots);

    expect(result).not.toBeNull();
    expect(result?.kind).toBe('missingCorePieces');
    if (result?.kind === 'missingCorePieces') {
      expect(result.missing).toEqual(missingSlots);
    }
  });

  it('returns hasCorePiecesButNoCombos when matches exist but no outfits', () => {
    const result = computeEmptyReason([], [createMockEnrichedMatch()], []);

    expect(result).not.toBeNull();
    expect(result?.kind).toBe('hasCorePiecesButNoCombos');
  });

  it('returns missingCorePieces with empty array as fallback', () => {
    const result = computeEmptyReason([], [], []);

    expect(result).not.toBeNull();
    expect(result?.kind).toBe('missingCorePieces');
    if (result?.kind === 'missingCorePieces') {
      expect(result.missing).toEqual([]);
    }
  });
});

describe('missingHighTierCorePieces detection (Wear now only)', () => {
  // Types are imported at top of file
  type OutfitSlotLocal = 'TOP' | 'BOTTOM' | 'SHOES' | 'OUTERWEAR' | 'DRESS';
  
  type CandidatesBySlotLocal = {
    TOP: SlotCandidate[];
    BOTTOM: SlotCandidate[];
    SHOES: SlotCandidate[];
    OUTERWEAR: SlotCandidate[];
    DRESS: SlotCandidate[];
  };

  type OutfitEmptyReasonDetails =
    | { kind: 'missingCorePieces'; missing: { slot: string; category: string }[] }
    | { kind: 'missingHighTierCorePieces'; missing: { slot: string; category: string }[] }
    | { kind: 'hasCorePiecesButNoCombos' };

  const SLOT_TO_CATEGORY: Record<string, string> = {
    SHOES: 'shoes',
    BOTTOM: 'bottoms',
    TOP: 'tops',
    DRESS: 'dresses',
  };

  function computeHighTabEmptyReason(
    highOutfits: AssembledCombo[],
    highMatches: EnrichedMatch[],
    missingSlots: { slot: string; category: string }[],
    candidatesBySlot: CandidatesBySlotLocal | null
  ): OutfitEmptyReasonDetails | null {
    if (highOutfits.length > 0) {
      return null;
    }

    if (missingSlots.length > 0) {
      return { kind: 'missingCorePieces', missing: missingSlots };
    }

    // Check for missing HIGH tier pieces
    if (candidatesBySlot) {
      const requiredSlots: OutfitSlotLocal[] = candidatesBySlot.DRESS?.length > 0
        ? ['DRESS', 'SHOES']
        : ['TOP', 'BOTTOM', 'SHOES'];

      const slotsWithoutHigh = requiredSlots.filter(slot => {
        const candidates = candidatesBySlot[slot] ?? [];
        return candidates.length > 0 && !candidates.some(c => c.tier === 'HIGH');
      });

      if (slotsWithoutHigh.length > 0) {
        return {
          kind: 'missingHighTierCorePieces',
          missing: slotsWithoutHigh.map(slot => ({
            slot,
            category: SLOT_TO_CATEGORY[slot] ?? slot.toLowerCase(),
          })),
        };
      }
    }

    if (highMatches.length > 0) {
      return { kind: 'hasCorePiecesButNoCombos' };
    }

    return { kind: 'missingCorePieces', missing: [] };
  }

  function createMockCandidatesBySlot(
    slotTiers: Partial<Record<OutfitSlotLocal, ConfidenceTier[]>>
  ): CandidatesBySlotLocal {
    const result: CandidatesBySlotLocal = {
      TOP: [],
      BOTTOM: [],
      SHOES: [],
      OUTERWEAR: [],
      DRESS: [],
    };

    for (const [slot, tiers] of Object.entries(slotTiers)) {
      result[slot as OutfitSlotLocal] = (tiers as ConfidenceTier[]).map((tier, i) =>
        createMockSlotCandidate({ slot: slot as OutfitSlotLocal, tier, itemId: `${slot}-${i}` })
      );
    }

    return result;
  }

  it('returns null when HIGH outfits exist', () => {
    const result = computeHighTabEmptyReason(
      [createMockCombo('HIGH')],
      [createMockEnrichedMatch()],
      [],
      createMockCandidatesBySlot({ TOP: ['HIGH'], BOTTOM: ['HIGH'], SHOES: ['HIGH'] })
    );

    expect(result).toBeNull();
  });

  it('returns missingHighTierCorePieces when shoes only have MEDIUM candidates', () => {
    const candidatesBySlot = createMockCandidatesBySlot({
      TOP: ['HIGH'],
      BOTTOM: ['HIGH'],
      SHOES: ['MEDIUM'], // No HIGH shoes
    });

    const result = computeHighTabEmptyReason(
      [],
      [createMockEnrichedMatch()],
      [],
      candidatesBySlot
    );

    expect(result).not.toBeNull();
    expect(result?.kind).toBe('missingHighTierCorePieces');
    if (result?.kind === 'missingHighTierCorePieces') {
      expect(result.missing).toEqual([{ slot: 'SHOES', category: 'shoes' }]);
    }
  });

  it('returns missingHighTierCorePieces when bottoms only have MEDIUM candidates', () => {
    const candidatesBySlot = createMockCandidatesBySlot({
      TOP: ['HIGH'],
      BOTTOM: ['MEDIUM'], // No HIGH bottoms
      SHOES: ['HIGH'],
    });

    const result = computeHighTabEmptyReason(
      [],
      [createMockEnrichedMatch()],
      [],
      candidatesBySlot
    );

    expect(result).not.toBeNull();
    expect(result?.kind).toBe('missingHighTierCorePieces');
    if (result?.kind === 'missingHighTierCorePieces') {
      expect(result.missing).toEqual([{ slot: 'BOTTOM', category: 'bottoms' }]);
    }
  });

  it('returns missingHighTierCorePieces with multiple missing when shoes + bottoms are MEDIUM', () => {
    const candidatesBySlot = createMockCandidatesBySlot({
      TOP: ['HIGH'],
      BOTTOM: ['MEDIUM'],
      SHOES: ['MEDIUM'],
    });

    const result = computeHighTabEmptyReason(
      [],
      [createMockEnrichedMatch()],
      [],
      candidatesBySlot
    );

    expect(result).not.toBeNull();
    expect(result?.kind).toBe('missingHighTierCorePieces');
    if (result?.kind === 'missingHighTierCorePieces') {
      // Order follows required slots: TOP, BOTTOM, SHOES
      expect(result.missing).toEqual([
        { slot: 'BOTTOM', category: 'bottoms' },
        { slot: 'SHOES', category: 'shoes' },
      ]);
    }
  });

  it('prioritizes missingCorePieces over missingHighTierCorePieces', () => {
    const result = computeHighTabEmptyReason(
      [],
      [createMockEnrichedMatch()],
      [{ slot: 'SHOES', category: 'shoes' }], // Actually missing
      createMockCandidatesBySlot({ TOP: ['HIGH'], BOTTOM: ['MEDIUM'] })
    );

    expect(result?.kind).toBe('missingCorePieces');
  });
});

describe('Dynamic copy generation for missingHighTierCorePieces', () => {
  type OutfitSlot = 'TOP' | 'BOTTOM' | 'SHOES' | 'OUTERWEAR' | 'DRESS';

  const SLOT_PRIORITY: OutfitSlot[] = ['SHOES', 'BOTTOM', 'DRESS', 'TOP'];

  const SLOT_NOUN: Record<string, string> = {
    SHOES: 'shoe',
    BOTTOM: 'bottom',
    TOP: 'top',
    DRESS: 'dress',
  };

  function pickPrimaryMissingHigh(
    missing: { slot: string; category: string }[]
  ): { slot: string; category: string } | null {
    const bySlot = new Map(missing.map(m => [m.slot, m]));
    for (const slot of SLOT_PRIORITY) {
      const hit = bySlot.get(slot);
      if (hit) return hit;
    }
    return missing[0] ?? null;
  }

  function generateMissingHighCopy(primarySlot: string): string {
    const noun = SLOT_NOUN[primarySlot] ?? 'piece';
    return `We didn't find strong ${noun} matches — but you have close options in Worth trying.`;
  }

  it('generates shoe-specific copy when SHOES is missing HIGH', () => {
    const primary = pickPrimaryMissingHigh([{ slot: 'SHOES', category: 'shoes' }]);
    expect(primary?.slot).toBe('SHOES');
    expect(generateMissingHighCopy(primary!.slot)).toBe(
      "We didn't find strong shoe matches — but you have close options in Worth trying."
    );
  });

  it('generates bottom-specific copy when only BOTTOM is missing HIGH', () => {
    const primary = pickPrimaryMissingHigh([{ slot: 'BOTTOM', category: 'bottoms' }]);
    expect(primary?.slot).toBe('BOTTOM');
    expect(generateMissingHighCopy(primary!.slot)).toBe(
      "We didn't find strong bottom matches — but you have close options in Worth trying."
    );
  });

  it('prioritizes SHOES when both SHOES and BOTTOM are missing HIGH', () => {
    const primary = pickPrimaryMissingHigh([
      { slot: 'BOTTOM', category: 'bottoms' },
      { slot: 'SHOES', category: 'shoes' },
    ]);
    expect(primary?.slot).toBe('SHOES');
    expect(generateMissingHighCopy(primary!.slot)).toBe(
      "We didn't find strong shoe matches — but you have close options in Worth trying."
    );
  });

  it('generates dress-specific copy for dress track', () => {
    const primary = pickPrimaryMissingHigh([{ slot: 'DRESS', category: 'dresses' }]);
    expect(primary?.slot).toBe('DRESS');
    expect(generateMissingHighCopy(primary!.slot)).toBe(
      "We didn't find strong dress matches — but you have close options in Worth trying."
    );
  });

  it('returns null for empty missing array', () => {
    const primary = pickPrimaryMissingHigh([]);
    expect(primary).toBeNull();
  });
});

describe('Missing message generation', () => {
  function buildMissingMessage(
    missing: { slot: string; category: string }[]
  ): string | null {
    if (missing.length === 0) {
      return null;
    }

    const categories = missing.map((s) => s.category);

    if (categories.length === 1) {
      return `Add ${categories[0]} to put complete outfits together from these matches.`;
    }

    const last = categories[categories.length - 1];
    const rest = categories.slice(0, -1);
    return `Add ${rest.join(', ')} and ${last} to put complete outfits together.`;
  }

  it('returns null for empty missing slots', () => {
    expect(buildMissingMessage([])).toBeNull();
  });

  it('generates singular message for one missing category', () => {
    const result = buildMissingMessage([{ slot: 'SHOES', category: 'shoes' }]);

    expect(result).toBe('Add shoes to put complete outfits together from these matches.');
  });

  it('generates plural message for two missing categories', () => {
    const result = buildMissingMessage([
      { slot: 'BOTTOM', category: 'bottoms' },
      { slot: 'SHOES', category: 'shoes' },
    ]);

    expect(result).toBe('Add bottoms and shoes to put complete outfits together.');
  });

  it('generates plural message for three+ missing categories', () => {
    const result = buildMissingMessage([
      { slot: 'TOP', category: 'tops' },
      { slot: 'BOTTOM', category: 'bottoms' },
      { slot: 'SHOES', category: 'shoes' },
    ]);

    expect(result).toBe('Add tops, bottoms and shoes to put complete outfits together.');
  });
});

describe('getSlotQuality classification', () => {
  // Test the slot quality classification logic
  type SlotQuality = 'blocking' | 'weak' | 'confident';
  type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW';
  
  const WEAK_BEST_SCORE_THRESHOLD = 0.70;
  const WEAK_MIN_MEDIUM_COUNT = 2;

  function getSlotQuality(candidates: Array<{ tier: ConfidenceTier; score: number }> | undefined): SlotQuality {
    if (!candidates || candidates.length === 0) {
      return 'blocking';
    }

    const highCount = candidates.filter(c => c.tier === 'HIGH').length;
    if (highCount > 0) {
      return 'confident';
    }

    const mediumCandidates = candidates.filter(c => c.tier === 'MEDIUM');
    const mediumCount = mediumCandidates.length;
    const bestScore = Math.max(...candidates.map(c => c.score));

    if (bestScore < WEAK_BEST_SCORE_THRESHOLD) {
      return 'weak';
    }
    if (mediumCount < WEAK_MIN_MEDIUM_COUNT) {
      return 'weak';
    }

    return 'confident';
  }

  it('returns blocking for empty candidates', () => {
    expect(getSlotQuality([])).toBe('blocking');
    expect(getSlotQuality(undefined)).toBe('blocking');
  });

  it('returns confident when HIGH candidates exist', () => {
    const candidates = [{ tier: 'HIGH' as const, score: 0.85 }];
    expect(getSlotQuality(candidates)).toBe('confident');
  });

  it('returns confident for multiple strong MEDIUM candidates', () => {
    const candidates = [
      { tier: 'MEDIUM' as const, score: 0.75 },
      { tier: 'MEDIUM' as const, score: 0.72 },
    ];
    expect(getSlotQuality(candidates)).toBe('confident');
  });

  it('returns weak for single MEDIUM candidate (even with high score)', () => {
    const candidates = [{ tier: 'MEDIUM' as const, score: 0.80 }];
    expect(getSlotQuality(candidates)).toBe('weak');
  });

  it('returns weak for low-scoring MEDIUM candidates', () => {
    const candidates = [
      { tier: 'MEDIUM' as const, score: 0.65 },
      { tier: 'MEDIUM' as const, score: 0.68 },
    ];
    expect(getSlotQuality(candidates)).toBe('weak');
  });

  it('returns weak when best score is below threshold', () => {
    const candidates = [
      { tier: 'MEDIUM' as const, score: 0.69 },
      { tier: 'MEDIUM' as const, score: 0.65 },
    ];
    expect(getSlotQuality(candidates)).toBe('weak');
  });
});

describe('hasItemsButNoMatches message generation (blocking + weak)', () => {
  // Tests for the new blocking/weak message generation
  function formatCats(cats: string[]): string {
    if (cats.length === 1) return cats[0];
    if (cats.length === 2) return `${cats[0]} or ${cats[1]}`;
    return `${cats.slice(0, -1).join(', ')}, or ${cats[cats.length - 1]}`;
  }

  // Helper to format with AND (for "are close" / "are what's blocking")
  function formatAndList(cats: string[]): string {
    if (cats.length === 1) return cats[0];
    if (cats.length === 2) return `${cats[0]} and ${cats[1]}`;
    return `${cats.slice(0, -1).join(', ')}, and ${cats[cats.length - 1]}`;
  }

  function capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function buildHasItemsNoMatchMessage(blocking: string[], weak: string[]): string | null {
    // Case A: blocking only
    if (blocking.length > 0 && weak.length === 0) {
      return `None of your ${formatCats(blocking)} match this item's style.`;
    }
    
    // Case B: blocking + weak - concise, truthy copy
    // Use OR list for "None of your...", AND list for "are close" / "are what's blocking"
    if (blocking.length > 0 && weak.length > 0) {
      const weakAndLabel = capitalizeFirst(formatAndList(weak));
      const blockingOrLabel = formatCats(blocking);
      const blockingAndLabel = formatAndList(blocking);
      return `None of your ${blockingOrLabel} match this item's style. ${weakAndLabel} are close, but ${blockingAndLabel} are what's blocking outfits.`;
    }

    // Case C: only weak (shouldn't reach empty state normally)
    if (weak.length > 0) {
      return `Only close matches found for ${formatCats(weak)}.`;
    }

    return null;
  }

  it('returns null when no blocking or weak categories', () => {
    expect(buildHasItemsNoMatchMessage([], [])).toBeNull();
  });

  describe('Case A: blocking only', () => {
    it('generates message for single blocking category', () => {
      const result = buildHasItemsNoMatchMessage(['bottoms'], []);
      expect(result).toBe("None of your bottoms match this item's style.");
    });

    it('generates message for two blocking categories', () => {
      const result = buildHasItemsNoMatchMessage(['bottoms', 'shoes'], []);
      expect(result).toBe("None of your bottoms or shoes match this item's style.");
    });

    it('generates message for three+ blocking categories', () => {
      const result = buildHasItemsNoMatchMessage(['tops', 'bottoms', 'shoes'], []);
      expect(result).toBe("None of your tops, bottoms, or shoes match this item's style.");
    });
  });

  describe('Case B: blocking + weak (concise truthy copy)', () => {
    it('single blocking + single weak: uses plural verbs and AND list', () => {
      const result = buildHasItemsNoMatchMessage(['bottoms'], ['shoes']);
      expect(result).toBe(
        "None of your bottoms match this item's style. Shoes are close, but bottoms are what's blocking outfits."
      );
    });

    it('multiple blocking + single weak: OR list for "None of", AND list for "blocking"', () => {
      const result = buildHasItemsNoMatchMessage(['bottoms', 'tops'], ['shoes']);
      expect(result).toBe(
        "None of your bottoms or tops match this item's style. Shoes are close, but bottoms and tops are what's blocking outfits."
      );
    });

    it('single blocking + multiple weak: AND list for "are close"', () => {
      const result = buildHasItemsNoMatchMessage(['bottoms'], ['shoes', 'tops']);
      expect(result).toBe(
        "None of your bottoms match this item's style. Shoes and tops are close, but bottoms are what's blocking outfits."
      );
    });
  });

  describe('Case C: only weak (edge case - skipped in Phase 1)', () => {
    it('generates message for weak-only scenario', () => {
      const result = buildHasItemsNoMatchMessage([], ['shoes']);
      expect(result).toBe("Only close matches found for shoes.");
    });

    it('handles multiple weak categories', () => {
      const result = buildHasItemsNoMatchMessage([], ['shoes', 'bottoms']);
      expect(result).toBe("Only close matches found for shoes or bottoms.");
    });
  });
});

describe('Distinguishing missing vs no-match categories', () => {
  // Tests for wardrobeHasSlotCategory logic
  const SLOT_TO_WARDROBE_CATEGORY: Record<string, string[]> = {
    SHOES: ['shoes'],
    BOTTOM: ['bottoms', 'skirts'],
    TOP: ['tops'],
    DRESS: ['dresses'],
  };

  function wardrobeHasSlotCategory(
    slot: string,
    wardrobeCategoryCounts: Map<string, number>
  ): boolean {
    const categories = SLOT_TO_WARDROBE_CATEGORY[slot] ?? [slot.toLowerCase()];
    return categories.some(cat => (wardrobeCategoryCounts.get(cat) ?? 0) > 0);
  }

  it('returns true when wardrobe has items in the slot category', () => {
    const counts = new Map([['bottoms', 3], ['shoes', 2]]);
    expect(wardrobeHasSlotCategory('BOTTOM', counts)).toBe(true);
    expect(wardrobeHasSlotCategory('SHOES', counts)).toBe(true);
  });

  it('returns false when wardrobe has no items in the slot category', () => {
    const counts = new Map([['tops', 2]]);
    expect(wardrobeHasSlotCategory('BOTTOM', counts)).toBe(false);
    expect(wardrobeHasSlotCategory('SHOES', counts)).toBe(false);
  });

  it('returns true for BOTTOM when wardrobe has skirts (alternative category)', () => {
    const counts = new Map([['skirts', 2]]); // No bottoms, but has skirts
    expect(wardrobeHasSlotCategory('BOTTOM', counts)).toBe(true);
  });

  it('handles empty wardrobe correctly', () => {
    const counts = new Map<string, number>();
    expect(wardrobeHasSlotCategory('BOTTOM', counts)).toBe(false);
    expect(wardrobeHasSlotCategory('SHOES', counts)).toBe(false);
  });
});

describe('Default tab selection', () => {
  function getDefaultTab(showHigh: boolean, showNear: boolean): 'high' | 'near' {
    if (showHigh) return 'high';
    if (showNear) return 'near';
    return 'high'; // Fallback (shouldn't happen if showEmptyState is handled)
  }

  it('defaults to HIGH when HIGH is available', () => {
    expect(getDefaultTab(true, false)).toBe('high');
    expect(getDefaultTab(true, true)).toBe('high');
  });

  it('defaults to NEAR when only NEAR is available', () => {
    expect(getDefaultTab(false, true)).toBe('near');
  });

  it('defaults to HIGH as fallback', () => {
    expect(getDefaultTab(false, false)).toBe('high');
  });
});

describe('Tab validity enforcement', () => {
  function enforceValidTab(
    activeTab: 'high' | 'near',
    showHigh: boolean,
    showNear: boolean
  ): 'high' | 'near' {
    if (activeTab === 'high' && !showHigh && showNear) {
      return 'near';
    }
    if (activeTab === 'near' && !showNear && showHigh) {
      return 'high';
    }
    return activeTab;
  }

  it('keeps HIGH tab if valid', () => {
    expect(enforceValidTab('high', true, false)).toBe('high');
    expect(enforceValidTab('high', true, true)).toBe('high');
  });

  it('keeps NEAR tab if valid', () => {
    expect(enforceValidTab('near', false, true)).toBe('near');
    expect(enforceValidTab('near', true, true)).toBe('near');
  });

  it('switches to NEAR if HIGH becomes unavailable', () => {
    expect(enforceValidTab('high', false, true)).toBe('near');
  });

  it('switches to HIGH if NEAR becomes unavailable', () => {
    expect(enforceValidTab('near', true, false)).toBe('high');
  });
});

// ============================================
// DISPLAY CAPS TESTS (PR 1)
// ============================================

// ============================================
// DIVERSITY PICKER TESTS (PR 3)
// ============================================

describe('Diversity picker logic', () => {
  /**
   * Get diversity slot based on scanned category.
   * Mirrors getDiversitySlot from useResultsTabs.
   */
  function getDiversitySlot(scannedCategory: string | null): 'SHOES' | 'BOTTOM' {
    if (scannedCategory === 'shoes') {
      return 'BOTTOM';
    }
    return 'SHOES';
  }

  /**
   * Get slot item ID from combo.
   * For BOTTOM, checks BOTTOM then DRESS.
   */
  function getSlotItemId(
    combo: { slots: Record<string, string | undefined> },
    slot: 'SHOES' | 'BOTTOM'
  ): string | null {
    if (slot === 'BOTTOM') {
      return combo.slots.BOTTOM ?? combo.slots.DRESS ?? null;
    }
    return combo.slots[slot] ?? null;
  }

  /**
   * Apply diversity selection (two-pass).
   * Mirrors applyDiversitySelection from useResultsTabs.
   */
  function applyDiversitySelection(
    combos: AssembledCombo[],
    diversitySlot: 'SHOES' | 'BOTTOM',
    maxCount: number
  ): AssembledCombo[] {
    const selected: AssembledCombo[] = [];
    const seenSlotIds = new Set<string>();

    // Pass 1: Unique items only
    for (const combo of combos) {
      if (selected.length >= maxCount) break;
      const slotId = getSlotItemId(combo, diversitySlot);

      if (slotId === null) {
        selected.push(combo);
      } else if (!seenSlotIds.has(slotId)) {
        selected.push(combo);
        seenSlotIds.add(slotId);
      }
    }

    // Pass 2: Fill remaining
    if (selected.length < maxCount) {
      const selectedIds = new Set(selected.map(c => c.id));
      for (const combo of combos) {
        if (selected.length >= maxCount) break;
        if (selectedIds.has(combo.id)) continue;
        selected.push(combo);
      }
    }

    return selected;
  }

  describe('getDiversitySlot', () => {
    it('returns BOTTOM when scanned item is shoes', () => {
      expect(getDiversitySlot('shoes')).toBe('BOTTOM');
    });

    it('returns SHOES for all other categories', () => {
      expect(getDiversitySlot('tops')).toBe('SHOES');
      expect(getDiversitySlot('bottoms')).toBe('SHOES');
      expect(getDiversitySlot('dresses')).toBe('SHOES');
      expect(getDiversitySlot(null)).toBe('SHOES');
    });
  });

  describe('applyDiversitySelection', () => {
    function createComboWithSlots(
      id: string,
      slots: { SHOES?: string; BOTTOM?: string; DRESS?: string }
    ): AssembledCombo {
      return {
        id,
        slots: { TOP: 'top-1', ...slots },
        candidates: [],
        tierFloor: 'MEDIUM',
        avgScore: 0.80,
        reasons: [],
      };
    }

    it('selects combos with unique shoes (default diversification)', () => {
      const combos = [
        createComboWithSlots('combo-1', { SHOES: 'shoes-a', BOTTOM: 'bottom-1' }),
        createComboWithSlots('combo-2', { SHOES: 'shoes-a', BOTTOM: 'bottom-2' }), // Duplicate shoes
        createComboWithSlots('combo-3', { SHOES: 'shoes-b', BOTTOM: 'bottom-1' }),
        createComboWithSlots('combo-4', { SHOES: 'shoes-c', BOTTOM: 'bottom-3' }),
      ];

      const selected = applyDiversitySelection(combos, 'SHOES', 3);

      expect(selected.map(c => c.id)).toEqual(['combo-1', 'combo-3', 'combo-4']);
    });

    it('selects combos with unique bottoms when scanning shoes', () => {
      const combos = [
        createComboWithSlots('combo-1', { SHOES: 'shoes-1', BOTTOM: 'bottom-a' }),
        createComboWithSlots('combo-2', { SHOES: 'shoes-2', BOTTOM: 'bottom-a' }), // Duplicate bottom
        createComboWithSlots('combo-3', { SHOES: 'shoes-3', BOTTOM: 'bottom-b' }),
        createComboWithSlots('combo-4', { SHOES: 'shoes-4', BOTTOM: 'bottom-c' }),
      ];

      const selected = applyDiversitySelection(combos, 'BOTTOM', 3);

      expect(selected.map(c => c.id)).toEqual(['combo-1', 'combo-3', 'combo-4']);
    });

    it('uses DRESS as fallback for BOTTOM slot', () => {
      const combos = [
        createComboWithSlots('combo-1', { SHOES: 'shoes-1', DRESS: 'dress-a' }),
        createComboWithSlots('combo-2', { SHOES: 'shoes-2', DRESS: 'dress-a' }), // Duplicate dress
        createComboWithSlots('combo-3', { SHOES: 'shoes-3', DRESS: 'dress-b' }),
      ];

      const selected = applyDiversitySelection(combos, 'BOTTOM', 3);

      // combo-1 and combo-3 have unique dresses
      expect(selected.map(c => c.id)).toEqual(['combo-1', 'combo-3', 'combo-2']);
    });

    it('fills remaining slots with pass 2 when not enough unique items', () => {
      const combos = [
        createComboWithSlots('combo-1', { SHOES: 'shoes-a', BOTTOM: 'bottom-1' }),
        createComboWithSlots('combo-2', { SHOES: 'shoes-a', BOTTOM: 'bottom-2' }), // Duplicate
        createComboWithSlots('combo-3', { SHOES: 'shoes-a', BOTTOM: 'bottom-3' }), // Duplicate
      ];

      const selected = applyDiversitySelection(combos, 'SHOES', 3);

      // Pass 1 takes combo-1, pass 2 fills with combo-2, combo-3
      expect(selected.map(c => c.id)).toEqual(['combo-1', 'combo-2', 'combo-3']);
    });

    it('handles missing slot gracefully (always eligible)', () => {
      const combos = [
        createComboWithSlots('combo-1', { BOTTOM: 'bottom-1' }), // No SHOES
        createComboWithSlots('combo-2', { SHOES: 'shoes-a', BOTTOM: 'bottom-2' }),
        createComboWithSlots('combo-3', { SHOES: 'shoes-a', BOTTOM: 'bottom-3' }), // Duplicate
      ];

      const selected = applyDiversitySelection(combos, 'SHOES', 3);

      // combo-1 is always eligible (missing slot)
      // combo-2 is unique shoes
      // combo-3 fills in pass 2
      expect(selected.map(c => c.id)).toEqual(['combo-1', 'combo-2', 'combo-3']);
    });

    it('respects maxCount limit', () => {
      const combos = [
        createComboWithSlots('combo-1', { SHOES: 'shoes-a' }),
        createComboWithSlots('combo-2', { SHOES: 'shoes-b' }),
        createComboWithSlots('combo-3', { SHOES: 'shoes-c' }),
        createComboWithSlots('combo-4', { SHOES: 'shoes-d' }),
        createComboWithSlots('combo-5', { SHOES: 'shoes-e' }),
      ];

      const selected = applyDiversitySelection(combos, 'SHOES', 3);

      expect(selected).toHaveLength(3);
      expect(selected.map(c => c.id)).toEqual(['combo-1', 'combo-2', 'combo-3']);
    });

    it('is deterministic', () => {
      const combos = [
        createComboWithSlots('combo-1', { SHOES: 'shoes-a' }),
        createComboWithSlots('combo-2', { SHOES: 'shoes-a' }),
        createComboWithSlots('combo-3', { SHOES: 'shoes-b' }),
      ];

      const selected1 = applyDiversitySelection([...combos], 'SHOES', 3);
      const selected2 = applyDiversitySelection([...combos], 'SHOES', 3);

      expect(selected1.map(c => c.id)).toEqual(selected2.map(c => c.id));
    });
  });
});

describe('Display caps logic (maxOutfitsPerTab)', () => {
  /**
   * Logic mirrors useResultsTabs:
   * - Single visible tab: max 5 outfits
   * - Both tabs visible: max 3 outfits per tab
   */
  function computeMaxOutfitsPerTab(showTabs: boolean): number {
    return showTabs ? 3 : 5;
  }

  describe('Single tab visible', () => {
    it('returns 5 when only HIGH tab is visible', () => {
      const showTabs = false; // Only one tab, so showTabs is false
      expect(computeMaxOutfitsPerTab(showTabs)).toBe(5);
    });

    it('returns 5 when only NEAR tab is visible', () => {
      const showTabs = false;
      expect(computeMaxOutfitsPerTab(showTabs)).toBe(5);
    });
  });

  describe('Both tabs visible', () => {
    it('returns 3 when both tabs are visible', () => {
      const showTabs = true;
      expect(computeMaxOutfitsPerTab(showTabs)).toBe(3);
    });
  });

  describe('Integration with tab visibility', () => {
    function computeTabVisibilityAndCap(
      highOutfits: AssembledCombo[],
      nearOutfits: AssembledCombo[],
      highMatches: EnrichedMatch[],
      nearMatches: PairEvaluation[]
    ) {
      const showHigh = highOutfits.length > 0 || highMatches.length > 0;
      const showNear = nearOutfits.length > 0 || nearMatches.length > 0;
      const showTabs = showHigh && showNear;
      const maxOutfitsPerTab = showTabs ? 3 : 5;

      return { showHigh, showNear, showTabs, maxOutfitsPerTab };
    }

    it('caps at 3 when both HIGH outfits and NEAR outfits exist', () => {
      const result = computeTabVisibilityAndCap(
        [createMockCombo('HIGH')],
        [createMockCombo('MEDIUM', 'near-1')],
        [],
        []
      );

      expect(result.showTabs).toBe(true);
      expect(result.maxOutfitsPerTab).toBe(3);
    });

    it('caps at 5 when only HIGH outfits exist', () => {
      const result = computeTabVisibilityAndCap(
        [createMockCombo('HIGH')],
        [],
        [],
        []
      );

      expect(result.showTabs).toBe(false);
      expect(result.maxOutfitsPerTab).toBe(5);
    });

    it('caps at 5 when only NEAR outfits exist', () => {
      const result = computeTabVisibilityAndCap(
        [],
        [createMockCombo('MEDIUM', 'near-1')],
        [],
        []
      );

      expect(result.showTabs).toBe(false);
      expect(result.maxOutfitsPerTab).toBe(5);
    });

    it('caps at 3 when HIGH matches + NEAR outfits exist (mixed)', () => {
      const result = computeTabVisibilityAndCap(
        [],
        [createMockCombo('MEDIUM', 'near-1')],
        [createMockEnrichedMatch()],
        []
      );

      expect(result.showHigh).toBe(true);
      expect(result.showNear).toBe(true);
      expect(result.showTabs).toBe(true);
      expect(result.maxOutfitsPerTab).toBe(3);
    });
  });
});

// ============================================
// PHASE 1: BLOCKING + WEAK INTEGRATION TESTS
// ============================================

describe('Phase 1: Blocking + Weak slot classification', () => {
  type SlotQuality = 'blocking' | 'weak' | 'confident';
  type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW';
  type OutfitEmptyReasonDetails =
    | { kind: 'missingCorePieces'; missing: { slot: string; category: string }[] }
    | { kind: 'hasItemsButNoMatches'; blockingCategories: string[]; weakCategories: string[] }
    | { kind: 'hasCorePiecesButNoCombos' };

  const SLOT_TO_WARDROBE_CATEGORY: Record<string, string[]> = {
    SHOES: ['shoes'],
    BOTTOM: ['bottoms', 'skirts'],
    TOP: ['tops'],
    DRESS: ['dresses'],
  };

  const SLOT_TO_DISPLAY_CATEGORY: Record<string, string> = {
    SHOES: 'shoes',
    BOTTOM: 'bottoms',
    TOP: 'tops',
    DRESS: 'dresses',
  };

  function wardrobeHasSlotCategory(
    slot: string,
    wardrobeCategoryCounts: Map<string, number>
  ): boolean {
    const categories = SLOT_TO_WARDROBE_CATEGORY[slot] ?? [slot.toLowerCase()];
    return categories.some(cat => (wardrobeCategoryCounts.get(cat) ?? 0) > 0);
  }

  function getSlotQuality(candidates: Array<{ tier: ConfidenceTier; score: number }> | undefined): SlotQuality {
    if (!candidates || candidates.length === 0) return 'blocking';
    const highCount = candidates.filter(c => c.tier === 'HIGH').length;
    if (highCount > 0) return 'confident';
    const mediumCandidates = candidates.filter(c => c.tier === 'MEDIUM');
    const bestScore = Math.max(...candidates.map(c => c.score));
    if (bestScore < 0.70 || mediumCandidates.length < 2) return 'weak';
    return 'confident';
  }

  function computeEmptyReason(
    missingSlots: { slot: string; category: string }[],
    wardrobeCategoryCounts: Map<string, number>,
    candidatesBySlot: Record<string, Array<{ tier: ConfidenceTier; score: number }>>
  ): OutfitEmptyReasonDetails | null {
    if (missingSlots.length === 0) return null;

    const trulyMissing = missingSlots.filter(
      s => !wardrobeHasSlotCategory(s.slot, wardrobeCategoryCounts)
    );
    const hasItemsNoMatch = missingSlots.filter(
      s => wardrobeHasSlotCategory(s.slot, wardrobeCategoryCounts)
    );

    if (trulyMissing.length > 0) {
      return { kind: 'missingCorePieces', missing: trulyMissing };
    }

    if (hasItemsNoMatch.length > 0) {
      const blockingCategories = hasItemsNoMatch.map(s =>
        SLOT_TO_DISPLAY_CATEGORY[s.slot] ?? s.category
      );

      const requiredSlots = ['TOP', 'BOTTOM', 'SHOES'];
      const blockingSlots = new Set(hasItemsNoMatch.map(s => s.slot));

      const weakCategories: string[] = [];
      for (const slot of requiredSlots) {
        if (blockingSlots.has(slot)) continue;
        const candidates = candidatesBySlot[slot] ?? [];
        if (candidates.length === 0) continue;
        const quality = getSlotQuality(candidates);
        if (quality === 'weak') {
          weakCategories.push(SLOT_TO_DISPLAY_CATEGORY[slot] ?? slot.toLowerCase());
        }
      }

      return { kind: 'hasItemsButNoMatches', blockingCategories, weakCategories };
    }

    return null;
  }

  it('1. Missing core: wardrobeHasBottoms=false → missingCorePieces', () => {
    const missingSlots = [{ slot: 'BOTTOM', category: 'bottoms' }];
    const wardrobeCounts = new Map<string, number>([['shoes', 2]]); // No bottoms
    const candidatesBySlot = { TOP: [], BOTTOM: [], SHOES: [{ tier: 'HIGH' as const, score: 0.85 }] };

    const result = computeEmptyReason(missingSlots, wardrobeCounts, candidatesBySlot);

    expect(result?.kind).toBe('missingCorePieces');
    if (result?.kind === 'missingCorePieces') {
      expect(result.missing).toEqual([{ slot: 'BOTTOM', category: 'bottoms' }]);
    }
  });

  it('2. Blocking only: bottoms candidates=0, shoes confident → blocking=[bottoms], weak=[]', () => {
    const missingSlots = [{ slot: 'BOTTOM', category: 'bottoms' }];
    const wardrobeCounts = new Map([['bottoms', 3], ['shoes', 2]]);
    const candidatesBySlot = {
      TOP: [],
      BOTTOM: [], // 0 candidates = blocking
      SHOES: [{ tier: 'HIGH' as const, score: 0.85 }], // confident
    };

    const result = computeEmptyReason(missingSlots, wardrobeCounts, candidatesBySlot);

    expect(result?.kind).toBe('hasItemsButNoMatches');
    if (result?.kind === 'hasItemsButNoMatches') {
      expect(result.blockingCategories).toEqual(['bottoms']);
      expect(result.weakCategories).toEqual([]);
    }
  });

  it('3. Blocking + weak: bottoms=0, shoes weak → blocking=[bottoms], weak=[shoes]', () => {
    const missingSlots = [{ slot: 'BOTTOM', category: 'bottoms' }];
    const wardrobeCounts = new Map([['bottoms', 3], ['shoes', 2]]);
    const candidatesBySlot = {
      TOP: [],
      BOTTOM: [], // 0 candidates = blocking
      SHOES: [{ tier: 'MEDIUM' as const, score: 0.80 }], // 1 MEDIUM = weak
    };

    const result = computeEmptyReason(missingSlots, wardrobeCounts, candidatesBySlot);

    expect(result?.kind).toBe('hasItemsButNoMatches');
    if (result?.kind === 'hasItemsButNoMatches') {
      expect(result.blockingCategories).toEqual(['bottoms']);
      expect(result.weakCategories).toEqual(['shoes']);
    }
  });

  it('4. Category mapping: BOTTOM slot maps to bottoms/skirts correctly', () => {
    // User has skirts (not bottoms), but BOTTOM slot should still recognize it
    const wardrobeCounts = new Map([['skirts', 2]]);
    expect(wardrobeHasSlotCategory('BOTTOM', wardrobeCounts)).toBe(true);

    // User has bottoms
    const wardrobeCounts2 = new Map([['bottoms', 3]]);
    expect(wardrobeHasSlotCategory('BOTTOM', wardrobeCounts2)).toBe(true);

    // User has neither
    const wardrobeCounts3 = new Map([['shoes', 2]]);
    expect(wardrobeHasSlotCategory('BOTTOM', wardrobeCounts3)).toBe(false);
  });

  it('5. Two blocking categories renders "bottoms or shoes"', () => {
    function formatCats(cats: string[]): string {
      if (cats.length === 1) return cats[0];
      if (cats.length === 2) return `${cats[0]} or ${cats[1]}`;
      return `${cats.slice(0, -1).join(', ')}, or ${cats[cats.length - 1]}`;
    }

    const blocking = ['bottoms', 'shoes'];
    expect(formatCats(blocking)).toBe('bottoms or shoes');
    expect(`None of your ${formatCats(blocking)} match this item's style.`).toBe(
      "None of your bottoms or shoes match this item's style."
    );
  });

  it('6. Dev log does not crash when bestScore is null (blocking slot with 0 candidates)', () => {
    const candidatesBySlot = {
      TOP: [],
      BOTTOM: [], // 0 candidates
      SHOES: [], // 0 candidates
    };

    // Should not throw when computing quality of empty slots
    expect(() => {
      for (const slot of ['TOP', 'BOTTOM', 'SHOES']) {
        getSlotQuality(candidatesBySlot[slot as keyof typeof candidatesBySlot]);
      }
    }).not.toThrow();

    // All should return 'blocking'
    expect(getSlotQuality(candidatesBySlot.BOTTOM)).toBe('blocking');
    expect(getSlotQuality(candidatesBySlot.SHOES)).toBe('blocking');
  });
});

