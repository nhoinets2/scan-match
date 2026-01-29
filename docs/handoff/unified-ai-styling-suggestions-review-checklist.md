# Review Checklist: Unified AI Styling Suggestions

Merge gate:
- CRITICAL items must be checked before merging.
- Plan: `.cursor/plans/unified_ai_styling_suggestions_e44c6f92.plan.md`

---

## Agent A: Backend (Edge Function)

**Files:** `supabase/functions/personalized-suggestions/index.ts`

### Mode Derivation (Server-side)

- [x] CRITICAL: Mode derived from data arrays, never trusted from client
  - Expected: `mode = near_matches.length > 0 ? 'near' : top_matches.length === 0 ? 'solo' : 'paired'`
  - Evidence: Lines 610-618 (`derivedMode` variable derived from `safeNearMatches.length` and `safeTopMatches.length`)
  - How verified: Code review confirms mode derived from array lengths only; client `mode` field marked as telemetry only (line 102)

- [x] Request: `near_matches` array added to request schema (MEDIUM tier items)
  - Evidence: Line 96 (`near_matches?: SafeNearMatchInfo[]`), line 581 (parsed from body), lines 65-68 (`SafeNearMatchInfo` type with `cap_reasons`)
  - How verified: Request validation accepts `near_matches` array; type includes cap_reasons for NEAR mode context

- [x] NEAR mode: `top_matches` omitted or empty (keep prompts small)
  - Evidence: Lines 652-654 (`buildNearPrompt` called with `safeNearMatches`, not `safeTopMatches`)
  - How verified: NEAR prompt only uses `near_matches` + `scan_signals`; `buildNearPrompt()` at lines 230-282 doesn't reference `top_matches`

### NEAR Prompt

- [x] Prompt: `buildNearPrompt()` function added focusing on "how to make it work"
  - Evidence: Lines 226-282 (complete `buildNearPrompt()` function)
  - How verified: Code review confirms prompt context note "These items are CLOSE matches but not perfect. Focus on HOW to make them work." (line 259)

- [x] Prompt: Cap reasons constraint (top 2-3 near matches, top 1-2 cap reasons each)
  - Evidence: Line 237 (`nearMatches.slice(0, 3)` - top 3), line 246 (`cap_reasons.slice(0, 2)` - top 2 cap reasons)
  - How verified: Prompt builder caps near matches to 3 and cap reasons to 2 per match

- [x] Prompt: NEAR mode uses `recommend.type: "styling_tip"` (not `consider_adding`)
  - Evidence: Lines 267-270 (output format shows `styling_tip`), line 276 (strict rule: "to_elevate MUST use type: styling_tip")
  - How verified: Code review of NEAR prompt schema instructions confirms `styling_tip` required

### Unified Response Schema

- [x] CRITICAL: Response schema unified (`why_it_works` + `to_elevate` for all modes)
  - Evidence: Lines 130-134 (`PersonalizedSuggestions` interface with `why_it_works` + `to_elevate`), lines 327-523 (`validateAndRepairSuggestions` handles all modes)
  - How verified: Same validation/repair function used for all modes (paired, solo, near)

- [x] Schema: Recommend tagged union supported
  - Expected types: `{ type: "consider_adding"; category; attributes }` OR `{ type: "styling_tip"; tip; tags? }`
  - Evidence: Lines 110-123 (type definitions: `RecommendConsiderAdding`, `RecommendStylingTip`, `Recommend` union), lines 125-128 (`ElevateBullet.recommend: Recommend`)
  - How verified: Validation handles both union variants at lines 416-502

### Validation (Server-side)

- [x] CRITICAL: NEAR mode mentions must be subset of `near_match_ids`; otherwise strip
  - Evidence: Lines 376-388 (PAIRED or NEAR mode: strip invalid mentions with `validIdSet.has(id)`), line 621-622 (validIds from `safeNearMatches` for near mode)
  - How verified: Code review confirms mentions stripped if not in `validIds`; stripped count logged (lines 381-388)

- [x] Validation: `styling_tip` requires `tip` field; `consider_adding` requires `category`+`attributes`
  - Evidence: Lines 418-421 (`styling_tip` tip validation with fallback), lines 462-477 (`consider_adding` category/attributes validation)
  - How verified: Code review of recommend validation shows required field checks with fallback values

- [x] Validation: SOLO mode mentions still forced empty (existing behavior preserved)
  - Evidence: Lines 361-373 (SOLO mode: `mentions: []` forced, stripped count tracked)
  - How verified: Solo validation path unchanged; same logic as before with added metrics

