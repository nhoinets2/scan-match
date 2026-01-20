import React, { useEffect, useRef, useState } from "react";
import { router, useSegments, useRootNavigationState, useNavigationContainerRef } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useAuth } from "@/lib/auth-context";
import { useOnboardingComplete } from "@/lib/database";
import { colors } from "@/lib/design-tokens";

// Preload landing page image to prevent white flash
const HERO_LANDING_IMAGE = require("../../assets/onboarding_screens/landing_page/landing_page.webp");

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { isComplete: onboardingComplete, isLoading: isOnboardingLoading } = useOnboardingComplete();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const rootNavigation = useNavigationContainerRef();
  const hasRedirected = useRef(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Preload landing page image on mount
  useEffect(() => {
    Image.prefetch(HERO_LANDING_IMAGE);
  }, []);

  useEffect(() => {
    // Reset redirect flag when auth state changes
    console.log("[AuthGuard] User changed:", user ? "logged in" : "logged out");
    hasRedirected.current = false;
    setIsRedirecting(false);
  }, [user]);

  useEffect(() => {
    // Wait for navigation to be fully ready
    if (!navigationState?.key) {
      console.log("[AuthGuard] Navigation state not ready");
      return;
    }

    // Also check if navigation container is ready
    if (!rootNavigation?.isReady()) {
      console.log("[AuthGuard] Root navigation not ready");
      return;
    }

    // Don't redirect while loading auth or onboarding status
    if (isAuthLoading) {
      console.log("[AuthGuard] Auth is loading, waiting...");
      return;
    }

    // Prevent duplicate redirects
    if (hasRedirected.current) {
      console.log("[AuthGuard] Already redirected, skipping");
      return;
    }

    const inAuthGroup = segments[0] === "login" || segments[0] === "signup";
    const inOnboarding = segments[0] === "onboarding";
    const inMainApp = segments[0] === "(tabs)";
    const inPasswordReset = segments[0] === "reset-password-confirm";

    console.log("[AuthGuard] Check redirect:", {
      user: !!user,
      segments: segments.join("/"),
      inAuthGroup,
      inOnboarding,
      inMainApp,
      inPasswordReset,
      isOnboardingLoading,
      onboardingComplete,
    });

    // Use setTimeout to ensure navigation happens after the current render cycle
    const performRedirect = (path: string) => {
      console.log("[AuthGuard] 🔄 Performing redirect to:", path);
      hasRedirected.current = true;
      setIsRedirecting(true);
      // Small delay to ensure all routes are registered
      setTimeout(() => {
        router.replace(path as never);
      }, 0);
    };

    if (!user && !inAuthGroup && !inPasswordReset) {
      // User is not signed in and not on auth screens or password reset, redirect to login
      performRedirect("/login");
    } else if (user && inAuthGroup && !inPasswordReset) {
      // User is signed in but on auth screens (not password reset)
      // Wait for onboarding status to load before redirecting
      if (isOnboardingLoading) {
        console.log("[AuthGuard] Onboarding loading, waiting...");
        return;
      }

      if (onboardingComplete) {
        performRedirect("/");
      } else {
        performRedirect("/onboarding");
      }
    } else if (user && !inOnboarding && !inAuthGroup && !inMainApp && !inPasswordReset && !isOnboardingLoading && !onboardingComplete) {
      // User is signed in, not on onboarding or main app or password reset, but hasn't completed onboarding
      performRedirect("/onboarding");
    } else if (inPasswordReset) {
      // Allow password reset screen to render without interference
      console.log("[AuthGuard] On password reset screen, allowing access");
    } else {
      console.log("[AuthGuard] No redirect needed");
    }
  }, [user, segments, isAuthLoading, isOnboardingLoading, onboardingComplete, navigationState?.key, rootNavigation]);

  const inAuthGroup = segments[0] === "login" || segments[0] === "signup";
  const inMainApp = segments[0] === "(tabs)";
  const inOnboarding = segments[0] === "onboarding";
  const inPasswordReset = segments[0] === "reset-password-confirm";

  // Clear redirecting state when we reach any valid authenticated screen
  useEffect(() => {
    if (isRedirecting && (inMainApp || inOnboarding || inPasswordReset || (!inAuthGroup && user))) {
      console.log("[AuthGuard] Arrived at target, clearing redirect state");
      setIsRedirecting(false);
    }
  }, [isRedirecting, inMainApp, inOnboarding, inPasswordReset, inAuthGroup, user]);

  // Show landing page image while auth is loading to prevent white flash
  if (isAuthLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary, overflow: "hidden" }}>
        <Image
          source={HERO_LANDING_IMAGE}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="high"
        />
      </View>
    );
  }

  // User not logged in but not on auth screens yet - show landing image while redirecting to login
  // Uses same dark overlay + spinner as sign-out for seamless transition
  if (!user && !inAuthGroup) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary, overflow: "hidden" }}>
        <Image
          source={HERO_LANDING_IMAGE}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="high"
        />
        {/* Dim overlay to match sign-out loading state - extends slightly beyond edges to cover any gaps */}
        <View
          style={{
            position: "absolute",
            top: -2,
            left: -2,
            right: -2,
            bottom: -2,
            backgroundColor: "rgba(0, 0, 0, 0.35)",
          }}
        />
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      </View>
    );
  }

  // User logged in and on auth screens - show landing image while redirecting
  // This covers the case when user just signed in and we're checking onboarding status
  if (user && inAuthGroup) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary, overflow: "hidden" }}>
        <Image
          source={HERO_LANDING_IMAGE}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="high"
        />
        {/* Dim overlay to make spinner more prominent - extends slightly beyond edges to cover any gaps */}
        <View
          style={{
            position: "absolute",
            top: -2,
            left: -2,
            right: -2,
            bottom: -2,
            backgroundColor: "rgba(0, 0, 0, 0.35)",
          }}
        />
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      </View>
    );
  }

  // Show landing image during redirect transition to prevent white flash
  // Only show during active redirects, not on other screens like account, etc.
  if (isRedirecting) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary, overflow: "hidden" }}>
        <Image
          source={HERO_LANDING_IMAGE}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="high"
        />
        {/* Dim overlay to make spinner more prominent - extends slightly beyond edges to cover any gaps */}
        <View
          style={{
            position: "absolute",
            top: -2,
            left: -2,
            right: -2,
            bottom: -2,
            backgroundColor: "rgba(0, 0, 0, 0.35)",
          }}
        />
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      </View>
    );
  }

  return <>{children}</>;
}
