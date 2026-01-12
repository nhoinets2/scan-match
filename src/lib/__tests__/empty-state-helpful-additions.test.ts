/**
 * Empty State Helpful Additions Test Suite
 * 
 * Tests for helpfulAdditionRows generation when wardrobeCount === 0.
 * Covers:
 * - Filtering out bullets with target: null in empty state
 * - Returning empty array when all bullets are filtered
 * - Mode A vs Mode B suggestions handling
 * - Legacy missing pieces fallback
 */

// Define __DEV__ for test environment
// @ts-expect-error - __DEV__ is a React Native global
globalThis.__DEV__ = true;

import { filterModeABullets } from '../mode-a-bullet-filter';
import type { SuggestionBullet, SuggestionTargetCategory } from '../confidence-engine/types';
import type { ConfidenceEngineResult } from '../useConfidenceEngine';

// Helper to create a mock bullet
function createBullet(text: string, target: SuggestionTargetCategory): SuggestionBullet {
  return { key: `TEST_${text.toUpperCase().replace(/\s+/g, '_')}`, text, target };
}

// Helper to create mock Mode A suggestions
function createModeASuggestions(bullets: SuggestionBullet[]) {
  return {
    intro: 'To make this item easy to wear:',
    bullets,
  };
}

// Helper to create mock ConfidenceEngineResult
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
 * Simulates the helpfulAdditionRows generation logic for empty state
 * This mirrors the logic in results.tsx useMemo
 */
function generateHelpfulAdditionRows(
  confidenceResult: ConfidenceEngineResult,
  wardrobeCount: number
): Array<{ id: string; title: string; target: string | null }> {
  // Mode A: Missing pieces (from confidence engine)
  if (
    confidenceResult.evaluated &&
    confidenceResult.suggestionsMode === 'A' &&
    confidenceResult.modeASuggestions
  ) {
    const suggestion = confidenceResult.modeASuggestions;

    // Filter out bullets with target: null when wardrobe is empty
    const filteredBullets = filterModeABullets(suggestion.bullets, wardrobeCount);

    // If all bullets were filtered out, return empty array (section will be hidden)
    if (filteredBullets.length === 0) {
      return [];
    }

    return filteredBullets.slice(0, 3).map((bullet, idx) => ({
      id: `mode-a-${idx}`,
      title: bullet.text,
      target: bullet.target,
    }));
  }

  // Mode B: Styling tips
  if (
    confidenceResult.evaluated &&
    confidenceResult.suggestionsMode === 'B' &&
    confidenceResult.modeBSuggestions
  ) {
    const suggestion = confidenceResult.modeBSuggestions;
    return suggestion.bullets.slice(0, 3).map((bullet, idx) => ({
      id: `mode-b-${idx}`,
      title: bullet.text,
      target: null, // Mode B bullets don't have targets
    }));
  }

  return [];
}

