# Scan Retention: Auto-Cleanup

This document describes how SnapToMatch automatically manages scan storage to prevent unbounded growth.

## Overview

Scans are automatically cleaned up based on two rules:

| Rule | Trigger | What it does |
|------|---------|--------------|
| **Quota** | Every insert | Keeps newest 20 unsaved scans per user |
| **TTL** | Daily cron (03:00 UTC) | Deletes unsaved scans older than 14 days |

**"Saved" = `outcome = 'saved_to_revisit'`** — these are never auto-deleted.

---

## Current Implementation (Option A - MVP)

### Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Client Insert  │ ───▶ │   DB Trigger    │ ───▶ │  Trimmed Table  │
│  (simple)       │      │  (quota: 20)    │      │  (bounded)      │
└─────────────────┘      └─────────────────┘      └─────────────────┘
                                                          │
                         ┌─────────────────┐              │
                         │   Daily Cron    │ ─────────────┘
                         │  (TTL: 14 days) │
                         └─────────────────┘
```

### Client Code

The client simply inserts; the DB handles enforcement:

```typescript
// src/lib/database.ts
export const useAddRecentCheck = () => {
  return useMutation({
    mutationFn: async (check): Promise<{ deletedCount: number }> => {
      // Insert the scan
      // Quota enforcement (keep newest 20 unsaved) happens via DB trigger
      const { error } = await supabase.from("recent_checks").insert({...});
      if (error) throw error;

      // Trigger handles trimming; MVP doesn't surface counts
      return { deletedCount: 0 };
    },
  });
};
```

### Constants

```typescript
// src/lib/database.ts
export const SCAN_RETENTION = {
  TTL_DAYS: 14,
  MAX_UNSAVED_SCANS: 20,
} as const;
```

### UX Copy

- **All scans page footer:** "Unsaved scans are automatically removed after 14 days."

---

## Database Schema

### Indexes (for performance)

```sql
-- Fast TTL scans (global purge)
CREATE INDEX IF NOT EXISTS recent_checks_outcome_created_at_idx
  ON recent_checks (outcome, created_at);

-- Fast per-user quota trimming
CREATE INDEX IF NOT EXISTS recent_checks_user_outcome_created_at_idx
  ON recent_checks (user_id, outcome, created_at DESC);
```

### TTL Purge Function (for daily cron)

```sql
CREATE OR REPLACE FUNCTION purge_old_unsaved_scans()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM recent_checks
    WHERE outcome IS DISTINCT FROM 'saved_to_revisit'
      AND created_at < NOW() - INTERVAL '14 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$;

-- Lock down so clients can't call it
REVOKE ALL ON FUNCTION purge_old_unsaved_scans() FROM PUBLIC;
```

### Quota Trim Function (per user)

```sql
CREATE OR REPLACE FUNCTION trim_unsaved_scans_for_user(p_user_id UUID, p_max_unsaved INT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH to_delete AS (
    SELECT id
    FROM recent_checks
    WHERE user_id = p_user_id
      AND outcome IS DISTINCT FROM 'saved_to_revisit'
    ORDER BY created_at DESC, id DESC
    OFFSET p_max_unsaved
  ),
  deleted AS (
    DELETE FROM recent_checks
    WHERE id IN (SELECT id FROM to_delete)
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$;
```

### Trigger (auto-trim on insert)

```sql
CREATE OR REPLACE FUNCTION trg_trim_unsaved_scans_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM trim_unsaved_scans_for_user(NEW.user_id, 20);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recent_checks_trim_unsaved_after_insert ON recent_checks;

CREATE TRIGGER recent_checks_trim_unsaved_after_insert
AFTER INSERT ON recent_checks
FOR EACH ROW
EXECUTE FUNCTION trg_trim_unsaved_scans_after_insert();
```

### Cron Schedule (daily purge)

```sql
SELECT cron.unschedule('purge-old-scans');
SELECT cron.schedule(
  'purge-old-scans',
  '0 3 * * *',  -- Daily at 03:00 UTC
  $$SELECT purge_old_unsaved_scans();$$
);
```

---

## Option C: Insert + Trim RPC (Future)

If we need accurate `deletedCount` for UX (toasts, analytics), we can upgrade to a single RPC that does insert + trim atomically.

### When to Upgrade to Option C

Only if you need one of these:

- ✅ Reliable toast ("we removed X scans")
- ✅ Analytics/telemetry for trims per insert
- ✅ Atomic "insert + trim + return count" for UI

At that point, we'll wrap insert+trim in one RPC and turn off the trigger (or keep trigger as belt-and-suspenders but ensure counts still come back).

### Option C: Database Function

```sql
CREATE OR REPLACE FUNCTION insert_scan_with_trim(
  p_user_id UUID,
  p_item_name TEXT,
  p_category TEXT,
  p_image_uri TEXT,
  p_outcome TEXT,
  p_confidence TEXT,
  p_confidence_score NUMERIC,
  p_scanned_item JSONB,
  p_engine_snapshot JSONB DEFAULT NULL,
  p_max_unsaved INT DEFAULT 20
)
RETURNS TABLE(inserted_id UUID, deleted_count INT)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  new_id UUID;
  trimmed INT;
BEGIN
  -- 1) Insert the scan
  INSERT INTO recent_checks (
    user_id, item_name, category, image_uri, outcome, 
    confidence, confidence_score, scanned_item, engine_snapshot
  )
  VALUES (
    p_user_id, p_item_name, p_category, p_image_uri, p_outcome,
    p_confidence, p_confidence_score, p_scanned_item, p_engine_snapshot
  )
  RETURNING id INTO new_id;

  -- 2) Trim oldest unsaved beyond max
  WITH to_delete AS (
    SELECT id
    FROM recent_checks
    WHERE user_id = p_user_id
      AND outcome IS DISTINCT FROM 'saved_to_revisit'
    ORDER BY created_at DESC, id DESC
    OFFSET p_max_unsaved
  ),
  deleted AS (
    DELETE FROM recent_checks
    WHERE id IN (SELECT id FROM to_delete)
    RETURNING id
  )
  SELECT COUNT(*) INTO trimmed FROM deleted;

  -- 3) Return both
  RETURN QUERY SELECT new_id, trimmed;
