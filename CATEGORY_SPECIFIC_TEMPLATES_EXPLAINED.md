# Category-Specific Templates Explained

This document explains what category-specific templates are, where they're used, and why they exist.

---

## What Are Category-Specific Templates?

**Category-specific templates** are pre-defined suggestion sets that vary based on the **scanned item's category**. Each category (tops, bottoms, shoes, etc.) has its own template with:

- **Intro text**: Section introduction (e.g., "To make this item easy to wear:")
- **Bullets**: Array of suggestions with target categories (e.g., "Dark or structured bottoms" → `bottoms`)

**Key Principle:** The template you get depends on **what you scanned**, not what you have in your wardrobe.

---

## Where Are They Defined?

### Location: `src/lib/confidence-engine/config.ts`

```typescript
export const MODE_A_TEMPLATES: Record<Category | 'default', ModeATemplate> = {
  tops: {
    intro: "To make this item easy to wear:",
    bullets: [
      { text: "Dark or structured bottoms", target: "bottoms" },
      { text: "Neutral everyday shoes", target: "shoes" },
      { text: "Light layer for balance", target: "outerwear" },
    ],
  },
  bottoms: { /* ... */ },
  shoes: { /* ... */ },
  // ... etc
  default: { /* fallback template */ },
};
```

**Structure:**
- **Key**: Category name (e.g., `"tops"`, `"bottoms"`) or `"default"` for fallback
- **Value**: `ModeATemplate` object with `intro` and `bullets` array

---

## Where Are They Used?

### 1. **Generation Function** (`suggestions.ts`)

**Location:** `src/lib/confidence-engine/suggestions.ts`

```typescript
export function generateModeASuggestions(
  category: Category
): ModeASuggestion {
  // Look up template by category
  const template = MODE_A_TEMPLATES[category] ?? MODE_A_TEMPLATES.default;
  
  return {
    intro: template.intro,
    bullets: [...template.bullets],
  };
}
```

**How it works:**
1. Takes the scanned item's category as input
2. Looks up the corresponding template in `MODE_A_TEMPLATES`
3. Falls back to `default` template if category not found
4. Returns a copy of the template (with intro and bullets)

**Example:**
```typescript
// Scan a top
generateModeASuggestions('tops')
// → Returns tops template: [bottoms, shoes, outerwear]

// Scan a dress
generateModeASuggestions('dresses')
// → Returns dresses template: [shoes, outerwear, accessories]
```

---

### 2. **Confidence Engine Hook** (`useConfidenceEngine.ts`)

**Location:** `src/lib/useConfidenceEngine.ts`

```typescript
if (evaluation.suggestions_mode === 'A') {
  // Generate Mode A suggestions using scanned item's category
  const rawModeA = generateModeASuggestions(scannedItem.category as Category);
  
  // Apply filtering (if HIGH state)
  // ...
}
```

**Flow:**
1. Confidence engine evaluates the scanned item
2. Determines suggestions mode (A or B)
3. If Mode A: calls `generateModeASuggestions(scannedItem.category)`
4. Template is selected based on `scannedItem.category`
5. Filtering may be applied (HIGH state only)
6. Final suggestions returned to UI

---

### 3. **UI Rendering** (`results.tsx`)

**Location:** `src/app/results.tsx`

```typescript
// Mode A suggestions come from confidence engine
const { modeASuggestions } = useConfidenceEngine(/* ... */);

// Render suggestions section
if (modeASuggestions) {
  return (
    <SuggestionsSection
      title={/* based on UI state */}
      intro={modeASuggestions.intro}  // From template
      bullets={modeASuggestions.bullets}  // From template
    />
  );
}
```

**Display:**
- Intro text from template is shown
- Bullets from template are rendered as list items
- Each bullet shows category icon (based on `target`)

---

## Why Category-Specific Templates?

### 1. **Contextual Relevance**

**Different categories need different complementary pieces:**

| Scanned Category | What It Needs | Why |
|-----------------|--------------|-----|
| **Tops** | Bottoms, shoes, outerwear | Core outfit pieces to complete the look |
| **Bottoms** | Tops, shoes, outerwear | Core outfit pieces to complete the look |
| **Dresses** | Shoes, outerwear, accessories | Finishing touches (dress is already complete) |
| **Bags** | Generic pieces, shoes, accessories | Styling guidance (bag is accessory, not core) |

**Example:**
- Scanning a **top** → Need bottoms/shoes/outerwear (building an outfit)
- Scanning a **dress** → Need shoes/outerwear/accessories (completing a look)

---

### 2. **Outfit Composition Logic**

**Templates reflect how outfits are actually built:**

#### Core Pieces (Tops, Bottoms, Shoes, Outerwear)
- These are **foundational** items
- Templates suggest other core pieces
- Example: Top → suggests bottoms, shoes, outerwear

#### Complete Pieces (Dresses)
- Already a complete outfit
- Templates suggest **finishing touches**
- Example: Dress → suggests shoes, outerwear, accessories

#### Accessory Pieces (Bags, Accessories)
- Secondary styling elements
- Templates suggest **general styling** guidance
- Example: Bag → suggests generic pieces, shoes, accessories

---

### 3. **User Mental Model**

**Users think in terms of "what goes with this?"**

- **"I have a top, what do I need?"** → Bottoms, shoes, outerwear
- **"I have a dress, what do I need?"** → Shoes, outerwear, accessories
- **"I have a bag, what works?"** → General outfit pieces

**Category-specific templates match this mental model.**

---

