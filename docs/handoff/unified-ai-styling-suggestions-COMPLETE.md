# Unified AI Styling Suggestions - Implementation Complete

**Agents:** A (Backend) ✓, B (Client Service) ✓, C (UI Integration) ✓
**Status:** All Phases Complete (1-5)
**Date:** 2026-01-28 (Phase 1), 2026-01-29 (Phase 2-5)
**Files Modified:**
- `src/lib/useTrustFilter.ts` (Agent C - Phase 1 Bug Fix)
- `supabase/functions/personalized-suggestions/index.ts` (Agent A)
- `src/lib/types.ts` (Agent B)
- `src/lib/personalized-suggestions-service.ts` (Agent B)
- `src/lib/analytics.ts` (Agent B)
- `src/lib/__tests__/personalized-suggestions-service.test.ts` (Agent B)
- `src/components/PersonalizedSuggestionsCard.tsx` (Agent C)
- `src/app/results.tsx` (Agent C)

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
  promptVersion: 3,  // PROMPT_VERSION
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
    "promptVersion": 3,
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

## Critical Bug Fixes (2026-01-28/29)

### Client-Side Validation Input Bug

**Status:** ✅ Fixed in commit `9b9dc7d`

**Problem:** Client passed entire API response object to validation function:
```typescript
// BUGGY CODE (before fix):
const payload = await response.json();
const { suggestions } = validateAndRepairSuggestions(payload, validIds, mode, ...);
// payload = {ok: true, data: {...}, meta: {...}}
// But validateAndRepairSuggestions expects {why_it_works: [...], to_elevate: [...]}
```

**Impact:** 
- `raw.why_it_works` was always `undefined` (not at top level of payload)
- Client validation treated valid AI content as broken
- FALLBACK_WHY_IT_WORKS and FALLBACK_TO_ELEVATE replaced actual AI suggestions
- Affected **ALL modes** (paired, solo, near) since single fetch function is used

**Symptoms observed:**
- Solo mode: Generic "The colors and styles complement each other well" (duplicate text)
- Edge function logs showed AI returned high-quality, item-specific content
- Client logs showed `was_repaired: true` even when AI output was valid

**Root cause:** Validation function expected suggestions object at top level, but received wrapped API response.

**Fix applied:**
```typescript
// FIXED CODE:
const payload = await response.json();
const rawSuggestions = payload?.data ?? payload;  // Extract data first
const { suggestions } = validateAndRepairSuggestions(rawSuggestions, validIds, mode, ...);
```

**Files modified:**
- `src/lib/personalized-suggestions-service.ts` (line 336)

**Verification:** After fix, brown leather jacket scan shows item-specific suggestions:
- "Layer over a graphic tee for an edgy, casual vibe"
- "Pair with distressed jeans to enhance the high statement"
- Recommends fitted tops and skinny jeans (not generic accessories)

### PROMPT_VERSION Bump (1 → 2 → 3)

**History:**
- **1 → 2 (2026-01-28):** Solo prompt updated to include `scannedCategory` parameter
- **2 → 3 (2026-01-29):** Added scanCategory to PAIRED and NEAR prompts for better AI context

**Reason:**
- PAIRED and NEAR prompts now include scanned item category
- AI can explain how matches relate to the specific scanned item
- Cache invalidation ensures users get improved, context-aware suggestions

**Files updated:**
- `src/lib/personalized-suggestions-service.ts` (line 34): `const PROMPT_VERSION = 3;`
- `supabase/functions/personalized-suggestions/index.ts` (line 28): `const PROMPT_VERSION = 3;`

**Impact:** Existing cached suggestions are naturally invalidated (cache key includes PROMPT_VERSION).

### Debugging Logs Added

**Server-side (Edge Function):**
- Raw AI response JSON logged before validation (line 743)
- Solo mode scan_category logging for diagnostics
- Helps diagnose future validation issues

**Client-side:**
- Telemetry events include `mentions_stripped_count` field
- Dev-only logs when scan category filtering occurs

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
  PROMPT_VERSION,  // 3 (bumped for scanCategory in PAIRED/NEAR prompts)
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
    prompt_version: 2;  // PROMPT_VERSION
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
    prompt_version: 2;  // PROMPT_VERSION
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

# Agent C: UI Integration Implementation Complete

