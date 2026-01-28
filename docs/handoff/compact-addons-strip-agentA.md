# Compact Add-ons Strip Handoff (Agent A)

## Scope Completed
- TODO 1: `types.ts` add-on category types and guard.
- TODO 2: `add-ons-sorting.ts` scoring utility + unit tests.

## Files Touched
- `src/lib/types.ts`
  - Added `AddOnCategory` union and `isAddOnCategory()` guard.
  - Added `AddOnItem` interface with `category: AddOnCategory` and local match fields.
- `src/lib/add-ons-sorting.ts`
  - New `scoreAndSortAddOns()` with synonym expansion, token matching, and deterministic sorting.
  - Helper functions: `tokenize()`, `getMatchableText()`.
- `src/lib/__tests__/add-ons-sorting.test.ts`
  - Unit tests covering dedupe, category filtering, priority scoring, synonyms, token matching, cap, tiebreaker, local field matching, and empty input.

## Behavior Notes
- Add-on categories are constrained to `outerwear | bags | accessories`.
- `scoreAndSortAddOns()` uses only local fields for matching (colors, detectedLabel, userStyleTags).
- Attribute matching is token-based and capped at +30.
- Sorting is deterministic via original index tiebreaker.

## Tests Run
- `npm test -- src/lib/__tests__/add-ons-sorting.test.ts`

## Follow-ups / Risks
- None for this scope. Sorting behavior is covered by unit tests added in this pass.
