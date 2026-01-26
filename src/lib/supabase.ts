import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Get and trim environment variables (removes any invisible whitespace)
const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

// Validate URL format
const isValidUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

// Log startup configuration for debugging
console.log("[Supabase] Initializing client...");
console.log(`[Supabase] URL present: ${!!supabaseUrl}, length: ${supabaseUrl.length}`);
console.log(`[Supabase] Anon key present: ${!!supabaseAnonKey}, length: ${supabaseAnonKey.length}`);
if (supabaseUrl && !isValidUrl(supabaseUrl)) {
  console.warn(`[Supabase] ⚠️ URL is not valid: "${supabaseUrl.substring(0, 50)}..."`);
}

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

// Create a placeholder client if credentials are missing or invalid
// This prevents the app from crashing during development
let supabase: SupabaseClient;

if (supabaseUrl && supabaseAnonKey && isValidUrl(supabaseUrl)) {
  console.log("[Supabase] ✅ Credentials valid, creating real client");
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // Must be false for React Native - we handle deep links manually
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
  const reason = !supabaseUrl
    ? "EXPO_PUBLIC_SUPABASE_URL is missing"
    : !supabaseAnonKey
    ? "EXPO_PUBLIC_SUPABASE_ANON_KEY is missing"
    : !isValidUrl(supabaseUrl)
    ? `EXPO_PUBLIC_SUPABASE_URL is not a valid URL: "${supabaseUrl.substring(0, 30)}..."`
    : "Unknown reason";
  console.warn(`⚠️ Supabase not configured: ${reason}`);
  console.warn("Please check your environment variables in the ENV tab.");
  // Create a mock client that won't crash but won't work either
  // This includes all commonly used methods to prevent runtime errors
  const mockError = new Error("Supabase not configured");
  const mockQueryBuilder = {
    select: () => mockQueryBuilder,
    insert: () => mockQueryBuilder,
    update: () => mockQueryBuilder,
    delete: () => mockQueryBuilder,
    eq: () => mockQueryBuilder,
    neq: () => mockQueryBuilder,
    gt: () => mockQueryBuilder,
    gte: () => mockQueryBuilder,
    lt: () => mockQueryBuilder,
    lte: () => mockQueryBuilder,
    like: () => mockQueryBuilder,
    ilike: () => mockQueryBuilder,
    is: () => mockQueryBuilder,
    in: () => mockQueryBuilder,
    contains: () => mockQueryBuilder,
    containedBy: () => mockQueryBuilder,
    order: () => mockQueryBuilder,
    limit: () => mockQueryBuilder,
    range: () => mockQueryBuilder,
    single: () => Promise.resolve({ data: null, error: mockError }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (value: { data: null; error: Error }) => void) => resolve({ data: null, error: mockError }),
  };
  supabase = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signUp: async () => ({ data: { user: null, session: null }, error: mockError }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: mockError }),
      signInWithOAuth: async () => ({ data: { provider: "", url: "" }, error: mockError }),
      signOut: async () => ({ error: null }),
      setSession: async () => ({ data: { session: null, user: null }, error: mockError }),
      updateUser: async () => ({ data: { user: null }, error: mockError }),
      resetPasswordForEmail: async () => ({ data: {}, error: mockError }),
    },
    from: () => mockQueryBuilder,
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: mockError }),
        download: async () => ({ data: null, error: mockError }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
        remove: async () => ({ data: null, error: mockError }),
        list: async () => ({ data: null, error: mockError }),
      }),
    },
    rpc: async () => ({ data: null, error: mockError }),
  } as unknown as SupabaseClient;
}

export { supabase, clearInvalidTokens };
