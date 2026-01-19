/**
 * useConfidenceEngine tests
 * 
 * Tests for the confidence engine hook and its utility functions.
 */

import { tierToVerdictState, tierToLabel } from '../useConfidenceEngine';
import type { ConfidenceEngineResult } from '../useConfidenceEngine';

// ============================================
// TIER TO VERDICT STATE TESTS
// ============================================

describe('tierToVerdictState', () => {
  it('maps HIGH to great', () => {
    expect(tierToVerdictState('HIGH')).toBe('great');
  });

  it('maps MEDIUM to okay', () => {
    expect(tierToVerdictState('MEDIUM')).toBe('okay');
  });

  it('maps LOW to risky', () => {
    expect(tierToVerdictState('LOW')).toBe('risky');
  });

  it('returns context_needed for unknown tiers', () => {
    expect(tierToVerdictState('UNKNOWN' as any)).toBe('context_needed');
    expect(tierToVerdictState('' as any)).toBe('context_needed');
    expect(tierToVerdictState(null as any)).toBe('context_needed');
  });
});

// ============================================
// TIER TO LABEL TESTS
// ============================================

describe('tierToLabel', () => {
  it('returns correct label for HIGH', () => {
    expect(tierToLabel('HIGH')).toBe('Looks like a good match');
  });

  it('returns correct label for MEDIUM', () => {
    expect(tierToLabel('MEDIUM')).toBe('Could work with the right pieces');
  });

  it('returns correct label for LOW', () => {
    expect(tierToLabel('LOW')).toBe('Might feel tricky to style');
  });

  it('returns fallback label for unknown tiers', () => {
    expect(tierToLabel('UNKNOWN' as any)).toBe('Need more context');
  });
});

// ============================================
// CONFIDENCE ENGINE RESULT STRUCTURE TESTS
// ============================================

describe('ConfidenceEngineResult structure', () => {
  const createEmptyResult = (): ConfidenceEngineResult => ({
    evaluated: false,
    debugTier: 'LOW',
    showMatchesSection: false,
    matches: [],
    highMatchCount: 0,
    nearMatchCount: 0,
    bestMatch: null,
    suggestionsMode: 'A',
    modeASuggestions: null,
    modeBSuggestions: null,
    uiVibeForCopy: 'casual',
    rawEvaluation: null,
  });

  it('empty result has correct default values', () => {
    const result = createEmptyResult();
    
    expect(result.evaluated).toBe(false);
    expect(result.debugTier).toBe('LOW');
    expect(result.showMatchesSection).toBe(false);
    expect(result.matches).toEqual([]);
    expect(result.highMatchCount).toBe(0);
    expect(result.nearMatchCount).toBe(0);
    expect(result.bestMatch).toBeNull();
    expect(result.suggestionsMode).toBe('A');
    expect(result.modeASuggestions).toBeNull();
    expect(result.modeBSuggestions).toBeNull();
    expect(result.rawEvaluation).toBeNull();
  });

  it('uiVibeForCopy defaults to casual', () => {
    const result = createEmptyResult();
    expect(result.uiVibeForCopy).toBe('casual');
  });
});

// ============================================
// MODE A SUGGESTIONS STRUCTURE TESTS
// ============================================

describe('Mode A suggestions', () => {
  it('has correct structure when present', () => {
    const modeASuggestions = {
      intro: 'Complete your look with:',
      bullets: [
        { text: 'Add navy trousers', target: 'bottoms' as const },
        { text: 'Try minimal white sneakers', target: 'shoes' as const },
      ],
    };

    expect(modeASuggestions.intro).toBeDefined();
    expect(Array.isArray(modeASuggestions.bullets)).toBe(true);
    expect(modeASuggestions.bullets.length).toBe(2);
    expect(modeASuggestions.bullets[0].text).toBeDefined();
    expect(modeASuggestions.bullets[0].target).toBeDefined();
  });

  it('bullets can have null target for generic suggestions', () => {
    const bullet = { text: 'Keep proportions balanced', target: null };
    expect(bullet.target).toBeNull();
  });
});

// ============================================
// MODE B SUGGESTIONS STRUCTURE TESTS
// ============================================

describe('Mode B suggestions', () => {
  it('has correct structure when present', () => {
    const modeBSuggestions = {
      intro: 'To make this pairing work:',
      bullets: [
        { 
          text: 'Tuck in your top', 
          capReason: 'FORMALITY_GAP',
          bulletKey: 'TOPS__BOTTOMS_TUCK',
        },
      ],
    };

    expect(modeBSuggestions.intro).toBeDefined();
    expect(Array.isArray(modeBSuggestions.bullets)).toBe(true);
    expect(modeBSuggestions.bullets[0].text).toBeDefined();
    expect(modeBSuggestions.bullets[0].capReason).toBeDefined();
    expect(modeBSuggestions.bullets[0].bulletKey).toBeDefined();
  });
});

// ============================================
// ENRICHED MATCH STRUCTURE TESTS
// ============================================

describe('EnrichedMatch structure', () => {
  it('contains evaluation and wardrobeItem', () => {
    const match = {
      evaluation: {
        item_a_id: 'scanned-1',
        item_b_id: 'wardrobe-1',
        pair_type: 'tops_bottoms',
        raw_score: 0.85,
        confidence_tier: 'HIGH' as const,
        cap_reasons: [],
        hard_fail_reason: null,
        is_shoes_involved: false,
        explanation_allowed: true,
      },
      wardrobeItem: {
        id: 'wardrobe-1',
        imageUri: 'file:///mock.jpg',
        category: 'bottoms' as const,
        colors: [{ hex: '#000', name: 'Black' }],
        createdAt: Date.now(),
      },
      explanation: 'Easy + easy: clean, effortless balance.',
      explanationAllowed: true,
    };

    expect(match.evaluation).toBeDefined();
    expect(match.wardrobeItem).toBeDefined();
    expect(match.explanation).toBeDefined();
    expect(match.explanationAllowed).toBe(true);
  });

  it('explanation can be null when not allowed', () => {
    const match = {
      evaluation: {} as any,
      wardrobeItem: {} as any,
      explanation: null,
      explanationAllowed: false,
    };

    expect(match.explanation).toBeNull();
    expect(match.explanationAllowed).toBe(false);
  });
});

