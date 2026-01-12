/**
 * Store Review Hook
 * 
 * Uses expo-store-review to prompt users for App Store ratings.
 * Apple controls when the dialog actually appears (max 3x per year per user).
 * 
 * Best practices:
 * - Call after positive moments (successful scan, added items, etc.)
 * - Don't call too frequently - Apple will ignore excessive requests
 * - The system may not show the prompt even when called
 */

import * as StoreReview from "expo-store-review";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEYS = {
  LAST_REVIEW_REQUEST: "storeReview_lastRequest",
  REQUEST_COUNT: "storeReview_requestCount",
  ACTIONS_SINCE_LAST_REQUEST: "storeReview_actionsSinceRequest",
} as const;

// Configuration
const CONFIG = {
  // Minimum days between review requests (Apple limits to 3/year, so be conservative)
  MIN_DAYS_BETWEEN_REQUESTS: 60,
  // Minimum positive actions before first request
  MIN_ACTIONS_FOR_FIRST_REQUEST: 5,
  // Minimum positive actions between subsequent requests
  MIN_ACTIONS_BETWEEN_REQUESTS: 10,
} as const;

/**
 * Check if the store review is available on this platform
 */
export async function isStoreReviewAvailable(): Promise<boolean> {
  try {
    return await StoreReview.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Check if we have the App Store URL available (for manual "Rate Us" button)
 */
export async function hasStoreUrl(): Promise<boolean> {
  try {
    return await StoreReview.hasAction();
  } catch {
    return false;
  }
}

/**
 * Open the App Store page for the app (for manual "Rate Us" in settings)
 */
export async function openStorePage(): Promise<void> {
  try {
    if (await StoreReview.hasAction()) {
      await StoreReview.requestReview();
    }
  } catch (error) {
    console.warn("[StoreReview] Failed to open store page:", error);
  }
}

/**
 * Record a positive user action (scan complete, item added, etc.)
 * Call this after successful user actions to build up to a review request.
 */
export async function recordPositiveAction(): Promise<void> {
  try {
    const currentCount = await AsyncStorage.getItem(STORAGE_KEYS.ACTIONS_SINCE_LAST_REQUEST);
    const count = currentCount ? parseInt(currentCount, 10) : 0;
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIONS_SINCE_LAST_REQUEST, String(count + 1));
  } catch (error) {
    console.warn("[StoreReview] Failed to record action:", error);
  }
}

/**
 * Request a store review if conditions are met.
 * 
 * Conditions:
 * 1. Store review is available on this platform
 * 2. Enough time has passed since last request
 * 3. User has performed enough positive actions
 * 
 * @returns true if review was requested, false otherwise
 */
export async function requestReviewIfAppropriate(): Promise<boolean> {
  try {
    // Check if available
    const available = await StoreReview.isAvailableAsync();
    if (!available) {
      if (__DEV__) console.log("[StoreReview] Not available on this platform");
      return false;
    }

    // Get stored data
    const [lastRequestStr, requestCountStr, actionsStr] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.LAST_REVIEW_REQUEST),
      AsyncStorage.getItem(STORAGE_KEYS.REQUEST_COUNT),
      AsyncStorage.getItem(STORAGE_KEYS.ACTIONS_SINCE_LAST_REQUEST),
    ]);

    const requestCount = requestCountStr ? parseInt(requestCountStr, 10) : 0;
    const actionsSinceLastRequest = actionsStr ? parseInt(actionsStr, 10) : 0;

    // Check if enough actions have been performed
    const requiredActions = requestCount === 0 
      ? CONFIG.MIN_ACTIONS_FOR_FIRST_REQUEST 
      : CONFIG.MIN_ACTIONS_BETWEEN_REQUESTS;

    if (actionsSinceLastRequest < requiredActions) {
      if (__DEV__) {
        console.log(`[StoreReview] Not enough actions: ${actionsSinceLastRequest}/${requiredActions}`);
      }
      return false;
    }

    // Check if enough time has passed
    if (lastRequestStr) {
      const lastRequest = new Date(lastRequestStr);
      const daysSinceLastRequest = (Date.now() - lastRequest.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceLastRequest < CONFIG.MIN_DAYS_BETWEEN_REQUESTS) {
        if (__DEV__) {
          console.log(`[StoreReview] Too soon: ${Math.round(daysSinceLastRequest)}/${CONFIG.MIN_DAYS_BETWEEN_REQUESTS} days`);
        }
        return false;
      }
    }

    // All conditions met - request review
    if (__DEV__) console.log("[StoreReview] Requesting review...");
    
    await StoreReview.requestReview();

    // Update stored data
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.LAST_REVIEW_REQUEST, new Date().toISOString()),
      AsyncStorage.setItem(STORAGE_KEYS.REQUEST_COUNT, String(requestCount + 1)),
      AsyncStorage.setItem(STORAGE_KEYS.ACTIONS_SINCE_LAST_REQUEST, "0"),
    ]);

    return true;
  } catch (error) {
    console.warn("[StoreReview] Failed to request review:", error);
    return false;
  }
}

/**
 * Force request a review (for testing or "Rate Us" button)
 * Bypasses all checks except platform availability.
 */
export async function forceRequestReview(): Promise<boolean> {
  try {
    const available = await StoreReview.isAvailableAsync();
    if (!available) {
      console.warn("[StoreReview] Not available on this platform");
      return false;
    }

    await StoreReview.requestReview();
    return true;
  } catch (error) {
    console.warn("[StoreReview] Failed to force request review:", error);
    return false;
  }
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
    if (__DEV__) console.log("[StoreReview] Tracking data reset");
  } catch (error) {
    console.warn("[StoreReview] Failed to reset tracking:", error);
  }
}

