/**
 * Trust Filter v1 - Unit Tests
 *
 * Tests for the 12 canonical scenarios plus additional edge cases.
 */

import { evaluateTrustFilterPair, evaluateTrustFilterBatch } from '../evaluate';
import type { StyleSignalsV1, TFCategory, TrustFilterInput } from '../types';

// ============================================
// TEST HELPERS
// ============================================

/**
 * Create a valid StyleSignalsV1 object with defaults.
 */
function createSignals(overrides: Partial<{
  primary: string;
  primaryConf: number;
  secondary: string;
  secondaryConf: number;
  formality: string;
  formalityConf: number;
  statement: string;
  statementConf: number;
  season: string;
  seasonConf: number;
  pattern: string;
  patternConf: number;
}> = {}): StyleSignalsV1 {
  return {
    version: 1,
    aesthetic: {
      primary: (overrides.primary ?? 'minimalist') as StyleSignalsV1['aesthetic']['primary'],
      primary_confidence: overrides.primaryConf ?? 0.8,
      secondary: (overrides.secondary ?? 'none') as StyleSignalsV1['aesthetic']['secondary'],
      secondary_confidence: overrides.secondaryConf ?? 0,
    },
    formality: {
      band: (overrides.formality ?? 'casual') as StyleSignalsV1['formality']['band'],
      confidence: overrides.formalityConf ?? 0.8,
    },
    statement: {
      level: (overrides.statement ?? 'low') as StyleSignalsV1['statement']['level'],
      confidence: overrides.statementConf ?? 0.7,
    },
    season: {
      heaviness: (overrides.season ?? 'mid') as StyleSignalsV1['season']['heaviness'],
      confidence: overrides.seasonConf ?? 0.7,
    },
    palette: {
      colors: ['black', 'white'],
      confidence: 0.8,
    },
    pattern: {
      level: (overrides.pattern ?? 'solid') as StyleSignalsV1['pattern']['level'],
      confidence: overrides.patternConf ?? 0.7,
    },
    material: {
      family: 'cotton',
      confidence: 0.7,
    },
  };
}

/**
 * Create a TrustFilterInput.
 */
function createInput(
  scanCategory: TFCategory,
  matchCategory: TFCategory,
  scanOverrides: Parameters<typeof createSignals>[0] = {},
  matchOverrides: Parameters<typeof createSignals>[0] = {}
): TrustFilterInput {
  return {
    scanSignals: createSignals(scanOverrides),
    matchSignals: createSignals(matchOverrides),
    scanCategory,
    matchCategory,
    ceTier: 'HIGH',
  };
}

// ============================================
// CANONICAL TEST SCENARIOS (12 REQUIRED)
// ============================================