**Agent:** C (UI Integration)
**Status:** Complete
**Date:** 2026-01-28 (Phase 1 Bug Fix), 2026-01-29 (Phase 4-5 UI Integration)
**Files Modified:**
- `src/lib/useTrustFilter.ts` (Phase 1 Bug Fix)
- `src/components/PersonalizedSuggestionsCard.tsx`
- `src/app/results.tsx`

---

## Summary

Implemented UI integration for NEAR mode AI styling suggestions, including mode-aware component rendering, NEAR tab fetch logic with timeout fallback, and Mode B suppression. Also fixed solo mode bug where 0 total matches prevented AI suggestions.

---

## Phase 1: Bug Fix - Solo Mode with 0 Total Matches

### Problem
Solo mode AI suggestions failed when wardrobe had items but 0 total matches (no HIGH + no NEAR). Root cause: early return in `useTrustFilter.ts` skipped `scanSignals` fetching when `matches.length === 0`.

### Fix

**File:** `src/lib/useTrustFilter.ts` (lines 274-276)

**Before:**
```typescript
// Skip if no matches to filter
if (confidenceResult.matches.length === 0) {
  return;
}
```

**After:**
```typescript
// Note: Don't skip when matches.length === 0
// Solo mode needs scanSignals even with 0 matches
// Wardrobe signals fetching has its own guard (matchedItemIds.length > 0)
```

**Impact:** Solo mode AI now triggers with 0 total matches. Wardrobe signals guard at line 335 prevents unnecessary fetching.

---

## Phase 4-5: UI Integration

### 1. PersonalizedSuggestionsCard Component Updates

**File:** `src/components/PersonalizedSuggestionsCard.tsx`

#### Added Mode Prop (Line 29)
```typescript
export interface PersonalizedSuggestionsCardProps {
  suggestions: PersonalizedSuggestions | null;
  isLoading: boolean;
  wardrobeItemsById: Map<string, WardrobeItem>;
  isSoloMode?: boolean;
  mode?: "paired" | "solo" | "near";  // NEW
}
```

#### Mode-Aware Section Titles (Lines 237-247)
```typescript
// Derive effective mode (use mode prop if provided, otherwise fallback to isSoloMode)
const effectiveMode = mode ?? (isSoloMode ? "solo" : "paired");

// Section titles change based on mode
const whyItWorksTitle =
  effectiveMode === "near"
    ? "Why it's close"
    : effectiveMode === "solo"
    ? "How to style it"
    : "Why it works";

const toElevateTitle =
  effectiveMode === "near"
    ? "How to upgrade"
    : effectiveMode === "solo"
    ? "What to add first"
    : "To elevate";
```

#### Recommend Union Rendering (Lines 157-177)
Updated `ToElevateBullet` to branch on `recommend.type`:

```typescript
{bullet.recommend.type === "consider_adding" ? (
  <>
    <Text style={...}>
      Consider adding: {bullet.recommend.attributes.join(", ") + " "}
      {bullet.recommend.category}
    </Text>
    <Text style={...}>{bullet.text}</Text>
  </>
) : (
  // styling_tip type - render tip directly as primary text
  <>
    <Text style={...}>
      {bullet.recommend.tip}
    </Text>
    {bullet.text && (
      <Text style={...}>{bullet.text}</Text>
    )}
  </>
)}
```

**Key change:** `styling_tip` renders the tip text as the main content, not "Consider adding: ..."

---

### 2. Results Screen Updates

**File:** `src/app/results.tsx`

#### NEAR Suggestions State (Lines 2001-2004)
```typescript
// NEAR tab AI suggestions (separate state from HIGH)
const [nearSuggestionsResult, setNearSuggestionsResult] = useState<SuggestionsResult | null>(null);
const [nearSuggestionsLoading, setNearSuggestionsLoading] = useState(false);
const [nearSuggestionsTimedOut, setNearSuggestionsTimedOut] = useState(false);
```

#### Stable Key for Double-Fetch Prevention (Lines 2545-2550)
```typescript
// Stable key to prevent double-fetch on tab switching
const nearFinalIdsKey = useMemo(() => {
  return trustFilterResult.finalized.nearFinal
    .map(m => m.wardrobeItem.id)
    .sort()
    .join('|');
}, [trustFilterResult.finalized.nearFinal]);
```

