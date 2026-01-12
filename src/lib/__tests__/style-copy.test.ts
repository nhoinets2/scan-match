/**
 * Style-Aware Copy Test Suite
 *
 * Tests for the deterministic, style-aware suggestion system.
 * Covers:
 * - resolveUiVibeForCopy (vibe resolution from styleTags/styleNotes)
 * - buildModeBBullets (deterministic Mode B generation)
 * - generateModeASuggestionsV2 (style-aware Mode A)
 * - generateModeBSuggestionsV2 (style-aware Mode B)
 * - Casual intent preservation
 */

// Define __DEV__ for test environment
// @ts-expect-error - __DEV__ is a React Native global
globalThis.__DEV__ = true;

import {
  resolveUiVibeForCopy,
  VIBE_PRIORITY,
  STYLE_FAMILY_TO_UI_VIBE,
  buildModeBBullets,
  generateModeASuggestionsV2,
  generateModeBSuggestionsV2,
  type CapReason,
  type Category,
} from '../confidence-engine';
import type { StyleVibe } from '../types';

// ============================================
// resolveUiVibeForCopy TESTS
// ============================================

describe('resolveUiVibeForCopy', () => {
  describe('VIBE_PRIORITY ordering', () => {
    it('should have correct priority order', () => {
      expect(VIBE_PRIORITY).toEqual([
        'office',
        'minimal',
        'street',
        'feminine',
        'sporty',
        'casual',
      ]);
    });

    it('office should win over all other vibes', () => {
      const result = resolveUiVibeForCopy({
        styleTags: ['casual', 'office', 'minimal', 'street'],
      });
      expect(result).toBe('office');
    });

    it('minimal should win over street, feminine, sporty, casual', () => {
      const result = resolveUiVibeForCopy({
        styleTags: ['casual', 'minimal', 'street'],
      });
      expect(result).toBe('minimal');
    });

    it('street should win over feminine, sporty, casual', () => {
      const result = resolveUiVibeForCopy({
        styleTags: ['casual', 'feminine', 'street'],
      });
      expect(result).toBe('street');
    });
  });

  describe('casual intent preservation', () => {
    it('should return casual when all tags are casual', () => {
      const result = resolveUiVibeForCopy({
        styleTags: ['casual', 'casual', 'casual'],
      });
      expect(result).toBe('casual');
    });

    it('should return casual for empty styleTags', () => {
      const result = resolveUiVibeForCopy({
        styleTags: [],
      });
      expect(result).toBe('casual');
    });

    it('should return casual for null styleTags', () => {
      const result = resolveUiVibeForCopy({
        styleTags: null,
      });
      expect(result).toBe('casual');
    });

    it('should return casual for undefined styleTags', () => {
      const result = resolveUiVibeForCopy({});
      expect(result).toBe('casual');
    });
  });

  describe('STYLE_FAMILY_TO_UI_VIBE mapping', () => {
    it('classic should map to casual (not office)', () => {
      expect(STYLE_FAMILY_TO_UI_VIBE.classic).toBe('casual');
    });

    it('formal should map to office', () => {
      expect(STYLE_FAMILY_TO_UI_VIBE.formal).toBe('office');
    });

    it('minimal should map to minimal', () => {
      expect(STYLE_FAMILY_TO_UI_VIBE.minimal).toBe('minimal');
    });

    it('romantic should map to feminine', () => {
      expect(STYLE_FAMILY_TO_UI_VIBE.romantic).toBe('feminine');
    });

    it('street should map to street', () => {
      expect(STYLE_FAMILY_TO_UI_VIBE.street).toBe('street');
    });

    it('athleisure should map to sporty', () => {
      expect(STYLE_FAMILY_TO_UI_VIBE.athleisure).toBe('sporty');
    });

    it('unknown should map to casual', () => {
      expect(STYLE_FAMILY_TO_UI_VIBE.unknown).toBe('casual');
    });
  });

  describe('explicitStyleFamily override', () => {
    it('should use explicitStyleFamily when provided', () => {
      const result = resolveUiVibeForCopy({
        styleTags: ['casual'],
        explicitStyleFamily: 'formal',
      });
      expect(result).toBe('office');
    });

    it('should use explicitStyleFamily even with other tags', () => {
      const result = resolveUiVibeForCopy({
        styleTags: ['street', 'minimal'],
        explicitStyleFamily: 'romantic',
      });
      expect(result).toBe('feminine');
    });
  });
});

// ============================================
// buildModeBBullets TESTS
// ============================================