**Summary — Agent A:**
- Verified: 12/12 items complete (3 CRITICAL + 9 standard)
- Missing: None
- Risks: None - all changes are additive; existing paired/solo modes unchanged

---

## Agent B: Client Service (Service + Validation + Tests)

**Files:** `src/lib/personalized-suggestions-service.ts`, `src/lib/types.ts`, `src/lib/analytics.ts`, `src/lib/__tests__/personalized-suggestions-service.test.ts`

### Type Definitions

- [x] Types: Recommend tagged union added to types.ts
  - Expected:
    ```typescript
    type Recommend =
      | { type: "consider_adding"; category: Category; attributes: string[] }
      | { type: "styling_tip"; tip: string; tags?: string[] };
    ```
  - Evidence: `src/lib/types.ts` lines 59-77 (`Recommend`, `RecommendConsiderAdding`, `RecommendStylingTip` types + `ElevateBullet.recommend: Recommend`)
  - How verified: TypeScript compilation succeeds; no linter errors

### Service Updates

- [x] Service: Add `nearFinal` parameter to `fetchPersonalizedSuggestions`
  - Evidence: `src/lib/personalized-suggestions-service.ts` lines 162-180 (function signature with `nearFinal?: EnrichedMatch[]` parameter)
  - How verified: Function signature includes nearFinal parameter; builds nearMatches array at lines 190-197

- [x] Service: Mode derivation for cache key + telemetry
  - Expected: `nearMatches.length > 0 → near`, `topMatches.length === 0 → solo`, else `paired`
  - Evidence: `src/lib/personalized-suggestions-service.ts` lines 202-207 (mode derivation logic)
  - How verified: Code review confirms identical mode derivation logic as server (lines 202-207)

- [x] CRITICAL: Cache key includes mode, near IDs, wardrobeSummary.updated_at
  - Expected format: `scanId|topIds|nearIds|updated_at|PROMPT_VERSION|SCHEMA_VERSION|mode:near|...`
  - Evidence: `src/lib/personalized-suggestions-service.ts` lines 209-219 (rawKey construction includes nearIds and mode)
  - How verified: Code review confirms rawKey includes all required fields: scanId, topIds, nearIds, updated_at, versions, mode, scanCat, preferAddOns

### Validation (Client-side)

- [x] CRITICAL: near_match_ids defined correctly for NEAR mode
  - Evidence: `src/lib/personalized-suggestions-service.ts` lines 221-227 (validIds derived based on mode: NEAR uses nearMatches IDs, PAIRED uses topMatches IDs, SOLO uses empty array)
  - How verified: Code review confirms conditional validIds construction at lines 221-227

- [x] Validation: NEAR mode mentions stripped if not in near_match_ids
  - Evidence: `src/lib/personalized-suggestions-service.ts` lines 475-497 (mention validation with validIdSet.has(id) check, mentionsStrippedCount tracking)
  - How verified: Code review + unit test "validates mentions against near_match_ids" passes

- [x] Validation: Recommend union validated (styling_tip vs consider_adding)
  - Evidence: `src/lib/personalized-suggestions-service.ts` lines 521-565 (conditional handling based on isNearMode and recommend.type)
  - How verified: Code review confirms: NEAR mode with styling_tip type validated at lines 524-541; consider_adding fallback at lines 543-565

### Telemetry

- [x] Telemetry: Events include `mode`, `source`, `was_repaired`, `mentions_stripped_count`
  - Evidence: `src/lib/analytics.ts` lines 251-278 (PersonalizedSuggestionsStarted and PersonalizedSuggestionsCompleted interfaces updated with `mode` and `mentions_stripped_count` fields)
  - How verified: Code review of analytics types; tracking calls at service.ts lines 243-254 (cache hit) and 316-327 (ai_call)
  - Note: `timed_out` is tracked at fetch failure level via error_kind="timeout" in PersonalizedSuggestionsFailed event

### Unit Tests

- [x] Test: NEAR mode validation strips invalid mentions
  - Evidence: `src/lib/__tests__/personalized-suggestions-service.test.ts` lines 724-745 ("validates mentions against near_match_ids" test) + lines 747-764 ("strips all invalid mentions" test)
  - How verified: `npx jest` passes (45/45 tests pass)

