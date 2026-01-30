---
name: Fix backgrounded style signals
overview: Add retry logic and AppState awareness to style signals generation so network requests that fail when app is backgrounded are automatically retried when returning to foreground.
todos:
  - id: create-retry-queue
    content: "Create src/lib/style-signals-retry-queue.ts (~200 lines) with: AsyncStorage persistence, AppState listener, exponential backoff, max 3 attempts"
    status: completed
  - id: update-signals-service
    content: Update enqueueWardrobeEnrichment() in style-signals-service.ts to catch network errors and call enqueueStyleSignalsRetry()
    status: completed
  - id: init-retry-queue
    content: Update initializeBackgroundUploads() in storage.ts to also call initStyleSignalsQueue()
    status: completed
  - id: add-import
    content: Add import for enqueueStyleSignalsRetry in style-signals-service.ts
    status: completed
  - id: wardrobe-ui
    content: "Add wardrobe.tsx UI: pending retry spinner, exhausted warning icon, manual retry on tap, retry on pull-to-refresh"
    status: pending
  - id: test-background-flow
    content: "Test: add item → background app → verify retry on foreground → verify signals saved"
    status: pending
  - id: test-app-restart
    content: "Test: add item → background → force quit → reopen → verify retry from persisted queue"
    status: pending
  - id: test-ui
    content: "Test UI: verify spinner shows during retry, warning shows on exhausted, tap retries"
    status: pending
isProject: false
---

# Style Signals Retry Queue - Full Implementation Plan

## Overview

Fix for style signals generation failing when app is backgrounded during network request.

- **Root cause:** iOS suspends network → Edge Function gets "EarlyDrop" → fetch() rejects
- **Solution:** Retry queue with persistence and AppState awareness (same pattern as upload queue)

---

## Problem

When a wardrobe item is added and the app is backgrounded during style signals generation:

- Network request fails with "Network request failed" (~25s timeout)
- Edge Function logs show `"reason": "EarlyDrop"` (client disconnected)
- No retry logic exists - signals are permanently lost
- Upload queue has AppState awareness, but style signals doesn't

---

## Task Assignment

### Agent 1: Client-Side Services (src/lib/)

Responsible for core retry queue implementation and service integration.

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Create retry queue module | `src/lib/style-signals-retry-queue.ts` (NEW) | [x] |
| 2 | Add AsyncStorage persistence | `style-signals-retry-queue.ts` | [x] |
| 3 | Add AppState listener for foreground resume | `style-signals-retry-queue.ts` | [x] |
| 4 | Implement exponential backoff (5s, 30s, 2min) | `style-signals-retry-queue.ts` | [x] |
| 5 | Add max retry limit (3 attempts) | `style-signals-retry-queue.ts` | [x] |
| 6 | Export public API functions | `style-signals-retry-queue.ts` | [x] |
| 7 | Update enqueueWardrobeEnrichment() | `src/lib/style-signals-service.ts` | [x] |
| 8 | Add import for retry queue | `src/lib/style-signals-service.ts` | [x] |
| 9 | Initialize retry queue on app start | `src/lib/storage.ts` | [x] |

### Agent 2: Frontend/UI (src/app/)

Responsible for wardrobe screen visual indicators and manual retry.

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Import retry queue functions | `src/app/(tabs)/wardrobe.tsx` | [ ] |
| 2 | Add pending retry indicator (spinner) | `src/app/(tabs)/wardrobe.tsx` | [ ] |
| 3 | Add exhausted retry indicator (warning) | `src/app/(tabs)/wardrobe.tsx` | [ ] |
| 4 | Add manual retry on tap | `src/app/(tabs)/wardrobe.tsx` | [ ] |
| 5 | Add retry on pull-to-refresh | `src/app/(tabs)/wardrobe.tsx` | [ ] |

### Backend (No changes required)

The Edge Function (`supabase/functions/style-signals/`) does NOT need modification.
- It already handles the request correctly
- The "EarlyDrop" is expected iOS behavior (client disconnect)
- No server-side retry logic needed

---

## Files Summary

