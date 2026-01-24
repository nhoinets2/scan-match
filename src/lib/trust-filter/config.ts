/**
 * Trust Filter v1 - Configuration
 *
 * LOCKED configuration for the Trust Filter.
 * This config is compiled into the app.
 * Remote overrides can adjust specific keys (see allowed list).
 */

import type {
  AestheticArchetype,
  AestheticCluster,
  ArchetypeDistance,
  ClusterDistanceMatrix,
  FormalityBand,
  SeasonHeaviness,
  StatementLevel,
  PatternLevel,
  TFCategory,
  HardReasonCode,
  SoftReasonCode,
  InfoReasonCode,
} from './types';

// ============================================
// CONFIG TYPES
// ============================================

export interface TrustFilterConfigV1 {
  trust_filter_version: 1;

  apply_to: {
    ce_tiers: ('HIGH' | 'MEDIUM' | 'LOW')[];
    max_candidates_per_scan: number;
  };

  confidence_thresholds: {
    aesthetic_primary_min: number;
    secondary_min: number;
    formality_min: number;
    statement_min: number;
    season_min: number;
    pattern_min: number;
    material_min: number;
  };

  formality: {
    band_to_level: Record<FormalityBand, number | null>;
    rules: {
      hide_if: Array<{
        gap_gte?: number;
        either_is?: FormalityBand;
        reason: HardReasonCode;
      }>;
      demote_if: Array<{
        gap_eq?: number;
        gap_gte?: number;
        either_is?: FormalityBand;
        reason: SoftReasonCode | HardReasonCode;
      }>;
    };
  };

  season: {
    heaviness_to_level: Record<SeasonHeaviness, number | null>;
    rules: {
      hide_if: Array<{
        diff_gte: number;
        reason: HardReasonCode;
      }>;
      demote_if: Array<{
        diff_eq: number;
        reason: SoftReasonCode;
      }>;
    };
  };

  statement: {
    level_to_int: Record<StatementLevel, number | null>;
    rules: {
      demote_if: Array<{
        both_gte?: number;
        one_gte?: number;
        archetype_distance_in: ArchetypeDistance[];
        reason: SoftReasonCode;
      }>;
    };
  };

  pattern: {
    level_to_int: Record<PatternLevel, number | null>;
    rules: {
      demote_if: Array<{
        both_gte: number;
        reason: SoftReasonCode;
      }>;
    };
  };

  categories: {
    enum: TFCategory[];
    groups: Record<string, TFCategory[]>;
    pair_types: {
      outfit_completing: [TFCategory, TFCategory][];
      anchor_dependent: [TFCategory, TFCategory][];
    };
    special_policies: {
      bags_and_accessories: {
        never_hide_for_archetype_only: boolean;
        allow_hide_only_for: HardReasonCode[];
        default_action_if_only_style_mismatch: 'keep' | 'demote_to_near';
      };
      shoes_plus_tops: {
        never_hide_for_archetype_only: boolean;
        prefer_anchor_reason_when_borderline: boolean;
      };
      skirts: {
        never_escalate_statement_or_pattern_to_hide: boolean;
      };
    };
  };

  aesthetic: {
    enum: AestheticArchetype[];
    clusters: Record<AestheticCluster, AestheticArchetype[]>;
    cluster_distances: ClusterDistanceMatrix;
    pair_overrides: Record<string, ArchetypeDistance>;
    hard_clash_rules: {
      emit_style_archetype_hard_clash_if: {
        distance_is: ArchetypeDistance;
        require_primary_confidence_gte: number;
        allow_secondary_to_soften: boolean;
      };
    };
    secondary_usage: {
      allow_secondary_softening: boolean;
      secondary_can_upgrade: string[];
      secondary_can_never_override_hard_reasons: boolean;
    };
  };

  anchor_rule: {
    enabled: boolean;
    trigger_if: {
      pair_type_is: 'anchor_dependent';
      archetype_distance_is: ArchetypeDistance;
      formality_gap_lte: number;
      any_of: Array<{
        statement_one_is?: StatementLevel;
        pattern_one_is?: PatternLevel;
      }>;
    };
    action: {
      type: 'demote_to_near';
      reason: SoftReasonCode;
    };
  };

  reason_codes: {
    hard: HardReasonCode[];
    soft: SoftReasonCode[];
    info: InfoReasonCode[];
  };

  decision_priority: {
    hide_order: HardReasonCode[];
    demote_order: SoftReasonCode[];
  };
}

// ============================================
// COMPILED CONFIG (LOCKED)
// ============================================