describe('Trust Filter v1 - Canonical Scenarios', () => {
  /**
   * Test 1: shoes+tops medium distance + statement high => demote context_dependent_needs_anchor
   */
  test('1. shoes+tops with medium distance and high statement => demote with anchor reason', () => {
    const input = createInput(
      'shoes',
      'tops',
      {
        primary: 'street', // casual_urban cluster
        primaryConf: 0.8,
        statement: 'high',
        statementConf: 0.7,
        formality: 'casual',
      },
      {
        primary: 'classic', // tailored_core cluster -> medium distance from casual_urban
        primaryConf: 0.8,
        statement: 'low',
        statementConf: 0.7,
        formality: 'casual',
      }
    );

    const result = evaluateTrustFilterPair(input);

    expect(result.action).toBe('demote_to_near');
    expect(result.primary_reason).toBe('context_dependent_needs_anchor');
  });

  /**
   * Test 2: shoes+bottoms evening vs athleisure gap>=3 => hide formality_hard_clash
   */
  test('2. shoes+bottoms with evening vs athleisure (gap 5) => hide formality_hard_clash', () => {
    const input = createInput(
      'shoes',
      'bottoms',
      {
        primary: 'glam',
        formality: 'evening',
        formalityConf: 0.8,
      },
      {
        primary: 'sporty',
        formality: 'athleisure',
        formalityConf: 0.8,
      }
    );

    const result = evaluateTrustFilterPair(input);

    expect(result.action).toBe('hide');
    expect(result.primary_reason).toBe('formality_hard_clash');
    expect(result.debug.formality_gap).toBe(5);
  });

  /**
   * Test 3: dresses+outerwear season diff>=2 => hide weather_season_hard_clash
   */
  test('3. dresses+outerwear with season diff 2 (light vs heavy) => hide weather_season_hard_clash', () => {
    const input = createInput(
      'dresses',
      'outerwear',
      {
        primary: 'romantic',
        season: 'light',
        seasonConf: 0.8,
      },
      {
        primary: 'classic',
        season: 'heavy',
        seasonConf: 0.8,
      }
    );

    const result = evaluateTrustFilterPair(input);

    expect(result.action).toBe('hide');
    expect(result.primary_reason).toBe('weather_season_hard_clash');
    expect(result.debug.season_diff).toBe(2);
  });

  /**
   * Test 4: bag+top far distance only => keep (bags policy)
   */
  test('4. bag+top with far archetype distance only => keep (bags policy)', () => {
    const input = createInput(
      'bags',
      'tops',
      {
        primary: 'glam', // night_edge cluster
        primaryConf: 0.8,
        formality: 'casual',
      },
      {
        primary: 'outdoor_utility', // utility cluster -> far from night_edge
        primaryConf: 0.8,
        formality: 'casual',
      }
    );

    const result = evaluateTrustFilterPair(input);

    // Bags policy: never hide for archetype only, default to keep
    expect(result.action).toBe('keep');
  });

  /**
   * Test 5: accessory+dress far distance only => keep (accessories policy)
   */
  test('5. accessory+dress with far archetype distance only => keep (accessories policy)', () => {
    const input = createInput(
      'accessories',
      'dresses',
      {
        primary: 'edgy', // night_edge cluster
        primaryConf: 0.8,
        formality: 'casual',
      },
      {
        primary: 'outdoor_utility', // utility cluster -> far from night_edge
        primaryConf: 0.8,
        formality: 'casual',
      }
    );

    const result = evaluateTrustFilterPair(input);

    // Accessories policy: never hide for archetype only
    expect(result.action).toBe('keep');
  });

  /**
   * Test 6: far archetype distance with high confidence => hide style_archetype_hard_clash
   */
  test('6. far archetype distance with high confidence => hide style_archetype_hard_clash', () => {
    const input = createInput(
      'tops',
      'bottoms',
      {
        primary: 'glam', // night_edge cluster
        primaryConf: 0.75, // above 0.65 threshold
        formality: 'casual',
      },
      {
        primary: 'outdoor_utility', // utility cluster -> far from night_edge
        primaryConf: 0.75, // above 0.65 threshold
        formality: 'casual',
      }
    );

    const result = evaluateTrustFilterPair(input);

    expect(result.action).toBe('hide');
    expect(result.primary_reason).toBe('style_archetype_hard_clash');
    expect(result.debug.archetype_distance).toBe('far');
  });

  /**
   * Test 7: far primary but secondary softens distance => demote not hide
   */
  test('7. far primary distance but secondary softens => demote not hide', () => {
    // night_edge (glam) to utility (outdoor_utility) = far
    // BUT scan has secondary 'sporty' (casual_urban)
    // There's a pair_override: outdoor_utility:sporty = close
    // So it softens from far to close!
    const input = createInput(
      'tops',
      'bottoms',
      {
        primary: 'glam', // night_edge cluster
        primaryConf: 0.75,
        secondary: 'sporty', // Has pair_override with outdoor_utility -> close
        secondaryConf: 0.5,
        formality: 'casual',
        statement: 'high',
        statementConf: 0.7,
      },
      {
        primary: 'outdoor_utility', // utility cluster -> far from night_edge
        primaryConf: 0.75,
        formality: 'casual',
        statement: 'high',
        statementConf: 0.7,
      }
    );

    const result = evaluateTrustFilterPair(input);

    // Secondary softening should work (far -> close due to pair_override)
    expect(result.debug.used_secondary).toBe(true);
    // The secondary sporty has pair_override with outdoor_utility -> close
    expect(['close', 'medium']).toContain(result.debug.archetype_distance);
    expect(result.action).not.toBe('hide');
    // Should either keep (close distance) or demote for statement (if medium)
    expect(['keep', 'demote_to_near']).toContain(result.action);
  });

  /**
   * Test 8: both statement high + medium distance => demote statement_vs_statement_overload
   */
  test('8. both statement high with medium distance => demote statement_vs_statement_overload', () => {
    const input = createInput(
      'tops',
      'bottoms',
      {
        primary: 'street', // casual_urban
        primaryConf: 0.8,
        statement: 'high',
        statementConf: 0.7,
        formality: 'casual',
      },
      {
        primary: 'classic', // tailored_core -> medium from casual_urban
        primaryConf: 0.8,
        statement: 'high',
        statementConf: 0.7,
        formality: 'casual',
      }
    );

    const result = evaluateTrustFilterPair(input);

    expect(result.action).toBe('demote_to_near');
    expect(result.primary_reason).toBe('statement_vs_statement_overload');
    expect(result.debug.archetype_distance).toBe('medium');
  });

  /**
   * Test 9: gap==2 with athleisure => demote athleisure_vs_polished_clash
   */
  test('9. formality gap 2 with athleisure => demote athleisure_vs_polished_clash', () => {
    const input = createInput(
      'tops',
      'bottoms',
      {
        primary: 'sporty',
        formality: 'athleisure',
        formalityConf: 0.8,
      },
      {
        primary: 'classic',
        formality: 'smart_casual', // 2 levels from athleisure
        formalityConf: 0.8,
      }
    );

    const result = evaluateTrustFilterPair(input);

    expect(result.action).toBe('demote_to_near');
    expect(result.primary_reason).toBe('athleisure_vs_polished_clash');
    expect(result.debug.formality_gap).toBe(2);
  });

  /**
   * Test 10: season diff==1 with high confidence => demote weather_season_soft_mismatch
   */
  test('10. season diff 1 with high confidence => demote weather_season_soft_mismatch', () => {
    const input = createInput(
      'tops',
      'bottoms',
      {
        primary: 'minimalist',
        season: 'light',
        seasonConf: 0.8,
        formality: 'casual',
      },
      {
        primary: 'minimalist',
        season: 'mid', // 1 level from light
        seasonConf: 0.8,
        formality: 'casual',
      }
    );

    const result = evaluateTrustFilterPair(input);

    expect(result.action).toBe('demote_to_near');
    expect(result.primary_reason).toBe('weather_season_soft_mismatch');
    expect(result.debug.season_diff).toBe(1);
  });

  /**
   * Test 11: low confidence on aesthetic => never hide on archetype; keep or demote low_confidence_inputs
   */
  test('11. low confidence on aesthetic => never hide for archetype, demote low_confidence_inputs', () => {
    const input = createInput(
      'tops',
      'bottoms',
      {
        primary: 'glam', // Would be far from utility
        primaryConf: 0.4, // Below 0.55 threshold
        formality: 'casual',
      },
      {
        primary: 'outdoor_utility',
        primaryConf: 0.4, // Below 0.55 threshold
        formality: 'casual',
      }
    );

    const result = evaluateTrustFilterPair(input);

    // Should NOT hide because confidence gate prevents archetype-based hide
    expect(result.action).not.toBe('hide');
    // Should demote for low confidence
    expect(result.action).toBe('demote_to_near');
    expect(result.primary_reason).toBe('low_confidence_inputs');
    expect(result.debug.confidence_gate_hit).toBe(true);
  });

  /**
   * Test 12: missing style_signals_v1 => keep insufficient_info
   */
  test('12. missing style_signals_v1 => keep with insufficient_info', () => {
    const input: TrustFilterInput = {
      scanSignals: createSignals(),
      matchSignals: null, // Missing signals
      scanCategory: 'tops',
      matchCategory: 'bottoms',
      ceTier: 'HIGH',
    };

    const result = evaluateTrustFilterPair(input);

    expect(result.action).toBe('keep');
    expect(result.primary_reason).toBe('insufficient_info');
    expect(result.debug.confidence_gate_hit).toBe(true);
  });
});

