/**
 * Gates Test Suite
 *
 * Tests for hard fails and soft caps.
 * Each gate has tests for:
 * - triggers when exact condition met
 * - does NOT trigger when one condition is relaxed
 * - does NOT trigger when unrelated signal is negative
 */

import { evaluateGates, checkHardFails, computeCapReasons } from '../gates';
import type {
  FeatureSignals,
  FeatureResult,
  ConfidenceItem,
  PairType,
  ColorProfile,
} from '../types';

// ============================================
// TYPE-SAFE HELPERS
// ============================================

/**
 * FeatureValue type enforces integer-only values per spec.
 * This prevents accidental floats in test data.
 */
type FeatureValue = -2 | -1 | 0 | 1 | 2;

/**
 * Helper to create a FeatureResult with type-safe value.
 * Ensures value is a valid FeatureValue integer.
 */
function fr(value: FeatureValue, known: boolean = true): FeatureResult {
  return { value, known };
}

/**
 * Helper to create a base signals object with proper typing.
 * Uses Partial<FeatureSignals> for correct type alignment.
 */
function createSignals(overrides: Partial<FeatureSignals> = {}): FeatureSignals {
  const base: FeatureSignals = {
    C: fr(0),
    S: fr(0),
    F: fr(0),
    T: fr(0),
    U: fr(0),
  };
  return { ...base, ...overrides };
}

/**
 * Helper to create a complete ColorProfile matching the exact interface.
 * Matches: { is_neutral, dominant_hue?, saturation, value }
 */
function createColorProfile(isNeutral: boolean = true): ColorProfile {
  if (isNeutral) {
    return {
      is_neutral: true,
      saturation: 'low',
      value: 'med',
    };
  }
  return {
    is_neutral: false,
    dominant_hue: 180,
    saturation: 'med',
    value: 'med',
  };
}

/**
 * Helper to create a base item with all required fields.
 * Ensures complete ConfidenceItem interface compliance.
 */
function createItem(overrides: Partial<ConfidenceItem> = {}): ConfidenceItem {
  return {
    id: 'test-item',
    category: 'tops',
    color_profile: createColorProfile(true),
    style_family: 'minimal',
    formality_level: 3,
    texture_type: 'smooth',
    ...overrides,
  };
}

// ============================================
// HARD FAIL TESTS
// ============================================

