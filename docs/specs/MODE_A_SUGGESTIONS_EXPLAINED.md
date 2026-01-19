# Mode A Suggestions Explained

Mode A suggestions are **category-based "what to add"** recommendations that help users understand what other pieces would complete a look with their scanned item.

---

## Overview

**Mode A = "What to Add"**

Mode A suggests missing pieces from your wardrobe that would work well with the scanned item. It's a **category-based** system that provides structured, actionable guidance.

---

## When Mode A Is Used

Mode A suggestions appear in three scenarios:

### 1. **HIGH State** (Optional/Bonus)
- **When:** User has HIGH confidence matches
- **Purpose:** Optional expansion ideas
- **Filtering:** **YES** - Filters out categories already covered by matches
- **Visibility:** Only shown if bullets remain after filtering

### 2. **MEDIUM State** (Fallback)
- **When:** No HIGH matches, but Mode B suggestions are empty
- **Purpose:** Fallback guidance when Mode B unavailable
- **Filtering:** **NO** - Shows all bullets
- **Copy:** Uses MEDIUM state copy ("To make this work")

### 3. **LOW State** (Primary Guidance)
- **When:** No matches found, or confidence engine didn't evaluate
- **Purpose:** Constructive guidance on what would help
- **Filtering:** **NO** - Shows all bullets
- **Copy:** Uses LOW state copy ("What would help")

---

## How Mode A Suggestions Are Generated

### Step 1: Template Selection

Mode A uses **category-specific templates** stored in `MODE_A_TEMPLATES`:

```typescript
generateModeASuggestions(category: Category): ModeASuggestion
```

**Template Structure:**
- Each category has a template with:
  - `intro`: Section introduction text
  - `bullets`: Array of suggestion bullets with target categories

**Example Template (tops):**
```typescript
tops: {
  intro: "To make this item easy to wear:",
  bullets: [
    { text: "Dark or structured bottoms", target: "bottoms" },
    { text: "Neutral everyday shoes", target: "shoes" },
    { text: "Light layer for balance", target: "outerwear" },
  ],
}
```

### Step 2: Category-Specific Templates

Each scanned category has its own template:

| Scanned Category | Suggestions Focus |
|------------------|-------------------|
| **tops** | Bottoms, shoes, outerwear |
| **bottoms** | Tops, shoes, outerwear |
| **shoes** | Tops, bottoms, outerwear |
| **outerwear** | Tops, bottoms, shoes |
| **dresses** | Shoes, outerwear, accessories |
| **skirts** | Tops, shoes, outerwear |
| **bags** | General outfit pieces, shoes, accessories |
| **accessories** | General outfit pieces, shoes, outerwear |
| **default** | Generic guidance (fallback) |

### Step 3: Filtering (HIGH State Only)

**When HIGH matches exist**, Mode A bullets are filtered by **covered categories**:

```typescript
// Determine which categories are "covered" by HIGH matches
const coveredCategories = getCoveredCategories(
  matches.map(m => ({ pair_type: m.pair_type })),
  scannedCategory
);

// Filter out bullets whose target category is already covered
const filteredBullets = rawModeA.bullets.filter(
  bullet => !bullet.target || !coveredCategories.has(bullet.target)
);
```

