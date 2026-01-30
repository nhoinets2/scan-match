---
name: Fix Solo Mode AI Suggestions
overview: Fix solo mode AI suggestions to provide item-specific styling advice and prioritize core outfit-forming pieces over accessories. Address duplicate content and improve prompt context.
todos:
  - id: update-solo-prompt-signature
    content: Add scannedCategory parameter to buildSoloPrompt() function signature
    status: pending
  - id: update-solo-prompt-context
    content: Add scanned_item category to CONTEXT section and update why_it_works examples
    status: pending
  - id: add-core-pieces-rules
    content: Add rules 8-9 to prioritize core outfit-forming pieces in to_elevate recommendations
    status: pending
  - id: pass-category-to-prompt
    content: Update solo mode case to pass scan_category to buildSoloPrompt()
    status: pending
isProject: false
---

# Fix Solo Mode AI Suggestions Quality

## Impact on Paired Mode: NONE

**Q: Will this affect paired mode AI suggestions?**

**A: NO.** The changes only modify `buildSoloPrompt()`, which is a separate function from `buildPrompt()` used by paired mode.

**Paired mode add-ons integration is preserved:**

- When HIGH tab has 2+ add-on matches (outerwear, bags, accessories), `preferAddOnCategories = true`
- AI suggestions filtered to ONLY add-on categories intentionally
- Solo mode uses `preferAddOnCategories = false` → different fallback path
- Both flows remain independent

---

## Problem

Solo mode AI suggestions for scanned items (e.g., brown leather jacket) have:

- Identical duplicate text in "How to style it" section
- Only accessories/bags recommended in "What to add first" (missing core pieces like tops, bottoms, shoes)
- Generic advice that doesn't relate to the specific scanned item

## Root Causes

1. **`buildSoloPrompt()` lacks scanned item context** ([supabase/functions/personalized-suggestions/index.ts:187-224](supabase/functions/personalized-suggestions/index.ts))

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Only sends style signals, not the actual item category/description
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - AI doesn't know what item it's styling (e.g., "brown leather jacket" vs "summer dress")

2. **No guidance to prioritize core pieces**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Prompt doesn't tell AI to focus on outfit-forming pieces (tops, bottoms, shoes, dresses) before accessories
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - For outerwear: need tops, bottoms, shoes to complete the look

## Why Not Change Paired Mode?

**Paired mode has sophisticated add-ons integration** ([src/lib/personalized-suggestions-service.ts:610-702](src/lib/personalized-suggestions-service.ts)):

When user scans an item and has 2+ add-on matches (e.g., sneakers + leather jacket):

- System sets `preferAddOnCategories = true`
- AI suggestions filtered to ONLY add-on categories (bags, accessories)
- Fallbacks also use add-on order
- **This is intentional** - avoids suggesting core pieces when outfit already has add-ons

Example:

```
Scanned: Summer dress
HIGH matches: White sneakers (shoes), Leather jacket (outerwear)
→ preferAddOnCategories = true
→ Suggestions: "structured handbag", "simple belt" (NOT tops/bottoms)
```

**Solo mode doesn't use `preferAddOnCategories`** → will use core pieces fallback order automatically.

## Solution (Solo Mode Only)

### 1. Update `buildSoloPrompt()` to include scanned item context

**File:** [supabase/functions/personalized-suggestions/index.ts](supabase/functions/personalized-suggestions/index.ts)

**Add parameters:**

```typescript
function buildSoloPrompt(
  scanSignals: StyleSignalsV1,
  scannedCategory: Category,  // NEW: e.g., "outerwear", "dresses"
  wardrobeSummary: WardrobeSummary,
  intent: 'shopping' | 'own_item'
): string
```

**Update CONTEXT section:**

```typescript
CONTEXT:
intent:${intent}
scanned_item:category=${scannedCategory}  // NEW: tells AI what item user scanned
scan:${scanSummary}
wardrobe:${wardrobeOverview}
matches:[] (solo mode - no pairings)
```

**Update "why_it_works" guidance** (now "How to style it"):

```typescript
{
  "why_it_works": [
    { "text": "specific styling tip for this ${scannedCategory}", "mentions": [] },
    { "text": "complementary styling approach for this item", "mentions": [] }
  ],
```

**Add core pieces prioritization** for "to_elevate":

```typescript
STRICT RULES (must follow):
...
7. Focus on how to style THIS ${scannedCategory}, not generic advice
8. For "to_elevate": PRIORITIZE core outfit-forming pieces first:
   - If scanned item is outerwear/accessories: suggest tops, bottoms, shoes, dresses
   - If scanned item is tops/bottoms/shoes: suggest complementary core pieces to complete outfit
   - Only suggest accessories AFTER core pieces are covered
9. "category" in to_elevate should be core pieces (tops, bottoms, shoes, dresses) NOT accessories/bags/outerwear
```

### 2. ~~Update fallback~~ SKIP - Paired Mode Uses It for Add-Ons

**Discovery:** The `FALLBACK_TO_ELEVATE_CONSIDER_ADDING` with `accessories` is INTENTIONAL for paired mode's add-ons preference feature.

When `preferAddOnCategories = true` (HIGH tab with 2+ add-ons), the system:

- Filters suggestions to ONLY add-on categories
- Uses add-on fallback order
- This avoids suggesting core pieces when outfit already has add-ons

**For solo mode:** The client-side fallback logic uses `FALLBACK_ELEVATE_ORDER` when `preferAddOnCategories = false`, which already prioritizes core pieces.

**Conclusion:** Don't change the edge function fallback. Fix the root cause (AI prompt context instead.

### 3. Pass scannedCategory to buildSoloPrompt

**File:** [supabase/functions/personalized-suggestions/index.ts:656-658](supabase/functions/personalized-suggestions/index.ts)

**Update call site:**

```typescript
case 'solo':
  prompt = buildSoloPrompt(
    scan_signals, 
    scan_category as Category,  // NEW: pass scanned item category
    safeWardrobeSummary, 
    intent ?? 'own_item'
  );
  break;
```

**Note:** `scan_category` is already in the request interface from Agent B work, so no schema changes needed.

## Expected Outcomes

### Before (Current)

**"How to style it":**

- "The colors and styles complement each other well"
- "The colors and styles complement each other well" (duplicate)

**"What to add first":**

- Consider adding: simple, neutral accessories
- Consider adding: complementary bags

### After (Fixed)

**"How to style it":**

- "Layer over graphic tees or fitted tops for casual edge"
- "Roll sleeves and pair with high-waisted bottoms for proportions"

**"What to add first":**

- Consider adding: slim-fit black tops
- Consider adding: high-waisted dark jeans

## Testing

1. Scan brown leather jacket with empty wardrobe (solo mode)
2. Verify "How to style it" has unique, item-specific styling tips
3. Verify "What to add first" recommends core pieces (tops, bottoms, shoes) not accessories
4. Test with other categories (dresses, shoes, bags) to ensure guidance adapts

## Files to Modify

- [supabase/functions/personalized-suggestions/index.ts](supabase/functions/personalized-suggestions/index.ts)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Update `buildSoloPrompt()` signature and body (lines 187-224)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Update solo mode call site (line 657)

**Not changing:**

- `FALLBACK_TO_ELEVATE_CONSIDER_ADDING` - used by paired mode add-ons feature, must stay as `accessories`