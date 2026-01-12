# Match Count Performance Optimization

## Current Implementation

The app uses the `useMatchCount` hook (`src/lib/useMatchCount.ts`) to dynamically recalculate match counts for scanned items against the user's current wardrobe.

### How It Works

```typescript
export function useMatchCount(check: RecentCheck, wardrobeItems: WardrobeItem[]): string {
  return useMemo(() => {
    // Recalculate matches against current wardrobe
    // Falls back to frozen snapshot if calculation fails
  }, [check.id, check.scannedItem, check.engineSnapshot, wardrobeItems]);
}
```

### Performance Characteristics

- **Memoized**: Only recalculates when check ID or wardrobe changes
- **Current scale**: ~20 scans × ~50 wardrobe items = ~1,000 pair evaluations
- **Timing**: ~0.1ms per recalculation (negligible)
- **Trigger**: Runs when user adds/removes wardrobe items

### Why This Is Sufficient

1. ✅ **Memoization prevents unnecessary recalculations**
   - Only runs when wardrobe actually changes
   - Not on every render or scroll
   
2. ✅ **Small data scale**
   - 20 scans max (quota enforced)
   - ~50 wardrobe items typical
   - Fast pair evaluation algorithm

3. ✅ **Best UX**
   - Always shows current, accurate counts
   - No stale data or confusing states
   - Consistent across all screens

4. ✅ **Simple implementation**
   - Single hook, easy to maintain
   - No edge cases or race conditions
   - Testable and reliable

---

## Future Optimization: Age-Based Recalculation

**⚠️ Only implement if performance becomes a measurable issue.**

### Problem Scenario

If users have:
- 100+ saved scans (via export/import feature)
- 200+ wardrobe items (power users)
- Older/slower devices

Then recalculating 100 × 200 = 20,000 pairs could cause noticeable lag when adding wardrobe items.

### Solution: Age-Based Strategy

Only recalculate match counts for **recent scans** (< 7 days old). Use frozen snapshot data for older scans.

**Rationale**: Users primarily care about match counts for recent scans. Scans from 3 months ago are just for reference.

### Implementation

Update `src/lib/useMatchCount.ts`:

```typescript
/**
 * Calculate match count for a check against current wardrobe
 * 
 * Performance optimization: Only recalculates for recent scans (< 7 days).
 * Older scans use frozen snapshot data for better performance.
 * 
 * @param check - The recent check with scanned item data
 * @param wardrobeItems - Current wardrobe items to evaluate against
 * @returns Formatted match count string (e.g., "3 matches", "1 match", "0 matches")
 */
export function useMatchCount(check: RecentCheck, wardrobeItems: WardrobeItem[]): string {
  return useMemo(() => {
    // Calculate age of scan
    const checkAge = Date.now() - new Date(check.createdAt).getTime();
    const daysSinceCheck = checkAge / (1000 * 60 * 60 * 24);
    
    // Only recalculate for recent scans (configurable threshold)
    const RECALC_THRESHOLD_DAYS = 7;
    const shouldRecalculate = daysSinceCheck < RECALC_THRESHOLD_DAYS;
    
    // Attempt to recalculate against current wardrobe (recent scans only)
    if (shouldRecalculate && check.scannedItem && wardrobeItems.length > 0) {
      try {
        const scannedItem = check.scannedItem as ScannedItem;
        
        // Convert items to confidence engine format
        const targetItem = scannedItemToConfidenceItem(scannedItem);
        const wardrobeConfidenceItems = wardrobeItems.map(wardrobeItemToConfidenceItem);
        
        // Evaluate against current wardrobe
        const evaluations = evaluateAgainstWardrobe(targetItem, wardrobeConfidenceItems);
        
        // Count by confidence tier
        const highCount = evaluations.filter(e => e.confidence_tier === 'HIGH').length;
        const nearCount = evaluations.filter(e => e.confidence_tier === 'MEDIUM').length;
        const totalMatches = highCount + nearCount;
        
        // Format display string
        if (totalMatches === 0) return "0 matches";
        if (totalMatches === 1) return "1 match";
        return `${totalMatches} matches`;
      } catch (error) {
        if (__DEV__) {
          console.warn('[useMatchCount] Failed to recalculate matches for check:', check.id, error);
        }
      }
    }
    
    // Use frozen snapshot data for old scans or if recalculation failed
    const snapshot = check.engineSnapshot;
    if (!snapshot?.engines?.confidence) return "";
    
    const highCount = snapshot.engines.confidence.matchesHighCount ?? 0;
    const nearCount = snapshot.engines.confidence.nearMatchesCount ?? 0;
    const totalMatches = highCount + nearCount;
    
    if (totalMatches === 0) return "0 matches";
    if (totalMatches === 1) return "1 match";
    return `${totalMatches} matches`;
  }, [
    check.id,
    check.createdAt, // Add createdAt to dependencies
    check.scannedItem,
    check.engineSnapshot,
    wardrobeItems,
  ]);
}
```

