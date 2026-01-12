// Breadcrumbs - Type-safe action tracking for debugging
// Tracks the last N user actions for inclusion in bug reports
// IMPORTANT: Never include PII (user content, item names, brands, etc.)

// ─────────────────────────────────────────────
// Types - Discriminated union for type safety
// ─────────────────────────────────────────────

type ResultsTab = "wear_now" | "worth_trying";
type PhotoSource = "camera" | "library";

export type Breadcrumb =
  // Navigation
  | { type: "SCREEN_VIEW"; ts: number; screen: string }
  // Scanning
  | { type: "SCAN_STARTED"; ts: number; source: PhotoSource }
  | { type: "SCAN_COMPLETED"; ts: number }
  | { type: "SCAN_FAILED"; ts: number; reason?: string }
  | { type: "PHOTO_UPLOADED"; ts: number }
  // Results
  | { type: "RESULTS_LOADED"; ts: number }
  | { type: "TAB_SWITCHED"; ts: number; tab: ResultsTab }
  | { type: "MATCH_TAPPED"; ts: number }
  | { type: "OUTFIT_TAPPED"; ts: number }
  | { type: "TIP_OPENED"; ts: number; bulletKey?: string }
  // Wardrobe
  | { type: "ITEM_ADDED"; ts: number; category?: string }
  | { type: "ITEM_EDITED"; ts: number }
  | { type: "ITEM_DELETED"; ts: number }
  // Saved
  | { type: "ITEM_SAVED"; ts: number }
  | { type: "ITEM_UNSAVED"; ts: number }
  // Account
  | { type: "PREFERENCES_UPDATED"; ts: number }
  | { type: "PASSWORD_CHANGED"; ts: number }
  | { type: "SIGNED_OUT"; ts: number };

// ─────────────────────────────────────────────
// Buffer
// ─────────────────────────────────────────────

const MAX_BREADCRUMBS = 50;
let buffer: Breadcrumb[] = [];

// ─────────────────────────────────────────────
// Action Creators (ensures type safety + timestamps)
// ─────────────────────────────────────────────

export const BreadcrumbActions = {
  // Navigation
  screenView: (screen: string): Breadcrumb => ({
    type: "SCREEN_VIEW",
    screen: sanitizeScreen(screen),
    ts: Date.now(),
  }),

  // Scanning
  scanStarted: (source: PhotoSource): Breadcrumb => ({
    type: "SCAN_STARTED",
    source,
    ts: Date.now(),
  }),
  scanCompleted: (): Breadcrumb => ({
    type: "SCAN_COMPLETED",
    ts: Date.now(),
  }),
  scanFailed: (reason?: string): Breadcrumb => ({
    type: "SCAN_FAILED",
    reason: reason ? sanitizeReason(reason) : undefined,
    ts: Date.now(),
  }),
  photoUploaded: (): Breadcrumb => ({
    type: "PHOTO_UPLOADED",
    ts: Date.now(),
  }),

  // Results
  resultsLoaded: (): Breadcrumb => ({
    type: "RESULTS_LOADED",
    ts: Date.now(),
  }),
  tabSwitched: (tab: ResultsTab): Breadcrumb => ({
    type: "TAB_SWITCHED",
    tab,
    ts: Date.now(),
  }),
  matchTapped: (): Breadcrumb => ({
    type: "MATCH_TAPPED",
    ts: Date.now(),
  }),
  outfitTapped: (): Breadcrumb => ({
    type: "OUTFIT_TAPPED",
    ts: Date.now(),
  }),
  tipOpened: (bulletKey?: string): Breadcrumb => ({
    type: "TIP_OPENED",
    // bulletKey is safe - it's an internal key like "TOPS__SHOES_NEUTRAL"
    bulletKey,
    ts: Date.now(),
  }),

  // Wardrobe
  itemAdded: (category?: string): Breadcrumb => ({
    type: "ITEM_ADDED",
    category, // Category is safe - it's from a fixed enum
    ts: Date.now(),
  }),
  itemEdited: (): Breadcrumb => ({
    type: "ITEM_EDITED",
    ts: Date.now(),
  }),
  itemDeleted: (): Breadcrumb => ({
    type: "ITEM_DELETED",
    ts: Date.now(),
  }),

  // Saved
  itemSaved: (): Breadcrumb => ({
    type: "ITEM_SAVED",
    ts: Date.now(),
  }),
  itemUnsaved: (): Breadcrumb => ({
    type: "ITEM_UNSAVED",
    ts: Date.now(),
  }),

  // Account
  preferencesUpdated: (): Breadcrumb => ({
    type: "PREFERENCES_UPDATED",
    ts: Date.now(),
  }),
  passwordChanged: (): Breadcrumb => ({
    type: "PASSWORD_CHANGED",
    ts: Date.now(),
  }),
  signedOut: (): Breadcrumb => ({
    type: "SIGNED_OUT",
    ts: Date.now(),
  }),
} as const;

// ─────────────────────────────────────────────
// Sanitizers (prevent PII leakage)
// ─────────────────────────────────────────────

