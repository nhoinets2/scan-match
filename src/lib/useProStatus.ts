/**
 * useProStatus - Hook to check if user has Pro subscription
 *
 * Checks both RevenueCat (primary) and database (fallback/sync).
 * Syncs subscription status to database for cross-device consistency.
 */

import { useQuery } from "@tanstack/react-query";
import { hasEntitlement, isRevenueCatEnabled } from "@/lib/revenuecatClient";
import { useAuth } from "@/lib/auth-context";
import { syncSubscriptionToDb, isProFromDb } from "@/lib/subscription-sync";

/**
 * Hook to check if user has active Pro subscription
 * 
 * Priority:
 * 1. Check RevenueCat (source of truth for native)
 * 2. Sync status to database
 * 3. Fall back to database if RevenueCat unavailable (web)
 */
export function useProStatus() {
  const { user } = useAuth();

  const { data: isPro = false, isLoading, refetch } = useQuery({
    queryKey: ["pro-status", user?.id],
    queryFn: async () => {
      // No user = not pro
      if (!user?.id) {
        return false;
      }

      // If RevenueCat is enabled, use it as source of truth
      if (isRevenueCatEnabled()) {
        const result = await hasEntitlement("pro");
        const isProFromRC = result.ok ? result.data : false;

        // Sync to database in background (don't await)
        syncSubscriptionToDb(user.id).catch(() => {
          // Silently handle sync errors
        });

        return isProFromRC;
      }

      // RevenueCat not available (web or not configured)
      // Fall back to database check
      console.log("[ProStatus] RevenueCat not available, checking database");
      return await isProFromDb(user.id);
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!user?.id, // Only run when user is logged in
  });

  return {
    isPro,
    isLoading,
    refetch,
  };
}
