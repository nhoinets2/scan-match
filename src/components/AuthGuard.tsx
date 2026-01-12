import { useEffect, useRef } from "react";
import { router, useSegments, useRootNavigationState, useNavigationContainerRef } from "expo-router";
import { View } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { useOnboardingComplete } from "@/lib/database";
import { colors } from "@/lib/design-tokens";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { isComplete: onboardingComplete, isLoading: isOnboardingLoading } = useOnboardingComplete();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const rootNavigation = useNavigationContainerRef();
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Reset redirect flag when auth state changes
    hasRedirected.current = false;
  }, [user]);

  useEffect(() => {
    // Wait for navigation to be fully ready
    if (!navigationState?.key) return;

    // Also check if navigation container is ready
    if (!rootNavigation?.isReady()) return;

    // Don't redirect while loading auth or onboarding status
    if (isAuthLoading) return;

    // Prevent duplicate redirects
    if (hasRedirected.current) return;

    const inAuthGroup = segments[0] === "login" || segments[0] === "signup";
    const inOnboarding = segments[0] === "onboarding";
    const inMainApp = segments[0] === "(tabs)";

    // Use setTimeout to ensure navigation happens after the current render cycle
    const performRedirect = (path: string) => {
      hasRedirected.current = true;
      // Small delay to ensure all routes are registered
      setTimeout(() => {
        router.replace(path as never);
      }, 0);
    };

    if (!user && !inAuthGroup) {
      // User is not signed in and not on auth screens, redirect to login
      performRedirect("/login");
    } else if (user && inAuthGroup) {
      // User is signed in but on auth screens
      // Wait for onboarding status to load before redirecting
      if (isOnboardingLoading) return;

      if (onboardingComplete) {
        performRedirect("/");
      } else {
        performRedirect("/onboarding");
      }
    } else if (user && !inOnboarding && !inAuthGroup && !inMainApp && !isOnboardingLoading && !onboardingComplete) {
      // User is signed in, not on onboarding or main app, but hasn't completed onboarding
      performRedirect("/onboarding");
    }
  }, [user, segments, isAuthLoading, isOnboardingLoading, onboardingComplete, navigationState?.key, rootNavigation]);

  // Show loading screen while auth is loading initially
  // Don't show loading screen for onboarding check if user is already in the main app
  const inMainApp = segments[0] === "(tabs)";
  const shouldShowLoading = isAuthLoading || (user && isOnboardingLoading && !inMainApp);
  
  if (shouldShowLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary }} />
    );
  }

  return <>{children}</>;
}
