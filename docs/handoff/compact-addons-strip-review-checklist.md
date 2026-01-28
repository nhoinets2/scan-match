# Review Checklist: Compact Add-ons Strip

Merge gate:
- CRITICAL items must be checked before merging into results.tsx.

## TODO 1: types.ts — AddOnCategory + isAddOnCategory() (Owned: Agent A)

- [x] Types: AddOnCategory union defined ('outerwear' | 'bags' | 'accessories')
  - Evidence: `src/lib/types.ts` — `AddOnCategory` type union; add-on subset defined for optional items.
  - How verified: Code review of `src/lib/types.ts`

- [x] Types: isAddOnCategory() type guard in types.ts ONLY (single source of truth)
  - Evidence: `src/lib/types.ts` — `isAddOnCategory()` function defined in types module.
  - How verified: Code review + repo search for duplicate `isAddOnCategory` definition

- [x] Types: AddOnItem.category uses AddOnCategory (not generic Category)
  - Evidence: `src/lib/types.ts` — `AddOnItem` interface uses `category: AddOnCategory`.
  - How verified: Code review of `AddOnItem` interface in `src/lib/types.ts`

Summary — What's verified / what's missing / risks:
- Verified: Add-on category union, guard, and `AddOnItem` category typing are present in `src/lib/types.ts`.
- Missing: None for TODO 1.
- Risks: None identified.

## TODO 2: add-ons-sorting.ts — scoreAndSortAddOns() (Owned: Agent A)

- [x] Sorting: wantedCategories deduplicated (no duplicate categories from multiple bullets)
  - Evidence: `src/lib/add-ons-sorting.ts` — `if (!wantedCategories.includes(cat)) wantedCategories.push(cat)` in `scoreAndSortAddOns()`.
  - How verified: Code review + `npm test -- src/lib/__tests__/add-ons-sorting.test.ts`

- [x] Sorting: Only add-on categories accepted (isAddOnCategory check)
  - Evidence: `src/lib/add-ons-sorting.ts` — `isAddOnCategory(cat)` gate before adding to `wantedCategories`.
  - How verified: Code review + `npm test -- src/lib/__tests__/add-ons-sorting.test.ts`

- [x] Sorting: Category match scores +100 base + priority bonus (40/20/0)
  - Evidence: `src/lib/add-ons-sorting.ts` — `score += 100` and `score += Math.max(0, 40 - categoryIdx * 20)` inside scoring loop.
  - How verified: Code review + `npm test -- src/lib/__tests__/add-ons-sorting.test.ts`

- [x] Sorting: Bidirectional synonym lookup (ATTR_LOOKUP map)
  - Evidence: `src/lib/add-ons-sorting.ts` — `ATTR_LOOKUP` map built from `ATTR_GROUPS` with variant→group mapping.
  - How verified: Code review + `npm test -- src/lib/__tests__/add-ons-sorting.test.ts`

- [x] Sorting: Token-based matching (not substring includes)
  - Evidence: `src/lib/add-ons-sorting.ts` — `tokenize()` helper and `tokens.has(attr)` checks.
  - How verified: Code review + `npm test -- src/lib/__tests__/add-ons-sorting.test.ts`

- [x] Sorting: Attribute match capped at +30 (max 3 keywords)
  - Evidence: `src/lib/add-ons-sorting.ts` — `score += Math.min(attrMatches * 10, 30)` in scoring loop.
  - How verified: Code review + `npm test -- src/lib/__tests__/add-ons-sorting.test.ts`

- [x] Sorting: Deterministic tiebreaker via secondary sort (not score addition)
  - Evidence: `src/lib/add-ons-sorting.ts` — `.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)`.
  - How verified: Code review + `npm test -- src/lib/__tests__/add-ons-sorting.test.ts`

- [x] Sorting: getMatchableText() uses local fields only (colors, detectedLabel, userStyleTags)
  - Evidence: `src/lib/add-ons-sorting.ts` — `getMatchableText()` uses `item.colors?.[0]?.name`, `item.detectedLabel`, `item.userStyleTags`.
  - How verified: Code review + `npm test -- src/lib/__tests__/add-ons-sorting.test.ts`

- [x] CRITICAL: Sorting utility never sends data to model (local scoring only)
  - Evidence: `src/lib/add-ons-sorting.ts` — Pure scoring helpers with no network/API usage or model imports.
  - How verified: Code review of imports and function bodies

Summary — What's verified / what's missing / risks:
- Verified: Scoring utility implements dedupe, synonym expansion, token matching, capped attrs, and deterministic sorting in `src/lib/add-ons-sorting.ts`.
- Missing: None for TODO 2.
- Risks: None identified.

## TODO 3: OptionalAddOnsStrip.tsx — Compact Strip (Owned: Agent B)

- [x] Strip: Title changes based on VALID AI (exactly 2 to_elevate bullets)
  - Evidence: `src/components/OptionalAddOnsStrip.tsx` — `hasValidAi` uses `suggestions?.to_elevate?.length === 2`, title switches between "Suggested add-ons" and "Finish the look".
  - How verified: Code review of `OptionalAddOnsStrip`

