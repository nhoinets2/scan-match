# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Trust Filter Telemetry**: Wired analytics tracking into `useTrustFilter` hook:
  - `trust_filter_started` - When evaluation begins
  - `trust_filter_completed` - Summary with demote/hide/skip counts and duration
  - `trust_filter_pair_decision` - Per-pair decision (sampled at 5%)
  - `trust_filter_error` - When evaluation fails
- **Trust Filter Remote Config**: Added remote config system for dynamic rule updates:
  - New `trust_filter_config` table in Supabase
  - Single active config with automatic deactivation of others
  - Client fetches config on app start (5 min cache)
  - Validates overrides against allowed keys before applying
- **Style Signals Re-enrichment Triggers**: Added functions for outdated signal management:
  - `isSignalsOutdated(itemId)` - Check if signals need refresh
  - `forceReEnrichWardrobe(itemId)` - Force regeneration for wardrobe item
  - `forceReEnrichScan(scanId)` - Force regeneration for scan
  - `getOutdatedWardrobeItems()` - Get all items needing refresh
  - `triggerBulkReEnrichment()` - Batch re-enrich with rate limiting
- **Supabase Analytics Sink**: Added production analytics system using Supabase as the backend:
  - New `analytics_events` table with RLS (insert-only for clients)
  - Batched event sending (10 events or 15 seconds)
  - Sampling for high-volume events (e.g., `trust_filter_pair_decision` at 5%)
  - Session ID per app launch for session-level analysis
  - Trust Filter and Style Signals event types
  - Query examples for demote rates, reason breakdowns, success rates
- **Trust Filter v1 Integration (Epic 2)**: Integrated Trust Filter into results screen via `useTrustFilter` hook. When enabled, HIGH matches are post-processed to filter trust-breaking combinations:
  - `highFinal` matches stay in "Wear now" tab
  - `demoted` matches move to "Worth trying" tab  
  - `hidden` matches are removed completely
  - Async style signal fetching with lazy enrichment for wardrobe items
