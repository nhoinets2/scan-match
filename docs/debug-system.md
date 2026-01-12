# Debug System Documentation

This document describes the debug functionality in SnapToMatch, including how it's configured, when it's active, and how to use it for development and production debugging.

## Overview

The debug system provides detailed snapshots of the confidence engine's decision-making process. This helps developers understand why certain matches are displayed and debug issues with the matching algorithm.

**Key principle**: Debug functionality is automatically disabled in production builds to ensure:
- Zero storage overhead (no debug data saved)
- Zero performance impact (no extra queries)
- Clean user experience (no debug UI)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PRODUCTION BUILD                            │
│                     (__DEV__ = false)                           │
├─────────────────────────────────────────────────────────────────┤
│  • shouldSaveDebugData() → false                               │
│  • shouldShowDebugUI() → false                                 │
│  • No engine_snapshot stored in database                       │
│  • No debug UI gestures available                              │
│  • Fast queries (debug column excluded)                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     DEVELOPMENT BUILD                           │
│                     (__DEV__ = true)                            │
├─────────────────────────────────────────────────────────────────┤
│  • shouldSaveDebugData() → true                                │
│  • shouldShowDebugUI() → true                                  │
│  • Full engine_snapshot stored with each scan                  │
│  • Debug UI available (modals, logs)                           │
│  • Lazy-load debug data only when needed                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Configuration

### Debug Flags

Located in `src/lib/debug-config.ts`:

```typescript
export const DEBUG_FEATURES = {
  // Automatically set based on __DEV__ environment
  SAVE_ENGINE_SNAPSHOTS: isDevelopment,  // Save debug data to DB
  SHOW_DEBUG_UI: isDevelopment,          // Show debug modals/gestures
  
  // Manual toggles
  LOG_MATCH_COUNT_RECALC: false,         // Console logs for useMatchCount
  
  // Emergency override (for debugging prod issues)
  FORCE_DEBUG_MODE: false,               // Forces debug on regardless of __DEV__
};
```

### Helper Functions

```typescript
// Check if debug data should be saved
shouldSaveDebugData(): boolean

// Check if debug UI should be shown
shouldShowDebugUI(): boolean
```

---

## What Gets Captured

When `shouldSaveDebugData()` returns `true`, each scan captures an `EngineSnapshot` containing:

### 1. Inputs
```typescript
{
  evaluated: boolean,        // Was confidence engine run?
  highMatchCount: number,    // HIGH tier matches
  nearMatchCount: number,    // MEDIUM tier matches
  wardrobeCount: number,     // Items in wardrobe
  matchesLength: number,     // Total evaluations
  hasModeABullets: boolean,  // Mode A suggestions available
  hasModeBBullets: boolean,  // Mode B suggestions available
}
```

### 2. Rule Trace (Decision Table)
```typescript
{
  phase1: { ruleId: "1.2", uiState: "great_match" },
  phase2: { ruleId: "2.1", variant: "matches", visible: true },
  phase3: { ruleId: "3.1", mode: "A", visible: true, title: "...", intro: "..." },
  phase4: { ruleId: "4.1", showRescanCta: false },
}
```

### 3. Render Model
```typescript
{
  uiState: "great_match",
  matchesSection: { visible: true, variant: "matches" },
  suggestionsSection: { visible: true, mode: "A", title: "...", bulletsCount: 3 },
  showRescanCta: false,
}
```

### 4. Developer Assertions
```typescript
{
  devAssertions: [
    { name: "CATEGORY_MISMATCH", triggered: false },
    { name: "NO_SUGGESTIONS_IN_MODE_A", triggered: true, message: "..." },
  ]
}
```

---

## Database Storage

### Schema

The `recent_checks` table includes an optional `engine_snapshot` JSONB column:

```sql
CREATE TABLE recent_checks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  item_name TEXT,
  category TEXT,
  image_uri TEXT,
  outcome TEXT,
  confidence TEXT,
  confidence_score REAL,
  scanned_item JSONB,
  engine_snapshot JSONB,  -- Debug data (null in production)
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Query Optimization

**Normal queries exclude debug data:**
```typescript
const RECENT_CHECK_COLUMNS = 
  "id, user_id, item_name, category, image_uri, outcome, confidence, confidence_score, scanned_item, created_at";

