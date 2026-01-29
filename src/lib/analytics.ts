// Analytics utility for tracking user events
// Events are logged to console in development and sent to Supabase in production
// Uses batching (10 events or 15s) and sampling for high-volume events

import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, AppStateStatus } from "react-native";
import { supabase } from "./supabase";

// Storage keys for persistent tracking
const STORAGE_KEYS = {
  FIRST_MATCH_SEEN: "analytics_first_match_seen",
  SCAN_COUNT: "analytics_scan_count",
  SIGNUP_DATE: "analytics_signup_date",
} as const;

// ============================================
// CONFIGURATION
// ============================================

/**
 * Force analytics DB insertion in dev (for testing).
 * Set EXPO_PUBLIC_FORCE_ANALYTICS_DB=true in .env to enable.
 */
const FORCE_ANALYTICS_DB = process.env.EXPO_PUBLIC_FORCE_ANALYTICS_DB === 'true';

const ANALYTICS_CONFIG = {
  /** Maximum events to queue before auto-flush */
  BATCH_SIZE: 10,
  /** Flush interval in milliseconds (15 seconds) */
  FLUSH_INTERVAL_MS: 15000,
  /** 
   * Enable production sink (Supabase)
   * - Enabled in production (!__DEV__)
   * - Can be forced in dev via EXPO_PUBLIC_FORCE_ANALYTICS_DB=true
   */
  ENABLE_PRODUCTION_SINK: !__DEV__ || FORCE_ANALYTICS_DB,
  /** Sampling rates for high-volume events (0-1, where 1 = 100%) */
  SAMPLING_RATES: {
    // Always send (100%)
    trust_filter_started: 1,
    trust_filter_completed: 1,
    trust_filter_error: 1,
    trust_filter_remote_config_invalid: 1,
    style_signals_completed: 1,
    style_signals_failed: 1,
    style_signals_started: 1,
    finalized_matches_invariant_violation: 1, // Always send - should be rare/never
    personalized_suggestions_started: 1,
    personalized_suggestions_completed: 1,
    personalized_suggestions_failed: 1,
    personalized_suggestions_cache_hit: 1,
    // Sample at 5% (high volume)
    trust_filter_pair_decision: 0.05,
    // Default for unlisted events
    default: 1,
  } as Record<string, number>,
};

// ============================================
// SESSION MANAGEMENT
// ============================================

let sessionId: string | null = null;
let currentUserId: string | null = null;

/**
 * Generate a unique session ID (called once per app launch)
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

/**
 * Get or create the current session ID
 */
function getSessionId(): string {
  if (!sessionId) {
    sessionId = generateSessionId();
  }
  return sessionId;
}

/**
 * Set the current user ID (call after auth)
 * Triggers a flush to send any queued events that were waiting for login.
 */
export function setAnalyticsUserId(userId: string | null): void {
  const previousUserId = currentUserId;
  currentUserId = userId;

  // If user just logged in, update queued events and flush
  if (userId && !previousUserId && eventQueue.length > 0) {
    // Backfill user_id on queued events from this session
    for (const event of eventQueue) {
      if (!event.user_id) {
        event.user_id = userId;
      }
    }
    // Trigger flush now that we have a user
    flushEvents();
  }
}

/**
 * Reset session (call on logout or app restart)
 */
export function resetAnalyticsSession(): void {
  sessionId = null;
  currentUserId = null;
}

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
  | StorePrefDismissed
  // Trust Filter events
  | TrustFilterStarted
  | TrustFilterCompleted
  | TrustFilterPairDecision
  | TrustFilterError
  | TrustFilterRemoteConfigInvalid
  // Style Signals events
  | StyleSignalsStarted
  | StyleSignalsCompleted
  | StyleSignalsFailed
  // FinalizedMatches invariant events
  | FinalizedMatchesInvariantViolation
  // Personalized Suggestions events
  | PersonalizedSuggestionsStarted
  | PersonalizedSuggestionsCompleted
  | PersonalizedSuggestionsFailed
  | PersonalizedSuggestionsCacheHit;

