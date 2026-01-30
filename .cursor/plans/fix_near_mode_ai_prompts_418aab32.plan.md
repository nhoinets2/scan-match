---
name: Fix AI prompts and NEAR add-ons
overview: Add scanned item category context to PAIRED and NEAR prompts so AI connects explanations to the scanned item. Remove confusing add-ons display from NEAR tab.
todos:
  - id: remove-near-addons-ui
    content: Remove add-ons display from NEAR tab (keep only on HIGH tab)
    status: completed
  - id: fix-paired-prompt
    content: Add scanCategory param and "connect to scanned item" rules to buildPrompt() (PAIRED mode)
    status: completed
  - id: fix-near-prompt
    content: Add scanCategory param and "connect to scanned item" rules to buildNearPrompt() (NEAR mode)
    status: completed
  - id: update-callers
    content: Update callers of buildPrompt() and buildNearPrompt() to pass scan_category
    status: completed
isProject: false
---

# Fix AI Prompts and Remove NEAR Tab Add-ons

## Problem 1: AI Doesn't Know What Was Scanned

When a user scans an item (e.g., white cowboy boots), the AI provides generic descriptions because it doesn't know the scanned item's category.

**Example (NEAR mode):**

- User scans: **white cowboy boots**
- AI says: "The soft white dress offers a clean base for bold accessories"
- Problem: No mention of **boots/shoes** - AI doesn't know what was scanned

## Problem 2: NEAR Tab Add-ons Are Confusing

NEAR tab shows add-ons that are a superset of HIGH tab (HIGH + MEDIUM tier). This is confusing because:

- NEAR = "Worth trying" = uncertain outfit
- Showing add-ons for an uncertain outfit doesn't make sense
- User should focus on MAKING the outfit work, not accessorizing it

## Solution

### Part 1: Remove Add-ons from NEAR Tab (UI)

**File:** [src/app/results.tsx](src/app/results.tsx)

Currently, add-ons ARE displayed on NEAR tab:

```typescript
// Line 5042 - Add-ons strip
const addOnsWithTier = isHighTab ? highAddOns : nearAddOns;

// Line 5616 - Add-ons bottom sheet
const addOnsWithTier = isHighTab ? highAddOns : nearAddOns;
```

**Fix:** Only show add-ons on HIGH tab.

**Change 1 (line ~5041):** Add early return for NEAR tab in the add-ons strip section:

```typescript
{(() => {
  // Only show add-ons strip on HIGH tab
  if (!isHighTab) return null;
  
  const addOns = highAddOns.map(item => ({
    // ... rest of mapping
  }));
  // ... rest of component
})()}
```

**Change 2 (line ~5615):** Add early return for NEAR tab in the add-ons bottom sheet:

```typescript
{(() => {
  // Only show add-ons bottom sheet on HIGH tab
  if (!isHighTab) return null;
  
  const addOns = highAddOns.map(item => ({
    // ... rest of mapping
  }));
  // ... rest of component
})()}
```

**Optional cleanup:** Remove `nearAddOns` useMemo (lines 3411-3463) since it will no longer be used.

### Part 2: Add Scanned Item Category to Prompts

**File:** [supabase/functions/personalized-suggestions/index.ts](supabase/functions/personalized-suggestions/index.ts)

#### PAIRED Mode (`buildPrompt`, lines 141-187)

**1. Add parameter:**

```typescript
function buildPrompt(
  scanSignals: StyleSignalsV1,
  scanCategory: string,  // ADD THIS
  topMatches: SafeMatchInfo[],
  wardrobeSummary: WardrobeSummary,
  intent: 'shopping' | 'own_item'
): string {
```

**2. Update CONTEXT:**

```
CONTEXT:
intent:${intent}
scanned_item:category=${scanCategory}  // ADD THIS
scan:${scanSummary}
matches:${matchesSummary}
wardrobe:${wardrobeOverview}
```

**3. Add STRICT RULES (after rule 8):**

```
9. Always connect explanations to the scanned ${scanCategory} - explain how wardrobe items PAIR with it
10. When explaining "why_it_works", describe the relationship between the wardrobe item and the scanned ${scanCategory}
```

#### NEAR Mode (`buildNearPrompt`, lines 240-293)

**1. Add parameter:**

```typescript
function buildNearPrompt(
  scanSignals: StyleSignalsV1,
  scanCategory: string,  // ADD THIS
  nearMatches: SafeNearMatchInfo[],
  wardrobeSummary: WardrobeSummary,
  intent: 'shopping' | 'own_item'
): string {
```

**2. Update CONTEXT:**

```
CONTEXT:
intent:${intent}
scanned_item:category=${scanCategory}  // ADD THIS
scan:${scanSummary}
near_matches:${matchesSummary}
wardrobe:${wardrobeOverview}
note: These items are CLOSE matches but not perfect. Focus on HOW to make them work.
```

**3. Update OUTPUT FORMAT example:**

```json
{
  "why_it_works": [
    { "text": "why this wardrobe item could pair with the scanned ${scanCategory}", "mentions": ["ITEM_ID"] }
  ],
  "to_elevate": [
    { "text": "styling tip for wearing the ${scanCategory} with these items", "recommend": {...} }
  ]
}
```

**4. Add STRICT RULES (after rule 8):**

```
9. Always connect explanations to the scanned ${scanCategory} - don't describe wardrobe items in isolation
10. For "why_it_works": explain why the wardrobe item could work WITH the scanned ${scanCategory}
11. For "to_elevate": provide styling tips specific to pairing the ${scanCategory} with the near match items
```

### Part 3: Update Callers

**File:** [supabase/functions/personalized-suggestions/index.ts](supabase/functions/personalized-suggestions/index.ts)

Update both function calls (around lines 671 and 679):

```typescript
// NEAR mode (~line 671)
prompt = buildNearPrompt(scan_signals, safeScanCategory, safeNearMatches, safeWardrobeSummary, intent ?? 'own_item');

// PAIRED mode (~line 679)
prompt = buildPrompt(scan_signals, safeScanCategory, safeTopMatches, safeWardrobeSummary, intent ?? 'own_item');
```

## Expected Results

### PAIRED Mode (scanned boots, HIGH match is a dress)

**Before:**

- "The soft white dress offers a clean base for bold accessories"

**After:**

- "The white dress's flowing silhouette balances the boldness of statement boots"

### NEAR Mode (scanned boots, NEAR match is a dress)

**Before:**

- why_it_works: "The soft white dress offers a clean base for bold accessories"
- to_elevate: "Add a statement belt to define the waist"

**After:**

- why_it_works: "The white dress's clean silhouette could complement bold statement footwear with styling adjustments"
- to_elevate: "Tuck the dress slightly at the waist to balance the visual weight of the boots"

## Summary

| Change | Location | Description |

|--------|----------|-------------|

| Remove NEAR add-ons | UI (results.tsx) | Don't show add-ons on NEAR tab |

| Add scan category | PAIRED prompt | AI knows what was scanned |

| Add scan category | NEAR prompt | AI knows what was scanned |

| Connect to scanned item | Both prompts | AI explains pairing, not standalone items |