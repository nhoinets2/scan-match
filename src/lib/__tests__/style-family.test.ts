/**
 * Style Family Resolution Tests
 *
 * Locks the behavior of style family derivation across both pipelines:
 * - style-inference.ts (scan pipeline)
 * - integration.ts (wardrobe pipeline)
 *
 * Key invariants:
 * 1. Order invariance: tag order doesn't affect result
 * 2. Priority logic: 'casual' is low-priority, never overrides specific tags
 * 3. Empty array: returns 'unknown', no crash
 */

import { normalizeStyleTags, vibeToFamily } from '../style-inference';
import { toStyleFamily } from '../confidence-engine/integration';
import type { StyleVibe } from '../types';
import type { StyleFamily } from '../confidence-engine/types';

describe('Style Family Resolution', () => {
  // Test cases: [input tags, expected family]
  const testCases: Array<[StyleVibe[], StyleFamily]> = [
    [['casual', 'minimal'], 'minimal'],
    [['minimal', 'casual'], 'minimal'],
    [['casual'], 'classic'],
    [['casual', 'sporty'], 'athleisure'],
    [[], 'unknown'],
  ];

  describe('normalizeStyleTags (scan pipeline)', () => {
    test.each(testCases)(
      '%j → %s',
      (tags, expectedFamily) => {
        const result = normalizeStyleTags(tags, []);
        expect(result.styleFamily).toBe(expectedFamily);
      }
    );
  });

  describe('toStyleFamily (wardrobe pipeline)', () => {
    test.each(testCases)(
      '%j → %s',
      (tags, expectedFamily) => {
        const result = toStyleFamily(tags, []);
        expect(result).toBe(expectedFamily);
      }
    );
  });

  describe('Order invariance', () => {
    const orderPairs: Array<[StyleVibe[], StyleVibe[]]> = [
      [['casual', 'minimal'], ['minimal', 'casual']],
      [['casual', 'sporty'], ['sporty', 'casual']],
      [['casual', 'street'], ['street', 'casual']],
      [['casual', 'feminine'], ['feminine', 'casual']],
      [['casual', 'office'], ['office', 'casual']],
    ];

    test.each(orderPairs)(
      '%j and %j resolve identically',
      (tagsA, tagsB) => {
        // Scan pipeline
        const scanA = normalizeStyleTags(tagsA, []);
        const scanB = normalizeStyleTags(tagsB, []);
        expect(scanA.styleFamily).toBe(scanB.styleFamily);

        // Wardrobe pipeline
        const wardrobeA = toStyleFamily(tagsA, []);
        const wardrobeB = toStyleFamily(tagsB, []);
        expect(wardrobeA).toBe(wardrobeB);

        // Cross-pipeline consistency
        expect(scanA.styleFamily).toBe(wardrobeA);
      }
    );
  });

  describe('Casual never overrides specific families', () => {
    const specificTags: StyleVibe[] = ['minimal', 'office', 'street', 'feminine', 'sporty'];

    test.each(specificTags)(
      'casual + %s → %s wins',
      (specificTag) => {
        const tagsWithCasualFirst: StyleVibe[] = ['casual', specificTag];
        const tagsWithCasualLast: StyleVibe[] = [specificTag, 'casual'];

        const expectedFamily = vibeToFamily(specificTag);

        // Scan pipeline
        expect(normalizeStyleTags(tagsWithCasualFirst, []).styleFamily).toBe(expectedFamily);
        expect(normalizeStyleTags(tagsWithCasualLast, []).styleFamily).toBe(expectedFamily);

        // Wardrobe pipeline
        expect(toStyleFamily(tagsWithCasualFirst, [])).toBe(expectedFamily);
        expect(toStyleFamily(tagsWithCasualLast, [])).toBe(expectedFamily);
      }
    );
  });

  describe('Pipeline consistency', () => {
    const allVibes: StyleVibe[] = ['casual', 'minimal', 'office', 'street', 'feminine', 'sporty'];

    test.each(allVibes)(
      'Single tag %s resolves same in both pipelines',
      (vibe) => {
        const tags: StyleVibe[] = [vibe];
        const scanResult = normalizeStyleTags(tags, []).styleFamily;
        const wardrobeResult = toStyleFamily(tags, []);
        expect(scanResult).toBe(wardrobeResult);
      }
    );
  });
});
