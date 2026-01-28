# Review Checklist: Solo AI Styling Card

Merge gate:
- CRITICAL items must be checked before merging.
- Plan: `.cursor/plans/solo_ai_styling_card_e94dd1dc.plan.md`

---

## Agent A: Backend (Edge Function + DB)

**Files:** `supabase/functions/personalized-suggestions/index.ts`

### Request & Mode Derivation

- [x] Request: Allow `top_matches: []` (empty array accepted)
  - Evidence: `supabase/functions/personalized-suggestions/index.ts` — `top_matches` validation allows `0-5` items
  - How verified: Code review of request validation

- [x] CRITICAL: Mode derived from data, not request body (`isSoloMode = top_matches.length === 0`)
  - Evidence: `supabase/functions/personalized-suggestions/index.ts` — `const isSoloMode = top_matches.length === 0;` used for prompt + validation
  - How verified: Code review shows no reliance on `has_pairings` boolean for logic

### Auth & Security

- [x] Auth: Two-client pattern maintained (authClient derives user, serviceClient writes)
  - Evidence: `supabase/functions/personalized-suggestions/index.ts` — authClient uses anon key + bearer token for `getUser()`, serviceClient uses service role for cache upsert
  - How verified: Code review of auth flow + write operations

### Solo Prompt

- [x] Prompt: `buildSoloPrompt()` function added with hardened rules
  - Evidence: `supabase/functions/personalized-suggestions/index.ts` — `buildSoloPrompt()` includes explicit rules:
    - "Do not imply the user owns any specific item"
    - "Do not say 'with your ...' or reference wardrobe item names"
    - "Output empty mentions array for all bullets"
  - How verified: Code review of solo prompt builder

- [x] Prompt: Solo mode uses `wardrobe_summary.dominant_aesthetics` for personalization
  - Evidence: `supabase/functions/personalized-suggestions/index.ts` — `buildSoloPrompt()` includes wardrobe aesthetics in context
  - How verified: Code review of prompt context construction

### Validation (Server-side)

- [x] CRITICAL: Solo validation strips ALL mentions unconditionally (even if model returns them)
  - Evidence: `supabase/functions/personalized-suggestions/index.ts` — `validateAndRepairSuggestions(..., isSoloMode)` forces `mentions: []`
  - How verified: Code review of `validateAndRepairSuggestions` solo mode path

- [x] Validation: Suspicious phrase detection (dev-only, fail-open)
  - Evidence: `supabase/functions/personalized-suggestions/index.ts` — Dev-only log warning on "with your"/"your [item]" patterns; no text sanitization
  - How verified: Code review of validation env guard

**Summary — Agent A:**
- Verified: Request validation allows empty `top_matches`; `isSoloMode` derived from `top_matches.length`; two-client auth; solo prompt; solo validation strips mentions; dev-only suspicious phrase logs
- Missing: None
- Risks: Dev-only logging depends on runtime env values (`SUPABASE_ENV`/`DENO_ENV`)

---

## Agent B: Client Service (Service + Validation + Tests)

**Files:** `src/lib/personalized-suggestions-service.ts`, `src/lib/__tests__/personalized-suggestions-service.test.ts`

### Service Updates

- [ ] Service: Accept empty `highFinal` array (remove early return)
  - Evidence: `src/lib/personalized-suggestions-service.ts` — No early return when `highFinal.length === 0`
  - How verified: Code review of function entry guards

- [ ] Service: Mode derived from `topMatches.length` (not passed as parameter)
  - Evidence: `src/lib/personalized-suggestions-service.ts` — `const mode = topMatches.length === 0 ? 'solo' : 'paired';`
  - How verified: Code review of mode derivation

- [ ] Service: `wardrobeSummary.updated_at` used as stable ISO string
  - Evidence: `src/lib/personalized-suggestions-service.ts` — Cache key uses `wardrobeSummary.updated_at` directly
  - How verified: Code review + TypeScript type ensures string

### Cache Key

- [ ] CRITICAL: Cache key includes mode, scanCat, preferAddOns
  - Evidence: `src/lib/personalized-suggestions-service.ts` — Cache key format:
    ```
    ${scanId}|${topIds}|${wardrobeUpdatedAt}|${promptVersion}|${schemaVersion}|mode:${mode}|scanCat:${scanCategory ?? 'null'}|preferAddOns:${preferAddOnCategories ? 1 : 0}
    ```
  - How verified: Code review of `rawKey` construction

### Validation (Client-side)

- [ ] CRITICAL: Filter ordering implemented exactly: scanCat → preferAddOns → diversity → backfill
  - Evidence: `src/lib/personalized-suggestions-service.ts` — `validateAndRepairSuggestions` applies filters in order:
    1. scanCategory removal
    2. preferAddOnCategories (soft)
    3. Enforce diversity (no duplicates)
    4. Backfill to 2 bullets
  - How verified: Code review of filter sequence in validation function

### Telemetry