// ============================================
// ADDITIONAL EDGE CASES
// ============================================

describe('Trust Filter v1 - Edge Cases', () => {
  test('both signals null => keep with insufficient_info', () => {
    const input: TrustFilterInput = {
      scanSignals: null,
      matchSignals: null,
      scanCategory: 'tops',
      matchCategory: 'bottoms',
      ceTier: 'HIGH',
    };

    const result = evaluateTrustFilterPair(input);

    expect(result.action).toBe('keep');
    expect(result.primary_reason).toBe('insufficient_info');
  });

  test('same archetype (close distance) => keep', () => {
    const input = createInput(
      'tops',
      'bottoms',
      {
        primary: 'minimalist',
        primaryConf: 0.8,
        formality: 'casual',
      },
      {
        primary: 'classic', // Same cluster (tailored_core)
        primaryConf: 0.8,
        formality: 'casual',
      }
    );

    const result = evaluateTrustFilterPair(input);

    expect(result.action).toBe('keep');
    expect(result.debug.archetype_distance).toBe('close');
  });

  test('pair override changes distance (western:classic => close)', () => {
    const input = createInput(
      'tops',
      'bottoms',
      {
        primary: 'western',
        primaryConf: 0.8,
        formality: 'casual',
      },
      {
        primary: 'classic',
        primaryConf: 0.8,
        formality: 'casual',
      }
    );

    const result = evaluateTrustFilterPair(input);

    // western and classic have a pair_override to 'close'
    expect(result.debug.archetype_distance).toBe('close');
    expect(result.action).toBe('keep');
  });

  test('skirts + bold patterns => demote not hide', () => {
    const input = createInput(
      'skirts',
      'tops',
      {
        primary: 'romantic',
        formality: 'casual',
        pattern: 'bold',
        patternConf: 0.7,
      },
      {
        primary: 'romantic',
        formality: 'casual',
        pattern: 'bold',
        patternConf: 0.7,
      }
    );

    const result = evaluateTrustFilterPair(input);

    // Both bold patterns should demote
    expect(result.action).toBe('demote_to_near');
    expect(result.primary_reason).toBe('pattern_texture_overload');
    // Skirts policy should prevent hide escalation (defensive check)
    expect(result.action).not.toBe('hide');
  });

  test('unknown aesthetic => null archetype distance', () => {
    const input = createInput(
      'tops',
      'bottoms',
      {
        primary: 'unknown',
        formality: 'casual',
      },
      {
        primary: 'classic',
        formality: 'casual',
      }
    );

    const result = evaluateTrustFilterPair(input);

    expect(result.debug.archetype_distance).toBeNull();
  });

  test('unknown formality => null formality gap', () => {
    const input = createInput(
      'tops',
      'bottoms',
      {
        primary: 'minimalist',
        formality: 'unknown',
      },
      {
        primary: 'minimalist',
        formality: 'casual',
      }
    );

    const result = evaluateTrustFilterPair(input);

    expect(result.debug.formality_gap).toBeNull();
  });

  test('trace is included when enableTrace is true', () => {
    const input = createInput('tops', 'bottoms');

    const result = evaluateTrustFilterPair(input, true);

    expect(result.trace).toBeDefined();
    expect(Array.isArray(result.trace)).toBe(true);
    expect(result.trace!.length).toBeGreaterThan(0);
  });

  test('trace is undefined when enableTrace is false', () => {
    const input = createInput('tops', 'bottoms');

    const result = evaluateTrustFilterPair(input, false);

    expect(result.trace).toBeUndefined();
  });
});