#### NEAR Fetch Effect (Lines 2558-2642)
- Fetches NEAR AI when `nearFinal.length > 0`
- 10-second timeout for fast fallback to Mode B
- Passes `nearFinal` array to service, empty `highFinal`
- Includes extensive debug logging

```typescript
useEffect(() => {
  // Wait for trust filter to be fully ready
  if (!trustFilterResult.isFullyReady) return;
  if (!currentCheckId || !trustFilterResult.scanSignals) return;
  if (!wardrobeSummary?.updated_at) return;

  const nearFinal = trustFilterResult.finalized.nearFinal;
  if (nearFinal.length === 0) {
    setNearSuggestionsResult(null);
    setNearSuggestionsLoading(false);
    return;
  }

  setNearSuggestionsLoading(true);
  setNearSuggestionsTimedOut(false);

  // Set 10s timeout for fast fallback
  const timeoutId = setTimeout(() => {
    setNearSuggestionsTimedOut(true);
  }, 10000);

  fetchPersonalizedSuggestions({
    scanId: currentCheckId,
    scanSignals: trustFilterResult.scanSignals,
    highFinal: [],  // Empty for NEAR mode
    nearFinal: nearFinal,  // NEAR matches
    wardrobeSummary,
    intent,
    scanCategory: scannedItem?.category ?? null,
    preferAddOnCategories: false,
    addOnCategories: [],
  })
    .then((result) => {
      clearTimeout(timeoutId);
      setNearSuggestionsResult(result);
      setNearSuggestionsLoading(false);
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      setNearSuggestionsResult(null);
      setNearSuggestionsLoading(false);
    });
}, [
  trustFilterResult.isFullyReady,
  nearFinalIdsKey,  // Stable key prevents double-fetch
  trustFilterResult.scanSignals,
  currentCheckId,
  wardrobeSummary?.updated_at,
  fromScan,
  scannedItem?.category,
]);
```

#### Mode B Suppression with Timeout (Lines 3179-3190)
```typescript
if (!isHighTab && hasNearContent) {
  // CRITICAL: Suppress Mode B when NEAR AI is loading or succeeded
  // Allow Mode B to show if AI timed out (fast fallback)
  const shouldSuppressModeB = 
    !nearSuggestionsTimedOut &&
    (nearSuggestionsLoading || nearSuggestionsResult?.ok);
  
  if (shouldSuppressModeB) {
    return []; // NEAR AI suggestions take priority
  }
  
  // Mode B computation continues here if not suppressed...
}
```

**Key behavior:** Mode B only suppressed when AI is loading OR succeeded. If timeout fires or AI fails, Mode B renders immediately (never blank).

#### NEAR AI Card Rendering (Lines 5354-5363)
```typescript
{/* NEAR Tab AI Card - "Why it's close" / "How to upgrade" */}
{(nearSuggestionsLoading || (nearSuggestionsResult?.ok && nearSuggestionsResult.data)) && !isHighTab && (
  <Animated.View entering={FadeIn.delay(400)} style={{ marginBottom: spacing.md, marginTop: spacing.xs }}>
    <PersonalizedSuggestionsCard
      suggestions={nearSuggestionsResult?.ok ? nearSuggestionsResult.data : null}
      isLoading={nearSuggestionsLoading}
      wardrobeItemsById={wardrobeItemsById}
      mode="near"  // CRITICAL: passes mode prop for correct titles
    />
  </Animated.View>
)}
```

#### Solo Mode Gating Verification (Lines 3130-3142)
Already implemented correctly - uses `isCoreCategory()` filtering to exclude add-on matches (outerwear, bags, accessories) from solo gating. Solo triggers when `wardrobeCount > 0 && coreHigh.length === 0 && coreNear.length === 0`.

---

## Backward Compatibility

| Existing Flow | Status | Notes |
|---------------|--------|-------|
| **HIGH tab** | Unchanged | Existing `isHighTab` conditional preserved |
| **Paired mode** | Unchanged | Still uses HIGH tab logic, `mode` prop defaults to "paired" |
| **Solo mode** | Enhanced | Bug fix enables 0 total matches case; existing UI preserved via `isSoloMode` prop |
| **Mode A/B bullets** | Enhanced | Mode B now suppressed on NEAR tab when AI present |

---

## Files Modified

