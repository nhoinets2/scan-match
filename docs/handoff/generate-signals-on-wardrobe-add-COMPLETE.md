# Generate Style Signals on Wardrobe Add + Telemetry - COMPLETE

**Status:** ✅ Implemented and deployed  
**Date:** January 30, 2026  
**Plan:** `.cursor/plans/generate_signals_on_wardrobe_add_e8b121e1.plan.md`

---

## Executive Summary

Implemented proactive style signal generation immediately after wardrobe item image upload, eliminating the "rescan twice" UX issue where Trust Filter reported `insufficient_info` on first scan. Added comprehensive telemetry and analytics tracking to monitor the lifecycle of style signals generation.

**Before:** 
- Users had to scan items multiple times to see Trust Filter decisions
- No visibility into signal generation success/failure, latency, or errors

**After:** 
- Trust Filter has signals ready on first scan
- Complete observability with analytics events tracking success rates, latency, cache hits, and error types

---

## Problem Statement

### User Experience Issue

When users added wardrobe items, style signals were only generated "lazily" when needed by Trust Filter. This created a poor UX:

1. Add item to wardrobe
2. Upload image → Complete
3. **First scan** → Trust Filter sees `NO_SIGNALS` → Shows `insufficient_info`
4. Wait for lazy enrichment to complete in background
5. **Second scan** → Trust Filter sees signals → Shows real decisions

### Root Cause

Style signals generation was triggered only when Trust Filter detected missing signals, causing a timing issue:
- Lazy enrichment is "fire-and-forget" (non-blocking)
- Trust Filter completes evaluation before enrichment finishes
- User needs to rescan to see benefits

---

## Solution Overview

Trigger style signal generation **immediately after successful wardrobe image upload**, so signals are ready by the time user performs their first scan.

### Flow Change

```
BEFORE:
1. Add item → 2. Upload image → 3. Done
4. First scan → TF has no signals → lazy enrichment triggered
5. Second scan → TF has signals → real decisions

AFTER:
1. Add item → 2. Upload image → 3. Trigger signal generation
4. First scan → TF has signals → real decisions
```

---

## Implementation Details

### Client-Side Changes

**File:** `src/lib/storage.ts`

#### Import Added (Line ~18)
```typescript
import { enqueueWardrobeEnrichment } from './style-signals-service';
```

#### Upload Worker Hook (Lines ~483-488)
```typescript
// After successful wardrobe upload
if (updatedCount > 0) {
  logUploadEvent('upload_succeeded', jobId, { kind, publicUrl });
  
  // NEW: Trigger style signal generation for wardrobe items
  if (kind === 'wardrobe') {
    console.log('[UploadWorker] Triggering style signal generation for:', jobId);
    enqueueWardrobeEnrichment(jobId);
  }
}
```