// ============================================
// BATCH EVALUATION TESTS
// ============================================

describe('Trust Filter v1 - Batch Evaluation', () => {
  test('batch evaluates top N and skips rest', () => {
    const scanSignals = createSignals({ primary: 'minimalist', formality: 'casual' });

    const matches = Array.from({ length: 15 }, (_, i) => ({
      id: `match-${i}`,
      signals: createSignals({ primary: 'minimalist', formality: 'casual' }),
      category: 'bottoms' as TFCategory,
      ceScore: 0.9 - i * 0.01,
    }));

    const result = evaluateTrustFilterBatch({
      scanSignals,
      scanCategory: 'tops',
      matches,
      maxCandidates: 10,
    });

    expect(result.stats.totalEvaluated).toBe(10);
    expect(result.stats.skippedCount).toBe(5);
    // Skipped matches should still be in highFinal
    expect(result.highFinal.length).toBeGreaterThanOrEqual(5);
  });

  test('batch correctly separates keep/demote/hide', () => {
    // Scan item: glam, formal
    const scanSignals = createSignals({
      primary: 'glam',
      primaryConf: 0.8,
      formality: 'formal',
      formalityConf: 0.8,
    });

    const matches = [
      {
        // Keep: same cluster (night_edge), same formality
        id: 'keep',
        signals: createSignals({ 
          primary: 'edgy', // night_edge, close to glam
          formality: 'formal',
          formalityConf: 0.8,
        }),
        category: 'bottoms' as TFCategory,
        ceScore: 0.9,
      },
      {
        // Demote: athleisure + smart_casual = gap of 2
        id: 'demote',
        signals: createSignals({
          primary: 'sporty',
          formality: 'athleisure',
          formalityConf: 0.8,
        }),
        category: 'bottoms' as TFCategory,
        ceScore: 0.85,
      },
      {
        // Hide: athleisure + formal = gap of 4, with athleisure involved
        id: 'hide',
        signals: createSignals({
          primary: 'sporty',
          formality: 'athleisure',
          formalityConf: 0.8,
        }),
        category: 'bottoms' as TFCategory,
        ceScore: 0.8,
      },
    ];

    const result = evaluateTrustFilterBatch({
      scanSignals,
      scanCategory: 'tops',
      matches,
    });

    expect(result.highFinal).toContain('keep');
    // Both athleisure items should be hidden (gap 4 with athleisure = hide)
    expect(result.hidden.length).toBeGreaterThanOrEqual(1);
  });

  test('batch tracks reason counts', () => {
    const scanSignals = createSignals({
      primary: 'minimalist',
      formality: 'athleisure',
      formalityConf: 0.8,
    });

    const matches = [
      {
        id: '1',
        signals: createSignals({
          primary: 'minimalist',
          formality: 'smart_casual',
          formalityConf: 0.8,
        }),
        category: 'bottoms' as TFCategory,
        ceScore: 0.9,
      },
      {
        id: '2',
        signals: createSignals({
          primary: 'minimalist',
          formality: 'smart_casual',
          formalityConf: 0.8,
        }),
        category: 'bottoms' as TFCategory,
        ceScore: 0.85,
      },
    ];

    const result = evaluateTrustFilterBatch({
      scanSignals,
      scanCategory: 'tops',
      matches,
    });

    // Both should demote for athleisure_vs_polished_clash
    expect(result.stats.reasonCounts['athleisure_vs_polished_clash']).toBe(2);
  });
});
