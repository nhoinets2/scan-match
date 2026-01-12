/**
 * useProStatus - Hook to check if user has Pro subscription
 *
 * Provides subscription status and paywall control for gated features.
 */

import { useQuery } from "@tanstack/react-query";
import { hasEntitlement, isRevenueCatEnabled } from "@/lib/revenuecatClient";

/**
 * Hook to check if user has active Pro subscription
 */
export function useProStatus() {
  const { data: isPro = false, isLoading, refetch } = useQuery({
    queryKey: ["pro-status"],
    queryFn: async () => {
      if (!isRevenueCatEnabled()) {
        // If RevenueCat isn't configured, default to free (not pro)
        return false;
      }

      const result = await hasEntitlement("pro");
      if (result.ok) {
        return result.data;
      }
      return false;
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    isPro,
    isLoading,
    refetch,
  };
}
