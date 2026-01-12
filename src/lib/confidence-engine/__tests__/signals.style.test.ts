/**
 * Style Signal Test Suite
 *
 * Tests for styleScore function - core domain logic for style family compatibility.
 * Includes contract tests for bounds and integer enforcement.
 */

import { styleScore } from '../utils';
import type { StyleFamily } from '../types';

const ALL_STYLE_FAMILIES: StyleFamily[] = [
  'minimal',
  'classic',
  'street',
  'athleisure',
  'romantic',
  'edgy',
  'boho',
  'preppy',
  'formal',
  'unknown',
];

describe('styleScore - Same Family', () => {
  it('returns +2 for same family', () => {
    expect(styleScore('minimal', 'minimal')).toBe(2);
    expect(styleScore('classic', 'classic')).toBe(2);
    expect(styleScore('street', 'street')).toBe(2);
  });
});

describe('styleScore - Natural Neighbors', () => {
  it('returns +2 for minimal-classic', () => {
    expect(styleScore('minimal', 'classic')).toBe(2);
    expect(styleScore('classic', 'minimal')).toBe(2);
  });

  it('returns +2 for street-athleisure', () => {
    expect(styleScore('street', 'athleisure')).toBe(2);
    expect(styleScore('athleisure', 'street')).toBe(2);
  });
});

describe('styleScore - Tension Pairs', () => {
  it('returns -1 for preppy-street', () => {
    expect(styleScore('preppy', 'street')).toBe(-1);
    expect(styleScore('street', 'preppy')).toBe(-1);
  });

  it('returns -1 for formal-boho', () => {
    expect(styleScore('formal', 'boho')).toBe(-1);
    expect(styleScore('boho', 'formal')).toBe(-1);
  });
});

describe('styleScore - Opposing Pairs', () => {
  it('returns -2 for formal-athleisure', () => {
    expect(styleScore('formal', 'athleisure')).toBe(-2);
    expect(styleScore('athleisure', 'formal')).toBe(-2);
  });

  it('returns -2 for preppy-edgy', () => {
    expect(styleScore('preppy', 'edgy')).toBe(-2);
    expect(styleScore('edgy', 'preppy')).toBe(-2);
  });
});

describe('styleScore - Unknown Handling', () => {
  it('returns 0 when one style is unknown', () => {
    expect(styleScore('minimal', 'unknown')).toBe(0);
    expect(styleScore('unknown', 'classic')).toBe(0);
  });

  it('returns 2 when both styles are unknown (same family rule)', () => {
    // unknown === unknown hits the "same family" check first
    expect(styleScore('unknown', 'unknown')).toBe(2);
  });
});

describe('styleScore - Contract Tests', () => {
  it('always returns value within [-2, +2]', () => {
    for (const a of ALL_STYLE_FAMILIES) {
      for (const b of ALL_STYLE_FAMILIES) {
        const result = styleScore(a, b);
        expect(result).toBeGreaterThanOrEqual(-2);
        expect(result).toBeLessThanOrEqual(2);
      }
    }
  });

  it('always returns an integer', () => {
    for (const a of ALL_STYLE_FAMILIES) {
      for (const b of ALL_STYLE_FAMILIES) {
        const result = styleScore(a, b);
        expect(Number.isInteger(result)).toBe(true);
      }
    }
  });

  it('never returns NaN', () => {
    for (const a of ALL_STYLE_FAMILIES) {
      for (const b of ALL_STYLE_FAMILIES) {
        const result = styleScore(a, b);
        expect(Number.isNaN(result)).toBe(false);
      }
    }
  });

  it('is symmetric (order does not matter)', () => {
    for (const a of ALL_STYLE_FAMILIES) {
      for (const b of ALL_STYLE_FAMILIES) {
        expect(styleScore(a, b)).toBe(styleScore(b, a));
      }
    }
  });
});
