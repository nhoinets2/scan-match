// Database hooks for Supabase - replaces local AsyncStorage

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";
import {
  WardrobeItem,
  UserPreferences,
  RecentCheck,
  StyleVibe,
  ColorInfo,
  FitPreference,
} from "./types";
import { shouldSaveDebugData, shouldShowDebugUI } from "./debug-config";

// ============================================
// SCAN RETENTION CONFIG
// ============================================

/**
 * Scan retention rules:
 * - TTL: Unsaved scans older than TTL_DAYS are auto-deleted (DB cron)
 * - Quota: Max MAX_UNSAVED_SCANS per user (DB trigger + client RPC)
 * - "Saved" = outcome === "saved_to_revisit"
 */
export const SCAN_RETENTION = {
  /** Days before unsaved scans are auto-deleted */
  TTL_DAYS: 14,
  /** Max unsaved scans per user (oldest trimmed on new scan) */
  MAX_UNSAVED_SCANS: 20,
} as const;

// ============================================
// WARDROBE ITEMS
// ============================================

interface DbWardrobeItem {
  id: string;
  user_id: string;
  image_uri: string;
  category: string;
  detected_label?: string;
  attributes?: Record<string, unknown>;
  colors: ColorInfo[];
  style_notes?: string[];
  brand?: string;
  user_style_tags?: string[];
  created_at: string;
}

const mapDbToWardrobeItem = (item: DbWardrobeItem): WardrobeItem => ({
  id: item.id,
  imageUri: item.image_uri,
  category: item.category as WardrobeItem["category"],
  detectedLabel: item.detected_label,
  attributes: item.attributes as WardrobeItem["attributes"],
  colors: item.colors,
  styleNotes: item.style_notes,
  brand: item.brand,
  userStyleTags: item.user_style_tags as StyleVibe[],
  createdAt: new Date(item.created_at).getTime(),
});

const mapWardrobeItemToDb = (
  item: Omit<WardrobeItem, "id" | "createdAt">,
  userId: string
): Omit<DbWardrobeItem, "id" | "created_at"> => ({
  user_id: userId,
  image_uri: item.imageUri,
  category: item.category,
  detected_label: item.detectedLabel,
  attributes: item.attributes as Record<string, unknown>,
  colors: item.colors,
  style_notes: item.styleNotes,
  brand: item.brand,
  user_style_tags: item.userStyleTags,
});

export const useWardrobe = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["wardrobe", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("wardrobe_items")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as DbWardrobeItem[]).map(mapDbToWardrobeItem);
    },
    enabled: !!user?.id,
  });
};

export const useAddWardrobeItem = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: Omit<WardrobeItem, "id" | "createdAt">) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("wardrobe_items")
        .insert(mapWardrobeItemToDb(item, user.id))
        .select()
        .single();

      if (error) throw error;
      return mapDbToWardrobeItem(data as DbWardrobeItem);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wardrobe", user?.id] });
    },
  });
};

export const useRemoveWardrobeItem = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("wardrobe_items")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    // Optimistic update: immediately remove from cache
    onMutate: async (id: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["wardrobe", user?.id] });

      // Snapshot the previous value
      const previousWardrobe = queryClient.getQueryData<WardrobeItem[]>(["wardrobe", user?.id]);

      // Optimistically update to remove the item
      if (previousWardrobe) {
        queryClient.setQueryData<WardrobeItem[]>(
          ["wardrobe", user?.id],
          previousWardrobe.filter(item => item.id !== id)
        );
      }

      // Return context with the snapshot
      return { previousWardrobe };
    },
    // If mutation fails, rollback
    onError: (err, id, context) => {
      if (context?.previousWardrobe) {
        queryClient.setQueryData(["wardrobe", user?.id], context.previousWardrobe);
      }
    },
    // Always refetch after error or success
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["wardrobe", user?.id] });
    },
  });
};

export const useUpdateWardrobeItem = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Omit<WardrobeItem, "id" | "createdAt">> }) => {
      if (!user?.id) throw new Error("Not authenticated");

      const dbUpdates: Record<string, unknown> = {};
      if (updates.category !== undefined) dbUpdates.category = updates.category;
      if (updates.userStyleTags !== undefined) dbUpdates.user_style_tags = updates.userStyleTags;
      if (updates.brand !== undefined) dbUpdates.brand = updates.brand;
      if (updates.colors !== undefined) dbUpdates.colors = updates.colors;
      if (updates.styleNotes !== undefined) dbUpdates.style_notes = updates.styleNotes;
      if (updates.detectedLabel !== undefined) dbUpdates.detected_label = updates.detectedLabel;

      const { error } = await supabase
        .from("wardrobe_items")
        .update(dbUpdates)
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wardrobe", user?.id] });
    },
  });
};

