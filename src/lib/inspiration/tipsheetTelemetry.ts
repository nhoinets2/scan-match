// src/lib/inspiration/tipsheetTelemetry.ts
/**
 * TipSheet Telemetry Hook
 *
 * Captures "intent signals" for future shopping integration:
 * - bulletKey tapped (which advice bullet opened)
 * - wasRelaxed (did we have to relax filters)
 * - libraryItemIds shown (what items were presented)
 * - item tapped/saved (which item the user engaged with)
 *
 * Attribution features:
 * - sessionId: stable per app launch (for cross-session analysis)
 * - tipsheetInstanceId: unique per TipSheet open (ties events together)
 * - filtersFingerprint: stable query key for caching/search
 *
 * Currently logs to console in dev builds.
 * Ready to wire to analytics/backend when shopping integration lands.
 */
import type { Category } from "../types";
import type { AllFilterKeys, TargetFilters, TipSheetVibe } from "./tipsheets";

// ─────────────────────────────────────────────
// Session & Instance IDs
// ─────────────────────────────────────────────

/**
 * Generate a short unique ID (8 chars, good enough for session correlation)
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Session ID - regenerated on app launch (module load).
 * Stable across all TipSheet interactions within a session.
 */
const SESSION_ID = generateId();

/**
 * Get the current session ID (for external use if needed).
 */
export function getSessionId(): string {
  return SESSION_ID;
}

/**
 * Generate a new tipsheet instance ID.
 * Call this when a TipSheet is opened (bullet tap).
 */
export function generateTipsheetInstanceId(): string {
  return generateId();
}

// ─────────────────────────────────────────────
// Filters Fingerprint
// ─────────────────────────────────────────────

/**
 * Generate a stable fingerprint for a filter query.
 * Useful as a caching/search key for shopping integration.
 *
 * Format: category|vibe|key1=val1|key2=val2|...
 * Keys are sorted alphabetically for stability.
 */
