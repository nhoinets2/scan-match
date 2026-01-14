/**
 * Persistent Upload Queue
 * 
 * Handles background uploads with:
 * - AsyncStorage persistence (survives app restarts)
 * - Single processor (no race conditions)
 * - Retry logic with max attempts and exponential backoff
 * - Cancel support for deleted items
 * - AppState-aware processing (resumes on foreground)
 * - Double-init protection
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { AppState, AppStateStatus } from 'react-native';

export type UploadKind = 'wardrobe' | 'scan';

export type UploadJob = {
  kind: UploadKind;           // Type of upload (wardrobe item or scan)
  id: string;                 // itemId (wardrobe) or checkId (scan)
  userId: string;
  localUri: string;           // file://... in Documents/{kind}-images/
  expectedImageUri: string;   // guard value (same as localUri at enqueue time)
  bucket: string;             // Supabase storage bucket name
  storagePath: string;        // deterministic: `${userId}/{kind}/{id}.jpg`
  attempts: number;
  lastError?: string;
  createdAt: number;
  nextAttemptAt?: number;     // timestamp for next retry (backoff)
  
  // Legacy field - kept for backwards compatibility with existing queue
  /** @deprecated Use `id` instead */
  itemId?: string;
};

const QUEUE_KEY = 'fitmatch.uploadQueue.v1';
const MAX_ATTEMPTS = 3;

// ============================================
// TELEMETRY EVENTS (console for now, easy to hook into analytics later)
// ============================================

export function logUploadEvent(event: 
  | 'upload_enqueued' 
  | 'upload_succeeded' 
  | 'upload_failed_max_retries' 
  | 'upload_stale_ignored'
  | 'upload_retry_manual',
  itemId: string,
  extra?: Record<string, unknown>
): void {
  console.log(`[UploadTelemetry] ${event}`, { itemId, ...extra });
}

// Backoff delays: 5s, 30s, 2min
const RETRY_DELAYS_MS = [5000, 30000, 120000];

let queue: UploadJob[] = [];
let isLoaded = false;
let isProcessing = false;
let initialized = false; // Guard against double-init
const cancelled = new Set<string>();

// Store the process function reference for AppState listener
let processFnRef: ((job: UploadJob) => Promise<void>) | null = null;

// Timer for scheduled retry wake-up (cleared on queue changes)
let retryTimer: ReturnType<typeof setTimeout> | null = null;

// Track which jobs we've logged as "skipped" this session to avoid spam
const loggedSkipsThisSession = new Set<string>();

// Queue idle callbacks - called when queue transitions from "has jobs" to "empty" for a kind
type QueueIdleCallback = (kind: UploadKind) => void;
const queueIdleListeners = new Set<QueueIdleCallback>();

// Track previous state to detect transitions
let previousQueueStateByKind: Record<UploadKind, boolean> = {
  wardrobe: false,
  scan: false,
};

/**
 * Initialize the upload queue.
 * Call this once on app start after you have supabase + userId available.
 * Safe to call multiple times - will only init once.
 */
export async function initUploadQueue(processFn: (job: UploadJob) => Promise<void>): Promise<void> {
  // Guard against double-init (Fast Refresh, auth changes, navigation remounts)
  if (initialized) {
    console.log('[UploadQueue] Already initialized, skipping...');
    // Still update the processFn reference in case it changed
    processFnRef = processFn;
    // Kick processing in case there are pending jobs
    void processQueue(processFn);
    return;
  }
  
  console.log('[UploadQueue] Initializing...');
  initialized = true;
  processFnRef = processFn;
  
  await loadQueue();
  console.log('[UploadQueue] Loaded queue with', queue.length, 'pending jobs');
  
  // Resume on app foreground
  const handleAppStateChange = (state: AppStateStatus) => {
    if (state === 'active' && processFnRef) {
      console.log('[UploadQueue] App became active, resuming queue processing...');
      void processQueue(processFnRef);
    }
  };
  
  // Use the new subscription API - only register once
  AppState.addEventListener('change', handleAppStateChange);
  
  // Kick once at init
  void processQueue(processFn);
}

/**
 * Get the job ID (handles backwards compatibility with legacy itemId field)
 */
