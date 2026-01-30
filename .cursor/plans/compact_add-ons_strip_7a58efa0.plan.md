---
name: Compact Add-ons Strip
overview: Redesign the Optional Add-ons section on HIGH tab to be a compact, AI-connected strip that collapses 3 category rows into a single "Finish the look" strip with max 6 thumbnails, expandable via bottom sheet, with score-based sorting from AI recommendations.
todos:
  - id: add-addon-type
    content: "types.ts: AddOnCategory union + isAddOnCategory() guard (3 checklist items)"
    status: completed
  - id: add-sorting-utility
    content: "add-ons-sorting.ts: scoreAndSortAddOns() with tokenize, synonyms, scoring (9 items, 1 CRITICAL)"
    status: completed
  - id: create-strip-component
    content: "OptionalAddOnsStrip.tsx: badges, valid AI title, memoized sorting, a11y (14 items)"
    status: completed
  - id: create-bottom-sheet
    content: "AddOnsBottomSheet.tsx: fixed tab order Layers/Bags/Accessories, lazy load (8 items)"
    status: completed
  - id: integrate-results
    content: "results.tsx: remove old section, wire new components, photo viewer (6 items, 1 CRITICAL)"
    status: completed
isProject: false
---

# Compact Add-ons Strip with AI Integration

## Design Decisions (Confirmed)

| Decision | Choice | Rationale |

|----------|--------|-----------|

| Expansion UX | Bottom sheet | Keeps context, avoids endless scroll, works with sticky CTA |

| Badge style | Overlay top-left | Compact, premium feel, avoids vertical height |

| Phase priority | Option A only | Ship and validate before coupling with AI card |

| Empty state | Hide section if 0 add-ons | Show whatever exists, don't mention missing categories |

## Final Design

```
┌──────────────────────────────────────────────┐
│ Suggested add-ons              View all →    │
├──────────────────────────────────────────────┤
│  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐     │
│  │Layer│  │Bag │  │Acc │  │Bag │  │Acc │     │  ← overlay badges
│  │    │  │    │  │    │  │    │  │    │     │
│  └────┘  └────┘  └────┘  └────┘  └────┘     │
└──────────────────────────────────────────────┘
```

**Title logic:**

