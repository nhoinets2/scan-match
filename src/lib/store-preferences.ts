/**
 * Store Preferences
 * 
 * Persists user's favorite stores for future shopping suggestions.
 * Uses Supabase for cloud persistence.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ============================================
// TYPES
// ============================================

export interface StorePreference {
  favoriteStores: string[];
  updatedAt: string; // ISO
}

// ============================================
// CONSTANTS
// ============================================

/** Max stores user can select */
export const MAX_FAVORITE_STORES = 5;

/** 
 * Store catalog with canonical IDs and display labels.
 * IDs are lowercase for normalization; labels are user-facing.
 */
export const STORE_CATALOG = [
  // Global + mid-range
  { id: "zara", label: "Zara" },
  { id: "hm", label: "H&M" },
  { id: "uniqlo", label: "Uniqlo" },
  { id: "mango", label: "Mango" },
  { id: "cos", label: "COS" },
  { id: "massimo_dutti", label: "Massimo Dutti" },
  { id: "other_stories", label: "& Other Stories" },
  { id: "asos", label: "ASOS" },
  { id: "zalando", label: "Zalando" },
  // US mainstream
  { id: "target", label: "Target" },
  { id: "nordstrom", label: "Nordstrom" },
  { id: "gap", label: "Gap" },
  { id: "old_navy", label: "Old Navy" },
  // US mid/trendy
  { id: "aritzia", label: "Aritzia" },
  { id: "abercrombie", label: "Abercrombie" },
  { id: "american_eagle", label: "American Eagle" },
  { id: "aerie", label: "Aerie" },
  { id: "jcrew", label: "J.Crew" },
  { id: "madewell", label: "Madewell" },
  { id: "everlane", label: "Everlane" },
  // Europe mid
  { id: "marks_spencer", label: "Marks & Spencer" },
  { id: "next", label: "Next" },
  { id: "reserved", label: "Reserved" },
  // Sport
  { id: "nike", label: "Nike" },
  { id: "adidas", label: "adidas" },
  { id: "lululemon", label: "Lululemon" },
] as const;

/** Available stores for selection (display labels) */
export const AVAILABLE_STORES = STORE_CATALOG.map(s => s.label);

export type StoreId = typeof STORE_CATALOG[number]["id"];
export type StoreLabel = typeof STORE_CATALOG[number]["label"];

/** Get store ID from label. Returns null if label not in catalog. */
export function getStoreId(label: string): string | null {
  const store = STORE_CATALOG.find(s => 
    s.label.toLowerCase() === label.toLowerCase()
  );
  return store?.id ?? null;
}

/** Get store label from ID */
export function getStoreLabel(id: string): string {
  const store = STORE_CATALOG.find(s => s.id === id);
  return store?.label ?? id;
}

// ============================================
// DEFAULT
// ============================================

const DEFAULT_STORE_PREFERENCE: StorePreference = {
  favoriteStores: [],
  updatedAt: new Date().toISOString(),
};

// ============================================
// DATABASE TYPES
// ============================================

interface DbStorePreference {
  id: string;
  user_id: string;
  favorite_stores: string[];
  updated_at: string;
  created_at: string;
}

// Key for storing tailor card seen state locally
const TAILOR_CARD_SEEN_KEY = "tailor_card_seen";

// ============================================
// STORAGE API (Supabase)
// ============================================

/**
 * Check if a string is a valid store ID (lowercase, underscore format).
 */
function isValidStoreId(value: string): boolean {
  return STORE_CATALOG.some(s => s.id === value);
}

export async function getStorePreference(userId: string): Promise<StorePreference> {
  try {
    const { data, error } = await supabase
      .from("store_preferences")
      .select("favorite_stores, updated_at")
      .eq("user_id", userId)
      .single();

    if (error) {
      // PGRST116 = no rows returned (user has no preferences yet)
      if (error.code === "PGRST116") {
        return DEFAULT_STORE_PREFERENCE;
      }
      throw error;
    }

    return {
      favoriteStores: (data.favorite_stores ?? []).filter(isValidStoreId),
      updatedAt: data.updated_at ?? new Date().toISOString(),
    };
  } catch (error) {
    console.error("[StorePreferences] Failed to read:", error);
    return DEFAULT_STORE_PREFERENCE;
  }
}

