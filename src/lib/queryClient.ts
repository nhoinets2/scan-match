/**
 * Shared QueryClient instance for React Query
 * Exported separately to avoid circular dependencies
 */

import { QueryClient } from "@tanstack/react-query";

// Configure QueryClient with React Native optimizations
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Prevent immediate refetch on mount if data is fresh (within staleTime)
      // Individual queries can override this
      refetchOnMount: true,
      // Retry failed queries once before showing error
      retry: 1,
      // Keep queries in cache for 5 minutes after last usage
      gcTime: 5 * 60 * 1000,
    },
  },
});
