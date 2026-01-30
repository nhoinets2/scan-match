---
name: Fix SOLO and NEAR gating logic
overview: Revert SOLO mode logic to use coreNear instead of hasAnyNearMatches, and add gating to NEAR AI card to require at least 1 core NEAR match.
todos:
  - id: revert-solo-gating
    content: Revert SOLO mode gating to use coreNearMatches.length === 0 (ignore add-on near matches)
    status: completed
  - id: add-near-ai-gating
    content: Add gating to NEAR AI card fetch to require at least 1 core NEAR match
    status: completed
  - id: send-only-core-near
    content: Only send core NEAR matches to AI (not add-ons) so AI can only reference visible items
    status: completed
isProject: false
---

# Fix SOLO and NEAR Mode Gating Logic

## Problem

Current logic (after recent fix) prevents SOLO mode when there are ANY near matches (even add-ons). But since we removed add-ons from NEAR tab, we should ignore add-on matches for both SOLO and NEAR gating.

## Parallel with HIGH/PAIRED Tab

HIGH/PAIRED tab already follows this pattern:

```typescript
// PAIRED mode: need at least one CORE high match
const canFetchPairedAi = coreHighMatches.length > 0;
```

NEAR tab should follow the same pattern - require at least 1 CORE near match.

## Gating Logic Summary

| Mode | Gating Condition | When it Triggers |

|------|------------------|------------------|

| PAIRED | `coreHighMatches.length > 0` | At least 1 core HIGH match |

| NEAR AI | `coreNearMatches.length > 0` | At least 1 core NEAR match |

| SOLO | `coreHigh === 0 && coreNear === 0` | No core matches at all |

All three modes ignore add-on matches (accessories, bags, outerwear) for gating purposes.

## Solution

### 1. Revert SOLO Mode Gating

**File:** [src/app/results.tsx](src/app/results.tsx)

Change back to original core-based logic:

```typescript
// BEFORE (my recent fix - wrong):
const hasAnyNearMatches = trustFilterResult.finalized.nearFinal.length > 0;
const canFetchSoloAi = ... && !hasAnyNearMatches;

// AFTER (correct):
const canFetchSoloAi = ... && coreNearMatches.length === 0;
```

### 2. Add NEAR AI Card Gating

**File:** [src/app/results.tsx](src/app/results.tsx)

Find the NEAR AI suggestions fetch effect (around line 2570) and add gating:

```typescript
// Only fetch NEAR AI suggestions if there's at least 1 CORE near match
const coreNearForAi = nearFinal.filter(m => 
  isCoreCategory(m.wardrobeItem.category as Category)
);

if (coreNearForAi.length === 0) {
  // No core NEAR matches - skip NEAR AI (SOLO will handle it)
  setNearSuggestionsResult(null);
  setNearSuggestionsLoading(false);
  return;
}
```

## Expected Behavior

| Scenario | SOLO Mode | NEAR AI Card |

|----------|-----------|--------------|

| 0 core HIGH + 0 core NEAR + 3 accessory NEAR | YES | NO |

| 0 core HIGH + 1 core NEAR + 2 accessory NEAR | NO | YES |

| 1 core HIGH + 0 core NEAR | NO (paired) | NO |

| 0 core HIGH + 0 core NEAR + 0 accessory NEAR | YES | NO |

## Files Modified

- [src/app/results.tsx](src/app/results.tsx)
  - Line ~2425: Revert SOLO gating to use `coreNearMatches.length === 0`
  - Line ~2570: Add core NEAR check before fetching NEAR AI suggestions

## Implementation Status

**Phase 1 COMPLETED** - Commit `92864e6` pushed to `origin/main`

Changes:

1. SOLO mode gating reverted to check `coreNearMatches.length === 0` (ignores add-on near matches)
2. NEAR AI card fetch gated to require at least 1 core NEAR match
3. Debug logging updated to show add-on match counts

---

## Phase 2: Only Send Core NEAR Matches to AI

**COMPLETED** - Commit `dac50e5` pushed to `origin/main`

### Problem

We were sending ALL near matches (core + add-ons) to the AI, but we don't show add-ons on NEAR tab. So AI could reference items the user can't see.

### Solution

Changed line 2638 in `src/app/results.tsx`:

```typescript
// BEFORE:
nearFinal: nearFinal, // ALL near matches (core + add-ons)

// AFTER:
nearFinal: coreNearMatches, // Only CORE near matches (visible items only)
```

This ensures AI can only reference items that are visible on the NEAR tab.