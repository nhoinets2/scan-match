# TEMPORARY: Debug Snapshot Feature - Removal Guide

This document outlines how to remove the debug snapshot feature when it's no longer needed.

## Files to Remove

1. `src/lib/debug-config.ts` - Feature flag
2. `src/lib/debug-snapshot.ts` - Snapshot builder
3. `DEBUG_SNAPSHOT_REMOVAL.md` - This file

## Files to Modify

### 1. `src/lib/types.ts`
- Remove `engineSnapshot?: any;` from `RecentCheck` interface (line ~247)

### 2. `src/lib/database.ts`
- Remove `engine_snapshot?: Record<string, unknown>;` from `DbRecentCheck` interface (line ~277)
- Remove snapshot spread in `useAddRecentCheck` mutation (line ~331)
- Remove snapshot mapping in `mapDbToRecentCheck` (line ~291)

### 3. `src/app/results.tsx`
- Remove debug imports (line ~82-84)
- Remove snapshot building code in `useEffect` (lines ~540-548 area)
- Remove `confidenceResult` and `bestCombo` from dependency array if not used elsewhere

### 4. `src/app/all-checks.tsx`
- Remove `Alert` import if not used elsewhere
- Remove debug import (line ~26)
- Remove `onLongPress` handler from `Pressable` (lines ~181-194 area)

## Database Migration (Optional)

If you want to clean up the database column:

```sql
ALTER TABLE recent_checks DROP COLUMN engine_snapshot;
```

Or just leave it - it won't hurt anything and can be useful for historical data.

## Quick Disable (Without Removal)

To temporarily disable without removing code:

1. Set `SAVE_ENGINE_SNAPSHOTS: false` in `src/lib/debug-config.ts`

This will prevent snapshots from being saved but keep all code intact.

