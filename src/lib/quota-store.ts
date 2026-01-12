/**
 * Quota Store - Tracks free usage limits for scanning features
 *
 * Free quotas:
 * - 5 free in-store scans (Scan Item flow)
 * - 15 free add-to-wardrobe scans (Add to Wardrobe flow)
 *
 * Once exceeded, user must subscribe to Pro to continue.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Quota limits
export const QUOTA_LIMITS = {
  IN_STORE_SCANS: 5,
  WARDROBE_ADDS: 15,
} as const;

interface QuotaState {
  // Usage counts
  inStoreScansUsed: number;
  wardrobeAddsUsed: number;

  // Actions
  incrementInStoreScans: () => void;
  incrementWardrobeAdds: () => void;
  resetQuotas: () => void;

  // Computed helpers (call these as functions)
  getRemainingInStoreScans: () => number;
  getRemainingWardrobeAdds: () => number;
  hasInStoreScansRemaining: () => boolean;
  hasWardrobeAddsRemaining: () => boolean;
}

export const useQuotaStore = create<QuotaState>()(
  persist(
    (set, get) => ({
      // Initial state
      inStoreScansUsed: 0,
      wardrobeAddsUsed: 0,

      // Actions
      incrementInStoreScans: () =>
        set((state) => ({
          inStoreScansUsed: state.inStoreScansUsed + 1,
        })),

      incrementWardrobeAdds: () =>
        set((state) => ({
          wardrobeAddsUsed: state.wardrobeAddsUsed + 1,
        })),

      resetQuotas: () =>
        set({
          inStoreScansUsed: 0,
          wardrobeAddsUsed: 0,
        }),

      // Computed helpers
      getRemainingInStoreScans: () =>
        Math.max(0, QUOTA_LIMITS.IN_STORE_SCANS - get().inStoreScansUsed),

      getRemainingWardrobeAdds: () =>
        Math.max(0, QUOTA_LIMITS.WARDROBE_ADDS - get().wardrobeAddsUsed),

      hasInStoreScansRemaining: () =>
        get().inStoreScansUsed < QUOTA_LIMITS.IN_STORE_SCANS,

      hasWardrobeAddsRemaining: () =>
        get().wardrobeAddsUsed < QUOTA_LIMITS.WARDROBE_ADDS,
    }),
    {
      name: "fitmatch-quota-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// Selector hooks for better performance
export const useInStoreScansUsed = () =>
  useQuotaStore((s) => s.inStoreScansUsed);
export const useWardrobeAddsUsed = () =>
  useQuotaStore((s) => s.wardrobeAddsUsed);