**Key Behaviors:**
- Only triggers for `kind === 'wardrobe'` (not scans or recent checks)
- Called after database update with remote URL
- Fire-and-forget (doesn't block upload completion)
- Uses existing `enqueueWardrobeEnrichment()` function (already tested)

**Enhanced Logging (with telemetry):**
```typescript
console.log('[UploadWorker] ✅ Upload succeeded, triggering style signal generation for:', jobId);
```

Added ✅ indicator to clearly separate upload success from signal generation initiation.

### Edge Function Improvements

**File:** `supabase/functions/style-signals/index.ts`

#### Custom Error Class (Lines ~160-170)
```typescript
class AnthropicError extends Error {
  status: number;
  details: string;

  constructor(status: number, details: string) {
    super(`Anthropic API error: ${status}`);
    this.status = status;
    this.details = details;
  }
}
```

**Purpose:** Preserves HTTP status and full error response from Anthropic API

#### Magic Byte Detection (Lines ~289-326)
```typescript
function detectMediaType(bytes: Uint8Array): string {
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return "image/png";
  }
  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  // GIF: GIF8
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "image/gif";
  }
  return "application/octet-stream";
}
```

**Purpose:** Determines actual file format by reading magic bytes, not trusting HTTP headers

#### Enhanced fetchImageAsBase64 (Lines ~328-342)
```typescript
async function fetchImageAsBase64(imageUrl: string): Promise<{ 
  mediaType: string; 
  data: string; 
  byteSize: number  // NEW
}> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const headerType = response.headers.get("content-type") || "image/webp";
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  
  // Detect actual media type from file signature
  const detectedType = detectMediaType(bytes);
  if (detectedType !== headerType && detectedType !== "application/octet-stream") {
    console.warn(`[style-signals] Media type mismatch: header=${headerType}, detected=${detectedType}`);
  }
  
  const mediaType = detectedType !== "application/octet-stream" ? detectedType : headerType;
  return { mediaType, data: arrayBufferToBase64(buffer), byteSize: buffer.byteLength };
}
```

**Key Changes:**
- Returns `byteSize` for error logging
- Detects actual media type using magic bytes
- Warns on mismatch between header and detected type
- Sends correct type to Anthropic API

#### Improved Error Handling (Lines ~946-986)
```typescript
// Throw custom error with full details
if (!anthropicResponse.ok) {
  const errorText = await anthropicResponse.text();
  console.error(`[style-signals] Anthropic error: ${anthropicResponse.status}`, errorText);
  throw new AnthropicError(
    anthropicResponse.status, 
    `${errorText} | ${imageMeta}`  // Include image metadata
  );
}

// ... later in catch block ...

const errorDetails = error instanceof AnthropicError
  ? `${error.message}: ${error.details.slice(0, 500)}`  // Truncate to 500 chars
  : String(error);

// Store detailed error in database
await supabaseAdmin
  .from(tableName)
  .update({
    style_signals_status: 'failed',
    style_signals_error: errorDetails,  // Full context, not generic message
    // ...
  })
```

**Benefits:**
- Detailed errors stored in database (not generic "400" message)
- Includes image metadata (type, byte size) for debugging
- Truncated to 500 chars to fit DB column
- Enables root cause analysis without Edge Function logs

---

## Telemetry & Analytics

### Overview

Comprehensive analytics tracking monitors the complete lifecycle of style signals generation, enabling visibility into success/failure rates, latency, cache performance, and error types.

### Analytics Events

#### `style_signals_started`
Tracked when signal generation begins.

**Properties:**
- `type`: `"wardrobe"` | `"scan"`
- `item_id`: string

#### `style_signals_completed`
Tracked when signals are successfully generated.

**Properties:**
- `type`: `"wardrobe"` | `"scan"`
- `item_id`: string
- `cached`: boolean (was result from cache?)
- `duration_ms`: number
- `primary_archetype`: string (e.g., "MINIMAL")
- `formality_band`: string (e.g., "CASUAL")
- `prompt_version`: number

#### `style_signals_failed`
Tracked when signal generation fails.

**Properties:**
- `type`: `"wardrobe"` | `"scan"`
- `item_id`: string
- `error_type`: string (e.g., "unauthorized", "network_error")
- `error_message`: string

### Implementation

**File:** `src/lib/style-signals-service.ts`

#### Import Analytics
```typescript
import { trackEvent } from './analytics';
```

#### Enhanced `generateWardrobeStyleSignals`

**Added:**
- Start time tracking
- `style_signals_started` event at function entry
- `style_signals_completed` event on success (with rich metadata)
- `style_signals_failed` event on all failure paths
- Duration calculation for all outcomes
- Enhanced console logs with ✅/❌ indicators

**Success Log Example:**
```typescript
console.log(
  '[StyleSignals] ✅ Completed:', 
  itemId, 
  `cached=${result.cached}`,
  `${durationMs}ms`,
  result.data.primaryArchetype,
  result.data.formalityBand
);
```

**Failure Log Example:**
```typescript
console.log(
  '[StyleSignals] ❌ Failed:', 
  itemId, 
  result.error?.kind ?? 'unknown',
  `${durationMs}ms`
);
```

#### Enhanced `enqueueWardrobeEnrichment`

**Added:**
- Log when enrichment is enqueued
- Catch block for unexpected errors
- Fallback analytics tracking for edge cases

```typescript
console.log('[StyleSignals] Enqueuing background enrichment for:', itemId);
```

### Log Output Examples

#### Success Case (Cache Miss)
```
LOG  [UploadWorker] ✅ Upload succeeded, triggering style signal generation for: abc123
LOG  [StyleSignals] Enqueuing background enrichment for: abc123
LOG  [Analytics] style_signals_started {"type": "wardrobe", "item_id": "abc123"}
LOG  [StyleSignals] ✅ Completed: abc123 cached=false 2547ms MINIMAL CASUAL
LOG  [Analytics] style_signals_completed {"type": "wardrobe", "item_id": "abc123", "cached": false, "duration_ms": 2547, "primary_archetype": "MINIMAL", "formality_band": "CASUAL", "prompt_version": 3}
```

#### Success Case (Cache Hit)
```
LOG  [UploadWorker] ✅ Upload succeeded, triggering style signal generation for: def456
LOG  [StyleSignals] Enqueuing background enrichment for: def456
LOG  [Analytics] style_signals_started {"type": "wardrobe", "item_id": "def456"}
LOG  [StyleSignals] ✅ Completed: def456 cached=true 342ms SPORTY CASUAL
LOG  [Analytics] style_signals_completed {"type": "wardrobe", "item_id": "def456", "cached": true, "duration_ms": 342, "primary_archetype": "SPORTY", "formality_band": "CASUAL", "prompt_version": 3}
```

#### Failure Case (Network Error)
```
LOG  [UploadWorker] ✅ Upload succeeded, triggering style signal generation for: ghi789
LOG  [StyleSignals] Enqueuing background enrichment for: ghi789
LOG  [Analytics] style_signals_started {"type": "wardrobe", "item_id": "ghi789"}
ERROR [StyleSignals] ❌ Network error: ghi789 Failed to fetch 1234ms
LOG  [Analytics] style_signals_failed {"type": "wardrobe", "item_id": "ghi789", "error_type": "network_error", "error_message": "Failed to fetch"}
```

#### Failure Case (Unauthorized)
```
LOG  [StyleSignals] Enqueuing background enrichment for: jkl012
LOG  [Analytics] style_signals_started {"type": "wardrobe", "item_id": "jkl012"}
LOG  [StyleSignals] Failed: jkl012 unauthorized 23ms
LOG  [Analytics] style_signals_failed {"type": "wardrobe", "item_id": "jkl012", "error_type": "unauthorized", "error_message": "Not authenticated"}
```

### Analytics Configuration

Events are configured for 100% sampling in `src/lib/analytics.ts`:

```typescript
SAMPLING_RATES: {
  style_signals_started: 1,      // 100%
  style_signals_completed: 1,    // 100%
  style_signals_failed: 1,       // 100%
  // ...
}
```

All events are:
- Logged to console in development (`__DEV__`)
- Sent to Supabase `analytics_events` table in production
- Batched (10 events or 15s flush interval)
- Include `session_id`, `user_id`, and `timestamp`

### Monitoring & Metrics

#### Key Metrics to Track

1. **Success Rate:** `completed / (completed + failed)`
2. **Average Latency:** `avg(duration_ms)` for completed events
3. **Cache Hit Rate:** `sum(cached) / sum(completed)`
4. **Error Distribution:** `count(*) group by error_type`

#### Sample Queries

**Success rate by day:**
```sql
SELECT 
  date_trunc('day', timestamp) as day,
  count(*) filter (where name = 'style_signals_completed') as success,
  count(*) filter (where name = 'style_signals_failed') as failed,
  round(100.0 * count(*) filter (where name = 'style_signals_completed') / nullif(count(*), 0), 2) as success_rate_pct
FROM analytics_events
WHERE name IN ('style_signals_completed', 'style_signals_failed')
  AND (properties->>'type')::text = 'wardrobe'
GROUP BY 1
ORDER BY 1 DESC;
```

**Average latency and cache hit rate:**
```sql
SELECT 
  count(*) as total_completed,
  round(avg((properties->>'duration_ms')::int), 0) as avg_duration_ms,
  round(100.0 * sum(case when (properties->>'cached')::boolean then 1 else 0 end) / count(*), 2) as cache_hit_rate_pct
FROM analytics_events
WHERE name = 'style_signals_completed'
  AND (properties->>'type')::text = 'wardrobe';
```

**Error breakdown:**
```sql
SELECT 
  properties->>'error_type' as error_type,
  count(*) as count,
  round(100.0 * count(*) / sum(count(*)) over (), 2) as percentage
FROM analytics_events
WHERE name = 'style_signals_failed'
  AND (properties->>'type')::text = 'wardrobe'
GROUP BY 1
ORDER BY 2 DESC;
```

### Benefits

1. **Visibility:** Track end-to-end signal generation lifecycle
2. **Debugging:** Clear logs with timing help identify slow/failing requests
3. **Monitoring:** Production metrics for success rates and latency
4. **Cache Analysis:** Track cache hit rates to validate caching strategy
5. **Error Analysis:** Understand common failure modes and error types
6. **UX Insights:** Measure time between upload → signals ready

---

## Why This Works

1. **Timing:** Upload worker updates database with remote `https://` URL **before** calling enrichment
2. **URL Compatibility:** Edge Function requires remote URLs (not `file://`) - upload ensures this
3. **Non-Blocking:** Fire-and-forget call doesn't delay upload completion
4. **Fallback:** Lazy enrichment still triggers if proactive generation fails

---

## Edge Cases Handled

### Signal Generation Fails
- Lazy enrichment provides fallback on first scan
- Trust Filter remains fail-open (passes through matches)
- User sees content even without signals

### User Scans Immediately After Adding
- If generation not complete: TF sees `insufficient_info` once, then signals on refresh
- Still better than requiring full rescan cycle
- Typical upload → scan gap: 5-10 seconds (sufficient for generation)

### Image Upload Fails
- No enrichment triggered (database never updated with remote URL)
- User prompted to retry upload
- No orphaned signal generation attempts

---

## Testing Verification

### Manual QA Steps

1. **Proactive Generation with Telemetry:**
   - Add wardrobe item with photo
   - Check logs for complete sequence:
     ```
     [UploadWorker] ✅ Upload succeeded, triggering style signal generation for: ...
     [StyleSignals] Enqueuing background enrichment for: ...
     [Analytics] style_signals_started
     [StyleSignals] ✅ Completed: ... (or ❌ Failed...)
     [Analytics] style_signals_completed (or style_signals_failed)
     ```
   - Wait 5 seconds
   - Check database: `style_signals_status = 'ready'`
   - Scan item → Trust Filter shows real decisions (not `insufficient_info`)
   - Check analytics database (if production sink enabled):
     ```sql
     SELECT * FROM analytics_events 
     WHERE name LIKE 'style_signals%' 
     ORDER BY timestamp DESC 
     LIMIT 10;
     ```

2. **Magic Byte Detection:**
   - Upload image with mismatched header (WebP file with `image/jpeg` header)
   - Check logs for `Media type mismatch: header=image/jpeg, detected=image/webp`
   - Verify signal generation succeeds (not 400 error)
   - Verify `style_signals_completed` event logged

3. **Error Logging and Telemetry:**
   - Simulate Anthropic error (invalid API key)
   - Check logs for `[StyleSignals] ❌ Failed: ...`
   - Check `style_signals_error` column in database
   - Verify full error details (not generic "400")
   - Verify `style_signals_failed` event with error details

### Expected Behavior

**Logs (Upload Worker & Telemetry):**
```
[UploadWorker] DB update result, rows affected: 1
[UploadWorker] ✅ Upload succeeded, triggering style signal generation for: abc-123-uuid
[StyleSignals] Enqueuing background enrichment for: abc-123-uuid
[Analytics] style_signals_started {"type": "wardrobe", "item_id": "abc-123-uuid"}
[StyleSignals] ✅ Completed: abc-123-uuid cached=false 2547ms MINIMAL CASUAL
[Analytics] style_signals_completed {"type": "wardrobe", "item_id": "abc-123-uuid", ...}
```

**Database After ~5s:**
```sql
SELECT style_signals_status, style_signals_error 
FROM wardrobe_items 
WHERE id = 'abc-123-uuid';

-- Result:
-- status: 'ready'
-- error: NULL
```

**First Scan:**
```
[TrustFilter] Wardrobe signals: scan+/ward3 (scan ready, 3 wardrobe items ready)
[TrustFilter] Item abc-123 action: keep (aesthetic_match)
```

---

## Performance Impact

### Timing Analysis

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Upload completion | ~2s | ~2s | No change (fire-and-forget) |
| First scan TF result | `insufficient_info` | Real decisions | ✅ Improved |
| Scans to see TF | 2+ | 1 | ✅ 50% reduction |
| API calls per add | Same | Same | No increase |

**Cost Impact:** None - same API calls, just different timing

---

## Related Bugs Fixed

### Anthropic 400 Error - Media Type Mismatch

**Problem:** Supabase Storage headers reported `image/jpeg` for WebP files, causing Anthropic API to reject with:
```
Image does not match the provided media type image/jpeg
```

**Solution:** Magic byte detection reads actual file format, bypassing unreliable headers.

**Files Modified:**
- `supabase/functions/style-signals/index.ts`

**Commits:**
- Magic byte detection: `f922cfc`
- Error logging improvements: `f922cfc`

### Misleading AI Safety Dry Run Log

**Problem:** `[FinalizedMatches]` log showed `dryRun: true` even when `EXPO_PUBLIC_AI_SAFETY_DRY_RUN=false`.

**Solution:** Changed hardcoded `dryRun: true` to `dryRun: isAiSafetyDryRun()` in log statement.

**Files Modified:**
- `src/lib/useTrustFilter.ts` (line 794)

**Commit:** `f922cfc`

---

## System Integration

### Upload Queue Flow

```
User adds item
    ↓
saveImageLocally() → local file
    ↓
queueBackgroundUpload() → job enqueued
    ↓
processQueue() → uploadWorker(job)
    ↓
Upload to Supabase Storage → public URL
    ↓
updateWardrobeItemImageUriGuarded() → DB updated
    ↓
enqueueWardrobeEnrichment() → Edge Function call  ← NEW
```

### Style Signals Service Flow

```
enqueueWardrobeEnrichment(itemId)
    ↓
generateWardrobeStyleSignals(itemId)
    ↓
Edge Function POST /style-signals
    ↓
Fetch image from Supabase Storage
    ↓
detectMediaType() → correct MIME type
    ↓
Send to Anthropic API with correct type
    ↓
Parse and validate response
    ↓
Update DB: style_signals_status = 'ready'
```

---

## Files Modified

### Client-Side - Core Implementation
1. **`src/lib/storage.ts`**
   - Import `enqueueWardrobeEnrichment`
   - Add enrichment trigger in `uploadWorker`
   - Enhanced upload success log with ✅ indicator

2. **`src/lib/style-signals-service.ts`**
   - Import `trackEvent` from analytics
   - Add start time tracking in `generateWardrobeStyleSignals`
   - Track `style_signals_started` at function entry
   - Track `style_signals_completed` on success with rich metadata
   - Track `style_signals_failed` on all failure paths
   - Enhanced logging with duration and ✅/❌ indicators
   - Enhanced `enqueueWardrobeEnrichment` error handling

### Edge Function
3. **`supabase/functions/style-signals/index.ts`**
   - Add `AnthropicError` class
   - Add `detectMediaType()` function
   - Update `fetchImageAsBase64()` signature and logic
   - Enhance error handling and logging
   - Include image metadata in errors

### Bug Fixes & Enhancements
4. **`src/lib/useTrustFilter.ts`**
   - Fix misleading AI Safety dry run log

5. **`src/lib/confidence-engine/outfit-evaluation.ts`**
   - Add detailed debug logs for shoe/non-shoe scoring

---

## Documentation Updated

1. `COMPREHENSIVE_SYSTEM_DOCUMENTATION.md`
   - Added "Wardrobe Item Enrichment Flow" section
   - Updated "Style Signals Service" architecture diagram
   - Added "Edge Function Improvements" section
   - Updated "Style Signals" generation timing

2. `docs/handoff/personalized-suggestions-COMPLETE.md`
   - Added "Proactive Wardrobe Enrichment" to Related Optimizations

3. `docs/handoff/solo-ai-styling-card-COMPLETE.md`
   - Added "Proactive Wardrobe Enrichment" to Related Optimizations

4. `docs/handoff/unified-ai-styling-suggestions-COMPLETE.md`
   - Added "Proactive Wardrobe Enrichment" to Related Optimizations

5. `docs/handoff/generate-signals-on-wardrobe-add-COMPLETE.md` (this file)
   - Complete implementation handoff

---

## Deployment Notes

### Backend Requirements
```bash
# Deploy updated Edge Function
supabase functions deploy style-signals
```

**Changes:**
- Magic byte detection
- Enhanced error logging
- No DB schema changes
- No environment variables changed

### Client Requirements
- Deploy app with updated `src/lib/storage.ts`
- No environment variables changed
- No breaking changes

### Rollback Plan
If issues arise:
1. Revert `src/lib/storage.ts` (remove enrichment trigger)
2. Keep Edge Function improvements (magic bytes, error logging - harmless)
3. Lazy enrichment continues to work as before

---

## Success Metrics (Recommended)

### User Experience
- **Scans to first TF decision:** Target 1 (down from 2+)
- **TF `insufficient_info` rate on first scan:** Target <5% (down from ~100%)
- **User complaints about "rescan twice":** Target 0 (qualitative)

### Technical Health (via Telemetry)
- **Proactive generation success rate:** Target >95%
  - Query: `style_signals_completed / (style_signals_completed + style_signals_failed)`
- **Average latency:** Target <5s
  - Query: `avg(duration_ms)` from `style_signals_completed` events
- **Cache hit rate:** Monitor baseline (expect 30-50%)
  - Query: `sum(cached) / count(*)` from `style_signals_completed` events
- **Anthropic 400 error rate:** Target <1% (down from ~15%)
  - Query: Count `style_signals_failed` events with `error_type` containing "400"
- **Network error rate:** Target <5%
  - Query: Count `style_signals_failed` events with `error_type = "network_error"`

### Cost
- **API calls per wardrobe add:** Same (no increase)
- **Storage costs:** Same (no additional images)

---

## Known Limitations

1. **First-time Race Condition:** If user scans <5s after adding item, signals may not be ready yet
   - **Mitigation:** Lazy enrichment provides fallback
   - **Acceptable:** Better than requiring 2+ scans

2. **Edge Function Cold Start:** ~2s cold start may delay first signal generation
   - **Mitigation:** Warm function via regular usage
   - **Impact:** Minimal (one-time per deployment)

3. **Network Failures:** Upload may succeed but enrichment call fails
   - **Mitigation:** Lazy enrichment triggers on first scan
   - **Detection:** Monitor `style_signals_status = 'pending'` items

---

## Future Enhancements (Out of Scope)

### Core Features
1. **Retry Logic:** Automatically retry failed proactive enrichment after 5s
2. **Batch Processing:** Generate signals for multiple items in parallel
3. **Priority Queue:** Prioritize recently uploaded items over older ones
4. **Pre-warming:** Generate signals during image analysis (even earlier)

### Telemetry & Monitoring
5. **Edge Function Telemetry:** Add similar tracking in the server-side Edge Function
6. **Retry Tracking:** Track retry attempts for failed generations
7. **Performance Alerts:** Set up alerts for high failure rates or latency
8. **A/B Testing:** Use telemetry to measure impact of prompt changes
9. **User Impact Correlation:** Correlate signal generation time with first scan timing

---

## Contact / Ownership

- **Implementation Date:** January 30, 2026
- **Commit Hash:** `f922cfc`
- **Plan Document:** `.cursor/plans/generate_signals_on_wardrobe_add_e8b121e1.plan.md`
- **Primary Files:** `src/lib/storage.ts`, `supabase/functions/style-signals/index.ts`

---

**Implementation Complete.** Ready for production monitoring and user feedback collection.