export function generateFiltersFingerprint(args: {
  category: Category;
  vibe: TipSheetVibe;
  filters: TargetFilters;
}): string {
  const { category, vibe, filters } = args;

  const filterParts = Object.entries(filters)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.sort().join(",") : v}`);

  return [category, vibe, ...filterParts].join("|");
}

// ─────────────────────────────────────────────
// Schema Version
// ─────────────────────────────────────────────

/**
 * Bump this when changing event payload fields/meanings.
 * Helps with backwards compatibility in analytics pipelines.
 */
const SCHEMA_VERSION = 1;

// ─────────────────────────────────────────────
// Event Types
// ─────────────────────────────────────────────

export type TipSheetEventType =
  | "tipsheet_opened"
  | "tipsheet_load_failed"
  | "tipsheet_retry_clicked"
  | "suggestion_viewed"
  | "item_tapped"
  | "item_saved";

export type LibraryErrorType = "fetch_failed" | "empty" | null;

interface BaseTelemetryEvent {
  schemaVersion: number;
  timestamp: number;
  sessionId: string;
  tipsheetInstanceId: string;
}

export interface TipSheetOpenedEvent extends BaseTelemetryEvent {
  type: "tipsheet_opened";
  bulletKey: string;
  targetCategory: Category | null;
  vibe: TipSheetVibe;
}

export interface TipSheetLoadFailedEvent extends BaseTelemetryEvent {
  type: "tipsheet_load_failed";
  bulletKey: string;
  targetCategory: Category | null;
  vibe: TipSheetVibe;
  errorType: NonNullable<LibraryErrorType>; // "fetch_failed" | "empty"
}

export interface TipSheetRetryClickedEvent extends BaseTelemetryEvent {
  type: "tipsheet_retry_clicked";
  bulletKey: string;
  targetCategory: Category | null;
  vibe: TipSheetVibe;
  errorType: NonNullable<LibraryErrorType>;
  attemptNumber: number; // 1 = first retry, 2 = second retry, etc.
}

export interface SuggestionViewedEvent extends BaseTelemetryEvent {
  type: "suggestion_viewed";
  bulletKey: string;
  targetCategory: Category;
  vibe: TipSheetVibe;
  wasRelaxed: boolean;
  relaxedKeys: AllFilterKeys[];
  didFallbackToAnyInCategory: boolean;
  filtersFingerprint: string;
  libraryItemIds: string[];
  totalShown: number;
}

export interface ItemTappedEvent extends BaseTelemetryEvent {
  type: "item_tapped";
  bulletKey: string;
  targetCategory: Category;
  libraryItemId: string;
  position: number; // 0-indexed position in the grid
  wasRelaxed: boolean;
  didFallbackToAnyInCategory: boolean;
}

export interface ItemSavedEvent extends BaseTelemetryEvent {
  type: "item_saved";
  bulletKey: string;
  targetCategory: Category;
  libraryItemId: string;
  wasRelaxed: boolean;
  didFallbackToAnyInCategory: boolean;
}

export type TipSheetTelemetryEvent =
  | TipSheetOpenedEvent
  | TipSheetLoadFailedEvent
  | TipSheetRetryClickedEvent
  | SuggestionViewedEvent
  | ItemTappedEvent
  | ItemSavedEvent;

// ─────────────────────────────────────────────
// Telemetry Interface
// ─────────────────────────────────────────────

/**
 * Interface for telemetry backends.
 * Swap implementation when integrating with analytics service.
 */
export interface TelemetryBackend {
  track(event: TipSheetTelemetryEvent): void;
}

// ─────────────────────────────────────────────
// Default Backend: Dev Console Logger
// ─────────────────────────────────────────────

const devConsoleBackend: TelemetryBackend = {
  track(event) {
    if (!__DEV__) return;

    const prefix = `[TipSheet:Telemetry] [${event.tipsheetInstanceId}]`;

    switch (event.type) {
      case "tipsheet_opened":
        console.log(
          `${prefix} OPENED bulletKey="${event.bulletKey}" ` +
            `category=${event.targetCategory ?? "null"} vibe=${event.vibe}`
        );
        break;

      case "tipsheet_load_failed":
        console.log(
          `${prefix} LOAD_FAILED bulletKey="${event.bulletKey}" ` +
            `errorType=${event.errorType} category=${event.targetCategory ?? "null"}`
        );
        break;

      case "tipsheet_retry_clicked":
        console.log(
          `${prefix} RETRY_CLICKED bulletKey="${event.bulletKey}" ` +
            `errorType=${event.errorType} attemptNumber=${event.attemptNumber}`
        );
        break;

      case "suggestion_viewed":
        console.log(
          `${prefix} VIEWED bulletKey="${event.bulletKey}" ` +
            `items=[${event.libraryItemIds.slice(0, 3).join(",")}${event.totalShown > 3 ? "..." : ""}] ` +
            `(${event.totalShown} total) ` +
            `relaxed=${event.wasRelaxed ? event.relaxedKeys.join(",") || "all" : "no"}` +
            (event.didFallbackToAnyInCategory ? " FALLBACK" : "")
        );
        break;

      case "item_tapped":
        console.log(
          `${prefix} TAPPED item="${event.libraryItemId}" ` +
            `pos=${event.position} bulletKey="${event.bulletKey}" ` +
            `relaxed=${event.wasRelaxed}`
        );
        break;

      case "item_saved":
        console.log(
          `${prefix} SAVED item="${event.libraryItemId}" ` +
            `bulletKey="${event.bulletKey}" relaxed=${event.wasRelaxed}`
        );
        break;
    }
  },
};

// ─────────────────────────────────────────────
// Singleton Tracker
// ─────────────────────────────────────────────

let currentBackend: TelemetryBackend = devConsoleBackend;

/**
 * Set a custom telemetry backend (for production analytics).
 * Call this early in app initialization if needed.
 */
export function setTelemetryBackend(backend: TelemetryBackend): void {
  currentBackend = backend;
}

/** Fields automatically added by trackTipSheetEvent */
type AutoFields = "schemaVersion" | "timestamp" | "sessionId";

/** Helper type to omit auto fields from each event in the union */
type EventPayload<T extends TipSheetTelemetryEvent> = Omit<T, AutoFields>;

/**
 * Track a TipSheet telemetry event.
 * Automatically adds schemaVersion, timestamp, and sessionId.
 */
function trackTipSheetEvent(
  event:
    | EventPayload<TipSheetOpenedEvent>
    | EventPayload<TipSheetLoadFailedEvent>
    | EventPayload<TipSheetRetryClickedEvent>
    | EventPayload<SuggestionViewedEvent>
    | EventPayload<ItemTappedEvent>
    | EventPayload<ItemSavedEvent>
): void {
  currentBackend.track({
    ...event,
    schemaVersion: SCHEMA_VERSION,
    timestamp: Date.now(),
    sessionId: SESSION_ID,
  } as TipSheetTelemetryEvent);
}

// ─────────────────────────────────────────────
// Debounce State (suggestion_viewed)
// ─────────────────────────────────────────────

/** Max instances to track before pruning oldest entries */
const MAX_VIEWED_INSTANCES = 500;

/**
 * Track which tipsheetInstanceIds have already fired suggestion_viewed.
 * Prevents spam on re-renders.
 * Bounded to MAX_VIEWED_INSTANCES to prevent memory leaks in long sessions.
 */
const viewedInstances = new Map<string, number>(); // id -> timestamp

/**
 * Add an instance to the viewed set, pruning old entries if needed.
 */
function addViewedInstance(instanceId: string): void {
  // Prune oldest entries if at capacity
  if (viewedInstances.size >= MAX_VIEWED_INSTANCES) {
    // Find oldest entry
    let oldestId: string | null = null;
    let oldestTs = Infinity;
    for (const [id, ts] of viewedInstances) {
      if (ts < oldestTs) {
        oldestTs = ts;
        oldestId = id;
      }
    }
    if (oldestId) {
      viewedInstances.delete(oldestId);
    }
  }
  viewedInstances.set(instanceId, Date.now());
}

/**
 * Clear viewed instances (for testing or session reset).
 */
export function resetViewedInstances(): void {
  viewedInstances.clear();
}

// ─────────────────────────────────────────────
// Convenience Helpers
// ─────────────────────────────────────────────

/**
 * Track when a TipSheet is opened from a bullet tap.
 * Returns the generated tipsheetInstanceId for use in subsequent events.
 */
export function trackTipSheetOpened(args: {
  bulletKey: string;
  targetCategory: Category | null;
  vibe: TipSheetVibe;
}): string {
  const tipsheetInstanceId = generateTipsheetInstanceId();
  trackTipSheetEvent({
    type: "tipsheet_opened",
    tipsheetInstanceId,
    ...args,
  });
  return tipsheetInstanceId;
}

/**
 * Track when suggestions are viewed (after content resolves).
 * Debounced: only fires once per tipsheetInstanceId.
 *
 * @returns true if event was tracked, false if debounced
 */
export function trackSuggestionsViewed(args: {
  tipsheetInstanceId: string;
  bulletKey: string;
  targetCategory: Category;
  vibe: TipSheetVibe;
  filters: TargetFilters;
  wasRelaxed: boolean;
  relaxedKeys: AllFilterKeys[];
  didFallbackToAnyInCategory: boolean;
  libraryItemIds: string[];
}): boolean {
  // Debounce: only fire once per instance
  if (viewedInstances.has(args.tipsheetInstanceId)) {
    return false;
  }
  addViewedInstance(args.tipsheetInstanceId);

  const filtersFingerprint = generateFiltersFingerprint({
    category: args.targetCategory,
    vibe: args.vibe,
    filters: args.filters,
  });

  trackTipSheetEvent({
    type: "suggestion_viewed",
    tipsheetInstanceId: args.tipsheetInstanceId,
    bulletKey: args.bulletKey,
    targetCategory: args.targetCategory,
    vibe: args.vibe,
    wasRelaxed: args.wasRelaxed,
    relaxedKeys: args.relaxedKeys,
    didFallbackToAnyInCategory: args.didFallbackToAnyInCategory,
    filtersFingerprint,
    libraryItemIds: args.libraryItemIds,
    totalShown: args.libraryItemIds.length,
  });
  return true;
}

/**
 * Track when user taps an item in the suggestions grid.
 */
export function trackItemTapped(args: {
  tipsheetInstanceId: string;
  bulletKey: string;
  targetCategory: Category;
  libraryItemId: string;
  position: number;
  wasRelaxed: boolean;
  didFallbackToAnyInCategory: boolean;
}): void {
  trackTipSheetEvent({
    type: "item_tapped",
    ...args,
  });
}

/**
 * Track when user saves/wishlists an item.
 */
export function trackItemSaved(args: {
  tipsheetInstanceId: string;
  bulletKey: string;
  targetCategory: Category;
  libraryItemId: string;
  wasRelaxed: boolean;
  didFallbackToAnyInCategory: boolean;
}): void {
  trackTipSheetEvent({
    type: "item_saved",
    ...args,
  });
}

// ─────────────────────────────────────────────
// Retry Tracking State
// ─────────────────────────────────────────────

/**
 * Track retry attempts per tipsheetInstanceId.
 * Bounded like viewedInstances to prevent memory leaks.
 */
const retryAttempts = new Map<string, number>(); // instanceId -> attempt count
const MAX_RETRY_INSTANCES = 200;

/**
 * Get and increment retry attempt number for an instance.
 * Returns the attempt number (1 = first retry).
 */
function incrementRetryAttempt(instanceId: string): number {
  // Prune if at capacity
  if (retryAttempts.size >= MAX_RETRY_INSTANCES && !retryAttempts.has(instanceId)) {
    const firstKey = retryAttempts.keys().next().value;
    if (firstKey) retryAttempts.delete(firstKey);
  }

  const current = retryAttempts.get(instanceId) ?? 0;
  const next = current + 1;
  retryAttempts.set(instanceId, next);
  return next;
}

/**
 * Clear retry attempts (for testing or session reset).
 */
export function resetRetryAttempts(): void {
  retryAttempts.clear();
}

// ─────────────────────────────────────────────
// Load Failed & Retry Helpers
// ─────────────────────────────────────────────

/**
 * Track when TipSheet fails to load suggestions.
 * Call this when errorType transitions to non-null.
 */
export function trackTipSheetLoadFailed(args: {
  tipsheetInstanceId: string;
  bulletKey: string;
  targetCategory: Category | null;
  vibe: TipSheetVibe;
  errorType: NonNullable<LibraryErrorType>;
}): void {
  trackTipSheetEvent({
    type: "tipsheet_load_failed",
    ...args,
  });
}

/**
 * Track when user taps the Retry button.
 * Automatically increments attemptNumber per instance.
 */
export function trackTipSheetRetryClicked(args: {
  tipsheetInstanceId: string;
  bulletKey: string;
  targetCategory: Category | null;
  vibe: TipSheetVibe;
  errorType: NonNullable<LibraryErrorType>;
}): void {
  const attemptNumber = incrementRetryAttempt(args.tipsheetInstanceId);
  trackTipSheetEvent({
    type: "tipsheet_retry_clicked",
    ...args,
    attemptNumber,
  });
}
