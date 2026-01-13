// Scan & Match Store - Zustand state management (ephemeral state only)
// Persistent data (wardrobe, preferences, checks, looks) is stored in Supabase
// See src/lib/database.ts for database hooks

import { create } from "zustand";
import {
  WardrobeItem,
  UserPreferences,
  ScannedItem,
} from "./types";

interface SnapToMatchState {
  // Current scan session (ephemeral - not persisted)
  currentScan: ScannedItem | null;

  // Cached data from database (for confidence engine)
  cachedWardrobe: WardrobeItem[];
  cachedPreferences: UserPreferences | null;

  // Actions - Scanning
  setScannedItem: (item: ScannedItem) => void;
  clearScan: () => void;

  // Actions - Cache management
  setCachedWardrobe: (wardrobe: WardrobeItem[]) => void;
  setCachedPreferences: (preferences: UserPreferences) => void;
  clearCache: () => void;
}

export const useSnapToMatchStore = create<SnapToMatchState>()((set) => ({
  // Initial state
  currentScan: null,
  cachedWardrobe: [],
  cachedPreferences: null,

  // Scanning actions
  setScannedItem: (item) => set({ currentScan: item }),

  clearScan: () => set({ currentScan: null }),

  // Cache management
  setCachedWardrobe: (wardrobe) => set({ cachedWardrobe: wardrobe }),
  setCachedPreferences: (preferences) => set({ cachedPreferences: preferences }),
  clearCache: () => set({ cachedWardrobe: [], cachedPreferences: null }),
}));

// Selector hooks for better performance
export const useCurrentScan = () => useSnapToMatchStore((s) => s.currentScan);
export const useCachedWardrobe = () => useSnapToMatchStore((s) => s.cachedWardrobe);
export const useCachedPreferences = () => useSnapToMatchStore((s) => s.cachedPreferences);
