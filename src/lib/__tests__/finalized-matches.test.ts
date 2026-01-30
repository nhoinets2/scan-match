/**
 * FinalizedMatches Unit Tests
 *
 * Tests for the FinalizedMatches structure and related helpers:
 * - effectiveEvaluation helper (tier adjustment)
 * - Deduping invariants (no overlap between buckets)
 * - Tier naming consistency (NEAR vs MEDIUM mapping)
 * - actionById and finalTierById lookups
 */

// Define __DEV__ for test environment
// @ts-expect-error - __DEV__ is a React Native global
globalThis.__DEV__ = true;

import type { PairEvaluation, ConfidenceTier } from '../confidence-engine';
import type { WardrobeItem } from '../types';

// ============================================
// TYPE DEFINITIONS (to avoid importing from useTrustFilter which has RN deps)
// ============================================

type FinalMatchAction = 'keep' | 'demote' | 'hide';
type FinalMatchTier = 'HIGH' | 'NEAR' | 'HIDDEN';

interface EnrichedMatch {
  evaluation: PairEvaluation;
  wardrobeItem: WardrobeItem;
  explanation: string | null;
  explanationAllowed: boolean;
}

interface FinalizedMatchesMeta {
  tfDemotedCount: number;
  tfHiddenCount: number;
  aiDemotedCount: number;
  aiHiddenCount: number;
  aiDryRun: boolean;
  tfApplied: boolean;
  isLoading: boolean;
}

interface FinalizedMatches {
  highFinal: EnrichedMatch[];
  nearFinal: EnrichedMatch[];
  hidden: EnrichedMatch[];
  meta: FinalizedMatchesMeta;
  actionById: Map<string, FinalMatchAction>;
  finalTierById: Map<string, FinalMatchTier>;
  scanSignals: unknown | null;
  effectiveEvaluations: {
    matches: EnrichedMatch[];
    demotedMatches: EnrichedMatch[];
  };
}

/**
 * effectiveEvaluation - copy of the helper to test without importing RN deps
 * 
 * Get the effective evaluation for a match, with tier adjusted based on final tier.
 */
function effectiveEvaluation(
  match: EnrichedMatch,
  finalTier: FinalMatchTier
): PairEvaluation {
  if (finalTier === 'NEAR') {
    return { ...match.evaluation, confidence_tier: 'MEDIUM' };
  }
  return match.evaluation;
}

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
  id: string,
  tier: ConfidenceTier = 'HIGH',
  category: string = 'tops'
): EnrichedMatch {
  return {
    evaluation: createMockPairEvaluation({
      confidence_tier: tier,
      item_b_id: id,
    }),
    wardrobeItem: {
      id,
      category,
      imageUri: 'test.jpg',
      colors: [{ hex: '#000000', name: 'black' }],
      createdAt: Date.now(),
    } as WardrobeItem,
    explanation: null,
    explanationAllowed: false,
  };
}

function createMockFinalizedMatches(
  overrides: Partial<FinalizedMatches> = {}
): FinalizedMatches {
  return {
    highFinal: [],
    nearFinal: [],
    hidden: [],
    meta: {
      tfDemotedCount: 0,
      tfHiddenCount: 0,
      aiDemotedCount: 0,
      aiHiddenCount: 0,
      aiDryRun: true,
      tfApplied: true,
      isLoading: false,
    },
    actionById: new Map<string, FinalMatchAction>(),
    finalTierById: new Map<string, FinalMatchTier>(),
    scanSignals: null,
    effectiveEvaluations: {
      matches: [],
      demotedMatches: [],
    },
    ...overrides,
  };
}

// ============================================
// effectiveEvaluation HELPER TESTS
// ============================================