export const TRUST_FILTER_CONFIG_V1: TrustFilterConfigV1 = {
  trust_filter_version: 1,

  apply_to: {
    ce_tiers: ['HIGH'],
    max_candidates_per_scan: 10,
  },

  confidence_thresholds: {
    aesthetic_primary_min: 0.55,
    secondary_min: 0.35,
    formality_min: 0.55,
    statement_min: 0.5,
    season_min: 0.55,
    pattern_min: 0.5,
    material_min: 0.45,
  },

  formality: {
    band_to_level: {
      athleisure: 0,
      casual: 1,
      smart_casual: 2,
      office: 3,
      formal: 4,
      evening: 5,
      unknown: null,
    },
    rules: {
      hide_if: [
        { gap_gte: 3, either_is: 'athleisure', reason: 'formality_hard_clash' },
      ],
      demote_if: [
        {
          gap_eq: 2,
          either_is: 'athleisure',
          reason: 'athleisure_vs_polished_clash',
        },
        { gap_gte: 3, reason: 'formality_hard_clash' },
      ],
    },
  },

  season: {
    heaviness_to_level: {
      light: 0,
      mid: 1,
      heavy: 2,
      unknown: null,
    },
    rules: {
      hide_if: [{ diff_gte: 2, reason: 'weather_season_hard_clash' }],
      demote_if: [{ diff_eq: 1, reason: 'weather_season_soft_mismatch' }],
    },
  },

  statement: {
    level_to_int: {
      low: 0,
      medium: 1,
      high: 2,
      unknown: null,
    },
    rules: {
      demote_if: [
        {
          both_gte: 2,
          archetype_distance_in: ['medium', 'far'],
          reason: 'statement_vs_statement_overload',
        },
        {
          one_gte: 2,
          archetype_distance_in: ['far'],
          reason: 'statement_context_mismatch',
        },
      ],
    },
  },

  pattern: {
    level_to_int: {
      solid: 0,
      subtle: 1,
      bold: 2,
      unknown: null,
    },
    rules: {
      demote_if: [{ both_gte: 2, reason: 'pattern_texture_overload' }],
    },
  },

  categories: {
    enum: [
      'tops',
      'bottoms',
      'skirts',
      'dresses',
      'shoes',
      'outerwear',
      'bags',
      'accessories',
    ],
    groups: {
      core: ['tops', 'bottoms', 'skirts', 'dresses', 'outerwear'],
      footwear: ['shoes'],
      carriers: ['bags'],
      finishers: ['accessories'],
    },
    pair_types: {
      outfit_completing: [
        ['tops', 'bottoms'],
        ['tops', 'skirts'],
        ['tops', 'dresses'],
        ['dresses', 'outerwear'],
        ['bottoms', 'outerwear'],
        ['skirts', 'outerwear'],
        ['shoes', 'bottoms'],
        ['shoes', 'skirts'],
        ['shoes', 'dresses'],
      ],
      anchor_dependent: [
        ['shoes', 'tops'],
        ['outerwear', 'shoes'],
        ['outerwear', 'tops'],
      ],
    },
    special_policies: {
      bags_and_accessories: {
        never_hide_for_archetype_only: true,
        allow_hide_only_for: [
          'formality_hard_clash',
          'weather_season_hard_clash',
          'function_incompatible',
        ],
        default_action_if_only_style_mismatch: 'keep',
      },
      shoes_plus_tops: {
        never_hide_for_archetype_only: true,
        prefer_anchor_reason_when_borderline: true,
      },
      skirts: {
        never_escalate_statement_or_pattern_to_hide: true,
      },
    },
  },

  aesthetic: {
    enum: [
      'minimalist',
      'classic',
      'workwear',
      'romantic',
      'boho',
      'western',
      'street',
      'sporty',
      'edgy',
      'glam',
      'preppy',
      'outdoor_utility',
      'unknown',
      'none',
    ],
    clusters: {
      tailored_core: ['classic', 'minimalist', 'workwear', 'preppy'],
      soft_feminine: ['romantic', 'boho'],
      casual_urban: ['street', 'sporty'],
      night_edge: ['glam', 'edgy'],
      western: ['western'],
      utility: ['outdoor_utility'],
    },
    cluster_distances: {
      tailored_core: {
        tailored_core: 'close',
        soft_feminine: 'medium',
        casual_urban: 'medium',
        night_edge: 'medium',
        western: 'medium',
        utility: 'far',
      },
      soft_feminine: {
        tailored_core: 'medium',
        soft_feminine: 'close',
        casual_urban: 'medium',
        night_edge: 'medium',
        western: 'medium',
        utility: 'far',
      },
      casual_urban: {
        tailored_core: 'medium',
        soft_feminine: 'medium',
        casual_urban: 'close',
        night_edge: 'far',
        western: 'medium',
        utility: 'medium',
      },
      night_edge: {
        tailored_core: 'medium',
        soft_feminine: 'medium',
        casual_urban: 'far',
        night_edge: 'close',
        western: 'far',
        utility: 'far',
      },
      western: {
        tailored_core: 'medium',
        soft_feminine: 'medium',
        casual_urban: 'medium',
        night_edge: 'far',
        western: 'close',
        utility: 'medium',
      },
      utility: {
        tailored_core: 'far',
        soft_feminine: 'far',
        casual_urban: 'medium',
        night_edge: 'far',
        western: 'medium',
        utility: 'close',
      },
    },
    pair_overrides: {
      'western:classic': 'close',
      'western:workwear': 'close',
      'glam:classic': 'close',
      'edgy:street': 'close',
      'sporty:street': 'close',
      'outdoor_utility:sporty': 'close',
    },
    hard_clash_rules: {
      emit_style_archetype_hard_clash_if: {
        distance_is: 'far',
        require_primary_confidence_gte: 0.65,
        allow_secondary_to_soften: true,
      },
    },
    secondary_usage: {
      allow_secondary_softening: true,
      secondary_can_upgrade: ['far->medium', 'medium->close'],
      secondary_can_never_override_hard_reasons: true,
    },
  },

  anchor_rule: {
    enabled: true,
    trigger_if: {
      pair_type_is: 'anchor_dependent',
      archetype_distance_is: 'medium',
      formality_gap_lte: 1,
      any_of: [{ statement_one_is: 'high' }, { pattern_one_is: 'bold' }],
    },
    action: {
      type: 'demote_to_near',
      reason: 'context_dependent_needs_anchor',
    },
  },

  reason_codes: {
    hard: [
      'formality_hard_clash',
      'style_archetype_hard_clash',
      'weather_season_hard_clash',
      'function_incompatible',
    ],
    soft: [
      'athleisure_vs_polished_clash',
      'statement_vs_statement_overload',
      'statement_context_mismatch',
      'context_dependent_needs_anchor',
      'weather_season_soft_mismatch',
      'silhouette_conflict_strong',
      'length_proportion_conflict',
      'pattern_texture_overload',
      'low_confidence_inputs',
    ],
    info: ['insufficient_info', 'evaluation_error'],
  },

  decision_priority: {
    hide_order: [
      'formality_hard_clash',
      'weather_season_hard_clash',
      'function_incompatible',
      'style_archetype_hard_clash',
    ],
    demote_order: [
      'athleisure_vs_polished_clash',
      'statement_vs_statement_overload',
      'statement_context_mismatch',
      'context_dependent_needs_anchor',
      'pattern_texture_overload',
      'weather_season_soft_mismatch',
      'silhouette_conflict_strong',
      'length_proportion_conflict',
      'low_confidence_inputs',
    ],
  },
};

