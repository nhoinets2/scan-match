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
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AuthGuard } from "@/components/AuthGuard";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { colors } from "@/lib/design-tokens";
import { initializeBackgroundUploads } from "@/lib/storage";

export const unstable_settings = {
  initialRouteName: "login",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Configure QueryClient with React Native optimizations
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Prevent immediate refetch on mount if data is fresh (within staleTime)
      // Individual queries can override this
      refetchOnMount: true,
      // Retry failed queries once before showing error
      retry: 1,
      // Keep queries in cache for 5 minutes after last usage
      gcTime: 5 * 60 * 1000,
    },
  },
});

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
 * Handles deep links for password reset.
 * When user clicks the reset link in email, this navigates them to the password reset screen.
 * 
 * IMPORTANT: We use a ref to track if we've already handled a recovery URL to prevent
 * double navigation (both getInitialURL and addEventListener can fire for the same link).
 */
function DeepLinkHandler() {
  const router = useRouter();
  const handledUrls = useRef<Set<string>>(new Set());
  const hasNavigatedToReset = useRef(false);

  useEffect(() => {
    // Helper to extract a canonical key from URL (without tokens, which change)
    const getUrlKey = (url: string): string => {
      try {
        const urlObj = new URL(url);
        // Use protocol + host + pathname + type param as the key
        // Don't include tokens as they're unique per request
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
          handleDeepLink(initialUrl);
        } else {
          console.log("[DeepLink] Initial URL already handled, skipping:", urlKey);
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
        } else {
          console.log("[DeepLink] Event URL already handled, skipping:", urlKey);
        }
      }
    });

    handleInitialUrl();

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = (url: string) => {
    console.log("[DeepLink] ========================================");
    console.log("[DeepLink] Received URL:", url);
    console.log("[DeepLink] URL length:", url.length);
    
    // Parse the URL to extract parameters
    try {
      const urlObj = new URL(url);
      console.log("[DeepLink] Protocol:", urlObj.protocol);
      console.log("[DeepLink] Host:", urlObj.host);
      console.log("[DeepLink] Pathname:", urlObj.pathname);
      console.log("[DeepLink] Search params:", urlObj.search);
      console.log("[DeepLink] Hash:", urlObj.hash);
      
      // Extract all params from both search and hash
      const params = new URLSearchParams(urlObj.search + urlObj.hash.replace('#', '&'));
      console.log("[DeepLink] All params:", Array.from(params.entries()));
      
      const hasAccessToken = params.has('access_token');
      const hasRefreshToken = params.has('refresh_token');
      const type = params.get('type');
      
      console.log("[DeepLink] Has access_token:", hasAccessToken);
      console.log("[DeepLink] Has refresh_token:", hasRefreshToken);
      console.log("[DeepLink] Type parameter:", type);
      
      // Check if this is a password reset link FIRST (before OAuth check)
      // Password reset URLs contain type=recovery
      if (type === "recovery" || url.includes("reset-password-confirm")) {
        console.log("[DeepLink] ✅ Password reset link detected (type=recovery or reset-password-confirm)");
        console.log("[DeepLink] Has tokens in URL:", hasAccessToken, hasRefreshToken);
        
        // Prevent double navigation to reset screen
        if (hasNavigatedToReset.current) {
          console.log("[DeepLink] Already navigated to reset screen, skipping duplicate navigation");
          return;
        }
        hasNavigatedToReset.current = true;
        
        console.log("[DeepLink] Navigating to /reset-password-confirm");
        
        // Longer delay to ensure Supabase has fully processed the session from URL
        // When coming from email -> Safari -> app, Supabase needs time to parse tokens
        setTimeout(() => {
          console.log("[DeepLink] Delay complete, navigating now...");
          router.push("/reset-password-confirm");
        }, 500);
        return;
      }
      
      // Check if this is an OAuth callback (access_token or code in URL but NOT recovery)
      if ((hasAccessToken || params.has('code')) && type !== "recovery") {
        console.log("[DeepLink] OAuth callback detected - Supabase will handle session automatically");
        // Supabase's detectSessionInUrl: true will automatically handle this
        return;
      }
      
      console.log("[DeepLink] ⚠️ URL did not match any handlers");
    } catch (error) {
      console.error("[DeepLink] Error parsing URL:", error);
    }
    console.log("[DeepLink] ========================================");
  };

  return null; // This component renders nothing
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
