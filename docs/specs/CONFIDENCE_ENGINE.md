# Confidence Engine - Complete Documentation

A deterministic, rules-based confidence scoring system for outfit matching. The engine reasons about how clothes are worn together, not whether they're stylish.

> **Core Philosophy**: "Silence is a trust-preserving feature, not a failure state."

---

## Table of Contents

1. [Overview](#overview)
2. [Terminology](#terminology)
3. [Architecture](#architecture)
4. [Data Types](#data-types)
5. [Feature Signals](#feature-signals)
6. [Scoring System](#scoring-system)
7. [Gating System](#gating-system)
8. [Tier Mapping](#tier-mapping)
9. [Suggestions System](#suggestions-system)
10. [Explanations System](#explanations-system)
11. [Configuration](#configuration)
12. [Integration Guide](#integration-guide)
13. [Analytics](#analytics)
14. [Worked Example](#worked-example)

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

## Terminology

| Term | Definition |
|------|------------|
| **raw_score** | A 0-1 value computed from weighted feature signals. NOT the same as confidence. |
| **tier** | The final confidence level: HIGH, MEDIUM, or LOW. Derived from raw_score + gates. |
| **caps** | Soft constraints that limit max tier to MEDIUM (e.g., formality tension). Score unchanged. |
| **hard fails** | Deal-breakers that force tier to LOW regardless of score. |
| **near-match** | A MEDIUM tier result that was close to HIGH (capped or strong score ≥0.70). |
| **Mode A** | "What to add" suggestions. When HIGH exists: optional/light. When no matches: constructive guidance. |
| **Mode B** | "Make it work" styling tips - used when near-matches exist with actionable tensions. |

---

## Architecture

### Module Structure

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
├── integration.ts        # App type conversion
└── analytics.ts          # Event tracking
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI LAYER                                │
│                    (results.tsx screen)                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   useConfidenceEngine Hook                      │
│              (src/lib/useConfidenceEngine.ts)                   │
│                                                                 │
│  • Converts app types to engine types                           │
│  • Calls outfit evaluation                                      │
│  • Enriches results with explanations                           │
│  • Returns UI-ready data structure                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CONFIDENCE ENGINE                            │
│               (src/lib/confidence-engine/)                      │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Integration │  │    Outfit    │  │ Suggestions  │          │
│  │    Layer     │──│  Evaluation  │──│   (Mode A/B) │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                 │                                     │
│         ▼                 ▼                                     │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │     Pair     │  │   Feature    │                            │
│  │  Evaluation  │──│   Signals    │                            │
│  └──────────────┘  └──────────────┘                            │
│         │                 │                                     │
│         ▼                 ▼                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │    Gates     │  │   Scoring    │  │    Tiers     │          │
│  │ (Hard/Soft)  │  │  (Weights)   │  │  (Thresholds)│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Evaluation Pipeline

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

**Convention:** Both app types and engine types use **plural** category names (`tops`, `bottoms`, etc.) for consistency across the integration layer.

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

### PairType

Valid clothing pair combinations:

```typescript
type PairType =
  | 'tops_bottoms'
  | 'tops_shoes'
  | 'tops_outerwear'
  | 'bottoms_shoes'
  | 'bottoms_outerwear'
  | 'shoes_outerwear'
  | 'dresses_shoes'
  | 'dresses_outerwear'
  | 'skirts_tops'
  | 'skirts_shoes'
  | 'skirts_outerwear';
```

---

## Feature Signals

Each pair of items is evaluated across 6 feature dimensions. Each returns a value from -2 to +2.

**Important:** All feature values are integers in the set {-2, -1, 0, +1, +2}. No half-steps.

### C - Color Compatibility

Evaluates hue distance, neutral pairing, and saturation/value modifiers.

| Condition | Score |
|-----------|-------|
| Both neutrals | +2 |
| One neutral + one chromatic | +1 |
| Same/analogous hue (≤30°) | +2 |
| Complementary (150-180°) | +2 |
| Split-complementary (120-150°) | +1 |
| Triadic (90-120°) | 0 |
| Awkward (45-90°) | -1 |
| Near-clash (30-45°) | -2 |

**Modifiers (applied before clamping to [-2, +2]):**
- Both high saturation: ±1 (amplifies positive/negative)
- Both low saturation: dampen toward 0
- High value contrast: +1 bonus

### S - Style Family Alignment

Uses adjacency map to determine style compatibility.

| Relationship | Score | Examples |
|--------------|-------|----------|
| Same family | +2 | minimal + minimal |
| Natural neighbors | +2 | minimal ↔ classic, street ↔ athleisure |
| Compatible | +1 | minimal ↔ edgy, classic ↔ boho |
| Neutral | 0 | (default) |
| Tension | -1 | preppy ↔ street, romantic ↔ athleisure |
| Opposing | -2 | formal ↔ athleisure, preppy ↔ edgy |

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
| Clash | -2 |
| Unknown | 0 |

### U - Usage/Context Alignment

Derived from formality and style. Weighted average: 60% formality, 40% style.

This feature captures whether items are meant for the same context (e.g., both for work, both for weekend).

### V - Silhouette Balance (v2, disabled)

Reserved for future volume/proportion analysis.

**Status:** Fully implemented but disabled via feature flag (`silhouette_enabled: false`).

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

**Unknown features contribute 0 weight (no contribution); weight is redistributed to known features.**

This is NOT the same as "neutral score" (0.5). Unknown features are removed from the scoring basis entirely.

```
Example:
- If Texture (T) is unknown with 15% weight
- T contributes nothing to the score
- Remaining 85% gets scaled to 100%
- Color 20% → ~23.5%
- Style 20% → ~23.5%
- etc.
```

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

**Process:**
1. Get base weights for pair type
2. Redistribute weights for unknown features
3. Normalize each feature value: [-2, +2] → [0, 1]
4. Compute weighted sum
5. Result: score between 0 and 1

---

## Gating System

Two-phase system that can override raw score.

**Canonical Rule:** All gates are expressed in terms of computed feature values (C, S, F, T, U) and booleans (isShoes). No gap-based logic in trigger conditions.

### Phase 1: Hard Fails → Force LOW

Deal-breakers that force tier to LOW regardless of score.

| Hard Fail | Trigger Condition (Canonical) |
|-----------|-------------------------------|
| `FORMALITY_CLASH_WITH_USAGE` | F == -2 AND U <= -1 |
| `STYLE_OPPOSITION_NO_OVERLAP` | S == -2 AND U <= -1 |
| `SHOES_TEXTURE_FORMALITY_CLASH` | isShoes AND T == -2 AND F <= -1 |

*Explanatory notes:*
- F == -2 corresponds to a 4-level formality gap (e.g., athleisure + formal)
- S == -2 means opposing style families (e.g., formal + athleisure)
- These hard fails require multiple negative signals, not just one bad dimension

### Phase 2: Soft Caps → Max MEDIUM

Tensions that cap the tier at MEDIUM (cannot reach HIGH).

| Cap Reason | Trigger Condition (Canonical) |
|------------|-------------------------------|
| `FORMALITY_TENSION` | F == 0 |
| `STYLE_TENSION` | S <= -1 |
| `COLOR_TENSION` | C <= -1 |
| `TEXTURE_CLASH` | T == -2 (excluded from Mode B) |
| `USAGE_MISMATCH` | U == -2 |
| `SHOES_CONFIDENCE_DAMPEN` | isShoes AND (F <= -1 OR S <= -1) |
| `MISSING_KEY_SIGNAL` | S.unknown AND T.unknown |

*Explanatory notes:*
- F == 0 corresponds to a 2-level formality gap
- Shoes alone do NOT trigger `SHOES_CONFIDENCE_DAMPEN` - requires signal tension

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

### Tier Determination Flow (Unambiguous)

```
1. If hard fail → tier = LOW (forced)
2. Compute maxTier: cap_reasons.length > 0 ? MEDIUM : HIGH
3. Apply thresholds:
   - if raw_score >= HIGH_THRESHOLD AND maxTier === HIGH → HIGH
   - else if raw_score >= MEDIUM_THRESHOLD → MEDIUM
   - else → LOW
```

**IMPORTANT:** Explanation eligibility uses the FINAL tier, never the pre-cap tier.

### Near-Match Detection

Used for Mode B suggestions:
- **Type 2a**: Would be HIGH but capped to MEDIUM (preferred)
- **Type 2b**: Strong MEDIUM (score ≥ 0.70), excludes T=-2

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
    { text: "Dark or structured bottoms", target: "bottoms" },
    { text: "Neutral everyday shoes", target: "shoes" },
    { text: "Light layer for balance", target: "outerwear" }
  ]
}
```

**Filtering (HIGH state only):**
- When HIGH matches exist, Mode A bullets are filtered by covered categories
- If `tops_bottoms` match exists and you scanned a top, then "bottoms" suggestions are filtered out
- Bullets with `target: null` are never filtered (generic advice)

**See also:** `docs/STYLE_AWARE_SUGGESTIONS_SPEC.md` for style-aware Mode A/B templates (V2)

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

**Cap Reason Priority:**
```
FORMALITY_TENSION: 5 (highest)
STYLE_TENSION: 4
COLOR_TENSION: 3
USAGE_MISMATCH: 2
SHOES_CONFIDENCE_DAMPEN: 1
TEXTURE_CLASH: 0 (excluded from Mode B)
MISSING_KEY_SIGNAL: 0
```

---

## Explanations System

Explanations are only shown for HIGH confidence matches to preserve trust.

### Eligibility Rules

✅ **Allowed when:**
- Feature flag enabled
- Confidence tier = HIGH (final tier, not pre-cap)
- Not forbidden by rules

❌ **Forbidden when:**
- Both items are statement pieces (high saturation OR strong style family OR formality ≥ 4)
- Shoes involved (flag disabled by default)
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

## Configuration

All tunable values in `src/lib/confidence-engine/config.ts`:

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

### Style Adjacency Map

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

### Integration Layer Functions

| Function | Purpose |
|----------|---------|
| `wardrobeItemToConfidenceItem()` | Converts wardrobe items |
| `scannedItemToConfidenceItem()` | Converts scanned items |
| `toColorProfile()` | Extracts color profile from hex colors |
| `toStyleFamily()` | Maps style vibes to style families |
| `inferFormalityLevel()` | Infers formality from category/style |
| `inferTextureType()` | Infers texture from style notes |

### Integration Validation

When mapping from app analysis → engine types, missing fields are handled as follows:

| Field | Fallback Behavior |
|-------|-------------------|
| `formality_level` | Inferred from category + style (always produces a value) |
| `style_family` | Set to `'unknown'` (S signal will be unknown) |
| `texture_type` | Set to `'unknown'` (T signal will be unknown) |
| `color_profile` | Required - hex color must be present for conversion |

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

## Worked Example

**Scenario:** User scans a neutral-colored t-shirt. Wardrobe has 3 items.

### Input:
- **Scanned item**: Neutral gray t-shirt, minimal style, formality=2, soft texture
- **Wardrobe item A**: Navy jeans, classic style, formality=2, structured texture
- **Wardrobe item B**: White sneakers, athleisure style, formality=1, smooth texture
- **Wardrobe item C**: Black blazer, formal style, formality=4, structured texture

### Evaluation:

**Pair 1: Top × Jeans (tops_bottoms)**
```
Features:
  C: +1 (neutral + chromatic navy)
  S: +2 (minimal ≈ classic, natural neighbors)
  F: +2 (same level 2)
  T: +2 (soft + structured = complementary)
  U: +2 (derived from F+S, both positive)

Raw score: 0.84 → HIGH threshold (0.78)
Caps: None
Final tier: HIGH ✓
```

**Pair 2: Top × Sneakers (tops_shoes)**
```
Features:
  C: +1 (neutral pairs well)
  S: +1 (minimal vs athleisure, compatible)
  F: +1 (2 vs 1, one level apart)
  T: 0 (soft vs smooth, neutral)
  U: +1 (compatible context)

Raw score: 0.69 → MEDIUM
Caps: None (F=+1, S=+1, no tension signals)
Final tier: MEDIUM
```

**Pair 3: Top × Blazer (tops_outerwear)**
```
Features:
  C: +1 (neutral pairs well)
  S: -1 (minimal vs formal, tension)
  F: 0 (2 vs 4, two levels apart)
  T: +2 (soft + structured)
  U: 0 (mixed context, rounded from weighted average)

Raw score: 0.56 → MEDIUM
Caps: FORMALITY_TENSION (F == 0), STYLE_TENSION (S <= -1)
Final tier: MEDIUM (capped)
Near-match? No (score < 0.70)
```

### Output:
```
outfit_confidence: HIGH (1 HIGH match, no LOW)
show_matches_section: true
matches: [Pair 1 (jeans)]
near_matches: []
suggestions_mode: 'A' (HIGH exists, so suggestions are optional)
```

### UI Result:
- Shows "Matches in your wardrobe" with jeans
- Mode A suggestions shown but optional (user already has a good match)

---

## Key Design Decisions

1. **Deterministic**: No randomness in core scoring (only in template selection)
2. **Conservative**: Prefers silence over wrong suggestions
3. **Shoes are special**: Higher thresholds, dampened only with signal tension
4. **Unknown features are removed**: They contribute 0 weight, redistributed to known features
5. **Gates override scores**: Hard rules can force tiers regardless of score
6. **Weight redistribution**: Unknown features don't create gaps in scoring
7. **Category-aware**: Different pair types have different weights
8. **Final tier matters**: Explanation eligibility uses post-cap tier
9. **Integer feature values**: All signals use discrete integers {-2, -1, 0, +1, +2} for consistency
10. **Canonical gate triggers**: All gates use feature values (C/S/F/T/U) and booleans only, no gap-based logic

---

## Complete Type Reference

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

### ConfidenceEngineResult (UI Layer)

```typescript
interface ConfidenceEngineResult {
  evaluated: boolean;
  outfitConfidence: ConfidenceTier;
  showMatchesSection: boolean;
  matches: EnrichedMatch[];
  bestMatch: EnrichedMatch | null;
  suggestionsMode: 'A' | 'B';
  modeASuggestions: { intro: string; bullets: string[] } | null;
  modeBSuggestions: { intro: string; bullets: string[] } | null;
  rawEvaluation: OutfitEvaluation | null;
}
```

---

## Related Documentation

- [Disabled & Planned Features](DISABLED_AND_PLANNED_FEATURES.md) - Feature flags and roadmap
- [Style-Aware Suggestions Spec](../STYLE_AWARE_SUGGESTIONS_SPEC.md) - Mode A/B V2 templates with style-aware copy
- [Comprehensive System Documentation](../../COMPREHENSIVE_SYSTEM_DOCUMENTATION.md) - Full system guide

---

**Last Updated:** January 29, 2026
