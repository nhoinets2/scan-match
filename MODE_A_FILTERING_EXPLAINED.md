# Mode A Filtering: "Only Shown If Bullets Remain After Filtering"

This document explains what happens when Mode A suggestions are filtered in HIGH state, and why the section might be hidden if all bullets are removed.

---

## The Core Concept

**"Only shown if bullets remain after filtering"** means:

> The Mode A suggestions section is **only displayed** if there are bullets left after filtering removes categories that are already covered by HIGH matches.

If **all bullets are filtered out**, the section is **hidden** (not shown at all).

---

## How Filtering Works

### Step-by-Step Process

1. **Generate raw Mode A suggestions** from template (e.g., 3 bullets)
2. **Identify covered categories** from HIGH matches
3. **Filter bullets** - Remove any bullet whose `target` category is covered
4. **Check result:**
   - ✅ **If bullets remain** → Show suggestions section
   - ❌ **If no bullets remain** → Hide suggestions section

### Code Logic

```typescript
// Step 1: Generate raw Mode A
const rawModeA = generateModeASuggestions(scannedItem.category);
// Example: 3 bullets [bottoms, shoes, outerwear]

// Step 2: Determine covered categories
const coveredCategories = getCoveredCategories(
  matches.map(m => ({ pair_type: m.pair_type })),
  scannedCategory
);
// Example: coveredCategories = Set(['bottoms', 'shoes'])

// Step 3: Filter bullets
const filteredBullets = rawModeA.bullets.filter(
  bullet => !bullet.target || !coveredCategories.has(bullet.target)
);
// Removes bullets where target is in coveredCategories
// Example: Removes 'bottoms' and 'shoes' bullets → 1 bullet remains ['outerwear']

// Step 4: Only set if bullets remain
if (filteredBullets.length > 0) {
  modeASuggestions = {
    intro: rawModeA.intro,
    bullets: filteredBullets,
  };
}
// If filteredBullets.length === 0, modeASuggestions stays null
```

---

## Example Scenarios

### Scenario 1: Some Bullets Remain ✅

**Input:**
- Scanned: `tops` (blouse)
- Template bullets: `[bottoms, shoes, outerwear]`
- HIGH matches: `tops_bottoms` (blouse + jeans)

**Filtering Process:**
1. Covered categories: `['bottoms']` (from `tops_bottoms` match)
2. Filter bullets:
   - ❌ "Dark or structured bottoms" → **REMOVED** (target: `bottoms` is covered)
   - ✅ "Neutral everyday shoes" → **KEPT** (target: `shoes` not covered)
   - ✅ "Light layer for balance" → **KEPT** (target: `outerwear` not covered)
3. Result: **2 bullets remain**

**UI Display:**
```
┌─────────────────────────────────┐
│ If you want to expand this look │
│ Optional ideas to try:          │
│                                 │
│ • Neutral everyday shoes        │
│ • Light layer for balance       │
└─────────────────────────────────┘
```

**Section is SHOWN** ✅

---

### Scenario 2: All Bullets Filtered Out ❌

**Input:**
- Scanned: `tops` (blouse)
- Template bullets: `[bottoms, shoes, outerwear]`
- HIGH matches: 
  - `tops_bottoms` (blouse + jeans)
  - `tops_shoes` (blouse + sneakers)
  - `tops_outerwear` (blouse + jacket)

**Filtering Process:**
1. Covered categories: `['bottoms', 'shoes', 'outerwear']` (all covered!)
2. Filter bullets:
   - ❌ "Dark or structured bottoms" → **REMOVED** (target: `bottoms` covered)
   - ❌ "Neutral everyday shoes" → **REMOVED** (target: `shoes` covered)
   - ❌ "Light layer for balance" → **REMOVED** (target: `outerwear` covered)
3. Result: **0 bullets remain**

**UI Display:**
```
┌─────────────────────────────────┐
│ Matches in your wardrobe         │
│   • Match 1                      │
│   • Match 2                      │
│   • Match 3                      │
└─────────────────────────────────┘

[Suggestions section is HIDDEN - not shown at all]
```

**Section is HIDDEN** ❌

---

### Scenario 3: Generic Bullets (Never Filtered)

**Input:**
- Scanned: `bags` (handbag)
- Template bullets: 
  - `{ text: "Clean, simple outfit pieces", target: null }`
  - `{ text: "Neutral everyday shoes", target: "shoes" }`
  - `{ text: "Minimal competing accessories", target: "accessories" }`
- HIGH matches: `shoes` (somehow covered)

**Filtering Process:**
1. Covered categories: `['shoes']`
2. Filter bullets:
   - ✅ "Clean, simple outfit pieces" → **KEPT** (`target: null` never filtered)
   - ❌ "Neutral everyday shoes" → **REMOVED** (target: `shoes` covered)
   - ✅ "Minimal competing accessories" → **KEPT** (target: `accessories` not covered)
3. Result: **2 bullets remain**