export async function setStorePreference(userId: string, pref: StorePreference): Promise<void> {
  try {
    const { error } = await supabase
      .from("store_preferences")
      .upsert({
        user_id: userId,
        favorite_stores: pref.favoriteStores,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id",
      });

    if (error) throw error;
  } catch (error) {
    console.error("[StorePreferences] Failed to save:", error);
    throw error;
  }
}

export async function getTailorCardSeen(userId: string): Promise<boolean> {
  try {
    const key = `${TAILOR_CARD_SEEN_KEY}_${userId}`;
    const value = await AsyncStorage.getItem(key);
    return value === "true";
  } catch {
    return false;
  }
}

export async function setTailorCardSeen(userId: string): Promise<void> {
  try {
    const key = `${TAILOR_CARD_SEEN_KEY}_${userId}`;
    await AsyncStorage.setItem(key, "true");
  } catch (error) {
    console.error("[StorePreferences] Failed to save seen flag:", error);
  }
}

// ============================================
// REACT QUERY HOOKS
// ============================================

export function useStorePreference() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["storePreference", user?.id],
    queryFn: () => {
      if (!user?.id) {
        return Promise.resolve(DEFAULT_STORE_PREFERENCE);
      }
      return getStorePreference(user.id);
    },
    enabled: !!user?.id,
    staleTime: Infinity, // Rarely changes
  });
}

export function useUpdateStorePreference() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (favoriteStores: string[]) => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      // Convert labels to IDs for storage (only valid stores)
      const storeIds: string[] = [];
      for (const labelOrId of favoriteStores.slice(0, MAX_FAVORITE_STORES)) {
        // Check if already an ID
        const byId = STORE_CATALOG.find(s => s.id === labelOrId);
        if (byId) {
          storeIds.push(byId.id);
          continue;
        }
        
        // Find by label (case-insensitive)
        const byLabel = STORE_CATALOG.find(s => 
          s.label.toLowerCase() === labelOrId.toLowerCase()
        );
        if (byLabel) {
          storeIds.push(byLabel.id);
        }
        // Unknown stores are dropped
      }
      
      const pref: StorePreference = {
        favoriteStores: storeIds,
        updatedAt: new Date().toISOString(),
      };
      await setStorePreference(user.id, pref);
      return pref;
    },
    onSuccess: (data) => {
      // Instant UI update via setQueryData (no refetch needed)
      queryClient.setQueryData(["storePreference", user?.id], data);
      // Also invalidate to ensure any other components get the update
      queryClient.invalidateQueries({ queryKey: ["storePreference", user?.id] });
    },
  });
}

export function useTailorCardSeen() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["tailorCardSeen", user?.id],
    queryFn: () => {
      if (!user?.id) {
        return Promise.resolve(false);
      }
      return getTailorCardSeen(user.id);
    },
    enabled: !!user?.id,
    staleTime: Infinity,
  });
}

export function useMarkTailorCardSeen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }
      await setTailorCardSeen(user.id);
    },
    onSuccess: () => {
      queryClient.setQueryData(["tailorCardSeen", user?.id], true);
    },
  });
}

// ============================================
// HELPERS
// ============================================

/**
 * Format stores for display in subtitle.
 * Converts IDs to labels for display.
 * Examples:
 * - [] → null
 * - ["zara"] → "Saved: Zara"
 * - ["zara", "hm", "uniqlo"] → "Saved: Zara • H&M • Uniqlo"
 * - ["zara", "hm", "uniqlo", "cos", "nike"] → "Saved: Zara • H&M • Uniqlo +2"
 */
/**
 * Formats store IDs for display in status bar
 * @param storeIds - Array of store IDs
 * @param maxDisplay - Max number of stores to show before "+N" (default: 3)
 * @returns Formatted string like "Zara, H&M, COS +2" or null if empty
 * 
 * @deprecated Use formatStoreList in TailorSuggestionsCard instead
 */
export function formatSavedStores(storeIds: string[], maxDisplay: number = 3): string | null {
  if (storeIds.length === 0) return null;
  
  // Convert IDs to display labels
  const labels = storeIds.map(id => getStoreLabel(id));
  
  const displayed = labels.slice(0, maxDisplay);
  const remaining = labels.length - maxDisplay;
  
  let result = `Saved: ${displayed.join(" • ")}`;
  if (remaining > 0) {
    result += ` +${remaining}`;
  }
  
  return result;
}

