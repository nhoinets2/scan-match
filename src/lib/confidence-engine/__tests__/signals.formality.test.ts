/**
 * Formality Signal Test Suite
 *
 * Tests for formalityScore function - core domain logic for formality alignment.
 * Includes contract tests for bounds and integer enforcement.
 */

import { formalityScore } from '../utils';
import type { FormalityLevel } from '../types';

const ALL_FORMALITY_LEVELS: FormalityLevel[] = [1, 2, 3, 4, 5];

describe('formalityScore - Same Level', () => {
  it('returns +2 for same formality level', () => {
    expect(formalityScore(1, 1)).toBe(2);
    expect(formalityScore(3, 3)).toBe(2);
    expect(formalityScore(5, 5)).toBe(2);
  });
});

describe('formalityScore - Gap Levels', () => {
  it('returns +1 for 1 level apart', () => {
    expect(formalityScore(1, 2)).toBe(1);
    expect(formalityScore(2, 1)).toBe(1);
    expect(formalityScore(4, 5)).toBe(1);
  });

  it('returns 0 for 2 levels apart', () => {
    expect(formalityScore(1, 3)).toBe(0);
    expect(formalityScore(3, 1)).toBe(0);
    expect(formalityScore(3, 5)).toBe(0);
  });

  it('returns -1 for 3 levels apart', () => {
    expect(formalityScore(1, 4)).toBe(-1);
    expect(formalityScore(4, 1)).toBe(-1);
    expect(formalityScore(2, 5)).toBe(-1);
  });

  it('returns -2 for 4 levels apart', () => {
    expect(formalityScore(1, 5)).toBe(-2);
    expect(formalityScore(5, 1)).toBe(-2);
  });
});

describe('formalityScore - Contract Tests', () => {
  it('always returns value within [-2, +2]', () => {
    for (const a of ALL_FORMALITY_LEVELS) {
      for (const b of ALL_FORMALITY_LEVELS) {
        const result = formalityScore(a, b);
        expect(result).toBeGreaterThanOrEqual(-2);
        expect(result).toBeLessThanOrEqual(2);
      }
    }
  });

  it('always returns an integer', () => {
    for (const a of ALL_FORMALITY_LEVELS) {
      for (const b of ALL_FORMALITY_LEVELS) {
        const result = formalityScore(a, b);
        expect(Number.isInteger(result)).toBe(true);
      }
    }
  });

  it('never returns NaN', () => {
    for (const a of ALL_FORMALITY_LEVELS) {
      for (const b of ALL_FORMALITY_LEVELS) {
        const result = formalityScore(a, b);
        expect(Number.isNaN(result)).toBe(false);
      }
    }
  });

  it('is symmetric (order does not matter)', () => {
    for (const a of ALL_FORMALITY_LEVELS) {
      for (const b of ALL_FORMALITY_LEVELS) {
        expect(formalityScore(a, b)).toBe(formalityScore(b, a));
      }
    }
  });
});

describe('formalityScore - F value to gap mapping', () => {
  // These tests document the canonical mapping used in gates
  it('F == 2 corresponds to 0-level gap', () => {
    expect(formalityScore(3, 3)).toBe(2);
  });

  it('F == 1 corresponds to 1-level gap', () => {
    expect(formalityScore(2, 3)).toBe(1);
  });

  it('F == 0 corresponds to 2-level gap (FORMALITY_TENSION trigger)', () => {
    expect(formalityScore(1, 3)).toBe(0);
  });

  it('F == -1 corresponds to 3-level gap', () => {
    expect(formalityScore(1, 4)).toBe(-1);
  });

  it('F == -2 corresponds to 4-level gap (FORMALITY_CLASH trigger)', () => {
    expect(formalityScore(1, 5)).toBe(-2);
  });
});
