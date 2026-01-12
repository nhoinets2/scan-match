/**
 * Invariants Test Suite
 *
 * Contract tests that verify system-wide invariants:
 * - All feature values are integers in {-2, -1, 0, +1, +2}
 * - All feature values are within bounds [-2, +2]
 * - No NaN values anywhere
 * - Symmetry where expected
 */

import { colorScore, styleScore, formalityScore, textureScore, usageScore } from '../utils';
import { computeFeatureSignals } from '../signals';
import type { ColorProfile, StyleFamily, TextureType, FormalityLevel, ConfidenceItem } from '../types';

// ============================================
// TEST DATA
// ============================================

const ALL_STYLE_FAMILIES: StyleFamily[] = [
  'minimal', 'classic', 'street', 'athleisure', 'romantic',
  'edgy', 'boho', 'preppy', 'formal', 'unknown',
];

const ALL_FORMALITY_LEVELS: FormalityLevel[] = [1, 2, 3, 4, 5];

const ALL_TEXTURE_TYPES: TextureType[] = [
  'smooth', 'textured', 'soft', 'structured', 'mixed', 'unknown',
];

const SAMPLE_COLOR_PROFILES: ColorProfile[] = [
  { is_neutral: true, saturation: 'low', value: 'med' },
  { is_neutral: true, saturation: 'med', value: 'high' },
  { is_neutral: false, dominant_hue: 0, saturation: 'low', value: 'low' },
  { is_neutral: false, dominant_hue: 60, saturation: 'med', value: 'med' },
  { is_neutral: false, dominant_hue: 120, saturation: 'high', value: 'high' },
  { is_neutral: false, dominant_hue: 180, saturation: 'low', value: 'high' },
  { is_neutral: false, dominant_hue: 240, saturation: 'high', value: 'low' },
  { is_neutral: false, dominant_hue: 300, saturation: 'med', value: 'low' },
  { is_neutral: false, dominant_hue: 359, saturation: 'high', value: 'med' },
];

function createItem(overrides: Partial<ConfidenceItem> = {}): ConfidenceItem {
  return {
    id: 'test-item',
    category: 'tops',
    color_profile: { is_neutral: true, saturation: 'low', value: 'med' },
    style_family: 'minimal',
    formality_level: 3,
    texture_type: 'smooth',
    ...overrides,
  };
}

// ============================================
// INTEGER INVARIANTS
// ============================================

describe('Integer Invariants', () => {
  describe('colorScore returns integers only', () => {
    it('returns integer for all color profile combinations', () => {
      for (const a of SAMPLE_COLOR_PROFILES) {
        for (const b of SAMPLE_COLOR_PROFILES) {
          const result = colorScore(a, b);
          expect(Number.isInteger(result)).toBe(true);
        }
      }
    });
  });

  describe('styleScore returns integers only', () => {
    it('returns integer for all style family combinations', () => {
      for (const a of ALL_STYLE_FAMILIES) {
        for (const b of ALL_STYLE_FAMILIES) {
          const result = styleScore(a, b);
          expect(Number.isInteger(result)).toBe(true);
        }
      }
    });
  });

  describe('formalityScore returns integers only', () => {
    it('returns integer for all formality level combinations', () => {
      for (const a of ALL_FORMALITY_LEVELS) {
        for (const b of ALL_FORMALITY_LEVELS) {
          const result = formalityScore(a, b);
          expect(Number.isInteger(result)).toBe(true);
        }
      }
    });
  });

  describe('textureScore returns integers only', () => {
    it('returns integer for all texture type combinations', () => {
      for (const a of ALL_TEXTURE_TYPES) {
        for (const b of ALL_TEXTURE_TYPES) {
          const result = textureScore(a, b);
          expect(Number.isInteger(result)).toBe(true);
        }
      }
    });
  });

  describe('usageScore returns integers only', () => {
    it('returns integer for all formality/style combinations', () => {
      for (const fA of ALL_FORMALITY_LEVELS) {
        for (const fB of ALL_FORMALITY_LEVELS) {
          for (const sA of ALL_STYLE_FAMILIES) {
            for (const sB of ALL_STYLE_FAMILIES) {
              const result = usageScore(fA, fB, sA, sB);
              expect(Number.isInteger(result)).toBe(true);
            }
          }
        }
      }
    });
  });
});

// ============================================
// BOUNDS INVARIANTS
// ============================================