describe('Empty State Helpful Additions', () => {
  describe('when wardrobeCount === 0', () => {
    describe('Mode A suggestions', () => {
      it('should filter out bullets with target: null', () => {
        const bullets: SuggestionBullet[] = [
          createBullet('Dark or structured bottoms', 'bottoms'),
          createBullet('Clean, simple outfit pieces', null),
          createBullet('Neutral everyday shoes', 'shoes'),
          createBullet('Simple outfit pieces', null),
        ];

        const confidenceResult = createMockConfidenceResult({
          modeASuggestions: createModeASuggestions(bullets),
        });

        const result = generateHelpfulAdditionRows(confidenceResult, 0);

        expect(result).toHaveLength(2);
        expect(result[0].title).toBe('Dark or structured bottoms');
        expect(result[0].target).toBe('bottoms');
        expect(result[1].title).toBe('Neutral everyday shoes');
        expect(result[1].target).toBe('shoes');
      });

      it('should return empty array if all bullets have target: null', () => {
        const bullets: SuggestionBullet[] = [
          createBullet('Keep the other pieces simple', null),
          createBullet('Choose neutral colors', null),
          createBullet('Avoid competing textures', null),
        ];

        const confidenceResult = createMockConfidenceResult({
          modeASuggestions: createModeASuggestions(bullets),
        });

        const result = generateHelpfulAdditionRows(confidenceResult, 0);

        expect(result).toHaveLength(0);
      });

      it('should return all bullets if none have target: null', () => {
        const bullets: SuggestionBullet[] = [
          createBullet('Dark or structured bottoms', 'bottoms'),
          createBullet('Neutral everyday shoes', 'shoes'),
          createBullet('Light layer for balance', 'outerwear'),
        ];

        const confidenceResult = createMockConfidenceResult({
          modeASuggestions: createModeASuggestions(bullets),
        });

        const result = generateHelpfulAdditionRows(confidenceResult, 0);

        expect(result).toHaveLength(3);
        expect(result.map((r) => r.title)).toEqual([
          'Dark or structured bottoms',
          'Neutral everyday shoes',
          'Light layer for balance',
        ]);
      });

      it('should limit results to 3 bullets', () => {
        const bullets: SuggestionBullet[] = [
          createBullet('Bullet 1', 'tops'),
          createBullet('Bullet 2', 'bottoms'),
          createBullet('Bullet 3', 'shoes'),
          createBullet('Bullet 4', 'outerwear'),
          createBullet('Bullet 5', 'accessories'),
        ];

        const confidenceResult = createMockConfidenceResult({
          modeASuggestions: createModeASuggestions(bullets),
        });

        const result = generateHelpfulAdditionRows(confidenceResult, 0);

        expect(result).toHaveLength(3);
      });

      it('should handle real-world Mode A template bullets', () => {
        // Simulating bullets from tops category template
        const bullets: SuggestionBullet[] = [
          createBullet('Dark or structured bottoms', 'bottoms'),
          createBullet('Neutral everyday shoes', 'shoes'),
          createBullet('Light layer for balance', 'outerwear'),
        ];

        const confidenceResult = createMockConfidenceResult({
          modeASuggestions: createModeASuggestions(bullets),
        });

        const result = generateHelpfulAdditionRows(confidenceResult, 0);

        expect(result).toHaveLength(3);
        expect(result.every((r) => r.target !== null)).toBe(true);
      });

      it('should handle bags category template (has null targets)', () => {
        // Bags template has bullets with target: null
        const bullets: SuggestionBullet[] = [
          createBullet('Clean, simple outfit pieces', null),
          createBullet('Neutral everyday shoes', 'shoes'),
          createBullet('Minimal competing accessories', 'accessories'),
        ];

        const confidenceResult = createMockConfidenceResult({
          modeASuggestions: createModeASuggestions(bullets),
        });

        const result = generateHelpfulAdditionRows(confidenceResult, 0);

        expect(result).toHaveLength(2);
        expect(result.map((r) => r.title)).toEqual([
          'Neutral everyday shoes',
          'Minimal competing accessories',
        ]);
      });
    });

    describe('Mode B suggestions', () => {
      it('should return Mode B bullets unchanged (no filtering)', () => {
        const confidenceResult = createMockConfidenceResult({
          suggestionsMode: 'B',
          modeBSuggestions: {
            intro: 'Styling tips',
            bullets: [
              { key: 'FORMALITY_TENSION__MATCH_DRESSINESS', text: 'Keep the rest of the outfit at the same level of dressiness.' },
              { key: 'FORMALITY_TENSION__AVOID_MIX', text: 'Avoid mixing very dressy pieces with very casual ones.' },
            ],
          },
        });

        const result = generateHelpfulAdditionRows(confidenceResult, 0);

        expect(result).toHaveLength(2);
        expect(result[0].title).toBe(
          'Keep the rest of the outfit at the same level of dressiness.'
        );
        expect(result[1].title).toBe(
          'Avoid mixing very dressy pieces with very casual ones.'
        );
      });
    });

    describe('No suggestions', () => {
      it('should return empty array when no suggestions available', () => {
        const confidenceResult = createMockConfidenceResult({
          modeASuggestions: null,
          modeBSuggestions: null,
        });

        const result = generateHelpfulAdditionRows(confidenceResult, 0);

        expect(result).toHaveLength(0);
      });

      it('should return empty array when confidence engine not evaluated', () => {
        const confidenceResult = createMockConfidenceResult({
          evaluated: false,
        });

        const result = generateHelpfulAdditionRows(confidenceResult, 0);

        expect(result).toHaveLength(0);
      });
    });
  });

  describe('when wardrobeCount > 0', () => {
    it('should return all Mode A bullets including null targets (limited to 3)', () => {
      const bullets: SuggestionBullet[] = [
        createBullet('Dark or structured bottoms', 'bottoms'),
        createBullet('Clean, simple outfit pieces', null),
        createBullet('Neutral everyday shoes', 'shoes'),
        createBullet('Simple outfit pieces', null),
      ];

      const confidenceResult = createMockConfidenceResult({
        modeASuggestions: createModeASuggestions(bullets),
      });

      const result = generateHelpfulAdditionRows(confidenceResult, 5);

      // Results are limited to 3 bullets
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.title)).toEqual([
        'Dark or structured bottoms',
        'Clean, simple outfit pieces',
        'Neutral everyday shoes',
      ]);
      // Verify null targets are included when wardrobeCount > 0
      expect(result[1].target).toBeNull();
    });
  });
});

