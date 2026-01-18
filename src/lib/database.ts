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
import { cleanupWardrobeItemStorage, cleanupScanStorage } from "./storage";

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
    // Keep data fresh for 2 seconds - prevents flash during cache invalidation
    // after upload completes (optimistic update already has correct data)
    staleTime: 2000,
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

/**
 * Guarded update of image URI (used by background upload)
 * 
 * Only updates if current image_uri matches expectedImageUri.
 * This prevents stale upload jobs from overwriting newer images.
 * 
 * Returns the number of rows updated (0 if item deleted or image changed).
 */
export async function updateWardrobeItemImageUriGuarded(params: {
  itemId: string;
  remoteUrl: string;
  expectedImageUri: string; // must match current DB value to update
}): Promise<number> {
  console.log('[Database] Guarded update for item:', params.itemId);
  console.log('[Database] Expected URI:', params.expectedImageUri);
  console.log('[Database] New remote URL:', params.remoteUrl);
  
  const { data, error } = await supabase
    .from("wardrobe_items")
    .update({ image_uri: params.remoteUrl })
    .eq("id", params.itemId)
    .eq("image_uri", params.expectedImageUri)
    .select("id");

  if (error) {
    // Use warn to avoid triggering error overlay - RLS errors are expected in some cases
    console.warn('[Database] Failed to update image URI:', error);
    throw error;
  }
  
  const updatedCount = data?.length ?? 0;
  
  if (updatedCount === 0) {
    console.log('[Database] No rows updated (item deleted or image changed since enqueue)');
  } else {
    console.log('[Database] Image URI updated successfully');
  }
  
  return updatedCount;
}

/**
 * Guarded update of image URI for scans (used by background upload)
 * 
 * Only updates if:
 * 1. Current image_uri matches expectedImageUri
 * 2. Outcome is 'saved_to_revisit' (user still wants this saved)
 * 
 * This prevents stale upload jobs from overwriting and ensures
 * we don't upload for unsaved scans.
 * 
 * Returns the number of rows updated (0 if check deleted, image changed, or unsaved).
 */
export async function updateRecentCheckImageUriGuarded(params: {
  checkId: string;
  remoteUrl: string;
  expectedImageUri: string; // must match current DB value to update
}): Promise<number> {
  console.log('[Database] Guarded update for scan:', params.checkId);
  console.log('[Database] Expected URI:', params.expectedImageUri);
  console.log('[Database] New remote URL:', params.remoteUrl);
  
  const { data, error } = await supabase
    .from("recent_checks")
    .update({ image_uri: params.remoteUrl })
    .eq("id", params.checkId)
    .eq("image_uri", params.expectedImageUri)
    .eq("outcome", "saved_to_revisit") // Only update saved scans
    .select("id");

  if (error) {
    // Use warn to avoid triggering error overlay - RLS errors are expected in some cases
    console.warn('[Database] Failed to update scan image URI:', error);
    throw error;
  }
  
  const updatedCount = data?.length ?? 0;
  
  if (updatedCount === 0) {
    console.log('[Database] No rows updated (scan deleted, image changed, or unsaved)');
  } else {
    console.log('[Database] Scan image URI updated successfully');
  }
  
  return updatedCount;
}

export const useRemoveWardrobeItem = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, imageUri }: { id: string; imageUri?: string }) => {
      if (!user?.id) throw new Error("Not authenticated");

      // 1) Clean up storage (cancel pending uploads, delete local file)
      await cleanupWardrobeItemStorage(id, imageUri);

      // 2) Delete DB record
      const { error } = await supabase
        .from("wardrobe_items")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;

      // Return the deleted item ID so caller can use it
      return { deletedId: id };
    },
    // NOTE: We intentionally do NOT invalidate queries here.
    // The caller should invalidate AFTER navigation to prevent UI freezes
    // when multiple components are subscribed to the wardrobe query.
    // Use queryClient.invalidateQueries({ queryKey: ["wardrobe"] }) after navigation.
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

// Helper hook for recent checks count (for quota enforcement)
export const useRecentChecksCount = () => {
  const { data: checks } = useRecentChecks();
  return checks?.length ?? 0;
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
    // Keep data fresh for 2 seconds - prevents flash during navigation back
    // after save/unsave (optimistic update already has correct data)
    staleTime: 2000,
  });
};

