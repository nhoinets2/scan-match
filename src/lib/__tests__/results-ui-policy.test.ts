/**
 * Results UI Policy Test Suite
 *
 * Tests for the single-source-of-truth render model system.
 * Covers:
 * - UI State detection (HIGH/MEDIUM/LOW)
 * - Matches section visibility and variant rules
 * - Suggestions section visibility and mode selection
 * - Rescan CTA display logic
 * - Invariant enforcement
 */

// Define __DEV__ for test environment
// @ts-expect-error - __DEV__ is a React Native global
globalThis.__DEV__ = true;

import {
  getUiState,
  buildResultsRenderModel,
  type UiState,
  type ResultsRenderModel,
  type MatchesSectionVariant,
} from '../results-ui-policy';
import type { ConfidenceEngineResult, EnrichedMatch } from '../useConfidenceEngine';
import type { SuggestionBullet } from '../confidence-engine';

// ============================================
// TEST HELPERS
// ============================================

/**
 * Creates a mock ConfidenceEngineResult with sensible defaults
 */
function createMockConfidenceResult(
  overrides: Partial<ConfidenceEngineResult> = {}
): ConfidenceEngineResult {
  const { uiVibeForCopy = 'casual', ...rest } = overrides;
  return {
    evaluated: true,
    debugTier: 'LOW',
    highMatchCount: 0,
    nearMatchCount: 0,
    matches: [],
    bestMatch: null,
    showMatchesSection: false,
    suggestionsMode: 'A',
    modeASuggestions: null,
    modeBSuggestions: null,
    rawEvaluation: null,
    ...rest,
    uiVibeForCopy,
  };
}

/**
 * Creates a mock EnrichedMatch
 */
function createMockMatch(id: string = 'match-1'): EnrichedMatch {
  return {
    evaluation: {
      item_a_id: 'scanned-item',
      item_b_id: id,
      pair_type: 'tops_bottoms',
      raw_score: 0.85,
      confidence_tier: 'HIGH',
      forced_tier: null,
      hard_fail_reason: null,
      cap_reasons: [],
      features: {
        C: { value: 2, known: true },
        S: { value: 1, known: true },
        F: { value: 1, known: true },
        T: { value: 0, known: true },
        U: { value: 1, known: true },
      },
      explanation_allowed: true,
      explanation_forbidden_reason: null,
      explanation_template_id: null,
      explanation_specificity_level: null,
      both_statement: false,
      is_shoes_involved: false,
      high_threshold_used: 0.78,
      weights_used: { C: 0.3, S: 0.25, F: 0.2, T: 0.15, U: 0.1, V: 0 },
    },
    wardrobeItem: {
      id,
      category: 'tops',
      colors: [{ name: 'Blue', hex: '#0000FF' }],
      imageUri: 'https://example.com/image.jpg',
      createdAt: Date.now(),
    },
    explanation: 'Great match',
    explanationAllowed: true,
  };
}

/**
 * Creates Mode A suggestions with proper structure
 */
function createModeASuggestions(bullets: Array<{ text: string; target: string | null }>) {
  return {
    intro: 'Consider adding:',
    bullets: bullets as SuggestionBullet[],
  };
}

/**
 * Creates Mode B suggestions with proper structure
 */
function createModeBSuggestions(bullets: string[], intro: string = 'To make this work:') {
  return {
    intro,
    bullets: bullets.map((text, idx) => ({ key: `TEST_MODE_B_${idx}`, text })),
  };
}

// ============================================
// UI STATE DETECTION
// ============================================