// ============================================
// USER PREFERENCES
// ============================================

interface DbUserPreferences {
  id: string;
  user_id: string;
  style_vibes: string[];
  wardrobe_colors: ColorInfo[];
  sizes: { top: string; bottom: string; shoes: string };
  fit_preference: string | null;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
}

const mapDbToPreferences = (prefs: DbUserPreferences): UserPreferences => ({
  styleVibes: prefs.style_vibes as StyleVibe[],
  wardrobeColors: prefs.wardrobe_colors,
  sizes: prefs.sizes,
  fitPreference: prefs.fit_preference ? (prefs.fit_preference as FitPreference) : undefined,
  onboardingComplete: prefs.onboarding_complete,
});

const DEFAULT_PREFERENCES: UserPreferences = {
  styleVibes: [],
  wardrobeColors: [],
  sizes: { top: "", bottom: "", shoes: "" },
  onboardingComplete: false,
};

export const usePreferences = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["preferences", user?.id],
    queryFn: async () => {
      if (!user?.id) return DEFAULT_PREFERENCES;

      const { data, error } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No preferences found, return defaults
          return DEFAULT_PREFERENCES;
        }
        throw error;
      }
      return mapDbToPreferences(data as DbUserPreferences);
    },
    enabled: !!user?.id,
  });
};

export const useUpdatePreferences = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<UserPreferences>) => {
      if (!user?.id) throw new Error("Not authenticated");

      const dbUpdates: Record<string, unknown> = {};
      if (updates.styleVibes !== undefined) dbUpdates.style_vibes = updates.styleVibes;
      if (updates.wardrobeColors !== undefined) dbUpdates.wardrobe_colors = updates.wardrobeColors;
      if (updates.sizes !== undefined) dbUpdates.sizes = updates.sizes;
      // Use 'in' operator to check if fitPreference key exists (allows explicit undefined/null to clear the value)
      if ('fitPreference' in updates) dbUpdates.fit_preference = updates.fitPreference ?? null;
      if (updates.onboardingComplete !== undefined) dbUpdates.onboarding_complete = updates.onboardingComplete;

      const { error } = await supabase
        .from("user_preferences")
        .upsert({
          user_id: user.id,
          ...dbUpdates,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preferences", user?.id] });
    },
  });
};

// Helper hook for onboarding status
export const useOnboardingComplete = () => {
  const { user } = useAuth();
  const { data: preferences, isLoading } = usePreferences();

  return {
    isComplete: !user ? false : preferences?.onboardingComplete ?? false,
    isLoading: user ? isLoading : false,
  };
};

// Helper hook for wardrobe count
export const useWardrobeCount = () => {
  const { data: wardrobe } = useWardrobe();
  return wardrobe?.length ?? 0;
};

// ============================================
// RECENT CHECKS
// ============================================

// Base fields for recent checks (excludes debug data for performance)
const RECENT_CHECK_COLUMNS = 
  "id, user_id, item_name, category, image_uri, outcome, confidence, confidence_score, scanned_item, created_at";

interface DbRecentCheck {
  id: string;
  user_id: string;
  item_name: string;
  category: string;
  image_uri: string;
  outcome: string;
  confidence: string;
  confidence_score: number;
  scanned_item: Record<string, unknown>;
  created_at: string;
}

const mapDbToRecentCheck = (check: DbRecentCheck): RecentCheck => ({
  id: check.id,
  itemName: check.item_name,
  category: check.category as RecentCheck["category"],
  imageUri: check.image_uri,
  outcome: check.outcome as RecentCheck["outcome"],
  confidence: check.confidence as RecentCheck["confidence"],
  confidenceScore: check.confidence_score,
  scannedItem: check.scanned_item as unknown as RecentCheck["scannedItem"],
  createdAt: new Date(check.created_at).getTime(),
});

export const useRecentChecks = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["recentChecks", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Note: engine_snapshot is NOT loaded here for performance
      // Use useDebugSnapshot() to lazy-load debug data when needed
      const { data, error } = await supabase
        .from("recent_checks")
        .select(RECENT_CHECK_COLUMNS)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data as DbRecentCheck[]).map(mapDbToRecentCheck);
    },
    enabled: !!user?.id,
  });
};