- AI present AND valid (`suggestions?.to_elevate?.length === 2`): "Suggested add-ons"
- AI missing or fallback: "Finish the look"
- (Don't show "Suggested" for repaired/fallback AI responses)

**View all logic:**

- Show if: `total > 6 OR categoryCount > 1 OR maxCategoryCount > 4`
- (Strip only shows 6, so if any category has >4 items, user can't see all options)
- Opens bottom sheet with fixed tab order: Layers → Bags → Accessories

**Badge style:**

- Tiny pill overlay, top-left corner
- 10-11px text, semi-transparent white background
- Labels: "Layer", "Bag", "Acc"

**UX: Generous press target:**

- Entire header row tappable to open sheet (not just "View all" link)
- Improves discoverability without adding UI clutter

## Type Safety: AddOnCategory

**Problem:** Mixing `Category` (tops/bottoms/shoes/...) with add-on categories causes silent mismatches.

**Solution:** Define dedicated union in `src/lib/types.ts` (single source of truth):

```typescript
/** Add-on categories only - subset of Category for optional items */
export type AddOnCategory = 'outerwear' | 'bags' | 'accessories';

/** Type guard for add-on categories - DEFINE HERE ONLY, import elsewhere */
export function isAddOnCategory(cat: string): cat is AddOnCategory {
  return cat === 'outerwear' || cat === 'bags' || cat === 'accessories';
}
```

**Import pattern** (don't duplicate the function):

```typescript
// In add-ons-sorting.ts, OptionalAddOnsStrip.tsx, etc.
import { isAddOnCategory, type AddOnCategory } from './types';
```

## Sorting Algorithm (Refined)

**Key improvements over initial design:**

1. **Deduplicated wantedCategories** - Prevents duplicate bullets from skewing indexOf
2. **Bidirectional synonym lookup** - "golden" expands to whole group (gold, golden, brass)
3. **Token-based matching** - Prevents false positives ("tan" won't match "tangerine")
4. **Simpler category scoring** - `40 - categoryIdx * 20` (clearer than length arithmetic)
5. **Deterministic tiebreaker** - Uses originalIndex in secondary sort
6. **Type-safe categories** - AddOnCategory prevents string mismatches
```typescript
import { isAddOnCategory, type AddOnCategory, type AddOnItem, type ElevateBullet } from './types';

/** Synonym groups - any variant maps to the whole group */
const ATTR_GROUPS = {
  gold: ['gold', 'golden', 'brass'],
  tan: ['tan', 'camel', 'beige', 'khaki'],
  structured: ['structured', 'boxy', 'rigid'],
  minimal: ['minimal', 'simple', 'clean'],
  leather: ['leather', 'faux_leather', 'vegan_leather'],
  neutral: ['neutral', 'nude', 'cream', 'ivory'],
} as const;

/** Bidirectional lookup: any variant → its whole group */
const ATTR_LOOKUP = new Map<string, readonly string[]>(
  Object.values(ATTR_GROUPS).flatMap(list => 
    list.map(v => [v, list] as const)
  )
);

/** Tokenize text for whole-token matching (prevents "tan" matching "tangerine") */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

interface ScoredAddOn {
  item: AddOnItem;
  score: number;
  originalIndex: number;
}

export function scoreAndSortAddOns(
  addOns: AddOnItem[],
  toElevate: ElevateBullet[] | undefined
): AddOnItem[] {
  // 1. Extract AI recommendations (deduplicated, priority preserved)
  const wantedCategories: AddOnCategory[] = [];
  const wantedAttrs = new Set<string>();
  
  if (toElevate) {
    toElevate.forEach(bullet => {
      const cat = bullet.recommend.category;
      // Deduplicate: only add if not already present AND is add-on category
      if (isAddOnCategory(cat) && !wantedCategories.includes(cat)) {
        wantedCategories.push(cat);
      }
      // Expand attributes with BIDIRECTIONAL synonyms
      bullet.recommend.attributes.forEach(attr => {
        const normalized = attr.toLowerCase().trim();
        // Look up synonym group (works for any variant, not just canonical)
        const group = ATTR_LOOKUP.get(normalized);
        if (group) {
          group.forEach(syn => wantedAttrs.add(syn));
        } else {
          wantedAttrs.add(normalized);
        }
      });
    });
  }

  // 2. Score each add-on
  const scored: ScoredAddOn[] = addOns.map((item, originalIndex) => {
    let score = 0;
    
    // Category match: +100 base, +40/20/0 for priority (simpler formula)
    const categoryIdx = wantedCategories.indexOf(item.category);
    if (categoryIdx !== -1) {
      score += 100;
      score += Math.max(0, 40 - categoryIdx * 20); // 40, 20, 0...
    }
    
    // Attribute match: tokenize to prevent false positives, +10 per match, cap at +30
    const tokens = new Set(tokenize(getMatchableText(item)));
    let attrMatches = 0;
    wantedAttrs.forEach(attr => {
      if (tokens.has(attr)) attrMatches++;
    });
    score += Math.min(attrMatches * 10, 30);
    
    return { item, score, originalIndex };
  });

  // 3. Sort by score descending, then originalIndex ascending (deterministic tiebreaker)
  return scored
    .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)
    .map(s => s.item);
}

function getMatchableText(item: AddOnItem): string {
  // Combine searchable fields (local only, never sent to model)
  const parts: string[] = [];
  if (item.colors?.[0]?.name) parts.push(item.colors[0].name);
  if (item.detectedLabel) parts.push(item.detectedLabel);
  if (item.userStyleTags) parts.push(...item.userStyleTags);
  return parts.join(' ');
}
```


## Component Specs

### OptionalAddOnsStrip.tsx

```typescript
interface OptionalAddOnsStripProps {
  addOns: AddOnItem[];                        // all categories mixed
  suggestions?: PersonalizedSuggestions | null;
  onOpenViewAll: () => void;
  onPressItem: (item: AddOnItem) => void;
}
```

**Critical: Memoize sorting to avoid re-sorting on every render:**

```typescript
function OptionalAddOnsStrip({ addOns, suggestions, onOpenViewAll, onPressItem }: Props) {
  // Memoize sorted items - only recalculate when inputs change
  const sortedAddOns = useMemo(
    () => scoreAndSortAddOns(addOns, suggestions?.to_elevate),
    [addOns, suggestions?.to_elevate]
  );
  
  // Valid AI = exactly 2 to_elevate bullets (not fallback/repaired)
  const hasValidAi = suggestions?.to_elevate?.length === 2;
  const title = hasValidAi ? 'Suggested add-ons' : 'Finish the look';
  
  // View all visibility: total > 6 OR categoryCount > 1 OR maxCategoryCount > 4
  const showViewAll = useMemo(() => {
    // Guard against empty array (Math.max(...[]) = -Infinity)
    if (addOns.length === 0) return false;
    if (addOns.length > 6) return true;
    const counts = { outerwear: 0, bags: 0, accessories: 0 };
    addOns.forEach(a => counts[a.category]++);
    const nonEmpty = Object.values(counts).filter(c => c > 0);
    if (nonEmpty.length > 1) return true;
    if (Math.max(...nonEmpty) > 4) return true;
    return false;
  }, [addOns]);
  
  // Empty state: hide entire section
  if (addOns.length === 0) return null;
  
  // ... render
}
```

**Rendering:**

1. **Header row (entire row tappable):** Title (AI-aware) + "View all" link (terracotta, conditional)

   - Pressing anywhere on header opens sheet (not just "View all" text)
   - Improves discoverability without adding UI clutter

2. Horizontal ScrollView: max 6 sorted items (`.slice(0, 6)`)
3. Each item: thumbnail with overlay badge (top-left)

**Badge component:**

```typescript
function CategoryBadge({ category }: { category: AddOnCategory }) {
  const label = category === 'outerwear' ? 'Layer' 
              : category === 'bags' ? 'Bag' 
              : 'Acc';
  return (
    <View style={{
      position: 'absolute',
      top: 4,
      left: 4,
      backgroundColor: 'rgba(255,255,255,0.85)',
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 4,
    }}>
      <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium' }}>
        {label}
      </Text>
    </View>
  );
}
```

### AddOnsBottomSheet.tsx

```typescript
interface AddOnsBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  addOns: AddOnItem[];
  onPressItem: (item: AddOnItem) => void;
}
```

**Content:**

- **Fixed tab order:** Layers → Bags → Accessories (always this order)
- Only show tabs that have items (filter out empty categories)
- Each tab: horizontal rows or grid of items
- Reuse existing item rendering style from results.tsx

**Tab labels (consistent with badge language):**

- Badge says "Layer" → Tab says "Layers" (not "Outerwear")
- Feels more stylist-friendly, matches badge tone
```typescript
// Fixed tab order - even if only bags exist, it shows just "Bags" tab
const TAB_ORDER: AddOnCategory[] = ['outerwear', 'bags', 'accessories'];
const TAB_LABELS: Record<AddOnCategory, string> = {
  outerwear: 'Layers',      // Matches badge "Layer" 
  bags: 'Bags',
  accessories: 'Accessories',
};

// Filter to only tabs with items, maintaining order
const visibleTabs = TAB_ORDER.filter(cat => 
  addOns.some(a => a.category === cat)
);
```


## TODOs - Complete in Order

Each TODO maps to checklist items in [compact-addons-strip-review-checklist.md](../../docs/handoff/compact-addons-strip-review-checklist.md).

---

### TODO 1: `add-addon-type`

**File:** [src/lib/types.ts](src/lib/types.ts)

**What to implement:**

- `AddOnCategory` type union (`'outerwear' | 'bags' | 'accessories'`)
- `isAddOnCategory()` type guard (single source of truth - import elsewhere, don't duplicate)
- Update `AddOnItem` interface to use `AddOnCategory` instead of generic `Category`

**Checklist items (3):**

- [ ] AddOnCategory union defined
- [ ] isAddOnCategory() type guard in types.ts ONLY
- [ ] AddOnItem.category uses AddOnCategory

---

### TODO 2: `add-sorting-utility`

**File:** [src/lib/add-ons-sorting.ts](src/lib/add-ons-sorting.ts) (NEW)

**What to implement:**

- `ATTR_GROUPS` constant (synonym groups)
- `ATTR_LOOKUP` map (bidirectional lookup)
- `tokenize()` helper (prevents false positives like tan/tangerine)
- `getMatchableText()` helper (local fields only)
- `scoreAndSortAddOns()` main function

**Checklist items (9, 1 CRITICAL):**

- [ ] wantedCategories deduplicated
- [ ] Only add-on categories accepted (isAddOnCategory check)
- [ ] Category match scores +100 base + priority bonus (40/20/0)
- [ ] Bidirectional synonym lookup (ATTR_LOOKUP map)
- [ ] Token-based matching (not substring includes)
- [ ] Attribute match capped at +30
- [ ] Deterministic tiebreaker via secondary sort
- [ ] getMatchableText() uses local fields only
- [ ] **CRITICAL:** Sorting utility never sends data to model

---

### TODO 3: `create-strip-component`

**File:** [src/components/OptionalAddOnsStrip.tsx](src/components/OptionalAddOnsStrip.tsx) (NEW)

**What to implement:**

- Props interface (`addOns`, `suggestions`, `onOpenViewAll`, `onPressItem`)
- `useMemo` for sorted items (import `scoreAndSortAddOns`)
- Valid AI check (`to_elevate?.length === 2`)
- `showViewAll` logic with empty array guard
- `CategoryBadge` sub-component (overlay, top-left)
- Header row (entire row tappable)
- Thumbnail ScrollView (max 6, `.slice(0, 6)`)
- Accessibility labels

**Checklist items (14):**

- [ ] Title changes based on VALID AI (length === 2)
- [ ] Entire header row tappable
- [ ] Maximum 6 thumbnails displayed
- [ ] Thumbnails sorted by scoreAndSortAddOns()
- [ ] showViewAll guards against empty array
- [ ] "View all" shows if: >6 OR >1 category OR >4 in category
- [ ] Category badges overlay top-left
- [ ] Badge style matches spec (10-11px, rgba white)
- [ ] onPressItem fires with correct item
- [ ] Section hidden if 0 add-ons
- [ ] Uses FadeInDown animation
- [ ] scoreAndSortAddOns() memoized (Performance)
- [ ] Thumbnails have accessible labels (A11y)
- [ ] "View all" button accessible (A11y)

---

### TODO 4: `create-bottom-sheet`

**File:** [src/components/AddOnsBottomSheet.tsx](src/components/AddOnsBottomSheet.tsx) (NEW)

**What to implement:**

- Props interface (`visible`, `onClose`, `addOns`, `onPressItem`)
- `TAB_ORDER` constant (fixed order: outerwear → bags → accessories)
- `TAB_LABELS` map ("Layers", "Bags", "Accessories")
- Tab filtering (only show tabs with items)
- Category filtering per tab
- Thumbnail rendering (reuse existing style)
- Close handling (button + swipe gesture)

**Checklist items (8):**

- [ ] Tab order is fixed: Outerwear → Bags → Accessories
- [ ] Only tabs with items displayed
- [ ] Tab labels are "Layers", "Bags", "Accessories"
- [ ] Items correctly filtered by category per tab
- [ ] Thumbnail rendering consistent with existing style
- [ ] onPressItem fires correctly from sheet
- [ ] Close button/gesture works
- [ ] Bottom sheet lazy-loaded (Performance)

---

### TODO 5: `integrate-results`

**File:** [src/app/results.tsx](src/app/results.tsx) (MODIFY)

**What to implement:**

- Remove old add-ons section (lines 4538-4664)
- Import `OptionalAddOnsStrip` and `AddOnsBottomSheet`
- Add state: `const [addOnsSheetVisible, setAddOnsSheetVisible] = useState(false)`
- Pass `suggestionsResult?.data` to strip for AI-aware sorting
- Wire `onPressItem` to photo viewer
- Wire `onOpenViewAll` to sheet visibility
- Position component correctly (after Outfit Ideas, before Styling Suggestions)

**Checklist items (6, 1 CRITICAL):**

- [ ] Old add-ons section removed
- [ ] Bottom sheet state managed correctly
- [ ] suggestionsResult passed for AI-aware sorting
- [ ] onPressItem wired to photo viewer
- [ ] Section appears in correct position
- [ ] **CRITICAL:** No regression in existing functionality

---

## Summary

| TODO | File | Checklist Items | CRITICALs |

|------|------|-----------------|-----------|

| 1. `add-addon-type` | types.ts | 3 | 0 |

| 2. `add-sorting-utility` | add-ons-sorting.ts | 9 | 1 |

| 3. `create-strip-component` | OptionalAddOnsStrip.tsx | 14 | 0 |

| 4. `create-bottom-sheet` | AddOnsBottomSheet.tsx | 8 | 0 |

| 5. `integrate-results` | results.tsx | 6 | 1 |

| **Total** | | **40** | **2** |

## Files Summary

| TODO | File | Action |

|------|------|--------|

| 1 | `src/lib/types.ts` | MODIFY - add AddOnCategory type + guard |

| 2 | `src/lib/add-ons-sorting.ts` | NEW - scoring utility |

| 3 | `src/components/OptionalAddOnsStrip.tsx` | NEW - compact strip |

| 4 | `src/components/AddOnsBottomSheet.tsx` | NEW - expanded view |

| 5 | `src/app/results.tsx` | MODIFY - replace add-ons section |

## Future: Phase 2 (Option B)

Design note: The `scoreAndSortAddOns()` utility can be reused to:

1. Filter items by specific category (for inline thumbnails)
2. Sort by attribute match within a category
3. Return top 3 for each `ToElevateBullet`

This keeps Phase 2 as a clean extension without rewriting sorting logic.