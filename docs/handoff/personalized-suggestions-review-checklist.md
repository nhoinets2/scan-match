# Review Checklist (before merge)

Merge gate:
- CRITICAL items must be checked before merging results.tsx integration.

## Database & Security (Owner: Agent A)

- [x] Migration: UNIQUE(user_id, cache_key) not global unique
 - Evidence: `supabase/migrations/015_personalized_suggestions_cache.sql` (index `uq_suggestions_user_cache_key`) — unique index on `(user_id, cache_key)`
 - How verified: Reviewed migration SQL

- [x] Migration: last_hit_at column included
 - Evidence: `supabase/migrations/015_personalized_suggestions_cache.sql` (table `personalized_suggestions_cache`) — column `last_hit_at TIMESTAMPTZ`
 - How verified: Reviewed migration SQL

- [x] Migration: SECURITY DEFINER functions have SET search_path = public
 - Evidence: `supabase/migrations/015_personalized_suggestions_cache.sql` (functions `increment_suggestions_cache_hit`, `cleanup_suggestions_cache`) — `SECURITY DEFINER` with `SET search_path = public`
 - How verified: Reviewed migration SQL

- [x] Migration: increment_suggestions_cache_hit() only updates for auth.uid()
 - Evidence: `supabase/migrations/015_personalized_suggestions_cache.sql` (function `increment_suggestions_cache_hit`) — `WHERE user_id = auth.uid()` and `cache_key = p_cache_key`
 - How verified: Reviewed migration SQL

- [x] Pattern: Edge Function uses service role for writes, client uses RLS for reads
 - Evidence: `supabase/functions/personalized-suggestions/index.ts` (service role client for cache upsert); `src/lib/personalized-suggestions-service.ts` (cache read via `supabase.from('personalized_suggestions_cache')`)
 - How verified: Reviewed edge function + client service code

- [x] CRITICAL: Edge Function verifies JWT using ANON-KEY client (not service role), then uses service role for writes
 - Evidence: `supabase/functions/personalized-suggestions/index.ts` (authClient created with anon key + bearer token; serviceClient used for cache upsert)
 - How verified: Reviewed edge function code path for auth + writes

Summary — What’s verified / what’s missing / risks: All Database & Security checklist items are satisfied in the migration and Edge Function code (unique index, RLS-safe hit function, SECURITY DEFINER with search_path, anon-key JWT verification, service role only for writes). No missing items in this section. Residual risk: operational misconfiguration (wrong Supabase project or missing secrets) could still cause auth or write failures, but the code paths follow the intended security model.

## Types & Data (Owner: Agent B)

- [x] Types: SafeMatchInfo.aesthetic comes from wardrobe item, not scan
 - Evidence: `src/lib/personalized-suggestions-service.ts` (line 181, function `getWardrobeItemAesthetic` lines 138-148) — Aesthetic retrieved from `wardrobeItem.style_signals_v1.aesthetic.primary`, NOT from scan signals. Falls back to mapping `userStyleTags[0]` if signals not ready.
 - How verified: Code review of `topMatches` construction (line 177-183) and helper function implementation

- [x] Types: WardrobeSummary.updated_at is stable ISO string (not Date object)
 - Evidence: `src/lib/types.ts` (line 77) — Type definition: `updated_at: string;`. Used in cache key construction (line 186) as string concatenation, ensuring stable format.
 - How verified: TypeScript type definition + usage in string template for cache key

- [x] Types: Verified Category union matches ALLOWED_ELEVATE_CATEGORIES exactly (both use pluralized: 'tops', 'bottoms', etc.)
 - Evidence: `src/lib/types.ts` (lines 20-29 for Category union, lines 80-88 for ALLOWED_ELEVATE_CATEGORIES) — Both use same 8 pluralized categories: tops, bottoms, shoes, outerwear, dresses, accessories, bags, skirts. "unknown" explicitly excluded from ALLOWED_ELEVATE_CATEGORIES.
 - How verified: Code review + validation function (line 384) clamps to ALLOWED_ELEVATE_CATEGORIES

- [x] CRITICAL: Never send user item names, photos, or descriptions to the model - only IDs + safe enums/fields
 - Evidence: `src/lib/personalized-suggestions-service.ts` (lines 177-183) — SafeMatchInfo only includes: `id` (UUID), `category` (enum), `dominant_color` (string from colors array), `aesthetic` (enum from signals), `label` (AI-detected, NOT user-provided). Never accesses `wardrobeItem.brand`, `wardrobeItem.imageUri`, or any user input fields.
 - How verified: Code review of topMatches construction + SafeMatchInfo type definition in types.ts (lines 61-67)

