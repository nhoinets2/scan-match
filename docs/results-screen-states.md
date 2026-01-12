# Results Screen States & Empty State Rules

This document describes how the results screen determines what to display based on wardrobe state, match tiers, and available suggestions.

## Overview

The results screen UI is driven by **`buildResultsRenderModel()`** in `src/lib/results-ui-policy.ts`. This function is the **single source of truth** for:

- Which sections are visible
- What variant each section uses
- Whether fallback CTAs are shown

## Key Inputs

| Input | Description |
|-------|-------------|
| `confidenceResult.evaluated` | Whether the Confidence Engine successfully ran |
| `confidenceResult.highMatchCount` | Number of HIGH-tier matches (score ≥ 0.85) |
| `confidenceResult.nearMatchCount` | Number of NEAR/MEDIUM-tier matches (score 0.70–0.85) |
| `confidenceResult.modeASuggestions` | "What to add" suggestions (e.g., "Add bottoms") |
| `confidenceResult.modeBSuggestions` | "How to style" suggestions (e.g., "Keep it simple") |
| `wardrobeCount` | Total items in user's wardrobe |

## UI State Determination

The `uiState` is derived from match counts:

```typescript
function getUiState(confidenceResult): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (confidenceResult.highMatchCount > 0) return 'HIGH';
  if (confidenceResult.nearMatchCount > 0) return 'MEDIUM';
  return 'LOW';
}
```

## Section Visibility Rules

### 1. Matches Section

The matches section has three variants:

| Variant | Condition | What Shows |
|---------|-----------|------------|
| `'matches'` | `uiState === 'HIGH' && matches.length > 0` | Wardrobe items that match |
| `'empty-cta'` | `wardrobeCount === 0` | "Build your wardrobe" CTA |
| `'hidden'` | All other cases | Nothing |

**Key insight**: The matches section only shows actual matches for HIGH tier. For MEDIUM/LOW, it's hidden (wardrobe items appear in the "Worth trying" tab instead).

### 2. Suggestions Section

Suggestions visibility depends on UI state and available content:

| UI State | Mode | Visible When |
|----------|------|--------------|
| HIGH | A | `modeASuggestions.bullets.length > 0` |
| MEDIUM | B | `modeBSuggestions.bullets.length > 0` |
| MEDIUM | A (fallback) | Mode B empty but `modeASuggestions.bullets.length > 0` |
| LOW | A | `modeASuggestions.bullets.length > 0` |

**Mode A** = "What to add" (category-based suggestions like "Add bottoms")
**Mode B** = "How to style" (pairing tips like "Keep it simple")

### 3. Rescan CTA

The rescan CTA is a **fallback** shown only when nothing else is actionable:

```typescript
const hasActionableContent = matchesSectionVisible || suggestionsVisible;
const showRescanCta =
  confidenceResult.evaluated &&
  wardrobeCount > 0 &&
  !hasActionableContent;
```

**This triggers when:**
- Engine evaluated successfully
- User has wardrobe items (not a new user)
- But no matches section OR suggestions section is visible

## Complete Scenario Matrix

| # | Wardrobe | HIGH | NEAR | Mode A | Mode B | What Shows |
|---|----------|------|------|--------|--------|------------|
| 1 | 0 | 0 | 0 | exists | — | `empty-cta` + Mode A suggestions |
| 2 | 0 | 0 | 0 | null | — | `empty-cta` only |
| 3 | > 0 | 0 | 0 | exists | — | Mode A suggestions only |
| 4 | > 0 | 0 | 0 | null | — | **Rescan CTA** |
| 5 | > 0 | 0 | > 0 | — | exists | Mode B suggestions |
| 6 | > 0 | 0 | > 0 | exists | null | Mode A suggestions (fallback) |
| 7 | > 0 | 0 | > 0 | null | null | **Rescan CTA** |
| 8 | > 0 | > 0 | any | exists | — | Matches + Mode A suggestions |
| 9 | > 0 | > 0 | any | null | — | Matches only |

### Scenario Details

#### Scenario 1: New User, First Scan
- **State**: `wardrobeCount = 0`, no matches
- **Shows**: 
  - Matches section with `empty-cta` variant ("Build your wardrobe")
  - Mode A suggestions ("Add bottoms to start...")
- **Rescan CTA**: No (empty-cta handles onboarding)

#### Scenario 3: Has Wardrobe, No Matches, Mode A Available
- **State**: `wardrobeCount > 0`, `HIGH = 0`, `NEAR = 0`, Mode A exists
- **Shows**: Mode A suggestions ("Add shoes that complement this top")
- **Rescan CTA**: No (Mode A is actionable content)

#### Scenario 4: Has Wardrobe, No Matches, No Suggestions
- **State**: `wardrobeCount > 0`, `HIGH = 0`, `NEAR = 0`, Mode A = null
- **Shows**: **Rescan CTA**
- **Copy**: "We couldn't find styling suggestions for this item. Try rescanning with better lighting, or add more items to your wardrobe."
- **Actions**: "Scan another" / "Add to wardrobe"

#### Scenario 5: MEDIUM Tier with Mode B
- **State**: `wardrobeCount > 0`, `HIGH = 0`, `NEAR > 0`, Mode B exists
- **Shows**: 
  - Worth trying tab (outfit ideas)
  - Mode B suggestions ("Keep the other pieces simple")
