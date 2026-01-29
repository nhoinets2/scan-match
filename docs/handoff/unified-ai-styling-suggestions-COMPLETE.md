# Unified AI Styling Suggestions - Implementation Complete

**Agents:** A (Backend) ✓, B (Client Service) ✓, C (UI Integration) Pending
**Status:** Phase 1-3 Complete, Phase 4-5 Pending
**Date:** 2026-01-29
**Files Modified:**
- `supabase/functions/personalized-suggestions/index.ts` (Agent A)
- `src/lib/types.ts` (Agent B)
- `src/lib/personalized-suggestions-service.ts` (Agent B)
- `src/lib/analytics.ts` (Agent B)
- `src/lib/__tests__/personalized-suggestions-service.test.ts` (Agent B)

---

## Summary

Implemented NEAR mode support in the personalized-suggestions Edge Function, enabling AI-powered styling suggestions for MEDIUM tier matches (items that are "close but not perfect"). The implementation includes server-side mode derivation, a new NEAR prompt builder, unified response schema with tagged union types, and comprehensive validation.

---

## Changes Overview

### 1. Types Added (Lines 54-134)

```typescript
// Derived mode (server-side, never trust client)
type SuggestionsMode = 'paired' | 'solo' | 'near';

// NEAR match includes cap reasons (why it's close but not HIGH)
interface SafeNearMatchInfo extends SafeMatchInfo {
  cap_reasons?: string[];  // e.g., ['formality_mismatch', 'season_mismatch']
}

// Tagged union for recommend - allows mode-appropriate shapes
type RecommendConsiderAdding = {
  type: 'consider_adding';
  category: Category;
  attributes: string[];
};

type RecommendStylingTip = {
  type: 'styling_tip';
  tip: string;
  tags?: string[];
};

type Recommend = RecommendConsiderAdding | RecommendStylingTip;
```

### 2. Request Schema Updated (Lines 93-103)

Added `near_matches` optional array to request:

```typescript
interface SuggestionsRequest {
  scan_signals: StyleSignalsV1;
  top_matches: SafeMatchInfo[];
  near_matches?: SafeNearMatchInfo[];  // NEW: NEAR mode MEDIUM tier items
  wardrobe_summary: WardrobeSummary;
  intent: 'shopping' | 'own_item';
  cache_key: string;
  scan_id?: string;
  has_pairings?: boolean;
  mode?: SuggestionsMode;  // Client hint (telemetry only, NOT trusted)
}
```

### 3. Server-Side Mode Derivation (Lines 610-618)

Mode is derived from array lengths, never trusted from client:

```typescript
// Priority: near_matches > top_matches > solo
const derivedMode: SuggestionsMode = safeNearMatches.length > 0 
  ? 'near' 
  : safeTopMatches.length === 0 
    ? 'solo' 
    : 'paired';
```

### 4. NEAR Prompt Builder (Lines 226-282)

New `buildNearPrompt()` function focusing on "how to make it work":

- Caps to top 3 near matches (keeps prompt small)
- Includes top 2 cap reasons per match (explains why NEAR not HIGH)
- Instructs model to use `styling_tip` type (not `consider_adding`)
- Focuses on HOW to style items to bridge the gap

Key prompt instruction:
```
note: These items are CLOSE matches but not perfect. Focus on HOW to make them work.
```

### 5. Validation Updates (Lines 327-523)

`validateAndRepairSuggestions()` now handles:

| Mode | Mentions | Recommend Type |
|------|----------|----------------|
| **paired** | Must be subset of `top_match_ids` | `consider_adding` |
| **solo** | Forced empty `[]` | `consider_adding` |
| **near** | Must be subset of `near_match_ids` | `styling_tip` |

Validation features:
- Strips invalid mentions (tracks `mentionsStrippedCount`)
- Validates `styling_tip` requires `tip` field
- Validates `consider_adding` requires `category` + `attributes`
- Auto-repairs wrong type (e.g., `styling_tip` in paired mode → `consider_adding`)

