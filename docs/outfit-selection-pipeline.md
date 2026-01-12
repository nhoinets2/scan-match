# Outfit Selection Pipeline

> **Last updated:** January 2026  
> **Status:** Production-ready (Phase 1)

This document describes the outfit selection pipeline that determines which outfits are shown to users in the "Wear now" and "Worth trying" tabs.

---

## Table of Contents

1. [Overview](#overview)
2. [Pipeline Stages](#pipeline-stages)
3. [Stage 1: Outfit Coherence Filter](#stage-1-outfit-coherence-filter)
4. [Stage 2: Tier Floor Split](#stage-2-tier-floor-split)
5. [Stage 3: Ranking](#stage-3-ranking)
6. [Stage 4: Diversity Picker](#stage-4-diversity-picker)
7. [Stage 5: Display Caps](#stage-5-display-caps)
8. [Dev Tools](#dev-tools)
9. [Testing](#testing)
10. [Future Work](#future-work)

---

## Overview

The outfit selection pipeline transforms raw outfit combinations (combos) from the Combo Assembler into a curated, user-friendly list. The goal is to:

- **Remove incoherent outfits** (e.g., sport pants + heels)
- **Rank outfits by quality** (fewer weak links = better)
- **Ensure diversity** (don't show 3 outfits that only differ by shoes)
- **Cap display count** (prevent scroll fatigue)

### Architecture

```
┌─────────────────────┐
│   Combo Assembler   │  ← Generates all valid outfit combinations
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Coherence Filter   │  ← Removes/demotes incoherent combos (Stage 1)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Tier Floor Split   │  ← HIGH → Wear now, MEDIUM → Worth trying (Stage 2)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│      Ranking        │  ← penalty → mediumCount → avgScore (Stage 3)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Diversity Picker   │  ← Unique shoes/bottoms across shown cards (Stage 4)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    Display Caps     │  ← Max 3-5 outfits per tab (Stage 5)
└──────────┬──────────┘
           │
           ▼
        UI Render
```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/outfit-coherence.ts` | Coherence filter rules and helpers |
| `src/lib/useComboAssembler.ts` | Applies coherence filter, ranking |
| `src/lib/useResultsTabs.ts` | Tier split, diversity picker, caps |
| `src/app/results.tsx` | Renders outfits with display cap |

---

## Pipeline Stages

### Stage 1: Outfit Coherence Filter

**Location:** `src/lib/outfit-coherence.ts`, integrated in `useComboAssembler.ts`

The coherence filter removes or demotes outfits that have incoherent item pairings, even if each item individually scores well with the scanned item.

#### Hard Reject Rules (combo is removed)

| Rule | Condition | Example |
|------|-----------|---------|
| **S1** | Bottom/Dress ↔ Shoes: formality gap ≥ 2 bands | Casual joggers + formal heels |
| **S2** | Sporty bottom/dress + heels (always reject) | Track pants + stilettos |
| **TB1** | Top ↔ Bottom: formality gap ≥ 2 bands | Hoodie + formal trousers |

#### Soft Demote Rules (combo gets penalty, sorted lower)

| Rule | Condition | Example |
|------|-----------|---------|
| **S3** | Formal bottom/dress + athletic shoes | Tailored trousers + sneakers |

#### Exception Vibe Bypass

S1 and TB1 can be bypassed if either item has an "exception vibe":
- `streetwear`, `edgy`, `fashion-forward`, `statement`, `avant-garde`

S2 (sporty + heels) has **no bypass** — it's always rejected.

#### Formality Bands

```
formality_level 1-2 → Band 0 (casual)
formality_level 3   → Band 1 (smart-casual)
formality_level 4-5 → Band 2 (formal)
```

#### Shoe Type Inference

Since `shoe_profile` isn't always available, we infer shoe type from keywords:

**Formal shoes:** `heel, heels, stiletto, pump, pumps, high heel, kitten heel, oxford, derby, dress shoe, court shoe`

**Athletic shoes:** `sneaker, sneakers, trainer, trainers, running, runner, basketball, tennis shoe, athletic, sport, gym`

---

### Stage 2: Tier Floor Split

**Location:** `useResultsTabs.ts`

Combos are split by `tierFloor`:
- `tierFloor === 'HIGH'` → **Wear now** tab
- `tierFloor === 'MEDIUM'` → **Worth trying** tab
- `tierFloor === 'LOW'` → Excluded (not shown)

---

### Stage 3: Ranking

**Location:** `useComboAssembler.ts`

Combos are sorted by these keys (in order):

| Priority | Key | Direction | Notes |
|----------|-----|-----------|-------|
| 1 | `tierFloor` | HIGH > MEDIUM > LOW | Already split by tab |
| 2 | `penalty` | 0 before 1 | Coherence demote (S3) |
| 3 | `mediumCount` | Fewer first | Only for MEDIUM tierFloor |
| 4 | `avgScore` | Higher first | Quality tiebreaker |
| 5 | `combo.id` | Lexical | Stable tiebreaker |

#### MEDIUM-count Ranking

For Worth trying outfits, we prefer combos with fewer MEDIUM items:

```
[HIGH, HIGH, MEDIUM] (1 weak link) > [HIGH, MEDIUM, MEDIUM] (2) > [MEDIUM, MEDIUM, MEDIUM] (3)
```

This makes "almost there" outfits appear first.

---

### Stage 4: Diversity Picker

**Location:** `useResultsTabs.ts`

Prevents showing 3 outfits that only differ by one item (e.g., same top+bottom with different shoes).

#### Diversity Slot Selection

The diversity slot depends on the scanned category:

| Scanned Category | Diversity Slot |
|------------------|----------------|
| `shoes` | `BOTTOM` (or `DRESS`) |
| Everything else | `SHOES` |

#### Two-Pass Algorithm

```
Pass 1: Take combos with UNIQUE diversity slot items
Pass 2: Fill remaining slots with best remaining combos (repeats allowed)
```

**Example:**
```
Input: [combo-a (shoes-1), combo-b (shoes-1), combo-c (shoes-2), combo-d (shoes-3)]
Diversity on: SHOES
Max: 3

Pass 1: combo-a (shoes-1 unique), combo-c (shoes-2 unique), combo-d (shoes-3 unique)
Result: [combo-a, combo-c, combo-d]
```

If not enough unique items exist, Pass 2 fills with repeats.

---

### Stage 5: Display Caps

**Location:** `useResultsTabs.ts` (computed), `results.tsx` (applied)

| Scenario | Max Outfits per Tab |
|----------|---------------------|
| Single tab visible | 5 |
| Both tabs visible | 3 each |

The cap is applied at render time, after diversity selection.

---

## Dev Tools

### Selection Trace

Enable detailed logging to see why each outfit was selected:

```typescript
// In src/lib/useResultsTabs.ts
const DEBUG_SELECTION_TRACE = true; // Set to true for QA
```

#### Output Example

```javascript
[SelectionTrace] Wear now outfits: [
  { rank: 1, comboId: "abc123", tierFloor: "HIGH", penalty: 0, avgScore: "0.872" },
  { rank: 2, comboId: "def456", tierFloor: "HIGH", penalty: 0, avgScore: "0.845" },
]

[SelectionTrace] Worth trying outfits: [
  { rank: 1, comboId: "xyz789", tierFloor: "MEDIUM", penalty: 0, mediumCount: 1, 
    diversitySlotId: "shoes-1", diversityPass: 1, avgScore: "0.756" },
  { rank: 2, comboId: "uvw321", tierFloor: "MEDIUM", penalty: 1, mediumCount: 2, 
    diversitySlotId: "shoes-2", diversityPass: 1, avgScore: "0.742" },
  { rank: 3, comboId: "rst654", tierFloor: "MEDIUM", penalty: 0, mediumCount: 3, 
    diversitySlotId: "shoes-1", diversityPass: 2, avgScore: "0.801" }, // Fill pass
]
```

#### Trace Fields

| Field | Meaning |
|-------|---------|
| `rank` | Display order (1 = first shown) |
| `penalty` | 0 = clean, 1 = coherence demoted |
| `mediumCount` | Count of MEDIUM tier items |
| `diversitySlotId` | Item ID used for diversity check |
| `diversityPass` | 1 = unique pick, 2 = fill (repeat) |
| `avgScore` | Quality score |

### Coherence Filter Logging

Always logged in `__DEV__` when combos are rejected:

```javascript
[ComboAssembler] Coherence filter: 3 rejected { S2_SPORTY_HEELS: 1, TB1_TOP_BOTTOM_CLASH: 2 }
```

### Ambiguous Shoe Inference Logging

Logged when shoe type can't be inferred from keywords:

```javascript
[OutfitCoherence] ambiguousShoesCount=2/5 [
  { id: "shoe-1", label: "Leather shoes", notes: ["brown"] },
  { id: "shoe-2", label: "Casual footwear", notes: null }
]
```

---

## Testing

### Test Files

| File | Coverage |
|------|----------|
| `src/lib/__tests__/outfit-coherence.test.ts` | Coherence rules (44 tests) |
| `src/lib/__tests__/combo-assembler.test.ts` | MEDIUM-count ranking (7 tests) |
| `src/lib/__tests__/useResultsTabs.test.ts` | Diversity, caps (22 tests) |

### Key Test Scenarios

#### Coherence Filter
- Sporty pants + heels → rejected (S2)
- Casual pants + formal shoes → rejected (S1) unless exception vibe
- Formal trousers + sneakers → demoted, not rejected (S3)
- Missing formality data → never reject (avoid false positives)

#### MEDIUM-count Ranking
- `[HIGH, HIGH, MEDIUM]` ranks above `[MEDIUM, MEDIUM, MEDIUM]`
- Penalty takes precedence over mediumCount
- HIGH outfits are unaffected

#### Diversity Picker
- Scanned shoes → diversify on bottoms
- Two-pass fills to target count
- Missing slot → always eligible

#### Display Caps
- Single tab → max 5
- Both tabs → max 3 each

### Running Tests

```bash
# All pipeline tests
npm test -- --testPathPatterns="outfit-coherence|combo-assembler|useResultsTabs" --no-coverage

# Specific suite
npm test -- --testPathPatterns="outfit-coherence" --no-coverage
```

---

## Future Work

### Phase 2 (Planned)

1. **"Try these shoes" consolidation UI**
   - When Worth trying outfits differ only by shoes, show 1 outfit card + shoe rail
   - Reduces visual duplication

2. **Bottom uniqueness in diversity picker**
   - Currently only diversifies on shoes (or bottoms if scanning shoes)
   - Add secondary diversity on bottoms

3. **Adaptive display caps**
   - If one tab has ≤2 outfits, let the other show up to 4
   - Needs product validation

### Monitoring

Watch these metrics in production:

| Metric | Signal |
|--------|--------|
| `TB1_TOP_BOTTOM_CLASH` rejection rate | If high, TB1 may be too strict |
| `ambiguousShoesCount` | If high, keyword coverage needs expansion |
| `0 outfits after coherence filter` warning | Filter may be too aggressive |

---

## Quick Reference

### Coherence Rules Summary

```
HARD REJECT:
  S1: |bottomBand - shoesBand| ≥ 2 (unless exception vibe)
  S2: sportyItem(bottom) && isHeelShoe(shoes) (no bypass)
  TB1: |topBand - bottomBand| ≥ 2 (unless exception vibe)

SOFT DEMOTE:
  S3: bottomBand === 2 && isAthleticShoe(shoes) → penalty = 1
```

### Sort Order Summary

```
1. tierFloor: HIGH > MEDIUM > LOW
2. penalty: 0 > 1
3. mediumCount: 1 > 2 > 3 (MEDIUM tierFloor only)
4. avgScore: higher > lower
5. id: lexical (stable tiebreaker)
```

### Diversity Summary

```
Scanned shoes  → diversify on BOTTOM/DRESS
Scanned other  → diversify on SHOES

Pass 1: unique items only
Pass 2: fill remaining (repeats OK)
```

