# Comprehensive System Documentation

**Complete guide to the Confidence Engine and Results Screen UI**

> **Note:** This document predates the tabs redesign. The "More Options CTA" and `NearMatchesSheet` references are outdated. The results screen now uses a segmented "Wear now" / "Worth trying" tab control. See `README.md` for current architecture.

This document provides a complete explanation of how the Confidence Engine works, how UI states are determined, how suggestions are generated, and how everything renders on the results screen.

---

## Table of Contents

1. [Introduction](#introduction)
2. [Confidence Engine Overview](#confidence-engine-overview)
3. [UI States & Decision Flow](#ui-states--decision-flow)
4. [Complete Decision Table](#complete-decision-table)
5. [UI Rendering Outcomes](#ui-rendering-outcomes)
6. [Mode A Suggestions](#mode-a-suggestions)
7. [Mode B Suggestions](#mode-b-suggestions)
8. [Complete Examples](#complete-examples)
9. [Edge Cases & FAQ](#edge-cases--faq)

---

## Introduction

### What Is This System?

The **Confidence Engine** is a **deterministic, rules-based scoring system** that evaluates how well clothing items work together. It's not AI-based—it uses mathematical rules, feature signals, and weighted scoring to determine compatibility.

### Core Philosophy

> **"Silence is a trust-preserving feature, not a failure state."**

When the engine isn't confident about a pairing, it stays silent rather than making potentially wrong suggestions. This approach builds user trust over time.

### System Components

1. **Confidence Engine**: Evaluates item compatibility using feature signals (color, style, formality, texture, usage)
2. **UI Policy**: Determines what to show on the results screen based on engine results
3. **Suggestions System**: Generates Mode A ("what to add") and Mode B ("make it work") guidance
4. **Results Screen**: Renders matches, suggestions, and CTAs based on UI state

---

## Confidence Engine Overview

### Two Engines: Confidence Engine vs Matching Engine

The app has **two separate matching systems** that run in parallel:

1. **Confidence Engine** (New, Preferred)
   - Deterministic, rules-based scoring using feature signals
   - Produces tiers: HIGH, MEDIUM, LOW
   - Has gates system (hard fails, soft caps)
   - **Always preferred when available**

2. **Matching Engine** (Legacy, Fallback)
   - Older scoring system (0-90 points)
   - Produces confidence levels: great, okay, risky
   - **Only used as fallback** when confidence engine fails

**Key Point: The matching engine does NOT override or affect confidence engine scores.** They are completely separate systems. The matching engine is only used when:
- Confidence engine didn't run (`evaluated = false`)
- Confidence engine failed (`rawEvaluation = null`)
- Viewing a saved check with no confidence results (backwards compatibility)

**Decision Logic:**
```
1. Try Confidence Engine first
   ├─ Success? → Use confidence engine results (preferred)
   └─ Failed? → Fallback to matching engine
```

The confidence engine's scores, tiers, and gates are **never modified** by the matching engine. They operate independently.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI LAYER                                │
│                    (results.tsx screen)                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   useConfidenceEngine Hook                      │
│              (src/lib/useConfidenceEngine.ts)                   │
│                                                                 │
│  • Converts app types to engine types                           │
│  • Calls outfit evaluation                                      │
│  • Enriches results with explanations                           │
│  • Returns UI-ready data structure                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CONFIDENCE ENGINE                            │
│               (src/lib/confidence-engine/)                       │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Integration │  │    Outfit    │  │ Suggestions  │          │
│  │    Layer     │──│  Evaluation  │──│   (Mode A/B) │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                 │                                     │
│         ▼                 ▼                                     │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │     Pair     │  │   Feature    │                            │
│  │  Evaluation  │──│   Signals    │                            │
│  └──────────────┘  └──────────────┘                            │
│         │                 │                                     │
│         ▼                 ▼                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │    Gates     │  │   Scoring    │  │    Tiers     │          │
│  │ (Hard/Soft)  │  │  (Weights)   │  │  (Thresholds)│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Key Concepts

| Term | Definition |
|------|------------|
| **raw_score** | A 0-1 value computed from weighted feature signals. NOT the same as confidence. |
| **tier** | The final confidence level: HIGH, MEDIUM, or LOW. Derived from raw_score + gates. |
| **caps** | Soft constraints that limit max tier to MEDIUM (e.g., formality tension). Score unchanged. |
| **hard fails** | Deal-breakers that force tier to LOW regardless of score. |
| **near-match** | A MEDIUM tier result that was close to HIGH (capped or strong score ≥0.70). |
| **Mode A** | "What to add" suggestions. When HIGH exists: optional/light. When no matches: constructive guidance. |
| **Mode B** | "Make it work" styling tips - used when near-matches exist with actionable tensions. |

### Feature Signals

The engine evaluates six compatibility dimensions:

| Code | Name | Range | Known When |
|------|------|-------|------------|
| **C** | Color | -2 to +2 (integers) | Always (color required) |
| **S** | Style | -2 to +2 (integers) | Both styles known |
| **F** | Formality | -2 to +2 (integers) | Always (formality required) |
| **T** | Texture | -2 to +2 (integers) | Both textures known |
| **U** | Usage | -2 to +2 (integers) | Always (uses formality fallback when style unknown) |
| **V** | Silhouette | -2 to +2 (integers) | v2 feature (disabled) |

**Important:** All feature values are integers in the set {-2, -1, 0, +1, +2}. No half-steps.

### Scoring & Tiers

1. **Compute raw score**: Weighted sum of normalized feature signals (0-1)
2. **Apply gates**: Hard fails force LOW, soft caps limit to MEDIUM
3. **Map to tier**: 
   - HIGH: raw_score ≥ 0.78 (0.82 for shoes) AND no caps
   - MEDIUM: raw_score ≥ 0.58 OR capped
   - LOW: Otherwise

### Gates System: Hard Fails & Soft Caps

The gates system is a **two-phase override mechanism** that can modify the tier regardless of the raw score. This ensures certain combinations are never shown as HIGH matches, preserving user trust.

**What "Two-Phase Override Mechanism" Means:**

1. **"Override"** = The gates can **change** the tier that would normally be determined by the raw score alone. For example:
   - Raw score says: "This should be HIGH" (score = 0.85)
   - Gate says: "No, force it to LOW" (hard fail triggered)
   - Final result: LOW (the gate overrode the score)

2. **"Two-Phase"** = Gates are evaluated in **two sequential phases**:
   - **Phase 1**: Check hard fails first (deal-breakers)
   - **Phase 2**: If no hard fail, check soft caps (manageable tensions)
   - This order matters because hard fails take absolute priority

3. **"Mechanism"** = A systematic, rule-based process that applies consistently to all evaluations

**Why This Matters:**
- Without gates, a high score alone could suggest bad combinations (e.g., athleisure + formal)
- Gates add **safety rules** that prevent misleading matches
- The two-phase approach ensures deal-breakers are caught first, then tensions are identified

#### Phase 1: Hard Fails (Force LOW)

**Hard fails are deal-breakers** that force the tier to LOW regardless of score. These represent combinations that simply don't work together.

| Hard Fail | Trigger Condition | Example |
|-----------|------------------|---------|
| **FORMALITY_CLASH_WITH_USAGE** | `F == -2` AND `U <= -1` | Athleisure joggers (level 1) + Black-tie blazer (level 5) |
| **STYLE_OPPOSITION_NO_OVERLAP** | `S == -2` AND `U <= -1` | Preppy polo + Punk leather jacket |
| **SHOES_TEXTURE_FORMALITY_CLASH** | `isShoes` AND `T == -2` AND `F <= -1` | Canvas sneakers + Silk formal blouse |

**How It Works:**
- Hard fails are checked **first** (Phase 1)
- If any hard fail triggers → tier is **forced to LOW**
- Score is ignored (even if it would be HIGH)
- No cap reasons are recorded (hard fail takes precedence)

**Example:**
```
Raw Score: 0.85 (would be HIGH)
Hard Fail: FORMALITY_CLASH_WITH_USAGE triggered
Result: tier = LOW (forced)
```

#### Phase 2: Soft Caps (Limit to MEDIUM)

**Soft caps are manageable tensions** that prevent a match from being HIGH, but still allow it to be MEDIUM. These represent combinations that can work with styling help.

| Soft Cap | Trigger Condition | Example |
|----------|------------------|---------|
| **FORMALITY_TENSION** | `F == 0` (2-level gap) | Casual t-shirt (level 2) + Blazer (level 4) |
| **STYLE_TENSION** | `S <= -1` | Minimal top + Street-style bottoms |
| **COLOR_TENSION** | `C <= -1` | Competing colors that clash |
| **TEXTURE_CLASH** | `T == -2` | Smooth silk + Rough denim |
| **USAGE_MISMATCH** | `U == -2` | Strong context mismatch |
| **SHOES_CONFIDENCE_DAMPEN** | `isShoes` AND (`F <= -1` OR `S <= -1`) | Shoes with formality/style tension |
| **MISSING_KEY_SIGNAL** | `S.unknown` AND `T.unknown` | Both style and texture unknown |

**How It Works:**
- Soft caps are checked **after** hard fails (Phase 2)
- If any soft cap triggers → `max_tier = MEDIUM`
- Score can still determine if it's MEDIUM or LOW
- Multiple cap reasons can accumulate
- Cap reasons are used for Mode B suggestions

**Example:**
```
Raw Score: 0.82 (would be HIGH)
Soft Cap: FORMALITY_TENSION triggered
Result: max_tier = MEDIUM → tier = MEDIUM (capped from HIGH)
```

#### Gate Evaluation Flow

```
1. Compute raw score from feature signals
   ↓
2. Phase 1: Check hard fails
   ├─ Hard fail triggered? → tier = LOW (forced, stop here)
   └─ No hard fail? → Continue
   ↓
3. Phase 2: Check soft caps
   ├─ Any caps triggered? → max_tier = MEDIUM
   └─ No caps? → max_tier = HIGH
   ↓
4. Apply thresholds with max_tier constraint
   ├─ raw_score >= HIGH_THRESHOLD AND max_tier === HIGH? → HIGH
   ├─ raw_score >= MEDIUM_THRESHOLD? → MEDIUM
   └─ Otherwise → LOW
```

#### Key Principles

1. **Hard fails override everything**: Even a perfect score becomes LOW if a hard fail triggers
2. **Soft caps limit maximum**: Can prevent HIGH but still allow MEDIUM
3. **Score still matters**: Even with caps, score determines if it's MEDIUM or LOW
4. **Multiple caps accumulate**: All applicable cap reasons are recorded
5. **Cap reasons inform Mode B**: Used to generate styling suggestions

#### Example Scenarios

**Scenario 1: Hard Fail**
```
Features: F=-2, U=-1, C=+2, S=+2
Raw Score: 0.80 (would be HIGH)
Hard Fail: FORMALITY_CLASH_WITH_USAGE
Result: tier = LOW (forced)
```

**Scenario 2: Soft Cap**
```
Features: F=0, C=+2, S=+2, T=+1
Raw Score: 0.79 (would be HIGH)
Soft Cap: FORMALITY_TENSION
Result: tier = MEDIUM (capped from HIGH)
```

**Scenario 3: No Gates**
```
Features: F=+2, C=+2, S=+2, T=+1
Raw Score: 0.85
No gates triggered
Result: tier = HIGH
```

**Scenario 4: Multiple Caps**
```
Features: F=0, S=-1, C=-1
Raw Score: 0.75 (would be MEDIUM)
Soft Caps: FORMALITY_TENSION, STYLE_TENSION, COLOR_TENSION
Result: tier = MEDIUM (multiple cap reasons for Mode B)
```

### Confidence Tiers Summary

**Note:** The confidence engine uses UI states (HIGH/MEDIUM/LOW) to control section visibility, not display labels. The legacy labels ("Looks like a good match", etc.) exist in code but are not currently displayed in the UI.

| Tier | Matches Shown | Suggestions | Section Visibility |
|------|---------------|-------------|-------------------|
| **HIGH** | Yes (if `matches.length > 0`) | Mode A (optional - filtered by covered categories) | Matches section visible, suggestions optional |
| **MEDIUM** | No (hidden) | Mode B (preferred) or Mode A (fallback) | Matches section hidden, suggestions visible |
| **LOW** | No (hidden) | Mode A (if available) | Matches section hidden, suggestions visible (or rescan CTA) |

---

## UI States & Decision Flow

### The Three UI States

The results screen has three possible states that control everything:

1. **HIGH**: User has HIGH confidence matches
2. **MEDIUM**: User has near-matches (no HIGH matches)
3. **LOW**: No matches, no near-matches

### UI State Determination

```typescript
function getUiState(confidenceResult: ConfidenceEngineResult): UiState {
  if (!confidenceResult.evaluated) { return 'LOW'; }
  if (confidenceResult.highMatchCount > 0) { return 'HIGH'; }
  if (confidenceResult.nearMatchCount > 0) { return 'MEDIUM'; }
  return 'LOW';
}
```

**Priority Order:**
1. HIGH (if `highMatchCount > 0`)
2. MEDIUM (if `nearMatchCount > 0` and no HIGH)
3. LOW (otherwise)

### UI State: HIGH

**When It Occurs:**
- Confidence engine successfully evaluated
- At least one HIGH confidence match exists (`highMatchCount > 0`)

**What Users See:**
- ✅ **Matches Section**: Visible, shows HIGH matches (up to 3)
- ✅ **More Options CTA**: Visible if `nearMatchCount > 0`
- 💡 **Suggestions Section**: Optional (only if Mode A bullets remain after filtering)
- ❌ **Rescan CTA**: Hidden

**User Experience:**
- Primary action: Browse matches, view item details
- Secondary action: Explore more options or optional suggestions
- Trust level: High (showing confident matches)

### UI State: MEDIUM

**When It Occurs:**
- Confidence engine successfully evaluated
- No HIGH matches (`highMatchCount = 0`)
- At least one near-match exists (`nearMatchCount > 0`)

**What Users See:**
- ❌ **Matches Section**: Hidden (or empty-cta if wardrobe is empty)
- ❌ **More Options CTA**: Hidden
- 💡 **Suggestions Section**: Visible (Mode B preferred, Mode A fallback)
- ❌ **Rescan CTA**: Hidden

**User Experience:**
- Primary action: Follow styling suggestions to complete the look
- Trust level: Medium (providing guidance, not showing matches)
- **Actual UI Text Displayed:**
  - Title: "To make this work"
  - Intro: "To make this pairing work:"
  - (Note: The descriptive message "We found some potential matches, but they need styling help" is NOT displayed - it's just a documentation description)

### UI State: LOW

**When It Occurs:**
- Confidence engine successfully evaluated
- No HIGH matches (`highMatchCount = 0`)
- No near-matches (`nearMatchCount = 0`)
- OR confidence engine didn't evaluate (`evaluated = false`)

**What Users See:**
- ❌ **Matches Section**: Hidden (or empty-cta if wardrobe is empty)
- ❌ **More Options CTA**: Hidden
- 📝 **Suggestions Section**: Visible (Mode A) OR Rescan CTA (if no suggestions)
- ✅ **Rescan CTA**: Visible (if no actionable content)

**Decision Logic: Mode A vs Rescan CTA**

The decision between showing Mode A suggestions or the rescan CTA is made in `buildResultsRenderModel()`:

```typescript
// 1. Check if Mode A suggestions exist
const hasModeABullets = (confidenceResult.modeASuggestions?.bullets?.length ?? 0) > 0;

// 2. In LOW state, show suggestions if bullets exist
suggestionsVisible = hasModeABullets; // Line 384

// 3. Determine if there's any actionable content
const hasActionableContent = matchesSectionVisible || suggestionsVisible;

// 4. Show rescan CTA only if:
//    - Engine evaluated successfully
//    - User has wardrobe items (otherwise empty-cta handles it)
//    - No actionable content visible
const showRescanCta =
  confidenceResult.evaluated &&
  wardrobeCount > 0 &&
  !hasActionableContent;
```

**When Mode A is Shown:**
- Mode A suggestions are generated from templates based on the scanned item's category
- In LOW state, `suggestions_mode` is always `'A'` (see `determineSuggestionsMode()`)
- Mode A templates always have content (with fallback to `'default'` template)
- **Result**: Mode A suggestions are almost always shown in LOW state

**When Rescan CTA is Shown:**
- Only in the edge case where Mode A suggestions don't exist (e.g., invalid category, template error)
- AND no matches are visible
- AND user has wardrobe items (otherwise empty-cta is shown)
- **Result**: Rescan CTA is rarely shown (only in error/edge cases)

**User Experience:**
- Primary action: Add suggested items to wardrobe OR rescan item
- Trust level: Low (staying silent rather than showing uncertain matches)
- **Actual UI Text Displayed:**
  - Title: "What would help"
  - Intro: "To make this easier to style:"
  - (Note: The descriptive message "We couldn't find confident matches, but here's what would help" is NOT displayed - it's just a documentation description)

---

## Complete Decision Table

The UI rendering follows a **four-phase decision process**. Each phase determines a different aspect of what to show.

### Input Conditions

| Condition | Type | Description |
|-----------|------|-------------|
| `evaluated` | boolean | Confidence engine successfully evaluated |
| `highMatchCount` | number | Count of HIGH confidence matches |
| `nearMatchCount` | number | Count of near-matches (MEDIUM tier) |
| `wardrobeCount` | number | Total items in user's wardrobe |
| `hasModeABullets` | boolean | Mode A suggestions have content |
| `hasModeBBullets` | boolean | Mode B suggestions have content |
| `matches.length` | number | Actual matches array length |

---

### Phase 1: Determine UI State

| Rule | `evaluated` | `highMatchCount` | `nearMatchCount` | **UI State** |
|------|-------------|------------------|------------------|--------------|
| 1.1 | false | - | - | **LOW** |
| 1.2 | true | > 0 | - | **HIGH** |
| 1.3 | true | 0 | > 0 | **MEDIUM** |
| 1.4 | true | 0 | 0 | **LOW** |

**Priority Order:** Rule 1.2 > Rule 1.3 > Rule 1.4

---

### Phase 2: Determine Matches Section

| Rule | UI State | `matches.length` | `wardrobeCount` | **Variant** | **Visible** | **More Options CTA** |
|------|----------|------------------|-----------------|-------------|------------|---------------------|
| 2.1 | HIGH | > 0 | any | `matches` | ✅ true | See Phase 3 |
| 2.2 | HIGH | 0 | any | `hidden` | ❌ false | ❌ false |
| 2.3 | MEDIUM | any | 0 | `empty-cta` | ✅ true | ❌ false |
| 2.4 | MEDIUM | any | > 0 | `hidden` | ❌ false | ❌ false |
| 2.5 | LOW | any | 0 | `empty-cta` | ✅ true | ❌ false |
| 2.6 | LOW | any | > 0 | `hidden` | ❌ false | ❌ false |

**More Options CTA Logic:**
- Visible only if: `uiState === HIGH` AND `nearMatchCount > 0` AND `variant === 'matches'` AND `matches.length > 0`

---

### Phase 3: Determine Suggestions Section

| Rule | UI State | `hasModeBBullets` | `hasModeABullets` | **Mode** | **Visible** | **Title** | **Intro** |
|------|----------|-------------------|-------------------|----------|-------------|-----------|------------|
| 3.1 | HIGH | any | true | **A** | ✅ true | "If you want to expand this look" | "Optional ideas to try:" |
| 3.2 | HIGH | any | false | **A** | ❌ false | "If you want to expand this look" | "Optional ideas to try:" |
| 3.3 | MEDIUM | true | any | **B** | ✅ true | "To make this work" | "To make this pairing work:" |
| 3.4 | MEDIUM | false | true | **A** | ✅ true | "To make this work" | "To make this pairing work:" |
| 3.5 | MEDIUM | false | false | **A** | ❌ false | "To make this work" | "To make this pairing work:" |
| 3.6 | LOW | any | true | **A** | ✅ true | "What would help" | "To make this easier to style:" |
| 3.7 | LOW | any | false | **A** | ❌ false | "What would help" | "To make this easier to style:" |

**Note:** In MEDIUM state, Mode B takes priority over Mode A (fallback).

**Key Rule 3.2 Explanation:**
- When UI State is HIGH and `hasModeABullets = false` (all bullets filtered out)
- Section is **hidden** (not shown)
- Title/Intro are still set for render model consistency
- This prevents showing empty sections when user already has matches covering all categories

---

### Phase 4: Determine Rescan CTA

| Rule | `evaluated` | `wardrobeCount` | `matchesSectionVisible` | `suggestionsVisible` | **Show Rescan CTA** |
|------|-------------|-----------------|------------------------|---------------------|---------------------|
| 4.1 | true | > 0 | false | false | ✅ true |
| 4.2 | false | any | any | any | ❌ false |
| 4.3 | true | 0 | any | any | ❌ false |
| 4.4 | true | > 0 | true | any | ❌ false |
| 4.5 | true | > 0 | any | true | ❌ false |

**Logic:** Show rescan CTA only when engine evaluated, user has wardrobe, but no actionable content is visible.

---

## UI Rendering Outcomes

### Scenario A: HIGH Confidence with Matches

**Input:**
- `evaluated = true`
- `highMatchCount > 0`
- `nearMatchCount = any`
- `wardrobeCount = any`
- `hasModeABullets = any`

**Output:**
- **UI State**: HIGH
- **Matches Section**: ✅ Visible (shows HIGH matches)
- **More Options CTA**: ✅ Visible (if `nearMatchCount > 0`)
- **Suggestions Section**: ✅ Visible (if `hasModeABullets`) or ❌ Hidden
- **Title**: "If you want to expand this look"
- **Intro**: "Optional ideas to try:"
- **Mode**: A
- **Rescan CTA**: ❌ Hidden

**Visual:**
```
┌─────────────────────────────────┐
│ Item Summary Card                │
│ (Image + Label + Style Notes)    │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ ✅ Matches in your wardrobe      │
│   • Match 1 (with explanation)   │
│   • Match 2 (with explanation)   │
│   • Match 3 (with explanation)   │
│   [More options (N)]             │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ 💡 If you want to expand...      │
│   Optional ideas to try:         │
│   • Suggestion 1                 │
│   • Suggestion 2                 │
└─────────────────────────────────┘
```

---

### Scenario B: MEDIUM Confidence (Near-Matches)

**Input:**
- `evaluated = true`
- `highMatchCount = 0`
- `nearMatchCount > 0`
- `wardrobeCount = any`
- `hasModeBBullets = any`
- `hasModeABullets = any`

**Output:**
- **UI State**: MEDIUM
- **Matches Section**: ❌ Hidden (or empty-cta if wardrobe = 0)
- **More Options CTA**: ❌ Hidden
- **Suggestions Section**: ✅ Visible
- **Title**: "To make this work"
- **Intro**: "To make this pairing work:"
- **Mode**: B (preferred) or A (fallback)
- **Rescan CTA**: ❌ Hidden

**Visual:**
```
┌─────────────────────────────────┐
│ Item Summary Card                │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ 💡 To make this work             │
│   To make this pairing work:    │
│   • Keep outfit at same level... │
│   • Let one piece set the vibe... │
│   • Keep other pieces neutral... │
└─────────────────────────────────┘
```

---

### Scenario C: LOW Confidence (No Matches)

**Input:**
- `evaluated = true`
- `highMatchCount = 0`
- `nearMatchCount = 0`
- `wardrobeCount = any`
- `hasModeABullets = any`

**Output:**
- **UI State**: LOW
- **Matches Section**: ❌ Hidden (or empty-cta if wardrobe = 0)
- **More Options CTA**: ❌ Hidden
- **Suggestions Section**: ✅ Visible (if `hasModeABullets`) or Rescan CTA
- **Title**: "What would help"
- **Intro**: "To make this easier to style:"
- **Mode**: A
- **Rescan CTA**: ✅ Visible (if no suggestions)

**Visual (with suggestions):**
```
┌─────────────────────────────────┐
│ Item Summary Card                │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ 📝 What would help               │
│   To make this easier to style:  │
│   • Dark or structured bottoms   │
│   • Neutral everyday shoes       │
│   • Light layer for balance      │
└─────────────────────────────────┘
```

**Visual (no suggestions - Rescan CTA):**
```
┌─────────────────────────────────┐
│ Item Summary Card                │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ ⚠️ We couldn't find suggestions  │
│   Try rescanning or add items... │
│   [Rescan item] [Add to wardrobe]│
└─────────────────────────────────┘
```

---

### Scenario D: Engine Not Evaluated

**Input:**
- `evaluated = false`
- All other values: - (not applicable)

**Output:**
- **UI State**: LOW
- **Matches Section**: ❌ Hidden (or empty-cta if wardrobe = 0)
- **More Options CTA**: ❌ Hidden
- **Suggestions Section**: ❌ Hidden
- **Rescan CTA**: ❌ Hidden

---

### Scenario E: Empty State (Rescan CTA)

**Input:**
- `evaluated = true`
- `highMatchCount = 0`
- `nearMatchCount = 0`
- `wardrobeCount > 0`
- `hasModeABullets = false`
- `hasModeBBullets = false`

**Output:**
- **UI State**: LOW
- **Matches Section**: ❌ Hidden
- **More Options CTA**: ❌ Hidden
- **Suggestions Section**: ❌ Hidden
- **Rescan CTA**: ✅ Visible

---

## Mode A Suggestions

### Overview

**Mode A = "What to Add"**

Mode A suggests missing pieces from your wardrobe that would work well with the scanned item. It's a **category-based** system that provides structured, actionable guidance.

### When Mode A Is Used

Mode A suggestions appear in three scenarios:

1. **HIGH State** (Optional/Bonus)
   - When: User has HIGH confidence matches
   - Purpose: Optional expansion ideas
   - Filtering: **YES** - Filters out categories already covered by matches
   - Visibility: Only shown if bullets remain after filtering

2. **MEDIUM State** (Fallback)
   - When: No HIGH matches, but Mode B suggestions are empty
   - Purpose: Fallback guidance when Mode B unavailable
   - Filtering: **NO** - Shows all bullets
   - Copy: Uses MEDIUM state copy ("To make this work")

3. **LOW State** (Primary Guidance)
   - When: No matches found, or confidence engine didn't evaluate
   - Purpose: Constructive guidance on what would help
   - Filtering: **NO** - Shows all bullets
   - Copy: Uses LOW state copy ("What would help")

### Category-Specific Templates

Mode A uses **category-specific templates** stored in `MODE_A_TEMPLATES`. Each scanned category has its own template with:
- **Intro text**: Section introduction (e.g., "To make this item easy to wear:")
- **Bullets**: Array of suggestions with target categories

**Key Principle:** The template you get depends on **what you scanned**, not what you have in your wardrobe.

### Template Examples

#### Tops (`tops`)
**Intro:** "To make this item easy to wear:"
- "Dark or structured bottoms" → `target: bottoms`
- "Neutral everyday shoes" → `target: shoes`
- "Light layer for balance" → `target: outerwear`

#### Bottoms (`bottoms`)
**Intro:** "To complete this look:"
- "Simple top in a neutral tone" → `target: tops`
- "Everyday shoes that don't compete" → `target: shoes`
- "Optional outer layer for structure" → `target: outerwear`

#### Dresses (`dresses`)
**Intro:** "To complete this look:"
- "Simple shoes that don't compete" → `target: shoes`
- "Light outer layer for cooler moments" → `target: outerwear`
- "Minimal accessories" → `target: accessories`

#### Bags (`bags`)
**Intro:** "This works well with:"
- "Clean, simple outfit pieces" → `target: null` (generic, never filtered)
- "Neutral everyday shoes" → `target: shoes`
- "Minimal competing accessories" → `target: accessories`

#### Default (`default`)
**Intro:** "To make this item easy to wear:"
- All bullets have `target: null` (never filtered)
- Used as fallback for unknown categories

### How Mode A Suggestions Are Generated

#### Step 1: Template Selection

```typescript
generateModeASuggestions(category: Category): ModeASuggestion
```

1. Takes the scanned item's category as input
2. Looks up the corresponding template in `MODE_A_TEMPLATES`
3. Falls back to `default` template if category not found
4. Returns a copy of the template (with intro and bullets)

#### Step 2: Filtering (HIGH State Only)

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

#### Step 3: Final Output

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

### Filtering Rules

| UI State | Filtering Applied? | Reason |
|----------|-------------------|--------|
| **HIGH** | ✅ **YES** | User already has matches, filter redundant suggestions |
| **MEDIUM** | ❌ **NO** | User needs foundational guidance |
| **LOW** | ❌ **NO** | User needs foundational guidance |

**What Gets Filtered:**
- Bullets with `target` matching a **covered category** are removed
- Bullets with `target: null` are **never filtered**
- If all bullets are filtered → Mode A suggestions become `null` (section hidden)

### Why Hide When All Bullets Filtered?

**If all bullets are filtered, it means:**
- User already has HIGH matches covering all relevant categories
- There's nothing left to suggest (all bases are covered)
- Showing an empty section would be confusing/pointless

**Better UX:**
- Hide the section entirely (cleaner UI)
- User focuses on their matches (which are the primary content)
- No empty/confusing sections

This is **Rule 3.2** from Phase 3: HIGH state with `hasModeABullets = false` → Hide suggestions section.

---

## Mode B Suggestions

### Overview

**Mode B = "Make It Work"**

Mode B provides styling tips for near-matches—items that have some tension but can still work together with the right styling approach.

### When Mode B Is Used

Mode B suggestions appear **only in MEDIUM state**:
- No HIGH matches exist
- Near-matches exist (capped HIGH or strong MEDIUM)
- Mode B takes priority over Mode A in MEDIUM state

### How Mode B Suggestions Are Generated

#### Step 1: Select Near-Matches

Near-matches are selected from MEDIUM tier evaluations:

**Type 2a (Preferred):**
- Would have been HIGH without cap
- `raw_score >= highThreshold` AND `cap_reasons.length > 0`

**Type 2b (Fallback):**
- Strong MEDIUM
- `raw_score >= 0.70`
- Excludes `TEXTURE_CLASH` (T == -2)

#### Step 2: Aggregate Cap Reasons

Cap reasons from near-matches are aggregated:
- Count occurrences of each reason
- Sort by count (descending), then by priority

**Cap Reason Priority:**
```
FORMALITY_TENSION: 5 (highest)
STYLE_TENSION: 4
COLOR_TENSION: 3
USAGE_MISMATCH: 2
SHOES_CONFIDENCE_DAMPEN: 1
TEXTURE_CLASH: 0 (excluded from Mode B)
```

#### Step 3: Generate Bullets

For each top reason (up to 2-3):
1. Look up template pool for that reason
2. Pick a random bullet from the pool
3. Add to bullets array

**Example Templates:**

**FORMALITY_TENSION:**
- "Keep the rest of the outfit at the same level of dressiness"
- "Balance formality across all pieces"

**STYLE_TENSION:**
- "Let one piece set the vibe, and keep the rest simple"
- "Choose one style direction and commit to it"

**COLOR_TENSION:**
- "Keep the other pieces neutral to avoid competing colors"
- "Let this piece be the color focus"

### Mode B Output Structure

```typescript
{
  bullets: string[];           // Plain text bullets (no target categories)
  reasons_used: CapReason[];   // Which cap reasons generated these bullets
}
```

### Mode B vs Mode A

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

## Complete Examples

### Example 1: HIGH State with Partial Filtering

**Input:**
- Scanned: `tops` (feminine blouse)
- HIGH matches: `tops_bottoms` (blouse + black jeans)
- Template: `MODE_A_TEMPLATES.tops` (3 bullets: bottoms, shoes, outerwear)

**Process:**
1. Generate raw Mode A: 3 bullets (bottoms, shoes, outerwear)
2. Determine covered: `bottoms` is covered (from match)
3. Filter: Remove "Dark or structured bottoms" bullet
4. Result: 2 bullets remaining (shoes, outerwear)

**UI Display:**
```
┌─────────────────────────────────┐
│ ✅ Matches in your wardrobe      │
│   • Blouse + Black Jeans         │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ 💡 If you want to expand...      │
│   Optional ideas to try:         │
│   • Neutral everyday shoes        │
│   • Light layer for balance       │
└─────────────────────────────────┘
```

---

### Example 2: HIGH State with All Bullets Filtered

**Input:**
- Scanned: `tops`
- HIGH matches: `tops_bottoms`, `tops_shoes`, `tops_outerwear` (all categories covered)
- Template: `MODE_A_TEMPLATES.tops` (3 bullets)

**Process:**
1. Generate raw Mode A: 3 bullets
2. All categories covered → All bullets filtered
3. Result: `modeASuggestions = null`

**UI Display:**
```
┌─────────────────────────────────┐
│ ✅ Matches in your wardrobe      │
│   • Match 1 (top + bottoms)      │
│   • Match 2 (top + shoes)        │
│   • Match 3 (top + outerwear)    │
└─────────────────────────────────┘

[Suggestions section is HIDDEN]
(All Mode A bullets were filtered out)
```

**Why hidden:** All categories are covered by matches, no additional suggestions needed.

---

### Example 3: MEDIUM State with Mode B

**Input:**
- Scanned: `tops` (casual t-shirt)
- HIGH matches: 0
- Near-matches: 2 (both with `FORMALITY_TENSION` cap)
- Mode B bullets: Available

**Process:**
1. UI State: MEDIUM
2. Mode B preferred (has bullets)
3. Generate Mode B from aggregated cap reasons

**UI Display:**
```
┌─────────────────────────────────┐
│ Item Summary Card                │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ 💡 To make this work             │
│   To make this pairing work:    │
│   • Keep the rest of the outfit  │
│     at the same level of         │
│     dressiness                   │
│   • Let one piece set the vibe,  │
│     and keep the rest simple     │
└─────────────────────────────────┘
```

---

### Example 4: LOW State with Mode A

**Input:**
- Scanned: `tops` (statement blouse)
- HIGH matches: 0
- Near-matches: 0
- Template: `MODE_A_TEMPLATES.tops`

**Process:**
1. Generate raw Mode A: 3 bullets (bottoms, shoes, outerwear)
2. No filtering (LOW state)
3. Result: All 3 bullets shown

**UI Display:**
```
┌─────────────────────────────────┐
│ Item Summary Card                │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ 📝 What would help               │
│   To make this easier to style:  │
│   • Dark or structured bottoms   │
│   • Neutral everyday shoes        │
│   • Light layer for balance      │
└─────────────────────────────────┘
```

---

## Edge Cases & FAQ

### Edge Case 1: `highMatchCount > 0` but `matches.length = 0`

**Behavior:**
- Dev warning logged
- UI state still HIGH
- Matches section hidden (Rule 2.2)
- This is a bug state (shouldn't happen)

### Edge Case 2: `uiState = MEDIUM` but no Mode B bullets

**Behavior:**
- Falls back to Mode A (Rule 3.4)
- Uses MEDIUM state copy ("To make this work")
- Shows Mode A category suggestions

### Edge Case 3: `wardrobeCount = 0`

**Behavior:**
- Always shows `empty-cta` variant in matches section
- Encourages adding items to wardrobe
- Suggestions still shown (if available)

### Edge Case 4: `evaluated = false`

**Behavior:**
- Treated as LOW state
- Minimal UI
- No suggestions shown
- No rescan CTA (Rule 4.2)

### Edge Case 5: Both sections hidden with wardrobe

**Behavior:**
- Shows Rescan CTA (Rule 4.1)
- Only when: `evaluated = true`, `wardrobeCount > 0`, both sections hidden

### FAQ: Why Aren't Accessories/Bags Shown When All Categories Are Covered?

**Question:** I scanned a top → all categories like bottoms, shoes, outerwear are covered by HIGH matches... why aren't bullets related to accessories/bags shown?

**Answer:**

Accessories/bags bullets aren't shown because **they're not in the `tops` template to begin with**.

**Why:**
1. **Category-Specific Templates**: Each scanned category has its own template that only includes the **most relevant complementary pieces** for that category.
2. **Template Focus**: The `tops` template includes: `bottoms`, `shoes`, `outerwear` (core outfit pieces). It does NOT include accessories or bags.
3. **Design Rationale**: 
   - Tops are foundational pieces that pair with bottoms/shoes/outerwear
   - Accessories are typically secondary styling elements
   - Bags are standalone accessories, not core outfit components

**What Happens:**
- Scanned: `tops`
- Template used: `MODE_A_TEMPLATES.tops`
- Raw bullets: `[bottoms, shoes, outerwear]`
- If all three categories are covered: All 3 bullets filtered → Section hidden
- **No accessories/bags bullets exist** because they were never in the template

**To See Accessories/Bags Suggestions:**
- Scan a **dress** → Template includes accessories
- Scan a **bag** → Template includes accessories
- Scan an **accessory** → Template includes other accessories

### FAQ: Why Are Title/Intro Still Set When Section Is Hidden?

**Question:** Rule 3.2 sets title and intro even though the section is hidden. Why?

**Answer:**

Even though the section is hidden, the title and intro are still set in the render model for:

1. **Render model consistency**: All properties are always set
2. **Debugging**: Easier to see what would be shown
3. **Future flexibility**: Could show empty state with title/intro if needed
4. **Testing**: Can verify correct title/intro even when hidden

### FAQ: What's the Difference Between `highMatchCount` and `matches.length`?

**Answer:**

- **`highMatchCount`**: Count of HIGH confidence matches (from engine evaluation)
- **`matches.length`**: Actual matches array length (may be filtered/limited for UI)

**Why Different:**
- UI may limit matches to top 3
- Some matches may be filtered out
- `highMatchCount` reflects engine output, `matches.length` reflects UI display

**Rule 2.2 handles this:** If `highMatchCount > 0` but `matches.length = 0`, matches section is hidden (bug state).

---

## Summary

### Key Principles

1. **Trust Preservation**: Only show HIGH matches (never show uncertain matches)
2. **Actionable Guidance**: Always provide next steps (suggestions or rescan)
3. **Progressive Disclosure**: More options CTA reveals additional matches
4. **Context Awareness**: Empty wardrobe shows different messaging
5. **Mode Priority**: Mode B (styling tips) preferred over Mode A (missing pieces) in MEDIUM state

### Decision Flow Summary

```
User scans item
    ↓
Confidence Engine evaluates
    ↓
┌─────────────────────────────────┐
│ HIGH matches?                    │
│   YES → Show matches + optional  │
│         Mode A suggestions       │
│   NO  → Continue                │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ Near-matches exist?              │
│   YES → Show Mode B styling tips │
│   NO  → Continue                │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ Mode A suggestions available?    │
│   YES → Show Mode A suggestions  │
│   NO  → Show Rescan CTA         │
└─────────────────────────────────┘
```

### System Files

**Core Engine:**
- `src/lib/confidence-engine/` - Confidence engine implementation
- `src/lib/useConfidenceEngine.ts` - React hook integration

**UI Policy:**
- `src/lib/results-ui-policy.ts` - Single source of truth for UI rendering

**Suggestions:**
- `src/lib/confidence-engine/suggestions.ts` - Mode A/B generation
- `src/lib/confidence-engine/config.ts` - Templates and configuration

**UI:**
- `src/app/results.tsx` - Results screen implementation

---

**This document is the complete reference for understanding how the Confidence Engine and Results Screen UI work together.**

