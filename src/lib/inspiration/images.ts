/**
 * Image map for tip sheet assets
 *
 * Maps string paths to require() calls for local assets.
 * React Native requires static require() calls resolved at build time.
 *
 * Also supports remote URLs from Supabase Storage.
 *
 * NOTE: Local library images have been removed. The system now relies on
 * remote URLs from Supabase Storage for library item images.
 */
import { ImageSourcePropType } from "react-native";

// Type for the image map
type ImageMap = Record<string, ImageSourcePropType>;

// Type for resolved image (can be local require or remote URI)
export type ResolvedImage = ImageSourcePropType | { uri: string };

/**
 * Check if a path is a remote URL
 */
export function isRemoteUrl(path: string): boolean {
  return path.startsWith("http://") || path.startsWith("https://");
}

/**
 * Library images - product shots organized by category
 *
 * Local assets have been removed. Library items should now use
 * remote URLs from Supabase Storage (set via the library_items table).
 */
export const LIBRARY_IMAGES: ImageMap = {
  // Local library images removed - use Supabase Storage URLs instead
};

/**
 * Resolve an image path string to a require() source or remote URI
 * Supports:
 * - Local asset paths (e.g., "assets/inspiration/library/tops/top_tee_white.png")
 * - Remote URLs from Supabase Storage (e.g., "https://xxx.supabase.co/storage/v1/...")
 *
 * Returns null if the image is not found in the local map and is not a remote URL
 */
export function resolveImage(path: string): ResolvedImage | null {
  // Handle remote URLs (Supabase Storage)
  if (isRemoteUrl(path)) {
    return { uri: path };
  }

  // Handle local assets
  return LIBRARY_IMAGES[path] ?? null;
}
