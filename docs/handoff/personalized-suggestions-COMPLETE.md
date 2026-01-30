# Personalized Suggestions - COMPLETE Handoff

**Status:** ✅ Feature complete, latest fixes included  
**Last Updated:** January 29, 2026  
**Scope:** Service + validation + cache + UI integration + add-ons alignment + tests + SOLO/NEAR modes  
**Primary files:**  
- `src/lib/personalized-suggestions-service.ts`  
- `src/components/PersonalizedSuggestionsCard.tsx`  
- `src/app/results.tsx`  
- `src/lib/__tests__/personalized-suggestions-service.test.ts`  

---

## Executive Summary

Personalized suggestions are fully integrated on the Results screen across **three modes** (PAIRED, NEAR, SOLO), using a cache-first service with strong validation and fail-open UI. Recent implementations include:
- **SOLO mode** - Styling suggestions when 0 HIGH + 0 NEAR core matches exist
- **NEAR mode** - AI suggestions for "Worth trying" matches with unique titles
- **PAIRED mode** - Original "Why it works" suggestions for HIGH matches
- Mode A suppression while AI suggestions are **loading or present** (HIGH tab and SOLO mode)
- Scan-category filtering + deterministic backfill for `to_elevate`
- Add-ons–aware preference that only activates on HIGH tab **when add-ons are visible**
- Single add-on category → second bullet comes from a core shortlist (shoes, tops)
- Cache repair + schema version bump
- NEAR tab add-ons removed (focuses on making outfit work, not accessorizing)

---

## Response Schema (Edge Function / Service)

**Success:**
```json
{
  "ok": true,
  "data": {
    "version": 1,
    "why_it_works": [
      { "text": "...", "mentions": ["ITEM_ID", "ITEM_ID"] },
      { "text": "...", "mentions": ["ITEM_ID"] }
    ],
    "to_elevate": [
      {
        "text": "...",
        "recommend": {
          "type": "consider_adding",
          "category": "tops|bottoms|shoes|outerwear|dresses|accessories|bags|skirts",
          "attributes": ["attr1", "attr2"]
        }
      },
      {
        "text": "...",
        "recommend": {
          "type": "consider_adding",
          "category": "tops|bottoms|shoes|outerwear|dresses|accessories|bags|skirts",
          "attributes": ["attr1", "attr2"]
        }
      }
    ]
  },
  "meta": {
    "source": "ai_call|cache_hit",
    "latencyMs": 1234,
    "wasRepaired": false,
    "promptVersion": 1,
    "schemaVersion": 2
  }
}
```

**Error:**
```json
{
  "ok": false,
  "error": {
    "kind": "timeout|network|unauthorized",
    "message": "..."
  }
}
```

---

## Service Behavior (Cache + Fetch)

**File:** `src/lib/personalized-suggestions-service.ts`

- Cache key: `sha256(scanId|topIds|nearIds|wardrobeSummary.updated_at|PROMPT_VERSION|SCHEMA_VERSION|mode:X|scanCat:X|preferAddOns:X)`
- **PROMPT_VERSION = 3** (bumped from 2 for scanCategory in PAIRED/NEAR prompts)
- **SCHEMA_VERSION = 2** (bumped due to new validation rules)
- Cache hit still runs validation/repair; telemetry records `was_repaired`.
- Timeout: **7500ms** (slightly under Edge Function 8000ms).
- Fail-open: UI shows nothing on error/timeout.
- Dev-only structured log if scan-category filtering occurs:
  - `scanId`, `scanCategory`, `removedCategories`, `source`, `wasRepaired`, `promptVersion`, `schemaVersion`

---

## Validation & Repair (Critical Logic)

**Exported:** `validateAndRepairSuggestions(data, validIds, mode?, scanCategory?, preferAddOnCategories?, addOnCategories?)`

**Mode parameter:** `"paired" | "solo" | "near"` - affects mention stripping behavior in SOLO mode

### Always enforced
- Exactly **2** `why_it_works` + **2** `to_elevate`
- Text trimmed to 100 chars (word-boundary smartTrim)
- Mentions stripped if not in `validIds`
- `recommend.type` forced to `"consider_adding"`
- `category` clamped to allowed list (invalid → `accessories`)
- `attributes` filtered to strings, max 4; fallback `["simple"]`

### Scan-category filter
- If `bullet.recommend.category === scanCategory`, remove it.
- Backfill to keep exactly 2 bullets.

### Add-ons preference (soft)
**Gating rule:** enabled only when all are true:
- HIGH tab (Wear now)
- Add-ons strip is visible (has ≥1 add-on category)

