# Hybrid Schema: Volume + Shape + Length + Tier

## Overview

This document describes the hybrid schema implementation that replaces the ambiguous `silhouette` field with four separate, purpose-driven fields: `volume`, `shape`, `length`, and `tier`.

## Problem Statement

The previous schema had three conflicting `silhouette` definitions:

| Location | Values | Issue |
|----------|--------|-------|
| Main types | `fitted`, `relaxed`, `oversized` | Mixed volume with fit |
| Confidence Engine | `fitted`, `regular`, `oversized`, `unknown` | Different from main |
| Library | `fitted`, `straight`, `wide`, `oversized` | Mixes volume with shape |

This caused:
- Data mapping failures between systems
- Inconsistent UI terminology
- TypeScript unable to catch mismatches

## Solution: Four-Field Hybrid Schema

### Fields

| Field | Purpose | Universal? |
|-------|---------|-----------|
| `volume` | How garment fits body | Yes (all categories) |
| `shape` | Category-specific cut/style | No (category-scoped) |
| `length` | Garment length | No (category-scoped) |
| `tier` | Item classification for maintainability | Yes (all categories) |

### Volume (Universal)

```typescript
type Volume = "fitted" | "regular" | "oversized" | "unknown";
```

Used for:
- User preference alignment (FitPreference matching)
- Confidence Engine silhouette balance
- General fit classification

### Shape (Category-Specific)

```typescript
type BottomShape = "skinny" | "straight" | "wide" | "tapered" | "flare" | "cargo";
type SkirtShape = "pencil" | "a_line" | "pleated";
type DressShape = "slip" | "wrap" | "shirt" | "bodycon" | "fit_flare";
type ShoeShape = "low_profile" | "chunky" | "heeled" | "boot";
```

**Categories without shape**: tops, outerwear, bags, accessories
- Future expansion: Use dedicated fields like `neckline`, `outerwear_type`

### Length (Category-Specific)

```typescript
type TopLength = "cropped" | "regular" | "longline";
type OuterwearLength = "cropped" | "regular" | "long";
type SkirtDressLength = "mini" | "midi" | "maxi";
```

**Categories without length**: bottoms, shoes, bags, accessories

### Tier (Universal)

```typescript
type Tier = "core" | "staple" | "style" | "statement";
```

Tier provides maintainability and auditability for item rankings:

| Tier | Rank Range | Description |
|------|-----------|-------------|
| `core` | 10-29 | Universal basics (1-3 items per category) |
| `staple` | 30-59 | Versatile everyday pieces |
| `style` | 60-89 | Vibe-specific items |
| `statement` | 90+ | Bold, specific use cases |

**Key Principles:**
- Rank should never compensate for weak filters
- If a bulletKey implies "office/tailored", add structure/formality constraints
- Tier answers "why is this rank X?" without guessing

**Rank Spacing Rule:**
- Default ranks: 10, 20, 30, 40...
- Special inserts: 15, 25, 35... (reserve 5s for future insertions)

## Files Changed

### New Files

| File | Purpose |
|------|---------|
| `src/lib/schema-validation.ts` | Category-aware validators |
| `supabase/migrations/002_hybrid_schema.sql` | DB migration + insert templates |
| `docs/HYBRID_SCHEMA.md` | This documentation |

### Modified Files

| File | Changes |
|------|---------|
| `src/lib/types.ts` | Added `Volume`, `Shape`, `Length`, `Tier` types |
| `src/lib/inspiration/tipsheets.ts` | Updated `LibraryItemMeta`, `TargetFilters`; backfilled items; updated BUNDLE_RECIPES with stronger filters |
| `README.md` | Schema documentation in Dynamic Bundles section |

## Validation Helpers

Located in `src/lib/schema-validation.ts`:

### Lookup Tables

```typescript
// Which values are allowed per category
LENGTH_BY_CATEGORY: Record<Category, readonly string[]>
SHAPE_BY_CATEGORY: Record<Category, readonly string[]>
VOLUME_VALUES: readonly Volume[]
TIER_VALUES: readonly Tier[]
TIER_RANK_RANGES: Record<Tier, { min: number; max: number }>
```

### Validation Functions

```typescript
// Type guards
isValidVolume(volume: string | null | undefined): volume is Volume
isValidLength(category: Category, length: string | null | undefined): boolean
isValidShape(category: Category, shape: string | null | undefined): boolean
isValidTier(tier: string | null | undefined): tier is Tier

// Category checks
categoryHasLength(category: Category): boolean
categoryHasShape(category: Category): boolean

// Tier-rank helpers
isRankInTierRange(tier: Tier, rank: number): boolean
getTierForRank(rank: number): Tier

// Full record validation
validateLibraryItem(item: { category, volume?, shape?, length?, tier?, rank? }): LibraryItemValidation
```

### Mapping Functions

```typescript
// For preference alignment
volumeToFitPreference(volume: Volume): "slim" | "regular" | "oversized" | null

// For inferring volume from shape (only when strongly implied)
shapeToVolumeHint(shape: Shape): Volume | null
// Examples: "skinny" → "fitted", "wide" → "oversized", "straight" → null
```

## Migration Guide

### Database

1. Run `supabase/migrations/002_hybrid_schema.sql` to add columns
2. Insert items using the template in the migration file
3. Old columns (`silhouette`, `shoe_profile`) remain for backward compatibility

### Code

1. Import new types from `src/lib/types.ts`
2. Use validation helpers before DB writes
3. Use `volume` for preference matching, `shape`/`length` for recipe filtering

### Bundle Recipes

Update `TargetFilters` to use new fields:

```typescript
// OLD
TOPS__BOTTOMS_DARK_STRUCTURED: {
  targetFilters: { tone: "dark", structure: "structured", silhouette: "straight" }
}

// NEW
TOPS__BOTTOMS_TAILORED: {
  targetFilters: {
    tone: "dark",
    structure: "structured",
    volume: "fitted",
    shape: ["straight", "tapered"]
  }
}
```

## Backfill Strategy

When adding new items:

1. **If volume is unknown**: Set `volume = "unknown"`, omit shape/length
2. **Only fill shape/length when confident**
3. **Recipes should only filter by shape/length when coverage is high**

## Key Principles

1. **Never interpret length/shape without category context**
2. **Volume is universal, shape/length are category-scoped**
3. **Validate on write, fallback on read**
4. **Don't overload shape** - use dedicated fields for future expansion

## Deterministic Selection Rule

For bundle selection, always use this order:

```typescript
candidates.sort((a, b) => {
  // 1. Exact vibe match first
  const vs = vibeScore(b.vibes, vibe) - vibeScore(a.vibes, vibe);
  if (vs !== 0) return vs;

  // 2. Rank ascending
  const rs = (a.rank ?? 0) - (b.rank ?? 0);
  if (rs !== 0) return rs;

  // 3. ID for stable tie-breaking
  return String(a.id).localeCompare(String(b.id));
});
```

This guarantees: **same scan + same vibe + same bulletKey → same bundles**