describe('getUiState', () => {
  describe('returns HIGH', () => {
    it('when highMatchCount > 0', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 1,
        nearMatchCount: 0,
      });
      expect(getUiState(result)).toBe('HIGH');
    });

    it('when highMatchCount > 0 even with nearMatches', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 2,
        nearMatchCount: 5,
      });
      expect(getUiState(result)).toBe('HIGH');
    });
  });

  describe('returns MEDIUM', () => {
    it('when nearMatchCount > 0 and highMatchCount === 0', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 0,
        nearMatchCount: 3,
      });
      expect(getUiState(result)).toBe('MEDIUM');
    });
  });

  describe('returns LOW', () => {
    it('when both counts are 0', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 0,
        nearMatchCount: 0,
      });
      expect(getUiState(result)).toBe('LOW');
    });

    it('when engine not evaluated', () => {
      const result = createMockConfidenceResult({
        evaluated: false,
        highMatchCount: 5, // Should be ignored
        nearMatchCount: 3, // Should be ignored
      });
      expect(getUiState(result)).toBe('LOW');
    });
  });
});

// ============================================
// MATCHES SECTION VISIBILITY
// ============================================

describe('buildResultsRenderModel - matchesSection', () => {
  describe('variant = "matches"', () => {
    it('when HIGH state and matches exist', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 2,
        matches: [createMockMatch('1'), createMockMatch('2')],
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.matchesSection.variant).toBe('matches');
      expect(model.matchesSection.visible).toBe(true);
    });
  });

  describe('variant = "empty-cta"', () => {
    it('when wardrobeCount === 0 (regardless of UI state)', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 0,
        nearMatchCount: 0,
      });
      const model = buildResultsRenderModel(result, 0);

      expect(model.matchesSection.variant).toBe('empty-cta');
      expect(model.matchesSection.visible).toBe(true);
    });

    it('when wardrobeCount === 0 and MEDIUM state', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 0,
        nearMatchCount: 3,
      });
      const model = buildResultsRenderModel(result, 0);

      expect(model.matchesSection.variant).toBe('empty-cta');
      expect(model.matchesSection.visible).toBe(true);
    });
  });

  describe('variant = "hidden"', () => {
    it('when LOW state and wardrobeCount > 0', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 0,
        nearMatchCount: 0,
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.matchesSection.variant).toBe('hidden');
      expect(model.matchesSection.visible).toBe(false);
    });

    it('when MEDIUM state and wardrobeCount > 0', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 0,
        nearMatchCount: 3,
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.matchesSection.variant).toBe('hidden');
      expect(model.matchesSection.visible).toBe(false);
    });

    it('when HIGH state but matches array is empty', () => {
      // Edge case: highMatchCount > 0 but matches array empty (data inconsistency)
      const result = createMockConfidenceResult({
        highMatchCount: 2,
        matches: [], // Inconsistent with highMatchCount
      });
      const model = buildResultsRenderModel(result, 5);

      // Should be hidden because matches.length === 0
      expect(model.matchesSection.variant).toBe('hidden');
      expect(model.matchesSection.visible).toBe(false);
    });
  });

  describe('visible is derived from variant', () => {
    it('visible === true when variant !== "hidden"', () => {
      // Test matches variant
      const matchesResult = createMockConfidenceResult({
        highMatchCount: 1,
        matches: [createMockMatch()],
      });
      const matchesModel = buildResultsRenderModel(matchesResult, 5);
      expect(matchesModel.matchesSection.visible).toBe(matchesModel.matchesSection.variant !== 'hidden');

      // Test empty-cta variant
      const emptyResult = createMockConfidenceResult();
      const emptyModel = buildResultsRenderModel(emptyResult, 0);
      expect(emptyModel.matchesSection.visible).toBe(emptyModel.matchesSection.variant !== 'hidden');

      // Test hidden variant
      const hiddenResult = createMockConfidenceResult();
      const hiddenModel = buildResultsRenderModel(hiddenResult, 5);
      expect(hiddenModel.matchesSection.visible).toBe(hiddenModel.matchesSection.variant !== 'hidden');
    });
  });
});

// ============================================
// SUGGESTIONS SECTION VISIBILITY
// ============================================

