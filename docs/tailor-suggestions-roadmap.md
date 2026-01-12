# Tailor Suggestions - Feature Roadmap

> **Status:** Phase 1 shipped ✅  
> **Last updated:** January 2026

## Overview

The "Tailor Suggestions" feature lets users pick favorite stores so we can prioritize them when shopping suggestions launch. Phase 1 captures preferences; Phase 2+ will act on them.

---

## Phase 1 (Shipped) ✅

### Components
- `TailorSuggestionsCard` — Bottom card on Results screen (both tabs)
- `FavoriteStoresModal` — Chip-based store picker (up to 5)

### Features
| Feature | Implementation |
|---------|----------------|
| Store selection | 26-store catalog, chip grid, max 5 |
| Persistence | `AsyncStorage` with user-scoped keys (`storePreference.v1.{userId}`) |
| ID normalization | Canonical IDs (`zara`, `hm`) + label display |
| Migration safety | Auto-converts old labels → IDs on read |
| User isolation | Each user's preferences stored separately by user ID |
| "Coming soon" pill | Always visible on card |
| "New" dot | Shows until first modal open |
| Dynamic subtitle | `Saved: Zara • H&M • Uniqlo +2` |
| Save validation | Disabled when no changes (sorted array compare) |
| Toast confirmation | "Saved. We'll use these when store picks launch." |

### Analytics Events
| Event | Properties |
|-------|------------|
| `tailor_card_tapped` | `tab`, `hasSavedStores` |
| `store_pref_modal_opened` | `existingStoreCount` |
| `store_pref_store_selected` | `storeName` |
| `store_pref_store_removed` | `storeName` |
| `store_pref_saved` | `storeCount` |
| `store_pref_dismissed` | `method` (`x` / `backdrop`), `storeCount` |

### Files
- `src/lib/store-preferences.ts` — Storage, hooks, helpers
- `src/components/TailorSuggestionsCard.tsx` — Bottom card UI
- `src/components/FavoriteStoresModal.tsx` — Modal UI

---

## Phase 2 (Not Implemented)

### When to Trigger Phase 2

Use analytics to decide:

| Signal | Action |
|--------|--------|
| Many users open modal but save 0 stores | → **Expand catalog** or **add search** |
| Users pick stores and return to results often | → **Add notify toggle** |
| Users type in search looking for unlisted stores | → **Add custom store entry** |

---

### 2A: Search + Expanded Catalog

