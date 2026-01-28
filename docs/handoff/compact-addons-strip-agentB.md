# Compact Add-ons Strip Handoff (Agent B)

## Scope Completed
- TODO 3: `OptionalAddOnsStrip.tsx` compact strip component.
- TODO 4: `AddOnsBottomSheet.tsx` expanded view sheet.

## Files Touched
- `src/components/OptionalAddOnsStrip.tsx`
  - New compact strip with AI-aware title, memoized sorting, and max-6 thumbnails.
  - Header row is a full-width Pressable to open the sheet.
  - Category badge overlay ("Layer", "Bag", "Acc") with spec styling.
  - Accessibility labels and hints for thumbnails and header button.
- `src/components/AddOnsBottomSheet.tsx`
  - New modal sheet with fixed tab order (Layers, Bags, Accessories).
  - Filters tabs to categories that exist and renders a grid of thumbnails.
  - Lazy render: returns null when `visible` is false.
  - Close handling via overlay press, close button, and `onRequestClose`.

## Behavior Notes
- Strip title uses valid AI check: exactly 2 `to_elevate` bullets.
- `showViewAll` logic guards empty arrays and only shows when needed.
- Thumbnail styles match existing wardrobe item sizing and borders.
- Bottom sheet tabs preserve fixed order while hiding empty categories.

## Tests Run
- None.

## Follow-ups / Risks
- Manual/visual QA not performed for badge sizing, sheet gestures, or a11y.