function getJobId(job: UploadJob): string {
  return job.id || job.itemId || '';
}

/**
 * Enqueue an upload job.
 * De-duplicates by id (latest wins).
 */
export async function enqueueUpload(job: Omit<UploadJob, 'attempts' | 'createdAt' | 'nextAttemptAt' | 'itemId'>): Promise<void> {
  await loadQueue();

  console.log('[UploadQueue] Enqueueing upload:', { kind: job.kind, id: job.id });

  // De-dupe by id (latest wins)
  queue = queue.filter(j => getJobId(j) !== job.id);

  queue.push({
    ...job,
    itemId: job.id, // Keep legacy field for backwards compatibility
    attempts: 0,
    createdAt: Date.now(),
    nextAttemptAt: undefined, // Ready to process immediately
  });

  await persistQueue();
  console.log('[UploadQueue] Queue size:', queue.length);
  
  // Telemetry
  logUploadEvent('upload_enqueued', job.id, { kind: job.kind });
  
  // Clear any pending retry timer since queue changed
  clearRetryTimer();
}

/**
 * Cancel a pending upload (e.g., when item is deleted).
 * @param id - The itemId (wardrobe) or checkId (scan) to cancel
 */
export async function cancelUpload(id: string): Promise<void> {
  await loadQueue();
  
  console.log('[UploadQueue] Cancelling upload for:', id);
  
  cancelled.add(id);
  queue = queue.filter(j => getJobId(j) !== id);
  
  await persistQueue();
}

/**
 * Process the upload queue.
 * Runs jobs oldest-first, with retry logic and backoff.
 */
export async function processQueue(processFn: (job: UploadJob) => Promise<void>): Promise<void> {
  await loadQueue();
  
  if (isProcessing) {
    console.log('[UploadQueue] Already processing, skipping...');
    return;
  }
  
  if (queue.length === 0) {
    console.log('[UploadQueue] Queue is empty, nothing to process');
    return;
  }
  
  isProcessing = true;
  console.log('[UploadQueue] Starting queue processing, jobs:', queue.length);

  try {
    // Process oldest first
    queue.sort((a, b) => a.createdAt - b.createdAt);
    const now = Date.now();

    for (const job of [...queue]) {
      const jobId = getJobId(job);
      
      // Removed/cancelled while we were looping
      if (!queue.some(j => getJobId(j) === jobId)) continue;
      
      if (cancelled.has(jobId)) {
        cancelled.delete(jobId);
        // ensure removed
        queue = queue.filter(j => getJobId(j) !== jobId);
        await persistQueue();
        continue;
      }

      // Max attempts reached - leave in queue but skip (will be cleaned on next enqueue of same item)
      if (job.attempts >= MAX_ATTEMPTS) {
        // Only log telemetry once per session
        if (!loggedSkipsThisSession.has(`failed_${jobId}`)) {
          logUploadEvent('upload_failed_max_retries', jobId, { kind: job.kind, lastError: job.lastError });
          loggedSkipsThisSession.add(`failed_${jobId}`);
        }
        continue;
      }

      // Backoff: skip if not ready yet (log once per session per job to avoid spam)
      if (job.nextAttemptAt && job.nextAttemptAt > now) {
        if (!loggedSkipsThisSession.has(jobId)) {
          console.log('[UploadQueue] Job pending retry:', jobId, 
            'kind:', job.kind,
            'attempts:', job.attempts, 
            'retry in:', Math.round((job.nextAttemptAt - now) / 1000), 's');
          loggedSkipsThisSession.add(jobId);
        }
        continue;
      }
      
      // Clear from logged skips if we're now processing it
      loggedSkipsThisSession.delete(jobId);

      // Local file still exists?
      const info = await FileSystem.getInfoAsync(job.localUri);
      if (!info.exists) {
        // INTEGRITY CHECK: This should not happen if sweep logic is correct
        console.warn('[UploadQueue] INTEGRITY: Local file missing for queued job:', {
          jobId,
          kind: job.kind,
          localUri: job.localUri,
          message: 'File was deleted while job was queued - possible sweep race condition',
        });
        // Drop the job; nothing to upload
        queue = queue.filter(j => getJobId(j) !== jobId);
        await persistQueue();
        continue;
      }

      try {
        console.log('[UploadQueue] Processing job:', jobId, 'kind:', job.kind, 'attempt:', job.attempts + 1);
        await processFn(job);

        // Success: remove job
        console.log('[UploadQueue] Upload successful for:', jobId);
        queue = queue.filter(j => getJobId(j) !== jobId);
        await persistQueue();
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error('[UploadQueue] Upload failed for:', jobId, errorMessage);
        
        // Calculate next retry delay with exponential backoff
        const delayIndex = Math.min(job.attempts, RETRY_DELAYS_MS.length - 1);
        const delay = RETRY_DELAYS_MS[delayIndex];
        const nextAttemptAt = Date.now() + delay;
        
        // Failure: bump attempts, store last error, set next attempt time
        queue = queue.map(j => {
          if (getJobId(j) !== jobId) return j;
          return {
            ...j,
            attempts: j.attempts + 1,
            lastError: errorMessage,
            nextAttemptAt,
          };
        });
        await persistQueue();
        
        console.log('[UploadQueue] Will retry in', delay / 1000, 's');
        
        // Continue to next job (don't block on failed job)
        // No sleep here - backoff is handled via nextAttemptAt
      }
    }
  } finally {
    isProcessing = false;
    console.log('[UploadQueue] Queue processing complete, remaining jobs:', queue.length);
    
    // Check if any kind transitioned to idle and notify listeners
    checkAndEmitIdleEvents();
    
    // Schedule next processing if there are jobs waiting for backoff
    scheduleRetryTimer();
  }
}