describe('Bounds Invariants', () => {
  const validValues = [-2, -1, 0, 1, 2];

  describe('colorScore bounds', () => {
    it('returns value in {-2, -1, 0, +1, +2}', () => {
      for (const a of SAMPLE_COLOR_PROFILES) {
        for (const b of SAMPLE_COLOR_PROFILES) {
          const result = colorScore(a, b);
          expect(validValues).toContain(result);
        }
      }
    });
  });

  describe('styleScore bounds', () => {
    it('returns value in {-2, -1, 0, +1, +2}', () => {
      for (const a of ALL_STYLE_FAMILIES) {
        for (const b of ALL_STYLE_FAMILIES) {
          const result = styleScore(a, b);
          expect(validValues).toContain(result);
        }
      }
    });
  });

  describe('formalityScore bounds', () => {
    it('returns value in {-2, -1, 0, +1, +2}', () => {
      for (const a of ALL_FORMALITY_LEVELS) {
        for (const b of ALL_FORMALITY_LEVELS) {
          const result = formalityScore(a, b);
          expect(validValues).toContain(result);
        }
      }
    });
  });

  describe('textureScore bounds', () => {
    it('returns value in {-2, -1, 0, +1, +2}', () => {
      for (const a of ALL_TEXTURE_TYPES) {
        for (const b of ALL_TEXTURE_TYPES) {
          const result = textureScore(a, b);
          expect(validValues).toContain(result);
        }
      }
    });
  });

  describe('usageScore bounds', () => {
    it('returns value in {-2, -1, 0, +1, +2}', () => {
      for (const fA of ALL_FORMALITY_LEVELS) {
        for (const fB of ALL_FORMALITY_LEVELS) {
          for (const sA of ALL_STYLE_FAMILIES) {
            for (const sB of ALL_STYLE_FAMILIES) {
              const result = usageScore(fA, fB, sA, sB);
              expect(validValues).toContain(result);
            }
          }
        }
      }
    });
  });
});

// ============================================
// NO NaN INVARIANTS
// ============================================

describe('No NaN Invariants', () => {
  describe('colorScore never returns NaN', () => {
    it('returns valid number for all combinations', () => {
      for (const a of SAMPLE_COLOR_PROFILES) {
        for (const b of SAMPLE_COLOR_PROFILES) {
          const result = colorScore(a, b);
          expect(Number.isNaN(result)).toBe(false);
        }
      }
    });
  });

  describe('styleScore never returns NaN', () => {
    it('returns valid number for all combinations', () => {
      for (const a of ALL_STYLE_FAMILIES) {
        for (const b of ALL_STYLE_FAMILIES) {
          const result = styleScore(a, b);
          expect(Number.isNaN(result)).toBe(false);
        }
      }
    });
  });

  describe('formalityScore never returns NaN', () => {
    it('returns valid number for all combinations', () => {
      for (const a of ALL_FORMALITY_LEVELS) {
        for (const b of ALL_FORMALITY_LEVELS) {
          const result = formalityScore(a, b);
          expect(Number.isNaN(result)).toBe(false);
        }
      }
    });
  });

  describe('computeFeatureSignals never returns NaN', () => {
    it('returns valid numbers for sample items', () => {
      const items: ConfidenceItem[] = [
        createItem(),
        createItem({ style_family: 'unknown' }),
        createItem({ texture_type: 'unknown' }),
        createItem({ style_family: 'unknown', texture_type: 'unknown' }),
        createItem({ formality_level: 1 }),
        createItem({ formality_level: 5 }),
      ];

      for (const a of items) {
        for (const b of items) {
          const signals = computeFeatureSignals(a, b, 'tops_bottoms');

          expect(Number.isNaN(signals.C.value)).toBe(false);
          expect(Number.isNaN(signals.S.value)).toBe(false);
          expect(Number.isNaN(signals.F.value)).toBe(false);
          expect(Number.isNaN(signals.T.value)).toBe(false);
          expect(Number.isNaN(signals.U.value)).toBe(false);
        }
      }
    });
  });
});

// ============================================
// SYMMETRY INVARIANTS
// ============================================

