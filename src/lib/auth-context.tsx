import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { Session, User } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "./supabase";
import { useSnapToMatchStore } from "./store";
import { useQuotaStore } from "./quota-store";
import { initializeRevenueCat, logoutUser } from "./revenuecatClient";

// Required for expo-auth-session to close the browser on completion
WebBrowser.maybeCompleteAuthSession();

type OAuthProvider = "google" | "apple";

type AuthContextType = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => void;
  signInWithApple: () => Promise<{ error: Error | null }>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: Error | null }>;
  isAppleAuthAvailable: boolean;
  isGoogleLoading: boolean;
  isAppleLoading: boolean;
  googleError: Error | null;
  appleError: Error | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAppleAuthAvailable, setIsAppleAuthAvailable] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<Error | null>(null);
  const [appleError, setAppleError] = useState<Error | null>(null);
  const clearCache = useSnapToMatchStore((s) => s.clearCache);

  // Google Auth is handled via Supabase OAuth redirect
  // No client-side credentials needed - configured in Supabase Dashboard

  useEffect(() => {
    // Check if Apple Auth is available (iOS only)
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then((available) => {
        console.log("[Auth] Apple Sign-In available:", available);
        setIsAppleAuthAvailable(available);
      });
    } else {
      console.log("[Auth] Apple Sign-In not available on platform:", Platform.OS);
    }

    // Get initial session and initialize RevenueCat
    supabase.auth.getSession().then(async ({ data: { session: initialSession }, error }) => {
      if (error) {
        console.error("Error getting session:", error);
      }
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      
      // Only initialize RevenueCat if user is signed in
      if (initialSession?.user?.id) {
        console.log("[Auth] Session restored for user:", initialSession.user.email);
        console.log("[Auth] Initializing RevenueCat with user ID:", initialSession.user.id);
        await initializeRevenueCat(initialSession.user.id);
      } else {
        console.log("[Auth] No session - RevenueCat will initialize on sign-in");
      }
      
      setIsLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log("[Auth] Auth state changed:", event);
      setSession(newSession);
      setUser(newSession?.user ?? null);

      // Initialize RevenueCat when user signs in
      // Since we don't initialize for anonymous users, this is the first initialization
      if (event === "SIGNED_IN" && newSession?.user?.id) {
        console.log("[Auth] User signed in, initializing RevenueCat with ID:", newSession.user.id);
        await initializeRevenueCat(newSession.user.id);
        console.log("[Auth] ✅ RevenueCat initialized with user ID from the start");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signInWithApple = async () => {
    console.log("[Auth] signInWithApple called, isAppleAuthAvailable:", isAppleAuthAvailable);
    
    // Check if Apple auth is available (iOS only)
    if (!isAppleAuthAvailable) {
      const errorMsg = Platform.OS === "ios" 
        ? "Apple Sign-In is not available on this device. Make sure 'Sign in with Apple' capability is added in Xcode."
        : "Apple Sign-In is only available on iOS devices. Please use another sign-in method.";
      console.log("[Auth] Apple Sign-In not available:", errorMsg);
      setAppleError(new Error(errorMsg));
      return { error: new Error(errorMsg) };
    }

    try {
      setIsAppleLoading(true);
      setAppleError(null);
      
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (credential.identityToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: credential.identityToken,
        });
        setIsAppleLoading(false);
        if (error) {
          setAppleError(error);
        }
        return { error: error as Error | null };
      }
      setIsAppleLoading(false);
      const noTokenError = new Error("No identity token received from Apple");
      setAppleError(noTokenError);
      return { error: noTokenError };
    } catch (e: unknown) {
      setIsAppleLoading(false);
      const error = e as { code?: string; message?: string };
      if (error.code === "ERR_REQUEST_CANCELED") {
        // User canceled the sign-in
        return { error: null };
      }
      const authError = new Error(error.message ?? "Apple sign in failed");
      setAppleError(authError);
      return { error: authError };
    }
  };

  const signInWithGoogle = async () => {
    try {
      setIsGoogleLoading(true);
      setGoogleError(null);
      
      // Get the redirect URL for the current platform
      const redirectUrl = Linking.createURL("/");
      
      // Use Supabase OAuth - credentials are configured in Supabase Dashboard
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: false,
        },
      });
      
      if (error) {
        console.error("Google sign-in error:", error);
        setGoogleError(error);
      }
      setIsGoogleLoading(false);
    } catch (error) {
      console.error("Google sign-in error:", error);
      setGoogleError(error as Error);
      setIsGoogleLoading(false);
    }
  };

  const signInWithOAuth = async (provider: OAuthProvider) => {
    if (provider === "apple") {
      return signInWithApple();
    }

    if (provider === "google") {
      signInWithGoogle();
      return { error: null };
    }

    return { error: new Error("Unknown OAuth provider") };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error as Error | null };
  };

  const updatePassword = async (currentPassword: string, newPassword: string) => {
    // First, verify the current password by re-authenticating
    if (!user?.email) {
      return { error: new Error("No user email found") };
    }

    // Re-authenticate with current password to verify it's correct
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      return { error: new Error("Current password is incorrect") };
    }

    // Update to the new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    return { error: updateError as Error | null };
  };

  const signOut = async () => {
    // Clear the ephemeral store cache
    clearCache();
    // Reset quota counters so new user starts fresh
    useQuotaStore.getState().resetQuotas();
    // Logout from RevenueCat to unlink user
    await logoutUser().catch((err) => {
      console.log("[Auth] Failed to logout from RevenueCat:", err);
    });
    await supabase.auth.signOut();
  };

  const deleteAccount = async () => {
    const userIdToDelete = user?.id;

    if (!userIdToDelete) {
      return { error: new Error("No user to delete") };
    }

    try {
      // Delete all user data from all tables first
      // Delete wardrobe items
      await supabase.from("wardrobe_items").delete().eq("user_id", userIdToDelete);

      // Delete user preferences
      await supabase.from("user_preferences").delete().eq("user_id", userIdToDelete);

      // Delete recent checks
      await supabase.from("recent_checks").delete().eq("user_id", userIdToDelete);

      // Delete the auth user using the database function
      // This function must be created in Supabase SQL Editor:
      // CREATE OR REPLACE FUNCTION delete_user()
      // RETURNS void AS $$
      // BEGIN
      //   DELETE FROM auth.users WHERE id = auth.uid();
      // END;
      // $$ LANGUAGE plpgsql SECURITY DEFINER;
      const { error: deleteUserError } = await supabase.rpc("delete_user");

      if (deleteUserError) {
        console.error("Error deleting auth user:", deleteUserError);
        // Continue with sign out even if auth deletion fails
      }

      // Clear local cache and sign out
      clearCache();
      await supabase.auth.signOut();

      return { error: null };
    } catch (error) {
      console.error("Error deleting account:", error);
      return { error: error as Error };
    }
  };

  // Admin function to delete a user by email
  // Usage: deleteUserByEmail("user@example.com")
  const deleteUserByEmail = async (email: string) => {
    try {
      // First, get the user ID from auth.users table via a database function
      // Or query user_preferences to find the user_id by email
      // Note: This requires a database function or admin access to auth.users
      
      // For now, we can query user_preferences to find user_id
      // This assumes email is stored somewhere or we need to query auth.users
      // Since we can't directly query auth.users from client, we'd need:
      // 1. A database function that accepts email and returns user_id
      // 2. Or store email in user_preferences table
      
      // Alternative: Use user ID directly if you have it
      // deleteAccount(userId)
      
      return { error: new Error("deleteUserByEmail requires database function or admin API") };
    } catch (error) {
      console.error("Error deleting user by email:", error);
      return { error: error as Error };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        isLoading,
        signUp,
        signIn,
        signInWithOAuth,
        signInWithGoogle,
        signInWithApple,
        resetPassword,
        updatePassword,
        signOut,
        deleteAccount,
        isAppleAuthAvailable,
        isGoogleLoading,
        isAppleLoading,
        googleError,
        appleError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