describe('Hard Fails', () => {
  describe('FORMALITY_CLASH_WITH_USAGE', () => {
    const itemA = createItem({ formality_level: 1 });
    const itemB = createItem({ formality_level: 5 });
    const pairType: PairType = 'tops_bottoms';

    it('triggers when F == -2 AND U <= -1', () => {
      const signals = createSignals({
        F: fr(-2),
        U: fr(-1),
      });

      const result = checkHardFails(signals, itemA, itemB, pairType);
      expect(result.failed).toBe(true);
      expect(result.reason).toBe('FORMALITY_CLASH_WITH_USAGE');
    });

    it('triggers when F == -2 AND U == -2', () => {
      const signals = createSignals({
        F: fr(-2),
        U: fr(-2),
      });

      const result = checkHardFails(signals, itemA, itemB, pairType);
      expect(result.failed).toBe(true);
      expect(result.reason).toBe('FORMALITY_CLASH_WITH_USAGE');
    });

    it('does NOT trigger when F == -2 but U == 0', () => {
      const signals = createSignals({
        F: fr(-2),
        U: fr(0),
      });

      const result = checkHardFails(signals, itemA, itemB, pairType);
      expect(result.failed).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('does NOT trigger when F == -1 and U == -1 (tension, not clash)', () => {
      const signals = createSignals({
        F: fr(-1),
        U: fr(-1),
      });

      const result = checkHardFails(signals, itemA, itemB, pairType);
      expect(result.failed).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('does NOT trigger when F == -2 but U == 0, even if other signals are negative', () => {
      // Core spec assertion: hard fail requires the right conjunction, not "anything negative"
      const signals = createSignals({
        F: fr(-2),
        U: fr(0),
        S: fr(-2),
        C: fr(-2),
        T: fr(-2),
      });

      const result = checkHardFails(signals, itemA, itemB, pairType);
      expect(result.failed).toBe(false);
      expect(result.reason).toBeNull();
    });
  });

  describe('STYLE_OPPOSITION_NO_OVERLAP', () => {
    const itemA = createItem({ style_family: 'formal' });
    const itemB = createItem({ style_family: 'athleisure' });
    const pairType: PairType = 'tops_bottoms';

    it('triggers when S == -2 AND U <= -1', () => {
      const signals = createSignals({
        S: fr(-2),
        U: fr(-1),
      });

      const result = checkHardFails(signals, itemA, itemB, pairType);
      expect(result.failed).toBe(true);
      expect(result.reason).toBe('STYLE_OPPOSITION_NO_OVERLAP');
    });

    it('does NOT trigger when S == -2 but U == 0', () => {
      const signals = createSignals({
        S: fr(-2),
        U: fr(0),
      });

      const result = checkHardFails(signals, itemA, itemB, pairType);
      expect(result.failed).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('does NOT trigger when S == -1 and U == -1', () => {
      const signals = createSignals({
        S: fr(-1),
        U: fr(-1),
      });

      const result = checkHardFails(signals, itemA, itemB, pairType);
      expect(result.failed).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('does NOT trigger when S is unknown', () => {
      const signals = createSignals({
        S: fr(-2, false), // unknown
        U: fr(-2),
      });

      const result = checkHardFails(signals, itemA, itemB, pairType);
      expect(result.failed).toBe(false);
      expect(result.reason).toBeNull();
    });
  });

  describe('SHOES_TEXTURE_FORMALITY_CLASH', () => {
    const itemA = createItem({ category: 'shoes' });
    const itemB = createItem({ category: 'tops' });
    const pairType: PairType = 'tops_shoes';

    it('triggers when isShoes AND T == -2 AND F <= -1', () => {
      const signals = createSignals({
        T: fr(-2),
        F: fr(-1),
      });

      const result = checkHardFails(signals, itemA, itemB, pairType);
      expect(result.failed).toBe(true);
      expect(result.reason).toBe('SHOES_TEXTURE_FORMALITY_CLASH');
    });

    it('triggers when isShoes AND T == -2 AND F == -2', () => {
      const signals = createSignals({
        T: fr(-2),
        F: fr(-2),
      });

      const result = checkHardFails(signals, itemA, itemB, pairType);
      expect(result.failed).toBe(true);
      expect(result.reason).toBe('SHOES_TEXTURE_FORMALITY_CLASH');
    });

    it('does NOT trigger when T == -2 but F == 0', () => {
      const signals = createSignals({
        T: fr(-2),
        F: fr(0),
      });

      const result = checkHardFails(signals, itemA, itemB, pairType);
      expect(result.failed).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('does NOT trigger when T == -1 and F == -1', () => {
      const signals = createSignals({
        T: fr(-1),
        F: fr(-1),
      });

      const result = checkHardFails(signals, itemA, itemB, pairType);
      expect(result.failed).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('does NOT trigger when no shoes involved', () => {
      const noShoesItemA = createItem({ category: 'tops' });
      const noShoesItemB = createItem({ category: 'bottoms' });

      const signals = createSignals({
        T: fr(-2),
        F: fr(-2),
      });

      const result = checkHardFails(signals, noShoesItemA, noShoesItemB, 'tops_bottoms');
      expect(result.failed).toBe(false);
      expect(result.reason).toBeNull();
    });
  });
});

// ============================================
// SOFT CAP TESTS
// ============================================

describe('Soft Caps', () => {
  const itemA = createItem();
  const itemB = createItem();
  const pairType: PairType = 'tops_bottoms';

  describe('FORMALITY_TENSION', () => {
    it('triggers when F == 0', () => {
      const signals = createSignals({
        F: fr(0),
      });

      const result = computeCapReasons(signals, itemA, itemB, pairType);
      expect(result).toContain('FORMALITY_TENSION');
    });

    it('does NOT trigger when F == 1', () => {
      const signals = createSignals({
        F: fr(1),
      });

      const result = computeCapReasons(signals, itemA, itemB, pairType);
      expect(result).not.toContain('FORMALITY_TENSION');
    });

    it('triggers when F == -1 (hard tension)', () => {
      // F == -1 represents a 3-level formality gap (hard tension)
      // In the new penalty-based system, this still produces FORMALITY_TENSION
      // as a cap reason (for UI copy), but it applies a penalty instead of hard cap
      const signals = createSignals({
        F: fr(-1),
      });

      const result = computeCapReasons(signals, itemA, itemB, pairType);
      expect(result).toContain('FORMALITY_TENSION');
    });
  });

  describe('STYLE_TENSION', () => {
    // Note: STYLE_TENSION only triggers at S <= -2 (true style opposites).
    // Tension-level pairs (S === -1) no longer cap — only true opposites do.

    it('does NOT trigger when S == -1 (tension-level pairs no longer cap)', () => {
      const signals = createSignals({
        S: fr(-1),
        F: fr(1), // Avoid triggering FORMALITY_TENSION from default F=0
      });

      const result = computeCapReasons(signals, itemA, itemB, pairType);
      expect(result).not.toContain('STYLE_TENSION');
    });

    it('triggers when S == -2', () => {
      const signals = createSignals({
        S: fr(-2),
        F: fr(1), // Avoid triggering FORMALITY_TENSION from default F=0
      });

      const result = computeCapReasons(signals, itemA, itemB, pairType);
      expect(result).toContain('STYLE_TENSION');
    });

    it('does NOT trigger when S == 0', () => {
      const signals = createSignals({
        S: fr(0),
        F: fr(1), // Avoid triggering FORMALITY_TENSION from default F=0
      });

      const result = computeCapReasons(signals, itemA, itemB, pairType);
      expect(result).not.toContain('STYLE_TENSION');
    });
  });

  describe('COLOR_TENSION', () => {
    it('triggers when C == -1', () => {
      const signals = createSignals({
        C: fr(-1),
      });

      const result = computeCapReasons(signals, itemA, itemB, pairType);
      expect(result).toContain('COLOR_TENSION');
    });

    it('triggers when C == -2', () => {
      const signals = createSignals({
        C: fr(-2),
      });

      const result = computeCapReasons(signals, itemA, itemB, pairType);
      expect(result).toContain('COLOR_TENSION');
    });

    it('does NOT trigger when C == 0', () => {
      const signals = createSignals({
        C: fr(0),
      });

      const result = computeCapReasons(signals, itemA, itemB, pairType);
      expect(result).not.toContain('COLOR_TENSION');
    });
  });

  describe('TEXTURE_CLASH', () => {
    it('triggers when T == -2', () => {
      const signals = createSignals({
        T: fr(-2),
      });

      const result = computeCapReasons(signals, itemA, itemB, pairType);
      expect(result).toContain('TEXTURE_CLASH');
    });

    it('does NOT trigger when T == -1', () => {
      const signals = createSignals({
        T: fr(-1),
      });

      const result = computeCapReasons(signals, itemA, itemB, pairType);
      expect(result).not.toContain('TEXTURE_CLASH');
    });
  });

  describe('USAGE_MISMATCH', () => {
    it('triggers when U == -2', () => {
      const signals = createSignals({
        U: fr(-2),
      });

      const result = computeCapReasons(signals, itemA, itemB, pairType);
      expect(result).toContain('USAGE_MISMATCH');
    });

    it('does NOT trigger when U == -1', () => {
      const signals = createSignals({
        U: fr(-1),
      });

      const result = computeCapReasons(signals, itemA, itemB, pairType);
      expect(result).not.toContain('USAGE_MISMATCH');
    });
  });

  describe('SHOES_CONFIDENCE_DAMPEN', () => {
    const shoesItemA = createItem({ category: 'shoes' });
    const shoesItemB = createItem({ category: 'tops' });

    it('triggers when isShoes AND F <= -1', () => {
      const signals = createSignals({
        F: fr(-1),
      });

      const result = computeCapReasons(signals, shoesItemA, shoesItemB, 'tops_shoes');
      expect(result).toContain('SHOES_CONFIDENCE_DAMPEN');
    });

    it('triggers when isShoes AND S <= -1', () => {
      const signals = createSignals({
        S: fr(-1),
      });

      const result = computeCapReasons(signals, shoesItemA, shoesItemB, 'tops_shoes');
      expect(result).toContain('SHOES_CONFIDENCE_DAMPEN');
    });

    it('does NOT trigger when isShoes but F == 0 and S == 0', () => {
      const signals = createSignals({
        F: fr(0),
        S: fr(0),
      });

      const result = computeCapReasons(signals, shoesItemA, shoesItemB, 'tops_shoes');
      expect(result).not.toContain('SHOES_CONFIDENCE_DAMPEN');
    });

    it('does NOT trigger when no shoes even with F == -1', () => {
      const signals = createSignals({
        F: fr(-1),
      });

      const result = computeCapReasons(signals, itemA, itemB, pairType);
      expect(result).not.toContain('SHOES_CONFIDENCE_DAMPEN');
    });
  });

  describe('MISSING_KEY_SIGNAL', () => {
    it('triggers when both S and T are unknown', () => {
      const signals = createSignals({
        S: fr(0, false), // unknown
        T: fr(0, false), // unknown
      });

      const result = computeCapReasons(signals, itemA, itemB, pairType);
      expect(result).toContain('MISSING_KEY_SIGNAL');
    });

    it('does NOT trigger when only S is unknown', () => {
      const signals = createSignals({
        S: fr(0, false), // unknown
        T: fr(0, true),  // known
      });

      const result = computeCapReasons(signals, itemA, itemB, pairType);
      expect(result).not.toContain('MISSING_KEY_SIGNAL');
    });

    it('does NOT trigger when only T is unknown', () => {
      const signals = createSignals({
        S: fr(0, true),  // known
        T: fr(0, false), // unknown
      });

      const result = computeCapReasons(signals, itemA, itemB, pairType);
      expect(result).not.toContain('MISSING_KEY_SIGNAL');
    });
  });

  describe('pairType independence for non-shoes caps', () => {
    it('same signals produce same caps regardless of pairType (non-shoes)', () => {
      const signals = createSignals({
        F: fr(0),
        S: fr(-1),
        C: fr(-1),
      });

      const result1 = computeCapReasons(signals, itemA, itemB, 'tops_bottoms');
      const result2 = computeCapReasons(signals, itemA, itemB, 'tops_outerwear');

      // Same caps regardless of pairType when no shoes involved
      // Use spread to avoid mutating original arrays
      expect([...result1].sort()).toEqual([...result2].sort());
    });
  });
});

// ============================================
// INTEGRATION TESTS
// ============================================

describe('evaluateGates integration', () => {
  const itemA = createItem();
  const itemB = createItem();
  const pairType: PairType = 'tops_bottoms';

  it('returns forced_tier LOW for hard fails with empty cap_reasons', () => {
    const signals = createSignals({
      F: fr(-2),
      U: fr(-1),
    });

    const result = evaluateGates(signals, itemA, itemB, pairType);
    expect(result.forced_tier).toBe('LOW');
    expect(result.hard_fail_reason).toBe('FORMALITY_CLASH_WITH_USAGE');
    // Hard fail means cap_reasons should be empty (short-circuit state)
    expect(result.cap_reasons).toHaveLength(0);
  });

  it('returns max_tier MEDIUM with cap_reasons for soft caps', () => {
    // Use S == -2 to trigger STYLE_TENSION (S == -1 no longer caps)
    // Set F to positive to avoid unintended FORMALITY_TENSION from default F=0
    const signals = createSignals({
      S: fr(-2),
      F: fr(1),
    });

    const result = evaluateGates(signals, itemA, itemB, pairType);
    expect(result.forced_tier).toBeNull();
    expect(result.max_tier).toBe('MEDIUM');
    expect(result.cap_reasons).toContain('STYLE_TENSION');
  });

  it('returns max_tier HIGH with no caps when all signals positive', () => {
    const signals = createSignals({
      C: fr(2),
      S: fr(2),
      F: fr(2),
      T: fr(2),
      U: fr(2),
    });

    const result = evaluateGates(signals, itemA, itemB, pairType);
    expect(result.forced_tier).toBeNull();
    expect(result.max_tier).toBe('HIGH');
    expect(result.cap_reasons).toHaveLength(0);
  });

  it('cap_reasons have no duplicates', () => {
    const signals = createSignals({
      S: fr(-2),
      C: fr(-2),
      F: fr(0),
    });

    const result = evaluateGates(signals, itemA, itemB, pairType);
    expect(new Set(result.cap_reasons).size).toBe(result.cap_reasons.length);
  });

  it('hard fail short-circuits even if soft caps would apply', () => {
    // This is a critical combo case: S=-2 + U=-1 triggers STYLE_OPPOSITION_NO_OVERLAP hard fail
    // But S=-2, C=-2, and F=0 would all trigger soft caps if we got that far
    // The hard fail MUST short-circuit and leave cap_reasons empty
    const signals = createSignals({
      S: fr(-2),       // Would trigger STYLE_TENSION cap
      U: fr(-1),       // Combined with S=-2, triggers STYLE_OPPOSITION_NO_OVERLAP hard fail
      C: fr(-2),       // Would trigger COLOR_TENSION cap
      F: fr(0),        // Would trigger FORMALITY_TENSION cap
    });

    const result = evaluateGates(signals, itemA, itemB, pairType);
    expect(result.forced_tier).toBe('LOW');
    expect(result.hard_fail_reason).toBe('STYLE_OPPOSITION_NO_OVERLAP');
    expect(result.cap_reasons).toHaveLength(0);
  });

  it('hard fail order: FORMALITY_CLASH_WITH_USAGE is checked first', () => {
    // Both FORMALITY_CLASH_WITH_USAGE and STYLE_OPPOSITION_NO_OVERLAP conditions are met
    // But FORMALITY_CLASH_WITH_USAGE should trigger first due to check order
    const signals = createSignals({
      F: fr(-2),
      U: fr(-1),
      S: fr(-2),
    });

    const result = evaluateGates(signals, itemA, itemB, pairType);
    expect(result.forced_tier).toBe('LOW');
    expect(result.hard_fail_reason).toBe('FORMALITY_CLASH_WITH_USAGE');
    expect(result.cap_reasons).toHaveLength(0);
  });
});

// ============================================
// FORMALITY TENSION SEVERITY (NEW)
// ============================================

describe('Formality Tension', () => {
  const itemA = createItem();
  const itemB = createItem();
  const pairType: PairType = 'tops_bottoms';

  describe('FORMALITY_TENSION caps to MEDIUM', () => {
    it('max_tier is MEDIUM when F == 0 (2-level gap)', () => {
      const signals = createSignals({
        F: fr(0),
        S: fr(2),  // Good style to avoid other caps
        C: fr(2),  // Good color to avoid other caps
      });

      const result = evaluateGates(signals, itemA, itemB, pairType);
      expect(result.cap_reasons).toContain('FORMALITY_TENSION');
      expect(result.max_tier).toBe('MEDIUM');
    });

    it('max_tier is MEDIUM when F == -1 (3-level gap)', () => {
      const signals = createSignals({
        F: fr(-1),
        S: fr(2),
        C: fr(2),
      });

      const result = evaluateGates(signals, itemA, itemB, pairType);
      expect(result.cap_reasons).toContain('FORMALITY_TENSION');
      expect(result.max_tier).toBe('MEDIUM');
    });

    it('no FORMALITY_TENSION when F > 0 (good alignment)', () => {
      const signals = createSignals({
        F: fr(1),
        S: fr(2),
        C: fr(2),
      });

      const result = evaluateGates(signals, itemA, itemB, pairType);
      expect(result.cap_reasons).not.toContain('FORMALITY_TENSION');
      expect(result.max_tier).toBe('HIGH');
    });

    it('no FORMALITY_TENSION when F == 2 (perfect alignment)', () => {
      const signals = createSignals({
        F: fr(2),
        S: fr(2),
        C: fr(2),
      });

      const result = evaluateGates(signals, itemA, itemB, pairType);
      expect(result.cap_reasons).not.toContain('FORMALITY_TENSION');
      expect(result.max_tier).toBe('HIGH');
    });
  });
});