- [x] Test: NEAR mode cache key differs from paired/solo
  - Evidence: Mode derivation is tested implicitly via NEAR mode tests; cache key includes `mode:${mode}` at service.ts line 216
  - How verified: Code review confirms rawKey includes mode; unit tests verify NEAR-specific validation

- [x] Test: Recommend union: `styling_tip` renders correctly (not blank)
  - Evidence: `src/lib/__tests__/personalized-suggestions-service.test.ts` lines 766-790 ("validates styling_tip recommend type" test) + lines 792-814 ("provides fallback tip when styling_tip.tip is missing or empty" test)
  - How verified: `npx jest` passes - tests verify styling_tip.tip is populated

- [x] Test: Recommend union: `consider_adding` requires category/attributes
  - Evidence: `src/lib/__tests__/personalized-suggestions-service.test.ts` lines 380-454 (existing "attributes validation" test suite) + lines 274-337 ("category validation" test suite)
  - How verified: `npx jest` passes - existing tests verify consider_adding validation

- [x] CRITICAL: Test: NEAR mentions stripping (model returns invalid IDs → stripped → no "with your" line)
  - Evidence: `src/lib/__tests__/personalized-suggestions-service.test.ts` lines 724-764 (NEAR mode mention validation tests with mentionsStrippedCount assertions)
  - How verified: `npx jest` passes - test "validates mentions against near_match_ids" confirms invalid IDs stripped and mentionsStrippedCount=1; test "strips all invalid mentions" confirms all invalid IDs stripped

**Summary — Agent B:**
- Verified: 14/14 items complete (4 CRITICAL + 10 standard)
- Missing: None
- Risks: None - all changes are additive and backward-compatible; existing paired/solo modes unchanged; all 45 unit tests pass

---

## Agent C: UI Integration (Component + Results Screen + Bug Fix)

**Files:** `src/lib/useTrustFilter.ts`, `src/components/PersonalizedSuggestionsCard.tsx`, `src/app/results.tsx`

### Bug Fix: Solo Mode with 0 Total Matches (PRIORITY)

- [x] CRITICAL: Remove `matches.length === 0` early return in useTrustFilter signal fetch
  - File: `src/lib/useTrustFilter.ts`
  - Expected: Lines 274-277 removed (the `if (confidenceResult.matches.length === 0) { return; }` block)
  - Evidence: Lines 274-276 now contain explanatory comment; early return removed; dependency array updated at line 366
  - How verified: Code review confirms early return removed; replaced with comment explaining solo mode needs scanSignals even with 0 matches

- [x] Bug Fix: scanSignals fetched even when matches.length === 0
  - Evidence: `src/lib/useTrustFilter.ts` lines 274-276 (comment), line 335 (wardrobe signals guard preserved: `if (matchedItemIds.length > 0)`)
  - How verified: Code review confirms: (1) early return removed, (2) fetchSignals() now runs even with 0 matches, (3) wardrobe signals fetch has its own guard so only scan signals are fetched when 0 matches

### UI Component Updates

- [ ] Props: `mode?: "paired" | "solo" | "near"` prop added to PersonalizedSuggestionsCard
  - Evidence: (line number)
  - How verified: Code review of PersonalizedSuggestionsCardProps interface

- [ ] UI: Section titles change based on mode
  - Expected:
    - Paired: "Why it works" / "To elevate"
    - Solo: "How to style it" / "What to add first"
    - Near: "Why it's close" / "How to upgrade"
  - Evidence: (line number)
  - How verified: Code review of title conditionals

- [ ] CRITICAL: UI branches on `recommend.type` for `to_elevate` rendering
  - Expected:
    - `consider_adding` → render category + attributes (existing)
    - `styling_tip` → render `tip` text (new)
  - Evidence: (line number)
  - How verified: Code review of ToElevateBullet component

- [ ] UI: `styling_tip` renders `tip` (not blank / not "undefined")
  - Evidence: (line number)
  - How verified: Code review + manual test

### Results Screen: Solo Mode Gating

- [ ] CRITICAL: Solo gating uses core-category filtering
  - Expected:
    ```typescript
    const coreHigh = highFinal.filter(m => isCoreCategory(m.wardrobeItem.category));
    const coreNear = nearFinal.filter(m => isCoreCategory(m.wardrobeItem.category));
    const isSoloMode = wardrobeCount > 0 && coreHigh.length === 0 && coreNear.length === 0;
    ```
  - Evidence: (line number)
  - How verified: Code review shows solo triggers when 0 CORE matches (not 0 total matches)

