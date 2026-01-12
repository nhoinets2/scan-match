// Analytics utility for tracking user events
// Events are logged to console in development and can be sent to analytics service in production

import AsyncStorage from "@react-native-async-storage/async-storage";

// Storage keys for persistent tracking
const STORAGE_KEYS = {
  FIRST_MATCH_SEEN: "analytics_first_match_seen",
  SCAN_COUNT: "analytics_scan_count",
  SIGNUP_DATE: "analytics_signup_date",
} as const;

// ============================================
// EVENT TYPES
// ============================================

export type AnalyticsEvent =
  | WardrobeMatchSectionFirstVisible
  | EmptyWardrobeMatchesSectionExpanded
  | AddItemFromMatchesSection
  | NoWardrobeMatchFound
  | InfoTooltipViewed
  | WardrobeMatchItemTapped
  | HelpfulAdditionTapped
  | ResultsTabSwitched
  | NearOutfitSelected
  | NearOutfitSelectionCleared
  | MissingPiecesCtaTapped
  | TailorCardTapped
  | StorePrefModalOpened
  | StorePrefStoreSelected
  | StorePrefStoreRemoved
  | StorePrefSaved
  | StorePrefDismissed;

interface WardrobeMatchSectionFirstVisible {
  name: "wardrobe_match_section_first_visible";
  properties: {
    wardrobe_item_count: number;
    matching_item_count: number;
    scanned_item_category: string;
    scan_number_since_signup: number;
    days_since_signup: number;
  };
}

interface EmptyWardrobeMatchesSectionExpanded {
  name: "empty_wardrobe_matches_section_expanded";
  properties: {
    wardrobe_item_count: number;
    scan_number_since_signup: number;
    scanned_item_category: string;
  };
}

interface AddItemFromMatchesSection {
  name: "add_item_from_matches_section";
  properties: {
    source: "matches_section_empty_state";
    scanned_item_category: string;
    scan_number_since_signup: number;
  };
}

interface NoWardrobeMatchFound {
  name: "no_wardrobe_match_found";
  properties: {
    wardrobe_item_count: number;
    scanned_item_category: string;
    wardrobe_categories: string[];
    style_families: string[];
  };
}

interface InfoTooltipViewed {
  name: "info_tooltip_viewed";
  properties: {
    wardrobe_item_count: number;
    scanned_item_category: string;
  };
}

interface WardrobeMatchItemTapped {
  name: "wardrobe_match_item_tapped";
  properties: {
    match_category: string;
    match_position: number;
    scanned_item_category: string;
    total_matches: number;
  };
}

interface HelpfulAdditionTapped {
  name: "helpful_addition_tapped";
  properties: {
    addition_category: string;
    addition_position: number;
    scanned_item_category: string;
    total_suggestions: number;
  };
}

interface ResultsTabSwitched {
  name: "results_tab_switched";
  properties: {
    from_tab: "high" | "near";
    to_tab: "high" | "near";
    scanned_item_category: string;
    high_outfit_count: number;
    near_outfit_count: number;
  };
}

interface NearOutfitSelected {
  name: "near_outfit_selected";
  properties: {
    outfit_id: string;
    outfit_position: number;
    scanned_item_category: string;
    total_near_outfits: number;
  };
}

interface NearOutfitSelectionCleared {
  name: "near_outfit_selection_cleared";
  properties: {
    scanned_item_category: string;
    source: "show_all_chip" | "tab_switch" | "stale_selection";
  };
}

interface MissingPiecesCtaTapped {
  name: "missing_pieces_cta_tapped";
  properties: {
    missing_categories: string[];
    tab: "high" | "near";
    scanned_item_category: string;
  };
}

// Store Preferences Analytics
interface TailorCardTapped {
  name: "tailor_card_tapped";
  properties: {
    tab: "high" | "near";
    has_saved_stores: boolean;
  };
}

interface StorePrefModalOpened {
  name: "store_pref_modal_opened";
  properties: {
    existing_store_count: number;
  };
}

interface StorePrefStoreSelected {
  name: "store_pref_store_selected";
  properties: {
    store_name: string;
    selection_count: number;
  };
}

interface StorePrefStoreRemoved {
  name: "store_pref_store_removed";
  properties: {
    store_name: string;
    selection_count: number;
  };
}

interface StorePrefSaved {
  name: "store_pref_saved";
  properties: {
    store_count: number;
    stores: string[];
  };
}

interface StorePrefDismissed {
  name: "store_pref_dismissed";
  properties: {
    method: "x" | "backdrop";
  };
}

// ============================================
// TRACKING FUNCTIONS
// ============================================

/**
 * Main tracking function - logs events in development
 * Can be extended to send to analytics services (Mixpanel, Amplitude, etc.)
 */