describe('buildResultsRenderModel - suggestionsSection', () => {
  const modeABullets = [
    { text: 'Add some bottoms', target: 'bottoms' },
    { text: 'Consider shoes', target: 'shoes' },
  ];

  const modeBBullets = ['Try pairing with neutral tones', 'Layer for depth'];

  describe('HIGH state', () => {
    it('shows Mode A when bullets exist', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 2,
        matches: [createMockMatch()],
        modeASuggestions: createModeASuggestions(modeABullets),
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.suggestionsSection.visible).toBe(true);
      expect(model.suggestionsSection.mode).toBe('A');
      expect(model.suggestionsSection.bullets.length).toBe(2);
    });

    it('hidden when Mode A is null', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 2,
        matches: [createMockMatch()],
        modeASuggestions: null,
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.suggestionsSection.visible).toBe(false);
    });

    it('hidden when Mode A bullets is empty', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 2,
        matches: [createMockMatch()],
        modeASuggestions: createModeASuggestions([]),
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.suggestionsSection.visible).toBe(false);
    });
  });

  describe('MEDIUM state', () => {
    it('shows Mode B when bullets exist', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 0,
        nearMatchCount: 3,
        modeBSuggestions: createModeBSuggestions(modeBBullets, 'To make this work:'),
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.suggestionsSection.visible).toBe(true);
      expect(model.suggestionsSection.mode).toBe('B');
      expect(model.suggestionsSection.intro).toBe('To make this work:');
    });

    it('falls back to Mode A when Mode B is null', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 0,
        nearMatchCount: 3,
        modeBSuggestions: null,
        modeASuggestions: createModeASuggestions(modeABullets),
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.suggestionsSection.visible).toBe(true);
      expect(model.suggestionsSection.mode).toBe('A');
      expect(model.suggestionsSection.bullets.length).toBe(2);
    });

    it('falls back to Mode A when Mode B bullets is empty', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 0,
        nearMatchCount: 3,
        modeBSuggestions: createModeBSuggestions([]),
        modeASuggestions: createModeASuggestions(modeABullets),
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.suggestionsSection.visible).toBe(true);
      expect(model.suggestionsSection.mode).toBe('A');
    });

    it('hidden when both Mode A and Mode B are empty', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 0,
        nearMatchCount: 3,
        modeBSuggestions: null,
        modeASuggestions: null,
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.suggestionsSection.visible).toBe(false);
    });
  });

  describe('LOW state', () => {
    it('shows Mode A when bullets exist', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 0,
        nearMatchCount: 0,
        modeASuggestions: createModeASuggestions(modeABullets),
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.suggestionsSection.visible).toBe(true);
      expect(model.suggestionsSection.mode).toBe('A');
    });

    it('hidden when Mode A is null', () => {
      const result = createMockConfidenceResult({
        highMatchCount: 0,
        nearMatchCount: 0,
        modeASuggestions: null,
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.suggestionsSection.visible).toBe(false);
    });
  });
});

// ============================================
// RESCAN CTA
// ============================================