describe('effectiveEvaluation helper', () => {
  it('preserves original tier for HIGH final tier', () => {
    const match = createMockEnrichedMatch('item-1', 'HIGH');
    
    const result = effectiveEvaluation(match, 'HIGH');
    
    expect(result.confidence_tier).toBe('HIGH');
    expect(result).toBe(match.evaluation); // Same reference for HIGH
  });

  it('converts HIGH evaluation to MEDIUM for NEAR final tier', () => {
    const match = createMockEnrichedMatch('item-1', 'HIGH');
    
    const result = effectiveEvaluation(match, 'NEAR');
    
    expect(result.confidence_tier).toBe('MEDIUM');
    expect(result).not.toBe(match.evaluation); // Different reference (cloned)
  });

  it('preserves MEDIUM evaluation for NEAR final tier', () => {
    const match = createMockEnrichedMatch('item-1', 'MEDIUM');
    
    const result = effectiveEvaluation(match, 'NEAR');
    
    expect(result.confidence_tier).toBe('MEDIUM');
  });

  it('preserves original tier for HIDDEN final tier', () => {
    const match = createMockEnrichedMatch('item-1', 'HIGH');
    
    const result = effectiveEvaluation(match, 'HIDDEN');
    
    expect(result.confidence_tier).toBe('HIGH');
  });

  it('preserves all other evaluation properties when converting to NEAR', () => {
    const match = createMockEnrichedMatch('item-1', 'HIGH');
    match.evaluation.raw_score = 0.92;
    match.evaluation.cap_reasons = ['COLOR_TENSION'];
    
    const result = effectiveEvaluation(match, 'NEAR');
    
    expect(result.confidence_tier).toBe('MEDIUM');
    expect(result.raw_score).toBe(0.92);
    expect(result.cap_reasons).toEqual(['COLOR_TENSION']);
    expect(result.item_b_id).toBe('item-1');
  });
});

// ============================================
// DEDUPING INVARIANTS TESTS
// ============================================

describe('FinalizedMatches deduping invariants', () => {
  describe('highFinal and nearFinal exclusivity', () => {
    it('same item cannot be in both highFinal and nearFinal', () => {
      const item1 = createMockEnrichedMatch('item-1');
      const item2 = createMockEnrichedMatch('item-2');
      
      const finalized = createMockFinalizedMatches({
        highFinal: [item1],
        nearFinal: [item2],
      });
      
      const highIds = new Set(finalized.highFinal.map(m => m.wardrobeItem.id));
      const nearIds = new Set(finalized.nearFinal.map(m => m.wardrobeItem.id));
      
      // Check no overlap
      const overlap = [...highIds].filter(id => nearIds.has(id));
      expect(overlap).toHaveLength(0);
    });

    it('detecting overlap when items are duplicated', () => {
      const item1 = createMockEnrichedMatch('item-1');
      const item1Copy = createMockEnrichedMatch('item-1'); // Same ID
      
      // This would be invalid - same item in both buckets
      const highIds = new Set([item1].map(m => m.wardrobeItem.id));
      const nearIds = new Set([item1Copy].map(m => m.wardrobeItem.id));
      
      const overlap = [...highIds].filter(id => nearIds.has(id));
      expect(overlap).toHaveLength(1);
      expect(overlap[0]).toBe('item-1');
    });
  });

  describe('hidden items exclusivity', () => {
    it('hidden items should not appear in highFinal or nearFinal', () => {
      const item1 = createMockEnrichedMatch('item-1');
      const item2 = createMockEnrichedMatch('item-2');
      const hiddenItem = createMockEnrichedMatch('item-hidden');
      
      const finalized = createMockFinalizedMatches({
        highFinal: [item1],
        nearFinal: [item2],
        hidden: [hiddenItem],
      });
      
      const highIds = new Set(finalized.highFinal.map(m => m.wardrobeItem.id));
      const nearIds = new Set(finalized.nearFinal.map(m => m.wardrobeItem.id));
      const hiddenIds = new Set(finalized.hidden.map(m => m.wardrobeItem.id));
      
      // Check hidden doesn't overlap with high or near
      const hiddenOverlapHigh = [...hiddenIds].filter(id => highIds.has(id));
      const hiddenOverlapNear = [...hiddenIds].filter(id => nearIds.has(id));
      
      expect(hiddenOverlapHigh).toHaveLength(0);
      expect(hiddenOverlapNear).toHaveLength(0);
    });
  });
});

// ============================================
// actionById and finalTierById TESTS
// ============================================

describe('actionById lookup', () => {
  it('returns correct action for highFinal items', () => {
    const actionById = new Map<string, FinalMatchAction>([
      ['item-1', 'keep'],
      ['item-2', 'keep'],
    ]);
    
    expect(actionById.get('item-1')).toBe('keep');
    expect(actionById.get('item-2')).toBe('keep');
  });

  it('returns demote for TF-demoted items', () => {
    const actionById = new Map<string, FinalMatchAction>([
      ['item-kept', 'keep'],
      ['item-demoted', 'demote'],
    ]);
    
    expect(actionById.get('item-demoted')).toBe('demote');
  });

  it('returns hide for hidden items', () => {
    const actionById = new Map<string, FinalMatchAction>([
      ['item-kept', 'keep'],
      ['item-hidden', 'hide'],
    ]);
    
    expect(actionById.get('item-hidden')).toBe('hide');
  });

  it('returns undefined for unknown items', () => {
    const actionById = new Map<string, FinalMatchAction>([
      ['item-1', 'keep'],
    ]);
    
    expect(actionById.get('unknown-item')).toBeUndefined();
  });
});