export function trackEvent<T extends AnalyticsEvent>(
  name: T["name"],
  properties: T["properties"]
): void {
  const event = {
    name,
    properties,
    timestamp: new Date().toISOString(),
  };

  // Log in development
  console.log(`[Analytics] ${name}`, properties);

  // TODO: Send to analytics service in production
  // Example: mixpanel.track(name, properties);
  // Example: amplitude.logEvent(name, properties);
}

// ============================================
// PERSISTENT STATE HELPERS
// ============================================

/**
 * Check if user has seen their first wardrobe match
 */
export async function hasSeenFirstMatch(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.FIRST_MATCH_SEEN);
    return value === "true";
  } catch {
    return false;
  }
}

/**
 * Mark that user has seen their first wardrobe match
 */
export async function markFirstMatchSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.FIRST_MATCH_SEEN, "true");
  } catch (error) {
    console.error("[Analytics] Failed to mark first match seen:", error);
  }
}

/**
 * Get and increment scan count
 */
export async function incrementAndGetScanCount(): Promise<number> {
  try {
    const current = await AsyncStorage.getItem(STORAGE_KEYS.SCAN_COUNT);
    const newCount = (parseInt(current ?? "0", 10) || 0) + 1;
    await AsyncStorage.setItem(STORAGE_KEYS.SCAN_COUNT, String(newCount));
    return newCount;
  } catch {
    return 1;
  }
}

/**
 * Get current scan count without incrementing
 */