### 6. Response Meta (Lines 807-808)

Added `mode` to response meta for telemetry:

```typescript
meta: {
  source: 'ai_call',
  mode: derivedMode,  // NEW
  latencyMs,
  wasRepaired,
  promptVersion: PROMPT_VERSION,
  schemaVersion: SCHEMA_VERSION,
}
```

---

## API Contract

### NEAR Mode Request

```json
{
  "scan_signals": { /* StyleSignalsV1 */ },
  "near_matches": [
    {
      "id": "wardrobe-item-uuid",
      "category": "tops",
      "dominant_color": "navy",
      "aesthetic": "classic",
      "cap_reasons": ["formality_mismatch", "season_mismatch"]
    }
  ],
  "top_matches": [],
  "wardrobe_summary": { /* WardrobeSummary */ },
  "intent": "own_item",
  "cache_key": "unique-cache-key"
}
```

### NEAR Mode Response

```json
{
  "ok": true,
  "data": {
    "version": 1,
    "why_it_works": [
      { "text": "The color palette creates a cohesive foundation", "mentions": ["wardrobe-item-uuid"] },
      { "text": "Similar aesthetic direction bridges casual and refined", "mentions": [] }
    ],
    "to_elevate": [
      { 
        "text": "Bridge the formality gap with intentional styling",
        "recommend": { 
          "type": "styling_tip", 
          "tip": "Tuck in and add a structured belt to elevate the silhouette",
          "tags": ["proportion", "formality"]
        }
      },
      {
        "text": "Adjust proportions for better balance",
        "recommend": {
          "type": "styling_tip",
          "tip": "Roll sleeves and cuff pants to create visual cohesion",
          "tags": ["proportion"]
        }
      }
    ]
  },
  "meta": {
    "source": "ai_call",
    "mode": "near",
    "latencyMs": 1234,
    "wasRepaired": false,
    "promptVersion": 1,
    "schemaVersion": 1
  }
}
```

---

## Backward Compatibility

| Existing Flow | Status | Notes |
|---------------|--------|-------|
| **Paired mode** | Unchanged | `top_matches.length > 0` + no `near_matches` |
| **Solo mode** | Unchanged | Both arrays empty |
| **Validation** | Enhanced | Same rules + NEAR support |
| **Response schema** | Compatible | `recommend` is now union type |

Existing clients sending only `top_matches` will continue to work exactly as before.

---

---

# Agent B: Client Service Implementation Complete

**Agent:** B (Client Service)
**Status:** Complete
**Date:** 2026-01-29
**Files Modified:**
- `src/lib/types.ts`
- `src/lib/personalized-suggestions-service.ts`
- `src/lib/analytics.ts`
- `src/lib/__tests__/personalized-suggestions-service.test.ts`

---

## Summary

Implemented client-side NEAR mode support including the Recommend tagged union type, service updates with nearFinal parameter, mode-aware cache key generation, client-side validation for the recommend union types, and comprehensive unit tests (45 tests, all passing).

---

## Changes Overview

### 1. Type Definitions Added (`src/lib/types.ts`)

```typescript
// Tagged union for to_elevate recommendations (lines 59-77)
export type Recommend =
  | RecommendConsiderAdding
  | RecommendStylingTip;

export interface RecommendConsiderAdding {
  type: "consider_adding";
  category: Category;
  attributes: string[]; // e.g., ["tan", "structured"]
}

export interface RecommendStylingTip {
  type: "styling_tip";
  tip: string; // Actionable styling advice
  tags?: string[]; // Optional tags for categorization
}

export interface ElevateBullet {
  text: string;
  recommend: Recommend;
}

// NEAR match data with cap_reasons (lines 87-92)
export interface SafeNearMatchInfo extends SafeMatchInfo {
  cap_reasons: string[]; // Why this match is near (e.g., "formality mismatch")
}
```

