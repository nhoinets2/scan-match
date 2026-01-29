# Unified AI Styling Suggestions - Backend Implementation Complete

**Agent:** A (Backend)
**Status:** Complete
**Date:** 2026-01-29
**File Modified:** `supabase/functions/personalized-suggestions/index.ts`

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

## Dependencies for Agent B/C

### Agent B (Client Service) needs to:

1. Add `nearFinal` parameter to `fetchPersonalizedSuggestions`
2. Update cache key to include `mode:near` + near IDs
3. Add Recommend tagged union to `src/lib/types.ts`
4. Update client-side validation for recommend union

### Agent C (UI Integration) needs to:

1. Add `mode` prop to `PersonalizedSuggestionsCard`
2. Branch on `recommend.type` for rendering:
   - `consider_adding` → category + attributes (existing)
   - `styling_tip` → tip text (new)
3. Add NEAR fetch logic to results.tsx
4. Implement Mode B suppression with timeout fallback

---

## Testing

### Manual Verification

1. **NEAR mode** - POST with `near_matches` array, empty `top_matches`:
   - Verify `meta.mode === "near"`
   - Verify `to_elevate[].recommend.type === "styling_tip"`

2. **Paired mode** - POST with `top_matches` only:
   - Verify `meta.mode === "paired"`
   - Verify `to_elevate[].recommend.type === "consider_adding"`

3. **Solo mode** - POST with both arrays empty:
   - Verify `meta.mode === "solo"`
   - Verify `why_it_works[].mentions === []`

### Edge Cases

- Invalid mentions in NEAR response → stripped, `wasRepaired: true`
- Model returns `consider_adding` in NEAR mode → converted to `styling_tip`
- Model returns `styling_tip` in paired mode → converted to `consider_adding`

---

## Files NOT Modified (Agent B/C Scope)

- `src/lib/personalized-suggestions-service.ts`
- `src/lib/types.ts`
- `src/lib/analytics.ts`
- `src/components/PersonalizedSuggestionsCard.tsx`
- `src/app/results.tsx`

---

## Checklist Reference

All 12 Agent A items marked complete in:
`docs/handoff/unified-ai-styling-suggestions-review-checklist.md`

- Mode Derivation (Server-side): 3/3 ✓
- NEAR Prompt: 3/3 ✓
- Unified Response Schema: 2/2 ✓
- Validation (Server-side): 4/4 ✓

---

## Deployment Notes

Deploy with:
```bash
supabase functions deploy personalized-suggestions --no-verify-jwt
```

No database migrations required - uses existing `personalized_suggestions_cache` table.

---

**Implementation Complete.** Ready for Agent B (Client Service) and Agent C (UI Integration) to proceed.