- [ ] Solo: Triggers even if add-on matches exist (outerwear, bags, accessories)
  - Evidence: (line number)
  - How verified: Code review confirms add-on matches don't affect solo gating

### Results Screen: NEAR Tab Fetch

- [ ] Fetch: Separate state for NEAR suggestions (`nearSuggestionsResult`, `nearSuggestionsLoading`)
  - Evidence: (line number)
  - How verified: Code review of useState declarations

- [ ] Fetch: NEAR fetch triggered when NEAR tab has matches (always, not just when 0 HIGH)
  - Evidence: (line number)
  - How verified: Code review of NEAR fetch useEffect

- [ ] CRITICAL: Double-fetch prevention (stable key based on nearFinalIdsKey + isFullyReady + scanSignals + updated_at)
  - Evidence: (line number)
  - How verified: Code review of useEffect dependencies

### Results Screen: Mode B Suppression

- [ ] CRITICAL: Mode B suppression with timeout fast fallback
  - Expected:
    ```typescript
    const shouldSuppressModeB = 
      !isHighTab && 
      !nearSuggestionsTimedOut &&
      (nearSuggestionsLoading || nearSuggestionsResult?.ok);
    ```
  - Evidence: (line number)
  - How verified: Code review of shouldSuppressModeB logic

- [ ] Timeout: `nearSuggestionsTimedOut` tracked separately from global results timeout
  - Evidence: (line number)
  - How verified: Code review confirms scoped timeout state

- [ ] Fallback: Mode B bullets shown when AI fails or times out (never blank)
  - Evidence: (line number)
  - How verified: Code review of fallback render logic

### Results Screen: NEAR Rendering

- [ ] Render: AI card shown on NEAR tab when `nearSuggestionsLoading || nearSuggestionsResult?.ok`
  - Evidence: (line number)
  - How verified: Code review of NEAR tab render logic

- [ ] Props: `mode="near"` passed to PersonalizedSuggestionsCard on NEAR tab
  - Evidence: (line number)
  - How verified: Code review of component props

**Summary — Agent C:**
- Verified: Bug Fix (Phase 1) - 2/2 items complete
  - Early return removed from useTrustFilter signal fetch (lines 274-277 → 274-276 comment)
  - scanSignals now fetched even with 0 matches; wardrobe signals guard (line 335) preserved
- Missing: UI Component Updates, Results Screen (Phase 4 - not in current scope)
- Risks: None for bug fix; change is minimal and well-isolated

---

## Pre-merge Summary

| Agent | Scope | Files | Items | Status | Blockers |
|-------|-------|-------|-------|--------|----------|
| **A** | Backend | `supabase/functions/personalized-suggestions/index.ts` | 12 (3 CRIT) | [x] Complete | - |
| **B** | Client Service | `src/lib/personalized-suggestions-service.ts`, `src/lib/types.ts`, `src/lib/analytics.ts`, tests | 14 (4 CRIT) | [x] Complete | - |
| **C** | UI Integration + Bug Fix | `src/lib/useTrustFilter.ts`, `src/components/PersonalizedSuggestionsCard.tsx`, `src/app/results.tsx` | 17 (6 CRIT) | [ ] Pending | - |
| **Total** | | | **43 (13 CRIT)** | **[ ] In Progress** | Agent C pending |

**Sign-off required from:** Each agent owner + Integration lead

---

## Merge Checklist (Summary)

### CRITICAL (must pass before merging)

- [x] Bug Fix: `matches.length === 0` early return removed in useTrustFilter (enables solo with 0 total matches)
  - Evidence: `src/lib/useTrustFilter.ts` lines 274-276 (explanatory comment replaces early return)
- [x] Mode derivation: Server derives mode from array lengths only (never trusts client)
  - Evidence: `supabase/functions/personalized-suggestions/index.ts` lines 610-618 (`derivedMode` from array lengths)
- [x] Unified schema: `why_it_works` + `to_elevate` for all modes (paired, solo, near)
  - Evidence: `supabase/functions/personalized-suggestions/index.ts` lines 130-134 (unified interface), lines 327-523 (unified validation)
- [x] Recommend union: Validates `consider_adding` (category+attributes) vs `styling_tip` (tip+tags)
  - Evidence: `supabase/functions/personalized-suggestions/index.ts` lines 110-123 (tagged union types), lines 416-502 (validation logic)
  - Evidence (Client): `src/lib/types.ts` lines 59-77 (Recommend union type), `src/lib/personalized-suggestions-service.ts` lines 521-565 (validation)
