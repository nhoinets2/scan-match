# Confidence Engine Documentation

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

## Overview

The Confidence Engine is a **deterministic, rules-based scoring system** that evaluates how well clothing items work together. Unlike subjective fashion advice, the engine reasons about **how clothes are worn** rather than whether they're "stylish."

### Core Philosophy

> "Silence is a trust-preserving feature, not a failure state."

When the engine isn't confident about a pairing, it stays silent rather than making potentially wrong suggestions. This approach builds user trust over time.

---

## Architecture Overview

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

---

## Module Breakdown

### 1. Types (`types.ts`)

Defines all TypeScript interfaces and types used throughout the engine.

#### Key Types:

| Type | Description |
|------|-------------|
| `Category` | Clothing categories: tops, bottoms, shoes, outerwear, dresses, skirts, accessories, bags (plural form) |
| `PairType` | Valid clothing pair combinations (e.g., `tops_bottoms`, `tops_shoes`) |
| `StyleFamily` | Style aesthetics: minimal, classic, street, athleisure, romantic, edgy, boho, preppy, formal |
| `ConfidenceItem` | Engine's internal representation of a clothing item |
| `FeatureSignals` | Computed compatibility signals (C, S, F, T, U, V) |
| `ConfidenceTier` | Output tiers: HIGH, MEDIUM, LOW |
| `PairEvaluation` | Complete evaluation result for a pair of items |
| `OutfitEvaluation` | Aggregated results for entire outfit |

#### Category Convention:
Both app types and engine types use **plural** category names (`tops`, `bottoms`, etc.). This ensures consistency across the integration layer.

#### ConfidenceItem Structure:
```typescript
interface ConfidenceItem {
  id: string;
  category: Category;
  color_profile: ColorProfile;      // Neutral/hue/saturation/value
  style_family: StyleFamily;        // Aesthetic category
  formality_level: FormalityLevel;  // 1-5 scale
  texture_type: TextureType;        // smooth/textured/soft/structured
  silhouette_profile?: SilhouetteProfile; // Volume + length (v2)
}
```

---

### 2. Configuration (`config.ts`)

Central configuration for all engine parameters.

#### Feature Flags:
```typescript
FEATURE_FLAGS = {
  explanations_enabled: true,
  explanations_min_confidence: 'HIGH',
  explanations_allow_shoes: false,      // Shoes are contentious
  mode_b_strong_medium_fallback: true,
  silhouette_enabled: false,            // v2 feature
}
```

#### Thresholds:
| Threshold | Value | Description |
|-----------|-------|-------------|
| HIGH | 0.78 | Score needed for HIGH confidence |
| HIGH_SHOES | 0.82 | Stricter threshold when shoes involved |
| MEDIUM | 0.58 | Score needed for MEDIUM confidence |
| NEAR_MATCH_STRONG_MEDIUM_MIN | 0.70 | For Mode B suggestions |

#### Feature Weights by Pair Type:
Different clothing combinations have different weight distributions:

```
Default weights:
  C (Color):     20%
  S (Style):     20%
  F (Formality): 25%
  T (Texture):   15%
  U (Usage):     20%

Shoes pairs have adjusted weights:
  U (Usage) increased to 30%
  T (Texture) decreased to 10%
```

#### Style Family Adjacency Map:
Defines how style families relate to each other:

| Relationship | Score | Example Pairs |
|-------------|-------|---------------|
| Natural neighbors | +2 | minimal-classic, street-athleisure |
| Compatible | +1 | minimal-edgy, classic-boho |
| Tension | -1 | preppy-street, formal-boho |
| Opposing | -2 | formal-athleisure, preppy-edgy |

---

### 3. Integration Layer (`integration.ts`)

Bridges app types (WardrobeItem, ScannedItem) to engine types (ConfidenceItem).

#### Key Functions:

| Function | Purpose |
|----------|---------|
| `wardrobeItemToConfidenceItem()` | Converts wardrobe items |
| `scannedItemToConfidenceItem()` | Converts scanned items |
| `toColorProfile()` | Extracts color profile from hex colors |
| `toStyleFamily()` | Maps style vibes to style families |
| `inferFormalityLevel()` | Infers formality from category/style |
| `inferTextureType()` | Infers texture from style notes |

#### Color Profile Extraction:
- Converts hex color to HSV values
- Determines if color is neutral (low saturation)
- Maps saturation/value to low/med/high levels

#### Integration Validation:
When mapping from app analysis → engine types, missing fields are handled as follows:

| Field | Fallback Behavior |
|-------|-------------------|
| `formality_level` | Inferred from category + style (always produces a value) |
| `style_family` | Set to `'unknown'` (S signal will be unknown) |
| `texture_type` | Set to `'unknown'` (T signal will be unknown) |
| `color_profile` | Required - hex color must be present for conversion |

