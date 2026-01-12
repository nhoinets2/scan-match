/**
 * Color Signal Test Suite
 *
 * Tests for colorScore function - core domain logic for color compatibility.
 * Includes contract tests for bounds and integer enforcement.
 */

import { colorScore, hueDist } from '../utils';
import type { ColorProfile } from '../types';

// Helper to create color profiles
function createColorProfile(overrides: Partial<ColorProfile> = {}): ColorProfile {
  return {
    is_neutral: false,
    dominant_hue: 0,
    saturation: 'med',
    value: 'med',
    ...overrides,
  };
}

function createNeutral(overrides: Partial<ColorProfile> = {}): ColorProfile {
  return {
    is_neutral: true,
    saturation: 'low',
    value: 'med',
    ...overrides,
  };
}

describe('hueDist', () => {
  it('returns 0 for same hue', () => {
    expect(hueDist(180, 180)).toBe(0);
  });

  it('returns correct distance for adjacent hues', () => {
    expect(hueDist(0, 30)).toBe(30);
    expect(hueDist(30, 0)).toBe(30);
  });

  it('wraps around the color wheel correctly', () => {
    expect(hueDist(350, 10)).toBe(20);
    expect(hueDist(10, 350)).toBe(20);
  });

  it('returns max 180 for opposite hues', () => {
    expect(hueDist(0, 180)).toBe(180);
    expect(hueDist(90, 270)).toBe(180);
  });
});

describe('colorScore - Neutral Colors', () => {
  it('returns +2 for both neutrals', () => {
    const a = createNeutral();
    const b = createNeutral();
    expect(colorScore(a, b)).toBe(2);
  });

  it('returns +1 for one neutral + one chromatic', () => {
    const neutral = createNeutral();
    const chromatic = createColorProfile({ dominant_hue: 200 });

    expect(colorScore(neutral, chromatic)).toBe(1);
    expect(colorScore(chromatic, neutral)).toBe(1);
  });
});

describe('colorScore - Hue Distance Buckets', () => {
  it('returns +2 for same hue (0°)', () => {
    const a = createColorProfile({ dominant_hue: 120 });
    const b = createColorProfile({ dominant_hue: 120 });
    expect(colorScore(a, b)).toBe(2);
  });

  it('returns +2 for analogous hues (≤30°)', () => {
    const a = createColorProfile({ dominant_hue: 100 });
    const b = createColorProfile({ dominant_hue: 125 });
    expect(colorScore(a, b)).toBe(2);
  });

  it('returns -2 for near-clash (30-45°)', () => {
    const a = createColorProfile({ dominant_hue: 100 });
    const b = createColorProfile({ dominant_hue: 140 });
    expect(colorScore(a, b)).toBe(-2);
  });

  it('returns -1 for awkward zone (45-90°)', () => {
    const a = createColorProfile({ dominant_hue: 0 });
    const b = createColorProfile({ dominant_hue: 60 });
    expect(colorScore(a, b)).toBe(-1);
  });

  it('returns 0 for triadic (90-120°)', () => {
    const a = createColorProfile({ dominant_hue: 0 });
    const b = createColorProfile({ dominant_hue: 100 });
    expect(colorScore(a, b)).toBe(0);
  });

  it('returns +1 for split-complementary (120-150°)', () => {
    const a = createColorProfile({ dominant_hue: 0 });
    const b = createColorProfile({ dominant_hue: 140 });
    expect(colorScore(a, b)).toBe(1);
  });

  it('returns +2 for complementary (150-180°)', () => {
    const a = createColorProfile({ dominant_hue: 0 });
    const b = createColorProfile({ dominant_hue: 180 });
    expect(colorScore(a, b)).toBe(2);
  });
});

describe('colorScore - Saturation Modifiers', () => {
  it('amplifies positive score by +1 when both high saturation', () => {
    const a = createColorProfile({ dominant_hue: 0, saturation: 'high' });
    const b = createColorProfile({ dominant_hue: 0, saturation: 'high' });
    // Base: +2 (same hue), +1 modifier = clamped to +2
    expect(colorScore(a, b)).toBe(2);
  });

  it('amplifies negative score by -1 when both high saturation', () => {
    const a = createColorProfile({ dominant_hue: 0, saturation: 'high' });
    const b = createColorProfile({ dominant_hue: 60, saturation: 'high' });
    // Base: -1 (awkward), -1 modifier = -2
    expect(colorScore(a, b)).toBe(-2);
  });

  it('dampens score toward 0 when both low saturation', () => {
    const a = createColorProfile({ dominant_hue: 0, saturation: 'low' });
    const b = createColorProfile({ dominant_hue: 60, saturation: 'low' });
    // Base: -1 (awkward), dampened by 0.5 = -0.5 → rounds to 0
    expect(colorScore(a, b)).toBe(0);
  });
});

describe('colorScore - Value Modifiers', () => {
  it('adds +1 bonus for high value contrast', () => {
    const a = createColorProfile({ dominant_hue: 100, value: 'high' });
    const b = createColorProfile({ dominant_hue: 100, value: 'low' });
    // Base: +2 (same hue), +1 value contrast = clamped to +2
    expect(colorScore(a, b)).toBe(2);
  });

  it('no bonus for same value', () => {
    const a = createColorProfile({ dominant_hue: 100, value: 'med' });
    const b = createColorProfile({ dominant_hue: 100, value: 'med' });
    expect(colorScore(a, b)).toBe(2);
  });

  it('no bonus for adjacent values', () => {
    const a = createColorProfile({ dominant_hue: 100, value: 'high' });
    const b = createColorProfile({ dominant_hue: 100, value: 'med' });
    expect(colorScore(a, b)).toBe(2);
  });
});

describe('colorScore - Contract Tests', () => {
  const testProfiles: ColorProfile[] = [
    createNeutral(),
    createNeutral({ saturation: 'high' }),
    createColorProfile({ dominant_hue: 0, saturation: 'low', value: 'low' }),
    createColorProfile({ dominant_hue: 60, saturation: 'med', value: 'med' }),
    createColorProfile({ dominant_hue: 120, saturation: 'high', value: 'high' }),
    createColorProfile({ dominant_hue: 180, saturation: 'low', value: 'high' }),
    createColorProfile({ dominant_hue: 240, saturation: 'high', value: 'low' }),
    createColorProfile({ dominant_hue: 300, saturation: 'med', value: 'low' }),
  ];

  it('always returns value within [-2, +2]', () => {
    for (const a of testProfiles) {
      for (const b of testProfiles) {
        const result = colorScore(a, b);
        expect(result).toBeGreaterThanOrEqual(-2);
        expect(result).toBeLessThanOrEqual(2);
      }
    }
  });

  it('always returns an integer', () => {
    for (const a of testProfiles) {
      for (const b of testProfiles) {
        const result = colorScore(a, b);
        expect(Number.isInteger(result)).toBe(true);
      }
    }
  });

  it('never returns NaN', () => {
    for (const a of testProfiles) {
      for (const b of testProfiles) {
        const result = colorScore(a, b);
        expect(Number.isNaN(result)).toBe(false);
      }
    }
  });

  it('is symmetric (order does not matter)', () => {
    for (const a of testProfiles) {
      for (const b of testProfiles) {
        expect(colorScore(a, b)).toBe(colorScore(b, a));
      }
    }
  });
});