- **Trust Filter v1 Core (Epic 2)**: Implemented deterministic post-CE guardrail that prevents trust-breaking HIGH matches. Evaluates pairs using style signals (aesthetic archetypes, formality, statement level, season, pattern) and outputs keep/demote/hide decisions with reason codes. Features include:
  - 12 aesthetic archetypes with cluster-based distance calculation
  - Secondary aesthetic softening to prevent over-penalizing blended styles
  - Category-specific policies (bags/accessories never hidden for archetype-only, skirts can't escalate to hide)
  - Anchor rule for context-dependent pairs (shoes+tops, outerwear+shoes)
  - Configurable confidence thresholds and decision priorities
  - Full trace support for debugging decisions
  - Remote config override with validated safe subset of keys
- **Style Signals v1 (Epic 1)**: Full implementation of style signal generation and storage:
  - Database schema with 8 new columns on `wardrobe_items` and `recent_checks`
  - Edge Function (`style-signals`) for GPT-4 Vision analysis with 12 aesthetic archetypes
  - Client service with caching, batch fetching, and lazy enrichment support
  - Feature flags for controlled rollout (`trust_filter_enabled`, `style_signals_enabled`)
  - Integration layer for applying Trust Filter to Confidence Engine results

### Security
- **[CRITICAL FIX] Subscription data leakage between accounts** - Fixed critical security vulnerability where subscription status would leak from one user to another when switching accounts on the same device. React Query cache is now properly cleared on logout, and RevenueCat user ID is correctly set on login. When User A with Pro subscription logged out and User B logged in, User B would incorrectly see "Pro Member" status from User A. See `docs/historical/subscription-leak-fix.md` for full details.
- **OpenAI API key moved to server-side** - Moved OpenAI API key to server-side Edge Function (no longer exposed in client bundle)
- **Server-side rate limiting** - Added rate limiting to prevent abuse (50 requests/user/hour, 100 requests/minute globally)

### Added
- **Documentation reorganization** with dedicated folders for historical, guides, and specs
- **docs/NAVIGATION.md** - Comprehensive documentation index with role and task-based navigation
- **CHANGELOG.md** - Proper changelog following semantic versioning
- **DOCUMENTATION_REORGANIZATION_SUMMARY.md** - Complete summary of reorganization changes
- Updated **docs/README.md** with quick access links and structure overview
- Enhanced **AGENTS.md** with project context, development guidelines, and documentation links
- **src/lib/queryClient.ts** - Shared QueryClient instance to avoid circular dependencies
- **Monthly quota limits** for all users (including Pro) to prevent runaway API costs:
  - Free: 10 scans/month, 15 wardrobe adds/month
  - Pro: 500 scans/month, 1000 wardrobe adds/month
- **Server-side quota enforcement** via Supabase Edge Function
- **Idempotency keys** to prevent double-charging on retries
- **Auto-retry** when app returns from background during analysis
- **Credit consumption details** added to Help Center (explains when credits are used)
- **Camera permission pre-prompt screen** before iOS system permission dialog to improve grant rates and comply with App Store Review Guidelines

### Changed
- **Free scan limit increased** from 5 to 10 scans to provide more value to free users and improve trial experience before upgrade
- **Updated COMPREHENSIVE_SYSTEM_DOCUMENTATION.md** - Removed outdated "More Options CTA" and "NearMatchesSheet" references
- **Updated COMPREHENSIVE_SYSTEM_DOCUMENTATION.md** - Reflected current tabs architecture ("Wear now" / "Worth trying")
- **Updated README.md** - Added documentation section with links to new structure
- **Moved 4 completed fix docs** to `docs/historical/` (store preferences, chip truncation, iOS fix, Metro bundler)
- **Moved 11 setup guides** to `docs/guides/` (CI/CD, Maestro, testing, Xcode workflows)
- **Moved 4 technical specs** to `docs/specs/` (confidence engine, MODE_A suggestions, features)
- **Moved REFUND_POLICY.md** to `docs/`

### Fixed
- **Post-upgrade scan retry stuck on limit screen** - After purchasing Pro subscription from "Scan limit reached" screen, users were stuck on the same screen instead of retrying the scan. Now properly refreshes Pro status after purchase and automatically retries the scan with the same photo. Shows "Activating Pro..." overlay during status refresh.
- **Post-upgrade wardrobe add not reflecting Pro status** - After purchasing Pro subscription from wardrobe limit paywall, users could still see the paywall again if they tried to capture immediately (Pro status wasn't refreshed yet). Now properly awaits Pro status refresh with "Activating Pro..." overlay before allowing capture.
- **Subscription status leaking between users** - When user logs out and another user logs in, the new user no longer sees the previous user's Pro subscription status
- **RevenueCat user ID not updated after logout** - RevenueCat now properly tracks the correct user when logging in after logout
- **Misleading quota message for free users** - Fixed bug where free users hitting their quota saw "Monthly limit reached - resets next month" instead of "Scan limit reached - Upgrade to Pro". The monthly reset message was misleading because free users have a lifetime limit that never resets.
- **CRITICAL: Quota not consumed on cache hits** - Fixed bug where cached scan results bypassed quota consumption entirely, allowing unlimited free scans. Now properly consumes quota via RPC even when returning cached analysis results.
- **Scan flow instability** - Analysis state now properly resets when scanning a new item (was showing stale results from previous scans when screen was reused)
- **Wardrobe updates not reflected** - Results screen now refreshes wardrobe data when returning from add-item (matches now update immediately after adding wardrobe items)
- **Scan camera processing overlay issues** - Fixed "Checking scan access..." overlay appearing incorrectly when returning to scan screen from results, and eliminated flash of previous camera screen when tapping "Scan another item"
- **Storage upload RLS errors** - Added session verification before background uploads to prevent "row-level security policy" errors when session expires or app restarts before auth is restored
- **Wardrobe adds quota pool** - Now consume from correct quota pool (was incorrectly using scan credits)
- **Dark overlay on logout/transition screens** - Now covers full screen edge-to-edge
- **Analysis failures when app goes to background** - Now auto-retry on return
- **Add wardrobe item background recovery** - Fixed bug where adding a wardrobe item while app goes to background would fail to manual form instead of auto-retrying. Now stays in loading state (up to 2 retries) for seamless recovery when returning from background.
- **Scan item background flash** - Eliminated brief flash of "Couldn't analyze" error screen when returning from background during scan analysis. Now stays in loading state for seamless retry (up to 3 attempts).
- **Wardrobe images not refreshing after background upload** - Fixed placeholder images appearing on wardrobe cards after returning from background. React Query now properly integrates with AppState to refetch data when app returns from background, ensuring uploaded images are immediately visible.
- **Wardrobe card loading states** - Added loading spinner to wardrobe item cards when images are loading (e.g., during URI transition from file:// to https:// after upload). Prevents white placeholder flash and provides better visual feedback.
- **Saved scans loading states** - Added loading spinner to saved scan images (ImageWithFallback and ThumbnailWithFallback components) during URI transitions and network loads. Consistent loading experience across all image types.
- **Paywall interrupting successful last credit use** - No longer interrupts users who used their last credit successfully (was showing paywall after analysis completed)
- **Scan flow paywall timing** - Now shows paywall BEFORE capture when quota exceeded (previously let users scan then blocked them after)
- **Scan paywall title** - Now shows correct title "You've used your 10 free scans" (was showing wrong paywall type)
- **Post-denial Settings navigation** - Fixed issue where post-denial screen appeared when user returned from Settings after granting camera permission. Now only refreshes permission state when user explicitly taps "Open Settings", preventing unnecessary retries during random app backgrounding (Control Center, multitasking).
- **Paywall purchase button reliability** - Fixed critical issue where purchase button remained tappable even when RevenueCat packages failed to load, causing silent failures. Button now properly disables when packages unavailable, shows "Unavailable" or "Loading..." states, and displays user-friendly error alerts with retry option. Removes misleading fallback prices that could trigger App Review rejection.
- **Subscription purchase error handling** - Enhanced purchase flow with proper error handling for user cancellations (no error shown), entitlement polling (waits up to 10 seconds for activation), and detailed error messages. Added unavailable banner with retry button when offerings fail to load.
- **RevenueCat offerings retry mechanism** - Fixed React Query retry to properly trigger on failures by throwing errors instead of returning null. Query now auto-retries twice with 1s delay, handles error states explicitly, and shows appropriate UI feedback during all states (loading, error, success).
- **Password reset flow navigation loop** - Fixed navigation loop causing landing page to blink when user tapped reset password link from email. AuthGuard now properly allows reset-password-confirm screen without redirecting. Added comprehensive error handling with proper validation states (link expired, invalid session) and user-friendly error messages aligned with app-wide design patterns.
- **Password reset double-screen and link expired bug** - Fixed issue where clicking password reset link from email would open two reset screens and show "link expired" error. Root causes: (1) `detectSessionInUrl: true` doesn't work in React Native (no URL bar), so tokens weren't being processed, (2) DeepLinkHandler was manually navigating while Expo Router also auto-navigates based on URL path. Fixes: Set `detectSessionInUrl: false` and manually call `supabase.auth.setSession()` with tokens extracted from deep link URL; removed manual navigation since Expo Router handles it; reset screen now polls for session with retries to handle timing.

### Improved
- **Camera permission UX** - Users now see a custom explanation screen before the native dialog, with clear messaging about why camera access is needed
- **Camera permission handling** - Implemented robust permission state machine with explicit refresh logic when returning from Settings. Permission status is now the single source of truth, with UI-driven screen states and retry backoff (150ms → 300ms → 500ms) for reliable detection of permission changes
- **Restricted camera access handling** - Added proper support for iOS "restricted" status (parental controls/MDM) with appropriate messaging that doesn't mislead users to open Settings when it won't help
- **Add wardrobe item performance** - Removed redundant client-side quota check (~100-200ms faster)
- **Cache lookup optimization** - Skip cache lookup for wardrobe adds (user photos are unlikely to be cached, saves ~189ms on misses)
- **Image picker UX** - No longer forces cropping (iOS limitation prevented free-form crop, now uses full image)
- **AI style notes** - Now generates richer style notes (2 descriptive sentences instead of short phrases)

### Removed
- **Temporary debug files** (DEBUG_SNAPSHOT_SETUP.md, DEBUG_SNAPSHOT_REMOVAL.md)
- **Redundant MODE_A docs** (MODE_A_FILTERING_EXPLAINED.md, CATEGORY_SPECIFIC_TEMPLATES_EXPLAINED.md, PHASE3_RULE_3_2_EXPLAINED.md)
- **changelog.txt** - Migrated to proper CHANGELOG.md following Keep a Changelog format

### Technical
- **src/lib/trust-filter/** - New module for Trust Filter v1 with 6 files:
  - `types.ts` - Type definitions for StyleSignalsV1, reason codes, categories
  - `config.ts` - TRUST_FILTER_CONFIG_V1 with cluster distances, rules, policies
  - `helpers.ts` - Pure functions for distance calculation, formality gaps, category checks
  - `evaluate.ts` - Main `evaluateTrustFilterPair` and `evaluateTrustFilterBatch` functions
  - `index.ts` - Public API exports
  - `__tests__/evaluate.test.ts` - 23 unit tests covering all 12 canonical scenarios plus edge cases
- **supabase/migrations/009_trust_filter_remote_config.sql** - Remote config table:
  - `trust_filter_config` table with version, is_active, config_overrides
  - Trigger to ensure only one active config at a time
  - RLS: authenticated users can read active config only
  - Example template config included (inactive)
- **src/lib/trust-filter-remote-config.ts** - Remote config fetch service:
  - `fetchTrustFilterConfig()` - Fetch and merge remote overrides
  - `getTrustFilterConfigSync()` - Get cached config (sync)
  - `preloadRemoteConfig()` - Start fetch at app launch
  - 5-minute cache to avoid excessive fetches
- **supabase/migrations/008_analytics_events.sql** - Database migration for analytics:
  - `analytics_events` table with `user_id`, `session_id`, `name`, `properties` (JSONB)
  - Indexes for time, event name, and user queries
  - RLS: insert-only for authenticated users, no client reads
  - Example queries for Trust Filter demote rates, style signals success rates
- **supabase/migrations/007_style_signals_v1.sql** - Database migration adding style signals columns to `wardrobe_items` and `recent_checks` tables:
  - `style_signals_v1` (JSONB) - The actual style signals data
  - `style_signals_version` - Schema version for future migrations
  - `style_signals_status` - Processing status (none/processing/ready/failed)
  - `style_signals_updated_at`, `source`, `error`, `prompt_version`, `input_hash`
  - Includes indexes for efficient queries and GIN index for JSONB
- **supabase/functions/style-signals/** - New Edge Function for generating StyleSignalsV1:
  - Accepts `{ type: 'scan' | 'wardrobe', scanId?, itemId? }`
  - Uses GPT-4 Vision with structured prompt for 12 aesthetic archetypes
  - Validates and normalizes AI response to strict schema
  - Caching by input hash + prompt version (no redundant AI calls)
  - Graceful fallback to unknown-filled signals on failure
- **src/lib/style-signals-service.ts** - Client service for style signals:
  - `generateScanStyleSignals(scanId)` - Generate signals for scan
  - `generateWardrobeStyleSignals(itemId)` - Generate signals for wardrobe item
  - `enqueueWardrobeEnrichmentBatch(itemIds)` - Fire-and-forget lazy enrichment
  - `fetchWardrobeStyleSignalsBatch(itemIds)` - Batch fetch cached signals
  - `getItemsNeedingEnrichment(itemIds)` - Check which items need enrichment
- **src/lib/feature-flags.ts** - Centralized feature flag management:
  - `trust_filter_enabled` - Enable/disable Trust Filter
  - `trust_filter_trace_enabled` - Enable detailed trace logging
  - `style_signals_enabled` - Enable style signal generation
  - `lazy_enrichment_enabled` - Enable background wardrobe enrichment
- **src/lib/useTrustFilter.ts** - React hook for applying Trust Filter to CE results:
  - Fetches style signals for scan and matched wardrobe items
  - Applies Trust Filter batch evaluation
  - Returns filtered matches (highFinal, demoted, hidden)
  - Handles async loading states and lazy enrichment
- **src/lib/trust-filter-integration.ts** - Integration layer between Trust Filter and CE:
  - `applyTrustFilter(scanSignals, category, matches, wardrobe)` - Async version with signal fetching
  - `applyTrustFilterSync(scanSignals, category, matches, signalsMap)` - Sync version with pre-fetched signals
  - Returns `{ highFinal, demoted, hidden, stats }` for results screen
- **src/lib/auth-context.tsx** - Clear React Query cache on logout (both in signOut function and SIGNED_OUT event), set RevenueCat user ID on login
- **src/app/_layout.tsx** - Import queryClient from shared module
- **New Edge Function: analyze-image** - Handles auth, quota, rate limits, and OpenAI calls
- **Database migration: 006_monthly_quotas.sql** - Adds monthly tracking columns and functions
- **analyzeClothingImage** - Now accepts `operationType` ('scan' | 'wardrobe_add') and `skipCache` params
- **Test coverage** - Added comprehensive test coverage in `src/lib/__tests__/auth-context.test.ts` for account switching scenarios

## [1.0.0] - 2026-01

### Major Features
- Confidence Engine for outfit matching
- AI-powered clothing analysis with OpenAI
- Wardrobe management with image storage
- Results screen with "Wear now" / "Worth trying" tabs
- Store preferences for future shopping suggestions
- Mode A and Mode B styling suggestions
- Authentication with email/password and Apple Sign-In

### Infrastructure
- Supabase backend integration
- React Query for server state management
- NativeWind + Tailwind for styling
- Expo SDK 53 / React Native 0.79
- CI/CD with GitHub Actions and EAS Build

---

## Documentation Structure

The project documentation is now organized as follows:

```
docs/
├── current/              # Active feature documentation (in docs/)
├── historical/           # Completed fixes and old architecture
├── guides/              # Setup and workflow guides
└── specs/               # Technical specifications

Root documentation:
├── README.md            # Project overview
├── CHANGELOG.md         # This file
├── COMPREHENSIVE_SYSTEM_DOCUMENTATION.md  # Complete system guide
└── REFUND_POLICY.md     # App Store refund policy
```

See `docs/README.md` for navigation and file index.