### Configuration Options

Adjust threshold based on usage patterns:

```typescript
// Conservative: Always fresh for week-old scans
const RECALC_THRESHOLD_DAYS = 7;

// Aggressive: Only recalculate today's scans
const RECALC_THRESHOLD_DAYS = 1;

// Balanced: Fresh for 2-week period
const RECALC_THRESHOLD_DAYS = 14;
```

Could also make it a user preference or dynamic based on device performance.

### Performance Impact

**Before optimization:**
- 100 scans × 200 wardrobe items = 20,000 evaluations
- ~2-5ms total (depending on device)

**After optimization (7-day threshold):**
- Assume 5 scans in last 7 days
- 5 scans × 200 wardrobe items = 1,000 evaluations
- ~0.1-0.5ms total
- **95% reduction in calculations**

### Trade-offs

**Pros:**
- ✅ Massive performance improvement for large datasets
- ✅ Still maintains fresh data where users care most
- ✅ Simple 5-line addition
- ✅ Configurable threshold
- ✅ No breaking changes

**Cons:**
- ❌ Stale counts for old scans (acceptable trade-off)
- ❌ Slight complexity addition
- ❌ Need to add `createdAt` to memoization deps

### When to Implement

Implement this optimization if you observe:

1. **Performance metrics showing lag:**
   - Frame drops when adding wardrobe items
   - Slow response in scan list screens
   - User complaints about sluggishness

2. **Scale increases:**
   - Export/import feature allows 100+ scans
   - Users accumulate 200+ wardrobe items
   - Targeting older devices (< 2GB RAM)

3. **Profiling shows bottleneck:**
   - React DevTools Profiler shows `useMatchCount` taking >10ms
   - Wardrobe mutation causes noticeable UI jank

### Testing Strategy

1. **Create test user with large dataset:**
   - 100 saved scans
   - 200 wardrobe items
   - Mix of old and recent scans

2. **Profile before/after:**
   - Measure time in `useMatchCount` hook
   - Check for frame drops during wardrobe mutations
   - Test on low-end device (e.g., iPhone 8)

3. **Validate UX:**
   - Recent scans show updated counts immediately
   - Old scans show frozen counts (acceptable)
   - No confusion or bugs

### Alternative Optimizations (If Needed)

If age-based strategy isn't sufficient, consider:

**Option 1: Virtualization**
- Only calculate for visible tiles using `IntersectionObserver`
- Scales infinitely but more complex

**Option 2: Web Worker**
- Offload calculations to background thread
- Prevents UI blocking but adds complexity

**Option 3: Incremental Updates**
- Only recalculate checks that could be affected by new wardrobe item
- Requires category/style matching logic

---

## Monitoring

Add performance monitoring to detect when optimization is needed:

```typescript
// In useMatchCount hook
if (__DEV__) {
  const start = performance.now();
  // ... calculation logic ...
  const duration = performance.now() - start;
  
  if (duration > 5) {
    console.warn(`[Performance] useMatchCount took ${duration.toFixed(2)}ms for check ${check.id}`);
  }
}
```

If you consistently see warnings >10ms, it's time to implement the age-based optimization.

---

## Summary

- ✅ **Current solution is optimal for current scale**
- 📄 **Age-based optimization is documented and ready**
- 🎯 **Implement only if performance becomes measurable issue**
- 📊 **Monitor with dev warnings to detect need**