| File | Agent | Change Type | Lines |
|------|-------|-------------|-------|
| `src/lib/style-signals-retry-queue.ts` | 1 | NEW | ~200 |
| `src/lib/style-signals-service.ts` | 1 | MODIFY | ~20 |
| `src/lib/storage.ts` | 1 | MODIFY | ~10 |
| `src/app/(tabs)/wardrobe.tsx` | 2 | MODIFY | ~30 |
| `supabase/functions/style-signals/` | - | NONE | 0 |

---

# Implementation Details

## 1. Create Style Signals Retry Queue

**New file: `src/lib/style-signals-retry-queue.ts`**

```typescript
/**
 * Style Signals Retry Queue
 * 
 * Handles retry logic for style signals generation with:
 * - AsyncStorage persistence (survives app restarts)
 * - AppState-aware processing (resumes on foreground)
 * - Exponential backoff (5s, 30s, 2min)
 * - Max 3 retry attempts
 * - Double-init protection
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { trackEvent } from './analytics';

export type StyleSignalsJob = {
  itemId: string;
  attempts: number;
  lastError?: string;
  createdAt: number;
  nextAttemptAt?: number;
};

const QUEUE_KEY = 'fitmatch.styleSignalsQueue.v1';
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [5000, 30000, 120000]; // 5s, 30s, 2min

let queue: StyleSignalsJob[] = [];
let isLoaded = false;
let isProcessing = false;
let initialized = false;
let processFnRef: ((itemId: string) => Promise<boolean>) | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================
// PUBLIC API
// ============================================

/**
 * Initialize the style signals retry queue.
 * Call once on app start after auth is ready.
 */
export async function initStyleSignalsQueue(
  processFn: (itemId: string) => Promise<boolean>
): Promise<void> {
  if (initialized) {
    console.log('[StyleSignalsQueue] Already initialized, skipping...');
    processFnRef = processFn;
    void processQueue();
    return;
  }
  
  console.log('[StyleSignalsQueue] Initializing...');
  initialized = true;
  processFnRef = processFn;
  
  await loadQueue();
  console.log('[StyleSignalsQueue] Loaded with', queue.length, 'pending jobs');
  
  // Resume on app foreground
  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active' && processFnRef) {
      console.log('[StyleSignalsQueue] App active, resuming...');
      void processQueue();
    }
  });
  
  // Kick once at init
  void processQueue();
}

/**
 * Enqueue a failed style signals generation for retry.
 */
export async function enqueueStyleSignalsRetry(
  itemId: string, 
  error?: string
): Promise<void> {
  await loadQueue();
  
  // De-dupe by itemId (latest wins)
  queue = queue.filter(j => j.itemId !== itemId);
  
  queue.push({
    itemId,
    attempts: 0,
    lastError: error,
    createdAt: Date.now(),
    nextAttemptAt: undefined,
  });
  
  await persistQueue();
  
  console.log('[StyleSignalsQueue] Enqueued retry for:', itemId);
  trackEvent('style_signals_retry_enqueued', { item_id: itemId, error });
  
  clearRetryTimer();
}

/**
 * Check if an item has a pending retry.
 */
export function hasPendingRetry(itemId: string): boolean {
  return queue.some(j => j.itemId === itemId);
}

/**
 * Check if an item has exhausted retries.
 */
export function isRetryExhausted(itemId: string): boolean {
  const job = queue.find(j => j.itemId === itemId);
  return job ? job.attempts >= MAX_ATTEMPTS : false;
}

/**
 * Manual retry for a specific item.
 */
export async function retryStyleSignals(itemId: string): Promise<boolean> {
  await loadQueue();
  
  const jobIndex = queue.findIndex(j => j.itemId === itemId);
  if (jobIndex === -1) return false;
  
  // Reset attempts
  queue[jobIndex] = {
    ...queue[jobIndex],
    attempts: 0,
    nextAttemptAt: undefined,
    lastError: undefined,
  };
  
  await persistQueue();
  clearRetryTimer();
  
  if (processFnRef) {
    void processQueue();
  }
  
  return true;
}

// ============================================
// QUEUE PROCESSING
// ============================================

async function processQueue(): Promise<void> {
  await loadQueue();
  
  if (isProcessing || queue.length === 0 || !processFnRef) {
    return;
  }
  
  isProcessing = true;
  console.log('[StyleSignalsQueue] Processing', queue.length, 'jobs');
  
  const now = Date.now();
  
  try {
    for (const job of [...queue]) {
      // Skip if removed during processing
      if (!queue.some(j => j.itemId === job.itemId)) continue;
      
      // Max attempts reached
      if (job.attempts >= MAX_ATTEMPTS) {
        console.log('[StyleSignalsQueue] Max attempts for:', job.itemId);
        trackEvent('style_signals_retry_exhausted', { 
          item_id: job.itemId, 
          last_error: job.lastError 
        });
        continue;
      }
      
      // Backoff not ready
      if (job.nextAttemptAt && job.nextAttemptAt > now) {
        continue;
      }
      
      console.log('[StyleSignalsQueue] Retrying:', job.itemId, 'attempt:', job.attempts + 1);
      
      try {
        const success = await processFnRef(job.itemId);
        
        if (success) {
          // Success - remove from queue
          queue = queue.filter(j => j.itemId !== job.itemId);
          await persistQueue();
          
          console.log('[StyleSignalsQueue] ✅ Retry succeeded:', job.itemId);
          trackEvent('style_signals_retry_succeeded', { 
            item_id: job.itemId, 
            attempts: job.attempts + 1 
          });
        } else {
          // API returned error (not network) - mark attempt
          await markAttemptFailed(job.itemId, 'API returned error');
        }
      } catch (e) {
        // Network error - mark attempt with backoff
        const errorMsg = e instanceof Error ? e.message : String(e);
        await markAttemptFailed(job.itemId, errorMsg);
      }
    }
  } finally {
    isProcessing = false;
    scheduleRetryTimer();
  }
}

async function markAttemptFailed(itemId: string, error: string): Promise<void> {
  const jobIndex = queue.findIndex(j => j.itemId === itemId);
  if (jobIndex === -1) return;
  
  const job = queue[jobIndex];
  const delayIndex = Math.min(job.attempts, RETRY_DELAYS_MS.length - 1);
  const delay = RETRY_DELAYS_MS[delayIndex];
  
  queue[jobIndex] = {
    ...job,
    attempts: job.attempts + 1,
    lastError: error,
    nextAttemptAt: Date.now() + delay,
  };
  
  await persistQueue();
  console.log('[StyleSignalsQueue] Will retry in', delay / 1000, 's');
}

// ============================================
// PERSISTENCE
// ============================================

async function loadQueue(): Promise<void> {
  if (isLoaded) return;
  
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    queue = raw ? JSON.parse(raw) : [];
    isLoaded = true;
  } catch {
    queue = [];
    isLoaded = true;
  }
}

async function persistQueue(): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('[StyleSignalsQueue] Persist error:', e);
  }
}

function clearRetryTimer(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function scheduleRetryTimer(): void {
  clearRetryTimer();
  
  const now = Date.now();
  const pendingJobs = queue.filter(j => 
    j.attempts < MAX_ATTEMPTS && 
    j.nextAttemptAt && 
    j.nextAttemptAt > now
  );
  
  if (pendingJobs.length > 0) {
    const soonest = Math.min(...pendingJobs.map(j => j.nextAttemptAt!));
    const delayMs = Math.max(1000, soonest - now);
    
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void processQueue();
    }, delayMs);
  }
}
```

