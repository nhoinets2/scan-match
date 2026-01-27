/**
 * AI Safety - Rollout
 *
 * Deterministic user bucketing for gradual rollout.
 * Uses a hash of the user ID to assign users to consistent buckets.
 *
 * For pre-login users (userId is null), falls back to a persistent
 * anonymous ID stored in AsyncStorage.
 */

import { getCachedAnonId } from './anonId';

/**
 * Simple deterministic hash for user bucketing (djb2)
 */
function hashUserBucket(identifier: string): number {
  let hash = 5381;
  for (let i = 0; i < identifier.length; i++) {
    hash = ((hash << 5) + hash) ^ identifier.charCodeAt(i);
  }
  // Return positive number 0-99
  return (hash >>> 0) % 100;
}

/**
 * Check if a user is in the rollout percentage
 *
 * Uses deterministic hashing so users always get the same bucket.
 * This ensures consistent experience per user across sessions.
 *
 * For pre-login users (userId is null), uses a persistent anonymous ID
 * from AsyncStorage. This ensures consistent rollout behavior before login.
 *
 * Note: Call initAnonId() early in app startup to ensure the anonymous ID
 * is loaded and cached for synchronous access.
 *
 * @param userId - User ID to check (falls back to anonId if null)
 * @param pct - Rollout percentage (0-100)
 * @returns true if user is in the rollout
 */
export function inRollout(userId: string | null | undefined, pct: number): boolean {
  // Get effective identifier: userId or cached anonId
  const effectiveId = userId || getCachedAnonId();
  
  // If no identifier available (anonId not yet loaded), exclude from rollout
  // This is a conservative default - user can retry after anonId loads
  if (!effectiveId) {
    if (__DEV__) {
      console.warn('[AI Safety] inRollout: No userId and anonId not cached. Call initAnonId() at app startup.');
    }
    return false;
  }
  
  if (pct <= 0) return false;
  if (pct >= 100) return true;

  const bucket = hashUserBucket(effectiveId);
  return bucket < pct;
}

/**
 * Get the user's rollout bucket (0-99)
 * Useful for debugging which bucket a user is in.
 *
 * @param userId - User ID (or null to use anonId fallback)
 * @returns Bucket number 0-99, or -1 if no identifier available
 */
export function getUserBucket(userId: string | null | undefined): number {
  const effectiveId = userId || getCachedAnonId();
  if (!effectiveId) return -1;
  return hashUserBucket(effectiveId);
}

// TypeScript declaration for __DEV__
declare const __DEV__: boolean;