**Trigger:** `store_pref_modal_opened` high, `store_pref_saved` low (users can't find their store)

**Scope:** ~2 hours

#### Changes
1. Add search input at top of modal
   - Placeholder: `Type a store…`
   - Filters visible chips as user types
   - Shows "No matches" if nothing found

2. Expand `STORE_CATALOG` to 30-50 stores
   - Add regional stores (EU, APAC, etc.)
   - Add premium tier (Nordstrom, Net-a-Porter, etc.)
   - Add budget tier (Shein, Primark, etc.)

3. Optional: "More stores" collapsible section
   - Top 12 always visible
   - "Show more" reveals full list

#### Data Model
No changes needed — catalog is already extensible.

#### UI Spec
```
┌─────────────────────────────────────┐
│ Favorite stores (up to 5)        ✕  │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 🔍 Type a store…                │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [Zara] [H&M] [Uniqlo]              │
│ [Mango] [COS] [Nike]               │
│ ...                                 │
│                                     │
│        ▼ Show more stores           │
└─────────────────────────────────────┘
```

---

### 2B: Notify Toggle

**Trigger:** High engagement with store selection + repeat visits

**Scope:** ~1 hour (storage only), ~4 hours (with push)

#### Changes
1. Add toggle row in modal footer:
   ```
   [ ] Notify me when store picks are available
   ```

2. Store preference:
   ```typescript
   interface StorePreference {
     favoriteStores: string[];
     notifyOnStorePicksAvailable: boolean; // NEW
     updatedAt: string;
   }
   ```

3. Phase 2B-1: In-app only
   - Store boolean, show visual confirmation
   - Later query this flag to show in-app banner when feature launches

4. Phase 2B-2: Push notifications
   - Request push permission when toggle ON
   - Register for `store_picks_launched` topic
   - Send push when feature ships

#### Analytics
| Event | Properties |
|-------|------------|
| `store_pref_notify_toggled` | `enabled: boolean` |

---

### 2C: Custom Store Entry

**Trigger:** Search shows "No matches" frequently for same queries

**Scope:** ~2 hours

#### Changes
1. When search has no matches, show:
   ```
   Add "Everlane" as custom store
   ```

2. Custom stores stored as user-typed string (title-cased)

3. Display in subtitle same as catalog stores

#### Considerations
- Custom stores won't have shopping integration initially
- May need moderation if we ever use these names publicly
- Consider "Other" bucket instead of free-form entry

---

### 2D: "Not now" Button

**Trigger:** Optional polish

**Scope:** ~15 minutes

#### Changes
Add secondary button in modal footer:

```
┌─────────────────────────────────────┐
│                                     │
│  [Not now]              [Save]      │
│                                     │
└─────────────────────────────────────┘
```

- Same behavior as X / backdrop dismiss
- Analytics: `store_pref_dismissed` with `method: "not_now"`

---

## Future: Store-Based Shopping Suggestions

When ready to ship actual shopping suggestions:

1. **Backend integration**
   - Fetch products from selected stores' APIs/feeds
   - Filter by scanned item category + style

2. **Results screen integration**
   - New section: "Shop similar items"
   - Prioritize user's favorite stores
   - Show store logo + price + link

3. **Remove "Coming soon" pill**
   - Update `TailorSuggestionsCard` copy
   - Change CTA from "Tailor suggestions" to "Manage stores"

4. **Notify users who opted in**
   - In-app banner for `notifyOnStorePicksAvailable: true`
   - Push notification if permission granted

---

## Store Catalog Reference

Current catalog (26 stores):

| ID | Label | Region |
|----|-------|--------|
| `zara` | Zara | Global |
| `hm` | H&M | Global |
| `uniqlo` | Uniqlo | Global |
| `mango` | Mango | Global |
| `cos` | COS | Global |
| `massimo_dutti` | Massimo Dutti | Global |
| `other_stories` | & Other Stories | Global |
| `asos` | ASOS | Global |
| `zalando` | Zalando | EU |
| `target` | Target | US |
| `nordstrom` | Nordstrom | US |
| `gap` | Gap | US |
| `old_navy` | Old Navy | US |
| `aritzia` | Aritzia | US/CA |
| `abercrombie` | Abercrombie | US |
| `american_eagle` | American Eagle | US |
| `aerie` | Aerie | US |
| `jcrew` | J.Crew | US |
| `madewell` | Madewell | US |
| `everlane` | Everlane | US |
| `marks_spencer` | Marks & Spencer | UK/EU |
| `next` | Next | UK/EU |
| `reserved` | Reserved | EU |
| `nike` | Nike | Global |
| `adidas` | adidas | Global |
| `lululemon` | Lululemon | Global |

### Future expansion candidates

**Budget:**
- Shein, Primark, Forever 21, Boohoo

**Premium:**
- Net-a-Porter, Farfetch, SSENSE, Matches

**Regional:**
- Depop (resale), ThredUp (resale)
- About You (DE), La Redoute (FR)
- Muji (JP), GU (JP)

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Jan 2026 | Ship Phase 1 without search | 16 stores covers majority; analytics will show if more needed |
| Jan 2026 | No notify toggle in Phase 1 | No push infra yet; avoid promising notifications |
| Jan 2026 | No custom store entry | Complexity + no shopping integration for custom stores |
| Jan 2026 | **Critical fix:** User-scoped storage keys | Preferences were shared across accounts; now scoped by user ID |
| Jan 2026 | Expanded catalog to 26 stores | Added US mid/trendy + EU stores for better coverage |