// ============================================
// TRUST FILTER EVENT TYPES
// ============================================

interface TrustFilterStarted {
  name: "trust_filter_started";
  properties: {
    scan_id: string;
    scan_category: string;
    high_match_count: number;
    has_scan_signals: boolean;
  };
}

interface TrustFilterCompleted {
  name: "trust_filter_completed";
  properties: {
    scan_id: string;
    scan_category: string;
    original_high_count: number;
    final_high_count: number;
    demoted_count: number;
    hidden_count: number;
    skipped_count: number;
    duration_ms: number;
  };
}

interface TrustFilterPairDecision {
  name: "trust_filter_pair_decision";
  properties: {
    scan_id: string;
    match_id: string;
    action: "keep" | "demote" | "hide";
    reason: string;
    archetype_distance?: string;
    formality_gap?: number;
    season_diff?: number;
    prompt_version?: number;
  };
}

interface TrustFilterError {
  name: "trust_filter_error";
  properties: {
    scan_id: string;
    error_type: string;
    error_message: string;
  };
}

interface TrustFilterRemoteConfigInvalid {
  name: "trust_filter_remote_config_invalid";
  properties: {
    errors: string[];
  };
}

// ============================================
// STYLE SIGNALS EVENT TYPES
// ============================================

interface StyleSignalsStarted {
  name: "style_signals_started";
  properties: {
    type: "scan" | "wardrobe";
    item_id: string;
  };
}

interface StyleSignalsCompleted {
  name: "style_signals_completed";
  properties: {
    type: "scan" | "wardrobe";
    item_id: string;
    cached: boolean;
    duration_ms: number;
    primary_archetype: string;
    formality_band: string;
    prompt_version: number;
  };
}

interface StyleSignalsFailed {
  name: "style_signals_failed";
  properties: {
    type: "scan" | "wardrobe";
    item_id: string;
    error_type: string;
    error_message: string;
  };
}

// ============================================
// PERSONALIZED SUGGESTIONS EVENT TYPES
// ============================================

interface PersonalizedSuggestionsStarted {
  name: "personalized_suggestions_started";
  properties: {
    scan_id: string;
    intent: "shopping" | "own_item";
    top_match_count: number;
    near_match_count: number;
    prompt_version: number;
    schema_version: number;
    mode: "paired" | "solo" | "near";
    scan_category: string | null;
    prefer_add_on_categories: boolean;
  };
}

interface PersonalizedSuggestionsCompleted {
  name: "personalized_suggestions_completed";
  properties: {
    scan_id: string;
    latency_ms: number;
    source: "ai_call" | "cache_hit";
    prompt_version: number;
    schema_version: number;
    was_repaired: boolean;
    mode: "paired" | "solo" | "near";
    mentions_stripped_count: number;
    removed_by_scan_category_count: number;
    applied_add_on_preference: boolean;
  };
}

interface PersonalizedSuggestionsFailed {
  name: "personalized_suggestions_failed";
  properties: {
    scan_id: string;
    error_kind: "timeout" | "network" | "unauthorized";
    prompt_version: number;
    schema_version: number;
  };
}

interface PersonalizedSuggestionsCacheHit {
  name: "personalized_suggestions_cache_hit";
  properties: {
    scan_id: string;
    cache_age_seconds: number;
  };
}

// ============================================
// FINALIZED MATCHES EVENT TYPES
// ============================================

/**
 * Invariant violation in FinalizedMatches pipeline.
 * This is a production-safe telemetry event that fires when
 * internal invariants are violated (should be rare/never).
 * 
 * Severity levels:
 *   - warning: Unexpected state, but recoverable (e.g., unexpected ID type)
 *   - critical: Data corruption or logic error (e.g., bucket overlap)
 */