/**
 * Get the number of pending uploads.
 */
export function getPendingUploadCount(): number {
  return queue.length;
}

/**
 * Check if a specific item has a pending upload.
 * @param id - The itemId (wardrobe) or checkId (scan)
 */
export function hasPendingUpload(id: string): boolean {
  return queue.some(j => getJobId(j) === id);
}

/**
 * Get queue status for debugging.
 */
export function getQueueStatus(): { 
  pending: number; 
  failed: number; 
  ready: number;
} {
  const now = Date.now();
  const pending = queue.length;
  const failed = queue.filter(j => j.attempts >= MAX_ATTEMPTS).length;
  const ready = queue.filter(j => 
    j.attempts < MAX_ATTEMPTS && 
    (!j.nextAttemptAt || j.nextAttemptAt <= now)
  ).length;
  
  return { pending, failed, ready };
}

/**
 * Get all pending upload local URIs for a given kind.
 * Used by orphan sweep to avoid deleting files that are still being uploaded.
 * @param kind - 'wardrobe' or 'scan' (optional, returns all if not specified)
 */
export function getPendingUploadLocalUris(kind?: UploadKind): Set<string> {
  const uris = new Set<string>();
  for (const job of queue) {
    if (!kind || job.kind === kind) {
      uris.add(job.localUri);
    }
  }
  return uris;
}

/**
 * Check if there are any pending uploads for a given kind.
 * Used to skip orphan sweep when uploads are in progress.
 * @param kind - 'wardrobe' or 'scan' (optional, checks all if not specified)
 */
export function hasAnyPendingUploads(kind?: UploadKind): boolean {
  if (!kind) return queue.length > 0;
  return queue.some(j => j.kind === kind);
}

/**
 * Register a callback for when queue transitions to idle for a kind.
 * Called when queue goes from "has pending jobs" → "no jobs" for wardrobe or scan.
 * Returns an unsubscribe function.
 */
export function onQueueIdle(callback: QueueIdleCallback): () => void {
  queueIdleListeners.add(callback);
  return () => {
    queueIdleListeners.delete(callback);
  };
}

/**
 * Check queue state and emit idle events if transitioned.
 * Should be called after any queue mutation (success, cancel, etc.)
 */