**Covered Categories Logic:**
- If a HIGH match exists for `tops_bottoms` pair and you scanned a **top**, then **bottoms** is "covered"
- Covered categories are **excluded** from suggestions (user already has good matches there)
- Bullets with `target: null` are **never filtered** (they're generic)

**Example:**
- Scanned: **tops**
- HIGH match: `tops_bottoms` pair (navy top + black jeans)
- Result: "bottoms" is covered → Filter out "Dark or structured bottoms" bullet
- Remaining: "Neutral everyday shoes", "Light layer for balance"

### Step 4: Final Output Structure

Mode A suggestions return:

```typescript
{
  intro: string;           // Section introduction
  bullets: Array<{
    text: string;          // Display text
    target: Category | null; // Target category (for filtering/icon selection)
  }>;
}
```

---

## Bullet Structure

Each Mode A bullet has:

1. **Text**: Human-readable suggestion (e.g., "Dark or structured bottoms")
2. **Target**: Category for filtering/UI (e.g., `"bottoms"` or `null` for generic)

**Target Categories:**
- Used for **filtering** in HIGH state
- Used for **icon selection** in UI
- `null` = Generic suggestion (never filtered)

---

## Filtering Rules

### When Filtering Happens

| UI State | Filtering Applied? | Reason |
|----------|-------------------|--------|
| **HIGH** | ✅ **YES** | User already has matches, filter redundant suggestions |
| **MEDIUM** | ❌ **NO** | User needs foundational guidance |
| **LOW** | ❌ **NO** | User needs foundational guidance |

### What Gets Filtered

- Bullets with `target` matching a **covered category** are removed
- Bullets with `target: null` are **never filtered**
- If all bullets are filtered → Mode A suggestions become `null` (section hidden)

### Covered Categories Mapping

Categories are "covered" based on pair types in HIGH matches:

```typescript
COVERED_CATEGORIES_MAP = {
  tops_bottoms: ['tops', 'bottoms'],
  tops_shoes: ['tops', 'shoes'],
  tops_outerwear: ['tops', 'outerwear'],
  bottoms_shoes: ['bottoms', 'shoes'],
  // ... etc
}
```

**Logic:**
- If scanned category = `tops` and match has `tops_bottoms` → `bottoms` is covered
- If scanned category = `bottoms` and match has `tops_bottoms` → `tops` is covered

**Special Rule:**
- **Accessories** are NEVER "covered" by a match (they're always optional)

---

## UI Integration

### Display Structure

Mode A suggestions appear in the **Suggestions Section**:

```
┌─────────────────────────────────┐
│ [Title based on UI state]        │
│ [Intro from template]            │
│                                  │
│ • Bullet 1 (with category icon) │
│ • Bullet 2 (with category icon)  │
│ • Bullet 3 (with category icon)  │
└─────────────────────────────────┘
```

### Titles by UI State

| UI State | Title | Intro |
|----------|-------|-------|
| **HIGH** | "If you want to expand this look" | "Optional ideas to try:" |
| **MEDIUM** | "To make this work" | "To make this pairing work:" |
| **LOW** | "What would help" | "To make this easier to style:" |

### Bullet Display

Each bullet:
- Shows text from template
- Displays category icon (if `target` is not null)
- Is clickable → navigates to "Add Item" screen with category pre-selected

---

## Example Scenarios

### Scenario 1: HIGH State with Filtering

**Input:**
- Scanned: `tops` (feminine blouse)
- HIGH matches: `tops_bottoms` (blouse + black jeans)
- Template: `MODE_A_TEMPLATES.tops`

**Process:**
1. Generate raw Mode A: 3 bullets (bottoms, shoes, outerwear)
2. Determine covered: `bottoms` is covered (from match)
3. Filter: Remove "Dark or structured bottoms" bullet
4. Result: 2 bullets remaining (shoes, outerwear)

**UI Display:**
```
If you want to expand this look
Optional ideas to try:

• Neutral everyday shoes
• Light layer for balance
```

### Scenario 2: LOW State (No Filtering)

**Input:**
- Scanned: `tops` (statement blouse)
- HIGH matches: 0
- Template: `MODE_A_TEMPLATES.tops`

**Process:**
1. Generate raw Mode A: 3 bullets (bottoms, shoes, outerwear)
2. No filtering (LOW state)
3. Result: All 3 bullets shown

**UI Display:**
```
What would help
To make this easier to style:

• Dark or structured bottoms
• Neutral everyday shoes
• Light layer for balance
```

### Scenario 3: All Bullets Filtered

**Input:**
- Scanned: `tops`
- HIGH matches: `tops_bottoms`, `tops_shoes`, `tops_outerwear` (all categories covered)
- Template: `MODE_A_TEMPLATES.tops`

**Process:**
1. Generate raw Mode A: 3 bullets
2. All categories covered → All bullets filtered
3. Result: `modeASuggestions = null`

**UI Display:**
- Suggestions section is **hidden** (no content to show)

---

## Template Examples

### Tops Template
```typescript
{
  intro: "To make this item easy to wear:",
  bullets: [
    { text: "Dark or structured bottoms", target: "bottoms" },
    { text: "Neutral everyday shoes", target: "shoes" },
    { text: "Light layer for balance", target: "outerwear" },
  ],
}
```

### Bottoms Template
```typescript
{
  intro: "To complete this look:",
  bullets: [
    { text: "Simple top in a neutral tone", target: "tops" },
    { text: "Everyday shoes that don't compete", target: "shoes" },
    { text: "Optional outer layer for structure", target: "outerwear" },
  ],
}
```

### Default Template (Fallback)
```typescript
{
  intro: "To make this item easy to wear:",
  bullets: [
    { text: "Keep the other pieces simple", target: null },
    { text: "Choose neutral colors", target: null },
    { text: "Avoid competing textures", target: null },
  ],
}
```

**Note:** Default template bullets have `target: null`, so they're **never filtered**.

---

## Key Design Principles

### 1. **Context-Aware**
- Templates are category-specific
- Suggestions match the scanned item's category

### 2. **Smart Filtering**
- Only filters in HIGH state (when user has matches)
- Prevents redundant suggestions
- Generic bullets (`target: null`) always shown

### 3. **Progressive Disclosure**
- HIGH: Optional expansion (filtered)
- MEDIUM: Fallback guidance (unfiltered)
- LOW: Primary guidance (unfiltered)

### 4. **Actionable**
- Each bullet has a clear target category
- Clickable → Direct path to add item
- Icons help visual recognition

### 5. **Graceful Degradation**
- If all bullets filtered → Section hidden (not empty)
- Default template for unknown categories
- Generic bullets as fallback

---

## Comparison: Mode A vs Mode B

| Aspect | Mode A | Mode B |
|--------|--------|--------|
| **Purpose** | "What to add" | "Make it work" |
| **Source** | Category templates | Cap reasons from near-matches |
| **Content** | Category suggestions | Styling tips |
| **Structure** | Structured bullets with targets | Plain text bullets |
| **Filtering** | Yes (HIGH state only) | No |
| **When Used** | HIGH (optional), MEDIUM (fallback), LOW (primary) | MEDIUM (primary) |
| **Example** | "Dark or structured bottoms" | "Keep outfit at same dressiness level" |

---

## Implementation Details

### Generation Function

```typescript
export function generateModeASuggestions(
  category: Category
): ModeASuggestion {
  const template = MODE_A_TEMPLATES[category] ?? MODE_A_TEMPLATES.default;
  return {
    intro: template.intro,
    bullets: [...template.bullets],
  };
}
```

### Filtering Function

```typescript
// In useConfidenceEngine.ts
if (highMatchCount > 0) {
  const coveredCategories = getCoveredCategories(
    evaluation.matches.map(m => ({ pair_type: m.pair_type })),
    scannedItem.category
  );

  const filteredBullets = rawModeA.bullets.filter(
    bullet => !bullet.target || !coveredCategories.has(bullet.target)
  );

  if (filteredBullets.length > 0) {
    modeASuggestions = {
      intro: rawModeA.intro,
      bullets: filteredBullets,
    };
  }
  // If no bullets remain, modeASuggestions stays null
} else {
  // No HIGH matches = show all Mode A suggestions
  modeASuggestions = rawModeA;
}
```

---

## Summary

Mode A suggestions are a **deterministic, template-based** system that:

1. ✅ Provides category-specific "what to add" guidance
2. ✅ Filters intelligently in HIGH state (avoids redundancy)
3. ✅ Shows all suggestions in MEDIUM/LOW states (foundational guidance)
4. ✅ Uses structured bullets with target categories for UI integration
5. ✅ Gracefully handles edge cases (all filtered, unknown category, etc.)

The system balances **actionability** (clear category targets) with **flexibility** (filtering when appropriate) to provide the right guidance at the right time.

