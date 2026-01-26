/**
 * AI Safety - Rollout
 *
 * Deterministic user bucketing for gradual rollout.
 * Uses a hash of the user ID to assign users to consistent buckets.
 */

/**
 * Simple deterministic hash for user bucketing (djb2)
 */
function hashUserBucket(userId: string): number {
  let hash = 5381;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) + hash) ^ userId.charCodeAt(i);
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
 * @param userId - User ID to check
 * @param pct - Rollout percentage (0-100)
 * @returns true if user is in the rollout
 */
export function inRollout(userId: string | null | undefined, pct: number): boolean {
  if (!userId) return false;
  if (pct <= 0) return false;
  if (pct >= 100) return true;

  const bucket = hashUserBucket(userId);
  return bucket < pct;
}

/**
 * Get the user's rollout bucket (0-99)
 * Useful for debugging which bucket a user is in.
 */
export function getUserBucket(userId: string): number {
  return hashUserBucket(userId);
}
