# Debug Snapshot Setup Checklist

## ✅ Code Implementation (Complete)

- [x] Feature flag created (`src/lib/debug-config.ts`)
- [x] Snapshot builder implemented (`src/lib/debug-snapshot.ts`)
- [x] Database integration (`src/lib/database.ts`)
- [x] Results screen integration (`src/app/results.tsx`)
- [x] UI for viewing (`src/app/all-checks.tsx` - long-press)
- [x] Types updated (`src/lib/types.ts`)

## ⚠️ Database Migration Required

**You need to run this SQL in your Supabase SQL editor:**

```sql
ALTER TABLE recent_checks 
ADD COLUMN IF NOT EXISTS engine_snapshot JSONB;
```

File location: `migrations/add_engine_snapshot.sql`

## 🧪 Testing Steps

1. **Run the database migration** (see above)
2. **Scan an item** - let it complete and save
3. **Go to "All scans"** page
4. **Long-press any check** that has a snapshot
5. **Verify**:
   - Alert shows the snapshot JSON
   - Console.log also outputs it
   - Check Supabase table to see `engine_snapshot` column populated

## 🔍 What to Check in Snapshot

- `engines.confidence.evaluated` - Should be `true` if confidence engine ran
- `engines.confidence.matchesHighCount` - Number of HIGH tier matches
- `engines.legacy.usedForMatches` - Whether legacy engine was used
- `topMatches` - Array of HIGH tier matches with scores
- `nearMatches` - Array of MEDIUM tier near-matches
- `suggestions` - Mode A or Mode B suggestions

## 🐛 Troubleshooting

**No snapshot appears:**
- Check `DEBUG_FEATURES.SAVE_ENGINE_SNAPSHOTS` is `true`
- Check database column exists
- Check console for errors during save

**Snapshot is null:**
- This can happen if confidence engine didn't evaluate (empty wardrobe, etc.)
- Check `engines.confidence.evaluated` in snapshot

**Long-press doesn't work:**
- Make sure you're on "All scans" page
- Check that check has `engineSnapshot` property
- Check console for errors

## 📝 Notes

- Snapshots are saved for **all checks** (even if confidence engine didn't evaluate)
- This helps debug why engine didn't run
- Snapshot includes both confidence and legacy engine data
- Long-press shows snapshot in Alert (simple UI for temp feature)

