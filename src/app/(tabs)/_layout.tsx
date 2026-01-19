import React, { useEffect, useCallback } from "react";
import { Tabs, router } from "expo-router";
import { View, Pressable, ActivityIndicator } from "react-native";
import { Home, Camera, Shirt, Bookmark } from "lucide-react-native";
import { Image } from "expo-image";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useOnboardingComplete } from "@/lib/database";
import { useAuth } from "@/lib/auth-context";
import { useWinbackOffer } from "@/lib/useWinbackOffer";
import { WinbackOffer } from "@/components/WinbackOffer";
import { colors, spacing, borderRadius, shadows, tabBar } from "@/lib/design-tokens";

// Landing page image for loading states
const HERO_LANDING_IMAGE = require("../../../assets/onboarding_screens/landing_page/landing_page.webp");

interface CustomTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

function CustomTabBar({ state, descriptors, navigation }: CustomTabBarProps) {
  const insets = useSafeAreaInsets();
  
  // Get the visible routes
  const visibleRoutes = state.routes.filter((route: any) => {
    const { options } = descriptors[route.key];
    return options.href !== null;
  });

  return (
    <View
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: insets.bottom + spacing.sm,
        paddingHorizontal: tabBar.capsule.horizontalMargin,
        backgroundColor: "transparent",
      }}
    >
      {/* Capsule container */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: tabBar.capsule.backgroundColor,
          borderRadius: tabBar.capsule.borderRadius,
          height: tabBar.capsule.height,
          alignItems: "center",
          justifyContent: "space-evenly",
          paddingHorizontal: spacing.md,
          ...shadows.lg,
        }}
      >
        {visibleRoutes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === state.routes.indexOf(route);

          const onPress = () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          // Get the icon for each tab
          const getIcon = () => {
            const iconColor = isFocused 
              ? tabBar.icon.activeColor 
              : tabBar.icon.inactiveColor;
            const iconSize = tabBar.icon.size;
            const strokeWidth = isFocused 
              ? tabBar.icon.activeStrokeWidth 
              : tabBar.icon.inactiveStrokeWidth;

            switch (route.name) {
              case "index":
                return <Home size={iconSize} color={iconColor} strokeWidth={strokeWidth} />;
              case "scan-placeholder":
                return <Camera size={iconSize} color={iconColor} strokeWidth={strokeWidth} />;
              case "wardrobe":
                return <Shirt size={iconSize} color={iconColor} strokeWidth={strokeWidth} />;
              case "looks":
                return <Bookmark size={iconSize} color={iconColor} strokeWidth={strokeWidth} fill={isFocused ? iconColor : "transparent"} />;
              default:
                return null;
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={{
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Circular icon container */}
              <View
                style={{
                  width: tabBar.iconCircle.size,
                  height: tabBar.iconCircle.size,
                  borderRadius: tabBar.iconCircle.size / 2,
                  backgroundColor: isFocused 
                    ? tabBar.iconCircle.activeBackground 
                    : tabBar.iconCircle.inactiveBackground,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: isFocused ? 0 : tabBar.iconCircle.inactiveBorderWidth,
                  borderColor: tabBar.iconCircle.inactiveBorderColor,
                }}
              >
                {getIcon()}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { isComplete: onboardingComplete, isLoading: isOnboardingLoading } = useOnboardingComplete();
  const { showWinback, hideWinback, userId } = useWinbackOffer();

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    // Only redirect to onboarding if:
    // 1. Fonts are loaded
    // 2. Auth is not loading
    // 3. User is authenticated
    // 4. Onboarding status is loaded
    // 5. Onboarding is not complete
    if (fontsLoaded && !isAuthLoading && user && !isOnboardingLoading && !onboardingComplete) {
      router.replace("/onboarding");
    }
  }, [fontsLoaded, isAuthLoading, user, isOnboardingLoading, onboardingComplete]);

  // Don't render tabs until we know onboarding status to prevent flash
  // Show landing image with dim overlay during loading to match auth flow
  if (!fontsLoaded || isAuthLoading || isOnboardingLoading) {
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

  // If user needs onboarding, show landing image while redirect happens
  if (user && !onboardingComplete) {
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }} onLayout={onLayoutRootView}>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
          }}
        />
        <Tabs.Screen
          name="scan-placeholder"
          options={{
            title: "Scan",
          }}
        />
        <Tabs.Screen
          name="wardrobe"
          options={{
            title: "Wardrobe",
          }}
        />
        <Tabs.Screen
          name="looks"
          options={{
            title: "Saved",
          }}
        />
      </Tabs>

      {/* Winback retention offer */}
      <WinbackOffer
        visible={showWinback}
        onClose={hideWinback}
        userId={userId}
      />
    </View>
  );
}