- [x] Strip: Entire header row tappable (not just "View all" link)
  - Evidence: `src/components/OptionalAddOnsStrip.tsx` — Header wrapped in a `Pressable` calling `onOpenViewAll` when `showViewAll` is true.
  - How verified: Code review of header Pressable

- [x] Strip: Maximum 6 thumbnails displayed
  - Evidence: `src/components/OptionalAddOnsStrip.tsx` — `sortedAddOns.slice(0, 6)` before render.
  - How verified: Code review of thumbnails render

- [x] Strip: Thumbnails are sorted by scoreAndSortAddOns()
  - Evidence: `src/components/OptionalAddOnsStrip.tsx` — `useMemo(() => scoreAndSortAddOns(addOns, suggestions?.to_elevate), [addOns, suggestions?.to_elevate])`.
  - How verified: Code review of memoized sorting

- [x] Strip: showViewAll guards against empty array (Math.max crash prevention)
  - Evidence: `src/components/OptionalAddOnsStrip.tsx` — `if (addOns.length === 0) return false` inside `showViewAll` memo.
  - How verified: Code review of `showViewAll` logic

- [x] Strip: "View all" shows if: total > 6 OR categoryCount > 1 OR maxCategoryCount > 4
  - Evidence: `src/components/OptionalAddOnsStrip.tsx` — `if (addOns.length > 6)`, `nonEmpty.length > 1`, and `Math.max(...nonEmpty) > 4`.
  - How verified: Code review of `showViewAll` conditions

- [x] Strip: Category badges overlay top-left with correct labels
  - Evidence: `src/components/OptionalAddOnsStrip.tsx` — `CategoryBadge` uses `position: "absolute"`, `top: 4`, `left: 4`, labels via `getCategoryLabel()` returning "Layer"/"Bag"/"Acc".
  - How verified: Code review of `CategoryBadge`

- [x] Strip: Badge style matches spec (10-11px, semi-transparent white)
  - Evidence: `src/components/OptionalAddOnsStrip.tsx` — badge `backgroundColor: "rgba(255, 255, 255, 0.85)"`, label `fontSize: 10`, `fontFamily: typography.fontFamily.medium`.
  - How verified: Code review of badge styles

- [x] Strip: onPressItem fires with correct item
  - Evidence: `src/components/OptionalAddOnsStrip.tsx` — item press handler `onPress={() => onPressItem(item)}`.
  - How verified: Code review of item Pressable

- [x] Strip: Section hidden if 0 add-ons (empty state)
  - Evidence: `src/components/OptionalAddOnsStrip.tsx` — early return `if (addOns.length === 0) return null`.
  - How verified: Code review of empty-state guard

- [x] Strip: Uses FadeInDown animation for consistency
  - Evidence: `src/components/OptionalAddOnsStrip.tsx` — `<Animated.View entering={FadeInDown.delay(325)}>`
  - How verified: Code review of animation wrapper

Summary — What's verified / what's missing / risks:
- Verified: Title logic, sorting memo, showViewAll rules, badges, and interaction wiring are implemented in `src/components/OptionalAddOnsStrip.tsx`.
- Missing: Visual/a11y testing not performed in this pass.
- Risks: UI nuances (badge size/spacing) not validated on-device.

## TODO 4: AddOnsBottomSheet.tsx — Expanded View (Owned: Agent B)

- [x] Sheet: Tab order is fixed: Outerwear → Bags → Accessories
  - Evidence: `src/components/AddOnsBottomSheet.tsx` — `TAB_ORDER` constant set to `["outerwear", "bags", "accessories"]`.
  - How verified: Code review of `TAB_ORDER`

- [x] Sheet: Only tabs with items are displayed (empty tabs hidden)
  - Evidence: `src/components/AddOnsBottomSheet.tsx` — `visibleTabs = TAB_ORDER.filter(...)` with `addOns.some(...)`.
  - How verified: Code review of `visibleTabs`

- [x] Sheet: Tab labels are "Layers", "Bags", "Accessories" (matches badge language)
  - Evidence: `src/components/AddOnsBottomSheet.tsx` — `TAB_LABELS` map uses "Layers", "Bags", "Accessories".
  - How verified: Code review of `TAB_LABELS`

- [x] Sheet: Items correctly filtered by category per tab
  - Evidence: `src/components/AddOnsBottomSheet.tsx` — `activeItems` computed with `addOns.filter((item) => item.category === activeTab)`.
  - How verified: Code review of `activeItems`

- [x] Sheet: Thumbnail rendering consistent with existing style
  - Evidence: `src/components/AddOnsBottomSheet.tsx` — thumbnail styles use `components.wardrobeItem.imageSize` and hairline border colors.
  - How verified: Code review of thumbnail styles

- [x] Sheet: onPressItem fires correctly from sheet
  - Evidence: `src/components/AddOnsBottomSheet.tsx` — item press handler calls `onPressItem(item)`.
  - How verified: Code review of item Pressable

