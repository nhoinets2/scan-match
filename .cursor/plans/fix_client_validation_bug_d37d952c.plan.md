---
name: Fix Client Validation Bug
overview: Fix a critical bug where the client passes the entire API response object to validateAndRepairSuggestions instead of just the suggestions data, causing all AI suggestions to be replaced with fallback content.
todos:
  - id: fix-validation-input
    content: Fix validateAndRepairSuggestions to receive payload.data instead of payload
    status: completed
  - id: test-fix
    content: Test by rescanning brown leather jacket and verifying good AI content appears
    status: completed
isProject: false
---

# Fix Client Validation Bug

## Root Cause

The client receives a response like:

```json
{
  "ok": true,
  "data": { "why_it_works": [...], "to_elevate": [...] },
  "meta": {...}
}
```

But passes the entire object to `validateAndRepairSuggestions()`, which looks for `why_it_works` at the top level. Since it's nested under `data`, the function finds nothing and pads with fallback content.

## File to Modify

[src/lib/personalized-suggestions-service.ts](src/lib/personalized-suggestions-service.ts)

## Change

Around line 333-342, change from:

```typescript
const payload = await response.json();
const { suggestions, wasRepaired, removedCategories, mentionsStrippedCount } = validateAndRepairSuggestions(
  payload,  // BUG: wrong object
  validIds,
  mode,
  scanCategory ?? null,
  preferAddOnCategories,
  addOnCategories,
);
```

To:

```typescript
const payload = await response.json();

// Extract suggestions from response payload
// Edge function returns { ok, data, meta } structure
const rawSuggestions = payload?.data ?? payload;

const { suggestions, wasRepaired, removedCategories, mentionsStrippedCount } = validateAndRepairSuggestions(
  rawSuggestions,  // FIX: pass data.suggestions, not whole response
  validIds,
  mode,
  scanCategory ?? null,
  preferAddOnCategories,
  addOnCategories,
);
```

## Why This Fixes the Issue

1. The AI returns good content (confirmed in logs)
2. Edge function wraps it as `{ ok: true, data: suggestions, meta: {...} }`
3. Client now correctly extracts `payload.data` before validation
4. Validation sees the actual `why_it_works` and `to_elevate` arrays
5. Good AI content passes through instead of being replaced with fallbacks

## Verification

After fix:

1. Rescan brown leather jacket
2. Should see: "Layer over a graphic tee for an edgy, casual vibe"
3. Should see: "Consider adding fitted, solid tops" (not accessories)