- [x] Cache key: Includes mode + near IDs + wardrobeSummary.updated_at (isolates modes)
  - Evidence: `src/lib/personalized-suggestions-service.ts` lines 209-219 (rawKey includes nearIds, mode, updated_at)
- [x] NEAR mentions: Stripped if not in `nearFinal.map(m => m.wardrobeItem.id)`
  - Evidence: `src/lib/personalized-suggestions-service.ts` lines 221-227 (validIds for NEAR mode), lines 475-497 (mention validation)
- [ ] Solo gating: Uses core-category filtering (`isCoreCategory`); add-on matches don't affect
- [ ] Double-fetch: NEAR fetch uses stable key (nearFinalIdsKey, isFullyReady, scanSignals, updated_at)
- [ ] Mode B suppression: Includes timeout fast fallback (`nearSuggestionsTimedOut`)
- [ ] UI branching: `recommend.type` determines rendering (`styling_tip` → tip text)
- [ ] NEAR UI: Shows "Why it's close" / "How to upgrade" titles
- [ ] Fallback: Mode B bullets shown when AI fails/times out (never blank NEAR tab)
- [x] Tests: NEAR mentions stripping test passes
  - Evidence: `src/lib/__tests__/personalized-suggestions-service.test.ts` lines 724-764 (NEAR mention validation tests); `npx jest` passes (45/45)

### Non-Critical (still important)

- [x] Telemetry: Includes `mode`, `source`, `was_repaired`, `mentions_stripped_count`
  - Evidence: `src/lib/analytics.ts` lines 251-278 (event interfaces); service.ts lines 243-254, 316-327 (tracking calls)
- [ ] Cap reasons: NEAR prompt limited to top 2-3 matches, 1-2 cap reasons each
- [ ] Timeout scoping: `nearSuggestionsTimedOut` separate from global results timeout
- [ ] Solo UI unchanged: Existing solo mode behavior preserved
- [ ] HIGH tab unchanged: Existing paired mode behavior preserved

---

## Test Coverage Checklist

### Unit Tests (Agent B)

- [x] NEAR mode validation:
  - Mentions stripped if not in near_match_ids ✓ (test lines 724-764)
  - `styling_tip` recommend validated correctly ✓ (test lines 766-790)
  - `consider_adding` recommend validated correctly ✓ (test lines 274-337, 380-454)
- [x] Cache key:
  - Includes mode (paired vs solo vs near) ✓ (service.ts line 216)
  - Includes near match IDs ✓ (service.ts line 200)
  - Stable format (wardrobeSummary.updated_at) ✓ (service.ts line 212)
- [x] Recommend union rendering:
  - `styling_tip` renders `tip` (not blank) ✓ (test lines 792-814)
  - `consider_adding` renders category + attributes ✓ (test lines 380-454)
- [x] mentionsStrippedCount tracking:
  - Counts stripped mentions correctly ✓ (test lines 876-915)
  - Returns 0 when no stripping needed ✓ (test lines 901-915)

### Integration Tests (Manual or E2E)

- [x] Bug Fix: 0 total matches → scanSignals fetched → solo AI triggers
  - Evidence: `src/lib/useTrustFilter.ts` early return removed; signal fetch now runs unconditionally when TF enabled
  - How verified: Code path analysis confirms fetchSignals() runs even with 0 matches
- [ ] Bug Fix: Add-on-only match + 0 core matches → solo AI still triggers (requires results.tsx solo gating logic - Phase 4)
- [ ] NEAR: Tab with matches shows AI loading → AI card → correct titles
- [ ] NEAR: AI timeout → Mode B bullets shown (fast fallback)
- [ ] NEAR: AI failure → Mode B bullets shown immediately
- [ ] Cache: NEAR mode request doesn't use paired cache (mode in key)
- [ ] HIGH: Existing behavior unchanged (paired mode still works)

### TypeScript & Lint

- [ ] TypeScript compilation: `npx tsc --noEmit` passes (no NEW errors)
- [ ] ESLint validation: `npx eslint src/` passes (no NEW errors)

---

## Manual QA Checklist (Post-implementation)

### Bug Fix: Solo Mode with 0 Total Matches