// ============================================
// TAB-AWARE HELPFUL ADDITIONS (regression tests for LOW tier bug)
// ============================================

/**
 * Simulates the tab-aware helpfulAdditionRows logic from results.tsx
 * This mirrors the actual useMemo logic including the hasNearContent guard
 */
function generateTabAwareHelpfulAdditionRows(
  isHighTab: boolean,
  hasNearContent: boolean,
  nearMatchEvals: Array<{ cap_reasons: string[] }>,
  modeASuggestions: { intro: string; bullets: SuggestionBullet[] } | null,
  wardrobeCount: number
): Array<{ id: string; title: string; mode: 'A' | 'B' }> {
  // NEAR tab with actual NEAR content: Use Mode B
  if (!isHighTab && hasNearContent) {
    // Simplified Mode B generation (just check if we have cap reasons)
    const hasCapReasons = nearMatchEvals.some(e => e.cap_reasons.length > 0);
    
    if (hasCapReasons) {
      // Return Mode B bullets (simplified for test)
      return [
        { id: 'mode-b-0', title: 'Mode B styling tip', mode: 'B' },
      ];
    }
    // Fall through to Mode A if Mode B is empty
  }

  // HIGH tab OR LOW tier (no matches) OR Mode B empty: Use Mode A
  if (modeASuggestions && modeASuggestions.bullets.length > 0) {
    const filteredBullets = filterModeABullets(modeASuggestions.bullets, wardrobeCount);
    
    if (filteredBullets.length === 0) {
      return [];
    }
    
    return filteredBullets.slice(0, 3).map((bullet, idx) => ({
      id: `mode-a-${idx}`,
      title: bullet.text,
      mode: 'A' as const,
    }));
  }

  return [];
}

describe('Tab-Aware Helpful Additions (LOW tier regression)', () => {
  const modeABullets: SuggestionBullet[] = [
    createBullet('Simple top in a neutral tone', 'tops'),
    createBullet('Everyday shoes that don\'t compete', 'shoes'),
    createBullet('Optional outer layer for structure', 'outerwear'),
  ];

  describe('LOW tier + no NEAR content + Mode A exists', () => {
    it('should return Mode A bullets (not empty)', () => {
      // This is the bug case: isHighTab=false (defaults to near), but no NEAR content
      const result = generateTabAwareHelpfulAdditionRows(
        false,              // isHighTab (defaults to near in LOW tier)
        false,              // hasNearContent (no NEAR matches)
        [],                 // nearMatchEvals (empty)
        { intro: 'To complete:', bullets: modeABullets },
        1                   // wardrobeCount > 0
      );

      expect(result).toHaveLength(3);
      expect(result[0].mode).toBe('A');
      expect(result[0].title).toBe('Simple top in a neutral tone');
    });
  });

  describe('NEAR tab + has NEAR content + Mode B returns empty', () => {
    it('should fall through to Mode A', () => {
      // NEAR content exists but no cap reasons → Mode B empty → fall through
      const result = generateTabAwareHelpfulAdditionRows(
        false,              // isHighTab
        true,               // hasNearContent
        [{ cap_reasons: [] }],  // nearMatchEvals with no cap reasons
        { intro: 'To complete:', bullets: modeABullets },
        1
      );

      expect(result).toHaveLength(3);
      expect(result[0].mode).toBe('A');
    });
  });

  describe('NEAR tab + has NEAR content + Mode B non-empty', () => {
    it('should return Mode B bullets', () => {
      const result = generateTabAwareHelpfulAdditionRows(
        false,              // isHighTab
        true,               // hasNearContent
        [{ cap_reasons: ['FORMALITY_TENSION'] }],  // has cap reasons
        { intro: 'To complete:', bullets: modeABullets },
        1
      );

      expect(result).toHaveLength(1);
      expect(result[0].mode).toBe('B');
      expect(result[0].title).toBe('Mode B styling tip');
    });
  });

  describe('HIGH tab + Mode A exists', () => {
    it('should return Mode A bullets', () => {
      const result = generateTabAwareHelpfulAdditionRows(
        true,               // isHighTab
        false,              // hasNearContent (doesn't matter for HIGH)
        [],                 // nearMatchEvals
        { intro: 'To complete:', bullets: modeABullets },
        1
      );

      expect(result).toHaveLength(3);
      expect(result[0].mode).toBe('A');
    });
  });
});