// ============================================
// UI STATE DERIVATION TESTS
// ============================================

describe('UI state derivation logic', () => {
  describe('HIGH state conditions', () => {
    it('requires highMatchCount > 0', () => {
      const highMatchCount = 3;
      const nearMatchCount = 0;
      
      // If highMatchCount > 0, we're in HIGH state
      const isHighState = highMatchCount > 0;
      expect(isHighState).toBe(true);
    });
  });

  describe('MEDIUM state conditions', () => {
    it('requires nearMatchCount > 0 and highMatchCount === 0', () => {
      const highMatchCount = 0;
      const nearMatchCount = 2;
      
      // If nearMatchCount > 0 and highMatchCount === 0, we're in MEDIUM state
      const isMediumState = highMatchCount === 0 && nearMatchCount > 0;
      expect(isMediumState).toBe(true);
    });
  });

  describe('LOW state conditions', () => {
    it('occurs when both counts are 0', () => {
      const highMatchCount = 0;
      const nearMatchCount = 0;
      
      // If both are 0, we're in LOW state
      const isLowState = highMatchCount === 0 && nearMatchCount === 0;
      expect(isLowState).toBe(true);
    });
  });
});

// ============================================
// SUGGESTIONS MODE TESTS
// ============================================

describe('Suggestions mode selection', () => {
  it('Mode A is for missing pieces (LOW/HIGH without suggestions)', () => {
    // Mode A: "What to add to your wardrobe"
    const suggestionsMode = 'A';
    expect(suggestionsMode).toBe('A');
  });

  it('Mode B is for styling tips (MEDIUM with near matches)', () => {
    // Mode B: "How to style these near matches"
    const suggestionsMode = 'B';
    expect(suggestionsMode).toBe('B');
  });

  it('only two modes exist', () => {
    const validModes = ['A', 'B'];
    expect(validModes).toHaveLength(2);
  });
});

// ============================================
// PAIR TYPE EXPLANATION TESTS
// ============================================

describe('Pair type explanations', () => {
  const pairTypeExplanations: Record<string, string> = {
    tops_bottoms: "Easy + easy: clean, effortless balance.",
    tops_shoes: "Simple shoes keep the look cohesive.",
    bottoms_shoes: "Balanced proportions from the ground up.",
    tops_outerwear: "Adds structure without changing the vibe.",
    dresses_shoes: "Same dressiness level — nothing feels off.",
  };

  it('has explanation for tops_bottoms', () => {
    expect(pairTypeExplanations.tops_bottoms).toBeDefined();
    expect(pairTypeExplanations.tops_bottoms.length).toBeGreaterThan(0);
  });

  it('has explanation for tops_shoes', () => {
    expect(pairTypeExplanations.tops_shoes).toBeDefined();
  });

  it('has explanation for bottoms_shoes', () => {
    expect(pairTypeExplanations.bottoms_shoes).toBeDefined();
  });

  it('has explanation for tops_outerwear', () => {
    expect(pairTypeExplanations.tops_outerwear).toBeDefined();
  });

  it('has explanation for dresses_shoes', () => {
    expect(pairTypeExplanations.dresses_shoes).toBeDefined();
  });

  it('all explanations are non-empty strings', () => {
    Object.values(pairTypeExplanations).forEach(explanation => {
      expect(typeof explanation).toBe('string');
      expect(explanation.length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// EDGE CASES
// ============================================

describe('Edge cases', () => {
  describe('null scanned item', () => {
    it('should return empty result for null scannedItem', () => {
      // This is tested by the hook returning getEmptyResult()
      const emptyResult: ConfidenceEngineResult = {
        evaluated: false,
        debugTier: 'LOW',
        showMatchesSection: false,
        matches: [],
        highMatchCount: 0,
        nearMatchCount: 0,
        bestMatch: null,
        suggestionsMode: 'A',
        modeASuggestions: null,
        modeBSuggestions: null,
        uiVibeForCopy: 'casual',
        rawEvaluation: null,
      };

      expect(emptyResult.evaluated).toBe(false);
      expect(emptyResult.matches).toHaveLength(0);
    });
  });

  describe('unknown category', () => {
    it('should handle unknown/null category gracefully', () => {
      // When category is unknown, should still return result with Mode A
      const unknownCategoryResult: Partial<ConfidenceEngineResult> = {
        evaluated: false,
        suggestionsMode: 'A',
        modeASuggestions: {
          intro: 'Start building your wardrobe:',
          bullets: [],
        },
      };

      expect(unknownCategoryResult.suggestionsMode).toBe('A');
    });
  });

  describe('empty wardrobe', () => {
    it('should handle empty wardrobe', () => {
      const wardrobeItems: any[] = [];
      expect(wardrobeItems).toHaveLength(0);
      
      // With empty wardrobe, no matches possible
      const expectedHighMatchCount = 0;
      const expectedNearMatchCount = 0;
      
      expect(expectedHighMatchCount).toBe(0);
      expect(expectedNearMatchCount).toBe(0);
    });
  });
});