### Agent A (Backend)
- `supabase/functions/personalized-suggestions/index.ts`

### Agent B (Client Service)
- `src/lib/types.ts`
- `src/lib/personalized-suggestions-service.ts`
- `src/lib/analytics.ts`
- `src/lib/__tests__/personalized-suggestions-service.test.ts`

### Agent C (UI Integration)
- `src/lib/useTrustFilter.ts` (Bug Fix)
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

### Agent C (UI Integration + Bug Fix): 17/17 ✓
- Bug Fix (Solo Mode 0 Matches): 2/2 ✓
- UI Component Updates: 4/4 ✓ (1 CRITICAL)
- Solo Mode Gating: 2/2 ✓ (1 CRITICAL)
- NEAR Tab Fetch: 3/3 ✓ (1 CRITICAL)
- Mode B Suppression: 3/3 ✓ (1 CRITICAL)
- NEAR Rendering: 2/2 ✓

**Total: 43/43 items complete (13 CRITICAL)** ✓

---

## Deployment Notes

### Backend (Agent A)
```bash
supabase functions deploy personalized-suggestions --no-verify-jwt
```

### Client (Agent B + C)
No separate deployment - changes included in app bundle.

No database migrations required - uses existing `personalized_suggestions_cache` table.

---

## Testing Verification

### Manual QA Checklist

**NEAR Tab:**
1. Scan item with NEAR matches → switch to NEAR tab
2. Verify: AI loading skeleton appears (Mode B suppressed)
3. Verify: AI card shows "Why it's close" / "How to upgrade"
4. Verify: Styling tips render (not category recommendations)
5. Simulate timeout → verify Mode B appears after 10s

**Solo Mode (0 Total Matches):**
1. Scan item with wardrobe but 0 HIGH + 0 NEAR matches
2. Verify: Solo AI card appears with "How to style it" / "What to add first"
3. Verify: Falls back to Mode A if AI fails

**HIGH Tab (Regression):**
1. Scan item with HIGH matches
2. Verify: AI card shows "Why it works" / "To elevate" (unchanged)
3. Verify: Category recommendations work

### Unit Tests
Agent B: 45/45 tests passing ✓
```bash
npx jest src/lib/__tests__/personalized-suggestions-service.test.ts
```

---

## Recent Gating Fixes (2026-01-29)

### SOLO Mode Gating - Core Category Filtering

**Status:** ✅ Fixed - Reverted to core-only matching

**Problem:** Earlier fix used `hasAnyNearMatches` (total matches) for SOLO gating, which prevented SOLO mode when add-on NEAR matches existed.

**Solution:** Reverted to original core-based logic:

```typescript
// Check CORE categories only - add-ons don't count
const coreHighMatches = trustFilterResult.finalized.highFinal.filter(m =>
  isCoreCategory(m.wardrobeItem.category as Category)
);
const coreNearMatches = trustFilterResult.finalized.nearFinal.filter(m =>
  isCoreCategory(m.wardrobeItem.category as Category)
);

const canFetchSoloAi = 
  trustFilterResult.isFullyReady &&
  wardrobeSummary?.updated_at &&
  wardrobeCount > 0 &&
  coreHighMatches.length === 0 &&  // Only CORE matches count
  coreNearMatches.length === 0;    // Add-ons ignored
```

**Why this matters:**
- Add-on matches (outerwear, bags, accessories) can't form complete outfits
- User with only add-on matches needs SOLO mode styling guidance
- Core categories: tops, bottoms, dresses, shoes, skirts

**Files modified:**
- `src/app/results.tsx` (lines 2426-2431)

**Commit:** `92864e6`

---

### NEAR Mode AI Gating - Requires Core Matches

**Status:** ✅ Implemented

**Requirement:** NEAR AI should only trigger when there's at least 1 **core** NEAR match.

**Implementation (src/app/results.tsx lines 2580-2595):**

```typescript
// Filter to CORE near matches only
const coreNearMatches = nearFinal.filter(m =>
  isCoreCategory(m.wardrobeItem.category as Category)
);

if (coreNearMatches.length === 0) {
  // No core NEAR matches - skip NEAR AI (SOLO will handle it)
  setNearSuggestionsResult(null);
  setNearSuggestionsLoading(false);
  return;
}
```