---

### 4. Feature Signals (`signals.ts`)

Computes individual compatibility signals for a pair of items.

#### The Six Features:

| Code | Name | Range | Known When |
|------|------|-------|------------|
| **C** | Color | -2 to +2 (integers) | Always (color required) |
| **S** | Style | -2 to +2 (integers) | Both styles known |
| **F** | Formality | -2 to +2 (integers) | Always (formality required) |
| **T** | Texture | -2 to +2 (integers) | Both textures known |
| **U** | Usage | -2 to +2 (integers) | Always (uses formality fallback when style unknown) |
| **V** | Silhouette | -2 to +2 (integers) | v2 feature (disabled) |

**Important:** All feature values are integers in the set {-2, -1, 0, +1, +2}. No half-steps.

#### Signal Computation Examples:

**Color (C):**
- Both neutrals: +2
- One neutral + one chromatic: +1
- Same/analogous hue (≤30°): +2
- Complementary (150-180°): +2
- Split-complementary (120-150°): +1
- Triadic (90-120°): 0
- Awkward (45-90°): -1
- Near-clash (30-45°): -2

*Modifiers (applied before clamping to [-2, +2]):*
- Both high saturation: ±1 (amplifies positive/negative)
- Both low saturation: dampen toward 0
- High value contrast: +1 bonus

**Style (S):**
- Same family: +2
- Natural neighbors: +2
- Compatible: +1
- Tension: -1
- Opposing: -2

**Formality (F):**
- Same level: +2
- 1 level apart: +1
- 2 levels apart: 0
- 3 levels apart: -1
- 4 levels apart: -2

---

### 5. Scoring (`scoring.ts`)

Computes weighted raw score from feature signals.

#### Unknown Feature Handling:
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

#### Raw Score Calculation:
1. Get base weights for pair type
2. Redistribute weights for unknown features
3. Normalize each feature value: [-2, +2] → [0, 1]
4. Compute weighted sum
5. Result: score between 0 and 1

---

### 6. Gates (`gates.ts`)

Two-phase gating system that can override raw scores.

**Canonical Rule:** All gates are expressed in terms of computed feature values (C, S, F, T, U) and booleans (isShoes). No gap-based logic in trigger conditions.

#### Phase 1: Hard Fails (Force LOW)

| Hard Fail | Trigger Condition (Canonical) |
|-----------|-------------------------------|
| `FORMALITY_CLASH_WITH_USAGE` | F == -2 AND U <= -1 |
| `STYLE_OPPOSITION_NO_OVERLAP` | S == -2 AND U <= -1 |
| `SHOES_TEXTURE_FORMALITY_CLASH` | isShoes AND T == -2 AND F <= -1 |

*Explanatory notes:*
- F == -2 corresponds to a 4-level formality gap (e.g., athleisure + formal)
- S == -2 means opposing style families (e.g., formal + athleisure)
- These hard fails require multiple negative signals, not just one bad dimension

#### Phase 2: Soft Caps (Cap at MEDIUM)

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

### 7. Tiers (`tiers.ts`)

Maps raw scores to confidence tiers.

#### Tier Determination Flow (Unambiguous):
```
1. If hard fail → tier = LOW (forced)
2. Compute maxTier: cap_reasons.length > 0 ? MEDIUM : HIGH
3. Apply thresholds:
   - if raw_score >= HIGH_THRESHOLD AND maxTier === HIGH → HIGH
   - else if raw_score >= MEDIUM_THRESHOLD → MEDIUM
   - else → LOW
```

**IMPORTANT:** Explanation eligibility uses the FINAL tier, never the pre-cap tier.

#### Near-Match Detection:
Used for Mode B suggestions:
- **Type 2a**: Would be HIGH but capped to MEDIUM (preferred)
- **Type 2b**: Strong MEDIUM (score ≥ 0.70), excludes T=-2

---

### 8. Pair Evaluation (`pair-evaluation.ts`)

Core function that evaluates a single pair of items.

#### Evaluation Pipeline:
```
1. Determine pair type (tops_bottoms, etc.)
2. Check if shoes involved
3. Compute feature signals
4. Compute raw score with weights
5. Evaluate gates (hard fails, soft caps)
6. Map to confidence tier
7. Detect statement pieces
8. Return complete PairEvaluation
```

#### Output Structure:
```typescript
interface PairEvaluation {
  item_a_id: string;
  item_b_id: string;
  pair_type: PairType;
  raw_score: number;            // 0-1
  confidence_tier: ConfidenceTier;
  forced_tier: 'LOW' | null;
  hard_fail_reason: HardFailReason | null;
  cap_reasons: CapReason[];
  features: FeatureSignals;
  explanation_allowed: boolean;
  is_shoes_involved: boolean;
  high_threshold_used: 0.78 | 0.82;
  weights_used: Record<FeatureCode, number>;
}
```

