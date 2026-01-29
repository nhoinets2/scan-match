# Review Checklist: Unified AI Styling Suggestions

Merge gate:
- CRITICAL items must be checked before merging.
- Plan: `.cursor/plans/unified_ai_styling_suggestions_e44c6f92.plan.md`

---

## Agent A: Backend (Edge Function)

**Files:** `supabase/functions/personalized-suggestions/index.ts`

### Mode Derivation (Server-side)

- [ ] CRITICAL: Mode derived from data arrays, never trusted from client
  - Expected: `mode = near_matches.length > 0 ? 'near' : top_matches.length === 0 ? 'solo' : 'paired'`
  - Evidence: (line number in edge function)
  - How verified: Code review shows mode derived from array lengths only

- [ ] Request: `near_matches` array added to request schema (MEDIUM tier items)
  - Evidence: (line number)
  - How verified: Request validation accepts `near_matches` array

- [ ] NEAR mode: `top_matches` omitted or empty (keep prompts small)
  - Evidence: (line number)
  - How verified: NEAR prompt only uses `near_matches` + `scan_signals`

### NEAR Prompt

- [ ] Prompt: `buildNearPrompt()` function added focusing on "how to make it work"
  - Evidence: (line number)
  - How verified: Code review of NEAR prompt builder

- [ ] Prompt: Cap reasons constraint (top 2-3 near matches, top 1-2 cap reasons each)
  - Evidence: (line number)
  - How verified: Prompt doesn't include all near matches; limited cap reasons

- [ ] Prompt: NEAR mode uses `recommend.type: "styling_tip"` (not `consider_adding`)
  - Evidence: (line number in prompt instructions)
  - How verified: Code review of NEAR prompt schema instructions

### Unified Response Schema

- [ ] CRITICAL: Response schema unified (`why_it_works` + `to_elevate` for all modes)
  - Evidence: (line number)
  - How verified: Same validation/repair function used for all modes

- [ ] Schema: Recommend tagged union supported
  - Expected types: `{ type: "consider_adding"; category; attributes }` OR `{ type: "styling_tip"; tip; tags? }`
  - Evidence: (line number)
  - How verified: Validation handles both union variants

### Validation (Server-side)

- [ ] CRITICAL: NEAR mode mentions must be subset of `near_match_ids`; otherwise strip
  - Evidence: (line number)
  - How verified: Code review of validation logic for NEAR mode

- [ ] Validation: `styling_tip` requires `tip` field; `consider_adding` requires `category`+`attributes`
  - Evidence: (line number)
  - How verified: Code review of recommend validation

- [ ] Validation: SOLO mode mentions still forced empty (existing behavior preserved)
  - Evidence: (line number)
  - How verified: Solo validation path unchanged

**Summary — Agent A:**
- Verified: (to be filled after review)
- Missing: (to be filled after review)
- Risks: (to be filled after review)

---

## Agent B: Client Service (Service + Validation + Tests)

**Files:** `src/lib/personalized-suggestions-service.ts`, `src/lib/types.ts`, `src/lib/analytics.ts`, `src/lib/__tests__/personalized-suggestions-service.test.ts`

### Type Definitions

- [ ] Types: Recommend tagged union added to types.ts
  - Expected:
    ```typescript
    type Recommend =
      | { type: "consider_adding"; category: Category; attributes: string[] }
      | { type: "styling_tip"; tip: string; tags?: string[] };
    ```
  - Evidence: (line number)
  - How verified: TypeScript compilation succeeds

### Service Updates

- [ ] Service: Add `nearFinal` parameter to `fetchPersonalizedSuggestions`
  - Evidence: (line number)
  - How verified: Function signature includes nearFinal parameter

- [ ] Service: Mode derivation for cache key + telemetry
  - Expected: `nearMatches.length > 0 → near`, `topMatches.length === 0 → solo`, else `paired`
  - Evidence: (line number)
  - How verified: Code review of mode derivation logic

- [ ] CRITICAL: Cache key includes mode, near IDs, wardrobeSummary.updated_at
  - Expected format: `scanId|nearIds|topIds|updated_at|PROMPT_VERSION|SCHEMA_VERSION|mode:near|...`
  - Evidence: (line number)
  - How verified: Code review of rawKey construction

### Validation (Client-side)

- [ ] CRITICAL: near_match_ids defined as `nearFinal.map(m => m.wardrobeItem.id)`
  - Evidence: (line number)
  - How verified: Code review of validIds construction for NEAR mode

- [ ] Validation: NEAR mode mentions stripped if not in near_match_ids
  - Evidence: (line number)
  - How verified: Code review of mention validation for NEAR mode

- [ ] Validation: Recommend union validated (styling_tip vs consider_adding)
  - Evidence: (line number)
  - How verified: Code review of recommend repair logic

### Telemetry

- [ ] Telemetry: Events include `mode`, `source`, `was_repaired`, `timed_out`, `mentions_stripped_count`
  - Evidence: (line numbers in analytics.ts)
  - How verified: Code review of telemetry event interfaces and tracking calls

### Unit Tests

- [ ] Test: NEAR mode validation strips invalid mentions
  - Evidence: (test file line number)
  - How verified: `npx jest` passes

- [ ] Test: NEAR mode cache key differs from paired/solo
  - Evidence: (test file line number)
  - How verified: `npx jest` passes