**Behavior:**
- Add-on NEAR matches don't trigger NEAR AI
- Prevents NEAR AI when only accessories/bags/outerwear match
- Falls through to SOLO mode when appropriate

**Files modified:**
- `src/app/results.tsx` (lines 2580-2595)

**Commit:** `92864e6`

---

### Only Core NEAR Matches Sent to AI

**Status:** ✅ Implemented

**Problem:** AI was receiving ALL NEAR matches (core + add-ons), but NEAR tab only displays core matches. AI could reference items user can't see.

**Solution:** Send only core NEAR matches to AI:

```typescript
// Line 2638 - Only send CORE near matches
nearFinal: coreNearMatches,  // Not all nearFinal
```

**Benefits:**
- AI only references visible items on NEAR tab
- No confusing mentions of add-ons
- Cleaner, more focused recommendations

**Files modified:**
- `src/app/results.tsx` (line 2638)

**Commit:** `dac50e5`

---

### NEAR Tab Add-ons Removal

**Status:** ✅ Implemented (after Jan 28)

**Rationale:**
- NEAR matches are "Worth trying" (uncertain outfits)
- User should focus on making outfit work, not accessorizing
- Add-ons are for confident matches only (HIGH tab)

**Implementation:**
- Both `OptionalAddOnsStrip` and `AddOnsBottomSheet` have `if (!isHighTab) return null` guards
- `nearAddOns` useMemo removed from results.tsx
- Comments added for clarity

**User impact:**
- Clearer mental model: add-ons = confident matches
- NEAR tab focuses solely on outfit viability
- Less overwhelming UI on NEAR tab

**Files modified:**
- `src/app/results.tsx` (lines 4999-5001, 5576-5577)
- `src/components/OptionalAddOnsStrip.tsx` (early return guard)
- `src/components/AddOnsBottomSheet.tsx` (early return guard)

**Documentation:** See `docs/handoff/compact-addons-strip-COMPLETE.md`

---

### scanCategory Context in Prompts

**Status:** ✅ Implemented (PROMPT_VERSION = 3)

**Enhancement:** Added `scanCategory` parameter to `buildPrompt()` and `buildNearPrompt()` for better AI context.

**Impact:**
- PAIRED mode: AI explains how wardrobe items pair with the scanned item category
- NEAR mode: AI explains how to bridge the gap specific to the scanned item
- More relevant, item-specific recommendations

**Example:**
- **Before:** "The soft white dress offers a clean base for bold accessories"
- **After:** "The white dress's flowing silhouette balances the boldness of statement boots"

**Files modified:**
- `supabase/functions/personalized-suggestions/index.ts` (buildPrompt, buildNearPrompt)

---

## Gating Logic Summary

| Mode | Gating Condition | Add-on Matches Count? |
|------|------------------|----------------------|
| **PAIRED** | `coreHighMatches.length > 0` | No - ignored |
| **NEAR AI** | `coreNearMatches.length > 0` | No - ignored |
| **SOLO** | `coreHigh === 0 && coreNear === 0` | No - ignored |

All three modes use **core category filtering** to determine eligibility. Add-on matches (outerwear, bags, accessories) don't affect AI mode selection.

---

**All Phases Complete (1-5).** Ready for production deployment and user testing.

**Last Updated:** 2026-01-29

---

## Related Optimizations

This feature benefits from two infrastructure improvements:

### Parallel Style Signals Pre-fetch
- Style signals are now fetched **in parallel** with image analysis at scan start
- Trust Filter finds cached signals instantly (no 10s timeout)
- AI suggestions can start processing sooner
- See: [Parallel Style Signals](./parallel-style-signals-COMPLETE.md)

### Proactive Wardrobe Enrichment
- Style signals now generated **immediately** after wardrobe item image upload
- Signals ready for first scan (no "rescan twice" UX issue)
- Lazy enrichment still provides fallback if signals missing
- Trust Filter sees signals on first evaluation

### Claude Sonnet 4.5 Migration
- `analyze-image` and `style-signals` Edge Functions switched from GPT-4o to Claude Sonnet 4.5
- Faster latency (~4.3s vs ~8s for style-signals)
- Better style interpretation accuracy
- See: [Claude Sonnet Migration](./claude-sonnet-migration-COMPLETE.md)

**Combined Impact:** Scan-to-AI-suggestions time reduced from ~27s to ~12-15s.