### 2. Service Updates (`src/lib/personalized-suggestions-service.ts`)

#### Mode Type Export (Line 155)
```typescript
export type SuggestionsMode = "paired" | "solo" | "near";
```

#### Updated Function Signature (Lines 162-180)
```typescript
export async function fetchPersonalizedSuggestions({
  scanId,
  scanSignals,
  highFinal,
  nearFinal,  // NEW: Optional parameter for NEAR mode
  wardrobeSummary,
  intent,
  scanCategory,
  preferAddOnCategories,
  addOnCategories,
}: {
  // ... existing params
  nearFinal?: EnrichedMatch[];  // NEW
}): Promise<SuggestionsResult>
```

#### Near Matches Building (Lines 190-197)
```typescript
// Build near matches with cap_reasons for NEAR mode
const nearMatches: SafeNearMatchInfo[] = (nearFinal ?? []).slice(0, 3).map(match => ({
  id: match.wardrobeItem.id,
  category: match.wardrobeItem.category as Category,
  dominant_color: match.wardrobeItem.colors?.[0]?.name ?? "unknown",
  aesthetic: getWardrobeItemAesthetic(match.wardrobeItem),
  label: match.wardrobeItem.detectedLabel,
  cap_reasons: match.capReasons?.slice(0, 2) ?? [], // Top 2 cap reasons per match
}));
```

#### Mode Derivation (Lines 202-207)
```typescript
// Derive mode from data arrays (same logic as server)
const mode: SuggestionsMode = nearMatches.length > 0 
  ? "near" 
  : topMatches.length === 0 
    ? "solo" 
    : "paired";
```

#### Cache Key with NEAR Support (Lines 209-219)
```typescript
const rawKey = [
  scanId,
  topIds,   // empty string for solo mode
  nearIds,  // NEW: empty string for paired/solo modes
  wardrobeSummary.updated_at,
  PROMPT_VERSION,
  SCHEMA_VERSION,
  `mode:${mode}`,  // Mode isolation in cache
  `scanCat:${scanCategory ?? "null"}`,
  `preferAddOns:${preferAddOnCategories ? 1 : 0}`,
].join("|");
```

#### ValidIds Based on Mode (Lines 221-227)
```typescript
// NEAR mode: validate against near_match_ids
// PAIRED mode: validate against top_match_ids
// SOLO mode: empty array (no mentions allowed)
const validIds = mode === "near" 
  ? nearMatches.map(match => match.id)
  : topMatches.map(match => match.id);
```

### 3. Validation Updates (`src/lib/personalized-suggestions-service.ts`)

#### Updated Signature (Lines 452-467)
```typescript
export function validateAndRepairSuggestions(
  data: unknown,
  validIds: string[],
  mode: SuggestionsMode = "paired",  // NEW parameter
  scanCategory?: Category | null,
  preferAddOnCategories?: boolean,
  addOnCategories?: AddOnCategory[],
): {
  suggestions: PersonalizedSuggestions;
  wasRepaired: boolean;
  removedCategories: Category[];
  mentionsStrippedCount: number;  // NEW return field
}
```

#### Recommend Union Validation (Lines 521-565)
```typescript
// NEAR mode expects styling_tip, PAIRED/SOLO expect consider_adding
if (isNearMode && recType === "styling_tip") {
  // Validate styling_tip type
  const tip = typeof rec?.tip === "string" && rec.tip.length > 0
    ? smartTrim(rec.tip, 150)
    : "Try different styling approaches to make this work";
  
  const tags = Array.isArray(rec?.tags)
    ? (rec.tags as unknown[])
        .filter((tag): tag is string => typeof tag === "string")
        .slice(0, 3)
    : undefined;

  return {
    text: trimmedText,
    recommend: {
      type: "styling_tip" as const,
      tip,
      ...(tags && tags.length > 0 ? { tags } : {}),
    },
  };
}

// Default: consider_adding (for PAIRED, SOLO, or when NEAR returns wrong type)
```