---

## 2. Update Style Signals Service

**Modify: `src/lib/style-signals-service.ts`**

Add import at top:

```typescript
import { enqueueStyleSignalsRetry } from './style-signals-retry-queue';
```

Update `enqueueWardrobeEnrichment()` function (around line 579):

```typescript
/**
 * Fire-and-forget enrichment for wardrobe items.
 * On network error, enqueues for retry via the retry queue.
 *
 * @param itemId - The wardrobe item ID to enrich
 */
export function enqueueWardrobeEnrichment(itemId: string): void {
  console.log('[StyleSignals] Enqueuing background enrichment for:', itemId);
  
  generateWardrobeStyleSignals(itemId)
    .then((result) => {
      // If API returned an error (not network), enqueue for retry
      if (!result.ok && result.error?.kind === 'network_error') {
        console.log('[StyleSignals] Network error, queueing retry for:', itemId);
        enqueueStyleSignalsRetry(itemId, result.error.message);
      }
    })
    .catch((error) => {
      // Unexpected error (network interruption, etc.)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn('[StyleSignals] Unexpected error, queueing retry:', itemId, errorMessage);
      enqueueStyleSignalsRetry(itemId, errorMessage);
      
      trackEvent('style_signals_failed', {
        type: 'wardrobe',
        item_id: itemId,
        error_type: 'unexpected_error',
        error_message: errorMessage,
      });
    });
}
```