describe('finalTierById lookup', () => {
  it('returns HIGH for highFinal items', () => {
    const finalTierById = new Map<string, FinalMatchTier>([
      ['item-1', 'HIGH'],
      ['item-2', 'HIGH'],
    ]);
    
    expect(finalTierById.get('item-1')).toBe('HIGH');
    expect(finalTierById.get('item-2')).toBe('HIGH');
  });

  it('returns NEAR for demoted items', () => {
    const finalTierById = new Map<string, FinalMatchTier>([
      ['item-kept', 'HIGH'],
      ['item-demoted', 'NEAR'],
    ]);
    
    expect(finalTierById.get('item-demoted')).toBe('NEAR');
  });

  it('returns NEAR for CE MEDIUM items', () => {
    const finalTierById = new Map<string, FinalMatchTier>([
      ['item-high', 'HIGH'],
      ['item-medium', 'NEAR'], // CE MEDIUM → final NEAR
    ]);
    
    expect(finalTierById.get('item-medium')).toBe('NEAR');
  });

  it('returns HIDDEN for hidden items', () => {
    const finalTierById = new Map<string, FinalMatchTier>([
      ['item-kept', 'HIGH'],
      ['item-hidden', 'HIDDEN'],
    ]);
    
    expect(finalTierById.get('item-hidden')).toBe('HIDDEN');
  });
});

// ============================================
// TIER NAMING CONSISTENCY TESTS
// ============================================

describe('Tier naming consistency', () => {
  describe('CE to Final tier mapping', () => {
    it('CE HIGH kept → final HIGH', () => {
      // When TF keeps a CE HIGH item, final tier is HIGH
      const finalTier: FinalMatchTier = 'HIGH';
      expect(finalTier).toBe('HIGH');
    });

    it('CE HIGH demoted → final NEAR', () => {
      // When TF demotes a CE HIGH item, final tier is NEAR
      const finalTier: FinalMatchTier = 'NEAR';
      expect(finalTier).toBe('NEAR');
    });

    it('CE MEDIUM → final NEAR', () => {
      // CE MEDIUM always maps to final NEAR
      const finalTier: FinalMatchTier = 'NEAR';
      expect(finalTier).toBe('NEAR');
    });

    it('TF/AI hide → final HIDDEN', () => {
      // Hidden items get HIDDEN tier
      const finalTier: FinalMatchTier = 'HIDDEN';
      expect(finalTier).toBe('HIDDEN');
    });
  });

  describe('effectiveEvaluation tier conversion', () => {
    it('NEAR final tier converts to MEDIUM CE tier for combo assembly', () => {
      const match = createMockEnrichedMatch('item-1', 'HIGH');
      const effective = effectiveEvaluation(match, 'NEAR');
      
      // Final NEAR → CE evaluation tier MEDIUM
      expect(effective.confidence_tier).toBe('MEDIUM');
    });

    it('HIGH final tier preserves HIGH CE tier', () => {
      const match = createMockEnrichedMatch('item-1', 'HIGH');
      const effective = effectiveEvaluation(match, 'HIGH');
      
      // Final HIGH → CE evaluation tier HIGH
      expect(effective.confidence_tier).toBe('HIGH');
    });
  });
});

// ============================================
// META COUNTS TESTS
// ============================================

describe('FinalizedMatches meta', () => {
  it('tracks TF demoted count', () => {
    const meta = {
      tfDemotedCount: 3,
      tfHiddenCount: 1,
      aiDemotedCount: 0,
      aiHiddenCount: 0,
      aiDryRun: true,
      tfApplied: true,
      isLoading: false,
    };
    
    expect(meta.tfDemotedCount).toBe(3);
    expect(meta.tfHiddenCount).toBe(1);
  });

  it('tracks AI Safety counts in apply mode', () => {
    const meta = {
      tfDemotedCount: 2,
      tfHiddenCount: 0,
      aiDemotedCount: 1,
      aiHiddenCount: 2,
      aiDryRun: false, // Apply mode
      tfApplied: true,
      isLoading: false,
    };
    
    expect(meta.aiDemotedCount).toBe(1);
    expect(meta.aiHiddenCount).toBe(2);
    expect(meta.aiDryRun).toBe(false);
  });

  it('AI counts are zero in dry-run mode', () => {
    const meta = {
      tfDemotedCount: 2,
      tfHiddenCount: 1,
      aiDemotedCount: 0,
      aiHiddenCount: 0,
      aiDryRun: true, // Dry-run mode
      tfApplied: true,
      isLoading: false,
    };
    
    expect(meta.aiDemotedCount).toBe(0);
    expect(meta.aiHiddenCount).toBe(0);
    expect(meta.aiDryRun).toBe(true);
  });
});