// ============================================
// REMOTE CONFIG VALIDATION
// ============================================

/**
 * Keys that can be overridden via remote config.
 * All other keys are locked and cannot be changed remotely.
 */
export const REMOTE_OVERRIDE_ALLOWED_KEYS = [
  'apply_to.max_candidates_per_scan',
  'confidence_thresholds.aesthetic_primary_min',
  'confidence_thresholds.secondary_min',
  'confidence_thresholds.formality_min',
  'confidence_thresholds.statement_min',
  'confidence_thresholds.season_min',
  'confidence_thresholds.pattern_min',
  'confidence_thresholds.material_min',
  'decision_priority.hide_order',
  'decision_priority.demote_order',
  'anchor_rule.enabled',
  'anchor_rule.trigger_if.archetype_distance_is',
  'anchor_rule.trigger_if.formality_gap_lte',
  'aesthetic.pair_overrides',
] as const;

/**
 * Validate and merge remote config overrides.
 * Returns merged config or original if validation fails.
 */
export function mergeRemoteConfig(
  baseConfig: TrustFilterConfigV1,
  remoteOverrides: Partial<Record<string, unknown>>
): { config: TrustFilterConfigV1; valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const merged = JSON.parse(JSON.stringify(baseConfig)) as TrustFilterConfigV1;

  for (const [key, value] of Object.entries(remoteOverrides)) {
    if (!REMOTE_OVERRIDE_ALLOWED_KEYS.includes(key as typeof REMOTE_OVERRIDE_ALLOWED_KEYS[number])) {
      errors.push(`Remote override key not allowed: ${key}`);
      continue;
    }

    try {
      // Apply override using dot notation
      const parts = key.split('.');
      let target: Record<string, unknown> = merged as unknown as Record<string, unknown>;

      for (let i = 0; i < parts.length - 1; i++) {
        target = target[parts[i]] as Record<string, unknown>;
      }

      const finalKey = parts[parts.length - 1];
      
      // Type validation for specific keys
      if (key === 'apply_to.max_candidates_per_scan') {
        if (typeof value !== 'number' || value < 1 || value > 50) {
          errors.push(`Invalid value for ${key}: must be number 1-50`);
          continue;
        }
      }

      if (key.startsWith('confidence_thresholds.')) {
        if (typeof value !== 'number' || value < 0 || value > 1) {
          errors.push(`Invalid value for ${key}: must be number 0-1`);
          continue;
        }
      }

      if (key === 'anchor_rule.enabled') {
        if (typeof value !== 'boolean') {
          errors.push(`Invalid value for ${key}: must be boolean`);
          continue;
        }
      }

      target[finalKey] = value;
    } catch (e) {
      errors.push(`Failed to apply override ${key}: ${e}`);
    }
  }

  return {
    config: merged,
    valid: errors.length === 0,
    errors,
  };
}
