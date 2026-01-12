# Image Analysis Caching

## Overview

This document describes the image analysis caching system implemented to improve consistency and reduce API costs when scanning clothing items.

## Problem Statement

Users reported inconsistent results when scanning the same item multiple times:
- Same clothing item would sometimes get different AI analysis results
- Different analysis → different confidence scores → different match results
- This created confusion and undermined trust in the matching system

### Root Causes Identified

1. **AI Model Non-Determinism**: Even with `temperature: 0`, vision models can produce slightly different outputs for the same image
2. **Image Variations**: Different photos of the same item have different bytes → always treated as new scans
3. **Confidence Engine Sensitivity**: Small changes in AI signals (e.g., formality level 3 vs 4) could flip match outcomes

---

## ⚠️ Lessons Learned: What NOT to Do

We initially tried to solve the inconsistency problem by adding complexity to the **scoring logic**:

### Attempted Fix (Reverted)
- Penalty-based formality tension (soft: -0.05, hard: -0.12)
- Mode B only triggers on "hard" tension (3+ level gap)
- Complex trigger logic checking top 3 near matches

### Why It Failed
**We were treating the symptom, not the disease.**

```
Same image, different scans:
  Scan 1: AI says formality = 2 → score 0.97 → HIGH ✓
  Scan 2: AI says formality = 4 → score 0.82 - 0.05 = 0.77 → MEDIUM ✗
```

The penalties just shifted the threshold where the flip happened. They didn't prevent the flip.

### The Real Fix
**Stabilize the INPUT, not the output.**

| Approach | Effectiveness |
|----------|---------------|
| Image caching (same bytes → same result) | ✅ Actually works |
| Formality bucketing (5 levels → 3) | ✅ Reduces sensitivity |
| Confidence thresholds (ignore low-confidence signals) | ✅ Avoids noise |
| Score penalties/adjustments | ❌ Over-engineered, doesn't solve root cause |

**Current status**: Simple cap behavior restored. FORMALITY_TENSION → caps to MEDIUM. Predictable, debuggable, honest about the tension.

---

## Solution: Content-Addressed Caching

We implemented a **backend cache** that ensures:
- **Same image bytes → Same analysis** (deterministic)
- **Automatic invalidation** when prompt/model changes
- **Cross-device consistency** (cached in Supabase, not local storage)

### Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Scan Image │ ──▶ │  SHA-256     │ ──▶ │ Cache Key   │
│  (bytes)    │     │  Hash        │     │ Lookup      │
└─────────────┘     └──────────────┘     └──────────────┘
                                                │
                         ┌──────────────────────┴──────────────────────┐
                         ▼                                             ▼
                  ┌─────────────┐                              ┌─────────────┐
                  │ Cache HIT   │                              │ Cache MISS  │
                  │ Return      │                              │ Call OpenAI │
                  │ cached JSON │                              │ Store result│
                  └─────────────┘                              └─────────────┘
```

### Cache Key Format

```
v{version}:{model}:{promptVersion}:{imageSha256}

Example: v1:gpt-5.1:2026-01-05:5d74bd8c9f2a...
```

This format ensures **automatic cache invalidation** when:
- `ANALYSIS_CACHE_VERSION` is bumped (cache format changes)
- `ANALYSIS_MODEL` changes (different AI model)
- `PROMPT_VERSION` is bumped (prompt/schema changes)

### Database Schema

```sql
create table clothing_image_analysis_cache (
  analysis_key text primary key,        -- v1:model:prompt:sha256
  image_sha256 text not null,           -- Just hash, no image stored
  model text not null,
  prompt_version text not null,
  analysis jsonb not null,              -- Full ClothingAnalysisResult
  created_at timestamptz default now(),
  hit_count integer default 0,
  last_hit_at timestamptz
);
```

### Implementation Files

| File | Purpose |
|------|---------|
| `src/lib/analysis-cache.ts` | Cache utilities (hash, key generation, get/set) |
| `src/lib/openai.ts` | Integration with `analyzeClothingImage()` |
| `src/lib/__tests__/analysis-cache.test.ts` | Unit tests for determinism |

### Key Functions

```typescript
// Compute SHA-256 hash using expo-crypto
sha256Hex(data: string): Promise<string>

// Generate versioned cache key
generateCacheKey(imageSha256: string): string