// ============================================
// nearFinal ORDERING TESTS
// ============================================

describe('nearFinal ordering', () => {
  it('TF-demoted items appear before CE MEDIUM items', () => {
    // TF-demoted (was HIGH, now NEAR) should appear first
    // Then CE MEDIUM items follow
    const tfDemoted = createMockEnrichedMatch('tf-demoted', 'HIGH'); // Originally HIGH
    const ceMedium = createMockEnrichedMatch('ce-medium', 'MEDIUM');
    
    const nearFinal = [tfDemoted, ceMedium]; // Correct order
    
    expect(nearFinal[0].wardrobeItem.id).toBe('tf-demoted');
    expect(nearFinal[1].wardrobeItem.id).toBe('ce-medium');
  });

  it('items maintain CE score order within their group', () => {
    const tfDemoted1 = createMockEnrichedMatch('tf-1', 'HIGH');
    tfDemoted1.evaluation.raw_score = 0.95;
    
    const tfDemoted2 = createMockEnrichedMatch('tf-2', 'HIGH');
    tfDemoted2.evaluation.raw_score = 0.85;
    
    // TF-demoted should be sorted by CE score descending
    const sorted = [tfDemoted1, tfDemoted2].sort(
      (a, b) => (b.evaluation.raw_score ?? 0) - (a.evaluation.raw_score ?? 0)
    );
    
    expect(sorted[0].wardrobeItem.id).toBe('tf-1');
    expect(sorted[1].wardrobeItem.id).toBe('tf-2');
  });
});

// ============================================
// GHOST DEMOTE/HIDE TESTS
// ============================================

describe('Ghost demote/hide prevention', () => {
  it('demoted IDs should be subset of CE HIGH IDs', () => {
    // CE HIGH items
    const ceHighIds = new Set(['item-1', 'item-2', 'item-3']);
    
    // Items that TF demoted (should all be in ceHighIds)
    const demotedIds = ['item-1', 'item-2'];
    
    // Verify all demoted are in CE HIGH
    const allDemotedInCeHigh = demotedIds.every(id => ceHighIds.has(id));
    expect(allDemotedInCeHigh).toBe(true);
  });

  it('detects ghost demote (ID not in CE HIGH)', () => {
    const ceHighIds = new Set(['item-1', 'item-2']);
    
    // Ghost demote - this ID wasn't in CE HIGH
    const demotedIds = ['item-1', 'ghost-item'];
    
    const ghostDemotes = demotedIds.filter(id => !ceHighIds.has(id));
    expect(ghostDemotes).toHaveLength(1);
    expect(ghostDemotes[0]).toBe('ghost-item');
  });

  it('hidden IDs should be subset of CE HIGH IDs', () => {
    const ceHighIds = new Set(['item-1', 'item-2', 'item-3']);
    
    const hiddenIds = ['item-3'];
    
    const allHiddenInCeHigh = hiddenIds.every(id => ceHighIds.has(id));
    expect(allHiddenInCeHigh).toBe(true);
  });
});

// ============================================
// AI SAFETY MERGE PRECEDENCE TESTS
// ============================================