interface FinalizedMatchesInvariantViolation {
  name: "finalized_matches_invariant_violation";
  properties: {
    /** Type of invariant violated */
    type: 
      | "hidden_id_not_string"
      | "ghost_demote"
      | "ghost_hide"
      | "high_near_overlap"
      | "hidden_overlap";
    /** Scan ID for debugging */
    scan_id: string;
    /** Number of IDs involved in the violation */
    item_ids_count: number;
    /** Severity level */
    severity: "warning" | "critical";
    /** Additional context */
    context?: string;
    /** Feature flag states for correlation */
    tf_enabled: boolean;
    ai_enabled: boolean;
    ai_dry_run: boolean;
  };
}

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
// EVENT QUEUE & BATCHING
// ============================================

interface QueuedEvent {
  name: string;
  properties: Record<string, unknown>;
  timestamp: string;
  session_id: string;
  user_id: string | null;
}

let eventQueue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let isInitialized = false;

/**
 * Check if event should be sampled (sent to production)
 */
function shouldSampleEvent(eventName: string): boolean {
  const rate = ANALYTICS_CONFIG.SAMPLING_RATES[eventName] 
    ?? ANALYTICS_CONFIG.SAMPLING_RATES.default;
  return Math.random() < rate;
}

/**
 * Enqueue an event for batched sending
 */
function enqueueEvent(event: QueuedEvent): void {
  eventQueue.push(event);

  // Auto-flush when batch size reached
  if (eventQueue.length >= ANALYTICS_CONFIG.BATCH_SIZE) {
    flushEvents();
  }
}

/**
 * Flush queued events to Supabase
 * Safe: never throws, never blocks UX
 * 
 * IMPORTANT: Only flushes events that have a user_id.
 * Events without user_id (before login) stay queued until login,
 * or are dropped if the queue overflows.
 * This ensures RLS policy (auth.uid() = user_id) is satisfied.
 */
async function flushEvents(): Promise<void> {
  if (eventQueue.length === 0) return;
  if (!ANALYTICS_CONFIG.ENABLE_PRODUCTION_SINK) return;

  // Split events: those with user_id can be sent, others stay queued
  const eventsWithUser: QueuedEvent[] = [];
  const eventsWithoutUser: QueuedEvent[] = [];

  for (const event of eventQueue) {
    if (event.user_id) {
      eventsWithUser.push(event);
    } else {
      eventsWithoutUser.push(event);
    }
  }

  // Nothing to send (all events are pre-login)
  if (eventsWithUser.length === 0) {
    if (__DEV__ && eventsWithoutUser.length > 0) {
      console.log(`[Analytics] Skipping flush: ${eventsWithoutUser.length} events waiting for login`);
    }
    return;
  }

  // Keep events without user in queue (up to a limit to prevent memory leak)
  const MAX_QUEUED_WITHOUT_USER = 50;
  eventQueue = eventsWithoutUser.slice(-MAX_QUEUED_WITHOUT_USER);

  try {
    // Batch insert to Supabase
    const rows = eventsWithUser.map(event => ({
      user_id: event.user_id,
      session_id: event.session_id,
      name: event.name,
      properties: event.properties,
      created_at: event.timestamp,
    }));

    const { error } = await supabase
      .from('analytics_events')
      .insert(rows);

    if (error) {
      // Log but don't throw - analytics should never break UX
      console.warn('[Analytics] Flush failed:', error.message);
      // Don't re-queue to avoid infinite loop on persistent errors
    } else if (__DEV__) {
      console.log(`[Analytics] Flushed ${rows.length} events to Supabase`);
    }
  } catch (error) {
    // Silently fail - analytics should never break UX
    console.warn('[Analytics] Flush error:', error);
  }
}

/**
 * Initialize analytics (call once at app start)
 */
