# Empty State Messaging: Blocking vs Weak Slot Classification

This document describes how the app handles empty outfit states when users have wardrobe items that don't match a scanned item.

## Problem Statement

When a user scans an item (e.g., a sport top) and has wardrobe items that don't style-match, the previous implementation showed misleading messages like:

> "Add bottoms to put complete outfits together"

This was confusing because the user **has** bottoms—they just don't match the scanned item's style.

## Solution Overview

The app now distinguishes between three scenarios:

| Scenario | Description | Message Strategy |
|----------|-------------|------------------|
| **Missing Core** | User doesn't have items in a required category | "Add bottoms..." (actionable) |
| **Blocking** | User has items but 0 match (no candidates) | "None of your bottoms match..." |
| **Weak** | User has items with low-quality matches | Mentioned as "close" options |

---

## Slot Quality Classification

Each required outfit slot is classified into one of three quality levels:

```typescript
type SlotQuality = 'blocking' | 'weak' | 'confident';
```

### Classification Rules

| Quality | Condition | User Experience |
|---------|-----------|-----------------|
| **blocking** | 0 candidates | Cannot form outfits at all |
| **weak** | Has candidates but: `bestScore < 0.70` OR `mediumCount < 2` | Outfits possible but likely feel "off" |
| **confident** | `highCount > 0` OR (`bestScore >= 0.70` AND `mediumCount >= 2`) | Good matches available |

### Thresholds (Tunable)

```typescript
const WEAK_BEST_SCORE_THRESHOLD = 0.70;  // Below this = weak
const WEAK_MIN_MEDIUM_COUNT = 2;          // Only 1 MEDIUM option = weak
```

These can be adjusted based on real-world feedback via dev logs.

---

## Empty Reason Types

The `OutfitEmptyReasonDetails` type captures why outfits can't be formed:

```typescript
type OutfitEmptyReasonDetails =
  | { kind: 'missingCorePieces'; missing: { slot: string; category: string }[] }
  | { 
      kind: 'hasItemsButNoMatches';
      blockingCategories: string[];  // 0 candidates - true blockers
      weakCategories: string[];      // Has candidates but low quality
    }
  | { kind: 'missingHighTierCorePieces'; missing: { slot: string; category: string }[] }
  | { kind: 'hasCorePiecesButNoCombos' };
```

---

## Copy/Messaging

### Title
Always: **"No style matches found"**

