# Wardrobe Retry Badge — No Flicker Fix

## Overview
Implemented immediate retry feedback on wardrobe item cards without UI flicker. When a user taps the retry badge, the card now shows a spinner instantly, hides the retry badge during the request, and refreshes item data in the background after the retry completes.

## User-Facing Behavior
- Tap "Retry" on an exhausted item → spinner shows immediately.
- Retry completes → spinner disappears.
- Item data updates without manual refresh or visible loading flicker.

## Implementation Details
### Key Change
Local component state in `WardrobeGridItem` drives immediate badge state:
- `isRetrying` toggles the spinner and hides the retry badge.
- On success, a silent React Query invalidation refreshes wardrobe data.

### Why This Approach
- Avoids re-rendering all items in the grid.
- Prevents visible loading flicker.
- Keeps changes confined to the UI layer (no queue refactor).

## Files Changed
- `src/app/(tabs)/wardrobe.tsx`
  - Added `isRetrying` state and `handleRetry`.
  - Swapped retry badge/spinner conditions to use local state.
  - Added silent `queryClient.invalidateQueries({ queryKey: ["wardrobe"] })`.
- `docs/KNOWN_ISSUES.md`
  - Moved "Badge Update Timing" into Resolved.
- `CHANGELOG.md`
  - Added fixed entry under Unreleased.

## Testing
Manual verification confirmed:
- Spinner appears immediately on tap.
- No flicker during background refresh.
- Item data updates without pull-to-refresh.

## Notes / Follow-ups
- If a user navigates away mid-retry, the retry still completes in the queue, and the background refresh updates data on return.
- If we want more granular updates later, consider optimistic cache updates for the single item.

## Related Documents
- `docs/KNOWN_ISSUES.md`