### 4. **Prevents Irrelevant Suggestions**

**Without category-specific templates, you might suggest:**

❌ **Bad:** Scanning a top → "Add another top" (redundant)
❌ **Bad:** Scanning a dress → "Add bottoms" (doesn't make sense)
❌ **Bad:** Scanning shoes → "Add accessories" (less relevant than tops/bottoms)

✅ **Good:** Scanning a top → "Add bottoms, shoes, outerwear" (makes sense)
✅ **Good:** Scanning a dress → "Add shoes, outerwear, accessories" (makes sense)

---

### 5. **Deterministic and Predictable**

**Benefits of template-based approach:**

- ✅ **Consistent**: Same category always gets same template
- ✅ **Predictable**: Users know what to expect
- ✅ **Maintainable**: Easy to update templates
- ✅ **Testable**: Can test each template independently

**vs. Dynamic generation:**
- ❌ Less predictable
- ❌ Harder to maintain
- ❌ More complex logic

---

## Template Selection Logic

### How Template Is Chosen

```typescript
// Step 1: Get scanned item category
const scannedCategory = scannedItem.category; // e.g., "tops"

// Step 2: Look up template
const template = MODE_A_TEMPLATES[scannedCategory];
// → Returns tops template

// Step 3: Fallback if not found
if (!template) {
  template = MODE_A_TEMPLATES.default;
}
```

### Selection Flow

```
User scans item
  ↓
Item categorized (e.g., "tops")
  ↓
Template lookup: MODE_A_TEMPLATES["tops"]
  ↓
Template found? → Use it
Template not found? → Use MODE_A_TEMPLATES["default"]
  ↓
Generate suggestions from template
  ↓
Apply filtering (if HIGH state)
  ↓
Display in UI
```

---

## Template Examples by Category

### Core Outfit Pieces

#### Tops (`tops`)
**Focus:** Building an outfit from a top
- Bottoms (required)
- Shoes (required)
- Outerwear (optional layer)

#### Bottoms (`bottoms`)
**Focus:** Building an outfit from bottoms
- Tops (required)
- Shoes (required)
- Outerwear (optional layer)

#### Shoes (`shoes`)
**Focus:** Building an outfit around shoes
- Tops (required)
- Bottoms (required)
- Outerwear (optional layer)

#### Outerwear (`outerwear`)
**Focus:** Building an outfit with outerwear
- Tops (base layer)
- Bottoms (base layer)
- Shoes (completing piece)

---

### Complete Pieces

#### Dresses (`dresses`)
**Focus:** Completing a dress look
- Shoes (required)
- Outerwear (optional layer)
- Accessories (finishing touches)

**Note:** No bottoms/tops (dress is already complete)

#### Skirts (`skirts`)
**Focus:** Building an outfit from a skirt
- Tops (required)
- Shoes (required)
- Outerwear (optional layer)

---

### Accessory Pieces

#### Bags (`bags`)
**Focus:** General styling guidance
- Generic pieces (target: `null`)
- Shoes (completing piece)
- Accessories (avoid competing)

#### Accessories (`accessories`)
**Focus:** General styling guidance
- Generic pieces (target: `null`)
- Shoes (completing piece)
- Outerwear (layering)

---

### Fallback

#### Default (`default`)
**Focus:** Generic guidance for unknown categories
- All bullets have `target: null` (never filtered)
- Generic styling advice
- Used when category not recognized

---

## Design Principles

### 1. **One Template Per Category**

Each category has exactly one template. This ensures:
- Consistency across scans
- Predictable suggestions
- Easy maintenance

### 2. **Template Reflects Outfit Logic**

Templates match how users actually build outfits:
- Core pieces → suggest other core pieces
- Complete pieces → suggest finishing touches
- Accessories → suggest general styling

### 3. **Target Categories Enable Filtering**

Each bullet has a `target` category:
- Used for filtering in HIGH state
- Used for icon selection in UI
- `null` = generic (never filtered)

### 4. **Fallback for Unknown Categories**

`default` template ensures:
- System never breaks on unknown categories
- Generic guidance always available
- Graceful degradation

---

## Comparison: Category-Specific vs. Generic

### Category-Specific (Current Approach)

**Pros:**
- ✅ Contextually relevant suggestions
- ✅ Matches user mental model
- ✅ Prevents irrelevant suggestions
- ✅ Deterministic and predictable

**Cons:**
- ⚠️ Requires maintaining multiple templates
- ⚠️ Less flexible (can't adapt to user's wardrobe dynamically)

### Generic Approach (Alternative)

**Pros:**
- ✅ Single template to maintain
- ✅ Could adapt to user's wardrobe

**Cons:**
- ❌ Less relevant suggestions
- ❌ Doesn't match user mental model
- ❌ Might suggest irrelevant items

**Example of generic approach:**
```
All categories get same template:
- "Add tops"
- "Add bottoms"
- "Add shoes"
```

**Problem:** Scanning a dress → "Add tops" doesn't make sense!

---

## Summary

**Category-specific templates are:**

1. **What:** Pre-defined suggestion sets that vary by scanned category
2. **Where:** Defined in `config.ts`, used in `suggestions.ts` and `useConfidenceEngine.ts`
3. **Why:** 
   - Contextual relevance (different categories need different pieces)
   - Matches user mental model
   - Prevents irrelevant suggestions
   - Deterministic and predictable

**Key Takeaway:** The template you get depends on **what you scanned**, ensuring suggestions are always contextually relevant and match how users actually think about building outfits.

