# Comprehensive System Documentation

**Complete guide to the Confidence Engine and Results Screen UI**

This document provides a complete explanation of how the Confidence Engine works, how UI states are determined, how suggestions are generated, and how everything renders on the results screen.

> **Architecture:** The results screen uses a segmented "Wear now" / "Worth trying" tab control. HIGH confidence matches appear in the "Wear now" tab, while MEDIUM tier matches appear in the "Worth trying" tab.

---

## Table of Contents

1. [Introduction](#introduction)
2. [Confidence Engine Overview](#confidence-engine-overview)
3. [Trust Filter (Post-CE Guardrail)](#trust-filter-post-ce-guardrail)
4. [UI States & Decision Flow](#ui-states--decision-flow)
5. [Complete Decision Table](#complete-decision-table)
6. [UI Rendering Outcomes](#ui-rendering-outcomes)
7. [Mode A Suggestions](#mode-a-suggestions)
8. [Mode B Suggestions](#mode-b-suggestions)
9. [Personalized AI Suggestions](#personalized-ai-suggestions)
10. [Outfit Ideas Display](#outfit-ideas-display)
11. [Optional Add-ons Strip](#optional-add-ons-strip)
12. [Fallback Chains Summary](#fallback-chains-summary)
13. [Complete Examples](#complete-examples)
14. [Edge Cases & FAQ](#edge-cases--faq)
15. [AI Models & Performance](#ai-models--performance)
16. [Summary](#summary)

---

## Introduction

### What Is This System?

The **Confidence Engine** is a **deterministic, rules-based scoring system** that evaluates how well clothing items work together. It's not AI-based—it uses mathematical rules, feature signals, and weighted scoring to determine compatibility.

### Core Philosophy

> **"Silence is a trust-preserving feature, not a failure state."**

When the engine isn't confident about a pairing, it stays silent rather than making potentially wrong suggestions. This approach builds user trust over time.

### System Components

1. **Confidence Engine**: Evaluates item compatibility using feature signals (color, style, formality, texture, usage)
2. **Trust Filter**: Post-CE guardrail that uses style signals to prevent trust-breaking matches (can demote or hide)
3. **Style Signals**: Aesthetic archetypes, formality bands, and pattern signals generated via Claude Sonnet 4.5 for Trust Filter
4. **Personalized Suggestions**: AI-powered styling guidance with three modes (PAIRED, NEAR, SOLO) using GPT-4o-mini
5. **Suggestions System**: Deterministic Mode A ("what to add") and Mode B ("make it work") as fallbacks
6. **UI Policy**: Determines what to show on the results screen based on engine results
7. **Results Screen**: Renders matches, outfits, suggestions, and AI cards based on UI state

**Performance Note:** Style signals are pre-fetched in parallel with image analysis, eliminating Trust Filter timeout issues. See [AI Models & Performance](#ai-models--performance) for details.

---

## Confidence Engine Overview

The **Confidence Engine** is the sole matching system in the app. It uses deterministic, rules-based scoring to evaluate how well clothing items work together.

**Key characteristics:**
- Deterministic, rules-based scoring using feature signals
- Produces tiers: HIGH, MEDIUM, LOW
- Has gates system (hard fails, soft caps)
- Results feed into Trust Filter for additional safety checks

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI LAYER                                │
│                    (results.tsx screen)                         │
│                                                                 │
│  "Wear now" tab │ "Worth trying" tab │ AI Suggestions Card      │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  useTrustFilter  │ │ useResultsTabs   │ │ Personalized     │
│      Hook        │ │     Hook         │ │ Suggestions      │
│                  │ │                  │ │ Service          │
│ • Fetches style  │ │ • Tab visibility │ │                  │
│   signals        │ │ • Display caps   │ │ • AI PAIRED mode │
│ • Applies Trust  │ │ • Core vs        │ │ • AI NEAR mode   │
│   Filter         │ │   optional cats  │ │ • AI SOLO mode   │
│ • Returns final  │ │                  │ │ • Cache + repair │
│   matches        │ │                  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
          │                                         │
          ▼                                         │
┌─────────────────────────────────────────────────────────────────┐
│                   useConfidenceEngine Hook                      │
│              (src/lib/useConfidenceEngine.ts)                   │
│                                                                 │
│  • Converts app types to engine types                           │
│  • Calls outfit evaluation                                      │
│  • Generates Mode A/B suggestions (V2 style-aware)              │
│  • Returns UI-ready data structure                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CONFIDENCE ENGINE                            │
│               (src/lib/confidence-engine/)                      │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Integration │  │    Outfit    │  │ Suggestions  │          │
│  │    Layer     │──│  Evaluation  │──│  (Mode A/B)  │          │
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
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      TRUST FILTER                               │
│                 (src/lib/trust-filter/)                         │
│                                                                 │
│  • Evaluates HIGH matches using style signals                   │
│  • Actions: keep, demote_to_near, hide                          │
│  • Uses aesthetic distance, formality gaps, pattern clashes     │
│  • Fail-open: passes through if signals unavailable             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STYLE SIGNALS SERVICE                        │
│              (src/lib/style-signals-service.ts)                 │
│                                                                 │
│  • Generates signals via Edge Function (Claude Sonnet 4.5)      │
│  • 12 aesthetic archetypes, formality bands, pattern levels     │
│  • Two-tier caching: in-memory + DB-backed                      │
│  • Lazy enrichment for wardrobe items                           │
│  • Pre-fetched in parallel with image analysis                  │
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

## Trust Filter (Post-CE Guardrail)

The **Trust Filter** is a post-processing layer that runs after the Confidence Engine. It uses **style signals** to identify and handle trust-breaking matches that passed CE scoring.

### Purpose

Even when two items score well on color/formality/texture, they may have **style incompatibilities** that would look wrong together. Trust Filter catches these cases.

### Style Signals

Style signals are generated via **Claude Sonnet 4.5** (migrated from GPT-4 Vision for faster latency and better accuracy) and include:

| Signal | Description | Example Values |
|--------|-------------|----------------|
| **Aesthetic** | Primary style archetype | minimal, feminine, street, preppy, bohemian, etc. (12 types) |
| **Formality Band** | Dress code level | casual, smart_casual, business_casual, formal |
| **Statement Level** | How bold/attention-grabbing | subtle, moderate, statement |
| **Pattern Level** | Pattern intensity | solid, subtle_pattern, bold_pattern |
| **Season Heaviness** | Visual weight | light, medium, heavy |

### Trust Filter Actions

| Action | Result | When Used |
|--------|--------|-----------|
| `keep` | Match stays in HIGH tab | Style signals are compatible |
| `demote_to_near` | Match moves to NEAR tab | Manageable style tension (soft reason) |
| `hide` | Match removed entirely | Severe style clash (hard reason) |

### Evaluation Rules

**Hard Reasons (→ hide):**
- Extreme aesthetic distance (e.g., preppy + punk)
- Severe formality mismatch with style opposition

**Soft Reasons (→ demote):**
- Moderate aesthetic distance
- Formality band gaps
- Competing statement pieces
- Pattern clashes

### Category-Specific Policies

- **Bags/Accessories**: Never hidden for aesthetic-only reasons (always kept or demoted)
- **Skirts**: Can't escalate from demote to hide
- **Anchor pairs** (shoes+tops, outerwear+shoes): More lenient evaluation

### Fail-Open Behavior

If style signals are unavailable (timeout, error), Trust Filter passes through all matches unchanged. The system is "fail-open" to ensure users always see content.

### Performance Optimization: Parallel Pre-fetch

Style signals generation runs **in parallel** with image analysis at scan start, rather than waiting for Trust Filter to request them:

```
BEFORE (Sequential):                    AFTER (Parallel):
                                        
analyze-image ──────▶ 2-4s             analyze-image ──────┐
         ↓                                                 ├──▶ max(2-4s, 4s) = ~4s
CE + TF start                          style-signals ──────┘
         ↓                                      ↓
style-signals ──────▶ 8-15s            CE + TF start (signals CACHED)
         ↓                                      ↓
AI suggestions ─────▶ 5-6s             AI suggestions ────▶ 5-6s
         ↓                                      ↓
TOTAL: ~27s                            TOTAL: ~12-15s
```

**How it works:**
1. `results.tsx` fires both `analyzeClothingImage()` and `generateScanStyleSignalsDirect()` in parallel using `Promise.allSettled`
2. Style signals result is cached in memory (Tier 0) and DB (Tier 1)
3. When Trust Filter later calls `generateScanStyleSignalsDirect()` with the same image URI, it finds a cache hit
4. Trust Filter proceeds instantly without waiting for API call

**Key behaviors:**
- Fire-and-forget: Style signals call doesn't block analysis completion
- Fail-open: If pre-fetch fails, Trust Filter retries as before
- Abortable: Both calls cancel cleanly when user navigates away

### Integration

```typescript
// In results.tsx
const trustFilterResult = useTrustFilter(confidenceResult, wardrobeItems);

// Returns:
// - highFinal: HIGH matches that passed Trust Filter
// - nearFinal: NEAR matches + demoted HIGH matches
// - hidden: Matches that were hidden
```

---

## UI States & Decision Flow

### The Four UI States

The results screen has four possible states that control everything:

1. **HIGH**: User has HIGH confidence matches (shows "Wear now" tab)
2. **MEDIUM**: User has near-matches but no HIGH matches (shows "Worth trying" tab)
3. **SOLO**: No core HIGH or NEAR matches, but wardrobe exists (shows AI styling card)
4. **LOW**: Empty wardrobe or engine failed (shows empty state)

**Note:** SOLO mode is distinct from MEDIUM/LOW - it activates when the user has wardrobe items but no matchable pairs for the scanned item.

### UI State Determination

```typescript
function getUiState(confidenceResult: ConfidenceEngineResult, wardrobeCount: number): UiState {
  if (!confidenceResult.evaluated) { return 'LOW'; }
  
  // Count only CORE categories (tops, bottoms, shoes, dresses, skirts)
  const coreHighCount = confidenceResult.coreHighMatchCount ?? confidenceResult.highMatchCount;
  const coreNearCount = confidenceResult.coreNearMatchCount ?? confidenceResult.nearMatchCount;
  
  if (coreHighCount > 0) { return 'HIGH'; }
  if (coreNearCount > 0) { return 'MEDIUM'; }
  if (wardrobeCount > 0) { return 'SOLO'; }  // Has wardrobe but no matches
  return 'LOW';  // Empty wardrobe
}
```

**Priority Order:**
1. HIGH (if `coreHighCount > 0`)
2. MEDIUM (if `coreNearCount > 0` and no HIGH)
3. SOLO (if wardrobe exists but no core matches)
4. LOW (empty wardrobe or engine failed)

**Priority Order:**
1. HIGH (if `highMatchCount > 0`)
2. MEDIUM (if `nearMatchCount > 0` and no HIGH)
3. LOW (otherwise)

### UI State: HIGH

**When It Occurs:**
- Confidence engine successfully evaluated
- At least one HIGH confidence match exists (`highMatchCount > 0`)

**What Users See:**
- ✅ **"Wear now" Tab**: Visible, shows HIGH matches
- ✅ **"Worth trying" Tab**: Visible if `nearMatchCount > 0`
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
- 💡 **Suggestions Section**: Visible (Mode B preferred, Mode A fallback)
- ❌ **Rescan CTA**: Hidden

**User Experience:**
- Primary action: Follow styling suggestions to complete the look
- Trust level: Medium (providing guidance, not showing matches)
- **Actual UI Text Displayed:**
  - Title: "To make this work"
  - Intro: "To make this pairing work:"
  - (Note: The descriptive message "We found some potential matches, but they need styling help" is NOT displayed - it's just a documentation description)

### UI State: SOLO

**When It Occurs:**
- Confidence engine successfully evaluated
- No core HIGH matches (`coreHighMatchCount = 0`)
- No core NEAR matches (`coreNearMatchCount = 0`)
- User HAS wardrobe items (`wardrobeCount > 0`)

**What Users See:**
- ❌ **Matches Section**: Hidden
- 🤖 **AI Styling Card**: Visible (PersonalizedSuggestionsCard in SOLO mode)
- 📝 **Mode A Fallback**: Visible if AI fails/times out
- ❌ **Rescan CTA**: Hidden

**User Experience:**
- Primary action: View AI-generated styling suggestions
- Sections: "How to style it" + "What to add first"
- Fallback: Mode A suggestions if AI unavailable
- Trust level: Medium (providing guidance for styling this item)

**Key Distinction from MEDIUM/LOW:**
- SOLO = "We couldn't find matches, but here's how to style this item"
- MEDIUM = "We found near-matches that need styling help"
- LOW = "Empty wardrobe or engine failed"

### UI State: LOW

**When It Occurs:**
- Empty wardrobe (`wardrobeCount = 0`)
- OR confidence engine didn't evaluate (`evaluated = false`)

**What Users See:**
- ❌ **Matches Section**: Shows empty-cta encouraging wardrobe building
- 📝 **Suggestions Section**: Visible (Mode A) with "What to add first"
- ✅ **Add to Wardrobe CTA**: Visible

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

| Rule | `evaluated` | `coreHighCount` | `coreNearCount` | `wardrobeCount` | **UI State** |
|------|-------------|-----------------|-----------------|-----------------|--------------|
| 1.1 | false | - | - | - | **LOW** |
| 1.2 | true | > 0 | - | - | **HIGH** |
| 1.3 | true | 0 | > 0 | - | **MEDIUM** |
| 1.4 | true | 0 | 0 | > 0 | **SOLO** |
| 1.5 | true | 0 | 0 | 0 | **LOW** |

**Priority Order:** Rule 1.2 > Rule 1.3 > Rule 1.4 > Rule 1.5

**Note:** `coreHighCount` and `coreNearCount` only count core categories (tops, bottoms, shoes, dresses, skirts). Optional categories (outerwear, bags, accessories) don't drive UI state.

---

### Phase 2: Determine Tab Visibility

| Rule | UI State | `coreHighCount` | `coreNearCount` | **"Wear now" Tab** | **"Worth trying" Tab** |
|------|----------|-----------------|-----------------|--------------------|-----------------------|
| 2.1 | HIGH | > 0 | > 0 | ✅ Visible | ✅ Visible |
| 2.2 | HIGH | > 0 | 0 | ✅ Visible (no tabs) | ❌ Hidden |
| 2.3 | MEDIUM | 0 | > 0 | ❌ Hidden | ✅ Visible (no tabs) |
| 2.4 | SOLO | 0 | 0 | ❌ Hidden | ❌ Hidden |
| 2.5 | LOW | 0 | 0 | ❌ Hidden | ❌ Hidden |

**Note:** Tabs only appear when both have content. Single-content states show content without tab controls.

---

### Phase 3: Determine Suggestions (AI + Fallback)

The suggestions system has two layers: **AI Personalized Suggestions** (preferred) and **Mode A/B** (fallback).

| UI State | AI Mode | AI Sections | Fallback |
|----------|---------|-------------|----------|
| **HIGH** | PAIRED | "Why it works" + "To elevate" | Mode A (filtered) |
| **MEDIUM** | NEAR | "Why it's close" + "How to upgrade" | Mode B → Mode A |
| **SOLO** | SOLO | "How to style it" + "What to add first" | Mode A (unfiltered) |
| **LOW** | - | - | Mode A (unfiltered) |

**Fallback Chain per State:**

**HIGH Tab:**
```
AI PAIRED suggestions (7.5s timeout)
  ↓ fails/times out
Mode A suggestions (filtered by covered categories)
  ↓ all bullets filtered
Nothing shown (matches are primary content)
```

**NEAR Tab:**
```
AI NEAR suggestions (fast timeout)
  ↓ fails/times out
Mode B suggestions (from cap reasons)
  ↓ no Mode B bullets
Mode A suggestions (unfiltered)
```

**SOLO Mode:**
```
AI SOLO suggestions (7.5s timeout)
  ↓ fails/times out
Mode A suggestions (unfiltered)
```

**Key Behaviors:**
- AI suggestions suppress Mode A/B when loading or present
- Mode A is filtered in HIGH state only (removes categories covered by matches)
- Mode B excludes TEXTURE_CLASH from bullet generation
- System is "fail-open" - always shows something on failure

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
- **"Worth trying" Tab**: ✅ Visible (if `nearMatchCount > 0`)
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

**Important:** Mode A is a **fallback** to AI Personalized Suggestions. When AI suggestions are available, Mode A is suppressed.

### V2 Style-Aware Templates

Mode A uses **style-aware templates** (`MODE_A_TEMPLATES_V2`) that can vary copy based on the scanned item's style vibe:

```typescript
// Style vibe is resolved from the scanned item's style signals
const uiVibe = resolveUiVibeForCopy({
  styleTags: analysisResult?.styleTags,
  styleNotes: analysisResult?.styleNotes,
  explicitStyleFamily: analysisResult?.confidenceSignals?.style_family
});

// Bullet text is resolved based on vibe
const bulletText = resolveBulletTitle(bulletKey, uiVibe);
```

### When Mode A Is Used

Mode A suggestions appear as fallback in these scenarios:

1. **HIGH Tab** (Fallback when AI unavailable)
   - When: AI PAIRED suggestions fail or time out
   - Purpose: Optional expansion ideas
   - Filtering: **YES** - Filters out categories already covered by matches
   - Visibility: Only shown if bullets remain after filtering

2. **NEAR Tab** (Fallback when Mode B unavailable)
   - When: AI NEAR suggestions fail AND Mode B has no bullets
   - Purpose: Fallback guidance
   - Filtering: **NO** - Shows all bullets
   - Copy: Uses MEDIUM state copy ("To make this work")

3. **SOLO Mode** (Fallback when AI unavailable)
   - When: AI SOLO suggestions fail or time out
   - Purpose: Primary guidance on what would help
   - Filtering: **NO** - Shows all bullets
   - Copy: Uses "What to add first" section

4. **LOW State** (Primary when no wardrobe)
   - When: Empty wardrobe or engine failed
   - Purpose: Constructive guidance on what would help
   - Filtering: **NO** - Shows all bullets
   - Copy: Uses LOW state copy ("What would help")

### Category-Specific Templates

Mode A uses **category-specific templates** stored in `MODE_A_TEMPLATES_V2`. Each scanned category has its own template with:
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

**Important:** Mode B is a **fallback** to AI Personalized Suggestions on the NEAR tab. When AI NEAR suggestions are available, Mode B is suppressed.

### V2 Style-Aware, Deterministic Generation

Mode B now uses **deterministic bullet selection** (no `Math.random()`) and **style-aware templates** (`MODE_B_COPY_BY_REASON`):

```typescript
// Deterministic selection via buildModeBBullets()
const bullets = buildModeBBullets(capReasons, uiVibe, {
  maxBullets: 3,
  minBullets: 2,
  excludedReasons: ['TEXTURE_CLASH']
});
```

**Key V2 Changes:**
- **Deterministic**: Always picks first bullet per reason (no randomness = no UI flicker)
- **Style-aware**: Bullet text varies by vibe (e.g., "minimal" vs "feminine" copy)
- **Stable sorting**: Reasons sorted by priority, then stable order

### When Mode B Is Used

Mode B suggestions appear as fallback on the **NEAR tab**:
- AI NEAR suggestions failed or timed out
- Near-matches exist (capped HIGH or strong MEDIUM)
- Mode B takes priority over Mode A on NEAR tab

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
- Filter excluded reasons (TEXTURE_CLASH, SHOES_CONFIDENCE_DAMPEN when shoes scanned)
- Sort by priority (descending), then stable order

**Cap Reason Priority:**
```
FORMALITY_TENSION: 5 (highest)
STYLE_TENSION: 4
COLOR_TENSION: 3
USAGE_MISMATCH: 2
SHOES_CONFIDENCE_DAMPEN: 1 (excluded when shoes scanned)
TEXTURE_CLASH: 0 (always excluded from Mode B)
```

#### Step 3: Generate Bullets (Deterministic)

For each top reason (up to 3):
1. Look up template pool for that reason in `MODE_B_COPY_BY_REASON`
2. Resolve text based on style vibe using `resolveBulletTitle()`
3. Pick **first** bullet (deterministic, not random)
4. Add to bullets array

**Example Templates by Reason:**

**FORMALITY_TENSION:**
- "Keep the rest of the outfit at the same level of dressiness"
- "Balance formality across all pieces"

**STYLE_TENSION:**
- "Let one piece set the vibe, and keep the rest simple"
- "Choose one style direction and commit to it"

**COLOR_TENSION:**
- "Keep the other pieces neutral to avoid competing colors"
- "Let this piece be the color focus"

#### Step 4: Type 2b Fallback

If only Type 2b near-matches exist (no cap reasons):
- Use generic fallback bullets
- These are less specific since there's no cap reason to explain

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
| **When Used** | HIGH (fallback), NEAR (fallback), SOLO (fallback), LOW (primary) | NEAR tab (fallback) |
| **Example** | "Dark or structured bottoms" | "Keep outfit at same dressiness level" |

---

## Personalized AI Suggestions

### Overview

**Personalized Suggestions** are AI-generated styling guidance that provides context-aware advice based on the scanned item, matched wardrobe items, and overall wardrobe composition.

**Key characteristics:**
- Generated via Edge Function using GPT-4o-mini
- Three modes: PAIRED, NEAR, SOLO
- Cache-first with validation and repair
- Fail-open: Falls back to Mode A/B on failure

### Three AI Modes

| Mode | UI State | Sections | When Used |
|------|----------|----------|-----------|
| **PAIRED** | HIGH | "Why it works" + "To elevate" | User has HIGH matches |
| **NEAR** | MEDIUM | "Why it's close" + "How to upgrade" | User has NEAR matches only |
| **SOLO** | SOLO | "How to style it" + "What to add first" | No matches but has wardrobe |

### Response Schema

```typescript
interface PersonalizedSuggestions {
  version: 1;
  why_it_works: Array<{
    text: string;
    mentions: string[];  // Item IDs mentioned
  }>;
  to_elevate: Array<{
    text: string;
    recommend: {
      type: 'consider_adding';
      category: Category;
      attributes: string[];
    };
  }>;
}
```

### Cache Strategy

```typescript
// Cache key includes all inputs that affect output
const cacheKey = sha256([
  scanId,
  topMatchIds,
  nearMatchIds,
  wardrobeSummary.updated_at,
  PROMPT_VERSION,  // Currently 3
  SCHEMA_VERSION,  // Currently 2
  mode,            // 'paired' | 'near' | 'solo'
  scanCategory,
  preferAddOns
].join('|'));
```

**Cache behavior:**
- Cache hit still runs validation/repair
- Timeout: 7500ms (slightly under Edge Function 8000ms)
- Telemetry tracks `source: 'ai_call' | 'cache_hit'`

### Validation & Repair

The service validates and repairs AI responses:
- Ensures `mentions` reference valid item IDs
- Filters `to_elevate` categories by scan category
- Backfills missing bullets with deterministic fallbacks
- Bumps schema version on structural changes

### Mode-Specific Behavior

**PAIRED Mode (HIGH tab):**
- Mentions HIGH match items in "Why it works"
- "To elevate" suggests optional add-ons
- Add-ons preference when add-ons strip visible

**NEAR Mode (NEAR tab):**
- Mentions NEAR match items
- "How to upgrade" suggests styling improvements
- No add-ons preference (focus on making outfit work)

**SOLO Mode (No matches):**
- No item mentions (nothing matched)
- "How to style it" gives general styling advice
- "What to add first" prioritizes core categories

### UI Integration

```typescript
// In results.tsx
const aiSuggestionsResult = useQuery({
  queryKey: ['personalized-suggestions', scanId, mode],
  queryFn: () => fetchPersonalizedSuggestions({
    scanId,
    mode,
    topMatchIds: highMatches.map(m => m.itemId),
    nearMatchIds: nearMatches.map(m => m.itemId),
    wardrobeSummary,
    scanCategory,
    preferAddOns: addOnsVisible && mode === 'paired'
  }),
  enabled: !!scanId && wardrobeCount > 0
});

// Render PersonalizedSuggestionsCard when data available
{aiSuggestionsResult.data && (
  <PersonalizedSuggestionsCard
    mode={mode}
    suggestions={aiSuggestionsResult.data}
    wardrobeItems={wardrobeItems}
  />
)}
```

### Fallback Behavior

When AI suggestions fail or time out:

| Mode | Fallback |
|------|----------|
| PAIRED | Mode A (filtered by covered categories) |
| NEAR | Mode B → Mode A |
| SOLO | Mode A (unfiltered) |

**Suppression:** Mode A/B is suppressed while AI suggestions are loading or present.

---

## Outfit Ideas Display

### Overview

The **Outfit Ideas Section** displays assembled outfit combinations using the scanned item plus wardrobe matches. It provides a visual way to see complete looks.

### Display by Tab

| Tab | Title | Badge | Outfit Selection |
|-----|-------|-------|------------------|
| **HIGH ("Wear now")** | "Outfits you can wear now" | None | ❌ No |
| **NEAR ("Worth trying")** | "Outfits worth trying" | MEDIUM badge | ✅ Yes |

### Outfit Assembly

Outfits are assembled by the **Combo Assembler** (`src/lib/combo-assembler.ts`):
- Fills slots (TOP, BOTTOM, SHOES, DRESS) with matching items
- Applies coherence filtering (no conflicting pieces)
- Ranks by tier floor and average score
- Returns top combos with tier badges

### NEAR Tab Outfit Selection

On the NEAR tab, users can **select a specific outfit** to get precise Mode B bullets:

```typescript
// When user taps an outfit
const selectedOutfit = outfitCombos[selectedIndex];

// Mode B bullets are generated for that specific outfit's cap reasons
const bullets = getModeBBullets(selectedOutfit, nearMatches, uiVibe);
```

**Behavior:**
- Selection clears on tab switch or scan change
- "Show all" chip appears when outfit selected
- Tapping "Show all" clears selection and shows aggregate bullets

### Missing Pieces Card

When outfits can't be formed (missing essential slots):

```typescript
<MissingPiecesCard
  missingSlots={['BOTTOM', 'SHOES']}
  scannedCategory="tops"
/>
```

**Shows:**
- Which slots are missing
- CTA to add missing categories to wardrobe

---

## Optional Add-ons Strip

### Overview

The **Optional Add-ons Strip** displays HIGH-tier optional category matches (outerwear, bags, accessories) as a horizontal scrollable strip.

### Visibility Rules

| Condition | Visible |
|-----------|---------|
| HIGH tab | ✅ Yes (if add-ons exist) |
| NEAR tab | ❌ No (focus on making outfit work) |
| SOLO mode | ❌ No |
| LOW state | ❌ No |

### AI-Aware Sorting

When AI suggestions are available, add-ons are sorted to match AI recommendations:

```typescript
// If AI suggests "outerwear" in to_elevate
// → outerwear items appear first in the strip
const sortedAddOns = sortAddOnsByAiPreference(
  addOnMatches,
  aiSuggestions.to_elevate
);
```

### Display

- Horizontal scroll with category icons
- Title changes: "Optional add-ons" → "Suggested add-ons" (when AI eligible)
- Tapping opens item detail

---

## Fallback Chains Summary

This section summarizes all fallback behaviors in the system.

### Suggestions Fallback (by Tab/Mode)

```
HIGH Tab:
  AI PAIRED → Mode A (filtered) → Nothing

NEAR Tab:
  AI NEAR → Mode B → Mode A (unfiltered)

SOLO Mode:
  AI SOLO → Mode A (unfiltered)

LOW State:
  Mode A (unfiltered)
```

### Mode B Bullet Generation

```
Type 2a near-matches (has cap_reasons)
  → Cap reason-based bullets
    ↓ no Type 2a
Type 2b near-matches (strong MEDIUM)
  → Generic fallback bullets
    ↓ no near-matches
Mode A fallback
```

### Near-Match Selection

```
Type 2a: raw_score ≥ HIGH_THRESHOLD && cap_reasons.length > 0
  ↓ none found
Type 2b: raw_score ≥ 0.70 && !TEXTURE_CLASH
```

### Trust Filter

```
Trust Filter evaluation (10s timeout, rarely hit due to parallel pre-fetch)
  ↓ signals unavailable
Pass-through (all HIGH matches kept)
```

### Key Principle

**Fail-open design:** When AI, Trust Filter, or signals fail, the system falls back to deterministic alternatives (Mode A/B) ensuring users always see actionable content.

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

## AI Models & Performance

### AI Model Configuration

The system uses different AI models optimized for each task:

| Edge Function | Model | Purpose | Avg Latency |
|---------------|-------|---------|-------------|
| `analyze-image` | Claude Sonnet 4.5 | Basic clothing analysis (category, colors, style signals) | ~2-4s |
| `style-signals` | Claude Sonnet 4.5 | Trust Filter signals (aesthetic, formality, statement) | ~4.3s |
| `personalized-suggestions` | GPT-4o-mini | AI styling suggestions (PAIRED/NEAR/SOLO modes) | ~2-3s |
| `ai-safety-check` | GPT-4o | Outfit pairing safety validation | ~1-2s |

**Why Claude for Vision Tasks:**
- Faster latency (~4.3s vs ~8s for GPT-4o Vision)
- Better style interpretation accuracy
- More nuanced aesthetic understanding

**Why GPT-4o-mini for Suggestions:**
- Good quality for text generation
- Fast and cost-effective
- Sufficient for structured response generation

### Performance Timeline

Optimizations reduced scan-to-results time significantly:

```
ORIGINAL (~27s):
  analyze-image ────▶ 2-4s
  CE + TF start
  style-signals ────▶ 8-15s (GPT-4o, sequential)
  AI suggestions ───▶ 5-6s
  TOTAL: ~27s

AFTER PARALLEL OPTIMIZATION (~17s):
  analyze-image ────┐
                    ├──▶ 8-15s (parallel, but GPT-4o still slow)
  style-signals ────┘
  CE + TF (cache hit)
  AI suggestions ───▶ 5-6s
  TOTAL: ~17s

AFTER CLAUDE MIGRATION (~12-15s):
  analyze-image ────┐
                    ├──▶ ~4s (parallel + Claude is faster)
  style-signals ────┘
  CE + TF (cache hit) ▶ instant
  AI suggestions ───▶ 2-3s
  TOTAL: ~12-15s
```

### Related Documentation

- [Parallel Style Signals](docs/handoff/parallel-style-signals-COMPLETE.md) - Pre-fetch optimization
- [Claude Migration](docs/handoff/claude-sonnet-migration-COMPLETE.md) - GPT-4o → Claude switch

---

## Summary

### Key Principles

1. **Trust Preservation**: Only show HIGH matches; Trust Filter prevents misleading pairings
2. **Fail-Open Design**: When AI or Trust Filter fails, deterministic fallbacks ensure content
3. **AI-First Suggestions**: AI Personalized Suggestions preferred, Mode A/B as fallback
4. **Tab-Based Navigation**: "Wear now" (HIGH) and "Worth trying" (NEAR) tabs
5. **SOLO Mode Support**: Styling guidance even when no matches exist
6. **Context Awareness**: Empty wardrobe shows different messaging

### Decision Flow Summary

```
User scans item
    ↓
Confidence Engine evaluates
    ↓
Trust Filter processes HIGH matches
  (keep / demote / hide)
    ↓
┌─────────────────────────────────────────┐
│ Core HIGH matches after Trust Filter?    │
│   YES → "Wear now" tab                   │
│         AI PAIRED suggestions            │
│         (fallback: Mode A filtered)      │
│   NO  → Continue                         │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Core NEAR matches exist?                 │
│   YES → "Worth trying" tab               │
│         AI NEAR suggestions              │
│         (fallback: Mode B → Mode A)      │
│   NO  → Continue                         │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Wardrobe has items?                      │
│   YES → SOLO mode                        │
│         AI SOLO suggestions              │
│         (fallback: Mode A unfiltered)    │
│   NO  → LOW state                        │
│         Empty wardrobe guidance          │
└─────────────────────────────────────────┘
```

### System Files

**Core Engine:**
- `src/lib/confidence-engine/` - Confidence engine implementation
- `src/lib/useConfidenceEngine.ts` - React hook integration

**Trust Filter:**
- `src/lib/trust-filter/` - Trust Filter module (evaluate, config, helpers)
- `src/lib/useTrustFilter.ts` - Trust Filter React hook
- `src/lib/style-signals-service.ts` - Style signals generation and caching

**Personalized Suggestions:**
- `src/lib/personalized-suggestions-service.ts` - AI suggestions service
- `src/components/PersonalizedSuggestionsCard.tsx` - AI card UI component

**UI Policy:**
- `src/lib/results-ui-policy.ts` - Single source of truth for UI rendering
- `src/lib/useResultsTabs.ts` - Tab state management

**Suggestions (Fallback):**
- `src/lib/confidence-engine/suggestions.ts` - Mode A/B V2 generation
- `src/lib/confidence-engine/config.ts` - V2 templates and configuration

**Outfit Assembly:**
- `src/lib/combo-assembler.ts` - Outfit combination assembly
- `src/lib/useComboAssembler.ts` - Combo assembler hook

**UI Components:**
- `src/app/results.tsx` - Results screen implementation
- `src/components/OutfitIdeasSection.tsx` - Outfit display component
- `src/components/OptionalAddOnsStrip.tsx` - Add-ons strip component
- `src/components/MissingPiecesCard.tsx` - Missing pieces guidance

**Related Documentation:**
- `docs/handoff/personalized-suggestions-COMPLETE.md` - AI suggestions handoff
- `docs/handoff/parallel-style-signals-COMPLETE.md` - Parallel pre-fetch optimization
- `docs/handoff/claude-sonnet-migration-COMPLETE.md` - Claude Sonnet 4.5 migration
- `docs/STYLE_AWARE_SUGGESTIONS_SPEC.md` - V2 suggestions specification
- `docs/specs/CONFIDENCE_ENGINE.md` - Engine specification

---

**This document is the complete reference for understanding how the Confidence Engine, Trust Filter, AI Suggestions, and Results Screen UI work together.**