- [ ] Test: Recommend union: `styling_tip` renders correctly (not blank)
  - Evidence: (test file line number)
  - How verified: `npx jest` passes

- [ ] Test: Recommend union: `consider_adding` requires category/attributes
  - Evidence: (test file line number)
  - How verified: `npx jest` passes

- [ ] CRITICAL: Test: NEAR mentions stripping (model returns invalid IDs → stripped → no "with your" line)
  - Evidence: (test file line number)
  - How verified: `npx jest` passes

**Summary — Agent B:**
- Verified: (to be filled after review)
- Missing: (to be filled after review)
- Risks: (to be filled after review)

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
| **A** | Backend | `supabase/functions/personalized-suggestions/index.ts` | 12 (3 CRIT) | [ ] Pending | - |
| **B** | Client Service | `src/lib/personalized-suggestions-service.ts`, `src/lib/types.ts`, `src/lib/analytics.ts`, tests | 14 (4 CRIT) | [ ] Pending | - |
| **C** | UI Integration + Bug Fix | `src/lib/useTrustFilter.ts`, `src/components/PersonalizedSuggestionsCard.tsx`, `src/app/results.tsx` | 17 (6 CRIT) | [ ] Pending | - |
| **Total** | | | **43 (13 CRIT)** | **[ ] Pending** | - |

**Sign-off required from:** Each agent owner + Integration lead

---

## Merge Checklist (Summary)

### CRITICAL (must pass before merging)

- [x] Bug Fix: `matches.length === 0` early return removed in useTrustFilter (enables solo with 0 total matches)
  - Evidence: `src/lib/useTrustFilter.ts` lines 274-276 (explanatory comment replaces early return)
- [ ] Mode derivation: Server derives mode from array lengths only (never trusts client)
- [ ] Unified schema: `why_it_works` + `to_elevate` for all modes (paired, solo, near)
- [ ] Recommend union: Validates `consider_adding` (category+attributes) vs `styling_tip` (tip+tags)
- [ ] Cache key: Includes mode + near IDs + wardrobeSummary.updated_at (isolates modes)
- [ ] NEAR mentions: Stripped if not in `nearFinal.map(m => m.wardrobeItem.id)`
- [ ] Solo gating: Uses core-category filtering (`isCoreCategory`); add-on matches don't affect
- [ ] Double-fetch: NEAR fetch uses stable key (nearFinalIdsKey, isFullyReady, scanSignals, updated_at)
- [ ] Mode B suppression: Includes timeout fast fallback (`nearSuggestionsTimedOut`)
- [ ] UI branching: `recommend.type` determines rendering (`styling_tip` → tip text)
- [ ] NEAR UI: Shows "Why it's close" / "How to upgrade" titles
- [ ] Fallback: Mode B bullets shown when AI fails/times out (never blank NEAR tab)
- [ ] Tests: NEAR mentions stripping test passes

### Non-Critical (still important)

- [ ] Telemetry: Includes `mode`, `source`, `was_repaired`, `timed_out`, `mentions_stripped_count`
- [ ] Cap reasons: NEAR prompt limited to top 2-3 matches, 1-2 cap reasons each
- [ ] Timeout scoping: `nearSuggestionsTimedOut` separate from global results timeout
- [ ] Solo UI unchanged: Existing solo mode behavior preserved
- [ ] HIGH tab unchanged: Existing paired mode behavior preserved

---

## Test Coverage Checklist

### Unit Tests (Agent B)

- [ ] NEAR mode validation:
  - Mentions stripped if not in near_match_ids ✓
  - `styling_tip` recommend validated correctly ✓
  - `consider_adding` recommend validated correctly ✓
- [ ] Cache key:
  - Includes mode (paired vs solo vs near) ✓
  - Includes near match IDs ✓
  - Stable format (wardrobeSummary.updated_at) ✓
- [ ] Recommend union rendering:
  - `styling_tip` renders `tip` (not blank) ✓
  - `consider_adding` renders category + attributes ✓

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

- [ ] On-device: Scan item with 0 HIGH + 0 NEAR matches (no core, no add-on) but wardrobe > 0
- [ ] Verify: Solo AI card appears with "How to style it" / "What to add first"
- [ ] On-device: Scan item with add-on matches only (outerwear) but 0 core matches
- [ ] Verify: Solo AI card STILL appears (add-on matches don't count for solo gating)

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

- [ ] Edge Function: Mode derived from arrays; no breaking changes to paired flow
- [ ] Client: NEAR mode is additive; paired flow unchanged; solo bug fix doesn't affect other modes
- [ ] UI: `mode` prop defaults to backward-compatible behavior
- [ ] Cache: New cache keys don't collide with old (includes `mode:` prefix + near IDs)
- [x] useTrustFilter: Signal fetch change only affects 0-match case (other paths unchanged)
  - Evidence: Only lines 274-277 changed (early return → comment); wardrobe signals guard (line 335) preserved
  - How verified: Code review confirms all other signal fetch logic unchanged; non-zero match behavior identical

---

**Implementation Date:** 2026-01-28 (Phase 1 Bug Fix)
**Last Updated:** 2026-01-28
**Status:** [x] Phase 1 Bug Fix Complete | [ ] Phase 2-5 Pending
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
