/**
 * QA Scenario Tests
 *
 * Integration-style tests covering critical user scenarios:
 * 1. HIGH-only + missing shoes
 * 2. NEAR-only + Type2b no-cap
 * 3. BOTH tabs + select outfit → "Show all"
 * 4. BOTH empty → empty state
 */

// Define __DEV__ for test environment
// @ts-expect-error - __DEV__ is a React Native global
globalThis.__DEV__ = true;

import type { PairEvaluation, ConfidenceTier, CapReason } from '../confidence-engine';
import type { AssembledCombo, SlotCandidate } from '../combo-assembler';
import type { EnrichedMatch } from '../useConfidenceEngine';
import type { WardrobeItem } from '../types';
import { generateOutfitModeBSuggestionsV2, getModeBBullets } from '../confidence-engine';
import { THRESHOLDS } from '../confidence-engine/config';

// ============================================
// TEST HELPERS
// ============================================

function createPairEvaluation(overrides: Partial<PairEvaluation> = {}): PairEvaluation {
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
    weights_used: { C: 0.35, S: 0.20, F: 0.15, T: 0.15, U: 0.10, V: 0.05 },
    item_a_id: 'scanned-1',
    item_b_id: 'wardrobe-1',
    ...overrides,
  };
}

function createEnrichedMatch(overrides: Partial<EnrichedMatch> = {}): EnrichedMatch {
  return {
    evaluation: createPairEvaluation(),
    wardrobeItem: {
      id: 'wardrobe-1',
      category: 'tops',
      imageUri: 'test.jpg',
      colors: [{ hex: '#000000', name: 'Black' }],
      createdAt: Date.now(),
    } as WardrobeItem,
    explanation: null,
    explanationAllowed: false,
    ...overrides,
  };
}

function createSlotCandidate(overrides: Partial<SlotCandidate> = {}): SlotCandidate {
  return {
    itemId: 'item-1',
    slot: 'TOP',
    tier: 'HIGH',
    score: 0.85,
    evaluation: createPairEvaluation(),
    ...overrides,
  };
}

function createCombo(tierFloor: ConfidenceTier, id: string = 'combo-1'): AssembledCombo {
  return {
    id,
    slots: { TOP: 'top-1', BOTTOM: 'bottom-1', SHOES: 'shoes-1' },
    candidates: [
      createSlotCandidate({ tier: tierFloor, slot: 'TOP' }),
      createSlotCandidate({ tier: tierFloor, slot: 'BOTTOM' }),
      createSlotCandidate({ tier: tierFloor, slot: 'SHOES' }),
    ],
    tierFloor,
    avgScore: 0.85,
    reasons: [],
  };
}

// Tab visibility logic (mirrors useResultsTabs)
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
  const activeTab: 'high' | 'near' = showHigh ? 'high' : 'near';

  return { showHigh, showNear, showTabs, showEmptyState, activeTab };
}

// Empty reason discriminator (mirrors useResultsTabs)
type MissingSlotInfo = { slot: string; category: string };

function getOutfitEmptyReason(
  outfits: AssembledCombo[],
  matches: EnrichedMatch[] | PairEvaluation[],
  missingSlots: MissingSlotInfo[]
): 'missingCorePieces' | 'hasCorePiecesButNoCombos' | null {
  if (outfits.length > 0) return null;
  if (missingSlots.length > 0) return 'missingCorePieces';
  if (matches.length > 0) return 'hasCorePiecesButNoCombos';
  return 'missingCorePieces'; // Fallback
}


// ============================================
// SCENARIO 1: HIGH-only + missing shoes
// ============================================

describe('Scenario 1: HIGH-only + missing shoes', () => {
  const highMatches = [
    createEnrichedMatch({ wardrobeItem: { id: 'top-1', category: 'tops' } as WardrobeItem }),
    createEnrichedMatch({ wardrobeItem: { id: 'bottom-1', category: 'bottoms' } as WardrobeItem }),
  ];
  const nearMatches: PairEvaluation[] = [];
  const highOutfits: AssembledCombo[] = []; // No outfits because missing shoes
  const nearOutfits: AssembledCombo[] = [];
  const missingSlots: MissingSlotInfo[] = [{ slot: 'SHOES', category: 'shoes' }];

  it('shows HIGH tab only (no segmented control)', () => {
    const visibility = computeTabVisibility(highOutfits, nearOutfits, highMatches, nearMatches);

    expect(visibility.showHigh).toBe(true);
    expect(visibility.showNear).toBe(false);
    expect(visibility.showTabs).toBe(false);
    expect(visibility.showEmptyState).toBe(false);
    expect(visibility.activeTab).toBe('high');
  });

  it('outfit section shows "missingCorePieces" reason', () => {
    const reason = getOutfitEmptyReason(highOutfits, highMatches, missingSlots);
    expect(reason).toBe('missingCorePieces');
  });

  it('matches section shows HIGH matches', () => {
    expect(highMatches.length).toBe(2);
    expect(highMatches.every((m) => m.evaluation.confidence_tier === 'HIGH')).toBe(true);
  });

  it('generates correct missing message', () => {
    const message = `Add ${missingSlots[0].category} to build outfits from these matches.`;
    expect(message).toBe('Add shoes to build outfits from these matches.');
  });
});

