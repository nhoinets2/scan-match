import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { Session, User } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase, clearInvalidTokens } from "./supabase";
import { useSnapToMatchStore } from "./store";
import { useQuotaStore } from "./quota-store";
import { initializeRevenueCat, logoutUser, setUserId } from "./revenuecatClient";
import { queryClient } from "./queryClient";

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
    const initializeSession = async () => {
      try {
        let initialSession = null;
        let error = null;

        try {
          const result = await supabase.auth.getSession();
          initialSession = result.data?.session;
          error = result.error;
        } catch (getSessionError: any) {
          // Catch errors thrown during getSession (e.g., invalid refresh token)
          console.error("[Auth] getSession threw error:", getSessionError);
          error = getSessionError;
        }

        if (error) {
          console.error("[Auth] Error getting session:", error);
          const errorMessage = error.message || String(error);
          // Handle invalid refresh token - sign out the user gracefully
          if (
            errorMessage.includes("Refresh Token") ||
            errorMessage.includes("refresh_token") ||
            errorMessage.includes("Invalid") ||
            errorMessage.includes("not found") ||
            (error as any)?.code === "invalid_refresh_token"
          ) {
            console.log("[Auth] Invalid refresh token detected, clearing session...");
            await clearInvalidTokens();
            try {
              await supabase.auth.signOut();
            } catch (signOutError) {
              console.log("[Auth] Sign out failed (expected if token is invalid):", signOutError);
            }
            setSession(null);
            setUser(null);
            setIsLoading(false);
            return;
          }
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
      } catch (error: any) {
        // Catch any unhandled errors during session retrieval
        console.error("[Auth] Failed to get session:", error);

        // Check if this is a refresh token error
        const errorMessage = error?.message || String(error);
        if (
          errorMessage.includes("Refresh Token") ||
          errorMessage.includes("refresh_token") ||
          errorMessage.includes("Invalid")
        ) {
          console.log("[Auth] Refresh token error caught, clearing session...");
          await clearInvalidTokens();
        }

        // Sign out to clear invalid session data
        try {
          await supabase.auth.signOut();
        } catch (signOutError) {
          console.log("[Auth] Sign out during error recovery failed:", signOutError);
        }
        setSession(null);
        setUser(null);
        setIsLoading(false);
      }
    };

    initializeSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log("[Auth] Auth state changed:", event, "User:", newSession?.user?.email);
      setSession(newSession);
      setUser(newSession?.user ?? null);

      // Initialize/login RevenueCat when user signs in
      if (event === "SIGNED_IN" && newSession?.user?.id) {
        console.log("[Auth] User signed in, setting up RevenueCat with ID:", newSession.user.id);
        
        // First, try to initialize (will work on first app launch)
        await initializeRevenueCat(newSession.user.id);
        
        // Then, set the user ID (will work after logout when SDK is already initialized)
        // This handles the case where user logs out and logs into a different account
        const setUserResult = await setUserId(newSession.user.id);
        if (setUserResult.ok) {
          console.log("[Auth] ✅ RevenueCat user ID set successfully");
        } else {
          console.log("[Auth] ⚠️ RevenueCat setUserId:", setUserResult.reason);
        }
      }
      
      // CRITICAL: Clear React Query cache on sign out to prevent data leakage between users
      if (event === "SIGNED_OUT") {
        console.log("[Auth] 🧹 Clearing React Query cache on sign out...");
        queryClient.clear();
        console.log("[Auth] ✅ React Query cache cleared");
      }
      
      // Clear Google loading state on auth change
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setIsGoogleLoading(false);
        setIsAppleLoading(false);
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
    console.log("[Auth] signInWithGoogle called");
    try {
      setIsGoogleLoading(true);
      setGoogleError(null);
      
      // Get the redirect URL for the current platform
      const redirectUrl = Linking.createURL("/");
      console.log("[Auth] Google OAuth redirect URL:", redirectUrl);
      
      // Use Supabase OAuth - credentials are configured in Supabase Dashboard
      console.log("[Auth] Initiating Google OAuth...");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true, // We'll handle the browser ourselves
        },
      });
      
      console.log("[Auth] Google OAuth response:", { data, error });
      
      if (error) {
        console.error("[Auth] Google sign-in error:", error);
        setGoogleError(error);
        setIsGoogleLoading(false);
        return;
      }
      
      if (data?.url) {
        console.log("[Auth] Opening Google OAuth URL:", data.url);
        
        // Open the OAuth URL in browser
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectUrl,
          {
            showInRecents: true,
          }
        );
        
        console.log("[Auth] Browser result:", result);
        
        if (result.type === "success" && result.url) {
          console.log("[Auth] OAuth callback received, URL:", result.url);
          
          // Check for errors in the callback URL
          if (result.url.includes("error=")) {
            const urlParams = new URLSearchParams(result.url.split("?")[1]);
            const errorCode = urlParams.get("error_code");
            const errorDescription = urlParams.get("error_description");
            console.error("[Auth] OAuth error:", errorCode, errorDescription);
            
            const authError = new Error(
              errorDescription 
                ? decodeURIComponent(errorDescription).replace(/\+/g, " ")
                : "Google sign-in failed"
            );
            setGoogleError(authError);
            setIsGoogleLoading(false);
            return;
          }
          
          // Extract the URL params and manually set the session
          const url = new URL(result.url);
          const params = new URLSearchParams(url.search + url.hash.replace("#", "&"));
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");
          
          if (accessToken && refreshToken) {
            console.log("[Auth] Setting session from OAuth tokens");
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            
            if (sessionError) {
              console.error("[Auth] Failed to set session:", sessionError);
              setGoogleError(sessionError);
            } else {
              console.log("[Auth] ✅ Google OAuth session established");
            }
          } else {
            console.log("[Auth] No tokens found in callback URL, waiting for auth state change");
          }
        } else if (result.type === "cancel") {
          console.log("[Auth] User canceled OAuth");
        } else {
          console.log("[Auth] OAuth dismissed");
        }
      }
      
      setIsGoogleLoading(false);
    } catch (error) {
      console.error("[Auth] Google sign-in exception:", error);
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
    // Use the full app URL with type parameter to ensure proper routing
    const redirectUrl = 'snaptomatch://reset-password-confirm';
    console.log('[Auth] Sending password reset email with redirectTo:', redirectUrl);
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    
    if (error) {
      console.error('[Auth] Password reset error:', error);
    } else {
      console.log('[Auth] ✅ Password reset email sent successfully');
    }
    
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
    console.log("[Auth] 🚪 signOut started");
    
    // Clear cache and quotas, but don't let errors block signOut
    try {
      console.log("[Auth] Clearing cache...");
      clearCache();
    } catch (cacheError) {
      console.error("[Auth] Error clearing cache (non-fatal):", cacheError);
    }
    
    try {
      console.log("[Auth] Resetting quotas...");
      useQuotaStore.getState().resetQuotas();
    } catch (quotaError) {
      console.error("[Auth] Error resetting quotas (non-fatal):", quotaError);
    }
    
    // CRITICAL: Clear React Query cache to prevent data leakage between users
    try {
      console.log("[Auth] Clearing React Query cache...");
      queryClient.clear();
      console.log("[Auth] ✅ React Query cache cleared");
    } catch (cacheError) {
      console.error("[Auth] React Query cache clear error (non-fatal):", cacheError);
    }
    
    // Logout from RevenueCat (non-fatal if fails)
    try {
      console.log("[Auth] Logging out from RevenueCat...");
      const rcResult = await logoutUser();
      if (!rcResult.ok) {
        console.log("[Auth] RevenueCat logout failed:", rcResult.reason, "- continuing");
      } else {
        console.log("[Auth] ✅ RevenueCat logout successful");
      }
    } catch (rcError) {
      console.error("[Auth] RevenueCat logout error (non-fatal):", rcError);
    }
    
    // Always sign out from Supabase - this is the critical part
    console.log("[Auth] Signing out from Supabase...");
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      // Check if the error is "session missing" - this means user is already signed out
      const errorMessage = error.message || String(error);
      if (errorMessage.includes("Auth session missing") || errorMessage.includes("AuthSessionMissingError")) {
        console.log("[Auth] ⚠️ Session already missing - clearing storage and state");
        // Clear Supabase session from AsyncStorage to prevent restoration
        await clearInvalidTokens();
        // Manually clear the auth state to trigger redirect
        setSession(null);
        setUser(null);
        console.log("[Auth] ✅ Storage and auth state cleared");
        return;
      }
      
      // For other errors, log and throw
      console.error("[Auth] ❌ Supabase signOut failed:", error);
      throw error;
    }
    
    console.log("[Auth] ✅ Supabase signOut completed - auth state should update soon");
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