export const useAddRecentCheck = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      check: Omit<RecentCheck, "id" | "createdAt">
    ): Promise<{ deletedCount: number }> => {
      if (!user?.id) throw new Error("Not authenticated");

      // Build insert data
      const insertData: Record<string, unknown> = {
        user_id: user.id,
        item_name: check.itemName,
        category: check.category,
        image_uri: check.imageUri,
        outcome: check.outcome,
        confidence: check.confidence,
        confidence_score: check.confidenceScore,
        scanned_item: check.scannedItem as unknown as Record<string, unknown>,
      };

      // Only save debug snapshot in development mode
      if (shouldSaveDebugData() && check.engineSnapshot) {
        insertData.engine_snapshot = check.engineSnapshot as unknown as Record<string, unknown>;
      }

      // Insert the scan
      // Quota enforcement (keep newest 20 unsaved) happens via DB trigger
      const { error } = await supabase.from("recent_checks").insert(insertData);

      if (error) throw error;

      // Trigger handles trimming; MVP doesn't surface counts
      return { deletedCount: 0 };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recentChecks", user?.id] });
    },
  });
};

export const useRemoveRecentCheck = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("recent_checks")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    // Optimistic update: immediately remove from cache
    onMutate: async (id: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["recentChecks", user?.id] });

      // Snapshot the previous value
      const previousChecks = queryClient.getQueryData<RecentCheck[]>(["recentChecks", user?.id]);

      // Optimistically update to remove the item
      if (previousChecks) {
        queryClient.setQueryData<RecentCheck[]>(
          ["recentChecks", user?.id],
          previousChecks.filter(check => check.id !== id)
        );
      }

      // Return context with the snapshot
      return { previousChecks };
    },
    // If mutation fails, rollback
    onError: (err, id, context) => {
      if (context?.previousChecks) {
        queryClient.setQueryData(["recentChecks", user?.id], context.previousChecks);
      }
    },
    // Always refetch after error or success
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["recentChecks", user?.id] });
    },
  });
};

/**
 * Lazy-load debug snapshot for a specific check
 * Only fetches data when:
 * 1. Debug UI is enabled (development mode)
 * 2. A valid checkId is provided
 * 
 * This keeps normal queries fast by not loading debug data by default.
 * Use this hook when opening debug modals or viewers.
 */
export const useDebugSnapshot = (checkId: string | null) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["debugSnapshot", checkId, user?.id],
    queryFn: async () => {
      if (!user?.id || !checkId) return null;

      const { data, error } = await supabase
        .from("recent_checks")
        .select("engine_snapshot")
        .eq("id", checkId)
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.warn("[useDebugSnapshot] Failed to load snapshot:", error);
        return null;
      }

      return data?.engine_snapshot ?? null;
    },
    // Only run query when debug UI is enabled and we have a valid checkId
    enabled: shouldShowDebugUI() && !!user?.id && !!checkId,
    // Debug data doesn't change, so cache indefinitely
    staleTime: Infinity,
    // Don't refetch on window focus for debug data
    refetchOnWindowFocus: false,
  });
};

export const useUpdateRecentCheckOutcome = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, outcome }: { id: string; outcome: RecentCheck["outcome"] }) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("recent_checks")
        .update({ outcome })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
      
      return { id, outcome };
    },
    // Optimistic update - update cache immediately without waiting for server
    onMutate: async ({ id, outcome }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["recentChecks", user?.id] });

      // Snapshot the previous value
      const previousChecks = queryClient.getQueryData<RecentCheck[]>(["recentChecks", user?.id]);

      // Optimistically update the cache
      if (previousChecks) {
        queryClient.setQueryData<RecentCheck[]>(
          ["recentChecks", user?.id],
          previousChecks.map((check) =>
            check.id === id ? { ...check, outcome } : check
          )
        );
      }

      return { previousChecks };
    },
    // Rollback on error
    onError: (err, variables, context) => {
      if (context?.previousChecks) {
        queryClient.setQueryData(["recentChecks", user?.id], context.previousChecks);
      }
    },
    // Silently refetch in background - don't block UI
    onSuccess: () => {
      // Use setTimeout to defer invalidation until after navigation
      setTimeout(() => {
        queryClient.invalidateQueries({ 
          queryKey: ["recentChecks", user?.id],
          refetchType: 'none', // Don't refetch immediately, just mark as stale
        });
      }, 0);
    },
  });
};