---

### 9. Outfit Evaluation (`outfit-evaluation.ts`)

Aggregates pair evaluations into outfit-level results.

#### Aggregation Rules:
1. Evaluate all pairs (scanned item × wardrobe items)
2. Separate by tier (HIGH, MEDIUM, LOW)
3. Calculate outfit confidence
4. Show matches section only if HIGH matches exist
5. Select near-matches for Mode B
6. Determine suggestions mode

#### Outfit Confidence Logic:
```
- high >= 2 → HIGH
- high == 1 AND no LOW (not risky) → HIGH
- high == 1 AND has LOW (risky) → MEDIUM
- medium > 0 (no high) → MEDIUM
- all LOW → LOW
```

---

### 10. Suggestions (`suggestions.ts`)

Generates styling guidance based on evaluation results.

#### Mode A: "What to Add"
- Used when wardrobe is empty, no matches found, OR HIGH matches exist
- When HIGH matches exist, Mode A is **optional** (light suggestions, not urgent)
- When no matches exist, Mode A provides constructive guidance
- Category-specific templates suggest complementary pieces
- Example for tops: "Dark or structured bottoms", "Neutral everyday shoes"

#### Mode B: "Make It Work"
- Used when near-matches exist (capped HIGH or strong MEDIUM)
- Only when NO HIGH matches exist
- Generated from aggregated cap reasons
- Example for formality tension: "Keep the rest of the outfit at the same level of dressiness"

#### Cap Reason Priority:
```
FORMALITY_TENSION: 5 (highest)
STYLE_TENSION: 4
COLOR_TENSION: 3
USAGE_MISMATCH: 2
SHOES_CONFIDENCE_DAMPEN: 1
TEXTURE_CLASH: 0 (excluded from Mode B)
```

---

### 11. Explanations (`explanations.ts`)

Generates natural language explanations for matches.

#### Eligibility Rules:
- Must be HIGH confidence (final tier, not pre-cap)
- Explanations must be enabled
- Shoes explanations disabled by default
- No "statement + statement" combinations
- No style opposition pairs

#### Template Selection:
- Pair-type specific templates preferred
- Falls back to generic templates
- Three specificity levels (1=abstract, 2=soft, 3=concrete)

---

## UI Integration

### The useConfidenceEngine Hook

Location: `src/lib/useConfidenceEngine.ts`

#### Input:
```typescript
function useConfidenceEngine(
  scannedItem: ScannedItem | null,
  wardrobeItems: WardrobeItem[],
  analysisResult?: ClothingAnalysisResult
): ConfidenceEngineResult
```

#### Output:
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

### Results Screen Integration

Location: `src/app/results.tsx`

The results screen uses the confidence engine result to:

1. **Show Matches Section**: Only displayed if `showMatchesSection: true`
2. **Build Wardrobe Match Rows**: Uses `confidenceResult.matches` with explanations
3. **Show Styling Suggestions**: Uses either Mode A or Mode B suggestions
4. **Display Appropriate Icons**: Parses suggestion text to show category icons

#### UI Decision Flow:
```
confidenceResult.evaluated = true?
├── YES: Use engine results
│   ├── showMatchesSection = true?
│   │   └── Display "Matches in your wardrobe" with items
│   │
│   └── suggestionsMode?
│       ├── 'A': Show Mode A suggestions (what to add)
│       └── 'B': Show Mode B suggestions (styling tips)
│
└── NO: Fall back to legacy matching engine
```

---

## Confidence Tier Summary

| Tier | UI Display | Matches Shown | Suggestions |
|------|------------|---------------|-------------|
| **HIGH** | "Looks like a good match" | Yes | Mode A (optional - user already has good matches) |
| **MEDIUM** | "Could work with the right pieces" | No | Mode B (styling tips to make it work) |
| **LOW** | "Might feel tricky to style" | No | Mode A (what to add to your wardrobe) |

---

## File Structure

```
src/lib/confidence-engine/
├── index.ts           # Main exports
├── types.ts           # Type definitions
├── config.ts          # Configuration & templates
├── utils.ts           # Helper functions
├── signals.ts         # Feature signal computation
├── scoring.ts         # Raw score calculation
├── gates.ts           # Hard/soft gates
├── tiers.ts           # Tier mapping
├── pair-evaluation.ts # Single pair evaluation
├── outfit-evaluation.ts # Outfit aggregation
├── suggestions.ts     # Mode A/B generation
├── explanations.ts    # Natural language output
├── integration.ts     # App type conversion
└── analytics.ts       # Event tracking
```

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