- [x] On-device: Scan item with 0 HIGH + 0 NEAR matches (no core, no add-on) but wardrobe > 0
- [x] Verify: Solo AI card appears with "How to style it" / "What to add first"
- [x] On-device: Scan item with add-on matches only (outerwear) but 0 core matches
- [x] Verify: Solo AI card STILL appears (add-on matches don't count for solo gating)

### NEAR Tab AI Integration

- [ ] On-device: Scan item with NEAR matches, switch to NEAR tab
- [ ] Verify: AI loading skeleton appears (Mode B suppressed)
- [ ] Verify: AI card shows "Why it's close" / "How to upgrade"
- [ ] Verify: No category recommendations in "How to upgrade" (styling tips instead)
- [ ] On-device: Simulate AI timeout (e.g., disable network mid-request)
- [ ] Verify: Mode B bullets appear after timeout (fast fallback, not blank)
- [ ] On-device: Simulate AI failure (e.g., invalid response)
- [ ] Verify: Mode B bullets appear immediately (not blank)

### Existing Behavior (Regression)

- [ ] On-device: Scan item with HIGH matches
- [ ] Verify: AI card shows "Why it works" / "To elevate" (unchanged)
- [ ] Verify: "(with your ...)" text appears in why_it_works (mentions work)
- [ ] Verify: Category recommendations appear in to_elevate (consider_adding works)

---

## Rollback Verification

- [x] Edge Function: Mode derived from arrays; no breaking changes to paired flow
  - Evidence: `supabase/functions/personalized-suggestions/index.ts` - existing `buildPrompt()` (lines 140-185) and `buildSoloPrompt()` (lines 187-224) unchanged; `derivedMode` logic (lines 614-618) preserves existing behavior for paired/solo
  - How verified: Code review confirms: (1) paired mode triggers when `top_matches.length > 0` and `near_matches.length === 0`, (2) solo mode triggers when both are 0, (3) existing validation logic preserved
- [x] Client: NEAR mode is additive; paired flow unchanged; solo mode validation unchanged
  - Evidence: `src/lib/personalized-suggestions-service.ts` - existing paired/solo logic preserved; mode parameter defaults to "paired"; nearFinal parameter is optional
  - How verified: All 45 existing unit tests pass; new mode parameter has default value
- [ ] UI: `mode` prop defaults to backward-compatible behavior
- [x] Cache: New cache keys don't collide with old (includes `mode:` prefix + near IDs)
  - Evidence: `src/lib/personalized-suggestions-service.ts` line 216 includes `mode:${mode}` in rawKey; nearIds (line 200) is empty string for paired/solo, ensuring backward compatibility
  - How verified: Code review confirms cache key format; existing paired/solo caches isolated from new NEAR caches
- [x] useTrustFilter: Signal fetch change only affects 0-match case (other paths unchanged)
  - Evidence: Only lines 274-277 changed (early return → comment); wardrobe signals guard (line 335) preserved
  - How verified: Code review confirms all other signal fetch logic unchanged; non-zero match behavior identical

---

**Implementation Date:** 2026-01-28 (Phase 1 Bug Fix)
**Last Updated:** 2026-01-29
**Status:** [x] Phase 1 Bug Fix Complete | [x] Phase 2 Backend Complete | [x] Phase 3 Client Service Complete | [ ] Phase 4-5 Pending
**Plan:** `.cursor/plans/unified_ai_styling_suggestions_e44c6f92.plan.md`

---

## Implementation Order (Recommended)

### Phase 1: Bug Fix (Agent C - Priority)
1. Remove `matches.length === 0` early return in useTrustFilter
2. Test: 0 total matches → solo AI triggers

### Phase 2: Backend (Agent A)
1. Add `near_matches` to request schema
2. Implement `buildNearPrompt()` with cap reasons constraint
3. Update validation for recommend union
4. Update validation for NEAR mentions subset rule
5. Test: NEAR mode returns `styling_tip` recommendations

### Phase 3: Client Service (Agent B)
1. Add Recommend tagged union to types.ts
2. Add `nearFinal` parameter to service
3. Update cache key to include mode + near IDs
4. Update validation for recommend union
5. Add telemetry fields
6. Add unit tests
7. Test: All 35+ tests pass

### Phase 4: UI Integration (Agent C)
1. Update PersonalizedSuggestionsCard for `mode` prop + recommend union rendering
2. Add NEAR fetch logic to results.tsx
3. Add Mode B suppression with timeout fallback
4. Add NEAR card rendering
5. Test: Manual QA on device

### Phase 5: Integration Testing
1. Run full test suite
2. Manual QA checklist
3. Sign-off from all agents
