/**
 * Library Items Context
 *
 * Provides library items from Supabase.
 * Shows loading skeletons while fetching and a helpful message if unavailable.
 */

import React, { createContext, useContext, useMemo, useCallback, type ReactNode } from "react";
import { useLibraryItems, toLibraryItemsMeta } from "./libraryService";
import {
  type LibraryItemMeta,
  LIBRARY_BY_CATEGORY,
} from "./tipsheets";
import type { Category } from "../types";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type LibraryErrorType = "fetch_failed" | "empty" | null;

interface LibraryContextValue {
  /** Library items indexed by category */
  libraryByCategory: Record<Category, LibraryItemMeta[]>;
  /** Get item by ID across all categories */
  getItemById: (id: string) => LibraryItemMeta | undefined;
  /** Whether data is loading from Supabase */
  isLoading: boolean;
  /** Whether using Supabase data (true) or fallback (false) */
  isRemote: boolean;
  /** Whether library is empty (no items available) - only true after fetch completes */
  isEmpty: boolean;
  /** Error type for differentiated messaging */
  errorType: LibraryErrorType;
  /** Retry function for failed fetches */
  retry: () => void;
}

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────

const LibraryContext = createContext<LibraryContextValue | null>(null);

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function LibraryProvider({ children }: { children: ReactNode }) {
  // Fetch from Supabase
  const {
    data: supabaseItems,
    isLoading,
    isFetching,
    isFetched,
    isSuccess,
    isError,
    refetch,
  } = useLibraryItems();

  // Convert Supabase records to LibraryItemMeta format and index by category
  const { libraryByCategory, isRemote, isEmpty } = useMemo(() => {
    // If Supabase data is available and has items, use it
    if (isSuccess && supabaseItems && supabaseItems.length > 0) {
      const converted = toLibraryItemsMeta(supabaseItems);

      // Group by category
      const byCategory = {} as Record<Category, LibraryItemMeta[]>;
      const categories: Category[] = [
        "tops",
        "bottoms",
        "outerwear",
        "shoes",
        "bags",
        "accessories",
        "dresses",
        "skirts",
      ];

      // Initialize all categories with empty arrays
      for (const cat of categories) {
        byCategory[cat] = [];
      }

      // Populate from Supabase data
      for (const item of converted) {
        if (byCategory[item.category]) {
          byCategory[item.category].push(item);
        }
      }

      // Sort each category by rank
      for (const cat of categories) {
        byCategory[cat].sort((a, b) => a.rank - b.rank);
      }

      return { libraryByCategory: byCategory, isRemote: true, isEmpty: false };
    }

    // Fallback to hardcoded data (now empty)
    const totalItems = Object.values(LIBRARY_BY_CATEGORY).reduce(
      (sum, items) => sum + items.length,
      0
    );
    return {
      libraryByCategory: LIBRARY_BY_CATEGORY,
      isRemote: false,
      isEmpty: totalItems === 0,
    };
  }, [supabaseItems, isSuccess]);

  // Helper to get item by ID
  const getItemById = useMemo(() => {
    return (id: string): LibraryItemMeta | undefined => {
      for (const items of Object.values(libraryByCategory)) {
        const found = items.find((item) => item.id === id);
        if (found) return found;
      }
      return undefined;
    };
  }, [libraryByCategory]);

  // Determine error type (only after fetch completes, not during refetch)
  const errorType: LibraryErrorType = useMemo(() => {
    // Don't show error during initial load or refetch
    if (isLoading || isFetching) return null;
    // Fetch failed
    if (isError) return "fetch_failed";
    // Fetch succeeded but no items (only after confirmed fetch)
    if (isFetched && isEmpty) return "empty";
    return null;
  }, [isLoading, isFetching, isError, isFetched, isEmpty]);

  // Retry function
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

  const value: LibraryContextValue = {
    libraryByCategory,
    getItemById,
    isLoading: isLoading || isFetching,
    isRemote,
    isEmpty: isFetched && isEmpty && !isFetching,
    errorType,
    retry,
  };

  return (
    <LibraryContext.Provider value={value}>
      {children}
    </LibraryContext.Provider>
  );
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error("useLibrary must be used within a LibraryProvider");
  }
  return context;
}

// ─────────────────────────────────────────────
// Standalone hook (for use outside provider)
// ─────────────────────────────────────────────

/**
 * Use library items from Supabase.
 * Returns loading/empty states for proper UI handling.
 */
export function useLibraryWithFallback() {
  const {
    data: supabaseItems,
    isLoading,
    isFetching,
    isFetched,
    isSuccess,
    isError,
    refetch,
  } = useLibraryItems();

  const result = useMemo(() => {
    // If Supabase data is available, use it
    if (isSuccess && supabaseItems && supabaseItems.length > 0) {
      const converted = toLibraryItemsMeta(supabaseItems);

      // Group by category
      const byCategory = {} as Record<Category, LibraryItemMeta[]>;
      const categories: Category[] = [
        "tops",
        "bottoms",
        "outerwear",
        "shoes",
        "bags",
        "accessories",
        "dresses",
        "skirts",
      ];

      for (const cat of categories) {
        byCategory[cat] = [];
      }

      for (const item of converted) {
        if (byCategory[item.category]) {
          byCategory[item.category].push(item);
        }
      }

      for (const cat of categories) {
        byCategory[cat].sort((a, b) => a.rank - b.rank);
      }

      return {
        libraryByCategory: byCategory,
        isRemote: true,
        isEmpty: false,
      };
    }

    // Fallback to hardcoded (now empty)
    const totalItems = Object.values(LIBRARY_BY_CATEGORY).reduce(
      (sum, items) => sum + items.length,
      0
    );
    return {
      libraryByCategory: LIBRARY_BY_CATEGORY,
      isRemote: false,
      isEmpty: totalItems === 0,
    };
  }, [supabaseItems, isSuccess]);

  // Determine error type (only after fetch completes)
  const errorType: LibraryErrorType = useMemo(() => {
    if (isLoading || isFetching) return null;
    if (isError) return "fetch_failed";
    if (isFetched && result.isEmpty) return "empty";
    return null;
  }, [isLoading, isFetching, isError, isFetched, result.isEmpty]);

  return {
    ...result,
    isLoading: isLoading || isFetching,
    isEmpty: isFetched && result.isEmpty && !isFetching,
    errorType,
    retry: refetch,
  };
}