export const useAddRecentCheck = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      check: Omit<RecentCheck, "id" | "createdAt">
    ): Promise<{ id: string; imageUri: string }> => {
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

      // Insert the scan and return the new record
      // Quota enforcement (keep newest 20 unsaved) happens via DB trigger
      const { data, error } = await supabase
        .from("recent_checks")
        .insert(insertData)
        .select("id, image_uri")
        .single();

      if (error) throw error;

      return { id: data.id, imageUri: data.image_uri };
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
    mutationFn: async ({ id, imageUri }: { id: string; imageUri?: string }) => {
      if (!user?.id) throw new Error("Not authenticated");

      // 1) Clean up storage (cancel pending uploads, delete local file)
      await cleanupScanStorage(id, imageUri);

      // 2) Delete DB record
      const { error } = await supabase
        .from("recent_checks")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    // No optimistic update - item stays visible until delete succeeds
    // This prevents jarring disappear/reappear on error
    onSuccess: () => {
      // Only update cache after successful deletion
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
    mutationFn: async ({ 
      id, 
      outcome,
      imageUri, // Optional: update image URI when saving (for local storage)
    }: { 
      id: string; 
      outcome: RecentCheck["outcome"];
      imageUri?: string;
    }) => {
      if (!user?.id) throw new Error("Not authenticated");

      const updateData: Record<string, unknown> = { outcome };
      if (imageUri) {
        updateData.image_uri = imageUri;
      }

      const { error } = await supabase
        .from("recent_checks")
        .update(updateData)
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
      
      return { id, outcome, imageUri };
    },
    // Optimistic update - update cache immediately without waiting for server
    onMutate: async ({ id, outcome, imageUri }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["recentChecks", user?.id] });

      // Snapshot the previous value
      const previousChecks = queryClient.getQueryData<RecentCheck[]>(["recentChecks", user?.id]);

      // Optimistically update the cache
      if (previousChecks) {
        queryClient.setQueryData<RecentCheck[]>(
          ["recentChecks", user?.id],
          previousChecks.map((check) =>
            check.id === id 
              ? { ...check, outcome, ...(imageUri && { imageUri }) } 
              : check
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

// ============================================
// USAGE-BASED QUOTA TRACKING
// ============================================

/**
 * Usage quota limits for free users.
 * These are LIFETIME limits (not capacity) - usage never decreases.
 * NOTE: These are also enforced server-side in SQL functions.
 */
export const USAGE_LIMITS = {
  FREE_SCANS: 5,
  FREE_WARDROBE_ADDS: 15,
} as const;

interface UsageCounts {
  scansUsed: number;
  wardrobeAddsUsed: number;
  isPro: boolean;
}

/**
 * Reason codes returned by consume_*_credit functions.
 * Useful for analytics and debugging conversion triggers.
 */
export type ConsumeReason = 
  | 'consumed'          // Credit was successfully consumed
  | 'idempotent_replay' // Same idempotency key - no new charge
  | 'pro_unlimited'     // Pro user - unlimited access
  | 'quota_exceeded';   // At/over limit - blocked

interface ConsumeResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  alreadyConsumed: boolean;
  reason: ConsumeReason;
}

/**
 * Generate a unique idempotency key for a NEW request attempt.
 * 
 * IMPORTANT: Client-side idempotency key management rules:
 * 1. Generate a new key at the START of a scan/add flow
 * 2. Store it in state while that attempt is running
 * 3. REUSE the same key for retries of the same attempt
 * 4. Generate a NEW key only for a brand-new attempt
 * 
 * This ensures "timeout + retry" behavior stays consistent.
 */
export function generateIdempotencyKey(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Hook to get current usage counts from database.
 * Returns lifetime usage (never decreases, even if items are deleted).
 * Use this for UI display only - NOT for quota enforcement.
 */
export const useUsageCounts = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["usageCounts", user?.id],
    queryFn: async (): Promise<UsageCounts> => {
      if (!user?.id) return { scansUsed: 0, wardrobeAddsUsed: 0, isPro: false };

      // No user_id parameter - function uses auth.uid() internally for security
      const { data, error } = await supabase.rpc('get_usage_counts');

      if (error) {
        console.error('[Usage] Failed to get usage counts:', error);
        // Return zeros on error - fail open for UX, but log for monitoring
        return { scansUsed: 0, wardrobeAddsUsed: 0, isPro: false };
      }

      // RPC returns array with single row
      const row = data?.[0];
      return {
        scansUsed: row?.scans_used ?? 0,
        wardrobeAddsUsed: row?.wardrobe_adds_used ?? 0,
        isPro: row?.is_pro ?? false,
      };
    },
    enabled: !!user?.id,
    staleTime: 30000, // Cache for 30s to reduce DB calls
  });
};

/**
 * Hook to atomically consume a scan credit BEFORE making an AI call.
 * 
 * CRITICAL: Call this BEFORE the AI call, not after!
 * This prevents race conditions and ensures you never pay for over-quota calls.
 * 
 * Features:
 * - Uses auth.uid() server-side (no user_id spoofing possible)
 * - Idempotent (double-tap won't consume twice with same key)
 * - Returns remaining credits and reason for UI/analytics
 * 
 * @param idempotencyKey - Optional. Pass the SAME key for retries of the same attempt.
 *                         If omitted, a new key is generated (new attempt).
 * 
 * Returns { allowed, used, limit, remaining, alreadyConsumed, reason }
 * - If allowed=false, show paywall and DO NOT make the AI call
 * - If allowed=true, proceed with AI call (credit already consumed)
 * - alreadyConsumed=true means this was a retry of the same request
 * - reason: 'consumed' | 'idempotent_replay' | 'pro_unlimited' | 'quota_exceeded'
 */
export const useConsumeScanCredit = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (idempotencyKey?: string): Promise<ConsumeResult> => {
      if (!user?.id) throw new Error("Not authenticated");

      // Use provided key for retries, or generate new key for new attempts
      const key = idempotencyKey ?? generateIdempotencyKey();
      
      // No user_id parameter - function uses auth.uid() internally for security
      const { data, error } = await supabase
        .rpc('consume_scan_credit', { p_idempotency_key: key });

      if (error) {
        console.error('[Usage] Failed to consume scan credit:', error);
        throw error;
      }

      // RPC returns array with single row
      const row = data?.[0];
      const result: ConsumeResult = {
        allowed: row?.allowed ?? false,
        used: row?.used ?? 0,
        limit: row?.credit_limit ?? USAGE_LIMITS.FREE_SCANS,
        remaining: row?.remaining ?? 0,
        alreadyConsumed: row?.already_consumed ?? false,
        reason: (row?.reason as ConsumeReason) ?? 'quota_exceeded',
      };
      
      // Log reason for analytics/debugging
      console.log('[Usage] Scan credit consume result:', result.reason, result);
      
      return result;
    },
    onSuccess: (result) => {
      // Update cache immediately
      queryClient.setQueryData<UsageCounts>(
        ["usageCounts", user?.id],
        (old) => old 
          ? { ...old, scansUsed: result.used } 
          : { scansUsed: result.used, wardrobeAddsUsed: 0, isPro: false }
      );
    },
  });
};

