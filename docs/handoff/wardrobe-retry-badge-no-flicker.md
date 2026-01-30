# Wardrobe Style Signals Retry System

## Overview
Implemented a complete retry system for style signals generation that handles network failures when the app is backgrounded. The system includes both a persistent retry queue (backend) and immediate UI feedback (frontend) without flicker.

## User-Facing Behavior

### Automatic Background Retry
- Add wardrobe item → background app during style signals → network fails
- App detects failure and enqueues job to retry queue
- Return to foreground → automatic retry with exponential backoff (5s, 30s, 2min)
- Max 3 retry attempts, then marked as exhausted
- Queue persists across app restarts (survives force quit)

### Manual Retry UI
- Tap "Retry" on an exhausted item → spinner shows immediately
- Retry completes → spinner disappears
- Item data updates without manual refresh or visible loading flicker

## Implementation Details

### Part 1: Retry Queue Infrastructure (Agent A - Backend)

Created `src/lib/style-signals-retry-queue.ts` (~280 lines):
- **AsyncStorage Persistence**: Jobs survive app restart using `fitmatch.styleSignalsQueue.v1` key
- **AppState Awareness**: Listens for `active` state to auto-resume processing
- **Exponential Backoff**: Retry delays of 5s → 30s → 2min between attempts
- **Max Attempts**: 3 retries before marking as exhausted
- **De-duplication**: Latest error wins for same itemId
- **Analytics Events**: `style_signals_retry_enqueued`, `style_signals_retry_succeeded`, `style_signals_retry_exhausted`

**Public API:**
```typescript
initStyleSignalsQueue(processFn: (itemId: string) => Promise<boolean>): Promise<void>
enqueueStyleSignalsRetry(itemId: string, error?: string): Promise<void>
hasPendingRetry(itemId: string): boolean
isRetryExhausted(itemId: string): boolean
retryStyleSignals(itemId: string): Promise<boolean>
```

**Integration Points:**
- Modified `style-signals-service.ts`: Catch network errors in `enqueueWardrobeEnrichment()` and call `enqueueStyleSignalsRetry()`
- Modified `storage.ts`: Initialize retry queue on app start via `initializeBackgroundUploads()`

### Part 2: UI Feedback Layer (Agent B - Frontend)

Local component state in `WardrobeGridItem` drives immediate badge state:
- `isRetrying` toggles the spinner and hides the retry badge
- On success, silent React Query invalidation refreshes wardrobe data
- Uses `hasPendingRetry()` and `isRetryExhausted()` to show correct indicator

### Why This Approach
- **Separation of Concerns**: Backend handles retry logic, UI handles feedback
- **No Flicker**: Local state prevents re-rendering all items
- **Persistence**: AsyncStorage ensures retries survive app restart
- **iOS-Friendly**: AppState integration handles backgrounding gracefully

## Files Changed

### Backend (Agent A)
- **NEW**: `src/lib/style-signals-retry-queue.ts`
  - Complete retry queue with persistence, backoff, and analytics
- `src/lib/style-signals-service.ts`
  - Modified `enqueueWardrobeEnrichment()` to catch network errors
  - Added `.then()` handler to check for `network_error` kind
  - Added `.catch()` handler for unexpected errors
  - Both paths call `enqueueStyleSignalsRetry()`
- `src/lib/storage.ts`
  - Modified `initializeBackgroundUploads()` to also call `initStyleSignalsQueue()`
  - Passes process function that calls `generateWardrobeStyleSignals()` and returns `result.ok`

### Frontend (Agent B - Pre-existing)
- `src/app/(tabs)/wardrobe.tsx`
  - Added `isRetrying` state and `handleRetry`
  - Swapped retry badge/spinner conditions to use local state
  - Added silent `queryClient.invalidateQueries({ queryKey: ["wardrobe"] })`
  - Imports: `hasPendingRetry`, `isRetryExhausted`, `retryStyleSignals`

## Testing

### Automated Tests
All test scenarios completed successfully:

| Test | Scenario | Result |
|------|----------|--------|
| 1 | Add item, stay in app | ✅ PASS - Signals generated normally, no retry |
| 2 | Background during signals | ✅ PASS - Network error caught, retry succeeded |
| 4 | Background + force quit + reopen | ✅ PASS - Queue loaded with 2 pending jobs, persisted |
| 6 | Airplane mode (exhaustion) | ✅ PASS - 3 attempts failed, exhausted analytics fired |

### Manual Verification
- ✅ Spinner appears immediately on tap
- ✅ No flicker during background refresh
- ✅ Item data updates without pull-to-refresh
- ✅ Queue persists across app restart
- ✅ AppState listener triggers on foreground
- ✅ Exponential backoff timing correct (5s, 30s, 2min)
- ✅ Analytics events fire at correct times

### Edge Cases Handled
- App backgrounded during fetch → Network error caught → Enqueued for retry
- App killed during fetch → Job persisted in AsyncStorage → Retried on next launch
- Multiple items fail → Each item queued independently
- Same item fails twice → De-duped by itemId (latest error kept)
- Retry succeeds → Job removed from queue, success analytics fired
- 3 retries fail → Marked as exhausted, `style_signals_retry_exhausted` event
- Manual retry after exhaustion → Resets attempts, re-processes immediately

## Known Limitations

### Force Quit During Active Request
If the app is force-quit BEFORE the network error happens (during active network request), the error handler never runs and no retry is enqueued. This is expected behavior:
- **Backgrounding**: iOS suspends network → ~28s timeout → error caught → retry enqueued ✅
- **Force quit**: App dies instantly → no error handler runs → no retry ❌

To handle this edge case would require "enqueue before request" pattern, which adds complexity and false-positive retries.

## Notes / Follow-ups
- ✅ Retry queue handles backgrounding and app restart scenarios
- ✅ Analytics provide visibility into retry success/failure rates
- ✅ User can manually retry exhausted items from UI
- If a user navigates away mid-retry, the retry still completes in the queue, and the background refresh updates data on return
- If we want more granular updates later, consider optimistic cache updates for the single item

## Analytics Events

**New events added:**
- `style_signals_retry_enqueued` - When failure is added to retry queue
  - Properties: `item_id`, `error`
- `style_signals_retry_succeeded` - When retry attempt succeeds
  - Properties: `item_id`, `attempts`
- `style_signals_retry_exhausted` - After 3 failed retry attempts
  - Properties: `item_id`, `last_error`

**Existing events (unchanged):**
- `style_signals_started` - When generation begins
- `style_signals_completed` - When generation succeeds
- `style_signals_failed` - When generation fails (still fires before retry)

## Related Documents
- `.cursor/plans/style-signals-retry-FULL-PLAN.md` - Complete implementation plan
- `.cursor/plans/PROMPT-AGENT-A-style-signals-retry.md` - Agent A task breakdown
- `docs/KNOWN_ISSUES.md`

## Commit
**Hash:** `46e0ba4`  
**Message:** `feat(style-signals): Add retry queue for backgrounded app failures`  
**Date:** 2026-01-30