**Behavior:**
- If at least one add-on bullet exists **and** add-on categories ≥ 2 → keep only add-on bullets.
- If add-on categories = 1 → keep the add-on bullet and choose bullet 2 from a **core shortlist**:
  - `shoes`, then `tops`
  - Scan-category filter still applies.
  - No duplicates.
- If no add-on bullets → core recommendations remain unchanged.

### Deterministic backfill
- Default fallback order:
  - `accessories → bags → outerwear → shoes → tops → bottoms → skirts → dresses`
- Single add-on category case uses core shortlist (`shoes`, `tops`) before the normal core order.

---

## UI Integration (Results Screen)

**File:** `src/app/results.tsx`

### Mode Derivation (Server-Side)

Mode is derived in the Edge Function based on match counts:
```typescript
const derivedMode = nearMatches.length > 0 
  ? 'near' 
  : topMatches.length === 0 
    ? 'solo' 
    : 'paired';
```

### Fetch Gating

**PAIRED mode:**
- Requires `trustFilterResult.isFullyReady`
- Requires `scanSignals` and `wardrobeSummary.updated_at`
- Requires ≥1 **core** HIGH match
- Uses `trustFilterResult.scanSignals` (works for saved checks)

**NEAR mode:**
- Requires `trustFilterResult.isFullyReady`
- Requires ≥1 **core** NEAR match (add-on matches don't count)
- Only sends **core** NEAR matches to AI (not add-ons)

**SOLO mode:**
- Requires `trustFilterResult.isFullyReady`
- Requires `wardrobeSummary.updated_at` (for stable cache key)
- Requires `wardrobeCount > 0`
- Requires 0 core HIGH matches AND 0 core NEAR matches
- Add-on matches don't count - only core categories affect gating

### AI Card Rendering

**PAIRED mode (HIGH tab):**
- Uses `PersonalizedSuggestionsCard` with default props
- Section titles: "Why it works" / "To elevate"
- Fail-open: loading skeleton then renders only on success

**NEAR mode (NEAR tab):**
- Uses `PersonalizedSuggestionsCard` with `mode="near"` prop
- Section titles: "Why it's close" / "How to upgrade"
- Fail-open: loading skeleton then renders only on success

**SOLO mode (after Verdict card):**
- Uses `PersonalizedSuggestionsCard` with `isSoloMode={true}` prop
- Section titles: "How to style it" / "What to add first"
- **Never shows blank:** Always shows AI card (loading/success) OR Mode A fallback

### Mode A Suppression
- Suppress Mode A when **AI suggestions are loading or present**
- Applies to **HIGH tab** (PAIRED mode) and **SOLO mode**
- Mode A becomes fallback only when AI fails/timeout
- NEAR tab keeps Mode A always (different purpose)

---

## Add-ons Integration (Optional Add-ons Strip)

**Files:**  
- `src/components/OptionalAddOnsStrip.tsx`  
- `src/components/AddOnsBottomSheet.tsx`  
- `src/lib/add-ons-sorting.ts`

AI suggestions influence **sorting only** (not title).

**Title logic (stable):**
- HIGH tab + has core matches + has add-ons → "Suggested add-ons"
- Otherwise → "Finish the look"
- Determined upfront based on eligibility, prevents flicker during AI loading
- AI loading/failure doesn't affect title, only affects item ordering

**HIGH tab only:**
- Add-ons strip and bottom sheet only render on HIGH tab
- NEAR tab does not show add-ons (removed after Jan 28)
- Both components have `if (!isHighTab) return null` guards
- Reasoning: NEAR tab focuses on making outfit work, not accessorizing

---

## UI Components

**File:** `src/components/PersonalizedSuggestionsCard.tsx`

- **Why it works:** text rendered as-is + mentions rendered separately (never string-replaced).
- **To elevate:** “Consider adding: {attributes} {category}”.
- **Fail-open:** returns `null` if suggestions unavailable.
- **Skeleton:** minimal loading state.
- Uses design tokens (`typography`, `colors`, `cards`).

### Props
- `suggestions?: PersonalizedSuggestions | null` - AI suggestions data
- `isLoading?: boolean` - Loading state
- `wardrobeItemsById: Map<string, WardrobeItem>` - For mention resolution
- `isSoloMode?: boolean` - Legacy prop for SOLO mode (deprecated, use `mode` instead)
- `mode?: "paired" | "solo" | "near"` - Current mode for title selection

### Section Titles (Mode-Aware)

**PAIRED mode (default):**
- Section 1: "Why it works"
- Section 2: "To elevate"

**NEAR mode:**
- Section 1: "Why it's close"
- Section 2: "How to upgrade"

**SOLO mode:**
- Section 1: "How to style it"
- Section 2: "What to add first"

**Note:** SOLO mode mentions array is empty (validation strips them unconditionally).

---

## SOLO Mode Implementation

**Status:** ✅ Fully implemented and operational

### Trigger Conditions
SOLO mode activates when:
- `trustFilterResult.isFullyReady` (matches finalized)
- `wardrobeSummary.updated_at` exists (for stable cache key)
- `wardrobeCount > 0` (user has wardrobe items)
- `coreHighMatches.length === 0` (no core HIGH matches)
- `coreNearMatches.length === 0` (no core NEAR matches)
- **Add-on matches don't count** - only core categories affect gating

### Edge Function (Server-Side)
**File:** `supabase/functions/personalized-suggestions/index.ts`

- `buildSoloPrompt()` function (lines 193-238)
- Mode derived from `top_matches.length === 0` (not from request body)
- Uses `wardrobeSummary.dominant_aesthetics` for personalization
- Explicit prompt rules prevent ownership language ("with your...")
- Validation strips **all** mentions unconditionally

### Client Service
**File:** `src/lib/personalized-suggestions-service.ts`

- Accepts empty `highFinal` array (no early return)
- Cache key includes `mode:solo`
- `topIds` is empty string for SOLO mode

### UI Rendering
**File:** `src/app/results.tsx`

- Renders **after Verdict card, before add-ons strip**
- **Never shows blank:** Always shows AI card (loading/success) OR Mode A fallback
- Uses `PersonalizedSuggestionsCard` with `isSoloMode={true}` prop
- Section titles: "How to style it" / "What to add first"
- Mode A suppressed while AI loading (same as HIGH tab)

---

## NEAR Mode Implementation

**Status:** ✅ Fully implemented and operational

### Trigger Conditions
NEAR mode activates when:
- `trustFilterResult.isFullyReady` (matches finalized)
- `coreNearMatches.length > 0` (at least 1 core NEAR match)
- **Add-on matches don't count** - only core categories trigger NEAR AI

### Edge Function (Server-Side)
**File:** `supabase/functions/personalized-suggestions/index.ts`

- `buildNearPrompt()` function (lines 244-302)
- Mode derived from `near_matches.length > 0` (checked first in decision tree)
- Has `scanCategory` parameter for context
- Explicit prompt rules: "connect to scanned item", "explain why it's close"
- Focus: HOW to make near matches work, not standalone descriptions

### Client Service
**File:** `src/lib/personalized-suggestions-service.ts`

- Accepts `nearFinal` array
- Cache key includes `mode:near` and `nearIds`
- Only **core** NEAR matches sent to AI (add-ons excluded)

### Client Gating
**File:** `src/app/results.tsx` (lines 2580-2595)

- Filters to core NEAR matches only: `isCoreCategory(m.wardrobeItem.category)`
- Early return if `coreNearMatches.length === 0`
- Prevents AI from referencing items not visible on NEAR tab

### UI Rendering
**File:** `src/app/results.tsx`

- Renders on **NEAR tab only**
- Uses `PersonalizedSuggestionsCard` with `mode="near"` prop
- Section titles: "Why it's close" / "How to upgrade"
- NEAR tab does **not** show add-ons strip (removed after Jan 28)

---

## Telemetry

Tracked events:
- `personalized_suggestions_started`
- `personalized_suggestions_completed` (includes `was_repaired`)
- `personalized_suggestions_failed`
- `personalized_suggestions_cache_hit`

Versions (`prompt_version`, `schema_version`) included in events for analysis.

---

## Tests Added / Updated

**File:** `src/lib/__tests__/personalized-suggestions-service.test.ts`

Key coverage:
- Padding to exactly 2+2 bullets
- Text trimming behavior
- Mention ID validation
- Category clamping
- Type enforcement
- Attributes validation
- Scan category filtering + backfill
- Add-on preference behavior (>=2 categories, single category, none)
- Scan category `null` no-op
- Single add-on category:
  - outerwear → bullet 2 is shoes/tops (not outerwear)
  - scanCategory = shoes → bullet 2 is tops

---

## Recent Fixes & Changes

1. **Critical: Client validation input bug (2026-01-28/29)** - Fixed payload.data extraction before validation. Client was passing entire API response `{ok, data, meta}` to `validateAndRepairSuggestions()` instead of just the suggestions object. This caused valid AI content to be replaced with FALLBACK text across **all modes** (paired, solo, near). Fix: `const rawSuggestions = payload?.data ?? payload;` before validation. Commit: `9b9dc7d`.
2. **PROMPT_VERSION bumped from 1 to 2 (2026-01-28)** - Solo prompt enhanced with scannedCategory parameter. Cache invalidation ensures users get improved suggestions.
3. **Camera crash fix:** CameraView no longer has children (overlays moved to absolute layer).
4. **Mode A flicker fix:** hide Mode A when AI suggestions are loading.
5. **Scan-category filter:** remove `to_elevate` bullets matching scanned category.
6. **Add-on preference (soft):** aligns “To elevate” with add-ons when shown.
7. **Single add-on category → core shortlist** (shoes → tops).
8. **Cache validation:** cache hits run validation and track repairs.
9. **SCHEMA_VERSION bumped to 2**.
10. **Dev log** for scan-category removals (structured, quiet).
11. **Add-ons title stability fix (Jan 28):** Title now based on eligibility (HIGH tab + has core matches), not AI readiness. Prevents flicker during AI loading.
12. **NEAR tab add-ons removed (after Jan 28)** - Add-ons no longer displayed on NEAR tab; only HIGH tab shows add-ons. NEAR tab focuses on making outfit work, not accessorizing.
13. **PROMPT_VERSION bumped to 3** - Added scanCategory to PAIRED and NEAR prompts for better AI context about scanned item.
14. **SOLO mode fully implemented** - `buildSoloPrompt()`, mode derivation, gating logic, and UI support complete. AI provides styling guidance when 0 core matches exist.
15. **NEAR mode gating** - Requires at least 1 core NEAR match; add-on matches don't count. Prevents SOLO mode from triggering when only add-on near matches exist.
16. **Only core NEAR matches sent to AI** - AI can only reference visible items on NEAR tab (add-ons excluded from payload).

---

## Config Constants

`src/lib/personalized-suggestions-service.ts`:
- `PROMPT_VERSION = 3` (bumped from 2 for scanCategory in PAIRED/NEAR prompts)
- `SCHEMA_VERSION = 2`
- `TIMEOUT_MS = 7500`

`supabase/functions/personalized-suggestions/index.ts`:
- `buildPrompt()` - PAIRED mode prompt builder (has scanCategory parameter)
- `buildNearPrompt()` - NEAR mode prompt builder (has scanCategory parameter)
- `buildSoloPrompt()` - SOLO mode prompt builder (uses wardrobeSummary for personalization)

---

## Cache Contract (DB)

Table: `personalized_suggestions_cache`
- Unique: `(user_id, cache_key)`
- TTL: `expires_at` (7 days default)
- `increment_suggestions_cache_hit(p_cache_key)` updates `hit_count` + `last_hit_at`

Cache key format:  
```
sha256(
  scanId | 
  topIds | 
  nearIds | 
  wardrobeSummary.updated_at | 
  PROMPT_VERSION | 
  SCHEMA_VERSION | 
  mode:X | 
  scanCat:X | 
  preferAddOns:X
)
```

Where:
- `topIds` = empty string for SOLO mode
- `nearIds` = empty string for PAIRED/SOLO modes
- `mode` = `"solo"` | `"paired"` | `"near"`
- `scanCat` = scanned category or `"null"`
- `preferAddOns` = `1` or `0`

Note: PROMPT_VERSION = 3 (bumped for scanCategory in PAIRED/NEAR prompts)

---

## Privacy/Security

Only safe enums + IDs sent to model:
- Wardrobe item **IDs**, category, dominant color, aesthetic, optional AI label.
- Wardrobe summary (counts, dominant aesthetics, updated_at).
- Scan style signals (enum values).

No item names, photos, or user-provided descriptions are sent.

---

## Manual QA Checklist (Recommended)

- Scan with 2+ high matches → card appears with two sections.
- Cache hit path works and respects scan-category filter.
- Saved checks still show suggestions (trustFilter scan signals).
- Add-ons present → “To elevate” aligns with add-ons; single add-on gives shoes/tops.
- Scan category filter removes same-category recommendations.
- Mode A stays hidden while AI suggestions load.


---

## Related Optimizations

This feature benefits from two infrastructure improvements:

### Parallel Style Signals Pre-fetch
- Style signals are now fetched **in parallel** with image analysis at scan start
- Trust Filter finds cached signals instantly (no 10s timeout)
- See: [Parallel Style Signals](./parallel-style-signals-COMPLETE.md)

### Claude Sonnet 4.5 Migration
- `analyze-image` and `style-signals` Edge Functions switched from GPT-4o to Claude Sonnet 4.5
- Faster latency (~4.3s vs ~8s for style-signals)
- Better style interpretation accuracy
- See: [Claude Sonnet Migration](./claude-sonnet-migration-COMPLETE.md)

**Combined Impact:** Scan-to-AI-suggestions time reduced from ~27s to ~12-15s.