### CTA
Always: **"Scan another item"** (items exist, don't blame inventory)

### Subtitle Patterns

#### Case A: Blocking Only (no weak slots)
```
None of your {blocking-or-list} match this item's style.
```

**Examples:**
- "None of your bottoms match this item's style."
- "None of your bottoms or shoes match this item's style."

#### Case B: Blocking + Weak
```
None of your {blocking-or-list} match this item's style. 
{Weak-and-list-cap} are close, but {blocking-and-list} are what's blocking outfits.
```

**Examples:**
- Single blocking + single weak:
  > "None of your bottoms match this item's style. Shoes are close, but bottoms are what's blocking outfits."

- Multiple blocking + single weak:
  > "None of your bottoms or tops match this item's style. Shoes are close, but bottoms and tops are what's blocking outfits."

- Single blocking + multiple weak:
  > "None of your bottoms match this item's style. Shoes and tops are close, but bottoms are what's blocking outfits."

### List Formatting Rules

| Context | Connector | Example |
|---------|-----------|---------|
| "None of your..." | OR | "bottoms or tops" |
| "...are close" | AND | "Shoes and tops" |
| "...are what's blocking" | AND | "bottoms and tops" |

---

## Case C: Only Weak (No Blockers)

This case **doesn't show an empty state** because:
- All required slots have candidates
- Combos CAN be formed and ARE displayed
- User sees outfit cards (even if matches are weak)

If this ever results in 0 outfits (due to later filtering), a dev warning fires.

---

## NEAR Matches in Worth Trying Tab

When `hasItemsButNoMatches` is triggered (blocking + optional weak), the **wardrobe section still shows the NEAR matches** that DID match:

```
┌─────────────────────────────────────────┐
│ Worth trying tab                        │
├─────────────────────────────────────────┤
│ Close matches from your wardrobe       │
│ ┌─────────────────────────────────────┐ │
│ │ 👟 White Sneakers (80% match)       │ │  ← NEAR match shown
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ No style matches found                  │
│ None of your bottoms match...           │  ← Empty outfit card
│ Shoes are close, but bottoms are...     │
│ [Scan another item]                     │
└─────────────────────────────────────────┘
```

This is controlled by tab-aware visibility logic in `results.tsx`:

```typescript
// For HIGH tab: show if showMatchesSection (from render model)
// For NEAR tab: show if there are nearMatchRows (even when showMatchesSection is false)
((isHighTab && showMatchesSection) || (!isHighTab && nearMatchRows.length > 0))
```

This ensures users see **what DID match** even when outfits can't be formed.

---

## Implementation Details

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/useResultsTabs.ts` | Core logic for slot classification and message building |
| `src/components/MissingPiecesCard.tsx` | UI component for empty state display |

### Key Functions

```typescript
// Classify a slot's quality based on candidates
function getSlotQuality(candidates: SlotCandidate[]): SlotQuality

// Check if wardrobe has items for a slot's category
function wardrobeHasSlotCategory(slot: string, counts: Map<string, number>): boolean

// Build the subtitle message
function buildMissingMessage(emptyReason: OutfitEmptyReasonDetails): string | null
```

### Category Mapping

The BOTTOM slot maps to multiple wardrobe categories:

```typescript
const SLOT_TO_WARDROBE_CATEGORY: Record<string, string[]> = {
  SHOES: ['shoes'],
  BOTTOM: ['bottoms', 'skirts'],  // Skirts count as "bottoms" for outfit purposes
  TOP: ['tops'],
  DRESS: ['dresses'],
};
```

---

## Dev Logging

### Classification Log
When `hasItemsButNoMatches` is computed:
```javascript
console.log('[useResultsTabs] hasItemsButNoMatches classification:', {
  blockingCategories,
  weakCategories,
  candidateDetails: { /* slot → count, quality, bestScore */ }
});
```

### Guardrail Warning (Case C2)
If all slots have candidates but 0 outfits shown (unexpected):
```javascript
console.warn('[useResultsTabs] Has NEAR matches but no NEAR outfits - unexpected state', {
  slotQualities: [{ slot, quality, count, bestScore }],
  blockingSlots,
  weakSlots,
  // ... coherence filter details
});
```

---

## Testing

### Test Coverage

| Test | Description |
|------|-------------|
| `getSlotQuality` classification | blocking/weak/confident rules |
| Missing core detection | wardrobeHasBottoms=false → missingCorePieces |
| Blocking only | bottoms=0, shoes confident → blocking=[bottoms], weak=[] |
| Blocking + weak | bottoms=0, shoes weak → correct subtitle |
| Category mapping | BOTTOM maps to bottoms/skirts |
| Pluralization | OR vs AND list formatting |
| Dev log safety | Doesn't crash when bestScore=null |

### Running Tests
```bash
npm test -- src/lib/__tests__/useResultsTabs.test.ts --no-coverage
```

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Scans Item                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Confidence Engine Evaluates Pairs                   │
│         (Returns HIGH/MEDIUM/LOW matches per wardrobe item)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Combo Assembler Builds Candidates                   │
│                  (Groups by slot: TOP, BOTTOM, SHOES)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│         For each required slot with 0 candidates:                │
│                                                                  │
│   ┌─────────────────────────┐    ┌─────────────────────────┐    │
│   │  Wardrobe has items?    │    │  Wardrobe has items?    │    │
│   │         NO              │    │         YES             │    │
│   │           │             │    │           │             │    │
│   │           ▼             │    │           ▼             │    │
│   │   missingCorePieces     │    │   hasItemsButNoMatches  │    │
│   │   "Add bottoms..."      │    │   "None match..."       │    │
│   └─────────────────────────┘    └─────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│        For non-blocking slots, classify quality:                 │
│                                                                  │
│   candidates=0  →  blocking (already handled)                    │
│   HIGH > 0      →  confident                                     │
│   score < 0.70  →  weak                                          │
│   MEDIUM < 2    →  weak                                          │
│   else          →  confident                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Build Message Based on Classification               │
│                                                                  │
│   blocking only  → Case A subtitle                               │
│   blocking+weak  → Case B subtitle (mentions weak as "close")    │
│   weak only      → Show outfits (no empty state)                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Future Considerations

1. **Threshold Tuning**: Monitor dev logs to adjust `WEAK_BEST_SCORE_THRESHOLD` and `WEAK_MIN_MEDIUM_COUNT` based on real user feedback.

2. **Case C Enhancement**: If users complain about "weak" outfit quality, consider adding a subtle quality indicator on outfit cards.

3. **Analytics**: Track frequency of each empty state type to understand user wardrobe gaps.