export function initializeAnalytics(): void {
  if (isInitialized) return;
  isInitialized = true;

  // Generate session ID
  getSessionId();

  // Start flush timer
  if (ANALYTICS_CONFIG.ENABLE_PRODUCTION_SINK) {
    flushTimer = setInterval(flushEvents, ANALYTICS_CONFIG.FLUSH_INTERVAL_MS);
  }

  // Flush on app background/close
  const handleAppStateChange = (nextState: AppStateStatus) => {
    if (nextState === 'background' || nextState === 'inactive') {
      flushEvents();
    }
  };

  AppState.addEventListener('change', handleAppStateChange);

  if (__DEV__) {
    console.log('[Analytics] Initialized', {
      sessionId: getSessionId(),
      productionSink: ANALYTICS_CONFIG.ENABLE_PRODUCTION_SINK,
    });
  }
}

/**
 * Cleanup analytics (call on app unmount if needed)
 */
export function cleanupAnalytics(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flushEvents(); // Final flush
  isInitialized = false;
}

// ============================================
// TRACKING FUNCTIONS
// ============================================

/**
 * Main tracking function
 * - Logs to console in development
 * - Sends to Supabase in production (batched + sampled)
 */
export function trackEvent<T extends AnalyticsEvent>(
  name: T["name"],
  properties: T["properties"]
): void {
  const timestamp = new Date().toISOString();

  // Always log in development
  if (__DEV__) {
    console.log(`[Analytics] ${name}`, properties);
  }

  // Production sink: enqueue for batched sending
  if (ANALYTICS_CONFIG.ENABLE_PRODUCTION_SINK && shouldSampleEvent(name)) {
    enqueueEvent({
      name,
      properties: properties as Record<string, unknown>,
      timestamp,
      session_id: getSessionId(),
      user_id: currentUserId,
    });
  }
}

/**
 * Force flush events (call before critical operations)
 */