// Cache operations
getCachedAnalysis(key: string): Promise<ClothingAnalysisResult | null>
setCachedAnalysis(params): Promise<boolean>
```

## What This Solves

| Scenario | Before | After |
|----------|--------|-------|
| Re-scan same photo from gallery | Different results possible | **Identical results guaranteed** |
| Revisit previous scan | May differ from original | **Same as original** |
| App retry after network error | Could get different analysis | **Same analysis** |
| Multiple devices, same photo | Could differ | **Same (backend cache)** |

## What This Does NOT Solve

| Scenario | Behavior | Why |
|----------|----------|-----|
| New photo of same item | New analysis | Different bytes = different hash |
| Same item, different angle | New analysis | Different image content |
| Same item, different lighting | New analysis | Pixels differ |

This is **by design** — the cache ensures consistency for the *exact same image*, not for the same physical item.

---

## Future Improvements

If users continue to report inconsistent results for the "same item" (meaning same physical garment photographed multiple times), consider these enhancements:

### Phase 2: Perceptual Hashing (pHash)

**Problem**: Users expect "same shirt" to give same results, but different photos have different SHA-256 hashes.

**Solution**: Add perceptual hashing that identifies visually similar images.

```typescript
// Pseudocode
const contentHash = await sha256Hex(imageData);     // Exact match
const perceptualHash = await computePHash(imageData); // Visual similarity

// Try exact match first, then perceptual
const cached = await getCachedAnalysis(contentHash)
  ?? await getSimilarAnalysis(perceptualHash, threshold: 0.95);
```

**Implementation Options**:
- `blurhash` - Compact visual fingerprint
- `phash` - Perceptual hash algorithm
- Custom CNN embeddings - Most accurate but requires ML infrastructure

**Tradeoffs**:
- ✅ Same shirt, different photo → Same results
- ⚠️ Slightly different items might match incorrectly
- ⚠️ Requires tuning similarity threshold

### Phase 3: Item-Level Caching

**Problem**: Even with pHash, users might want "this specific wardrobe item always analyzed the same way."

**Solution**: Allow users to "lock" analysis for wardrobe items.

```typescript
// When adding to wardrobe, store the canonical analysis
wardrobeItem.locked_analysis = analysisResult;

// When scanning, check if item matches a wardrobe item
const matchingWardrobeItem = await findSimilarWardrobeItem(imageHash);
if (matchingWardrobeItem?.locked_analysis) {
  return matchingWardrobeItem.locked_analysis;
}
```

**UX Flow**:
1. User adds item to wardrobe
2. System stores analysis as "canonical" for that item
3. Future scans of similar images use the locked analysis
4. User can "re-analyze" to update if needed

### Phase 4: Confidence Engine Stabilization

**Problem**: Even with identical AI analysis, small signal variations cause different match outcomes.

**Attempted Solution (Reverted)**:
We tried implementing a penalty-based formality tension system:
- Soft tension (2-level gap): -0.05 penalty
- Hard tension (3+ level gap): -0.12 penalty
- Mode B only triggered on "hard" tension

**Why It Didn't Work**:
> We were treating the symptom, not the disease.

The penalties just shifted the problem around:
- A 0.97 score with soft penalty → 0.92 (still HIGH) ✓
- A 0.82 score with soft penalty → 0.77 (now MEDIUM) ✗

**If the AI gives inconsistent input, no amount of downstream math gymnastics will make the output consistent.**

The fix added complexity without solving the root cause (AI formality detection variability).

**What Would Actually Fix It**:
1. **Image caching** (Phase 1, implemented) - same image hash = same AI result, guaranteed
2. **Formality bucketing** - collapse 5 levels to 3 (casual/smart/formal) to reduce sensitivity
3. **Confidence thresholds** - only trust AI formality when it's confident

**Current Status**:
- ❌ Formality penalty approach (reverted - over-engineered, didn't solve root cause)
- ✅ Simple cap behavior restored (FORMALITY_TENSION caps to MEDIUM)
- 🔄 Focus should be on input stabilization (caching, bucketing) not output manipulation

**Future Enhancements** (if needed):
- Hysteresis in tier boundaries (prevent flip-flopping at edges)
- Signal quantization (round formality to nearest level)
- Match result caching (cache wardrobe×scannedItem pairs)

---

## Telemetry

The cache logs telemetry for monitoring:

```typescript
interface AnalysisCacheTelemetry {
  scan_session_id?: string;
  cache_hit: boolean;
  analysis_key_version: string;
  model: string;
  prompt_version: string;
  image_sha256_prefix?: string; // First 8 chars
}
```

**Key Metrics to Track**:
- Cache hit rate (should increase over time)
- API cost savings (hits × avg API cost)
- User reports of inconsistency (should decrease)

---

## Maintenance

### Bumping Prompt Version

When you change the AI prompt or expected schema:

```typescript
// src/lib/analysis-cache.ts
export const PROMPT_VERSION = '2026-01-06'; // ← Bump this
```

All old cache entries become orphaned (different key prefix), and new scans get fresh analysis.

### Cache Cleanup (Optional)

Old entries can be cleaned up periodically:

```sql
-- Delete entries older than 90 days with no hits
DELETE FROM clothing_image_analysis_cache
WHERE created_at < now() - interval '90 days'
  AND hit_count = 0;