Summary — What's verified / what's missing / risks: All Types & Data checklist items are satisfied. Type definitions are correct and privacy-preserving: SafeMatchInfo aesthetic properly sources from wardrobe item (not scan), WardrobeSummary.updated_at is typed as string for stable ISO format, Category union matches ALLOWED_ELEVATE_CATEGORIES exactly, and the CRITICAL privacy requirement is met (only IDs + safe enums sent to model, never user names/photos/descriptions). No missing items in this section. Residual risk: Future code changes could accidentally access user-provided fields; recommend adding ESLint rule to prevent accessing `wardrobeItem.brand` or `wardrobeItem.imageUri` in suggestion-related code.

## Service (Owner: Agent B)

- [x] Service: Cache key is SHA-256 hashed
 - Evidence: `src/lib/personalized-suggestions-service.ts` (line 72-77 `sha256Hex` function, line 187 usage) — Uses `Crypto.digestStringAsync(CryptoDigestAlgorithm.SHA256, data)` from expo-crypto. Raw key includes scanId, sorted topIds, updated_at, promptVersion, schemaVersion.
 - How verified: Code review + function implementation using expo-crypto

- [x] Service: Timeout is 1200ms (not 800ms)
 - Evidence: `src/lib/personalized-suggestions-service.ts` (line 31) — `const TIMEOUT_MS = 1200;` explicitly set to 1200ms, used in setTimeout (line 225) with AbortController.
 - How verified: Code review of constant definition + usage

- [x] Service: AbortError handled properly (no unhandled promise rejections)
 - Evidence: `src/lib/personalized-suggestions-service.ts` (lines 269-288) — try/catch wraps fetch, `err.name === "AbortError"` explicitly checked (line 271), mapped to `error_kind: "timeout"`. `clearTimeout()` in finally block (line 288) ensures cleanup. Returns typed error result, not thrown.
 - How verified: Code review of error handling + finally block + unit tests pass

- [x] Service: expires_at > now() check in cache read (hard TTL)
 - Evidence: `src/lib/personalized-suggestions-service.ts` (line 91) — `.gt("expires_at", new Date().toISOString())` filter on cache query ensures only non-expired entries returned. Hard TTL enforcement, expired entries ignored.
 - How verified: Code review of checkSuggestionsCache function (lines 82-99)

Summary — What's verified / what's missing / risks: All Service checklist items are satisfied. Cache key is properly SHA-256 hashed (expo-crypto), timeout is correctly set to 1200ms (not 800ms), AbortError is handled properly with no unhandled promise rejections (caught, mapped to "timeout" error_kind, clearTimeout in finally), and cache reads enforce hard TTL via expires_at > now() filter. No missing items in this section. Residual risk: Network flakiness could cause higher timeout rates in production, but fail-open behavior ensures UI is not blocked. Cache invalidation relies on stable ISO string format for wardrobeSummary.updated_at; if caller provides non-ISO format, cache key will be unstable (but this is enforced by TypeScript types).

## Validation (Owner: Agent B)