describe('Symmetry Invariants', () => {
  describe('colorScore is symmetric', () => {
    it('returns same value regardless of order', () => {
      for (const a of SAMPLE_COLOR_PROFILES) {
        for (const b of SAMPLE_COLOR_PROFILES) {
          expect(colorScore(a, b)).toBe(colorScore(b, a));
        }
      }
    });
  });

  describe('styleScore is symmetric', () => {
    it('returns same value regardless of order', () => {
      for (const a of ALL_STYLE_FAMILIES) {
        for (const b of ALL_STYLE_FAMILIES) {
          expect(styleScore(a, b)).toBe(styleScore(b, a));
        }
      }
    });
  });

  describe('formalityScore is symmetric', () => {
    it('returns same value regardless of order', () => {
      for (const a of ALL_FORMALITY_LEVELS) {
        for (const b of ALL_FORMALITY_LEVELS) {
          expect(formalityScore(a, b)).toBe(formalityScore(b, a));
        }
      }
    });
  });

  describe('textureScore is symmetric', () => {
    it('returns same value regardless of order', () => {
      for (const a of ALL_TEXTURE_TYPES) {
        for (const b of ALL_TEXTURE_TYPES) {
          expect(textureScore(a, b)).toBe(textureScore(b, a));
        }
      }
    });
  });
});

// ============================================
// FEATURE SIGNAL INTEGRATION INVARIANTS
// ============================================

describe('Feature Signal Invariants', () => {
  it('all known signals have values in valid range', () => {
    const items: ConfidenceItem[] = [
      createItem(),
      createItem({ style_family: 'formal', formality_level: 5 }),
      createItem({ style_family: 'athleisure', formality_level: 1 }),
      createItem({ texture_type: 'structured' }),
      createItem({ color_profile: { is_neutral: false, dominant_hue: 180, saturation: 'high', value: 'high' } }),
    ];

    for (const a of items) {
      for (const b of items) {
        const signals = computeFeatureSignals(a, b, 'tops_bottoms');

        // Check all known signals are in bounds
        if (signals.C.known) {
          expect(signals.C.value).toBeGreaterThanOrEqual(-2);
          expect(signals.C.value).toBeLessThanOrEqual(2);
        }
        if (signals.S.known) {
          expect(signals.S.value).toBeGreaterThanOrEqual(-2);
          expect(signals.S.value).toBeLessThanOrEqual(2);
        }
        if (signals.F.known) {
          expect(signals.F.value).toBeGreaterThanOrEqual(-2);
          expect(signals.F.value).toBeLessThanOrEqual(2);
        }
        if (signals.T.known) {
          expect(signals.T.value).toBeGreaterThanOrEqual(-2);
          expect(signals.T.value).toBeLessThanOrEqual(2);
        }
        if (signals.U.known) {
          expect(signals.U.value).toBeGreaterThanOrEqual(-2);
          expect(signals.U.value).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('C signal is always known (color is required)', () => {
    const items = [createItem(), createItem({ style_family: 'unknown' })];

    for (const a of items) {
      for (const b of items) {
        const signals = computeFeatureSignals(a, b, 'tops_bottoms');
        expect(signals.C.known).toBe(true);
      }
    }
  });

  it('F signal is always known (formality is required)', () => {
    const items = [createItem(), createItem({ style_family: 'unknown' })];

    for (const a of items) {
      for (const b of items) {
        const signals = computeFeatureSignals(a, b, 'tops_bottoms');
        expect(signals.F.known).toBe(true);
      }
    }
  });

  it('U signal is always known (uses formality fallback)', () => {
    const items = [
      createItem(),
      createItem({ style_family: 'unknown' }),
      createItem({ style_family: 'unknown', texture_type: 'unknown' }),
    ];

    for (const a of items) {
      for (const b of items) {
        const signals = computeFeatureSignals(a, b, 'tops_bottoms');
        expect(signals.U.known).toBe(true);
      }
    }
  });

  it('S signal is unknown when either style is unknown', () => {
    const knownItem = createItem({ style_family: 'minimal' });
    const unknownItem = createItem({ style_family: 'unknown' });

    const signals1 = computeFeatureSignals(knownItem, unknownItem, 'tops_bottoms');
    expect(signals1.S.known).toBe(false);

    const signals2 = computeFeatureSignals(unknownItem, knownItem, 'tops_bottoms');
    expect(signals2.S.known).toBe(false);

    const signals3 = computeFeatureSignals(unknownItem, unknownItem, 'tops_bottoms');
    expect(signals3.S.known).toBe(false);
  });

  it('T signal is unknown when either texture is unknown', () => {
    const knownItem = createItem({ texture_type: 'smooth' });
    const unknownItem = createItem({ texture_type: 'unknown' });

    const signals1 = computeFeatureSignals(knownItem, unknownItem, 'tops_bottoms');
    expect(signals1.T.known).toBe(false);

    const signals2 = computeFeatureSignals(unknownItem, knownItem, 'tops_bottoms');
    expect(signals2.T.known).toBe(false);
  });
});
