/**
 * Shared QueryClient instance for React Query
 * Exported separately to avoid circular dependencies
 */

import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";

/**
 * Check if an error is a network error (no connectivity)
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("network request failed") ||
      msg.includes("internet connection") ||
      msg.includes("network connection") ||
      msg.includes("unable to resolve host") ||
      msg.includes("failed to fetch")
    );
  }
  return false;
}

// Configure QueryClient with React Native optimizations
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Suppress noisy network errors in console - these are expected when offline
      if (isNetworkError(error)) {
        // Only log in dev for debugging, silently ignore in prod
        if (__DEV__) {
          console.log("[QueryClient] Network error (offline?):", query.queryKey);
        }
        return;
      }
      // Log other errors for debugging
      console.warn("[QueryClient] Query error:", query.queryKey, error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // Suppress noisy network errors
      if (isNetworkError(error)) {
        if (__DEV__) {
          console.log("[QueryClient] Mutation network error (offline?):", mutation.options.mutationKey);
        }
        return;
      }
      console.warn("[QueryClient] Mutation error:", mutation.options.mutationKey, error);
    },
  }),
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