- [ ] Telemetry: Events include `is_solo_mode`, `source`, `was_repaired`, `removed_by_scan_category_count`, `applied_add_on_preference`
  - Evidence: `src/lib/personalized-suggestions-service.ts` — `personalized_suggestions_started` and `personalized_suggestions_completed` events include all fields
  - How verified: Code review of `trackEvent` calls

### Unit Tests

- [ ] Test: `validateAndRepairSuggestions` with empty `validIds` (solo mode)
  - Evidence: `src/lib/__tests__/personalized-suggestions-service.test.ts` — Test case for empty validIds
  - How verified: `bun test` passes

- [ ] Test: Solo mode forces empty mentions (even if model returns them)
  - Evidence: `src/lib/__tests__/personalized-suggestions-service.test.ts` — Test case verifies mentions stripped when validIds empty
  - How verified: `bun test` passes

- [ ] Test: Cache key generation includes mode/scanCat/preferAddOns
  - Evidence: `src/lib/__tests__/personalized-suggestions-service.test.ts` — Test case verifies cache key format
  - How verified: `bun test` passes

- [ ] CRITICAL: Nasty edge case test (scanCategory=shoes + preferAddOns + single add-on)
  - Evidence: `src/lib/__tests__/personalized-suggestions-service.test.ts` — Test case:
    ```typescript
    describe('Solo mode edge case: scanCategory + preferAddOns + diversity', () => {
      it('handles shoes scanCategory with single add-on preference', () => {
        // Model outputs: ['shoes', 'outerwear']
        // Expected: shoes removed, outerwear kept, bullet2 = tops (not shoes)
        // Final: ['outerwear', 'tops'], no duplicates
      });
    });
    ```
  - How verified: `bun test` passes, assertions correct

**Summary — Agent B:**
- Verified: [Fill after implementation]
- Missing: [Fill after implementation]
- Risks: [Fill after implementation]

---

## Agent C: UI Integration (Component + Results Screen)

**Files:** `src/components/PersonalizedSuggestionsCard.tsx`, `src/app/results.tsx`

### UI Component Updates

- [ ] Props: `isSoloMode?: boolean` prop added to PersonalizedSuggestionsCard
  - Evidence: `src/components/PersonalizedSuggestionsCard.tsx` — Interface includes `isSoloMode?: boolean`
  - How verified: Code review of props interface

- [ ] UI: Section titles change based on mode
  - Evidence: `src/components/PersonalizedSuggestionsCard.tsx` —
    - `isSoloMode=true`: "How to style it" / "What to add first"
    - `isSoloMode=false`: "Why it works" / "To elevate"
  - How verified: Code review of title conditionals

- [ ] UI: Empty mentions already handled (no "(with your ...)" when mentions empty)
  - Evidence: `src/components/PersonalizedSuggestionsCard.tsx` — `{mentionedItems.length > 0 && ...}` guard
  - How verified: Code review of WhyItWorksBullet component

- [ ] UI: `isSoloMode` defaults to `false` (backward compatible)
  - Evidence: `src/components/PersonalizedSuggestionsCard.tsx` — Default value or nullish coalescing for `isSoloMode`
  - How verified: Code review of prop destructuring

### Results Screen Gating

- [ ] CRITICAL: Solo fetch gated by `trustFilterResult.isFullyReady` + `wardrobeSummary?.updated_at`
  - Evidence: `src/app/results.tsx` — Gating condition:
    ```typescript
    const canFetchSoloAi =
      trustFilterResult.isFullyReady &&
      wardrobeSummary?.updated_at &&
      wardrobeCount > 0 &&
      trustFilterResult.finalized.highFinal.length === 0 &&
      trustFilterResult.finalized.nearFinal.length === 0;
    ```
  - How verified: Code review of gating logic

- [ ] Gating: `isSoloMode` derived from gating condition (not separate boolean)
  - Evidence: `src/app/results.tsx` — `const isSoloMode = canFetchSoloAi;`
  - How verified: Code review of mode derivation

### Fetch Integration

- [ ] Fetch: Solo mode passes `top_matches: []` to service
  - Evidence: `src/app/results.tsx` — useEffect passes empty `highFinal` when `isSoloMode`
  - How verified: Code review of fetch parameters

- [ ] Fetch: `preferAddOnCategories` only true if `showAddOnsStrip && addOnCategoriesForSuggestions.length > 0`
  - Evidence: `src/app/results.tsx` — Explicit check for strip visibility AND categories exist
  - How verified: Code review of preferAddOnCategories derivation

### Rendering

- [ ] CRITICAL: Solo UI never blank (AI card loading/ok OR Mode A fallback)
  - Evidence: `src/app/results.tsx` — Render condition:
    ```tsx
    {isSoloMode && (
      <>
        {(suggestionsLoading || suggestionsResult?.ok) && <PersonalizedSuggestionsCard ... />}
        {!suggestionsLoading && !suggestionsResult?.ok && helpfulAdditionRows.length > 0 && <ModeASection />}
      </>
    )}
    ```
  - How verified: Code review of render logic