export async function getScanCount(): Promise<number> {
  try {
    const current = await AsyncStorage.getItem(STORAGE_KEYS.SCAN_COUNT);
    return parseInt(current ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Set signup date (call once on first launch/signup)
 */
export async function setSignupDate(): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(STORAGE_KEYS.SIGNUP_DATE);
    if (!existing) {
      await AsyncStorage.setItem(STORAGE_KEYS.SIGNUP_DATE, new Date().toISOString());
    }
  } catch (error) {
    console.error("[Analytics] Failed to set signup date:", error);
  }
}

/**
 * Get days since signup
 */
export async function getDaysSinceSignup(): Promise<number> {
  try {
    const signupDate = await AsyncStorage.getItem(STORAGE_KEYS.SIGNUP_DATE);
    if (!signupDate) return 0;

    const signup = new Date(signupDate);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - signup.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch {
    return 0;
  }
}

// ============================================
// CONVENIENCE TRACKING FUNCTIONS
// ============================================

/**
 * Track when wardrobe match section becomes visible for the first time
 * This is the "aha moment" - user sees value from their wardrobe
 */
export async function trackFirstWardrobeMatchVisible(params: {
  wardrobeItemCount: number;
  matchingItemCount: number;
  scannedItemCategory: string;
}): Promise<void> {
  const alreadySeen = await hasSeenFirstMatch();
  if (alreadySeen) return;

  const [scanCount, daysSinceSignup] = await Promise.all([
    getScanCount(),
    getDaysSinceSignup(),
  ]);

  trackEvent("wardrobe_match_section_first_visible", {
    wardrobe_item_count: params.wardrobeItemCount,
    matching_item_count: params.matchingItemCount,
    scanned_item_category: params.scannedItemCategory,
    scan_number_since_signup: scanCount,
    days_since_signup: daysSinceSignup,
  });

  await markFirstMatchSeen();
}

/**
 * Track when user expands empty wardrobe matches section
 */
export async function trackEmptyMatchesSectionExpanded(params: {
  wardrobeItemCount: number;
  scannedItemCategory: string;
}): Promise<void> {
  const scanCount = await getScanCount();

  trackEvent("empty_wardrobe_matches_section_expanded", {
    wardrobe_item_count: params.wardrobeItemCount,
    scan_number_since_signup: scanCount,
    scanned_item_category: params.scannedItemCategory,
  });
}

/**
 * Track when user taps "Add item" from matches section empty state
 */
export async function trackAddItemFromMatchesSection(params: {
  scannedItemCategory: string;
}): Promise<void> {
  const scanCount = await getScanCount();

  trackEvent("add_item_from_matches_section", {
    source: "matches_section_empty_state",
    scanned_item_category: params.scannedItemCategory,
    scan_number_since_signup: scanCount,
  });
}

/**
 * Track when no wardrobe match is found (silent logging for ML)
 */
export function trackNoWardrobeMatchFound(params: {
  wardrobeItemCount: number;
  scannedItemCategory: string;
  wardrobeCategories: string[];
  styleFamilies: string[];
}): void {
  trackEvent("no_wardrobe_match_found", {
    wardrobe_item_count: params.wardrobeItemCount,
    scanned_item_category: params.scannedItemCategory,
    wardrobe_categories: params.wardrobeCategories,
    style_families: params.styleFamilies,
  });
}

/**
 * Track when user views the info tooltip explaining matches
 */
export function trackInfoTooltipViewed(params: {
  wardrobeItemCount: number;
  scannedItemCategory: string;
}): void {
  trackEvent("info_tooltip_viewed", {
    wardrobe_item_count: params.wardrobeItemCount,
    scanned_item_category: params.scannedItemCategory,
  });
}

/**
 * Track when user taps a wardrobe match item
 */
export function trackWardrobeMatchItemTapped(params: {
  matchCategory: string;
  matchPosition: number;
  scannedItemCategory: string;
  totalMatches: number;
}): void {
  trackEvent("wardrobe_match_item_tapped", {
    match_category: params.matchCategory,
    match_position: params.matchPosition,
    scanned_item_category: params.scannedItemCategory,
    total_matches: params.totalMatches,
  });
}

/**
 * Track when user taps a helpful addition suggestion
 */
export function trackHelpfulAdditionTapped(params: {
  additionCategory: string;
  additionPosition: number;
  scannedItemCategory: string;
  totalSuggestions: number;
}): void {
  trackEvent("helpful_addition_tapped", {
    addition_category: params.additionCategory,
    addition_position: params.additionPosition,
    scanned_item_category: params.scannedItemCategory,
    total_suggestions: params.totalSuggestions,
  });
}

/**
 * Track when user switches between Wear now / Worth trying tabs
 */
export function trackResultsTabSwitched(params: {
  fromTab: "high" | "near";
  toTab: "high" | "near";
  scannedItemCategory: string;
  highOutfitCount: number;
  nearOutfitCount: number;
}): void {
  trackEvent("results_tab_switched", {
    from_tab: params.fromTab,
    to_tab: params.toTab,
    scanned_item_category: params.scannedItemCategory,
    high_outfit_count: params.highOutfitCount,
    near_outfit_count: params.nearOutfitCount,
  });
}

/**
 * Track when user selects a near outfit (for precise Mode B tips)
 */
export function trackNearOutfitSelected(params: {
  outfitId: string;
  outfitPosition: number;
  scannedItemCategory: string;
  totalNearOutfits: number;
}): void {
  trackEvent("near_outfit_selected", {
    outfit_id: params.outfitId,
    outfit_position: params.outfitPosition,
    scanned_item_category: params.scannedItemCategory,
    total_near_outfits: params.totalNearOutfits,
  });
}

/**
 * Track when user clears near outfit selection
 */
export function trackNearOutfitSelectionCleared(params: {
  scannedItemCategory: string;
  source: "show_all_chip" | "tab_switch" | "stale_selection";
}): void {
  trackEvent("near_outfit_selection_cleared", {
    scanned_item_category: params.scannedItemCategory,
    source: params.source,
  });
}

/**
 * Track when user taps CTA on missing pieces card
 */
export function trackMissingPiecesCtaTapped(params: {
  missingCategories: string[];
  tab: "high" | "near";
  scannedItemCategory: string;
}): void {
  trackEvent("missing_pieces_cta_tapped", {
    missing_categories: params.missingCategories,
    tab: params.tab,
    scanned_item_category: params.scannedItemCategory,
  });
}

// ============================================
// STORE PREFERENCES ANALYTICS
// ============================================

/**
 * Track when user taps the tailor suggestions card
 */
export function trackTailorCardTapped(params: {
  tab: "high" | "near";
  hasSavedStores: boolean;
}): void {
  trackEvent("tailor_card_tapped", {
    tab: params.tab,
    has_saved_stores: params.hasSavedStores,
  });
}

/**
 * Track when store preferences modal is opened
 */
export function trackStorePrefModalOpened(params: {
  existingStoreCount: number;
}): void {
  trackEvent("store_pref_modal_opened", {
    existing_store_count: params.existingStoreCount,
  });
}

/**
 * Track when user selects a store in the modal
 */
export function trackStorePrefStoreSelected(params: {
  storeName: string;
  selectionCount: number;
}): void {
  trackEvent("store_pref_store_selected", {
    store_name: params.storeName,
    selection_count: params.selectionCount,
  });
}

/**
 * Track when user removes a store in the modal
 */
export function trackStorePrefStoreRemoved(params: {
  storeName: string;
  selectionCount: number;
}): void {
  trackEvent("store_pref_store_removed", {
    store_name: params.storeName,
    selection_count: params.selectionCount,
  });
}

/**
 * Track when user saves store preferences
 */
export function trackStorePrefSaved(params: {
  storeCount: number;
  stores: string[];
}): void {
  trackEvent("store_pref_saved", {
    store_count: params.storeCount,
    stores: params.stores,
  });
}

/**
 * Track when user dismisses store preferences modal without saving
 */
export function trackStorePrefDismissed(params: {
  method: "x" | "backdrop";
}): void {
  trackEvent("store_pref_dismissed", {
    method: params.method,
  });
}