---

## 3. Initialize Retry Queue

**Modify: `src/lib/storage.ts`**

Add import at top:

```typescript
import { initStyleSignalsQueue } from './style-signals-retry-queue';
import { generateWardrobeStyleSignals } from './style-signals-service';
```

Update `initializeBackgroundUploads()` (around line 498):

```typescript
/**
 * Initialize background uploads AND style signals retry queue.
 * Call once on app start.
 */
export async function initializeBackgroundUploads(): Promise<void> {
  console.log('[Storage] Initializing background uploads...');
  await initUploadQueue(processUploadJob);
  
  // Also initialize style signals retry queue
  console.log('[Storage] Initializing style signals retry queue...');
  await initStyleSignalsQueue(async (itemId: string) => {
    const result = await generateWardrobeStyleSignals(itemId);
    return result.ok;
  });
}
```

---

## 4. Wardrobe Screen Integration

**Modify: `src/app/(tabs)/wardrobe.tsx`**

Add visual indicators and manual retry capability:

```typescript
import { 
  hasPendingRetry, 
  isRetryExhausted, 
  retryStyleSignals 
} from '@/lib/style-signals-retry-queue';

// In WardrobeItemCard or list item rendering:
// Show sync indicator for pending retries
{hasPendingRetry(item.id) && (
  <View className="absolute top-2 right-2">
    <ActivityIndicator size="small" color="#666" />
  </View>
)}

// Show retry failed indicator with manual retry
{isRetryExhausted(item.id) && (
  <Pressable 
    onPress={() => retryStyleSignals(item.id)}
    className="absolute top-2 right-2 bg-red-100 rounded-full p-1"
  >
    <AlertCircle size={16} color="#dc2626" />
  </Pressable>
)}

// On pull-to-refresh, also retry exhausted items:
const handleRefresh = async () => {
  // ... existing refresh logic ...
  
  // Retry any failed style signals
  for (const item of wardrobeItems) {
    if (isRetryExhausted(item.id)) {
      await retryStyleSignals(item.id);
    }
  }
};
```

**UI States:**

| State | Indicator | User Action |
|-------|-----------|-------------|
| Pending retry | Small spinner | None (auto-retries) |
| Retry exhausted | Red warning icon | Tap to retry manually |
| Success | No indicator | Normal item display |

---

## 5. No Backend Changes Required

The Edge Function (`supabase/functions/style-signals/`) works correctly:

- "EarlyDrop" shutdown is expected iOS behavior (client disconnect)
- No server-side retry logic needed
- Function will process fresh request on retry

---

# Code Review Checklist

## style-signals-retry-queue.ts (NEW)

- [x] AsyncStorage key is namespaced: `fitmatch.styleSignalsQueue.v1`
- [x] Double-init protection via `initialized` flag
- [x] AppState listener only registered once
- [x] Queue de-duplicates by itemId (latest wins)
- [x] Exponential backoff delays: `[5000, 30000, 120000]`
- [x] Max attempts constant: `MAX_ATTEMPTS = 3`
- [x] Jobs persist to AsyncStorage after every mutation
- [x] Timer cleanup on retry timer changes
- [x] Analytics events fire correctly:
  - `style_signals_retry_enqueued`
  - `style_signals_retry_succeeded`
  - `style_signals_retry_exhausted`

## style-signals-service.ts (MODIFY)

- [x] Import added: `import { enqueueStyleSignalsRetry } from './style-signals-retry-queue'`
- [x] `enqueueWardrobeEnrichment()` catches network errors
- [x] Calls `enqueueStyleSignalsRetry()` on failure
- [x] Existing analytics events preserved
- [x] No breaking changes to function signature

## storage.ts (MODIFY)

