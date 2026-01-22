import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { AppState, type AppStateStatus } from "react-native";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import {
  BodoniModa_600SemiBold,
  BodoniModa_700Bold,
} from "@expo-google-fonts/bodoni-moda";
import { useColorScheme } from "@/lib/useColorScheme";
import { QueryClientProvider, focusManager } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AuthGuard } from "@/components/AuthGuard";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/design-tokens";
import { initializeBackgroundUploads } from "@/lib/storage";
import { queryClient } from "@/lib/queryClient";

export const unstable_settings = {
  initialRouteName: "login",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

/**
 * Initializes background uploads only after auth is ready.
 * This prevents RLS errors when the app is killed and reopened
 * (uploads would start before auth session is restored).
 */
function BackgroundUploadInitializer() {
  const { user, isLoading } = useAuth();
  const initialized = useRef(false);

  useEffect(() => {
    // Wait for auth to finish loading
    if (isLoading) return;
    
    // Only initialize once, and only if user is authenticated
    if (!initialized.current && user) {
      initialized.current = true;
      console.log("[BackgroundUpload] Auth ready, initializing upload queue...");
      void initializeBackgroundUploads();
    }
  }, [isLoading, user]);

  return null; // This component renders nothing
}

/**
 * Configures React Query's focusManager to work with React Native's AppState.
 * Only enables after auth is ready to prevent query refetches before session restoration.
 * 
 * This makes React Query automatically refetch stale queries when:
 * - App returns from background to foreground
 * - User switches back to the app
 * 
 * Critical for seeing uploaded images after background sync completes.
 */
function FocusManagerInitializer() {
  const { user, isLoading } = useAuth();
  const focusManagerSetup = useRef(false);

  useEffect(() => {
    // Wait for auth to finish loading
    if (isLoading) return;
    
    // Only set up once, and only when user is authenticated
    // This prevents queries from refetching before auth session is restored
    if (!focusManagerSetup.current && user) {
      focusManagerSetup.current = true;
      console.log("[FocusManager] Setting up AppState integration for React Query...");
      
      // Configure focusManager to use React Native's AppState
      focusManager.setEventListener((handleFocus) => {
        const handleAppStateChange = (state: AppStateStatus) => {
          // Notify React Query when app becomes active (foreground)
          // This triggers refetch of stale queries
          handleFocus(state === 'active');
        };

        // Listen to AppState changes
        const subscription = AppState.addEventListener('change', handleAppStateChange);

        // Return cleanup function
        return () => {
          subscription.remove();
        };
      });
      
      console.log("[FocusManager] AppState integration enabled");
    }
  }, [isLoading, user]);

  return null; // This component renders nothing
}

/**
 * Handles deep links for password reset and OAuth callbacks.
 * 
 * CRITICAL: In React Native, Supabase's detectSessionInUrl does NOT work because
 * there's no URL bar. We must MANUALLY extract tokens from deep links and call
 * supabase.auth.setSession() to establish the session.
 * 
 * Expo Router handles navigation to /reset-password-confirm automatically via
 * file-based routing when the URL path matches.
 */
function DeepLinkHandler() {
  const handledUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Helper to extract a canonical key from URL (without tokens, which change)
    const getUrlKey = (url: string): string => {
      try {
        const urlObj = new URL(url);
        const params = new URLSearchParams(urlObj.search + urlObj.hash.replace('#', '&'));
        const type = params.get('type') || 'unknown';
        return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}?type=${type}`;
      } catch {
        return url;
      }
    };

    // Handle initial URL if app was opened from a link
    const handleInitialUrl = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        const urlKey = getUrlKey(initialUrl);
        if (!handledUrls.current.has(urlKey)) {
          handledUrls.current.add(urlKey);
          await handleDeepLink(initialUrl);
        }
      }
    };

    // Listen for URL changes while app is running
    const subscription = Linking.addEventListener("url", (event) => {
      if (event.url) {
        const urlKey = getUrlKey(event.url);
        if (!handledUrls.current.has(urlKey)) {
          handledUrls.current.add(urlKey);
          handleDeepLink(event.url);
        }
      }
    });

    handleInitialUrl();

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = async (url: string) => {
    console.log("[DeepLink] ========================================");
    console.log("[DeepLink] Received URL:", url);
    
    try {
      const urlObj = new URL(url);
      
      // Extract tokens from both query string and hash fragment
      // Supabase sends tokens in the hash fragment: myapp://#access_token=...&refresh_token=...
      const hashParams = urlObj.hash ? new URLSearchParams(urlObj.hash.replace('#', '')) : new URLSearchParams();
      const searchParams = new URLSearchParams(urlObj.search);
      
      // Merge params (hash takes precedence as that's where Supabase puts tokens)
      const access_token = hashParams.get('access_token') || searchParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token') || searchParams.get('refresh_token');
      const type = hashParams.get('type') || searchParams.get('type');
      
      console.log("[DeepLink] Type:", type, "Path:", urlObj.pathname);
      console.log("[DeepLink] Has access_token:", !!access_token);
      console.log("[DeepLink] Has refresh_token:", !!refresh_token);
      
      // Password reset link - manually set session from tokens
      if (type === "recovery" || urlObj.pathname.includes("reset-password-confirm")) {
        console.log("[DeepLink] ✅ Password reset link detected");
        
        if (access_token && refresh_token) {
          console.log("[DeepLink] Setting session from recovery tokens...");
          
          // CRITICAL: Manually set the session - this is required in React Native
          // because detectSessionInUrl doesn't work
          const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          
          if (error) {
            console.error("[DeepLink] ❌ Failed to set session:", error.message);
          } else {
            console.log("[DeepLink] ✅ Session set successfully, user:", data.user?.email);
          }
        } else {
          console.log("[DeepLink] ⚠️ No tokens in URL - session may already be set or link is invalid");
        }
        
        // Expo Router will handle navigation to /reset-password-confirm
        console.log("[DeepLink] Expo Router will navigate to reset screen");
        return;
      }
      
      // OAuth callback - also need to manually set session
      if ((access_token && refresh_token) && type !== "recovery") {
        console.log("[DeepLink] OAuth callback - setting session manually");
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) {
          console.error("[DeepLink] ❌ Failed to set OAuth session:", error.message);
        } else {
          console.log("[DeepLink] ✅ OAuth session set successfully");
        }
        return;
      }
      
      console.log("[DeepLink] ⚠️ URL did not match any handlers or had no tokens");
    } catch (error) {
      console.error("[DeepLink] Error parsing URL:", error);
    }
    console.log("[DeepLink] ========================================");
  };

  return null;
}

// Custom light theme for Scan & Match - using design tokens
const ScanMatchLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent.terracotta,
    background: colors.bg.primary,
    card: colors.bg.secondary,
    text: colors.text.primary,
    border: colors.border.hairline,
  },
};

function RootLayoutNav({
  colorScheme,
}: {
  colorScheme: "light" | "dark" | null | undefined;
}) {
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : ScanMatchLightTheme}>
      <AuthGuard>
        <OfflineIndicator />
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: colors.bg.primary },
          }}
        >
          <Stack.Screen 
            name="(tabs)" 
            options={{ 
              headerShown: false, 
              gestureEnabled: false,
              animation: "fade",
              animationDuration: 100,
            }} 
          />
          <Stack.Screen
            name="login"
            options={{ 
              headerShown: false, 
              gestureEnabled: false,
              animation: "fade",
              animationDuration: 100,
            }}
          />
          <Stack.Screen
            name="signup"
            options={{ headerShown: false, presentation: "card" }}
          />
          <Stack.Screen
            name="onboarding"
            options={{ 
              headerShown: false, 
              gestureEnabled: true,
              presentation: "fullScreenModal"
            }}
          />
          <Stack.Screen
            name="scan"
            options={{
              headerShown: false,
              presentation: "fullScreenModal",
            }}
          />
          <Stack.Screen
            name="results"
            options={{
              headerShown: false,
              presentation: "containedModal",
              animation: "fade_from_bottom",
              animationDuration: 200,
            }}
          />
          <Stack.Screen
            name="add-item"
            options={{
              title: "Add Item",
              presentation: "fullScreenModal",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="all-checks"
            options={{
              headerShown: false,
              presentation: "card",
              contentStyle: { backgroundColor: colors.bg.primary },
            }}
          />
          <Stack.Screen
            name="wardrobe-item"
            options={{
              headerShown: false,
              presentation: "fullScreenModal",
            }}
          />
          <Stack.Screen
            name="account"
            options={{
              headerShown: false,
              presentation: "modal",
              animation: "fade",
              animationDuration: 200,
            }}
          />
          <Stack.Screen
            name="manage-subscription"
            options={{
              headerShown: false,
              presentation: "modal",
            }}
          />
          <Stack.Screen
            name="preferences"
            options={{
              headerShown: false,
              presentation: "modal",
            }}
          />
          <Stack.Screen
            name="change-password"
            options={{
              headerShown: false,
              presentation: "modal",
            }}
          />
          <Stack.Screen
            name="reset-password-confirm"
            options={{
              headerShown: false,
              presentation: "modal",
            }}
          />
          <Stack.Screen
            name="help-center"
            options={{
              headerShown: false,
              presentation: "modal",
            }}
          />
          <Stack.Screen
            name="report-problem"
            options={{
              headerShown: false,
              presentation: "modal",
            }}
          />
        </Stack>
      </AuthGuard>
    </ThemeProvider>
  );
}

/**
 * Hides the splash screen only after auth is ready.
 * This prevents the home screen from flashing before redirect to login.
 */
function SplashHider({ fontsLoaded, fontError }: { fontsLoaded: boolean; fontError: Error | null }) {
  const { isLoading: isAuthLoading } = useAuth();
  const hasHiddenSplash = useRef(false);

  useEffect(() => {
    // Only hide splash once, when both fonts and auth are ready
    if (hasHiddenSplash.current) return;

    const fontsReady = fontsLoaded || fontError;
    const authReady = !isAuthLoading;

    if (fontsReady && authReady) {
      hasHiddenSplash.current = true;
      console.log("✅ Hiding splash - fonts and auth ready");
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, isAuthLoading]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Load custom fonts
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    BodoniModa_600SemiBold,
    BodoniModa_700Bold,
  });

  // Log font loading status
  useEffect(() => {
    if (fontsLoaded) {
      console.log("✅ FONTS LOADED:", {
        Inter_400Regular: !!Inter_400Regular,
        Inter_500Medium: !!Inter_500Medium,
        Inter_600SemiBold: !!Inter_600SemiBold,
        BodoniModa_600SemiBold: !!BodoniModa_600SemiBold,
        BodoniModa_700Bold: !!BodoniModa_700Bold,
      });
    }
    if (fontError) {
      console.error("❌ FONT ERROR:", fontError);
    }
  }, [fontsLoaded, fontError]);

  // Keep splash visible until fonts are ready
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SplashHider fontsLoaded={fontsLoaded} fontError={fontError} />
        <BackgroundUploadInitializer />
        <FocusManagerInitializer />
        <DeepLinkHandler />
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
          <KeyboardProvider>
            <StatusBar style="dark" />
            <RootLayoutNav colorScheme={colorScheme} />
          </KeyboardProvider>
        </GestureHandlerRootView>
      </AuthProvider>
    </QueryClientProvider>
  );
}