describe('buildResultsRenderModel - showRescanCta', () => {
  it('true when: evaluated + wardrobeCount > 0 + no actionable content', () => {
    const result = createMockConfidenceResult({
      evaluated: true,
      highMatchCount: 0,
      nearMatchCount: 3, // MEDIUM state
      modeBSuggestions: null,
      modeASuggestions: null,
    });
    const model = buildResultsRenderModel(result, 5);

    expect(model.showRescanCta).toBe(true);
    expect(model.matchesSection.visible).toBe(false);
    expect(model.suggestionsSection.visible).toBe(false);
  });

  it('false when engine not evaluated', () => {
    const result = createMockConfidenceResult({
      evaluated: false,
      highMatchCount: 0,
      nearMatchCount: 0,
      modeBSuggestions: null,
      modeASuggestions: null,
    });
    const model = buildResultsRenderModel(result, 5);

    expect(model.showRescanCta).toBe(false);
  });

  it('false when wardrobeCount === 0 (empty-cta handles this)', () => {
    const result = createMockConfidenceResult({
      evaluated: true,
      highMatchCount: 0,
      nearMatchCount: 0,
      modeASuggestions: null,
    });
    const model = buildResultsRenderModel(result, 0);

    expect(model.showRescanCta).toBe(false);
    // empty-cta should be visible instead
    expect(model.matchesSection.variant).toBe('empty-cta');
    expect(model.matchesSection.visible).toBe(true);
  });

  it('false when matches section is visible', () => {
    const result = createMockConfidenceResult({
      evaluated: true,
      highMatchCount: 2,
      matches: [createMockMatch()],
      modeASuggestions: null,
    });
    const model = buildResultsRenderModel(result, 5);

    expect(model.showRescanCta).toBe(false);
    expect(model.matchesSection.visible).toBe(true);
  });

  it('false when suggestions section is visible', () => {
    const result = createMockConfidenceResult({
      evaluated: true,
      highMatchCount: 0,
      nearMatchCount: 0,
      modeASuggestions: createModeASuggestions([{ text: 'Add bottoms', target: 'bottoms' }]),
    });
    const model = buildResultsRenderModel(result, 5);

    expect(model.showRescanCta).toBe(false);
    expect(model.suggestionsSection.visible).toBe(true);
  });
});

// ============================================
// SCENARIO COVERAGE (from test matrix)
// ============================================