```

### Monitoring Cache Size

```sql
-- Check cache stats
SELECT 
  COUNT(*) as total_entries,
  SUM(hit_count) as total_hits,
  pg_size_pretty(pg_total_relation_size('clothing_image_analysis_cache')) as table_size
FROM clothing_image_analysis_cache;
```

---

## Testing

Unit tests verify cache key determinism:

```bash
npm test -- --testPathPatterns="analysis-cache"
```

**Key Test Cases**:
- Same input → Same hash (determinism)
- Different input → Different hash
- Changing version/model/prompt → Changes key (invalidation)

---

## Summary

| Layer | Status | What It Ensures |
|-------|--------|-----------------|
| **Image Cache** | ✅ Implemented | Same bytes → Same AI analysis |
| **Formality Penalty** | ❌ Reverted | ~~Consistent scoring without hard caps~~ (didn't work) |
| **Formality Bucketing** | 🔜 Recommended | Reduce sensitivity by collapsing 5→3 levels |
| **pHash** | 🔜 Future | Same visual appearance → Same analysis |
| **Item Lock** | 🔜 Future | Same wardrobe item → Same analysis |

### Key Lesson Learned

**Don't try to stabilize outputs when the problem is unstable inputs.**

The formality penalty approach was over-engineered complexity that didn't solve the fundamental issue: AI vision models return different formality levels for the same item on different scans. The right approach is:

1. **Cache identical images** (done) - eliminates variability for exact re-scans
2. **Reduce input sensitivity** (next) - bucket formality to fewer levels
3. **Let simple logic stay simple** - FORMALITY_TENSION → MEDIUM cap is predictable and debuggable

The current implementation solves the immediate consistency problem for exact image matches. Future phases should focus on **input stabilization** (caching, bucketing) rather than output manipulation.

---

## Appendix: Image Preprocessing Pipeline (Future)

If users report issues with background interference or wrong items being analyzed, consider implementing a preprocessing pipeline.

### Decision Framework

| Your Situation | Recommendation |
|----------------|----------------|
| Results are good, no complaints | **Stay with current approach** |
| Occasional background confusion | **Downscale + prompt enhancement (Option B)** |
| Frequent wrong-item detection | **Implement two-stage pipeline (Option C)** |
| Need fastest possible UX | **On-device ML (significant investment)** |

**Recommended order**: Measure → Prompt → Pipeline only if needed.

### Option B: Downscale + Prompt Enhancement (Quick Win)

Before adding complexity, try these low-effort improvements:

**1. Downscale images before sending** (reduces cost + latency):
```typescript
import * as ImageManipulator from 'expo-image-manipulator';

async function downscaleForAnalysis(imageUri: string, maxEdge = 1024): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: maxEdge } }], // Maintains aspect ratio
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}
```

**2. Strengthen the prompt**:
```typescript
const prompt = `
Focus ONLY on the single clothing item that is the main subject of this photo.
Ignore any background objects, furniture, hangers, mannequins, or other items.
If multiple clothing items are visible, analyze only the most prominent one in the center.
...
`;
```

### Option C: Two-Stage Pipeline with Cropping

> ⚠️ **Important Notes:**
> - Use "vision-capable analysis model" — don't hardcode model names (they change)
> - LLM bounding boxes are hints, not guarantees — always have a fallback
> - `expo-image-manipulator` expects **pixel coordinates**, not normalized 0-1 values

**Architecture:**
```
[Original Image]
       ↓
[Downscale to 1024px] (save original for debugging)
       ↓
[Stage 1: Bbox detection] → [Validate bbox] → [Fallback to full image if suspicious]
       ↓
[Crop with 15% padding]
       ↓
[Stage 2: Full analysis] → [Cache]
```

**Implementation:**

```typescript
// src/lib/image-preprocessing.ts

import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

// Bounding box in normalized coordinates (0-1)
interface NormalizedBBox {
  x: number;      // 0-1
  y: number;      // 0-1
  width: number;  // 0-1
  height: number; // 0-1
  confidence?: number;
}

/**
 * Get image dimensions (needed for normalized → pixel conversion)
 */
function getImageSize(uri: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (w, h) => resolve({ w, h }),
      (e) => reject(e)
    );
  });
}

/**
 * Validate bounding box looks reasonable
 */
