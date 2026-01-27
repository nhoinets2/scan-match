/**
 * AI Safety - Anonymous ID
 *
 * Provides a stable anonymous identifier for pre-login rollout bucketing.
 * Persisted in AsyncStorage to remain consistent across app restarts.
 *
 * This ensures users get consistent rollout behavior before they log in.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const ANON_ID_STORAGE_KEY = '@ai_safety_anon_id';

// In-memory cache to avoid async lookups after first load
let cachedAnonId: string | null = null;

/**
 * Generate a random UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get or create a persistent anonymous ID.
 *
 * This ID is:
 * - Generated once and stored in AsyncStorage
 * - Stable across app restarts
 * - Used for rollout bucketing when userId is null
 *
 * @returns The anonymous ID (async on first call, sync from cache after)
 */
export async function getOrCreateAnonId(): Promise<string> {
  // Return cached value if available
  if (cachedAnonId) {
    return cachedAnonId;
  }

  try {
    // Try to load from storage
    const storedId = await AsyncStorage.getItem(ANON_ID_STORAGE_KEY);

    if (storedId) {
      cachedAnonId = storedId;
      return storedId;
    }

    // Generate new ID and persist
    const newId = `anon_${generateUUID()}`;
    await AsyncStorage.setItem(ANON_ID_STORAGE_KEY, newId);
    cachedAnonId = newId;

    if (__DEV__) {
      console.log('[AI Safety] Generated new anonymous ID:', newId.slice(0, 12) + '...');
    }

    return newId;
  } catch (error) {
    // Fallback: generate ephemeral ID (won't persist, but at least works)
    console.warn('[AI Safety] Failed to persist anonymous ID:', error);
    const fallbackId = `ephemeral_${generateUUID()}`;
    cachedAnonId = fallbackId;
    return fallbackId;
  }
}

/**
 * Get the cached anonymous ID synchronously.
 *
 * Returns null if not yet loaded. Call getOrCreateAnonId() first
 * to ensure the ID is loaded and cached.
 */
export function getCachedAnonId(): string | null {
  return cachedAnonId;
}

/**
 * Initialize the anonymous ID cache.
 *
 * Call this early in app startup (e.g., in root layout)
 * so the ID is ready for synchronous access later.
 */
export async function initAnonId(): Promise<void> {
  await getOrCreateAnonId();
}

/**
 * Clear the anonymous ID (for testing or logout scenarios).
 *
 * Note: This creates a new ID on next access, which will
 * change the user's rollout bucket. Use with caution.
 */
export async function clearAnonId(): Promise<void> {
  cachedAnonId = null;
  try {
    await AsyncStorage.removeItem(ANON_ID_STORAGE_KEY);
  } catch (error) {
    console.warn('[AI Safety] Failed to clear anonymous ID:', error);
  }
}

// TypeScript declaration for __DEV__
declare const __DEV__: boolean;
