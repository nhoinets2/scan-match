# Claude Sonnet 4.5 Migration - COMPLETE

**Date:** January 30, 2026  
**Status:** Deployed to Production  
**Ticket/Issue:** Trust Filter timeout optimization + style interpretation improvements

---

## Summary

Migrated the `analyze-image` and `style-signals` Edge Functions from GPT-4o to Claude Sonnet 4.5 to:
1. **Solve Trust Filter timeout issues** (GPT-4o ~8s latency was causing TF to timeout at 10s)
2. **Improve style interpretation accuracy** (Claude's style classifications align better with user expectations)

---

## What Changed

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/analyze-image/index.ts` | Switched from OpenAI GPT-4o to Anthropic Claude Sonnet 4.5 |
| `supabase/functions/style-signals/index.ts` | Switched from OpenAI GPT-4o to Anthropic Claude Sonnet 4.5 |

### API Changes

| Before | After |
|--------|-------|
| `OPENAI_API_KEY` env var | `ANTHROPIC_API_KEY` env var |
| OpenAI `/v1/chat/completions` endpoint | Anthropic `/v1/messages` endpoint |
| `gpt-4o` model | `claude-sonnet-4-5-20250929` model |
| Image URL in request | Base64 image data in request |

### New Helper Functions Added

```typescript
// style-signals/index.ts
function parseImageDataUrl(imageDataUrl: string): { mediaType: string; data: string } | null
function arrayBufferToBase64(buffer: ArrayBuffer): string
async function fetchImageAsBase64(imageUrl: string): Promise<{ mediaType: string; data: string }>

// analyze-image/index.ts
function parseImageDataUrl(imageDataUrl: string): { mediaType: string; data: string } | null
```

---

## Why This Change

### Problem
- GPT-4o latency was ~8 seconds for image analysis
- Trust Filter has a 10-second timeout (`SIGNALS_TIMEOUT_MS`)
- Combined with network latency, TF was frequently timing out
- GPT-4o's style interpretations often needed manual corrections

### Solution Evaluation (Golden Set Testing)

Ran comprehensive comparisons using 39 golden set images:

#### style-signals Results

| Model | Latency | Critical TF Accuracy | Cost/1000 |
|-------|---------|---------------------|-----------|
| GPT-4o | ~8,000ms | Baseline (74% self-consistency) | $6.50 |
| **Claude Sonnet 4.5** | **4,286ms** | **85%** | $10.50 |

#### analyze-image Results

| Model | Latency | Category Accuracy | Style Interpretation |
|-------|---------|-------------------|---------------------|
| GPT-4o | 7,094ms | 97% | Needed manual corrections |
| **Claude Sonnet 4.5** | **6,320ms** | 97% | Aligns with user vision |

### Key Findings

1. **Claude is faster**: 4.3s vs 8s (style-signals), safely under 10s timeout
2. **Better style interpretation**: Claude's `style_family` classifications match user expectations without needing corrections (e.g., "utility jacket" = street, not classic)
3. **Same category accuracy**: 97% agreement on item categories
4. **Higher cost but worth it**: ~60% more expensive but solves timeout + improves quality

---

## Functions NOT Changed

| Function | Model | Reason |
|----------|-------|--------|
| `personalized-suggestions` | GPT-4o-mini | Already fast (~4s), format compliance good, cheapest option |
| `ai-safety-check` | GPT-4o | Faster than Claude (1.3s vs 2.2s), 100% verdict agreement |

---

## Environment Setup Required

Add to Supabase Edge Function secrets:
```bash
supabase secrets set ANTHROPIC_API_KEY=<your-anthropic-api-key>
```

The `OPENAI_API_KEY` can remain for other functions that still use it.

---

## Deployment Commands

```bash
supabase functions deploy analyze-image --no-verify-jwt
supabase functions deploy style-signals --no-verify-jwt
```

---

## Rollback Plan

If issues arise:
1. Revert changes in `analyze-image/index.ts` and `style-signals/index.ts` to use OpenAI
2. Redeploy functions
3. `OPENAI_API_KEY` is still in Supabase secrets

---

## Testing Scripts Created

During this work, several comparison scripts were created in `/scripts/`:

| Script | Purpose |
|--------|---------|
| `golden-set-gpt4o-comparison.ts` | Run GPT-4o on golden set (style-signals prompt) |
| `golden-set-claude-comparison.ts` | Run Claude on golden set (style-signals prompt) |
| `golden-set-gemini-comparison.ts` | Run Gemini on golden set (style-signals prompt) |
| `golden-set-analyze-image-comparison.ts` | Compare GPT-4o vs Claude for analyze-image prompt |
| `compare-personalized-suggestions.ts` | Compare models for personalized-suggestions |
| `compare-ai-safety-check.ts` | Compare models for ai-safety-check |

---

## Metrics to Monitor

After deployment, watch for:
- **Latency**: Should see ~4-6s for both functions (down from ~8s)
- **Error rates**: Should be unchanged or improved
- **TF timeout frequency**: Should be eliminated
- **User feedback on matching quality**: Style interpretations should feel more accurate

---

## Related Work

This migration builds upon the **Parallel Style Signals Optimization** which was implemented earlier:
- [Parallel Style Signals](./parallel-style-signals-COMPLETE.md) - Runs style signals in parallel with image analysis

Together, these optimizations reduced scan-to-results time:
- **Before both changes:** ~27 seconds (sequential flow, GPT-4o timeouts)
- **After parallel optimization:** ~17 seconds (parallel flow, but still GPT-4o)
- **After Claude migration:** ~12-15 seconds (parallel flow + faster Claude)

---

## Related Documentation

- [Trust Filter Architecture](../specs/trust-filter-v1.md)
- [Confidence Engine](../specs/confidence-engine.md)
- [Golden Set Baseline](../../test-assets/golden-set-baseline.json)