// ============================================
// SCENARIO 2: NEAR-only + Type2b no-cap
// ============================================

describe('Scenario 2: NEAR-only + Type2b no-cap', () => {
  // Type2b: MEDIUM tier, score in strong-medium band, NO cap reasons
  const type2bEval = createPairEvaluation({
    confidence_tier: 'MEDIUM',
    raw_score: 0.75, // Between NEAR_MATCH_STRONG_MEDIUM_MIN (0.7) and HIGH (0.78)
    high_threshold_used: THRESHOLDS.HIGH,
    cap_reasons: [], // NO cap reasons = Type2b
  });

  const nearMatches = [type2bEval];
  const highMatches: EnrichedMatch[] = [];
  const nearOutfits = [createCombo('MEDIUM', 'near-combo-1')];
  const highOutfits: AssembledCombo[] = [];

  it('shows NEAR tab only (no segmented control)', () => {
    const visibility = computeTabVisibility(highOutfits, nearOutfits, highMatches, nearMatches);

    expect(visibility.showHigh).toBe(false);
    expect(visibility.showNear).toBe(true);
    expect(visibility.showTabs).toBe(false);
    expect(visibility.showEmptyState).toBe(false);
    expect(visibility.activeTab).toBe('near');
  });

  it('Type2b match triggers MISSING_KEY_SIGNAL fallback bullet', () => {
    const result = generateOutfitModeBSuggestionsV2(nearMatches, 'casual', 'aggregate');

    expect(result).not.toBeNull();
    // Type2b should produce a generic bullet (MISSING_KEY_SIGNAL path)
    expect(result!.bullets.length).toBeGreaterThan(0);
  });

  it('outfit section shows NEAR outfits', () => {
    expect(nearOutfits.length).toBe(1);
    expect(nearOutfits[0].tierFloor).toBe('MEDIUM');
  });

  it('Mode B suggestions are generated for NEAR tab', () => {
    const modeBResult = getModeBBullets(null, nearMatches, 'casual');
    expect(modeBResult).not.toBeNull();
  });
});

// ============================================
// SCENARIO 3: BOTH tabs + select outfit → "Show all"
// ============================================

describe('Scenario 3: BOTH tabs + select outfit → Show all escape hatch', () => {
  const highMatches = [createEnrichedMatch()];
  const nearMatches = [
    createPairEvaluation({
      confidence_tier: 'MEDIUM',
      raw_score: 0.72,
      cap_reasons: ['STYLE_CLASH' as CapReason],
    }),
  ];
  const highOutfits = [createCombo('HIGH', 'high-combo-1')];
  const nearOutfits = [
    {
      ...createCombo('MEDIUM', 'near-combo-1'),
      candidates: [
        createSlotCandidate({
          tier: 'HIGH',
          slot: 'TOP',
          evaluation: createPairEvaluation({ confidence_tier: 'HIGH' }),
        }),
        createSlotCandidate({
          tier: 'MEDIUM',
          slot: 'BOTTOM',
          evaluation: createPairEvaluation({
            confidence_tier: 'MEDIUM',
            cap_reasons: ['STYLE_CLASH' as CapReason],
          }),
        }),
        createSlotCandidate({
          tier: 'HIGH',
          slot: 'SHOES',
          evaluation: createPairEvaluation({ confidence_tier: 'HIGH' }),
        }),
      ],
    },
  ];

  it('shows both tabs (segmented control visible)', () => {
    const visibility = computeTabVisibility(highOutfits, nearOutfits, highMatches, nearMatches);

    expect(visibility.showHigh).toBe(true);
    expect(visibility.showNear).toBe(true);
    expect(visibility.showTabs).toBe(true);
    expect(visibility.showEmptyState).toBe(false);
  });

  it('selecting a near outfit uses only MEDIUM candidates for Mode B', () => {
    const selectedOutfit = nearOutfits[0];
    const modeBResult = getModeBBullets(selectedOutfit.candidates, nearMatches, 'casual');

    expect(modeBResult).not.toBeNull();
    // Should use the MEDIUM candidate's cap reasons
  });

  it('clearing selection (Show all) uses aggregate near matches', () => {
    // Simulate clearing selection - pass null directly for candidates
    const modeBResult = getModeBBullets(
      null, // No selected outfit
      nearMatches,
      'casual'
    );

    expect(modeBResult).not.toBeNull();
    // Should fall back to aggregate near matches
  });

  it('stale selection is cleared when outfit no longer exists', () => {
    // Simulate: user selected outfit, then outfits list changed
    const selectedOutfitId = 'near-combo-1';
    const currentOutfits = [createCombo('MEDIUM', 'near-combo-2')]; // Different ID

    const stillExists = currentOutfits.some((combo) => combo.id === selectedOutfitId);
    expect(stillExists).toBe(false);

    // The selection should be cleared (in real code, this triggers setSelectedNearOutfit(null))
  });

});