- [x] Sheet: Close button/gesture works
  - Evidence: `src/components/AddOnsBottomSheet.tsx` — close button calls `onClose`, overlay Pressable also calls `onClose`, `onRequestClose` wired.
  - How verified: Code review of close handlers

Summary — What's verified / what's missing / risks:
- Verified: Fixed tab order, filtered tabs, tab labels, and item filtering/rendering are implemented in `src/components/AddOnsBottomSheet.tsx`.
- Missing: On-device/gesture behavior not validated in this pass.
- Risks: Platform-specific modal behavior may differ without manual QA.

## TODO 5: results.tsx — Integration (6 items, 1 CRITICAL)

- [ ] Integration: Old add-ons section (lines 4538-4664) removed
  - Evidence: `src/app/results.tsx` — IIFE with 3 category rows replaced with OptionalAddOnsStrip
  - How verified: Code diff + no duplicate rendering

- [ ] Integration: Bottom sheet state managed correctly
  - Evidence: `src/app/results.tsx` — `const [addOnsSheetVisible, setAddOnsSheetVisible] = useState(false)`
  - How verified: Code review + toggle works

- [ ] Integration: suggestionsResult passed for AI-aware sorting
  - Evidence: `src/app/results.tsx` — `<OptionalAddOnsStrip suggestions={suggestionsResult?.data} ...>`
  - How verified: Code review + visual test confirms AI-matched items first when suggestions present

- [ ] Integration: onPressItem wired to photo viewer
  - Evidence: `src/app/results.tsx` — `onPressItem={(item) => { setPhotoViewerUri(item.imageUri); ... }}`
  - How verified: Manual test — tapping thumbnail opens photo viewer

- [ ] Integration: Section appears in correct position (after Outfit Ideas, before Styling Suggestions)
  - Evidence: `src/app/results.tsx` — Component rendered between OutfitIdeasSection and helpfulAdditionRows
  - How verified: Visual test of HIGH tab layout

- [ ] CRITICAL: No regression in existing functionality (outfits, matches, AI card)
  - Evidence: Manual testing of full HIGH tab flow
  - How verified: Test scan with HIGH matches, verify all sections render correctly

Summary — What's verified / what's missing / risks:

## Cross-cutting: Performance (included in TODO 3 + 4)

- [x] Performance: scoreAndSortAddOns() memoized to avoid recalculation
  - Evidence: `src/components/OptionalAddOnsStrip.tsx` — `useMemo(() => scoreAndSortAddOns(addOns, suggestions?.to_elevate), [addOns, suggestions?.to_elevate])`.
  - How verified: Code review of memoized sorting

- [x] Performance: Bottom sheet lazy-loaded (not rendered until opened)
  - Evidence: `src/components/AddOnsBottomSheet.tsx` — returns `null` when `visible` is false.
  - How verified: Code review of early return guard

Summary — What's verified / what's missing / risks:
- Verified: Sorting is memoized and bottom sheet short-circuits render until opened.
- Missing: Profiling not performed in this pass.
- Risks: None identified beyond lack of profiling data.

## Cross-cutting: Accessibility (included in TODO 3)

- [x] A11y: Thumbnails have accessible labels
  - Evidence: `src/components/OptionalAddOnsStrip.tsx` — `accessibilityLabel={getAddOnLabel(item)}` on item Pressable.
  - How verified: Code review of accessibility props

- [x] A11y: "View all" button accessible
  - Evidence: `src/components/OptionalAddOnsStrip.tsx` — header `Pressable` uses `accessibilityRole="button"` with label/hint when `showViewAll` is true.
  - How verified: Code review of header accessibility props

Summary — What's verified / what's missing / risks:
- Verified: Accessibility labels and button roles are set on the strip.
- Missing: VoiceOver/TalkBack validation not performed in this pass.
- Risks: Screen reader phrasing not validated on-device.

---

## Pre-merge Summary

| TODO | File | Items | Status | Blockers |
|------|------|-------|--------|----------|
| 1 | types.ts | 3 | Complete | |
| 2 | add-ons-sorting.ts | 9 (1 CRIT) | Complete | |
| 3 | OptionalAddOnsStrip.tsx | 14 | Pending | |
| 4 | AddOnsBottomSheet.tsx | 8 | Pending | |
| 5 | results.tsx | 6 (1 CRIT) | Pending | |
| **Total** | | **40 (2 CRIT)** | | |

**Sign-off required from:** [TBD]

**Test coverage:**
- [x] Unit tests for scoreAndSortAddOns():
  - Deduplicated categories (two bullets same category)
  - Category priority (first bullet category ranks higher, 40/20/0)
  - Bidirectional synonym expansion (golden → gold, brass group)
  - Token-based matching (tan doesn't match tangerine)
  - Attribute cap (+30 max)
  - Deterministic tiebreaker (equal scores preserve order)
  - Non-add-on categories ignored
  - Empty addOns array doesn't throw
- [ ] Unit tests for showViewAll logic:
  - Empty array returns false (no crash)
  - >6 items shows View all
  - >1 category shows View all
  - >4 in single category shows View all
- [ ] Visual tests for strip + bottom sheet
- [ ] Manual E2E test of full HIGH tab flow