// Fast query - no engine_snapshot
const { data } = await supabase
  .from("recent_checks")
  .select(RECENT_CHECK_COLUMNS)
  .eq("user_id", user.id);
```

**Lazy loading for debug viewing:**
```typescript
// Only loads debug data when explicitly requested
export const useDebugSnapshot = (checkId: string | null) => {
  return useQuery({
    queryKey: ["debugSnapshot", checkId],
    queryFn: async () => {
      const { data } = await supabase
        .from("recent_checks")
        .select("engine_snapshot")
        .eq("id", checkId)
        .single();
      return data?.engine_snapshot;
    },
    enabled: shouldShowDebugUI() && !!checkId,
    staleTime: Infinity,  // Debug data doesn't change
  });
};
```

---

## Production Debugging

### Option 1: Query Supabase Directly

Use the Supabase Dashboard or SQL editor:

```sql
-- View debug snapshots for a specific user
SELECT 
  id,
  item_name,
  created_at,
  engine_snapshot->'inputs' as inputs,
  engine_snapshot->'ruleTrace' as rule_trace,
  engine_snapshot->'derived'->'devAssertions' as assertions
FROM recent_checks
WHERE user_id = 'USER_UUID_HERE'
  AND engine_snapshot IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

### Option 2: Create Admin View

```sql
CREATE VIEW debug_recent_checks AS
SELECT 
  id,
  user_id,
  item_name,
  created_at,
  engine_snapshot->'inputs' as inputs,
  engine_snapshot->'ruleTrace' as rule_trace
FROM recent_checks
WHERE engine_snapshot IS NOT NULL;
```

### Option 3: Emergency Debug Build

For critical production issues, temporarily enable debug:

```typescript
// In src/lib/debug-config.ts
export const DEBUG_FEATURES = {
  // ...
  FORCE_DEBUG_MODE: true,  // ⚠️ Enable for specific test build
};
```

> ⚠️ **Warning**: Never deploy with `FORCE_DEBUG_MODE: true` to production. Only use for targeted testing.

---

## Console Logging

### Match Count Recalculation

Enable detailed logging for the `useMatchCount` hook:

```typescript
DEBUG_FEATURES.LOG_MATCH_COUNT_RECALC = true;
```

Output:
```
[useMatchCount] Recalculating for check: abc-123 wardrobe size: 5 IDs: id1,id2,id3,id4,id5
[useMatchCount] Result for check abc-123: {"highCount": 2, "nearCount": 1, "totalMatches": 3}
```

### Development Mode Logs

When `__DEV__` is true, various components log debug information:
- Confidence engine evaluations
- Rule trace decisions
- Assertion triggers

---

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/debug-config.ts` | Feature flags and helpers |
| `src/lib/debug-snapshot.ts` | EngineSnapshot type and builder |
| `src/lib/database.ts` | `useDebugSnapshot` hook |
| `src/app/results.tsx` | Snapshot creation on scan |
| `docs/match-count-performance.md` | Performance optimization notes |

---

## Best Practices

1. **Never commit with `FORCE_DEBUG_MODE: true`**
2. **Use lazy loading** - Don't fetch debug data unless viewing debug UI
3. **Check `__DEV__`** - Use the provided helpers, not direct flag access
4. **Clean up old data** - Debug snapshots can be large; consider periodic cleanup
5. **Document assertions** - When adding new assertions, document their meaning

---

## Troubleshooting

### Debug data not saving

1. Check if running in development: `console.log(__DEV__)`
2. Verify `shouldSaveDebugData()` returns `true`
3. Check Supabase for errors in the insert

### Debug UI not showing

1. Check if running in development
2. Verify `shouldShowDebugUI()` returns `true`
3. Check component is using the correct flag

### Slow queries in development

Debug queries are lazy-loaded and shouldn't affect normal performance. If experiencing slowness:
1. Check if `engine_snapshot` is being loaded in normal queries (it shouldn't be)
2. Verify `RECENT_CHECK_COLUMNS` doesn't include `engine_snapshot`

