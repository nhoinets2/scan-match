# Understanding Phase 3 Rule 3.2

This document explains Rule 3.2 from Phase 3: Determine Suggestions Section.

---

## Rule 3.2 Breakdown

### Decision Table Format

| Rule | UI State | `hasModeBBullets` | `hasModeABullets` | **Mode** | **Visible** | **Title** | **Intro** |
|------|----------|-------------------|-------------------|----------|-------------|-----------|------------|
| 3.2 | HIGH | any | **false** | **A** | ❌ **false** | "If you want to expand this look" | "Optional ideas to try:" |

---

## What This Rule Means

### Conditions

1. **UI State = HIGH**
   - User has HIGH confidence matches
   - This is determined in Phase 1

2. **hasModeABullets = false**
   - Mode A suggestions have **no content** (empty or null)
   - This happens when:
     - All Mode A bullets were filtered out (all categories covered by matches)
     - Mode A suggestions weren't generated
     - Mode A suggestions are null

3. **hasModeBBullets = any** (doesn't matter)
   - Mode B bullets are irrelevant in HIGH state
   - HIGH state only uses Mode A

### Result

| Property | Value | Meaning |
|----------|-------|---------|
| **Mode** | `A` | Mode A is selected (even though empty) |
| **Visible** | ❌ `false` | **Suggestions section is HIDDEN** |
| **Title** | "If you want to expand this look" | Title is set (for render model consistency) |
| **Intro** | "Optional ideas to try:" | Intro is set (for render model consistency) |

---

## Why Is This Rule Needed?

### Scenario: All Mode A Bullets Filtered

**What happens:**
1. User scans a **top**
2. HIGH matches exist for: `tops_bottoms`, `tops_shoes`, `tops_outerwear`
3. Mode A template generates: `[bottoms, shoes, outerwear]` bullets
4. Filtering removes all bullets (all categories covered)
5. Result: `hasModeABullets = false`

**Rule 3.2 applies:**
- UI State: HIGH ✅
- hasModeABullets: false ✅
- **Result:** Suggestions section is **hidden**

**Why hide instead of showing empty?**
- User already has matches covering all relevant categories
- No additional suggestions needed
- Cleaner UI (no empty section)

---

## Code Implementation

### In `results-ui-policy.ts`

```typescript
switch (uiState) {
  case 'HIGH':
    // Mode A only if we have bullets after filtering
    suggestionsVisible = hasModeABullets;  // ← Rule 3.2: false if no bullets
    suggestionsMode = 'A';
    suggestionsBullets = confidenceResult.modeASuggestions?.bullets ?? [];
    break;
}
```

**What happens:**
- `hasModeABullets` is checked
- If `false` → `suggestionsVisible = false` (section hidden)
- Title and intro are still set (for render model consistency)

---

## Visual Example

### When Rule 3.2 Applies

```
┌─────────────────────────────────┐
│ Item Summary Card                │
│ (Scanned: Top)                   │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ ✅ Matches in your wardrobe      │
│   • Match 1 (top + bottoms)      │
│   • Match 2 (top + shoes)        │
│   • Match 3 (top + outerwear)    │
└─────────────────────────────────┘

[Suggestions section is HIDDEN]
(All Mode A bullets were filtered out)
```

**Why hidden:**
- All categories (bottoms, shoes, outerwear) are covered by matches
- No additional suggestions needed
- Section would be empty if shown

---

## Comparison: Rule 3.1 vs Rule 3.2

### Rule 3.1 (HIGH + hasModeABullets = true)

| Condition | Result |
|-----------|--------|
| UI State | HIGH |
| hasModeABullets | **true** |
| **Visible** | ✅ **true** |
| **Shows** | Mode A suggestions |

**Example:**
- HIGH matches cover `bottoms` and `shoes`
- Mode A has `outerwear` bullet remaining
- **Section is SHOWN** with outerwear suggestion

---

### Rule 3.2 (HIGH + hasModeABullets = false)

| Condition | Result |
|-----------|--------|
| UI State | HIGH |
| hasModeABullets | **false** |
| **Visible** | ❌ **false** |
| **Shows** | Nothing (section hidden) |

**Example:**
- HIGH matches cover `bottoms`, `shoes`, and `outerwear`
- All Mode A bullets filtered out
- **Section is HIDDEN**

---

## Why Title/Intro Are Still Set

Even though the section is hidden, the title and intro are still set in the render model:

```typescript
{
  suggestionsSection: {
    visible: false,  // ← Hidden
    mode: 'A',
    title: "If you want to expand this look",  // ← Still set
    intro: "Optional ideas to try:",  // ← Still set
    bullets: []  // ← Empty
  }
}
```

**Reasons:**
1. **Render model consistency**: All properties are always set
2. **Debugging**: Easier to see what would be shown
3. **Future flexibility**: Could show empty state with title/intro if needed
4. **Testing**: Can verify correct title/intro even when hidden

---

## Decision Flow

```
Phase 1: UI State = HIGH
  ↓
Phase 3: Check hasModeABullets
  ↓
  ├─ hasModeABullets = true?
  │  └─→ Rule 3.1: Section VISIBLE ✅
  │
  └─ hasModeABullets = false?
     └─→ Rule 3.2: Section HIDDEN ❌
         (Title/Intro still set for consistency)
```

---

## Key Takeaways

1. **Rule 3.2 applies when:**
   - UI State is HIGH
   - Mode A has no bullets (all filtered or empty)

2. **Result:**
   - Suggestions section is **hidden**
   - Mode is still set to `A`
   - Title/Intro are set (for consistency)

3. **Why it exists:**
   - Prevents showing empty sections
   - Keeps UI clean when all suggestions are filtered
   - User already has matches covering all categories

4. **Common scenario:**
   - User has HIGH matches covering all Mode A target categories
   - All bullets get filtered out
   - Section is hidden (no redundant suggestions)

---

## Summary

**Rule 3.2 = "HIGH state with no Mode A bullets → Hide suggestions section"**

This ensures the UI stays clean when users already have matches covering all relevant categories, avoiding empty or redundant suggestion sections.