function isBBoxSuspicious(bbox: NormalizedBBox): boolean {
  // Too small (< 10% of image)
  if (bbox.width < 0.1 || bbox.height < 0.1) return true;
  
  // Too large (> 95% of image) - probably failed detection
  if (bbox.width > 0.95 && bbox.height > 0.95) return true;
  
  // Off-image coordinates
  if (bbox.x < 0 || bbox.y < 0 || bbox.x + bbox.width > 1 || bbox.y + bbox.height > 1) return true;
  
  // Low confidence (if provided)
  if (bbox.confidence !== undefined && bbox.confidence < 0.5) return true;
  
  return false;
}

/**
 * Crop image with padding around bounding box
 * 
 * IMPORTANT: expo-image-manipulator expects PIXEL coordinates, not normalized!
 */
export async function cropWithPadding(
  imageUri: string,
  bbox: NormalizedBBox,
  paddingPercent = 0.15
): Promise<string> {
  const { w, h } = await getImageSize(imageUri);

  // Add padding (don't crop too tight - preserve sleeves/straps)
  const padX = bbox.width * paddingPercent;
  const padY = bbox.height * paddingPercent;

  // Calculate normalized coordinates with padding, clamped to 0-1
  const nx = Math.max(0, bbox.x - padX);
  const ny = Math.max(0, bbox.y - padY);
  const nW = Math.min(1 - nx, bbox.width + 2 * padX);
  const nH = Math.min(1 - ny, bbox.height + 2 * padY);

  // Convert normalized → pixel coordinates
  const originX = Math.round(nx * w);
  const originY = Math.round(ny * h);
  const width = Math.round(nW * w);
  const height = Math.round(nH * h);

  const result = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ crop: { originX, originY, width, height } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
  );

  return result.uri;
}

/**
 * Detect main clothing item bounding box using quick API call
 * 
 * NOTE: LLM bboxes are hints, not guarantees. Always validate + fallback.
 */
async function detectClothingBBox(dataUrl: string): Promise<NormalizedBBox | null> {
  try {
    // Use a cheaper/faster model for detection only
    // Model name may change - check OpenAI docs for current recommendations
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Cheaper, faster - update as models change
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Return ONLY a JSON object with the bounding box of the main clothing item in this image.
Format: {"x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0, "confidence": 0.0-1.0}
- x, y are the top-left corner (normalized 0-1)
- width, height are the box dimensions (normalized 0-1)
- confidence is how certain you are (0-1)
If no clear single clothing item is visible, return {"confidence": 0}`
            },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }],
        max_tokens: 100,
        temperature: 0
      })
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    const bbox = JSON.parse(text) as NormalizedBBox;
    
    return bbox;
  } catch (err) {
    console.log('[BBoxDetection] Failed:', err);
    return null;
  }
}

/**
 * Main preprocessing pipeline
 */
export async function preprocessImageForAnalysis(
  imageUri: string,
  options?: { skipCropping?: boolean; maxEdge?: number }
): Promise<string> {
  const { skipCropping = false, maxEdge = 1024 } = options ?? {};
  
  // Step 1: Always downscale (cheap win)
  const downscaled = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: maxEdge } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
  );
  
  if (skipCropping) {
    return downscaled.uri;
  }
  
  // Step 2: Detect bounding box
  const dataUrl = await getImageDataUrl(downscaled.uri);
  const bbox = await detectClothingBBox(dataUrl);
  
  // Step 3: Validate bbox - fallback to full image if suspicious
  if (!bbox || isBBoxSuspicious(bbox)) {
    console.log('[Preprocessing] Bbox suspicious or missing, using full image');
    return downscaled.uri; // Fallback to downscaled full image
  }
  
  // Step 4: Crop with padding
  console.log('[Preprocessing] Cropping with bbox:', bbox);
  return cropWithPadding(downscaled.uri, bbox, 0.15);
}
```

### Telemetry to Add Now

Even before implementing cropping, add telemetry to measure if it's needed:

```typescript
// In your analysis logging
interface AnalysisTelemetry {
  image_width: number;
  image_height: number;
  analysis_context_sufficient: boolean;
  // Future: user_reported_wrong_item?: boolean;
  // Future: bbox_used?: boolean;
  // Future: bbox_confidence?: number;
}
```

### When to Escalate to On-Device ML

If two-stage API pipeline still has issues:
- Detection latency too high
- API costs becoming significant
- Need offline capability

Consider on-device options:
- **ML Kit** (Android/iOS) - clothing detection
- **CoreML** (iOS) - custom model
- **ONNX Runtime** - cross-platform

This is a significant investment — only pursue if data shows it's necessary.