/**
 * Hook to atomically consume a wardrobe add credit BEFORE making an AI call.
 * 
 * CRITICAL: Call this BEFORE the AI call, not after!
 * This prevents race conditions and ensures you never pay for over-quota calls.
 * 
 * Features:
 * - Uses auth.uid() server-side (no user_id spoofing possible)
 * - Idempotent (double-tap won't consume twice with same key)
 * - Returns remaining credits and reason for UI/analytics
 * 
 * @param idempotencyKey - Optional. Pass the SAME key for retries of the same attempt.
 *                         If omitted, a new key is generated (new attempt).
 * 
 * Returns { allowed, used, limit, remaining, alreadyConsumed, reason }
 * - If allowed=false, show paywall and DO NOT make the AI call
 * - If allowed=true, proceed with AI call (credit already consumed)
 * - reason: 'consumed' | 'idempotent_replay' | 'pro_unlimited' | 'quota_exceeded'
 */
export const useConsumeWardrobeAddCredit = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (idempotencyKey?: string): Promise<ConsumeResult> => {
      if (!user?.id) throw new Error("Not authenticated");

      // Use provided key for retries, or generate new key for new attempts
      const key = idempotencyKey ?? generateIdempotencyKey();
      
      // No user_id parameter - function uses auth.uid() internally for security
      const { data, error } = await supabase
        .rpc('consume_wardrobe_add_credit', { p_idempotency_key: key });

      if (error) {
        console.error('[Usage] Failed to consume wardrobe add credit:', error);
        throw error;
      }

      // RPC returns array with single row
      const row = data?.[0];
      const result: ConsumeResult = {
        allowed: row?.allowed ?? false,
        used: row?.used ?? 0,
        limit: row?.credit_limit ?? USAGE_LIMITS.FREE_WARDROBE_ADDS,
        remaining: row?.remaining ?? 0,
        alreadyConsumed: row?.already_consumed ?? false,
        reason: (row?.reason as ConsumeReason) ?? 'quota_exceeded',
      };
      
      // Log reason for analytics/debugging
      console.log('[Usage] Wardrobe add credit consume result:', result.reason, result);
      
      return result;
    },
    onSuccess: (result) => {
      // Update cache immediately
      queryClient.setQueryData<UsageCounts>(
        ["usageCounts", user?.id],
        (old) => old 
          ? { ...old, wardrobeAddsUsed: result.used } 
          : { scansUsed: 0, wardrobeAddsUsed: result.used, isPro: false }
      );
    },
  });
};

/**
 * Convenience hook that combines usage counts with quota checks.
 * Use this for UI display (showing remaining credits, pre-emptive paywall).
 * For actual consumption, use useConsumeScanCredit / useConsumeWardrobeAddCredit.
 */
export const useUsageQuota = () => {
  const { data: counts, isLoading } = useUsageCounts();
  
  return {
    scansUsed: counts?.scansUsed ?? 0,
    wardrobeAddsUsed: counts?.wardrobeAddsUsed ?? 0,
    isPro: counts?.isPro ?? false,
    hasScansRemaining: (counts?.isPro) || (counts?.scansUsed ?? 0) < USAGE_LIMITS.FREE_SCANS,
    hasWardrobeAddsRemaining: (counts?.isPro) || (counts?.wardrobeAddsUsed ?? 0) < USAGE_LIMITS.FREE_WARDROBE_ADDS,
    remainingScans: Math.max(0, USAGE_LIMITS.FREE_SCANS - (counts?.scansUsed ?? 0)),
    remainingWardrobeAdds: Math.max(0, USAGE_LIMITS.FREE_WARDROBE_ADDS - (counts?.wardrobeAddsUsed ?? 0)),
    isLoading,
  };
};