function checkAndEmitIdleEvents(): void {
  const kinds: UploadKind[] = ['wardrobe', 'scan'];
  
  for (const kind of kinds) {
    const hadJobs = previousQueueStateByKind[kind];
    const hasJobs = queue.some(j => j.kind === kind);
    
    // Transition: had jobs → no jobs = queue became idle
    if (hadJobs && !hasJobs) {
      console.log(`[UploadQueue] Queue became idle for: ${kind}`);
      // Notify all listeners (debounced via setTimeout to avoid blocking)
      setTimeout(() => {
        for (const listener of queueIdleListeners) {
          try {
            listener(kind);
          } catch (e) {
            console.error('[UploadQueue] Idle listener error:', e);
          }
        }
      }, 100); // Small debounce
    }
    
    // Update state for next check
    previousQueueStateByKind[kind] = hasJobs;
  }
}

/**
 * Check if an item has a failed upload (max attempts reached).
 * @param id - The itemId (wardrobe) or checkId (scan)
 */
export function isUploadFailed(id: string): boolean {
  const job = queue.find(j => getJobId(j) === id);
  return job ? job.attempts >= MAX_ATTEMPTS : false;
}

/**
 * Get the failed upload job for an item (if any).
 * @param id - The itemId (wardrobe) or checkId (scan)
 */
export function getFailedUpload(id: string): UploadJob | null {
  const job = queue.find(j => getJobId(j) === id && j.attempts >= MAX_ATTEMPTS);
  return job ?? null;
}

/**
 * Retry a failed upload - resets attempts and kicks processing.
 * @param id - The itemId (wardrobe) or checkId (scan)
 */
export async function retryFailedUpload(id: string): Promise<boolean> {
  await loadQueue();
  
  const jobIndex = queue.findIndex(j => getJobId(j) === id);
  if (jobIndex === -1) {
    console.log('[UploadQueue] No job found for retry:', id);
    return false;
  }
  
  const job = queue[jobIndex];
  if (job.attempts < MAX_ATTEMPTS) {
    console.log('[UploadQueue] Job not failed, skipping retry:', id);
    return false;
  }
  
  console.log('[UploadQueue] Manual retry for:', id);
  logUploadEvent('upload_retry_manual', id, { kind: job.kind, previousAttempts: job.attempts });
  
  // Reset attempts and nextAttemptAt
  queue[jobIndex] = {
    ...job,
    attempts: 0,
    nextAttemptAt: undefined,
    lastError: undefined,
  };
  
  // Clear from logged skips so we see fresh logs
  loggedSkipsThisSession.delete(itemId);
  
  await persistQueue();
  
  // Clear any pending timer and reschedule
  clearRetryTimer();
  
  // Kick processing immediately
  if (processFnRef) {
    void processQueue(processFnRef);
  }
  
  return true;
}

// ============================================
// INTERNAL HELPERS
// ============================================

async function loadQueue(): Promise<void> {
  if (isLoaded) return;
  
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    queue = raw ? safeParse<UploadJob[]>(raw, []) : [];
    isLoaded = true;
    
    // Initialize previous state to match current queue (prevents spurious idle events on load)
    previousQueueStateByKind = {
      wardrobe: queue.some(j => j.kind === 'wardrobe'),
      scan: queue.some(j => j.kind === 'scan'),
    };
  } catch (error) {
    console.error('[UploadQueue] Failed to load queue:', error);
    queue = [];
    isLoaded = true;
  }
}

async function persistQueue(): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('[UploadQueue] Failed to persist queue:', error);
  }
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Clear any pending retry timer.
 */
function clearRetryTimer(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

/**
 * Schedule the next retry timer based on soonest pending job.
 * Clears any existing timer first.
 */
function scheduleRetryTimer(): void {
  clearRetryTimer();
  
  const now = Date.now();
  const jobsWithBackoff = queue.filter(j => 
    j.attempts < MAX_ATTEMPTS && 
    j.nextAttemptAt && 
    j.nextAttemptAt > now
  );
  
  if (jobsWithBackoff.length > 0) {
    // Find the soonest retry time
    const soonest = Math.min(...jobsWithBackoff.map(j => j.nextAttemptAt!));
    const delayMs = Math.max(1000, soonest - now);
    
    console.log('[UploadQueue] Scheduling next processing in', Math.round(delayMs / 1000), 's');
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (processFnRef) {
        void processQueue(processFnRef);
      }
    }, delayMs);
  }
}
