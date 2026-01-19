import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const queryClient = new QueryClient();

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
 * Handles deep links for password reset.
 * When user clicks the reset link in email, this navigates them to the password reset screen.
 */
function DeepLinkHandler() {
  const router = useRouter();
  const handledUrl = useRef<string | null>(null);

  useEffect(() => {
    // Handle initial URL if app was opened from a link
    const handleInitialUrl = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl && initialUrl !== handledUrl.current) {
        handledUrl.current = initialUrl;
        handleDeepLink(initialUrl);
      }
    };

    // Listen for URL changes while app is running
    const subscription = Linking.addEventListener("url", (event) => {
      if (event.url && event.url !== handledUrl.current) {
        handledUrl.current = event.url;
        handleDeepLink(event.url);
      }
    });

    handleInitialUrl();

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = (url: string) => {
    console.log("[DeepLink] Received URL:", url);
    
    // Check if this is a password reset link FIRST (before OAuth check)
    // Password reset URLs contain both access_token AND type=recovery
    if (url.includes("type=recovery") || url.includes("reset-password")) {
      console.log("[DeepLink] ✅ Password reset link detected");
      console.log("[DeepLink] URL contains type=recovery:", url.includes("type=recovery"));
      console.log("[DeepLink] URL contains reset-password:", url.includes("reset-password"));
      console.log("[DeepLink] Navigating to /reset-password-confirm");
      
      // Small delay to ensure Supabase has processed the session from URL
      setTimeout(() => {
        router.push("/reset-password-confirm");
      }, 100);
      return;
    }
    
    // Check if this is an OAuth callback (access_token or code in URL)
    if (url.includes("access_token") || url.includes("code=")) {
      console.log("[DeepLink] OAuth callback detected - Supabase will handle session automatically");
      // Supabase's detectSessionInUrl: true will automatically handle this
      return;
    }
    
    console.log("[DeepLink] ⚠️ URL did not match any handlers");
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