#### NEAR Mode Fallbacks (Lines 589-610)
```typescript
// NEAR mode: use styling_tip fallbacks
const NEAR_FALLBACK_TIPS: ElevateBullet[] = [
  {
    text: "Consider layering to adjust proportions",
    recommend: {
      type: "styling_tip",
      tip: "Try adding a third piece like a cardigan or jacket to balance the silhouette",
    },
  },
  {
    text: "Experiment with different styling techniques",
    recommend: {
      type: "styling_tip",
      tip: "Rolling, cuffing, or tucking can help make pieces work together better",
    },
  },
];
```

### 4. Telemetry Updates (`src/lib/analytics.ts`)

#### Updated Event Interfaces (Lines 251-278)
```typescript
interface PersonalizedSuggestionsStarted {
  name: "personalized_suggestions_started";
  properties: {
    scan_id: string;
    intent: "shopping" | "own_item";
    top_match_count: number;
    near_match_count: number;  // NEW
    prompt_version: number;
    schema_version: number;
    mode: "paired" | "solo" | "near";  // NEW (replaces is_solo_mode)
    scan_category: string | null;
    prefer_add_on_categories: boolean;
  };
}

interface PersonalizedSuggestionsCompleted {
  name: "personalized_suggestions_completed";
  properties: {
    scan_id: string;
    latency_ms: number;
    source: "ai_call" | "cache_hit";
    prompt_version: number;
    schema_version: number;
    was_repaired: boolean;
    mode: "paired" | "solo" | "near";  // NEW (replaces is_solo_mode)
    mentions_stripped_count: number;  // NEW
    removed_by_scan_category_count: number;
    applied_add_on_preference: boolean;
  };
}
```

### 5. Unit Tests (`src/lib/__tests__/personalized-suggestions-service.test.ts`)

Added 11 new tests for NEAR mode (total: 45 tests, all passing):

| Test | Description |
|------|-------------|
| `validates mentions against near_match_ids` | Strips invalid mentions, tracks count |
| `strips all invalid mentions` | Returns empty array when all invalid |
| `validates styling_tip recommend type` | Preserves valid styling_tip with tip and tags |
| `provides fallback tip when missing or empty` | Auto-repairs missing tip field |
| `converts consider_adding in NEAR mode` | Handles wrong type from model |
| `pads to 2 bullets with styling_tip fallbacks` | NEAR-specific padding |
| `does not apply scan category filtering` | Styling tips have no category |
| `limits tags array to 3 items` | Tags validation |
| `counts all stripped mentions across bullets` | mentionsStrippedCount tracking |
| `returns 0 when no mentions stripped` | Clean pass-through |

---

## API Contract (Client → Server)

### NEAR Mode Request (with nearFinal)
```typescript
fetchPersonalizedSuggestions({
  scanId: "uuid",
  scanSignals: { /* StyleSignalsV1 */ },
  highFinal: [],  // Empty for NEAR mode
  nearFinal: enrichedMatches,  // MEDIUM tier matches
  wardrobeSummary: { /* WardrobeSummary */ },
  intent: "own_item",
});
```

Request body sent to Edge Function:
```json
{
  "scan_signals": { /* ... */ },
  "top_matches": [],
  "near_matches": [
    {
      "id": "wardrobe-item-uuid",
      "category": "tops",
      "dominant_color": "navy",
      "aesthetic": "classic",
      "cap_reasons": ["formality_mismatch"]
    }
  ],
  "wardrobe_summary": { /* ... */ },
  "intent": "own_item",
  "cache_key": "hashed-key-with-near-ids",
  "mode": "near"
}
```

---

## Backward Compatibility

| Existing Flow | Status | Notes |
|---------------|--------|-------|
| **Paired mode** | Unchanged | `nearFinal` optional, defaults to `[]` |
| **Solo mode** | Unchanged | Both arrays empty |
| **Validation** | Enhanced | Now returns `mentionsStrippedCount` |
| **Cache keys** | Isolated | `mode:` prefix ensures separation |

