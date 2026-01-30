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