- [x] Validation: Uses repair strategy (pad to 2+2, don't fail)
 - Evidence: `src/lib/personalized-suggestions-service.ts` (lines 366-369 for why_it_works, lines 412-415 for to_elevate) — `while (whyItWorks.length < 2)` loop pushes fallback bullets. Function always returns valid PersonalizedSuggestions, never throws. Fallbacks defined at lines 295-305.
 - How verified: Code review + 23 unit tests including padding tests (all passing)

- [x] Validation: smartTrim() trims to last space (not mid-word)
 - Evidence: `src/lib/personalized-suggestions-service.ts` (lines 310-319 `smartTrim` function) — Finds `lastSpace = trimmed.lastIndexOf(" ")`, only trims at space if `lastSpace > maxLen * 0.6` (keeps 60%+ of content). Hard cut with ellipsis only if no good space found. Applied at lines 340, 377.
 - How verified: Code review + unit test "trims long text to ~100 chars at word boundary" (passing)

- [x] Validation: Category clamped to ALLOWED_ELEVATE_CATEGORIES
 - Evidence: `src/lib/personalized-suggestions-service.ts` (lines 384-388) — `ALLOWED_ELEVATE_CATEGORIES.includes(rec?.category as Category)` check, falls back to `"accessories"` if invalid. `wasRepaired` flag set to true when clamping occurs (line 390).
 - How verified: Code review + unit test "forces invalid categories to accessories" (passing)

- [x] Validation: Returns wasRepaired flag for telemetry
 - Evidence: `src/lib/personalized-suggestions-service.ts` (lines 417-424 return statement) — Function returns `{ suggestions: PersonalizedSuggestions, wasRepaired: boolean }`. Flag set to true on: padding (lines 368, 414), trimming (lines 345, 382), invalid mentions (line 359), category clamp (line 390), type enforcement (line 393), attributes fallback (line 404).
 - How verified: Code review + unit tests verify wasRepaired behavior + telemetry uses it (line 265)

Summary — What's verified / what's missing / risks: All Validation checklist items are satisfied. Repair strategy is implemented (pads to exactly 2+2 with fallbacks, never fails), smartTrim() trims at word boundaries (not mid-word) using lastSpace detection with 60% threshold, category validation clamps invalid values to "accessories" using ALLOWED_ELEVATE_CATEGORIES check, and wasRepaired flag is properly returned for telemetry tracking (set to true on any repair action). 23 unit tests all passing, covering padding, trimming, category clamping, mention stripping, and complete valid input scenarios. No missing items in this section. Residual risk: Model could still output malformed JSON that breaks parsing (would be caught by Edge Function before reaching validation), but this is acceptable as validation handles all post-parse issues gracefully.

## UI (Owner: Agent C)

- [x] UI: Mentions rendered separately, not string-replaced
 - Evidence: `src/components/PersonalizedSuggestionsCard.tsx` (WhyItWorksBullet component, lines 63-103) — Bullet text rendered as-is from model (line 88), mentioned items resolved and rendered in separate Text block (lines 92-102) with prefix "(with your {itemList})". NO string replacement or ID substitution in bullet.text.
 - How verified: Code review of WhyItWorksBullet component structure + formatItemList helper (lines 55-57). Main view integration at `src/app/results.tsx` (lines 4901-4910), bottom sheet integration (lines 1456-1464). Verified no .replace() or string interpolation of IDs into text.

- [x] UI: getItemDisplayLabel() has fallback for empty/messy labels
 - Evidence: `src/components/PersonalizedSuggestionsCard.tsx` (getItemDisplayLabel function, lines 35-52) — 3-tier priority: (1) AI-detected label with validation (3-40 chars, has 2+ letters via regex `/[a-zA-Z]{2,}/`), (2) user brand + category if brand exists, (3) category alone (always safe). Handles empty strings (trim check), too-long labels (> 40 char cutoff), and non-letter labels (regex validation).
 - How verified: Code review of function logic + edge case handling (lines 39-43 for detected label validation, 45-47 for brand fallback, 50 for category fallback). Used in formatItemList (line 56) which joins multiple items for display.

- [x] UI: Fail-open (show nothing if suggestions null)
 - Evidence: `src/components/PersonalizedSuggestionsCard.tsx` (main component, lines 189-192) — Returns `null` if `!suggestions` after loading completes. Main view conditional render (`src/app/results.tsx`, line 4901) only renders if `suggestionsLoading || (suggestionsResult?.ok && suggestionsResult.data)`. Bottom sheet same pattern (line 1456). No broken card, no error message shown to user.
 - How verified: Code review of component return logic + conditional rendering in both locations. Verified loading skeleton (lines 162-180) only shown during `isLoading`, then component cleanly disappears if suggestions null/error.

Summary — What's verified / what's missing / risks: All UI checklist items are satisfied. PersonalizedSuggestionsCard component implements structural mention rendering (text + mentions in separate DOM nodes, no string replacement), robust label fallbacks with 3-tier priority and validation (handles empty/long/invalid labels), and fail-open behavior (returns null if suggestions unavailable, no error UI). Component integrated into both main results view and MatchesBottomSheet (high matches only) with shared state to avoid double-fetch. Layout stable with conditional rendering and minimal loading skeleton. No missing items in this section. Residual risk: If wardrobe items have missing/corrupt data (no category, null IDs), getItemDisplayLabel could return unexpected values, but fallback to category string prevents crashes. UI correctly passes wardrobeItemsById map with null-coalescing (`?? new Map()`) to prevent runtime errors if undefined.

## Telemetry (Owner: Agent B)

- [x] Telemetry: Includes promptVersion and schemaVersion
 - Evidence: `src/lib/personalized-suggestions-service.ts` (lines 208-209, 221-222, 263-264, 278-279) — All events (started/completed/failed) include both version fields
 - How verified: Code review + type checking

- [x] Telemetry: Logs timeout as distinct errorKind
 - Evidence: `src/lib/personalized-suggestions-service.ts` (line 271) — `err.name === "AbortError"` → `error_kind: "timeout"`
 - How verified: Code review of error classification logic

- [x] Telemetry: Tracks wasRepaired on success
 - Evidence: `src/lib/personalized-suggestions-service.ts` (line 265) — `was_repaired: wasRepaired` from validateAndRepairSuggestions()
 - How verified: Code review + unit tests pass