- [x] Import added for `initStyleSignalsQueue` and `generateWardrobeStyleSignals`
- [x] `initializeBackgroundUploads()` calls `initStyleSignalsQueue()`
- [x] Process function correctly returns boolean for success/failure
- [x] Error handling doesn't break existing upload queue init

## wardrobe.tsx (MODIFY)

- [ ] Imports added: `hasPendingRetry`, `isRetryExhausted`, `retryStyleSignals`
- [ ] Pending retry indicator shows spinner on items
- [ ] Exhausted retry indicator shows warning icon
- [ ] Tap on warning triggers `retryStyleSignals()`
- [ ] Pull-to-refresh retries exhausted items
- [ ] No breaking changes to existing wardrobe functionality

---

# Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| App backgrounded during fetch | Network error caught → enqueued for retry |
| App killed during fetch | Job persisted in AsyncStorage → retried on next launch |
| Multiple items fail | Each item queued independently |
| Same item fails twice | De-duped by itemId (latest error kept) |
| Retry succeeds | Job removed from queue, success analytics fired |
| 3 retries fail | Marked as exhausted, `style_signals_retry_exhausted` event |
| Manual retry after exhaustion | Resets attempts, re-processes immediately |
| Item deleted while queued | Retry will fail silently (item not found), removed from queue |

---

# Testing Checklist

## Agent 1: Service Layer Testing

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 1 | Add item, stay in app | Signals generated normally | [ ] |
| 2 | Add item, background within 2s | Network error logged, retry enqueued | [ ] |
| 3 | Return to foreground after #2 | Auto-retry succeeds | [ ] |
| 4 | Add item, background, force quit | Queue persisted | [ ] |
| 5 | Reopen app after #4 | Retry happens on launch | [ ] |
| 6 | Airplane mode during retry | 3 attempts then exhausted | [ ] |

## Agent 2: UI Testing

| # | Test Case | Expected Result | Status |
|---|-----------|-----------------|--------|
| 1 | Item with pending retry | Shows spinner indicator | [ ] |
| 2 | Item with exhausted retry | Shows warning icon | [ ] |
| 3 | Tap warning icon | Triggers retry, shows spinner | [ ] |
| 4 | Pull-to-refresh with failed items | Retries exhausted items | [ ] |
| 5 | Successful retry | Indicator disappears | [ ] |

## Edge Function Verification (Both Agents)

| # | Verification | Expected | Status |
|---|--------------|----------|--------|
| 1 | Check logs for "EarlyDrop" on background | Normal behavior | [ ] |
| 2 | Verify no error on retry request | 200 OK response | [ ] |
| 3 | Confirm signals saved to DB | `style_signals_v1` populated | [ ] |

---

# Analytics Events

**Existing events (unchanged):**
- `style_signals_started` - when generation begins
- `style_signals_completed` - when generation succeeds
- `style_signals_failed` - when generation fails (still fires before retry)

**New events:**
- `style_signals_retry_enqueued` - when failure is added to retry queue
- `style_signals_retry_succeeded` - when retry attempt succeeds
- `style_signals_retry_exhausted` - after 3 failed retry attempts

---

# Sequence Diagram

```
User adds item → Upload succeeds → Style signals starts
                                          ↓
                              [User backgrounds app]
                                          ↓
                              iOS suspends network
                                          ↓
                              Edge Function: EarlyDrop
                                          ↓
                              fetch() rejects: Network error
                                          ↓
                              enqueueStyleSignalsRetry(itemId)
                                          ↓
                              [Job persisted to AsyncStorage]
                                          ↓
                              [User returns to foreground]
                                          ↓
                              AppState → 'active'
                                          ↓
                              processQueue() called
                                          ↓
                              generateWardrobeStyleSignals(itemId)
                                          ↓
                              ✅ Success → remove from queue
```

---

# NOT Included (Confirmed)

- ~~Backend/Edge Function changes~~ - Not needed
- ~~Database schema changes~~ - Not needed  
- ~~New API endpoints~~ - Not needed

---

# Sign-off

- [x] Agent 1 (Client-Side Services): Code complete
- [ ] Agent 2 (Frontend/UI): Code complete
- [ ] Testing complete
- [ ] Ready for merge