Existing calls to `fetchPersonalizedSuggestions` without `nearFinal` continue to work exactly as before.

---

## Dependencies for Agent C

### Agent C (UI Integration) needs to:

1. Add `mode` prop to `PersonalizedSuggestionsCard`
2. Branch on `recommend.type` for rendering:
   - `consider_adding` → category + attributes (existing)
   - `styling_tip` → tip text (new)
3. Add NEAR fetch logic to results.tsx with `nearFinal` parameter
4. Implement Mode B suppression with timeout fallback
5. Update section titles based on mode:
   - NEAR: "Why it's close" / "How to upgrade"

---

## Testing

### Agent A: Manual Verification (Backend)

1. **NEAR mode** - POST with `near_matches` array, empty `top_matches`:
   - Verify `meta.mode === "near"`
   - Verify `to_elevate[].recommend.type === "styling_tip"`

2. **Paired mode** - POST with `top_matches` only:
   - Verify `meta.mode === "paired"`
   - Verify `to_elevate[].recommend.type === "consider_adding"`

3. **Solo mode** - POST with both arrays empty:
   - Verify `meta.mode === "solo"`
   - Verify `why_it_works[].mentions === []`

### Agent B: Unit Test Verification (Client Service)

Run tests:
```bash
npx jest src/lib/__tests__/personalized-suggestions-service.test.ts --no-coverage
```

Expected output:
```
PASS src/lib/__tests__/personalized-suggestions-service.test.ts
  validateAndRepairSuggestions
    ✓ 45 tests passing
```

TypeScript check:
```bash
npx tsc --noEmit
```

### Edge Cases Covered

| Scenario | Agent A (Server) | Agent B (Client) |
|----------|------------------|------------------|
| Invalid mentions in NEAR → stripped | ✓ | ✓ |
| Model returns `consider_adding` in NEAR → converted | ✓ | ✓ |
| Model returns `styling_tip` in paired → converted | ✓ | ✓ |
| Empty tip field → fallback applied | ✓ | ✓ |
| Tags array > 3 items → truncated | ✓ | ✓ |
| mentionsStrippedCount tracked | ✓ | ✓ |

---

## Files Modified

### Agent A (Backend)
- `supabase/functions/personalized-suggestions/index.ts`

### Agent B (Client Service)
- `src/lib/types.ts`
- `src/lib/personalized-suggestions-service.ts`
- `src/lib/analytics.ts`
- `src/lib/__tests__/personalized-suggestions-service.test.ts`

### Agent C (UI Integration) - Pending
- `src/components/PersonalizedSuggestionsCard.tsx`
- `src/app/results.tsx`

---

## Checklist Reference

All items marked complete in:
`docs/handoff/unified-ai-styling-suggestions-review-checklist.md`

### Agent A (Backend): 12/12 ✓
- Mode Derivation (Server-side): 3/3 ✓
- NEAR Prompt: 3/3 ✓
- Unified Response Schema: 2/2 ✓
- Validation (Server-side): 4/4 ✓

### Agent B (Client Service): 14/14 ✓
- Type Definitions: 1/1 ✓
- Service Updates: 3/3 ✓
- Validation (Client-side): 3/3 ✓
- Telemetry: 1/1 ✓
- Unit Tests: 5/5 ✓ (4 CRITICAL)

### Agent C (UI Integration): Pending
- UI Component Updates: 0/4
- Results Screen: 0/10

---

## Deployment Notes

### Backend (Agent A)
```bash
supabase functions deploy personalized-suggestions --no-verify-jwt
```

### Client (Agent B)
No separate deployment - changes included in app bundle.

No database migrations required - uses existing `personalized_suggestions_cache` table.

---

**Phase 1-3 Complete.** Ready for Agent C (UI Integration) to proceed with Phase 4-5.