**UI Display:**
```
┌─────────────────────────────────┐
│ If you want to expand this look │
│ Optional ideas to try:          │
│                                 │
│ • Clean, simple outfit pieces   │
│ • Minimal competing accessories  │
└─────────────────────────────────┘
```

**Section is SHOWN** ✅

**Key Point:** Bullets with `target: null` are **never filtered**, so they always remain.

---

## Why Hide Instead of Showing Empty?

### Design Rationale

**If all bullets are filtered, it means:**
- User already has HIGH matches covering all relevant categories
- There's nothing left to suggest (all bases are covered)
- Showing an empty section would be confusing/pointless

**Better UX:**
- Hide the section entirely (cleaner UI)
- User focuses on their matches (which are the primary content)
- No empty/confusing sections

### Code Implementation

```typescript
// In useConfidenceEngine.ts
if (filteredBullets.length > 0) {
  // ✅ Bullets remain → Set suggestions
  modeASuggestions = {
    intro: rawModeA.intro,
    bullets: filteredBullets,
  };
}
// ❌ No bullets → modeASuggestions stays null

// In results-ui-policy.ts
const hasModeABullets = (confidenceResult.modeASuggestions?.bullets?.length ?? 0) > 0;

if (uiState === 'HIGH') {
  // Only show if bullets exist
  suggestionsVisible = hasModeABullets;
}
```

---

## Visual Comparison

### Before Filtering (Raw Template)
```
Template: tops
Bullets: [bottoms, shoes, outerwear]
```

### After Filtering - Case 1: Some Remain
```
Covered: [bottoms]
Filtered: [shoes, outerwear] ← 2 remain
Result: ✅ SHOWN
```

### After Filtering - Case 2: All Removed
```
Covered: [bottoms, shoes, outerwear]
Filtered: [] ← 0 remain
Result: ❌ HIDDEN
```

---

## Edge Cases

### Edge Case 1: Only Generic Bullets
**Input:**
- Template: `default` (all bullets have `target: null`)
- HIGH matches: Any

**Result:**
- ✅ All bullets remain (generic bullets never filtered)
- ✅ Section is SHOWN

**Why:** Generic bullets (`target: null`) are never filtered, so they always remain.

### Edge Case 2: Mixed Generic + Category Bullets
**Input:**
- Bullets: `[{target: null}, {target: 'bottoms'}, {target: 'shoes'}]`
- Covered: `['bottoms', 'shoes']`

**Result:**
- Generic bullet remains
- Category bullets removed
- ✅ Section is SHOWN (1 bullet remains)