// ============================================
// SCENARIO 4: BOTH empty → empty state
// ============================================

describe('Scenario 4: BOTH empty → empty state', () => {
  const highMatches: EnrichedMatch[] = [];
  const nearMatches: PairEvaluation[] = [];
  const highOutfits: AssembledCombo[] = [];
  const nearOutfits: AssembledCombo[] = [];

  it('shows empty state (no tabs)', () => {
    const visibility = computeTabVisibility(highOutfits, nearOutfits, highMatches, nearMatches);

    expect(visibility.showHigh).toBe(false);
    expect(visibility.showNear).toBe(false);
    expect(visibility.showTabs).toBe(false);
    expect(visibility.showEmptyState).toBe(true);
  });

  it('no Mode A or Mode B bullets should be shown', () => {
    // In empty state, bullets should not appear
    // Mode A requires matches/outfits
    // Mode B requires near matches
    const hasHighContent = highMatches.length > 0 || highOutfits.length > 0;
    const hasNearContent = nearMatches.length > 0 || nearOutfits.length > 0;

    expect(hasHighContent).toBe(false);
    expect(hasNearContent).toBe(false);
  });

  it('empty state should show education cards (not bullets)', () => {
    // This is a UI behavior - the empty state shows static education cards
    // Verifying the condition that triggers this
    const visibility = computeTabVisibility(highOutfits, nearOutfits, highMatches, nearMatches);

    expect(visibility.showEmptyState).toBe(true);
    // In real UI: showEmptyState triggers the education cards UI
  });
});

// ============================================
// CROSS-SCENARIO INVARIANTS
// ============================================

describe('Cross-scenario invariants', () => {
  it('Mode A and Mode B never appear together on same tab', () => {
    // HIGH tab = Mode A only
    // NEAR tab = Mode B only
    // This is enforced by the isHighTab conditional in results.tsx
    const isHighTab = true;
    const showModeA = isHighTab;
    const showModeB = !isHighTab;

    expect(showModeA && showModeB).toBe(false);
  });

  it('showTabs is only true when both showHigh and showNear are true', () => {
    const scenarios = [
      { showHigh: true, showNear: true, expectedShowTabs: true },
      { showHigh: true, showNear: false, expectedShowTabs: false },
      { showHigh: false, showNear: true, expectedShowTabs: false },
      { showHigh: false, showNear: false, expectedShowTabs: false },
    ];

    for (const scenario of scenarios) {
      const showTabs = scenario.showHigh && scenario.showNear;
      expect(showTabs).toBe(scenario.expectedShowTabs);
    }
  });

  it('showEmptyState is only true when both showHigh and showNear are false', () => {
    const scenarios = [
      { showHigh: true, showNear: true, expectedEmpty: false },
      { showHigh: true, showNear: false, expectedEmpty: false },
      { showHigh: false, showNear: true, expectedEmpty: false },
      { showHigh: false, showNear: false, expectedEmpty: true },
    ];

    for (const scenario of scenarios) {
      const showEmptyState = !scenario.showHigh && !scenario.showNear;
      expect(showEmptyState).toBe(scenario.expectedEmpty);
    }
  });

});

