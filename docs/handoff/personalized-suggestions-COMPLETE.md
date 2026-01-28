# Personalized Suggestions - COMPLETE Handoff (2026-01-27)

**Status:** ✅ Feature complete, latest fixes included  
**Scope:** Service + validation + cache + UI integration + add-ons alignment + tests  
**Primary files:**  
- `src/lib/personalized-suggestions-service.ts`  
- `src/components/PersonalizedSuggestionsCard.tsx`  
- `src/app/results.tsx`  
- `src/lib/__tests__/personalized-suggestions-service.test.ts`  

---

## Executive Summary

Personalized suggestions are fully integrated on the Results screen (HIGH tab only), using a cache-first service with strong validation and fail-open UI. Recent fixes include:
- Mode A suppression while AI suggestions are **loading or present**.
- Scan-category filtering + deterministic backfill for `to_elevate`.
- Add-ons–aware preference that only activates on HIGH tab **when add-ons are visible**.
- Single add-on category → second bullet comes from a core shortlist (shoes, tops).
- Cache repair + schema version bump.

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

- Cache key: `sha256(scanId|topIdsSorted|wardrobeSummary.updated_at|PROMPT_VERSION|SCHEMA_VERSION)`
- **SCHEMA_VERSION = 2** (bumped due to new validation rules).
- Cache hit still runs validation/repair; telemetry records `was_repaired`.
- Timeout: **7500ms** (slightly under Edge Function 8000ms).
- Fail-open: UI shows nothing on error/timeout.
- Dev-only structured log if scan-category filtering occurs:
  - `scanId`, `scanCategory`, `removedCategories`, `source`, `wasRepaired`, `promptVersion`, `schemaVersion`

---

## Validation & Repair (Critical Logic)

**Exported:** `validateAndRepairSuggestions(data, validIds, scanCategory?, preferAddOnCategories?, addOnCategories?)`

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

### Fetch gating
- Requires `trustFilterResult.isFullyReady`
- Requires `scanSignals` and `currentCheckId`
- Requires ≥1 high match
- Uses `trustFilterResult.scanSignals` (works for saved checks)

### AI card rendering
- Shows only on HIGH tab
- Uses `PersonalizedSuggestionsCard`
- Fail-open: loading skeleton then renders only on success

### Mode A suppression (HIGH tab)
- Suppress Mode A when **AI suggestions are loading or present**
- Mode A becomes fallback only when AI fails/timeout

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

---

## UI Components

**File:** `src/components/PersonalizedSuggestionsCard.tsx`

- **Why it works:** text rendered as-is + mentions rendered separately (never string-replaced).
- **To elevate:** “Consider adding: {attributes} {category}”.
- **Fail-open:** returns `null` if suggestions unavailable.
- **Skeleton:** minimal loading state.
- Uses design tokens (`typography`, `colors`, `cards`).

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

1. **Camera crash fix:** CameraView no longer has children (overlays moved to absolute layer).
2. **Mode A flicker fix:** hide Mode A when AI suggestions are loading.
3. **Scan-category filter:** remove `to_elevate` bullets matching scanned category.
4. **Add-on preference (soft):** aligns “To elevate” with add-ons when shown.
5. **Single add-on category → core shortlist** (shoes → tops).
6. **Cache validation:** cache hits run validation and track repairs.
7. **SCHEMA_VERSION bumped to 2**.
8. **Dev log** for scan-category removals (structured, quiet).
9. **Add-ons title stability fix (Jan 28):** Title now based on eligibility (HIGH tab + has core matches), not AI readiness. Prevents flicker during AI loading.

---

## Config Constants

`src/lib/personalized-suggestions-service.ts`:
- `PROMPT_VERSION = 1`
- `SCHEMA_VERSION = 2`
- `TIMEOUT_MS = 7500`

---

## Cache Contract (DB)

Table: `personalized_suggestions_cache`
- Unique: `(user_id, cache_key)`
- TTL: `expires_at` (7 days default)
- `increment_suggestions_cache_hit(p_cache_key)` updates `hit_count` + `last_hit_at`

Cache key:  
`sha256(scanId | topIds_sorted | wardrobeSummary.updated_at | PROMPT_VERSION | SCHEMA_VERSION)`

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