export function forceFlushAnalytics(): void {
  flushEvents();
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

// ============================================
// TRUST FILTER ANALYTICS
// ============================================

/**
 * Track when Trust Filter evaluation starts
 */
export function trackTrustFilterStarted(params: {
  scanId: string;
  scanCategory: string;
  highMatchCount: number;
  hasScanSignals: boolean;
}): void {
  trackEvent("trust_filter_started", {
    scan_id: params.scanId,
    scan_category: params.scanCategory,
    high_match_count: params.highMatchCount,
    has_scan_signals: params.hasScanSignals,
  });
}

/**
 * Track when Trust Filter evaluation completes
 */
export function trackTrustFilterCompleted(params: {
  scanId: string;
  scanCategory: string;
  originalHighCount: number;
  finalHighCount: number;
  demotedCount: number;
  hiddenCount: number;
  skippedCount: number;
  durationMs: number;
}): void {
  trackEvent("trust_filter_completed", {
    scan_id: params.scanId,
    scan_category: params.scanCategory,
    original_high_count: params.originalHighCount,
    final_high_count: params.finalHighCount,
    demoted_count: params.demotedCount,
    hidden_count: params.hiddenCount,
    skipped_count: params.skippedCount,
    duration_ms: params.durationMs,
  });
}

/**
 * Track individual Trust Filter pair decision (sampled at 5%)
 */
export function trackTrustFilterPairDecision(params: {
  scanId: string;
  matchId: string;
  action: "keep" | "demote" | "hide";
  reason: string;
  archetypeDistance?: string;
  formalityGap?: number;
  seasonDiff?: number;
  promptVersion?: number;
}): void {
  trackEvent("trust_filter_pair_decision", {
    scan_id: params.scanId,
    match_id: params.matchId,
    action: params.action,
    reason: params.reason,
    archetype_distance: params.archetypeDistance,
    formality_gap: params.formalityGap,
    season_diff: params.seasonDiff,
    prompt_version: params.promptVersion,
  });
}

/**
 * Track Trust Filter error
 */
export function trackTrustFilterError(params: {
  scanId: string;
  errorType: string;
  errorMessage: string;
}): void {
  trackEvent("trust_filter_error", {
    scan_id: params.scanId,
    error_type: params.errorType,
    error_message: params.errorMessage,
  });
}

/**
 * Track when remote config validation fails
 */
export function trackTrustFilterRemoteConfigInvalid(params: {
  errors: string[];
}): void {
  trackEvent("trust_filter_remote_config_invalid", {
    errors: params.errors,
  });
}

// ============================================
// STYLE SIGNALS ANALYTICS
// ============================================

/**
 * Track when style signals generation starts
 */
export function trackStyleSignalsStarted(params: {
  type: "scan" | "wardrobe";
  itemId: string;
}): void {
  trackEvent("style_signals_started", {
    type: params.type,
    item_id: params.itemId,
  });
}

/**
 * Track when style signals generation completes
 */
export function trackStyleSignalsCompleted(params: {
  type: "scan" | "wardrobe";
  itemId: string;
  cached: boolean;
  durationMs: number;
  primaryArchetype: string;
  formalityBand: string;
  promptVersion: number;
}): void {
  trackEvent("style_signals_completed", {
    type: params.type,
    item_id: params.itemId,
    cached: params.cached,
    duration_ms: params.durationMs,
    primary_archetype: params.primaryArchetype,
    formality_band: params.formalityBand,
    prompt_version: params.promptVersion,
  });
}

/**
 * Track when style signals generation fails
 */
export function trackStyleSignalsFailed(params: {
  type: "scan" | "wardrobe";
  itemId: string;
  errorType: string;
  errorMessage: string;
}): void {
  trackEvent("style_signals_failed", {
    type: params.type,
    item_id: params.itemId,
    error_type: params.errorType,
    error_message: params.errorMessage,
  });
}

// ============================================
// FINALIZED MATCHES ANALYTICS
// ============================================

/**
 * Track FinalizedMatches invariant violation.
 * 
 * This is a production-safe telemetry event for detecting
 * rare edge cases in the finalization pipeline. In dev mode,
 * it also logs to console.error for immediate visibility.
 * 
 * @param params.type - Type of invariant violated
 * @param params.scanId - Scan ID for debugging
 * @param params.itemIdsCount - Number of IDs involved
 * @param params.severity - 'warning' for recoverable, 'critical' for data corruption
 * @param params.context - Optional additional context
 * @param params.tfEnabled - Trust Filter enabled state
 * @param params.aiEnabled - AI Safety enabled state
 * @param params.aiDryRun - AI Safety dry run state
 */
export function trackFinalizedMatchesInvariantViolation(params: {
  type: 
    | "hidden_id_not_string"
    | "ghost_demote"
    | "ghost_hide"
    | "high_near_overlap"
    | "hidden_overlap";
  scanId: string;
  itemIdsCount: number;
  severity: "warning" | "critical";
  context?: string;
  tfEnabled: boolean;
  aiEnabled: boolean;
  aiDryRun: boolean;
}): void {
  // Always log to console in dev for immediate visibility
  if (__DEV__) {
    console.error(
      `[FinalizedMatches] INVARIANT VIOLATED: ${params.type}`,
      { 
        scanId: params.scanId, 
        count: params.itemIdsCount, 
        context: params.context,
        flags: { tf: params.tfEnabled, ai: params.aiEnabled, dryRun: params.aiDryRun },
      }
    );
  }

  // Send to production telemetry (always - not sampled)
  trackEvent("finalized_matches_invariant_violation", {
    type: params.type,
    scan_id: params.scanId,
    item_ids_count: params.itemIdsCount,
    severity: params.severity,
    context: params.context,
    tf_enabled: params.tfEnabled,
    ai_enabled: params.aiEnabled,
    ai_dry_run: params.aiDryRun,
  });
}

// ============================================
// __DEV__ DECLARATION
// ============================================

declare const __DEV__: boolean;