describe('Scenario Coverage', () => {
  describe('Scenario 1: New user, first scan (wardrobeCount = 0)', () => {
    it('shows empty-cta + Mode A suggestions', () => {
      const result = createMockConfidenceResult({
        evaluated: true,
        highMatchCount: 0,
        nearMatchCount: 0,
        modeASuggestions: createModeASuggestions([{ text: 'Add some basics', target: 'tops' }]),
      });
      const model = buildResultsRenderModel(result, 0);

      expect(model.uiState).toBe('LOW');
      expect(model.matchesSection.variant).toBe('empty-cta');
      expect(model.matchesSection.visible).toBe(true);
      expect(model.suggestionsSection.visible).toBe(true);
      expect(model.suggestionsSection.mode).toBe('A');
      expect(model.showRescanCta).toBe(false);
    });
  });

  describe('Scenario 2: Has wardrobe, great matches (HIGH)', () => {
    it('shows matches + filtered Mode A', () => {
      const result = createMockConfidenceResult({
        evaluated: true,
        highMatchCount: 2,
        matches: [createMockMatch('1'), createMockMatch('2')],
        modeASuggestions: createModeASuggestions([{ text: 'Add outerwear', target: 'outerwear' }]),
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.uiState).toBe('HIGH');
      expect(model.matchesSection.variant).toBe('matches');
      expect(model.matchesSection.visible).toBe(true);
      expect(model.suggestionsSection.visible).toBe(true);
      expect(model.suggestionsSection.mode).toBe('A');
      expect(model.showRescanCta).toBe(false);
    });
  });

  describe('Scenario 3: Has wardrobe, near matches (MEDIUM) + Mode B', () => {
    it('shows Mode B suggestions, hides matches', () => {
      const result = createMockConfidenceResult({
        evaluated: true,
        highMatchCount: 0,
        nearMatchCount: 3,
        modeBSuggestions: createModeBSuggestions(['Tip 1', 'Tip 2'], 'To make this work:'),
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.uiState).toBe('MEDIUM');
      expect(model.matchesSection.visible).toBe(false);
      expect(model.suggestionsSection.visible).toBe(true);
      expect(model.suggestionsSection.mode).toBe('B');
      expect(model.showRescanCta).toBe(false);
    });
  });

  describe('Scenario 4: MEDIUM + Mode B empty → fallback to Mode A', () => {
    it('falls back to Mode A when Mode B is empty', () => {
      const result = createMockConfidenceResult({
        evaluated: true,
        highMatchCount: 0,
        nearMatchCount: 3,
        modeBSuggestions: null,
        modeASuggestions: createModeASuggestions([{ text: 'Consider adding...', target: 'shoes' }]),
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.uiState).toBe('MEDIUM');
      expect(model.matchesSection.visible).toBe(false);
      expect(model.suggestionsSection.visible).toBe(true);
      expect(model.suggestionsSection.mode).toBe('A');
      expect(model.showRescanCta).toBe(false);
    });
  });

  describe('Scenario 5: Has wardrobe, no matches (LOW) + Mode A', () => {
    it('hides matches, shows Mode A', () => {
      const result = createMockConfidenceResult({
        evaluated: true,
        highMatchCount: 0,
        nearMatchCount: 0,
        modeASuggestions: createModeASuggestions([{ text: 'Start with...', target: 'bottoms' }]),
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.uiState).toBe('LOW');
      expect(model.matchesSection.visible).toBe(false);
      expect(model.suggestionsSection.visible).toBe(true);
      expect(model.suggestionsSection.mode).toBe('A');
      expect(model.showRescanCta).toBe(false);
    });
  });

  describe('Scenario 6: MEDIUM + both modes empty → showRescanCta', () => {
    it('shows rescan CTA when nothing actionable', () => {
      const result = createMockConfidenceResult({
        evaluated: true,
        highMatchCount: 0,
        nearMatchCount: 3,
        modeBSuggestions: null,
        modeASuggestions: null,
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.uiState).toBe('MEDIUM');
      expect(model.matchesSection.visible).toBe(false);
      expect(model.suggestionsSection.visible).toBe(false);
      expect(model.showRescanCta).toBe(true);
    });
  });

  describe('Scenario 7: HIGH + all Mode A filtered', () => {
    it('shows matches, hides empty suggestions', () => {
      const result = createMockConfidenceResult({
        evaluated: true,
        highMatchCount: 2,
        matches: [createMockMatch('1'), createMockMatch('2')],
        modeASuggestions: createModeASuggestions([]), // All filtered out
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.uiState).toBe('HIGH');
      expect(model.matchesSection.visible).toBe(true);
      expect(model.matchesSection.variant).toBe('matches');
      expect(model.suggestionsSection.visible).toBe(false);
      expect(model.showRescanCta).toBe(false);
    });
  });

  describe('Scenario 8: Engine did not evaluate', () => {
    it('returns LOW state, no rescan CTA', () => {
      const result = createMockConfidenceResult({
        evaluated: false,
        highMatchCount: 0,
        nearMatchCount: 0,
      });
      const model = buildResultsRenderModel(result, 5);

      expect(model.uiState).toBe('LOW');
      expect(model.showRescanCta).toBe(false);
    });
  });
});

// ============================================
// SECTION COPY
// ============================================

describe('buildResultsRenderModel - section copy', () => {
  it('HIGH state has "expand this look" copy', () => {
    const result = createMockConfidenceResult({
      highMatchCount: 1,
      matches: [createMockMatch()],
      modeASuggestions: createModeASuggestions([{ text: 'Test', target: 'tops' }]),
    });
    const model = buildResultsRenderModel(result, 5);

    expect(model.suggestionsSection.title).toBe('If you want to expand this look');
  });

  it('MEDIUM state has "make this work" copy', () => {
    const result = createMockConfidenceResult({
      highMatchCount: 0,
      nearMatchCount: 2,
      modeBSuggestions: createModeBSuggestions(['Tip'], 'Custom intro'),
    });
    const model = buildResultsRenderModel(result, 5);

    expect(model.suggestionsSection.title).toBe('To make this work');
    // Uses custom intro from Mode B
    expect(model.suggestionsSection.intro).toBe('Custom intro');
  });

  it('LOW state has "what would help" copy', () => {
    const result = createMockConfidenceResult({
      highMatchCount: 0,
      nearMatchCount: 0,
      modeASuggestions: createModeASuggestions([{ text: 'Test', target: 'tops' }]),
    });
    const model = buildResultsRenderModel(result, 5);

    expect(model.suggestionsSection.title).toBe('What would help');
  });
});

// ============================================
// INVARIANT TESTS
// ============================================

describe('Invariants', () => {
  describe('visible derived from variant', () => {
    it('visible === (variant !== "hidden") always holds', () => {
      const testCases = [
        { highMatchCount: 2, matches: [createMockMatch()], wardrobeCount: 5 },
        { highMatchCount: 0, matches: [] as EnrichedMatch[], wardrobeCount: 0 },
        { highMatchCount: 0, matches: [] as EnrichedMatch[], wardrobeCount: 5 },
      ];

      for (const tc of testCases) {
        const result = createMockConfidenceResult({
          highMatchCount: tc.highMatchCount,
          matches: tc.matches,
        });
        const model = buildResultsRenderModel(result, tc.wardrobeCount);

        expect(model.matchesSection.visible).toBe(model.matchesSection.variant !== 'hidden');
      }
    });
  });

  describe('empty-cta implies wardrobeCount === 0', () => {
    it('variant === "empty-cta" only when wardrobeCount === 0', () => {
      // Test with wardrobeCount = 0
      const result1 = createMockConfidenceResult();
      const model1 = buildResultsRenderModel(result1, 0);
      if (model1.matchesSection.variant === 'empty-cta') {
        expect(true).toBe(true); // Valid case
      }

      // Test with wardrobeCount > 0 - should never be empty-cta
      const result2 = createMockConfidenceResult();
      const model2 = buildResultsRenderModel(result2, 5);
      expect(model2.matchesSection.variant).not.toBe('empty-cta');
    });
  });

  describe('showRescanCta mutual exclusivity', () => {
    it('showRescanCta === true implies no visible sections', () => {
      const result = createMockConfidenceResult({
        evaluated: true,
        highMatchCount: 0,
        nearMatchCount: 3,
        modeBSuggestions: null,
        modeASuggestions: null,
      });
      const model = buildResultsRenderModel(result, 5);

      if (model.showRescanCta) {
        expect(model.matchesSection.visible).toBe(false);
        expect(model.suggestionsSection.visible).toBe(false);
      }
    });
  });

  describe('suggestions visible implies bullets exist', () => {
    it('suggestionsSection.visible === true implies bullets.length > 0', () => {
      const testCases = [
        { modeASuggestions: createModeASuggestions([{ text: 'Test', target: 'tops' }]) },
        { modeBSuggestions: createModeBSuggestions(['Tip']), nearMatchCount: 2 },
      ];

      for (const tc of testCases) {
        const result = createMockConfidenceResult(tc);
        const model = buildResultsRenderModel(result, 5);

        if (model.suggestionsSection.visible) {
          expect(model.suggestionsSection.bullets.length).toBeGreaterThan(0);
        }
      }
    });
  });
});

// ============================================
// DEV ASSERTION FIRING TESTS
// ============================================

describe('Dev Assertions Fire on Invalid States', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('warns when highMatchCount !== matches.length', () => {
    const result = createMockConfidenceResult({
      evaluated: true,
      highMatchCount: 5, // Mismatch!
      matches: [createMockMatch()], // Only 1 match
    });
    buildResultsRenderModel(result, 5);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('highMatchCount !== matches.length')
    );
  });

  it('warns when uiState is HIGH but matches.length === 0', () => {
    const result = createMockConfidenceResult({
      evaluated: true,
      highMatchCount: 2, // This makes uiState HIGH
      matches: [], // But no matches!
    });
    buildResultsRenderModel(result, 5);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('uiState === HIGH but matches.length === 0')
    );
  });

  it('warns when uiState is HIGH but debugTier !== HIGH', () => {
    const result = createMockConfidenceResult({
      evaluated: true,
      highMatchCount: 1,
      matches: [createMockMatch()],
      debugTier: 'LOW', // Mismatch with uiState
    });
    buildResultsRenderModel(result, 5);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('uiState === HIGH but debugTier !== HIGH')
    );
  });
});
