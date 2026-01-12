# Confidence Engine - Technical Specification

A deterministic, rules-based confidence scoring system for outfit matching. The engine reasons about how clothes are worn together, not whether they're stylish.

> **Core Philosophy**: "Silence is a trust-preserving feature, not a failure state."

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Data Types](#data-types)
4. [Feature Signals](#feature-signals)
5. [Scoring System](#scoring-system)
6. [Gating System](#gating-system)
7. [Tier Mapping](#tier-mapping)
8. [Suggestions System](#suggestions-system)
9. [Explanations System](#explanations-system)
10. [Analytics](#analytics)
11. [Configuration](#configuration)
12. [Integration Guide](#integration-guide)

---

## Overview

### What It Does

The Confidence Engine evaluates how well clothing items work together by analyzing multiple dimensions of compatibility:

- **Color** - Do the colors harmonize or clash?
- **Style** - Do the style families complement each other?
- **Formality** - Are they at the same level of dressiness?
- **Texture** - Do the materials work together?
- **Usage** - Are they meant for the same context?

### Confidence Tiers

| Tier | Raw Score | UI Behavior |
|------|-----------|-------------|
| **HIGH** | ≥ 0.78 (0.82 for shoes) | Show matches, allow explanations |
| **MEDIUM** | ≥ 0.58 | Hide matches, show Mode B suggestions |
| **LOW** | < 0.58 | Stay silent |

### Key Principles

1. **Deterministic** - Same inputs always produce same outputs
2. **Conservative** - When uncertain, stay silent rather than wrong
3. **Explainable** - Every decision can be traced to specific rules
4. **Trust-preserving** - Never make confident claims the engine can't back up

---

## Architecture

```
src/lib/confidence-engine/
├── index.ts              # Public API exports
├── types.ts              # Type definitions
├── config.ts             # Weights, thresholds, templates
├── utils.ts              # Pure utility functions
├── signals.ts            # Feature signal computation
├── scoring.ts            # Weighted score calculation
├── gates.ts              # Hard fail / soft cap logic
├── tiers.ts              # Score → tier mapping
├── suggestions.ts        # Mode A/B suggestion generation
├── pair-evaluation.ts    # Single pair evaluation
├── outfit-evaluation.ts  # Aggregate outfit evaluation
├── explanations.ts       # Explanation eligibility & generation
└── analytics.ts          # Event tracking
```

### Data Flow

```
ConfidenceItem A + ConfidenceItem B
         ↓
    getPairType()
         ↓
  computeFeatureSignals()  →  { C, S, F, T, U, V }
         ↓
    computeRawScore()      →  0.0 - 1.0
         ↓
    evaluateGates()        →  { forced_tier, max_tier, cap_reasons }
         ↓
    mapScoreToTier()       →  HIGH | MEDIUM | LOW
         ↓
    PairEvaluation
         ↓
  (aggregate multiple pairs)
         ↓
    OutfitEvaluation
```

---

## Data Types

### ConfidenceItem (Input)

The core input type representing a clothing item:

```typescript
interface ConfidenceItem {
  id: string;
  category: Category;

  // Required for scoring
  color_profile: ColorProfile;
  style_family: StyleFamily;
  formality_level: FormalityLevel;  // 1-5
  texture_type: TextureType;

  // Optional (v2)
  silhouette_profile?: SilhouetteProfile;
  season_weight?: 'light' | 'mid' | 'heavy';

  // Metadata
  image_uri?: string;
  label?: string;
}
```

### Category

```typescript
type Category =
  | 'tops'
  | 'bottoms'
  | 'shoes'
  | 'outerwear'
  | 'dresses'
  | 'accessories'
  | 'bags'
  | 'skirts';
```

### ColorProfile

```typescript
interface ColorProfile {
  is_neutral: boolean;
  dominant_hue?: number;    // 0-360, omit if neutral
  saturation: 'low' | 'med' | 'high';
  value: 'low' | 'med' | 'high';
}
```

**Examples:**
- Black jeans: `{ is_neutral: true, saturation: 'low', value: 'low' }`
- Navy blazer: `{ is_neutral: false, dominant_hue: 220, saturation: 'med', value: 'low' }`
- Coral top: `{ is_neutral: false, dominant_hue: 16, saturation: 'high', value: 'high' }`

### StyleFamily

```typescript
type StyleFamily =
  | 'minimal'    // Clean lines, neutral palette
  | 'classic'    // Timeless, refined
  | 'street'     // Urban, casual-cool
  | 'athleisure' // Sport-influenced casual
  | 'romantic'   // Soft, feminine details
  | 'edgy'       // Bold, unconventional
  | 'boho'       // Relaxed, artistic
  | 'preppy'     // Polished, traditional
  | 'formal'     // Business/black-tie
  | 'unknown';   // Cannot determine
```

### FormalityLevel

```typescript
type FormalityLevel = 1 | 2 | 3 | 4 | 5;

// 1 = Athleisure/loungewear (joggers, hoodies)
// 2 = Casual everyday (jeans, t-shirts)
// 3 = Smart casual (chinos, button-downs)
// 4 = Business (blazers, dress pants)
// 5 = Formal/black-tie (suits, gowns)
```

### TextureType

```typescript
type TextureType =
  | 'smooth'      // Silk, satin, polished leather
  | 'textured'    // Knit, tweed, corduroy
  | 'soft'        // Cotton jersey, cashmere
  | 'structured'  // Denim, canvas, stiff cotton
  | 'mixed'       // Multiple textures
  | 'unknown';
```

---

## Feature Signals

Each pair of items is evaluated across 6 feature dimensions. Each returns a value from -2 to +2.

### C - Color Compatibility

Evaluates hue distance, neutral pairing, and saturation/value modifiers.

| Condition | Score |
|-----------|-------|
| Both neutrals | +2 |
| One neutral | +1.5 |
| Same/analogous hue (≤30°) | +2 |
| Complementary (150-180°) | +1.5 |
| Split-complementary (120-150°) | +1 |
| Triadic (90-120°) | 0 |
| Awkward (45-90°) | -1 |
| Near-clash (30-45°) | -1.5 |

**Modifiers:**
- Both high saturation: amplify ±0.5
- Both low saturation: dampen ×0.7
- High value contrast: +0.5 bonus

### S - Style Family Alignment

Uses adjacency map to determine style compatibility.

| Relationship | Score | Examples |
|--------------|-------|----------|
| Same family | +2 | minimal + minimal |
| Natural neighbors | +2 | minimal + classic, street + athleisure |
| Compatible | +1 | minimal + edgy, classic + boho |
| Neutral | 0 | (default) |
| Tension | -1 | preppy + street, romantic + athleisure |
| Opposing | -2 | formal + athleisure, preppy + edgy |

### F - Formality Alignment

Based on formality level difference.

| Gap | Score |
|-----|-------|
| 0 levels | +2 |
| 1 level | +1 |
| 2 levels | 0 |
| 3 levels | -1 |
| 4 levels | -2 |

### T - Texture Harmony

| Pairing | Score |
|---------|-------|
| Complementary (smooth + textured, soft + structured) | +2 |
| Same texture | +1 |
| Mixed + anything | +1 |
| Tension (textured + structured) | -1 |
| Unknown | 0 |

### U - Usage/Context Alignment

Derived from formality and style. Weighted average: 60% formality, 40% style.

### V - Silhouette Balance (v2, disabled)

Reserved for future volume/proportion analysis.

---

## Scoring System

### Weight Distribution

Weights vary by pair type. Default weights:

| Feature | Weight |
|---------|--------|
| C (Color) | 0.20 |
| S (Style) | 0.20 |
| F (Formality) | 0.25 |
| T (Texture) | 0.15 |
| U (Usage) | 0.20 |
| V (Silhouette) | 0.00 |

**Special cases:**
- Shoes pairs: Higher U weight (0.30), lower C/T
- Outerwear pairs: Higher T weight (0.25)

### Unknown Feature Handling

When a feature is unknown (e.g., style_family = 'unknown'):
1. Feature contributes 0 to score
2. Its weight is redistributed proportionally to known features
3. Total weights still sum to 1.0

### Raw Score Calculation

```typescript
raw_score = Σ(normalized_feature_value × weight) / Σ(weight)
```

Where `normalized_feature_value` maps [-2, +2] to [0, 1]:
- -2 → 0.0
- -1 → 0.25
- 0 → 0.5
- +1 → 0.75
- +2 → 1.0

---

## Gating System

Two-phase system that can override raw score.

### Phase 1: Hard Fails → Force LOW

Deal-breakers that force tier to LOW regardless of score.

| Hard Fail | Condition |
|-----------|-----------|
| `FORMALITY_CLASH_WITH_USAGE` | Formality gap ≥ 3 AND (usage negative OR formality ≤ -1) |
| `STYLE_OPPOSITION_NO_OVERLAP` | Style score = -2 AND neither item is minimal/classic |
| `SHOES_TEXTURE_FORMALITY_CLASH` | Shoes involved AND formality gap ≥ 2 AND texture ≤ -1 AND formality ≤ -1 |

### Phase 2: Soft Caps → Max MEDIUM

Tensions that cap the tier at MEDIUM (cannot reach HIGH).

| Cap Reason | Condition |
|------------|-----------|
| `FORMALITY_TENSION` | Formality gap = 2 |
| `STYLE_TENSION` | Style score = -1 |
| `COLOR_TENSION` | Color score < 0 |
| `TEXTURE_CLASH` | Texture score ≤ -1 |
| `USAGE_MISMATCH` | Usage score < 0 |
| `SHOES_CONFIDENCE_DAMPEN` | Any shoes involved |
| `MISSING_KEY_SIGNAL` | Both style AND texture unknown |

---

## Tier Mapping

### Standard Thresholds

| Tier | Threshold |
|------|-----------|
| HIGH | raw_score ≥ 0.78 |
| MEDIUM | raw_score ≥ 0.58 |
| LOW | raw_score < 0.58 |

### Shoes Threshold

Shoes use stricter HIGH threshold: **0.82**

### Mapping Logic

```
1. If forced_tier = LOW → return LOW
2. Calculate base_tier from thresholds
3. If max_tier = MEDIUM and base_tier = HIGH → return MEDIUM
4. Return base_tier
```

### Near-Match Detection

For Mode B suggestions, identify "near-matches":

| Type | Criteria |
|------|----------|
| **2a** (Soft-capped HIGH) | raw_score ≥ HIGH threshold AND has cap_reasons AND tier = MEDIUM |
| **2b** (Strong MEDIUM) | raw_score ≥ 0.70 AND tier = MEDIUM |

---

## Suggestions System

### Mode A: "What to Add" (Missing Pieces)

Used when:
- Wardrobe is empty
- No HIGH matches found
- No near-matches available

Provides category-based suggestions for completing a look:

```typescript
// Example for tops
{
  intro: "To make this item easy to wear:",
  bullets: [
    "Dark or structured bottoms",
    "Neutral everyday shoes",
    "Light layer for balance"
  ]
}
```

### Mode B: "Make it Work" (Styling Guidance)

Used when near-matches exist. Generates actionable styling tips based on cap_reasons.

**Template examples by reason:**

| Cap Reason | Bullet Example |
|------------|----------------|
| `FORMALITY_TENSION` | "Keep the rest of the outfit at the same level of dressiness." |
| `STYLE_TENSION` | "Let one piece set the vibe, and keep the rest simple." |
| `COLOR_TENSION` | "Keep the other pieces neutral to avoid competing colors." |
| `USAGE_MISMATCH` | "Match the outfit to one clear context (everyday vs dressy)." |

**Generation rules:**
1. Sort cap_reasons by priority
2. Exclude `TEXTURE_CLASH` (too subjective)
3. Pick top 2-3 reasons
4. Select 1 bullet from each template
5. Ensure 2-3 total bullets

---

## Explanations System

Explanations are only shown for HIGH confidence matches to preserve trust.

### Eligibility Rules

✅ **Allowed when:**
- Feature flag enabled
- Confidence tier = HIGH
- Not forbidden by rules

❌ **Forbidden when:**
- Both items are statement pieces (high saturation OR strong style family OR formality ≥ 4)
- Shoes involved (flag disabled)
- Texture clash in cap_reasons
- Hard fail reason = `STYLE_OPPOSITION_NO_OVERLAP`

### Specificity Levels

| Level | Description | Example |
|-------|-------------|---------|
| 1 | Abstract (always safe) | "These pieces balance each other out." |
| 2 | Soft attributes | "The relaxed feel of both pieces makes them work." |
| 3 | Concrete (rare, 10%) | (Reserved for very high confidence) |

### Template Selection

1. Find templates matching pair_type (or 'any')
2. Prefer pair-specific over generic
3. Random selection from matching templates
4. Determine specificity level based on signal strength

---

## Analytics

Phase 1: Observe only, no kill switches.

### Events Tracked

| Event | Purpose |
|-------|---------|
| `confidence_pair_evaluated` | Individual pair evaluation details |
| `confidence_outfit_evaluated` | Aggregate outfit results |
| `confidence_tier_distribution` | Session-level tier breakdown |
| `confidence_cap_reason_frequency` | Which caps fire most often |

### Key Properties

```typescript
// Pair evaluation
{
  pair_type: 'tops_bottoms',
  raw_score: 0.82,
  confidence_tier: 'HIGH',
  is_hard_fail: false,
  cap_reasons: [],
  is_near_match: false,
  explanation_allowed: true
}

// Outfit evaluation
{
  wardrobe_size: 12,
  pair_count: 8,
  high_match_count: 3,
  medium_match_count: 4,
  low_match_count: 1,
  outfit_confidence: 'MEDIUM',
  suggestions_mode: 'B'
}
```

---

## Configuration

All tunable values in `config.ts`:

### Feature Flags

```typescript
FEATURE_FLAGS = {
  explanations_enabled: true,
  explanations_min_confidence: 'HIGH',
  explanations_allow_shoes: false,
  mode_b_strong_medium_fallback: true,
  silhouette_enabled: false  // v2
}
```

### Thresholds

```typescript
THRESHOLDS = {
  HIGH: 0.78,
  MEDIUM: 0.58,
  HIGH_SHOES: 0.82,
  NEAR_MATCH_STRONG_MEDIUM_MIN: 0.70
}
```

### Style Adjacency

Defines which style families are:
- **Natural neighbors** (+2): minimal↔classic, street↔athleisure
- **Compatible** (+1): minimal↔edgy, classic↔boho
- **Tension** (-1): preppy↔street, romantic↔athleisure
- **Opposing** (-2): formal↔athleisure, preppy↔edgy

---

## Integration Guide

### 1. Convert Wardrobe Items

Transform existing wardrobe items to `ConfidenceItem`:

```typescript
function toConfidenceItem(wardrobeItem: WardrobeItem): ConfidenceItem {
  return {
    id: wardrobeItem.id,
    category: mapCategory(wardrobeItem.category),
    color_profile: extractColorProfile(wardrobeItem),
    style_family: mapStyleFamily(wardrobeItem.styleVibes),
    formality_level: inferFormalityLevel(wardrobeItem),
    texture_type: inferTextureType(wardrobeItem),
    image_uri: wardrobeItem.imageUri,
    label: wardrobeItem.name
  };
}
```

### 2. Update AI Analysis

Extend OpenAI prompt to extract new signals:

```typescript
// Add to analysis output
{
  color_profile: {
    is_neutral: boolean,
    dominant_hue: number | null,
    saturation: 'low' | 'med' | 'high',
    value: 'low' | 'med' | 'high'
  },
  formality_level: 1 | 2 | 3 | 4 | 5,
  texture_type: 'smooth' | 'textured' | 'soft' | 'structured' | 'mixed'
}
```

### 3. Evaluate Outfit

```typescript
import { evaluateOutfit, enrichWithExplanation } from '@/lib/confidence-engine';

// Convert items
const targetItem = toConfidenceItem(scannedItem);
const wardrobeItems = wardrobe.map(toConfidenceItem);

// Evaluate
const evaluation = evaluateOutfit(targetItem, wardrobeItems);

// Use results
if (evaluation.show_matches_section) {
  // Show HIGH confidence matches
  const matchesWithExplanations = evaluation.matches.map(match =>
    enrichWithExplanation(match, targetItem, findItemById(match.item_b_id))
  );
}

if (evaluation.suggestions_mode === 'B') {
  // Generate Mode B styling tips
  const suggestions = generateOutfitModeBSuggestions(evaluation.near_matches);
}
```

### 4. Update Results UI

Map `OutfitEvaluation` to UI:

| Field | UI Element |
|-------|------------|
| `show_matches_section` | Show/hide wardrobe matches section |
| `matches` | List of matched items with confidence |
| `outfit_confidence` | Overall verdict (HIGH→great, MEDIUM→okay, LOW→risky) |
| `suggestions_mode` | A = missing pieces, B = styling tips |
| `best_match.explanation_*` | Explanation text for top match |

---

## Appendix: Complete Type Reference

See `src/lib/confidence-engine/types.ts` for full type definitions.

### PairEvaluation Output

```typescript
interface PairEvaluation {
  // Identity
  item_a_id: string;
  item_b_id: string;
  pair_type: PairType;

  // Scores
  raw_score: number;  // 0-1
  confidence_tier: ConfidenceTier;

  // Gating
  forced_tier: 'LOW' | null;
  hard_fail_reason: HardFailReason | null;
  cap_reasons: CapReason[];

  // Features
  features: FeatureSignals;

  // Explanation
  explanation_allowed: boolean;
  explanation_forbidden_reason: string | null;
  explanation_template_id: string | null;
  explanation_specificity_level: 1 | 2 | 3 | null;

  // Metadata
  both_statement: boolean;
  is_shoes_involved: boolean;
  high_threshold_used: 0.78 | 0.82;
  weights_used: Record<FeatureCode, number>;
}
```

### OutfitEvaluation Output

```typescript
interface OutfitEvaluation {
  show_matches_section: boolean;
  outfit_confidence: ConfidenceTier;
  best_match?: PairEvaluation;
  matches: PairEvaluation[];        // HIGH only, ranked
  near_matches: PairEvaluation[];   // For Mode B
  suggestions_mode: 'A' | 'B';
}
```