### Edge Case 3: Empty Template
**Input:**
- Template has 0 bullets (shouldn't happen, but handled)

**Result:**
- ❌ Section is HIDDEN (no bullets to show)

---

## Complete List of Mode A Bullets by Category

This section lists all Mode A suggestion bullets organized by scanned category. Each bullet includes its text and target category.

### Tops (`tops`)

**Intro:** "To make this item easy to wear:"

| Bullet Text | Target Category |
|------------|----------------|
| Dark or structured bottoms | `bottoms` |
| Neutral everyday shoes | `shoes` |
| Light layer for balance | `outerwear` |

---

### Bottoms (`bottoms`)

**Intro:** "To complete this look:"

| Bullet Text | Target Category |
|------------|----------------|
| Simple top in a neutral tone | `tops` |
| Everyday shoes that don't compete | `shoes` |
| Optional outer layer for structure | `outerwear` |

---

### Shoes (`shoes`)

**Intro:** "This works best with:"

| Bullet Text | Target Category |
|------------|----------------|
| Relaxed everyday top | `tops` |
| Simple structured bottoms | `bottoms` |
| Minimal layering | `outerwear` |

---

### Outerwear (`outerwear`)

**Intro:** "This pairs well with:"

| Bullet Text | Target Category |
|------------|----------------|
| Easy base layer | `tops` |
| Balanced bottoms | `bottoms` |
| Simple shoes | `shoes` |

---

### Dresses (`dresses`)

**Intro:** "To complete this look:"

| Bullet Text | Target Category |
|------------|----------------|
| Simple shoes that don't compete | `shoes` |
| Light outer layer for cooler moments | `outerwear` |
| Minimal accessories | `accessories` |

---

### Skirts (`skirts`)

**Intro:** "To make this item easy to wear:"

| Bullet Text | Target Category |
|------------|----------------|
| Simple top in a complementary tone | `tops` |
| Everyday shoes | `shoes` |
| Optional light layer | `outerwear` |

---

### Bags (`bags`)

**Intro:** "This works well with:"

| Bullet Text | Target Category |
|------------|----------------|
| Clean, simple outfit pieces | `null` (generic) |
| Neutral everyday shoes | `shoes` |
| Minimal competing accessories | `accessories` |

**Note:** First bullet has `target: null`, so it's never filtered.

---

### Accessories (`accessories`)

**Intro:** "This complements:"

| Bullet Text | Target Category |
|------------|----------------|
| Simple outfit pieces | `null` (generic) |
| Neutral everyday shoes | `shoes` |
| Clean layering | `outerwear` |

**Note:** First bullet has `target: null`, so it's never filtered.

---

### Default (`default`)

**Intro:** "To make this item easy to wear:"

| Bullet Text | Target Category |
|------------|----------------|
| Keep the other pieces simple | `null` (generic) |
| Choose neutral colors | `null` (generic) |
| Avoid competing textures | `null` (generic) |

**Note:** All bullets have `target: null`, so they're never filtered. This template is used as a fallback for unknown categories.

---

## Summary

**"Only shown if bullets remain after filtering"** means:

1. ✅ **If bullets remain** → Suggestions section is displayed with remaining bullets
2. ❌ **If no bullets remain** → Suggestions section is completely hidden

**Why this matters:**
- Prevents showing empty/confusing sections
- Keeps UI clean when user already has all relevant matches
- Only shows suggestions when there's actual value to provide

**Key Rules:**
- Filtering only happens in **HIGH state**
- Bullets with `target: null` are **never filtered**
- Section visibility = `hasModeABullets > 0`

This ensures the suggestions section only appears when it has meaningful content to show.

---

## FAQ: Why Aren't Accessories/Bags Shown When All Categories Are Covered?

### Question
> I scanned a top → all categories like bottoms, shoes, outerwear are covered by HIGH matches... why aren't bullets related to accessories/bags shown?

### Answer

**Accessories/bags bullets aren't shown because they're not in the `tops` template to begin with.**

Here's why:

#### 1. **Category-Specific Templates**

Each scanned category has its own template that only includes the **most relevant complementary pieces** for that category:

- **`tops` template** includes: `bottoms`, `shoes`, `outerwear` (core outfit pieces)
- **`dresses` template** includes: `shoes`, `outerwear`, `accessories` (completing pieces)
- **`bags` template** includes: generic pieces, `shoes`, `accessories`

**The `tops` template does NOT include accessories or bags** because:
- Tops are foundational pieces that pair with bottoms/shoes/outerwear
- Accessories are typically secondary styling elements
- Bags are standalone accessories, not core outfit components

#### 2. **What Happens When You Scan a Top**

```
Scanned: tops
Template used: MODE_A_TEMPLATES.tops
Raw bullets: [
  "Dark or structured bottoms" (target: bottoms),
  "Neutral everyday shoes" (target: shoes),
  "Light layer for balance" (target: outerwear)
]
```

**If all three categories are covered:**
- All 3 bullets get filtered out
- Result: 0 bullets remaining
- Section is hidden

**There are no accessories/bags bullets to show** because they were never in the template.

#### 3. **Why This Design Makes Sense**

**Category templates focus on primary outfit composition:**

| Scanned Category | Template Focus |
|-----------------|---------------|
| **Tops** | Core pieces: bottoms, shoes, outerwear |
| **Bottoms** | Core pieces: tops, shoes, outerwear |
| **Dresses** | Completing pieces: shoes, outerwear, accessories |
| **Bags** | General styling: generic, shoes, accessories |

**Accessories/bags are:**
- Secondary styling elements (not foundational)
- Optional pieces (not required for outfit completion)
- More relevant for dresses (which need finishing touches)

#### 4. **If You Want Accessories/Bags Suggestions**

To see accessories/bags suggestions, you would need to:
- Scan a **dress** → Template includes accessories
- Scan a **bag** → Template includes accessories
- Scan an **accessory** → Template includes other accessories

**But for tops/bottoms/shoes/outerwear:**
- Templates focus on core outfit pieces
- Accessories are considered optional/secondary
- Not included in the primary suggestion set

#### 5. **Visual Example**

```
Scan: tops
Template: MODE_A_TEMPLATES.tops
  ↓
Raw bullets: [bottoms, shoes, outerwear]
  ↓
HIGH matches cover: [bottoms, shoes, outerwear]
  ↓
Filtering: All 3 bullets removed
  ↓
Result: 0 bullets → Section HIDDEN

❌ No accessories/bags bullets exist in this template
```

**vs.**

```
Scan: dresses
Template: MODE_A_TEMPLATES.dresses
  ↓
Raw bullets: [shoes, outerwear, accessories]
  ↓
HIGH matches cover: [shoes, outerwear]
  ↓
Filtering: Remove shoes, outerwear bullets
  ↓
Result: 1 bullet remains (accessories) → Section SHOWN ✅
```

### Summary

**Accessories/bags aren't shown for tops because:**
1. ✅ They're not in the `tops` template (by design)
2. ✅ Templates focus on core outfit pieces for each category
3. ✅ Accessories are secondary/optional, not foundational
4. ✅ Each category template only includes its most relevant complementary pieces

**This is intentional design** - tops suggest core pieces (bottoms/shoes/outerwear), while dresses suggest completing pieces (shoes/outerwear/accessories).

