import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Helper to clear invalid auth tokens from storage
const clearInvalidTokens = async () => {
  try {
    // Clear Supabase auth tokens from AsyncStorage
    const keys = await AsyncStorage.getAllKeys();
    const supabaseKeys = keys.filter(
      (key) => key.includes("supabase") || key.includes("sb-")
    );
    if (supabaseKeys.length > 0) {
      await AsyncStorage.multiRemove(supabaseKeys);
      console.log("[Supabase] Cleared invalid auth tokens from storage");
    }
  } catch (e) {
    console.log("[Supabase] Error clearing tokens:", e);
  }
};

// Create a placeholder client if credentials are missing
// This prevents the app from crashing during development
let supabase: SupabaseClient;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true, // Enable URL detection for password reset links
    },
  });

  // Set up a listener to handle token refresh errors globally
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("[Supabase] Auth state change:", event);
    if (event === "TOKEN_REFRESHED" && !session) {
      // Token refresh failed, clear invalid tokens
      console.log("[Supabase] Token refresh failed, clearing storage...");
      await clearInvalidTokens();
    }
    // Handle sign out event to ensure clean state
    if (event === "SIGNED_OUT") {
      console.log("[Supabase] User signed out, clearing any stale tokens...");
      await clearInvalidTokens();
    }
  });

  // Proactively check and clear invalid session on startup
  (async () => {
    try {
      const { error } = await supabase.auth.getSession();
      if (error) {
        const errorMessage = error.message || String(error);
        if (
          errorMessage.includes("Refresh Token") ||
          errorMessage.includes("refresh_token") ||
          errorMessage.includes("Invalid") ||
          errorMessage.includes("not found")
        ) {
          console.log("[Supabase] Invalid session detected on startup, clearing...");
          await clearInvalidTokens();
          await supabase.auth.signOut().catch(() => {});
        }
      }
    } catch (e) {
      console.log("[Supabase] Error checking session on startup:", e);
      await clearInvalidTokens();
    }
  })();
} else {
  console.warn(
    "⚠️ Supabase credentials not found. Please add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your environment variables in the ENV tab."
  );
  // Create a mock client that won't crash but won't work either
  supabase = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signUp: async () => ({ data: { user: null, session: null }, error: new Error("Supabase not configured") }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: new Error("Supabase not configured") }),
      signOut: async () => ({ error: null }),
    },
  } as unknown as SupabaseClient;
}

export { supabase, clearInvalidTokens };
