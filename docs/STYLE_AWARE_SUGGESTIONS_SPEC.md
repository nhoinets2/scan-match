# Style-Aware Suggestions System - Final Specification

> **Version:** 1.0
> **Status:** Ready for Implementation
> **Last Updated:** 2024

---

## Table of Contents

1. [Goal](#goal)
2. [Key Constraints](#key-constraints)
3. [Architecture Overview](#architecture-overview)
4. [Key Design Decisions](#key-design-decisions)
5. [File Changes](#file-changes)
6. [Tests](#tests)
7. [Summary](#summary)

---

## Goal

Make Mode A (Missing Pieces) and Mode B (Styling Tips) suggestions **style-aware** and **deterministic** without changing CE scoring, tiers, or evaluation logic.

- **Mode A**: Structured bullets with `{ text, target }`, now with optional style-specific copy
- **Mode B**: Text-only bullets derived from CapReason(s) with deterministic selection (NO `Math.random`)

---

## Key Constraints

1. **No type duplication** - Import from existing sources:
   - `StyleVibe`, `Category` → `src/lib/types.ts`
   - `StyleFamily`, `CapReason`, `SuggestionBullet`, `SuggestionTargetCategory` → `src/lib/confidence-engine/types.ts`

2. **Single integration point** - `useConfidenceEngine.ts` generates suggestions; `results-ui-policy.ts` remains a pure consumer

3. **No CE changes** - Scoring, tiers, and evaluation logic unchanged

4. **Backward compatible** - Existing `SuggestionBullet` shape preserved, optional params with defaults

5. **Deterministic** - Remove all `Math.random()` from Mode B

---

## Architecture Overview

```
useConfidenceEngine.ts (INTEGRATION POINT)
    │
    ├── Computes vibe ONCE via resolveUiVibeForCopy()
    │
    ├── Calls generateModeASuggestions(category, vibe)
    │   └── Uses MODE_A_TEMPLATES_V2 internally
    │   └── Outputs existing SuggestionBullet[] shape
    │
    └── Calls generateModeBSuggestions(capReasons, vibe)
        └── Uses buildModeBBullets() internally (deterministic)
        └── Outputs string[]

results-ui-policy.ts (NO CHANGES)
    └── Consumes ConfidenceEngineResult as-is
```

---

## Key Design Decisions

### 1. Integration Point

**Decision:** Compute `uiVibeForCopy` once inside `useConfidenceEngine.ts` (where `analysisResult` is available).

**Rationale:**
- Single source of truth for suggestion generation
- All required inputs available (`styleTags`, `styleNotes`, `explicitStyleFamily`)
- `results-ui-policy.ts` remains a pure consumer
- Avoids threading `analysisResult` anywhere else

**Optional Enhancement:** Add `resolvedUiVibe?: StyleVibe` to `ConfidenceEngineResult` for debugging/telemetry/UI experiments.

### 2. styleNotes Type

**Decision:** `resolveUiVibeForCopy({ styleNotes })` accepts `string[] | null | undefined`.

Internally join for keyword-based resolution:
```typescript
const notes = Array.isArray(styleNotes) ? styleNotes.join(" ") : "";
```

No caller-side joining required.

### 3. Explicit Style Family Source

**Decision:** `explicitStyleFamily` comes from:
```typescript
analysisResult?.confidenceSignals?.style_family
```

- Do NOT store signals on `ScannedItem` for v1
- If `analysisResult.confidenceSignals` doesn't exist, `explicitStyleFamily = null` and we fall back to tags/notes

### 4. Classic → Casual Mapping (Critical Fix)

**Problem:** Round-trip loss where `casual → classic (family) → office (vibe)` would incorrectly turn casual into office.

**Solution for copy only:**
```typescript
STYLE_FAMILY_TO_UI_VIBE = {
  classic: 'casual',  // Safe default
  preppy: 'office',
  formal: 'office',
  // ...
}
```

**Rules:**
- `classic` maps to `casual` (not `office`) because classic in CE is a catch-all for everyday/versatile items
- Office-flavored copy only appears when explicitly indicated via:
  - `styleTags` contains `'office'` (handled by `VIBE_PRIORITY`)
  - OR `explicitStyleFamily` is `'formal'` or `'preppy'`

**Casual Intent Preservation:**
- If tags are all casual, always return `casual` (even if explicit family is `classic`)

### 5. CapReason Tie-Breaker

**Decision:** Use a fixed order array as tie-breaker with guard for unknown reasons:

```typescript
const getStableOrder = (r: CapReason): number => {
  const idx = CAP_REASON_STABLE_ORDER.indexOf(r);
  return idx === -1 ? 999 : idx; // Unknown reasons sort last
};
```

- Still exclude `TEXTURE_CLASH` using `MODE_B_CONFIG.excluded_reasons`
- Unknown reasons (if any new ones are added) sort to the end safely

### 6. reasons_used Accuracy

**Decision:** Track which reasons actually contributed bullets, not just "top 3 present":

```typescript
// Track during iteration
if (contributedFromThisReason) {
  reasonsUsed.push(reason);
}
```

This is truthful for analytics/debugging.

### 7. MODE_B_CONFIG.excluded_reasons Handling

**Decision:** Handle both Set and Array defensively:

```typescript
const excludedSet = new Set(MODE_B_CONFIG.excluded_reasons);
const validReasons = capReasons.filter(r => !excludedSet.has(r));
```

### 8. Export Strategy

**Public API (export from index.ts):**
- `resolveUiVibeForCopy`
- `generateModeASuggestions`
- `generateModeBSuggestions`
- `generateOutfitModeBSuggestions`
- `VIBE_PRIORITY` (useful for UI)
- `STYLE_FAMILY_TO_UI_VIBE` (useful for UI)

**Internal (NOT exported from index.ts):**
- `MODE_A_TEMPLATES_V2`
- `MODE_B_COPY_BY_REASON`
- `CAP_REASON_STABLE_ORDER`
- `buildModeBBullets`
- `resolveModeABulletsFromTemplate`

Tests can import directly from specific files if needed.

---

## File Changes

### 1. `src/lib/confidence-engine/integration.ts`

**Add imports:**
```typescript
import type { StyleVibe } from '../types';
import type { StyleFamily } from './types';
```

**Add exports:**

```typescript
/**
 * Priority order for deterministic vibe selection from multiple tags.
 * Higher priority vibes appear first; casual is lowest priority.
 */
export const VIBE_PRIORITY: StyleVibe[] = [
  'office',
  'minimal',
  'street',
  'feminine',
  'sporty',
  'casual',
];

/**
 * Reverse mapping from CE StyleFamily to UI StyleVibe for copy generation.
 *
 * NOTE: 'classic' maps to 'casual' (not 'office') because classic in CE
 * is a catch-all for everyday/versatile items. Office-flavored copy only
 * appears when explicitly indicated via 'office' tag or 'formal'/'preppy' family.
 */
export const STYLE_FAMILY_TO_UI_VIBE: Record<StyleFamily, StyleVibe> = {
  romantic: 'feminine',
  boho: 'feminine',
  minimal: 'minimal',
  athleisure: 'sporty',
  street: 'street',
  edgy: 'street',
  preppy: 'office',
  formal: 'office',
  classic: 'casual', // Safe default - see note above
  unknown: 'casual',
};

/**
 * Resolve UI vibe for suggestion COPY generation only.
 *
 * IMPORTANT: This does NOT affect CE scoring or matching.
 * The vibe determines which text variation to use for Mode A/B bullets.
 *
 * Rules:
 * 1. Preserve "casual intent" - if all tags are casual, return casual
 * 2. explicitStyleFamily (from AI analysis) takes precedence when present
 * 3. styleTags use VIBE_PRIORITY for deterministic selection
 * 4. Fall back to toStyleFamily() for keyword matching
 */
export function resolveUiVibeForCopy(args: {
  styleTags?: StyleVibe[] | null;
  styleNotes?: string[] | null;
  explicitStyleFamily?: StyleFamily | null;
}): StyleVibe {
  const { styleTags, styleNotes, explicitStyleFamily } = args;

  // Determine casual intent: all tags are 'casual'
  const casualIntent =
    styleTags != null &&
    styleTags.length > 0 &&
    styleTags.every((t) => t === 'casual');

  // 1. If explicit style family provided and not unknown
  if (explicitStyleFamily != null && explicitStyleFamily !== 'unknown') {
    // Preserve casual intent even with classic family
    if (explicitStyleFamily === 'classic' && casualIntent) {
      return 'casual';
    }
    return STYLE_FAMILY_TO_UI_VIBE[explicitStyleFamily];
  }

  // 2. If styleTags exist, use priority-based selection
  if (styleTags != null && styleTags.length > 0) {
    // Find first vibe in VIBE_PRIORITY that exists in styleTags
    for (const vibe of VIBE_PRIORITY) {
      if (styleTags.includes(vibe)) {
        return vibe;
      }
    }
    // Fallback (shouldn't happen if VIBE_PRIORITY covers all StyleVibes)
    return styleTags[0];
  }

  // 3. Fall back to keyword matching via existing toStyleFamily
  // Join styleNotes array for keyword matching
  const notesForMatching = Array.isArray(styleNotes)
    ? styleNotes
    : undefined;

  const family = toStyleFamily(styleTags ?? undefined, notesForMatching);

  // Preserve casual intent (edge case: mostly redundant but safe)
  if (family === 'classic' && casualIntent) {
    return 'casual';
  }

  return STYLE_FAMILY_TO_UI_VIBE[family];
}
```

---

### 2. `src/lib/confidence-engine/config.ts`

**Add imports:**
```typescript
import type { StyleVibe, Category } from '../types';
import type { CapReason, SuggestionTargetCategory } from './types';
```

**Add internal types (not exported to preserve SuggestionBullet shape):**

```typescript
/**
 * Enhanced bullet with stable key and optional style overrides.
 * Internal only - output is converted to standard SuggestionBullet.
 */
interface EnhancedSuggestionBullet {
  key: string;
  text: string;
  target: SuggestionTargetCategory;
  textByStyle?: Partial<Record<StyleVibe, string>>;
}

interface ModeATemplateV2 {
  intro: string;
  bullets: EnhancedSuggestionBullet[];
}

interface ModeBBullet {
  key: string;
  text: string;
  textByStyle?: Partial<Record<StyleVibe, string>>;
}

// Export the template type for internal use in suggestions.ts
export type { ModeATemplateV2, EnhancedSuggestionBullet, ModeBBullet };
```

**Add Mode A V2 templates:**

```typescript
/**
 * Mode A templates with stable keys and optional style-aware copy.
 *
 * Keys are namespaced: CATEGORY__DESCRIPTION
 * textByStyle overrides are optional - falls back to default text.
 */
export const MODE_A_TEMPLATES_V2: Record<Category | 'default', ModeATemplateV2> = {
  tops: {
    intro: 'To make this item easy to wear:',
    bullets: [
      {
        key: 'TOPS__BOTTOMS_DARK_STRUCTURED',
        text: 'Dark or structured bottoms',
        target: 'bottoms',
        textByStyle: {
          office: 'Tailored trousers or a polished skirt',
          minimal: 'Clean-line trousers in a tonal neutral',
          street: 'Relaxed cargo pants or straight-leg jeans',
        },
      },
      {
        key: 'TOPS__SHOES_NEUTRAL',
        text: 'Neutral everyday shoes',
        target: 'shoes',
        textByStyle: {
          office: 'Loafers or simple flats',
          minimal: 'Sleek low-profile sneakers or flats',
          street: 'Clean white sneakers or utility boots',
        },
      },
      {
        key: 'TOPS__OUTERWEAR_LIGHT_LAYER',
        text: 'Light layer for balance',
        target: 'outerwear',
        textByStyle: {
          office: 'A structured blazer or tailored jacket',
          minimal: 'A streamlined coat or simple cardigan',
          street: 'An oversized jacket or zip-up hoodie',
        },
      },
    ],
  },
  bottoms: {
    intro: 'To complete this look:',
    bullets: [
      {
        key: 'BOTTOMS__TOP_NEUTRAL_SIMPLE',
        text: 'Simple top in a neutral tone',
        target: 'tops',
        textByStyle: {
          office: 'A crisp button-down or polished blouse',
          minimal: 'A clean tee or sleek knit top',
          street: 'A relaxed graphic tee or oversized shirt',
        },
      },
      {
        key: 'BOTTOMS__SHOES_EVERYDAY',
        text: "Everyday shoes that don't compete",
        target: 'shoes',
        textByStyle: {
          office: 'Classic loafers or understated heels',
          minimal: 'Simple leather sneakers or ballet flats',
          street: 'Clean sneakers or chunky boots',
        },
      },
      {
        key: 'BOTTOMS__OUTERWEAR_OPTIONAL',
        text: 'Optional outer layer for structure',
        target: 'outerwear',
        textByStyle: {
          office: 'A tailored blazer or trench coat',
          minimal: 'A sleek jacket or structured cardigan',
          street: 'A bomber jacket or denim layer',
        },
      },
    ],
  },
  shoes: {
    intro: 'This works best with:',
    bullets: [
      {
        key: 'SHOES__TOP_RELAXED',
        text: 'Relaxed everyday top',
        target: 'tops',
        textByStyle: {
          office: 'A tucked blouse or fitted knit',
          minimal: 'A simple tee or clean sweater',
          street: 'An oversized tee or hoodie',
        },
      },
      {
        key: 'SHOES__BOTTOMS_STRUCTURED',
        text: 'Simple structured bottoms',
        target: 'bottoms',
        textByStyle: {
          office: 'Tailored trousers or a pencil skirt',
          minimal: 'Straight-leg pants in a neutral tone',
          street: 'Relaxed jeans or cargo pants',
        },
      },
      {
        key: 'SHOES__OUTERWEAR_MINIMAL',
        text: 'Minimal layering',
        target: 'outerwear',
        textByStyle: {
          office: 'A structured coat or classic blazer',
          minimal: 'A simple jacket or lightweight layer',
          street: 'A utility jacket or oversized outer layer',
        },
      },
    ],
  },
  outerwear: {
    intro: 'This pairs well with:',
    bullets: [
      {
        key: 'OUTERWEAR__TOP_BASE',
        text: 'Easy base layer',
        target: 'tops',
        textByStyle: {
          office: 'A button-down or fine-knit sweater',
          minimal: 'A fitted tee or simple turtleneck',
          street: 'A graphic tee or relaxed hoodie',
        },
      },
      {
        key: 'OUTERWEAR__BOTTOMS_BALANCED',
        text: 'Balanced bottoms',
        target: 'bottoms',
        textByStyle: {
          office: 'Tailored trousers or a midi skirt',
          minimal: 'Clean straight-leg pants',
          street: 'Relaxed jeans or wide-leg pants',
        },
      },
      {
        key: 'OUTERWEAR__SHOES_SIMPLE',
        text: 'Simple shoes',
        target: 'shoes',
        textByStyle: {
          office: 'Loafers or ankle boots',
          minimal: 'Low-profile sneakers or simple flats',
          street: 'Chunky sneakers or combat boots',
        },
      },
    ],
  },
  dresses: {
    intro: 'To complete this look:',
    bullets: [
      {
        key: 'DRESSES__SHOES_SIMPLE',
        text: "Simple shoes that don't compete",
        target: 'shoes',
        textByStyle: {
          office: 'Classic pumps or elegant flats',
          minimal: 'Sleek sandals or simple mules',
          street: 'Clean sneakers or ankle boots',
          feminine: 'Ballet flats or delicate heeled sandals',
        },
      },
      {
        key: 'DRESSES__OUTERWEAR_LIGHT',
        text: 'Light outer layer for cooler moments',
        target: 'outerwear',
        textByStyle: {
          office: 'A tailored blazer or structured cardigan',
          minimal: 'A simple trench or lightweight coat',
          street: 'A denim jacket or oversized blazer',
          feminine: 'A soft cardigan or cropped jacket',
        },
      },
      {
        key: 'DRESSES__ACCESSORIES_MINIMAL',
        text: 'Minimal accessories',
        target: 'accessories',
        textByStyle: {
          office: 'Simple jewelry and a structured bag',
          minimal: 'One understated piece',
          street: 'A cap or simple chain',
          feminine: 'Delicate jewelry or a small bag',
        },
      },
    ],
  },
  skirts: {
    intro: 'To make this item easy to wear:',
    bullets: [
      {
        key: 'SKIRTS__TOP_COMPLEMENTARY',
        text: 'Simple top in a complementary tone',
        target: 'tops',
        textByStyle: {
          office: 'A tucked blouse or structured knit',
          minimal: 'A fitted tee or simple tank',
          street: 'A cropped tee or relaxed button-down',
          feminine: 'A soft blouse or fitted top',
        },
      },
      {
        key: 'SKIRTS__SHOES_EVERYDAY',
        text: 'Everyday shoes',
        target: 'shoes',
        textByStyle: {
          office: 'Loafers or kitten heels',
          minimal: 'Simple flats or low sneakers',
          street: 'Chunky sneakers or boots',
          feminine: 'Ballet flats or strappy sandals',
        },
      },
      {
        key: 'SKIRTS__OUTERWEAR_OPTIONAL',
        text: 'Optional light layer',
        target: 'outerwear',
        textByStyle: {
          office: 'A cropped blazer or cardigan',
          minimal: 'A simple jacket',
          street: 'A denim or utility jacket',
          feminine: 'A soft cardigan or light jacket',
        },
      },
    ],
  },
  bags: {
    intro: 'This works well with:',
    bullets: [
      {
        key: 'BAGS__OUTFIT_CLEAN',
        text: 'Clean, simple outfit pieces',
        target: null,
      },
      {
        key: 'BAGS__SHOES_NEUTRAL',
        text: 'Neutral everyday shoes',
        target: 'shoes',
        textByStyle: {
          office: 'Classic loafers or simple heels',
          minimal: 'Sleek flats or low-profile sneakers',
          street: 'Clean sneakers',
        },
      },
      {
        key: 'BAGS__ACCESSORIES_MINIMAL',
        text: 'Minimal competing accessories',
        target: 'accessories',
      },
    ],
  },
  accessories: {
    intro: 'This complements:',
    bullets: [
      {
        key: 'ACCESSORIES__OUTFIT_SIMPLE',
        text: 'Simple outfit pieces',
        target: null,
      },
      {
        key: 'ACCESSORIES__SHOES_NEUTRAL',
        text: 'Neutral everyday shoes',
        target: 'shoes',
      },
      {
        key: 'ACCESSORIES__OUTERWEAR_CLEAN',
        text: 'Clean layering',
        target: 'outerwear',
      },
    ],
  },
  default: {
    intro: 'To make this item easy to wear:',
    bullets: [
      {
        key: 'DEFAULT__KEEP_SIMPLE',
        text: 'Keep the other pieces simple',
        target: null,
      },
      {
        key: 'DEFAULT__NEUTRAL_COLORS',
        text: 'Choose neutral colors',
        target: null,
      },
      {
        key: 'DEFAULT__AVOID_TEXTURE',
        text: 'Avoid competing textures',
        target: null,
      },
    ],
  },
};
```

**Add Mode B templates and stable ordering:**

```typescript
/**
 * Safe fallback bullet when no cap reasons produce bullets.
 */
export const SAFE_GENERIC_BULLET_TEXT =
  'Let one piece stand out and keep the rest simple.';

/**
 * Stable ordering for cap reasons (used as tie-breaker when priorities match).
 * Includes TEXTURE_CLASH for completeness even though Mode B excludes it.
 * Unknown reasons (if any) will sort to the end (index 999).
 */
export const CAP_REASON_STABLE_ORDER: CapReason[] = [
  'FORMALITY_TENSION',
  'STYLE_TENSION',
  'COLOR_TENSION',
  'USAGE_MISMATCH',
  'SHOES_CONFIDENCE_DAMPEN',
  'TEXTURE_CLASH',
  'MISSING_KEY_SIGNAL',
];

/**
 * Mode B bullets by cap reason with stable keys and optional style overrides.
 *
 * Keys are namespaced: REASON__DESCRIPTION to prevent cross-reason collisions.
 * TEXTURE_CLASH is empty (excluded from Mode B via MODE_B_CONFIG).
 */
export const MODE_B_COPY_BY_REASON: Record<CapReason, ModeBBullet[]> = {
  FORMALITY_TENSION: [
    {
      key: 'FORMALITY_TENSION__MATCH_DRESSINESS',
      text: 'Keep the rest of the outfit at the same level of dressiness.',
      textByStyle: {
        office: 'Stick to equally polished pieces throughout.',
        street: 'Keep everything at the same relaxed level.',
      },
    },
    {
      key: 'FORMALITY_TENSION__AVOID_MIX',
      text: 'Avoid mixing very dressy pieces with very casual ones.',
      textByStyle: {
        office: "Don't pair this with overly casual items.",
        street: 'Skip the formal pieces with this.',
      },
    },
  ],
  STYLE_TENSION: [
    {
      key: 'STYLE_TENSION__LET_ONE_LEAD',
      text: 'Let one piece set the vibe, and keep the rest simple.',
      textByStyle: {
        minimal: 'Let this piece stand alone with quiet basics.',
        street:
          'Let this be the statement and keep everything else low-key.',
      },
    },
    {
      key: 'STYLE_TENSION__STICK_CLASSIC',
      text: 'Stick to clean, classic pieces around this item.',
      textByStyle: {
        minimal: 'Pair with understated, streamlined pieces.',
        office: 'Surround it with tailored, neutral staples.',
      },
    },
  ],
  COLOR_TENSION: [
    {
      key: 'COLOR_TENSION__NEUTRAL_OTHERS',
      text: 'Keep the other pieces neutral to avoid competing colors.',
      textByStyle: {
        minimal: 'Stick to tonal neutrals for the rest.',
        street: 'Let this color pop against simple black or white.',
      },
    },
    {
      key: 'COLOR_TENSION__CONTRAST_OR_TONAL',
      text: 'Choose either contrast or tonal color — not both.',
    },
  ],
  USAGE_MISMATCH: [
    {
      key: 'USAGE_MISMATCH__CLEAR_CONTEXT',
      text: 'Match the outfit to one clear context (everyday vs dressy).',
      textByStyle: {
        office: 'Decide: is this for work or weekend?',
        street: 'Keep the whole outfit in the same casual lane.',
      },
    },
    {
      key: 'USAGE_MISMATCH__CONSISTENT_PURPOSE',
      text: 'Keep the look consistent rather than mixing purposes.',
    },
  ],
  SHOES_CONFIDENCE_DAMPEN: [
    {
      key: 'SHOES_CONFIDENCE_DAMPEN__SIMPLE_SHOES',
      text: "Choose simple shoes that don't compete with the outfit.",
      textByStyle: {
        minimal: 'Go for sleek, low-profile shoes.',
        street: 'Clean sneakers work best here.',
        office: "Simple loafers or flats won't fight the look.",
      },
    },
    {
      key: 'SHOES_CONFIDENCE_DAMPEN__MINIMAL_SHAPE',
      text: 'A minimal shoe shape keeps the look more cohesive.',
    },
  ],
  TEXTURE_CLASH: [], // Excluded from Mode B
  MISSING_KEY_SIGNAL: [
    {
      key: 'MISSING_KEY_SIGNAL__SIMPLE_VERSATILE',
      text: 'Keep the other pieces simple and versatile.',
    },
  ],
};
```

---

### 3. `src/lib/confidence-engine/suggestions.ts`

**Update imports:**

```typescript
import type { StyleVibe, Category } from '../types';
import type {
  CapReason,
  SuggestionBullet,
  ModeASuggestion,
  ModeBSuggestion,
  PairEvaluation,
} from './types';
import {
  MODE_A_TEMPLATES_V2,
  MODE_B_COPY_BY_REASON,
  SAFE_GENERIC_BULLET_TEXT,
  CAP_REASON_STABLE_ORDER,
  REASON_PRIORITY,
  MODE_B_CONFIG,
  type ModeATemplateV2,
} from './config';
```

**Add/update helper functions:**

```typescript
// ============================================
// MODE A HELPERS
// ============================================

/**
 * Resolve bullets from a Mode A template with style-aware copy.
 * Internal helper - converts EnhancedSuggestionBullet to SuggestionBullet.
 */
function resolveModeABulletsFromTemplate(
  template: ModeATemplateV2,
  vibe: StyleVibe
): SuggestionBullet[] {
  return template.bullets.map((bullet) => ({
    text: bullet.textByStyle?.[vibe] ?? bullet.text,
    target: bullet.target,
  }));
}

/**
 * Generate Mode A suggestions for a category.
 *
 * @param category - The scanned item's category
 * @param vibe - UI vibe for copy selection (default: 'casual')
 */
export function generateModeASuggestions(
  category: Category,
  vibe: StyleVibe = 'casual'
): ModeASuggestion {
  const template = MODE_A_TEMPLATES_V2[category] ?? MODE_A_TEMPLATES_V2.default;

  return {
    intro: template.intro,
    bullets: resolveModeABulletsFromTemplate(template, vibe),
  };
}

// ============================================
// MODE B HELPERS
// ============================================

/**
 * Build Mode B bullets deterministically from cap reasons.
 * Returns both bullets and the reasons that actually contributed.
 *
 * Algorithm:
 * 1. Filter out excluded reasons (e.g., TEXTURE_CLASH)
 * 2. Sort by priority desc, then by stable order for ties
 * 3. Iterate in order, dedupe by key, resolve style-aware text
 * 4. Track which reasons actually contributed bullets
 * 5. Take first maxBullets
 * 6. If empty, return safe generic bullet
 *
 * Note: Dedupe is global across reasons; keys are namespaced by reason
 * (e.g., REASON__slug) to prevent collisions.
 */
export function buildModeBBullets(args: {
  capReasons: CapReason[];
  vibe: StyleVibe;
  maxBullets?: number;
}): { bullets: string[]; reasonsUsed: CapReason[] } {
  const { capReasons, vibe, maxBullets = 3 } = args;

  // 1. Filter out excluded reasons (handle both Set and Array)
  const excludedSet = new Set(MODE_B_CONFIG.excluded_reasons);
  const validReasons = capReasons.filter((r) => !excludedSet.has(r));

  // 2. Sort by priority desc, then by stable order for ties
  const getStableOrder = (r: CapReason): number => {
    const idx = CAP_REASON_STABLE_ORDER.indexOf(r);
    return idx === -1 ? 999 : idx; // Unknown reasons sort last
  };

  const sortedReasons = [...validReasons].sort((a, b) => {
    const priorityDiff = REASON_PRIORITY[b] - REASON_PRIORITY[a];
    if (priorityDiff !== 0) return priorityDiff;
    return getStableOrder(a) - getStableOrder(b);
  });

  // 3. Collect bullets, dedupe by key, track contributing reasons
  const seenKeys = new Set<string>();
  const bullets: string[] = [];
  const reasonsUsed: CapReason[] = [];

  for (const reason of sortedReasons) {
    const reasonBullets = MODE_B_COPY_BY_REASON[reason] ?? [];
    let contributedFromThisReason = false;

    for (const bullet of reasonBullets) {
      if (seenKeys.has(bullet.key)) continue;
      if (bullets.length >= maxBullets) break;

      seenKeys.add(bullet.key);
      const text = bullet.textByStyle?.[vibe] ?? bullet.text;
      bullets.push(text);
      contributedFromThisReason = true;
    }

    if (contributedFromThisReason) {
      reasonsUsed.push(reason);
    }

    if (bullets.length >= maxBullets) break;
  }

  // 4. If empty, return safe generic
  if (bullets.length === 0) {
    return { bullets: [SAFE_GENERIC_BULLET_TEXT], reasonsUsed: [] };
  }

  return { bullets, reasonsUsed };
}

/**
 * Generate Mode B suggestions from cap reasons.
 *
 * @param capReasons - Array of cap reasons from pair evaluation
 * @param vibe - UI vibe for copy selection (default: 'casual')
 */
export function generateModeBSuggestions(
  capReasons: CapReason[],
  vibe: StyleVibe = 'casual'
): ModeBSuggestion {
  const { bullets, reasonsUsed } = buildModeBBullets({ capReasons, vibe });

  return {
    bullets,
    reasons_used: reasonsUsed,
  };
}

/**
 * Generate outfit-level Mode B suggestions from near-matches.
 *
 * @param nearMatches - Array of near-match pair evaluations
 * @param vibe - UI vibe for copy selection (default: 'casual')
 */
export function generateOutfitModeBSuggestions(
  nearMatches: PairEvaluation[],
  vibe: StyleVibe = 'casual'
): ModeBSuggestion | null {
  if (nearMatches.length === 0) {
    return null;
  }

  const aggregatedReasons = aggregateCapReasons(nearMatches);

  if (aggregatedReasons.length === 0) {
    return null;
  }

  return generateModeBSuggestions(aggregatedReasons, vibe);
}

// Note: aggregateCapReasons should already exist in this file
// It collects and dedupes cap_reasons from multiple near-matches
```

---

### 4. `src/lib/confidence-engine/index.ts`

**Update exports:**

```typescript
// ============================================
// STYLE-AWARE SUGGESTIONS (PUBLIC API)
// ============================================

// From integration.ts
export {
  // ... existing exports
  resolveUiVibeForCopy,
  VIBE_PRIORITY,
  STYLE_FAMILY_TO_UI_VIBE,
} from './integration';

// From suggestions.ts
export {
  // ... existing exports
  generateModeASuggestions,
  generateModeBSuggestions,
  generateOutfitModeBSuggestions,
} from './suggestions';

// NOTE: The following are intentionally NOT exported (internal implementation):
// - MODE_A_TEMPLATES_V2
// - MODE_B_COPY_BY_REASON
// - CAP_REASON_STABLE_ORDER
// - buildModeBBullets
// - SAFE_GENERIC_BULLET_TEXT
// Tests can import directly from './config' or './suggestions' if needed.
```

---

### 5. `src/lib/useConfidenceEngine.ts`

**Update imports:**

```typescript
import {
  // ... existing imports
  resolveUiVibeForCopy,
} from './confidence-engine';
import type { StyleVibe } from './types';
```

**Update ConfidenceEngineResult interface:**

```typescript
export interface ConfidenceEngineResult {
  // ... existing fields

  /**
   * UI vibe used for suggestion copy selection.
   * For debugging/analytics only - not required by UI rendering.
   */
  resolvedUiVibe?: StyleVibe;
}
```

**Update hook implementation:**

```typescript
export function useConfidenceEngine(
  scannedItem: ScannedItem | null,
  wardrobeItems: WardrobeItem[],
  analysisResult?: ClothingAnalysisResult
): ConfidenceEngineResult {
  return useMemo(() => {
    // ... existing early returns for null scannedItem, etc.

    try {
      // Convert scanned item to ConfidenceItem (existing code)
      let targetItem: ConfidenceItem;
      if (analysisResult?.confidenceSignals) {
        targetItem = scannedItemWithSignalsToConfidenceItem(
          scannedItem,
          analysisResult.confidenceSignals
        );
      } else {
        targetItem = scannedItemToConfidenceItem(scannedItem);
      }

      // ============================================
      // NEW: Compute UI vibe ONCE for all suggestions
      // ============================================
      const vibe = resolveUiVibeForCopy({
        styleTags: scannedItem.styleTags ?? null,
        styleNotes: scannedItem.styleNotes ?? null,
        explicitStyleFamily:
          analysisResult?.confidenceSignals?.style_family ?? null,
      });

      // ... existing wardrobe conversion and evaluation code

      // ============================================
      // UPDATED: Pass vibe to suggestion generators
      // ============================================

      // Mode A generation
      if (evaluation.suggestions_mode === 'A') {
        const rawModeA = generateModeASuggestions(
          scannedItem.category as Category,
          vibe // NEW: pass vibe
        );
        // ... existing filtering logic unchanged
      }

      // Mode B generation
      if (
        evaluation.suggestions_mode === 'B' &&
        evaluation.near_matches.length > 0
      ) {
        const rawModeBSuggestions = generateOutfitModeBSuggestions(
          evaluation.near_matches,
          vibe // NEW: pass vibe
        );
        // ... existing logic unchanged
      }

      // ============================================
      // UPDATED: Include resolvedUiVibe in result
      // ============================================
      return {
        // ... existing fields
        resolvedUiVibe: vibe, // NEW: for debugging/analytics
      };
    } catch (error) {
      console.error('[ConfidenceEngine] Evaluation failed:', error);
      return getEmptyResult();
    }
  }, [scannedItem, wardrobeItems, analysisResult]);
}
```

---

### 6. `src/lib/results-ui-policy.ts`

**NO CHANGES REQUIRED**

This file remains a pure consumer of `ConfidenceEngineResult`. It does not need to know about vibe resolution or style-aware copy selection.

---

## Tests

### `src/lib/confidence-engine/__tests__/style-copy.test.ts`

```typescript
import {
  resolveUiVibeForCopy,
  generateModeASuggestions,
  generateModeBSuggestions,
  VIBE_PRIORITY,
  STYLE_FAMILY_TO_UI_VIBE,
} from '../index';

// Direct imports for internal testing
import {
  buildModeBBullets,
  SAFE_GENERIC_BULLET_TEXT,
  MODE_B_COPY_BY_REASON,
  CAP_REASON_STABLE_ORDER,
} from '../config';
import type { CapReason } from '../types';

// ============================================
// resolveUiVibeForCopy Tests
// ============================================

describe('resolveUiVibeForCopy', () => {
  describe('empty/null inputs', () => {
    it('returns casual when all inputs are empty/null', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: null,
          styleNotes: null,
          explicitStyleFamily: null,
        })
      ).toBe('casual');
    });

    it('returns casual when styleTags is empty array', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: [],
          styleNotes: null,
          explicitStyleFamily: null,
        })
      ).toBe('casual');
    });

    it('returns casual when styleTags is undefined', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: undefined,
          styleNotes: undefined,
          explicitStyleFamily: undefined,
        })
      ).toBe('casual');
    });
  });

  describe('explicitStyleFamily handling', () => {
    it('uses explicitStyleFamily when provided and not unknown', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: null,
          styleNotes: null,
          explicitStyleFamily: 'athleisure',
        })
      ).toBe('sporty');
    });

    it('falls through when explicitStyleFamily is unknown', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: ['minimal'],
          styleNotes: null,
          explicitStyleFamily: 'unknown',
        })
      ).toBe('minimal');
    });

    it('maps romantic family to feminine', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: null,
          styleNotes: null,
          explicitStyleFamily: 'romantic',
        })
      ).toBe('feminine');
    });

    it('maps boho family to feminine', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: null,
          styleNotes: null,
          explicitStyleFamily: 'boho',
        })
      ).toBe('feminine');
    });

    it('maps formal family to office', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: null,
          styleNotes: null,
          explicitStyleFamily: 'formal',
        })
      ).toBe('office');
    });

    it('maps preppy family to office', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: null,
          styleNotes: null,
          explicitStyleFamily: 'preppy',
        })
      ).toBe('office');
    });

    it('maps edgy family to street', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: null,
          styleNotes: null,
          explicitStyleFamily: 'edgy',
        })
      ).toBe('street');
    });
  });

  describe('classic -> casual mapping (safe default)', () => {
    it('maps classic family to casual (not office)', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: null,
          styleNotes: null,
          explicitStyleFamily: 'classic',
        })
      ).toBe('casual');
    });

    it('returns casual for relaxed/everyday styleNotes (via classic fallback)', () => {
      // CE keyword matcher may return classic/unknown for these
      // With classic->casual mapping, result should be casual
      expect(
        resolveUiVibeForCopy({
          styleTags: undefined,
          styleNotes: ['relaxed', 'everyday'],
          explicitStyleFamily: null,
        })
      ).toBe('casual');
    });
  });

  describe('casual intent preservation', () => {
    it('returns casual when styleTags is only casual', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: ['casual'],
          styleNotes: null,
          explicitStyleFamily: null,
        })
      ).toBe('casual');
    });

    it('preserves casual intent even with classic explicitStyleFamily', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: ['casual'],
          styleNotes: null,
          explicitStyleFamily: 'classic',
        })
      ).toBe('casual');
    });

    it('preserves casual intent with multiple casual tags', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: ['casual', 'casual'],
          styleNotes: null,
          explicitStyleFamily: 'classic',
        })
      ).toBe('casual');
    });
  });

  describe('styleTags priority ordering', () => {
    it('picks minimal over casual (priority)', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: ['casual', 'minimal'],
          styleNotes: null,
          explicitStyleFamily: null,
        })
      ).toBe('minimal');
    });

    it('picks minimal over street (priority, not array order)', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: ['street', 'minimal'],
          styleNotes: null,
          explicitStyleFamily: null,
        })
      ).toBe('minimal');
    });

    it('picks office as highest priority', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: ['sporty', 'office', 'street'],
          styleNotes: null,
          explicitStyleFamily: null,
        })
      ).toBe('office');
    });

    it('picks street over sporty (priority)', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: ['sporty', 'street'],
          styleNotes: null,
          explicitStyleFamily: null,
        })
      ).toBe('street');
    });

    it('picks feminine over sporty (priority)', () => {
      expect(
        resolveUiVibeForCopy({
          styleTags: ['sporty', 'feminine'],
          styleNotes: null,
          explicitStyleFamily: null,
        })
      ).toBe('feminine');
    });
  });

  describe('VIBE_PRIORITY constant', () => {
    it('has office as highest priority', () => {
      expect(VIBE_PRIORITY[0]).toBe('office');
    });

    it('has casual as lowest priority', () => {
      expect(VIBE_PRIORITY[VIBE_PRIORITY.length - 1]).toBe('casual');
    });

    it('contains all 6 vibes', () => {
      expect(VIBE_PRIORITY).toHaveLength(6);
      expect(VIBE_PRIORITY).toContain('office');
      expect(VIBE_PRIORITY).toContain('minimal');
      expect(VIBE_PRIORITY).toContain('street');
      expect(VIBE_PRIORITY).toContain('feminine');
      expect(VIBE_PRIORITY).toContain('sporty');
      expect(VIBE_PRIORITY).toContain('casual');
    });
  });
});

// ============================================
// buildModeBBullets Tests
// ============================================

describe('buildModeBBullets', () => {
  describe('exclusions', () => {
    it('returns safe generic when only excluded reasons provided', () => {
      const result = buildModeBBullets({
        capReasons: ['TEXTURE_CLASH'],
        vibe: 'casual',
      });

      expect(result.bullets).toEqual([SAFE_GENERIC_BULLET_TEXT]);
      expect(result.reasonsUsed).toEqual([]);
    });

    it('excludes TEXTURE_CLASH and tracks only contributing reasons', () => {
      const result = buildModeBBullets({
        capReasons: ['TEXTURE_CLASH', 'STYLE_TENSION'],
        vibe: 'casual',
      });

      expect(result.reasonsUsed).toEqual(['STYLE_TENSION']);
      expect(result.reasonsUsed).not.toContain('TEXTURE_CLASH');
      expect(result.bullets.length).toBeGreaterThan(0);
    });
  });

  describe('priority ordering', () => {
    it('respects priority order (FORMALITY_TENSION before STYLE_TENSION)', () => {
      const result = buildModeBBullets({
        capReasons: ['STYLE_TENSION', 'FORMALITY_TENSION'],
        vibe: 'casual',
        maxBullets: 2,
      });

      // FORMALITY_TENSION (priority 5) should contribute first
      expect(result.reasonsUsed[0]).toBe('FORMALITY_TENSION');
    });

    it('respects priority order with multiple reasons', () => {
      const result = buildModeBBullets({
        capReasons: [
          'MISSING_KEY_SIGNAL',
          'COLOR_TENSION',
          'FORMALITY_TENSION',
        ],
        vibe: 'casual',
      });

      // Should be ordered: FORMALITY (5) > COLOR (3) > MISSING (0)
      expect(result.reasonsUsed[0]).toBe('FORMALITY_TENSION');
    });
  });

  describe('empty handling', () => {
    it('returns safe generic when capReasons is empty', () => {
      const result = buildModeBBullets({
        capReasons: [],
        vibe: 'casual',
      });

      expect(result.bullets).toEqual([SAFE_GENERIC_BULLET_TEXT]);
      expect(result.reasonsUsed).toEqual([]);
    });

    it('returns safe generic when all reasons are excluded', () => {
      const result = buildModeBBullets({
        capReasons: ['TEXTURE_CLASH'],
        vibe: 'casual',
      });

      expect(result.bullets).toEqual([SAFE_GENERIC_BULLET_TEXT]);
      expect(result.reasonsUsed).toEqual([]);
    });
  });

  describe('maxBullets limit', () => {
    it('respects maxBullets parameter', () => {
      const result = buildModeBBullets({
        capReasons: ['FORMALITY_TENSION', 'STYLE_TENSION', 'COLOR_TENSION'],
        vibe: 'casual',
        maxBullets: 2,
      });

      expect(result.bullets.length).toBeLessThanOrEqual(2);
    });

    it('defaults to 3 bullets', () => {
      const result = buildModeBBullets({
        capReasons: [
          'FORMALITY_TENSION',
          'STYLE_TENSION',
          'COLOR_TENSION',
          'USAGE_MISMATCH',
        ],
        vibe: 'casual',
      });

      expect(result.bullets.length).toBeLessThanOrEqual(3);
    });
  });

  describe('determinism', () => {
    it('produces identical output for identical inputs', () => {
      const input = {
        capReasons: [
          'COLOR_TENSION',
          'STYLE_TENSION',
          'FORMALITY_TENSION',
        ] as CapReason[],
        vibe: 'minimal' as const,
      };

      const result1 = buildModeBBullets(input);
      const result2 = buildModeBBullets(input);

      expect(result1).toEqual(result2);
    });

    it('is order-independent for input capReasons', () => {
      const result1 = buildModeBBullets({
        capReasons: ['STYLE_TENSION', 'FORMALITY_TENSION'],
        vibe: 'casual',
      });

      const result2 = buildModeBBullets({
        capReasons: ['FORMALITY_TENSION', 'STYLE_TENSION'],
        vibe: 'casual',
      });

      // Same output regardless of input order
      expect(result1).toEqual(result2);
    });
  });

  describe('style-aware copy', () => {
    it('uses style override when available', () => {
      const minimalResult = buildModeBBullets({
        capReasons: ['STYLE_TENSION'],
        vibe: 'minimal',
        maxBullets: 1,
      });

      const casualResult = buildModeBBullets({
        capReasons: ['STYLE_TENSION'],
        vibe: 'casual',
        maxBullets: 1,
      });

      // Minimal has override, casual uses default
      expect(minimalResult.bullets[0].toLowerCase()).toContain('quiet basics');
      expect(casualResult.bullets[0]).toContain('keep the rest simple');
    });

    it('falls back to default text when no override exists', () => {
      // feminine vibe may not have override for all reasons
      const result = buildModeBBullets({
        capReasons: ['MISSING_KEY_SIGNAL'],
        vibe: 'feminine',
        maxBullets: 1,
      });

      // Should use default text
      expect(result.bullets[0]).toBe(
        'Keep the other pieces simple and versatile.'
      );
    });
  });

  describe('stable order tie-breaker', () => {
    it('uses CAP_REASON_STABLE_ORDER for tie-breaking', () => {
      // TEXTURE_CLASH and MISSING_KEY_SIGNAL both have priority 0
      // TEXTURE_CLASH should come first in stable order (but is excluded)
      // So MISSING_KEY_SIGNAL should be used
      const result = buildModeBBullets({
        capReasons: ['MISSING_KEY_SIGNAL', 'TEXTURE_CLASH'],
        vibe: 'casual',
      });

      expect(result.reasonsUsed).toEqual(['MISSING_KEY_SIGNAL']);
    });
  });
});

// ============================================
// generateModeASuggestions Tests
// ============================================

describe('generateModeASuggestions', () => {
  describe('basic functionality', () => {
    it('returns bullets with correct targets preserved', () => {
      const result = generateModeASuggestions('bottoms', 'minimal');

      expect(result.bullets.length).toBe(3);
      expect(result.bullets[0].target).toBe('tops');
      expect(result.bullets[1].target).toBe('shoes');
      expect(result.bullets[2].target).toBe('outerwear');
    });

    it('returns intro text', () => {
      const result = generateModeASuggestions('bottoms', 'casual');

      expect(result.intro).toBe('To complete this look:');
    });
  });

  describe('style-aware copy', () => {
    it('uses style override when available', () => {
      const minimalResult = generateModeASuggestions('bottoms', 'minimal');
      const casualResult = generateModeASuggestions('bottoms', 'casual');

      // Minimal has override for first bullet
      expect(minimalResult.bullets[0].text.toLowerCase()).toContain('clean');
      // Casual uses default
      expect(casualResult.bullets[0].text).toBe(
        'Simple top in a neutral tone'
      );
    });

    it('uses office override', () => {
      const result = generateModeASuggestions('bottoms', 'office');

      expect(result.bullets[0].text.toLowerCase()).toContain('button-down');
    });

    it('uses street override', () => {
      const result = generateModeASuggestions('bottoms', 'street');

      expect(result.bullets[0].text.toLowerCase()).toContain('graphic');
    });
  });

  describe('fallback behavior', () => {
    it('falls back to default text when no override exists', () => {
      // sporty may have limited overrides for accessories
      const result = generateModeASuggestions('accessories', 'sporty');

      // Should use default text
      expect(result.bullets[0].text).toBe('Simple outfit pieces');
    });

    it('falls back to default template for unknown category', () => {
      // @ts-expect-error - testing runtime fallback behavior
      const result = generateModeASuggestions('unknown_category', 'casual');

      expect(result.bullets.length).toBe(3);
      expect(result.bullets[0].target).toBeNull();
      expect(result.intro).toBe('To make this item easy to wear:');
    });
  });

  describe('default vibe parameter', () => {
    it('defaults to casual when vibe not provided', () => {
      const withVibe = generateModeASuggestions('bottoms', 'casual');
      const withoutVibe = generateModeASuggestions('bottoms');

      expect(withVibe).toEqual(withoutVibe);
    });
  });

  describe('category coverage', () => {
    const categories = [
      'tops',
      'bottoms',
      'shoes',
      'outerwear',
      'dresses',
      'skirts',
      'bags',
      'accessories',
    ] as const;

    categories.forEach((category) => {
      it(`returns valid suggestions for ${category}`, () => {
        const result = generateModeASuggestions(category, 'casual');

        expect(result.intro).toBeTruthy();
        expect(result.bullets.length).toBeGreaterThan(0);
        result.bullets.forEach((bullet) => {
          expect(bullet.text).toBeTruthy();
          // target can be null or a valid category
          if (bullet.target !== null) {
            expect(typeof bullet.target).toBe('string');
          }
        });
      });
    });
  });
});

// ============================================
// generateModeBSuggestions Tests
// ============================================

describe('generateModeBSuggestions', () => {
  it('returns bullets and reasons_used', () => {
    const result = generateModeBSuggestions(
      ['FORMALITY_TENSION', 'STYLE_TENSION'],
      'casual'
    );

    expect(result.bullets.length).toBeGreaterThan(0);
    expect(result.reasons_used.length).toBeGreaterThan(0);
  });

  it('reasons_used reflects actual contributing reasons', () => {
    const result = generateModeBSuggestions(
      ['TEXTURE_CLASH', 'STYLE_TENSION'],
      'casual'
    );

    // TEXTURE_CLASH is excluded, so only STYLE_TENSION should contribute
    expect(result.reasons_used).toEqual(['STYLE_TENSION']);
  });

  it('defaults to casual vibe', () => {
    const withVibe = generateModeBSuggestions(['STYLE_TENSION'], 'casual');
    const withoutVibe = generateModeBSuggestions(['STYLE_TENSION']);

    expect(withVibe).toEqual(withoutVibe);
  });
});

// ============================================
// Integration Tests
// ============================================

describe('Integration', () => {
  describe('Mode A + vibe resolution', () => {
    it('produces correct copy for bottoms with minimal vibe', () => {
      const vibe = resolveUiVibeForCopy({
        styleTags: ['casual', 'minimal'],
        styleNotes: null,
        explicitStyleFamily: null,
      });

      expect(vibe).toBe('minimal');

      const suggestions = generateModeASuggestions('bottoms', vibe);

      // First bullet should use minimal override
      expect(suggestions.bullets[0].text.toLowerCase()).toContain('clean');
      // Targets preserved
      expect(suggestions.bullets.map((b) => b.target)).toEqual([
        'tops',
        'shoes',
        'outerwear',
      ]);
    });
  });

  describe('Mode B + vibe resolution', () => {
    it('produces correct copy for street vibe', () => {
      const vibe = resolveUiVibeForCopy({
        styleTags: ['street'],
        styleNotes: null,
        explicitStyleFamily: null,
      });

      expect(vibe).toBe('street');

      const suggestions = generateModeBSuggestions(
        ['FORMALITY_TENSION'],
        vibe
      );

      // Should use street override
      expect(suggestions.bullets[0].toLowerCase()).toContain('relaxed');
    });
  });
});
```

---

## Summary

### Files Changed

| File | Changes |
|------|---------|
| `integration.ts` | Add `VIBE_PRIORITY`, `STYLE_FAMILY_TO_UI_VIBE`, `resolveUiVibeForCopy()` |
| `config.ts` | Add `MODE_A_TEMPLATES_V2`, `MODE_B_COPY_BY_REASON`, `SAFE_GENERIC_BULLET_TEXT`, `CAP_REASON_STABLE_ORDER`, internal types |
| `suggestions.ts` | Add `resolveModeABulletsFromTemplate()`, `buildModeBBullets()`, update `generateModeASuggestions()`, `generateModeBSuggestions()`, `generateOutfitModeBSuggestions()` |
| `index.ts` | Export new public API functions/constants |
| `useConfidenceEngine.ts` | Compute vibe once, pass to generators, add `resolvedUiVibe` to result |
| `results-ui-policy.ts` | **NO CHANGES** |
| `__tests__/style-copy.test.ts` | New comprehensive test file |

### Key Design Decisions Summary

| Decision | Rationale |
|----------|-----------|
| `classic → casual` for copy | Safe default; office only via explicit signals |
| Integration in `useConfidenceEngine.ts` | Single source of truth, all inputs available |
| Optional `vibe` params with defaults | Backward compatible |
| Namespaced bullet keys (`REASON__slug`) | Prevents cross-reason dedup collisions |
| `resolvedUiVibe` in result | Debugging/analytics without UI changes |
| `styleNotes` as `string[]` | Matches existing type, join internally |
| Track actual contributing reasons | Truthful `reasons_used` for analytics |
| Guard for unknown cap reasons | `indexOf === -1` returns 999, sorts last |
| Handle Set/Array for excluded_reasons | Defensive coding |

### What's NOT Changed

- CE scoring logic
- Tier mapping
- Match evaluation
- `SuggestionBullet` exported type shape
- `results-ui-policy.ts` (remains pure consumer)
- Mode B remains text-only (no targets)

---

## Optional: Feature Flag

For safe rollout, add to `config.ts`:

```typescript
export const FEATURE_FLAGS = {
  // ... existing flags

  /** Use V2 templates with style-aware copy. Set false to revert. */
  use_suggestion_templates_v2: true,
} as const;
```

Then in `suggestions.ts`:

```typescript
export function generateModeASuggestions(
  category: Category,
  vibe: StyleVibe = 'casual'
): ModeASuggestion {
  if (!FEATURE_FLAGS.use_suggestion_templates_v2) {
    // Legacy path - use existing MODE_A_TEMPLATES
    const template = MODE_A_TEMPLATES[category] ?? MODE_A_TEMPLATES.default;
    return {
      intro: template.intro,
      bullets: [...template.bullets],
    };
  }

  // V2 path
  const template = MODE_A_TEMPLATES_V2[category] ?? MODE_A_TEMPLATES_V2.default;
  return {
    intro: template.intro,
    bullets: resolveModeABulletsFromTemplate(template, vibe),
  };
}
```

This allows instant rollback without code deployment.

---

**End of Specification**
