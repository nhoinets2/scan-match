/**
 * Store Review Hook (Stub Implementation)
 *
 * This module provides stub functions for store review functionality.
 * The actual expo-store-review native module is not available in Expo Go
 * or development builds - it only works in production App Store builds.
 *
 * All functions are safe to call and will gracefully do nothing in
 * development/Expo Go environments.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEYS = {
  LAST_REVIEW_REQUEST: "storeReview_lastRequest",
  REQUEST_COUNT: "storeReview_requestCount",
  ACTIONS_SINCE_LAST_REQUEST: "storeReview_actionsSinceRequest",
} as const;

/**
 * Check if the store review is available on this platform
 * Returns false in Expo Go / development builds
 */
export async function isStoreReviewAvailable(): Promise<boolean> {
  return false;
}

/**
 * Check if we have the App Store URL available (for manual "Rate Us" button)
 * Returns false in Expo Go / development builds
 */
export async function hasStoreUrl(): Promise<boolean> {
  return false;
}

/**
 * Open the App Store page for the app (for manual "Rate Us" in settings)
 * No-op in Expo Go / development builds
 */
export async function openStorePage(): Promise<void> {
  // No-op in development
}

/**
 * Record a positive user action (scan complete, item added, etc.)
 * Call this after successful user actions to build up to a review request.
 *
 * This function is completely safe and will never throw.
 */
export async function recordPositiveAction(): Promise<void> {
  try {
    const currentCount = await AsyncStorage.getItem(STORAGE_KEYS.ACTIONS_SINCE_LAST_REQUEST);
    const count = currentCount ? parseInt(currentCount, 10) : 0;
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIONS_SINCE_LAST_REQUEST, String(count + 1));
  } catch {
    // Silently fail - not critical
  }
}

/**
 * Request a store review if conditions are met.
 * Returns false in Expo Go / development builds (store review not available)
 *
 * This function is completely safe and will never throw.
 *
 * @returns true if review was requested, false otherwise
 */
export async function requestReviewIfAppropriate(): Promise<boolean> {
  // Store review is not available in Expo Go / development builds
  // This will work in production App Store builds
  return false;
}

/**
 * Force request a review (for testing or "Rate Us" button)
 * Returns false in Expo Go / development builds
 *
 * This function is completely safe and will never throw.
 */
export async function forceRequestReview(): Promise<boolean> {
  // Store review is not available in Expo Go / development builds
  return false;
}

/**
 * Reset all review tracking data (for testing)
 */
export async function resetReviewTracking(): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.LAST_REVIEW_REQUEST),
      AsyncStorage.removeItem(STORAGE_KEYS.REQUEST_COUNT),
      AsyncStorage.removeItem(STORAGE_KEYS.ACTIONS_SINCE_LAST_REQUEST),
    ]);
  } catch {
    // Silently fail
  }
}
