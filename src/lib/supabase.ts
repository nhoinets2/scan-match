import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Create a placeholder client if credentials are missing
// This prevents the app from crashing during development
let supabase: SupabaseClient;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
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

export { supabase };