- [ ] Placement: Solo card renders after Verdict, above add-ons strip
  - Evidence: `src/app/results.tsx` — Component order: Verdict → Solo AI Card → Add-ons Strip
  - How verified: Code review of render order

- [ ] Props: `isSoloMode={true}` passed to PersonalizedSuggestionsCard in solo mode
  - Evidence: `src/app/results.tsx` — `<PersonalizedSuggestionsCard ... isSoloMode={true} />`
  - How verified: Code review of component props

**Summary — Agent C:**
- Verified: [Fill after implementation]
- Missing: [Fill after implementation]
- Risks: [Fill after implementation]

---

## Pre-merge Summary

| Agent | Scope | Files | Items | Status | Blockers |
|-------|-------|-------|-------|--------|----------|
| **A** | Backend | `supabase/functions/personalized-suggestions/index.ts` | 7 (2 CRIT) | Pending | |
| **B** | Client Service | `src/lib/personalized-suggestions-service.ts`, tests | 10 (3 CRIT) | Pending | |
| **C** | UI Integration | `src/components/PersonalizedSuggestionsCard.tsx`, `src/app/results.tsx` | 11 (2 CRIT) | Pending | |
| **Total** | | | **28 (7 CRIT)** | **Pending** | None |

**Sign-off required from:** Each agent owner + Integration lead

---

## Merge Checklist (Summary)

### CRITICAL (must pass before merging)
 
- [ ]CRITICAL: Paired mode behavior unchanged when top_matches.length > 0
     Evidence: code path still uses existing paired prompt + existing mention validation
     How verified: unit test or quick manual “paired” scenario still shows mentions
- [x] `isSoloMode` derived ONLY from `top_matches.length === 0` (not from request body boolean)
- [ ] Results gating: solo fetch only after `trustFilterResult.isFullyReady` + `wardrobeSummary.updated_at` exists
- [x] Edge function auth: authed client (anon key + bearer) derives user; service client writes
- [ ] Cache key includes `mode:solo|paired`, `scanCat`, `preferAddOns` (stable ISO timestamp)
- [x] Solo validation: mentions stripped unconditionally; never implies ownership
- [ ] Solo UI never blank: AI card (loading/ok) OR Mode A fallback always shown
- [ ] Filter ordering implemented exactly: scanCat removal → preferAddOns → diversity → backfill
- [ ] Nasty edge-case test passes (scanCategory=shoes + preferAddOns + single add-on)

### Non-Critical (still important)

- [ ] Telemetry includes `is_solo_mode` + `source` + `was_repaired` + `removed_by_scan_category_count` + `applied_add_on_preference`
- [ ] Solo card placement: after Verdict, before add-ons strip
- [ ] Add-ons preference only true if `showAddOnsStrip && addOnCategoriesForSuggestions.length > 0`
- [x] Suspicious phrase detection: dev-only logs, production remains fail-open
- [ ] UI titles correct: "How to style it" / "What to add first" in solo mode

---

## Test Coverage Checklist

- [ ] Unit tests for solo mode validation:
  - Empty validIds forces empty mentions
  - Scan-category filter removes same-category recommendations
  - preferAddOnCategories soft preference works
  - Diversity filter removes duplicates
  - Backfill to exactly 2 bullets
- [ ] Unit tests for cache key:
  - Includes mode (solo vs paired)
  - Includes scanCategory
  - Includes preferAddOnCategories
  - Stable format (no random elements)
- [ ] Integration test:
  - Solo AI fetch when 0 matches + wardrobe > 0
  - Mode A fallback when AI fails/times out
- [ ] UI test:
  - Correct section titles in solo mode
  - No "(with your ...)" rendered when mentions empty
- [ ] TypeScript compilation: No type errors
- [ ] ESLint validation: No linter errors

---

## Manual QA Checklist (Post-implementation)

- [ ] On-device: Scan item with no HIGH/NEAR matches but wardrobe > 0
- [ ] Verify: Solo AI card appears after Verdict, before add-ons strip
- [ ] Verify: Card shows "How to style it" and "What to add first" sections
- [ ] Verify: No "(with your ...)" text appears in bullets
- [ ] Verify: AI timeout/failure shows Mode A bullets (not blank)
- [ ] Verify: Styling advice is personalized to wardrobe aesthetics
- [ ] Verify: "What to add first" doesn't recommend same category as scanned
- [ ] Verify: Add-ons strip still appears if add-on items exist
- [ ] Test: VoiceOver/TalkBack reads card content correctly

---

## Rollback Verification

- [x] Edge Function: Mode derived from `top_matches.length`, no breaking changes to paired mode
- [ ] Client: Solo gating is additive, paired flow unchanged
- [ ] UI: `isSoloMode` defaults to `false`, existing cards render correctly
- [ ] Cache: New cache keys don't collide with old (includes `mode:` prefix)

---

**Implementation Date:** [TBD]
**Last Updated:** 2026-01-27
**Status:** Pending Implementation
**Plan:** `.cursor/plans/solo_ai_styling_card_e94dd1dc.plan.md`
