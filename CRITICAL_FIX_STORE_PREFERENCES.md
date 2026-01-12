# Critical Fix: User-Scoped Store Preferences

## Issue

**Severity:** Critical 🔴  
**Impact:** Multi-user data leak

Store preferences were persisted to AsyncStorage using global keys (`storePreference.v1`, `tailorCardSeen.v1`), causing all users on the same device to share the same preferences.

### Reproduction
1. User A logs in, selects stores [Zara, H&M]
2. User A logs out
3. User B logs in
4. User B sees User A's stores pre-selected ❌

---

## Root Cause

Storage keys were not scoped to user ID:

```typescript
// BEFORE (broken)
const STORAGE_KEY = "storePreference.v1";
await AsyncStorage.getItem(STORAGE_KEY); // Same for all users
```

---

## Fix

All storage operations now include user ID in the key:

```typescript
// AFTER (fixed)
const getUserStorageKey = (userId: string, key: string) => `${key}.${userId}`;

// Example: "storePreference.v1.abc123-user-id"
const storageKey = getUserStorageKey(userId, "storePreference.v1");
await AsyncStorage.getItem(storageKey);
```

### Changes Made

1. **Storage functions now require `userId`:**
   - `getStorePreference(userId: string)`
   - `setStorePreference(userId: string, pref)`
   - `getTailorCardSeen(userId: string)`
   - `setTailorCardSeen(userId: string)`

2. **React Query hooks use `useAuth()` to get user ID:**
   - `useStorePreference()` → queries `["storePreference", user.id]`
   - `useUpdateStorePreference()` → invalidates `["storePreference", user.id]`
   - `useTailorCardSeen()` → queries `["tailorCardSeen", user.id]`
   - `useMarkTailorCardSeen()` → invalidates `["tailorCardSeen", user.id]`

3. **Query keys now include user ID for proper cache isolation:**
   ```typescript
   queryKey: ["storePreference", user?.id]
   ```

---

## Migration Path

**Good news:** No data migration needed for existing users.

- Old keys (`storePreference.v1`) remain in storage but are orphaned
- New logins create user-scoped keys (`storePreference.v1.{userId}`)
- Users will need to re-select their stores once (acceptable for Phase 1)

**Optional cleanup:** Add a one-time script to remove orphaned keys:
```typescript
await AsyncStorage.removeItem("storePreference.v1");
await AsyncStorage.removeItem("tailorCardSeen.v1");
await AsyncStorage.removeItem("storePreferenceMigrated.v1");
```

---

## Testing Checklist

### Manual QA

- [ ] User A logs in, selects stores [Zara, H&M]
- [ ] User A logs out
- [ ] User B logs in
- [ ] User B sees **empty selection** (not User A's stores) ✅
- [ ] User B selects stores [Nike, Uniqlo]
- [ ] User B logs out
- [ ] User A logs back in
- [ ] User A sees **[Zara, H&M]** (their original selection) ✅

### Edge Cases

- [ ] User logs out mid-save → no crash, data saved to their scoped key
- [ ] User switches accounts rapidly → each account isolated
- [ ] "New" dot state is per-user (User A sees dot, User B doesn't)

---

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/store-preferences.ts` | Added `userId` param to all storage functions; hooks use `useAuth()` |
| `docs/tailor-suggestions-roadmap.md` | Documented user isolation + decision log entry |

---

## Deployment Notes

- **No backend changes required** (AsyncStorage is local-only)
- **No app version bump required** (backward compatible)
- **Users will lose their old selections** (acceptable for Phase 1)
- **Analytics unaffected** (events already tracked correctly)

---

## Prevention

To prevent similar issues in the future:

1. **Always scope local storage to user ID** when data is user-specific
2. **Use query keys with user ID** for React Query cache isolation
3. **Test multi-user scenarios** in QA (login/logout/switch accounts)

### Template for future features:

```typescript
// ✅ Good: User-scoped
const key = `myFeature.v1.${userId}`;

// ❌ Bad: Global key
const key = "myFeature.v1";
```

---

## Status

✅ **Fixed and ready to ship**

All storage operations now properly isolated by user ID.

