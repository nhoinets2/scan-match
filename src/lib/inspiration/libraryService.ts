/**
 * Library Items Service
 *
 * Fetches library items from Supabase with local fallback.
 * Supports both remote URLs (Supabase Storage) and local assets.
 */

import { supabase } from "../supabase";
import { useQuery } from "@tanstack/react-query";
import type { Category } from "../types";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface LibraryItemRecord {
  id: string;
  category: Category;
  label: string;
  image_url: string; // Supabase Storage URL or local asset path
  vibes: string[];
  tone: "light" | "neutral" | "dark";
  structure: "soft" | "structured";
  // NEW: Hybrid schema fields
  volume?: "fitted" | "regular" | "oversized" | "unknown";
  shape?: string; // Category-specific, validated in app
  length?: string; // Category-specific, validated in app
  tier?: "core" | "staple" | "style" | "statement";
  // DEPRECATED fields (kept for backward compatibility)
  shoe_profile?: "minimal" | "statement";
  silhouette?: "fitted" | "straight" | "wide" | "oversized";
  formality?: "casual" | "smart-casual" | "formal";
  outerwear_weight?: "light" | "medium" | "heavy";
  rank: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────
// Supabase Storage Helpers
// ─────────────────────────────────────────────

const BUCKET_NAME = "library-items";

/**
 * Get public URL for a file in Supabase Storage
 */
export function getStorageUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Check if a URL is a Supabase Storage URL
 */
export function isRemoteUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

// ─────────────────────────────────────────────
// Data Fetching
// ─────────────────────────────────────────────

/**
 * Fetch all active library items from Supabase
 */
async function fetchLibraryItems(): Promise<LibraryItemRecord[]> {
  const { data, error } = await supabase
    .from("library_items")
    .select("*")
    .eq("active", true)
    .order("rank", { ascending: true });

  if (error) {
    console.warn("[LibraryService] Failed to fetch from Supabase:", error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Fetch library items by category
 */
async function fetchLibraryItemsByCategory(
  category: Category
): Promise<LibraryItemRecord[]> {
  const { data, error } = await supabase
    .from("library_items")
    .select("*")
    .eq("category", category)
    .eq("active", true)
    .order("rank", { ascending: true });

  if (error) {
    console.warn("[LibraryService] Failed to fetch by category:", error.message);
    return [];
  }

  return data ?? [];
}

// ─────────────────────────────────────────────
// React Query Hooks
// ─────────────────────────────────────────────

/**
 * Hook to fetch all library items
 */
export function useLibraryItems() {
  return useQuery({
    queryKey: ["library-items"],
    queryFn: fetchLibraryItems,
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Hook to fetch library items by category
 */
export function useLibraryItemsByCategory(category: Category) {
  return useQuery({
    queryKey: ["library-items", category],
    queryFn: () => fetchLibraryItemsByCategory(category),
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  });
}

// ─────────────────────────────────────────────
// Conversion to Internal Types
// ─────────────────────────────────────────────

import type { LibraryItemMeta } from "./tipsheets";
import type { Volume, Shape, Length, Tier } from "../types";

/**
 * Convert Supabase record to internal LibraryItemMeta type
 */
export function toLibraryItemMeta(record: LibraryItemRecord): LibraryItemMeta {
  return {
    id: record.id,
    rank: record.rank,
    tier: record.tier as Tier | undefined,
    image: record.image_url,
    label: record.label,
    category: record.category,
    vibes: record.vibes as LibraryItemMeta["vibes"],
    tone: record.tone,
    structure: record.structure,
    // NEW: Hybrid schema fields
    volume: record.volume as Volume | undefined,
    shape: record.shape as Shape | undefined,
    length: record.length as Length | undefined,
    // DEPRECATED fields (kept for backward compatibility)
    shoeProfile: record.shoe_profile,
    silhouette: record.silhouette,
    formality: record.formality,
    outerwearWeight: record.outerwear_weight,
  };
}

/**
 * Convert array of Supabase records to internal types
 */
export function toLibraryItemsMeta(
  records: LibraryItemRecord[]
): LibraryItemMeta[] {
  return records.map(toLibraryItemMeta);
}