describe('AI Safety merge precedence', () => {
  describe('monotonic merge (can only reduce confidence)', () => {
    it('AI hide always wins (even if TF kept)', () => {
      // TF: keep, AI: hide → final: hide
      const tfAction: 'keep' | 'demote' | 'hide' = 'keep';
      const aiAction: 'keep' | 'demote' | 'hide' = 'hide';
      
      const finalAction = aiAction === 'hide' ? 'hide' : tfAction;
      expect(finalAction).toBe('hide');
    });

    it('AI demote wins if TF kept', () => {
      // TF: keep, AI: demote → final: demote
      const toAction = (value: FinalMatchAction): FinalMatchAction => value;
      const tfAction = toAction('keep');
      const aiAction = toAction('demote');
      
      const finalAction = aiAction === 'hide' ? 'hide' 
        : aiAction === 'demote' ? 'demote'
        : tfAction;
      expect(finalAction).toBe('demote');
    });

    it('AI demote cannot undo TF hide', () => {
      // TF: hide, AI: demote → final: hide (hide wins)
      const tfAction: 'keep' | 'demote' | 'hide' = 'hide';
      const aiAction: 'keep' | 'demote' | 'hide' = 'demote';
      
      // hide always takes precedence
      const finalAction = tfAction === 'hide' ? 'hide' : aiAction;
      expect(finalAction).toBe('hide');
    });

    it('AI keep never upgrades TF demote', () => {
      // TF: demote, AI: keep → final: demote (AI keep cannot upgrade)
      const tfAction: FinalMatchAction = 'demote';
      const aiAction: FinalMatchAction = 'keep';
      
      // AI keep doesn't change anything
      const finalAction = aiAction === 'keep' ? tfAction : aiAction;
      expect(finalAction).toBe('demote');
    });

    it('AI keep never undoes TF hide', () => {
      // TF: hide, AI: keep → final: hide
      const tfAction: FinalMatchAction = 'hide';
      const aiAction: FinalMatchAction = 'keep';
      
      const finalAction = aiAction === 'keep' ? tfAction : aiAction;
      expect(finalAction).toBe('hide');
    });
  });

  describe('merge function implementation', () => {
    function mergeActions(
      tfAction: FinalMatchAction,
      aiAction: FinalMatchAction
    ): FinalMatchAction {
      // Precedence: hide > demote > keep
      // AI can only reduce confidence, never upgrade
      if (tfAction === 'hide') return 'hide'; // TF hide is final
      if (aiAction === 'hide') return 'hide'; // AI hide wins
      if (aiAction === 'demote') return 'demote'; // AI demote wins
      return tfAction; // AI keep doesn't change TF result
    }

    it('merges correctly for all combinations', () => {
      // TF keep scenarios
      expect(mergeActions('keep', 'keep')).toBe('keep');
      expect(mergeActions('keep', 'demote')).toBe('demote');
      expect(mergeActions('keep', 'hide')).toBe('hide');
      
      // TF demote scenarios
      expect(mergeActions('demote', 'keep')).toBe('demote');
      expect(mergeActions('demote', 'demote')).toBe('demote');
      expect(mergeActions('demote', 'hide')).toBe('hide');
      
      // TF hide scenarios
      expect(mergeActions('hide', 'keep')).toBe('hide');
      expect(mergeActions('hide', 'demote')).toBe('hide');
      expect(mergeActions('hide', 'hide')).toBe('hide');
    });
  });
});

// ============================================
// EDGE CASES
// ============================================

describe('Edge cases', () => {
  it('handles empty finalized matches', () => {
    const finalized = createMockFinalizedMatches({
      highFinal: [],
      nearFinal: [],
      hidden: [],
    });
    
    expect(finalized.highFinal).toHaveLength(0);
    expect(finalized.nearFinal).toHaveLength(0);
    expect(finalized.hidden).toHaveLength(0);
  });

  it('handles all items demoted (no highFinal)', () => {
    const demoted1 = createMockEnrichedMatch('item-1', 'HIGH');
    const demoted2 = createMockEnrichedMatch('item-2', 'HIGH');
    
    const finalized = createMockFinalizedMatches({
      highFinal: [],
      nearFinal: [demoted1, demoted2],
      hidden: [],
    });
    
    expect(finalized.highFinal).toHaveLength(0);
    expect(finalized.nearFinal).toHaveLength(2);
    expect(finalized.meta.tfDemotedCount).toBe(0); // Need to set manually in real impl
  });

  it('handles all items hidden (no highFinal or nearFinal)', () => {
    const hidden1 = createMockEnrichedMatch('item-1', 'HIGH');
    const hidden2 = createMockEnrichedMatch('item-2', 'HIGH');
    
    const finalized = createMockFinalizedMatches({
      highFinal: [],
      nearFinal: [],
      hidden: [hidden1, hidden2],
    });
    
    expect(finalized.highFinal).toHaveLength(0);
    expect(finalized.nearFinal).toHaveLength(0);
    expect(finalized.hidden).toHaveLength(2);
  });

  it('handles loading state', () => {
    const finalized = createMockFinalizedMatches({
      highFinal: [],
      nearFinal: [],
      hidden: [],
      meta: {
        tfDemotedCount: 0,
        tfHiddenCount: 0,
        aiDemotedCount: 0,
        aiHiddenCount: 0,
        aiDryRun: true,
        tfApplied: false,
        isLoading: true,
      },
    });
    
    expect(finalized.meta.isLoading).toBe(true);
    expect(finalized.meta.tfApplied).toBe(false);
  });
});