describe('buildModeBBullets', () => {
  describe('deterministic output', () => {
    it('should produce identical output for same inputs', () => {
      const reasons: CapReason[] = ['FORMALITY_TENSION', 'STYLE_TENSION'];
      const vibe: StyleVibe = 'casual';

      const result1 = buildModeBBullets(reasons, vibe);
      const result2 = buildModeBBullets(reasons, vibe);

      expect(result1.bullets).toEqual(result2.bullets);
      expect(result1.reasonsUsed).toEqual(result2.reasonsUsed);
    });

    it('should be deterministic across 100 calls', () => {
      const reasons: CapReason[] = ['COLOR_TENSION', 'USAGE_MISMATCH'];
      const vibe: StyleVibe = 'minimal';

      const results = Array.from({ length: 100 }, () =>
        buildModeBBullets(reasons, vibe)
      );

      const firstResult = results[0];
      for (const result of results) {
        expect(result.bullets).toEqual(firstResult.bullets);
        expect(result.reasonsUsed).toEqual(firstResult.reasonsUsed);
      }
    });
  });

  describe('TEXTURE_CLASH exclusion', () => {
    it('should exclude TEXTURE_CLASH from output', () => {
      const reasons: CapReason[] = ['TEXTURE_CLASH', 'FORMALITY_TENSION'];
      const result = buildModeBBullets(reasons, 'casual');

      expect(result.reasonsUsed).not.toContain('TEXTURE_CLASH');
    });

    it('should still produce bullets when TEXTURE_CLASH is only reason', () => {
      const reasons: CapReason[] = ['TEXTURE_CLASH'];
      const result = buildModeBBullets(reasons, 'casual');

      // Should have fallback bullet
      expect(result.bullets.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('reasons_used accuracy', () => {
    it('should only include reasons that contributed bullets', () => {
      const reasons: CapReason[] = ['FORMALITY_TENSION', 'STYLE_TENSION'];
      const result = buildModeBBullets(reasons, 'casual');

      // Each reason in reasonsUsed should have contributed a bullet
      expect(result.reasonsUsed.length).toBeLessThanOrEqual(result.bullets.length);
    });

    it('should not include TEXTURE_CLASH even if passed', () => {
      const reasons: CapReason[] = ['TEXTURE_CLASH', 'FORMALITY_TENSION'];
      const result = buildModeBBullets(reasons, 'casual');

      expect(result.reasonsUsed).not.toContain('TEXTURE_CLASH');
      expect(result.reasonsUsed).toContain('FORMALITY_TENSION');
    });
  });

  describe('style-aware text resolution', () => {
    it('should use office text for office vibe when available', () => {
      const reasons: CapReason[] = ['FORMALITY_TENSION'];
      const result = buildModeBBullets(reasons, 'office');

      // Office has specific override for FORMALITY_TENSION
      expect(result.bullets[0].text).toContain('polished');
    });

    it('should use default text when no style override exists', () => {
      const reasons: CapReason[] = ['FORMALITY_TENSION'];
      const casualResult = buildModeBBullets(reasons, 'casual');
      const feminineResult = buildModeBBullets(reasons, 'feminine');

      // Feminine doesn't have FORMALITY_TENSION override, should use default
      // Both should have same default text since feminine has no override
      expect(feminineResult.bullets[0].text).toContain('dressiness');
    });

    it('should use street text for street vibe when available', () => {
      const reasons: CapReason[] = ['FORMALITY_TENSION'];
      const result = buildModeBBullets(reasons, 'street');

      expect(result.bullets[0].text).toContain('relaxed');
    });
  });

  describe('priority ordering', () => {
    it('should respect REASON_PRIORITY for bullet ordering', () => {
      // FORMALITY_TENSION has higher priority than USAGE_MISMATCH
      const reasons: CapReason[] = ['USAGE_MISMATCH', 'FORMALITY_TENSION'];
      const result = buildModeBBullets(reasons, 'casual');

      // FORMALITY_TENSION should come first due to higher priority
      expect(result.reasonsUsed[0]).toBe('FORMALITY_TENSION');
    });
  });

  describe('fallback behavior', () => {
    it('should add generic fallback when no valid reasons', () => {
      const reasons: CapReason[] = [];
      const result = buildModeBBullets(reasons, 'casual');

      expect(result.bullets.length).toBeGreaterThanOrEqual(1);
      expect(result.bullets[0].text).toContain('simple');
    });
  });
});

// ============================================
// generateModeASuggestionsV2 TESTS
// ============================================

describe('generateModeASuggestionsV2', () => {
  describe('category templates', () => {
    it('should return suggestions for tops category', () => {
      const result = generateModeASuggestionsV2('tops', 'casual');

      expect(result.intro).toBeTruthy();
      expect(result.bullets.length).toBeGreaterThan(0);
    });

    it('should return suggestions for bottoms category', () => {
      const result = generateModeASuggestionsV2('bottoms', 'casual');

      expect(result.intro).toBeTruthy();
      expect(result.bullets.length).toBeGreaterThan(0);
    });

    it('should return default suggestions for unknown category', () => {
      const result = generateModeASuggestionsV2('unknown' as Category, 'casual');

      expect(result.intro).toBeTruthy();
      expect(result.bullets.length).toBeGreaterThan(0);
    });
  });

  describe('style-aware text resolution', () => {
    it('should use office text for tops with office vibe', () => {
      const result = generateModeASuggestionsV2('tops', 'office');

      // Office has specific text for tops bullets
      const hasOfficeText = result.bullets.some(
        (b) => b.text.toLowerCase().includes('tailored') || b.text.toLowerCase().includes('polished')
      );
      expect(hasOfficeText).toBe(true);
    });

    it('should use minimal text for minimal vibe', () => {
      const result = generateModeASuggestionsV2('tops', 'minimal');

      const hasMinimalText = result.bullets.some(
        (b) => b.text.toLowerCase().includes('clean') || b.text.toLowerCase().includes('tonal')
      );
      expect(hasMinimalText).toBe(true);
    });

    it('should use street text for street vibe', () => {
      const result = generateModeASuggestionsV2('tops', 'street');

      const hasStreetText = result.bullets.some(
        (b) => b.text.toLowerCase().includes('relaxed') || b.text.toLowerCase().includes('cargo')
      );
      expect(hasStreetText).toBe(true);
    });

    it('should use default text for casual vibe (no override)', () => {
      const result = generateModeASuggestionsV2('tops', 'casual');

      // Casual uses default text
      expect(result.bullets.length).toBeGreaterThan(0);
    });
  });

  describe('bullet structure', () => {
    it('should include target category in bullets', () => {
      const result = generateModeASuggestionsV2('tops', 'casual');

      // At least one bullet should have a target
      const hasTarget = result.bullets.some((b) => b.target !== null);
      expect(hasTarget).toBe(true);
    });

    it('should preserve target categories across vibes', () => {
      const casualResult = generateModeASuggestionsV2('tops', 'casual');
      const officeResult = generateModeASuggestionsV2('tops', 'office');

      // Same number of bullets, same targets
      expect(casualResult.bullets.length).toBe(officeResult.bullets.length);

      for (let i = 0; i < casualResult.bullets.length; i++) {
        expect(casualResult.bullets[i].target).toBe(officeResult.bullets[i].target);
      }
    });
  });
});

// ============================================
// generateModeBSuggestionsV2 TESTS
// ============================================

describe('generateModeBSuggestionsV2', () => {
  it('should return ModeBSuggestion with bullets and reasons_used', () => {
    const reasons: CapReason[] = ['FORMALITY_TENSION'];
    const result = generateModeBSuggestionsV2(reasons, 'casual');

    expect(result.bullets).toBeDefined();
    expect(result.reasons_used).toBeDefined();
    expect(Array.isArray(result.bullets)).toBe(true);
    expect(Array.isArray(result.reasons_used)).toBe(true);
  });

  it('should be deterministic', () => {
    const reasons: CapReason[] = ['STYLE_TENSION', 'COLOR_TENSION'];

    const result1 = generateModeBSuggestionsV2(reasons, 'minimal');
    const result2 = generateModeBSuggestionsV2(reasons, 'minimal');

    expect(result1).toEqual(result2);
  });

  it('should respect vibe for text selection', () => {
    const reasons: CapReason[] = ['SHOES_CONFIDENCE_DAMPEN'];

    const minimalResult = generateModeBSuggestionsV2(reasons, 'minimal');
    const streetResult = generateModeBSuggestionsV2(reasons, 'street');

    // Different vibes should produce different text
    expect(minimalResult.bullets[0]).not.toBe(streetResult.bullets[0]);
  });
});

// ============================================
// INTEGRATION TESTS
// ============================================

describe('Style-Aware Suggestions Integration', () => {
  describe('casual intent round-trip', () => {
    it('should not convert casual to office through classic mapping', () => {
      // If a user has all casual tags, they should get casual copy
      // not office copy (which would happen if casual → classic → office)
      const vibe = resolveUiVibeForCopy({
        styleTags: ['casual', 'casual'],
      });

      expect(vibe).toBe('casual');

      // And Mode A suggestions should use casual defaults (not office overrides)
      const suggestions = generateModeASuggestionsV2('tops', vibe);

      // Should NOT contain office-specific language
      const hasOfficeLanguage = suggestions.bullets.some(
        (b) => b.text.toLowerCase().includes('tailored trousers') || b.text.toLowerCase().includes('loafers')
      );
      expect(hasOfficeLanguage).toBe(false);
    });
  });

  describe('consistency across suggestion types', () => {
    it('should use same vibe for Mode A and Mode B', () => {
      const styleTags: StyleVibe[] = ['minimal', 'casual'];
      const vibe = resolveUiVibeForCopy({ styleTags });

      expect(vibe).toBe('minimal');

      const modeA = generateModeASuggestionsV2('tops', vibe);
      const modeB = generateModeBSuggestionsV2(['STYLE_TENSION'], vibe);

      // Both should have minimal-specific text
      const modeAHasMinimal = modeA.bullets.some(
        (b) => b.text.toLowerCase().includes('clean') || b.text.toLowerCase().includes('tonal')
      );
      const modeBHasMinimal = modeB.bullets.some(
        (b) => b.text.toLowerCase().includes('understated') || b.text.toLowerCase().includes('quiet')
      );

      expect(modeAHasMinimal).toBe(true);
      expect(modeBHasMinimal).toBe(true);
    });
  });
});