- **Rescan CTA**: No

#### Scenario 7: MEDIUM Tier, No Suggestions
- **State**: `wardrobeCount > 0`, `HIGH = 0`, `NEAR > 0`, Mode A = null, Mode B = null
- **Shows**: **Rescan CTA**
- **Note**: This is rare—Mode B is typically generated from cap reasons

## Mode A Suggestion Generation

Mode A suggestions are generated from the **scanned item's category**:

```typescript
// In useConfidenceEngine.ts
if (evaluation.suggestions_mode === 'A') {
  const rawModeA = generateModeASuggestionsV2(canonicalCategory, uiVibeForCopy);
  
  if (highMatchCount > 0) {
    // Filter out bullets for categories already covered by matches
    const filteredBullets = rawModeA.bullets.filter(
      bullet => !bullet.target || !coveredCategories.has(bullet.target)
    );
    if (filteredBullets.length > 0) {
      modeASuggestions = { intro: rawModeA.intro, bullets: filteredBullets };
    }
  } else {
    // No HIGH matches = show all Mode A suggestions
    modeASuggestions = rawModeA;
  }
}
```

**Key behavior**:
- HIGH tier: Bullets targeting already-matched categories are filtered out
- LOW/MEDIUM tier: All Mode A bullets are shown (no filtering)

## Mode B Suggestion Generation

Mode B suggestions are generated from **cap reasons** on NEAR matches:

```typescript
// In useConfidenceEngine.ts
if (evaluation.suggestions_mode === 'B' && evaluation.near_matches.length > 0) {
  const rawModeBSuggestions = generateOutfitModeBSuggestionsV2(
    evaluation.near_matches, 
    uiVibeForCopy
  );
  if (rawModeBSuggestions?.bullets?.length > 0) {
    modeBSuggestions = rawModeBSuggestions;
  }
}
```

Cap reasons include:
- `FORMALITY_TENSION` → "Keep the outfit at the same dressiness level"
- `STYLE_TENSION` → "Let one piece set the vibe, keep the rest simple"
- `COLOR_TENSION` → "Keep the other pieces neutral"

**Type 2b fallback**: If NEAR matches exist but have no cap reasons (score is naturally MEDIUM), a generic bullet is shown: "Keep the other pieces simple and versatile."

## Rescan CTA Details

When triggered, the Rescan CTA displays:

```tsx
<View style={cardStyle}>
  <Text>We couldn't find styling suggestions for this item</Text>
  <Text>Try rescanning with better lighting, or add more items to your wardrobe.</Text>
  <Button onPress={goToScan}>Scan another</Button>
  <Button onPress={goToWardrobe}>Add to wardrobe</Button>
</View>
```

**Dev logging**: When Rescan CTA triggers, a warning is logged:

```typescript
if (__DEV__ && renderModel.showRescanCta && confidenceResult.evaluated) {
  console.warn('[RenderModel] showRescanCta triggered - no actionable content', {
    showTabs, showHigh, showNear, highMatches, nearMatches, wardrobeCount
  });
}
```

## Invariant Assertions (Dev Mode)

The policy function includes dev assertions to catch bugs:

1. **highMatchCount mismatch**: `highMatchCount !== matches.length`
2. **HIGH state with no matches**: `uiState === 'HIGH' && matches.length === 0`
3. **empty-cta with non-empty wardrobe**: `variant === 'empty-cta' && wardrobeCount !== 0`
4. **Rescan CTA with visible sections**: `showRescanCta && (matchesVisible || suggestionsVisible)`

## Related Documentation

- [Empty State Messaging](./empty-state-messaging.md) — Blocking vs weak slot classification
- [Outfit Selection Pipeline](./outfit-selection-pipeline.md) — How outfits are assembled and filtered
- [Style-Aware Suggestions Spec](./STYLE_AWARE_SUGGESTIONS_SPEC.md) — Mode A/B copy templates

## Important Implementation Detail: Tab-Aware Suggestions

The `helpfulAdditionRows` logic in `results.tsx` is **tab-aware**:

```typescript
const hasNearContent =
  (tabsState.nearTab.nearMatches?.length ?? 0) > 0 ||
  (selectedNearOutfit?.candidates?.length ?? 0) > 0;

if (!isHighTab && hasNearContent) {
  // Use Mode B (styling tips)
  // Falls through to Mode A if Mode B is empty
}

// HIGH tab OR LOW tier (no NEAR content) OR Mode B empty: Use Mode A
```

**Critical guard**: In LOW tier, `isHighTab = false` (defaults to 'near' tab), but there's no NEAR content. Without the `hasNearContent` guard, the code would try Mode B logic, fail, and return empty—never reaching Mode A.

This ensures LOW tier users with wardrobe items still see Mode A suggestions.

## Code References

| File | Purpose |
|------|---------|
| `src/lib/results-ui-policy.ts` | Main policy function |
| `src/lib/useConfidenceEngine.ts` | Generates Mode A/B suggestions |
| `src/lib/confidence-engine/suggestions.ts` | Mode B bullet generation |
| `src/lib/confidence-engine/config.ts` | Mode A/B templates and priorities |
| `src/app/results.tsx` | Consumes render model, displays sections |
| `src/lib/__tests__/empty-state-helpful-additions.test.ts` | Regression tests for tab-aware logic |