function sanitizeScreen(screen: string): string {
  // Only allow known screen paths
  const allowedScreens = [
    "/", "/wardrobe", "/looks", "/scan", "/results", "/add-item",
    "/all-checks", "/wardrobe-item", "/account", "/preferences",
    "/change-password", "/help-center", "/report-problem", "/onboarding",
    "/login", "/signup",
  ];
  
  // Strip query params and normalize
  const normalized = screen.split("?")[0].split("#")[0];
  
  if (allowedScreens.includes(normalized)) {
    return normalized;
  }
  
  // Return generic if unknown
  return "unknown_screen";
}

function sanitizeReason(reason: string): string {
  // Only allow known error reasons
  const allowedReasons = [
    "camera_permission_denied",
    "camera_unavailable",
    "analysis_failed",
    "network_error",
    "timeout",
    "unknown",
  ];
  
  const normalized = reason.toLowerCase().replace(/\s+/g, "_");
  
  if (allowedReasons.includes(normalized)) {
    return normalized;
  }
  
  return "unknown";
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Add a breadcrumb to the buffer.
 * Use BreadcrumbActions to create type-safe breadcrumbs.
 */
export function addBreadcrumb(breadcrumb: Breadcrumb): void {
  buffer.push(breadcrumb);
  
  if (buffer.length > MAX_BREADCRUMBS) {
    buffer = buffer.slice(-MAX_BREADCRUMBS);
  }
}

/**
 * Get a copy of all breadcrumbs.
 */
export function getBreadcrumbs(): Breadcrumb[] {
  return [...buffer];
}

/**
 * Reset breadcrumbs (call on new scan session or app cold start).
 */
export function resetBreadcrumbs(): void {
  buffer = [];
}

/**
 * Format breadcrumbs as a simple arrow-separated string.
 */
export function getBreadcrumbsString(limit = 10): string {
  if (buffer.length === 0) {
    return "No recent actions";
  }

  const items = buffer.slice(-limit).map(formatBreadcrumb);
  return items.join(" → ");
}

/**
 * Format breadcrumbs with timestamps (detailed view).
 */
export function getBreadcrumbsDetailed(limit = 10): string {
  if (buffer.length === 0) {
    return "No recent actions";
  }

  return buffer
    .slice(-limit)
    .map((b) => {
      const date = new Date(b.ts);
      const time = date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      return `[${time}] ${formatBreadcrumb(b)}`;
    })
    .join("\n");
}

/**
 * Format a single breadcrumb for display.
 */
function formatBreadcrumb(b: Breadcrumb): string {
  switch (b.type) {
    case "SCREEN_VIEW":
      return `screen(${b.screen})`;
    case "SCAN_STARTED":
      return `scan_started(${b.source})`;
    case "SCAN_FAILED":
      return b.reason ? `scan_failed(${b.reason})` : "scan_failed";
    case "TAB_SWITCHED":
      return `tab(${b.tab})`;
    case "TIP_OPENED":
      return b.bulletKey ? `tip(${b.bulletKey})` : "tip_opened";
    case "ITEM_ADDED":
      return b.category ? `item_added(${b.category})` : "item_added";
    default:
      return b.type.toLowerCase();
  }
}

// ─────────────────────────────────────────────
// Scan Context (for scan-related reports)
// ─────────────────────────────────────────────

interface ScanContext {
  scanId?: string;
  source?: PhotoSource;
  cameraPermission?: "authorized" | "denied" | "undetermined";
  detectedCategory?: string;
  matchesCount?: number;
  outfitsCount?: number;
}

let lastScanContext: ScanContext | null = null;

/**
 * Set scan context (call when scan completes).
 */
export function setScanContext(context: ScanContext): void {
  lastScanContext = { ...context };
}

/**
 * Get last scan context.
 */
export function getScanContext(): ScanContext | null {
  return lastScanContext ? { ...lastScanContext } : null;
}

/**
 * Clear scan context (call on new scan).
 */
export function clearScanContext(): void {
  lastScanContext = null;
}

/**
 * Format scan context for diagnostics.
 */
export function formatScanContext(): string {
  if (!lastScanContext) {
    return "No recent scan";
  }

  const parts: string[] = [];
  
  if (lastScanContext.scanId) {
    parts.push(`Scan ID: ${lastScanContext.scanId}`);
  }
  if (lastScanContext.source) {
    parts.push(`Source: ${lastScanContext.source}`);
  }
  if (lastScanContext.cameraPermission) {
    parts.push(`Camera: ${lastScanContext.cameraPermission}`);
  }
  if (lastScanContext.detectedCategory) {
    parts.push(`Category: ${lastScanContext.detectedCategory}`);
  }
  if (lastScanContext.matchesCount !== undefined) {
    parts.push(`Matches: ${lastScanContext.matchesCount}`);
  }
  if (lastScanContext.outfitsCount !== undefined) {
    parts.push(`Outfits: ${lastScanContext.outfitsCount}`);
  }

  return parts.length > 0 ? parts.join(" | ") : "No scan data";
}