END;
$$;
```

### Option C: Client Code

```typescript
export const useAddRecentCheck = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      check: Omit<RecentCheck, "id" | "createdAt">
    ): Promise<{ deletedCount: number }> => {
      if (!user?.id) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc("insert_scan_with_trim", {
        p_user_id: user.id,
        p_item_name: check.itemName,
        p_category: check.category,
        p_image_uri: check.imageUri,
        p_outcome: check.outcome,
        p_confidence: check.confidence,
        p_confidence_score: check.confidenceScore,
        p_scanned_item: check.scannedItem,
        p_engine_snapshot: check.engineSnapshot ?? null,
        p_max_unsaved: SCAN_RETENTION.MAX_UNSAVED_SCANS,
      });

      if (error) throw error;

      // RPC returns { inserted_id, deleted_count }
      return { deletedCount: data?.deleted_count ?? 0 };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["recentChecks", user?.id] });
      
      // Show toast if scans were trimmed
      if (result.deletedCount > 0) {
        showToast("Older unsaved scans were removed. Saved scans stay.");
      }
    },
  });
};
```

### Migration Steps (Option A → Option C)

1. Deploy the `insert_scan_with_trim` RPC to Supabase
2. Update `useAddRecentCheck` to call the RPC
3. Either:
   - **Remove trigger** (RPC handles everything), OR
   - **Keep trigger** as backup (RPC returns count, trigger is belt-and-suspenders)

---

## Testing

### Quota Test (Trigger)

```sql
DO $$
DECLARE
  test_user_id UUID := 'YOUR-USER-ID-HERE';
BEGIN
  DELETE FROM recent_checks 
  WHERE item_name LIKE 'TRIM_TEST_%' 
    AND user_id = test_user_id;

  INSERT INTO recent_checks (
    user_id, item_name, category, image_uri, outcome, 
    confidence, confidence_score, scanned_item, created_at
  )
  SELECT
    test_user_id,
    'TRIM_TEST_' || g,
    'tops',
    'file://test/' || g || '.jpg',
    'looks_like_good_match',
    'high',
    0.85,
    '{}'::jsonb,
    now() - interval '60 seconds' + (g * interval '1 second')
  FROM generate_series(1, 25) AS g;
END $$;

-- Should be 20 (trigger trimmed oldest 5)
SELECT COUNT(*) FROM recent_checks WHERE item_name LIKE 'TRIM_TEST_%';

-- Cleanup
DELETE FROM recent_checks WHERE item_name LIKE 'TRIM_TEST_%';
```

### TTL Test (Cron Function)

```sql
-- Insert old row
INSERT INTO recent_checks (
  user_id, item_name, category, image_uri, outcome, 
  confidence, confidence_score, scanned_item, created_at
)
VALUES (
  'YOUR-USER-ID-HERE',
  'TTL_TEST_OLD',
  'tops',
  'file://test/old.jpg',
  'looks_like_good_match',
  'high',
  0.85,
  '{}'::jsonb,
  now() - interval '15 days'
);

-- Run purge
SELECT purge_old_unsaved_scans() AS deleted_count;

-- Should be gone
SELECT * FROM recent_checks WHERE item_name = 'TTL_TEST_OLD';
```

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| User saves a scan | `outcome` → `saved_to_revisit`, excluded from cleanup |
| `outcome` is NULL | Treated as unsaved (via `IS DISTINCT FROM`) |
| Heavy user (many scans/day) | Quota keeps newest 20, even if < 14 days old |
| Inactive user | TTL purges after 14 days |
| Images | Stored as local device paths, not in Supabase Storage |

---

## Future Considerations

1. **Add `is_saved` boolean** if more saved-ish outcomes are needed
2. **Storage cleanup job** if images move to Supabase Storage
3. **Near-limit UI hint** (e.g., "3 of 20 scans remaining") if users request it

