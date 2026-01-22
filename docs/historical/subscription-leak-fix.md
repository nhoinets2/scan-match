# Critical Security Fix: Subscription Data Leakage Between Accounts

**Status:** ✅ Fixed  
**Priority:** Critical  
**Date:** 2026-01-22

## Problem

When a user logged out and another user logged into the same device, the new user would incorrectly see "Pro Member" subscription status from the previous user. This was a critical security vulnerability that leaked subscription data between accounts.

## Root Cause

The bug had two root causes:

### 1. React Query Cache Not Cleared on Logout

When `signOut()` was called, the application cleared:
- Local Zustand store cache
- Quota store
- RevenueCat session

But it did NOT clear the React Query cache. This meant:
- Subscription status queries (`["pro-status", userId]`) remained cached
- When a new user logged in, their queries could resolve with cached data from the previous user
- React Query's query key included `userId`, but cache entries weren't explicitly cleared

### 2. RevenueCat User ID Not Updated on Login After Logout

When a user logged in after logout:
1. `initializeRevenueCat(userId)` was called
2. But it would skip initialization if already initialized (from previous user)
3. RevenueCat SDK remained configured with the previous user's ID
4. New user's subscription queries would check the wrong RevenueCat customer

## Solution

### Part 1: Clear React Query Cache on Logout

**Created:** `src/lib/queryClient.ts`
```typescript
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnMount: true,
      retry: 1,
      gcTime: 5 * 60 * 1000,
    },
  },
});
```

This exports a shared QueryClient instance to avoid circular dependencies.

**Updated:** `src/lib/auth-context.tsx`

1. Added React Query cache clear in `signOut()`:
```typescript
// CRITICAL: Clear React Query cache to prevent data leakage between users
try {
  console.log("[Auth] Clearing React Query cache...");
  queryClient.clear();
  console.log("[Auth] ✅ React Query cache cleared");
} catch (cacheError) {
  console.error("[Auth] React Query cache clear error (non-fatal):", cacheError);
}
```

2. Added React Query cache clear in `onAuthStateChange` SIGNED_OUT event:
```typescript
// CRITICAL: Clear React Query cache on sign out to prevent data leakage between users
if (event === "SIGNED_OUT") {
  console.log("[Auth] 🧹 Clearing React Query cache on sign out...");
  queryClient.clear();
  console.log("[Auth] ✅ React Query cache cleared");
}
```

This provides defense-in-depth by clearing cache both:
- When `signOut()` is explicitly called
- When Supabase fires the SIGNED_OUT event

### Part 2: Set RevenueCat User ID on Login

**Updated:** `src/lib/auth-context.tsx`

Modified the SIGNED_IN event handler to both initialize AND set user ID:
```typescript
if (event === "SIGNED_IN" && newSession?.user?.id) {
  console.log("[Auth] User signed in, setting up RevenueCat with ID:", newSession.user.id);
  
  // First, try to initialize (will work on first app launch)
  await initializeRevenueCat(newSession.user.id);
  
  // Then, set the user ID (will work after logout when SDK is already initialized)
  // This handles the case where user logs out and logs into a different account
  const setUserResult = await setUserId(newSession.user.id);
  if (setUserResult.ok) {
    console.log("[Auth] ✅ RevenueCat user ID set successfully");
  } else {
    console.log("[Auth] ⚠️ RevenueCat setUserId:", setUserResult.reason);
  }
}
```

This ensures that:
- First-time users get properly initialized with their ID
- Users logging in after logout get their ID properly set via `setUserId()`
- RevenueCat SDK is always associated with the correct user

## Testing

Added comprehensive test case in `src/lib/__tests__/auth-context.test.ts`:

```typescript
it("prevents subscription data leakage when switching accounts", async () => {
  // User A signs in with Pro subscription
  await handleAuthStateChange("SIGNED_IN", {
    access_token: "token-a",
    refresh_token: "refresh-a",
    user: { id: "user-a", email: "usera@example.com" },
  });

  // User A logs out
  await handleAuthStateChange("SIGNED_OUT", null);
  
  // CRITICAL: Verify cache was cleared to prevent data leakage
  expect(mockQueryClient.clear).toHaveBeenCalled();

  // User B signs in (different account)
  await handleAuthStateChange("SIGNED_IN", {
    access_token: "token-b",
    refresh_token: "refresh-b",
    user: { id: "user-b", email: "userb@example.com" },
  });

  // Verify User B gets properly initialized with their own ID
  expect(mockRevenueCat.setUserId).toHaveBeenCalledWith("user-b");
});
```

## Impact

**Before:**
- ❌ User B sees User A's Pro subscription status
- ❌ Subscription data leaks between accounts
- ❌ Critical security/privacy violation
- ❌ RevenueCat tracked wrong user for purchases

**After:**
- ✅ Each user sees only their own subscription status
- ✅ React Query cache cleared on logout
- ✅ RevenueCat properly tracks each user
- ✅ No data leakage between accounts

## Files Changed

1. `src/lib/queryClient.ts` - New file, shared QueryClient instance
2. `src/lib/auth-context.tsx` - Clear cache on logout, set RevenueCat user ID on login
3. `src/app/_layout.tsx` - Import queryClient from new shared module
4. `src/lib/__tests__/auth-context.test.ts` - Added test coverage

## Prevention

To prevent similar issues in the future:

1. **Always clear all caches on logout:**
   - React Query cache (`queryClient.clear()`)
   - Zustand stores (existing)
   - AsyncStorage sensitive data (existing)
   - Third-party SDK sessions (RevenueCat, etc.)

2. **Test account switching scenarios:**
   - Log in as User A
   - Log out
   - Log in as User B
   - Verify no User A data is visible to User B

3. **Use React Query query keys with user IDs:**
   - Good: `["pro-status", userId]`
   - Bad: `["pro-status"]` (no user context)

4. **Defense-in-depth:**
   - Clear caches in multiple places (signOut function + auth state listener)
   - Log all cache clear operations for debugging

## Related Documentation

- [Authentication System](../guides/authentication.md)
- [Subscription Management](../specs/subscription-management.md)
- [React Query Best Practices](../guides/react-query-best-practices.md)
