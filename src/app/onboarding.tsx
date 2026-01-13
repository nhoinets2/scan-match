import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Dimensions,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { Check, ChevronRight, ChevronLeft, Moon, Circle, Droplet, Leaf, Snowflake, Flame } from "lucide-react-native";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";

import { cn } from "@/lib/cn";
import { useUpdatePreferences, usePreferences } from "@/lib/database";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  StyleVibe,
  ColorInfo,
  FitPreference,
  STYLE_VIBES,
  COLOR_PALETTE,
} from "@/lib/types";
import { ButtonPrimary } from "@/components/ButtonPrimary";
import { ButtonTertiary } from "@/components/ButtonTertiary";
import { typography, colors, borderRadius, spacing, cards, button } from "@/lib/design-tokens";
import { getTextStyle } from "@/lib/typography-helpers";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type OnboardingStep = "style" | "colors" | "fit_reference";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm }}>
      {Array.from({ length: totalSteps }).map((_, index) => (
        <View
          key={index}
          style={{
            height: 6,
            width: index === currentStep ? 32 : 6,
            borderRadius: borderRadius.pill,
            backgroundColor: index === currentStep
              ? colors.accent.terracotta
              : index < currentStep
                ? colors.accent.terracotta + "99" // 60% opacity
                : colors.text.primary + "33", // 20% opacity
          }}
        />
      ))}
    </View>
  );
}

interface StyleCardProps {
  vibe: (typeof STYLE_VIBES)[0];
  selected: boolean;
  onPress: () => void;
  index: number;
}

function StyleCard({ vibe, selected, onPress, index }: StyleCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  // Map vibe IDs to icon images
  const getIconSource = () => {
    switch (vibe.id) {
      case "casual":
        return require("../../assets/onboarding_screens/style_icons/casual.webp");
      case "minimal":
        return require("../../assets/onboarding_screens/style_icons/minimal.webp");
      case "office":
        return require("../../assets/onboarding_screens/style_icons/office.webp");
      case "street":
        return require("../../assets/onboarding_screens/style_icons/street.webp");
      case "feminine":
        return require("../../assets/onboarding_screens/style_icons/feminine.webp");
      case "sporty":
        return require("../../assets/onboarding_screens/style_icons/sporty.webp");
      default:
        return require("../../assets/onboarding_screens/style_icons/minimal.webp");
    }
  };

  const iconSource = getIconSource();

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).springify()}
      style={{ marginBottom: spacing.md, width: "48%" }}
    >
      <Animated.View style={animatedStyle}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPress();
          }}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={{
            borderRadius: borderRadius.card,
            height: 140,
            overflow: "hidden",
          }}
        >
          <Image
            source={iconSource}
            style={{ 
              width: "100%", 
              height: "100%",
              borderRadius: borderRadius.card,
            }}
            contentFit="cover"
            contentPosition="center"
          />
        </Pressable>
      </Animated.View>
      {/* Title with checkmark outside card */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          marginTop: spacing.sm,
          gap: spacing.xs,
        }}
      >
        <Text
          style={{
            ...typography.ui.label,
            color: colors.text.primary,
            textAlign: "center",
          }}
        >
          {vibe.label}
        </Text>
        {selected && (
          <Check
            size={typography.ui.label.fontSize}
            color={colors.accent.terracotta}
            strokeWidth={2.5}
          />
        )}
      </View>
    </Animated.View>
  );
}

interface ColorCardProps {
  group: { id: string; emoji: string; label: string; helper: string };
  selected: boolean;
  onPress: () => void;
  index: number;
}

function ColorCard({ group, selected, onPress, index }: ColorCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  // Map color group IDs to icon images
  const getIconSource = () => {
    switch (group.id) {
      case "black":
        return require("../../assets/onboarding_screens/color_vibe/mostly_black.webp");
      case "neutrals":
        return require("../../assets/onboarding_screens/color_vibe/neutrals.webp");
      case "denim":
        return require("../../assets/onboarding_screens/color_vibe/denim_blue.webp");
      case "earth":
        return require("../../assets/onboarding_screens/color_vibe/earth_tones.webp");
      case "warm":
        return require("../../assets/onboarding_screens/color_vibe/warm_colors.webp");
      case "cool":
        return require("../../assets/onboarding_screens/color_vibe/cool_colors.webp");
      default:
        return require("../../assets/onboarding_screens/color_vibe/neutrals.webp");
    }
  };

  const iconSource = getIconSource();

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).springify()}
      style={{ marginBottom: spacing.md, width: "48%" }}
    >
      <Animated.View style={animatedStyle}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPress();
          }}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={{
            borderRadius: borderRadius.card,
            height: 140,
            overflow: "hidden",
          }}
        >
          <Image
            source={iconSource}
            style={{ 
              width: "100%", 
              height: "100%",
              borderRadius: borderRadius.card,
            }}
            contentFit="cover"
            contentPosition="center"
          />
        </Pressable>
      </Animated.View>
      {/* Title with checkmark outside card */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          marginTop: spacing.sm,
          gap: spacing.xs,
        }}
      >
        <Text
          style={{
            ...typography.ui.label,
            color: colors.text.primary,
            textAlign: "center",
          }}
        >
          {group.label}
        </Text>
        {selected && (
          <Check
            size={typography.ui.label.fontSize}
            color={colors.accent.terracotta}
            strokeWidth={2.5}
          />
        )}
      </View>
    </Animated.View>
  );
}

interface ColorDotProps {
  color: ColorInfo;
  selected: boolean;
  onPress: () => void;
  index: number;
}

function ColorDot({ color, selected, onPress, index }: ColorDotProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 30).springify()}
    >
      <Animated.View style={animatedStyle}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          scale.value = withSpring(1.2, {}, () => {
            scale.value = withSpring(1);
          });
          onPress();
        }}
        style={{
          alignItems: "center",
          padding: spacing.xs,
        }}
      >
        <View
          style={{
            height: 48,
            width: 48,
            borderRadius: borderRadius.pill,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: color.hex,
            borderWidth: color.hex === "#FFFFFF" ? 1 : selected ? 2 : 0,
            borderColor: color.hex === "#FFFFFF" ? colors.border.hairline : colors.accent.terracotta,
          }}
        >
          {selected && (
            <Check
              size={20}
              color={
                ["#FFFFFF", "#FFFDD0", "#F5F5DC", "#D6D3D1", "#E6E6FA", "#FFB6C1", "#90EE90", "#87CEEB"].includes(color.hex)
                  ? colors.text.primary
                  : colors.text.inverse
              }
              strokeWidth={3}
            />
          )}
        </View>
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            color: colors.text.secondary,
            marginTop: spacing.xs,
          }}
          numberOfLines={1}
        >
          {color.name}
        </Text>
      </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

interface FitButtonProps {
  fit: FitPreference;
  label: string;
  selected: boolean;
  onPress: () => void;
  index: number;
}

function FitButton({ fit, label, selected, onPress, index }: FitButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  // Map fit IDs to icon images
  const getIconSource = () => {
    switch (fit) {
      case "slim":
        return require("../../assets/onboarding_screens/fit_icons/slim.webp");
      case "regular":
        return require("../../assets/onboarding_screens/fit_icons/relaxed.webp");
      case "oversized":
        return require("../../assets/onboarding_screens/fit_icons/oversized.webp");
      default:
        return require("../../assets/onboarding_screens/fit_icons/relaxed.webp");
    }
  };

  const iconSource = getIconSource();

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).springify()}
      style={{ marginBottom: spacing.md, width: "48%" }}
    >
      <Animated.View style={animatedStyle}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPress();
          }}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={{
            borderRadius: borderRadius.card,
            height: 140,
            overflow: "hidden",
          }}
        >
          <Image
            source={iconSource}
            style={{ 
              width: "100%", 
              height: "100%",
              borderRadius: borderRadius.card,
            }}
            contentFit="cover"
            contentPosition="center"
          />
        </Pressable>
      </Animated.View>
      {/* Title with checkmark outside card */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          marginTop: spacing.sm,
          gap: spacing.xs,
        }}
      >
        <Text
          style={{
            ...typography.ui.label,
            color: colors.text.primary,
            textAlign: "center",
          }}
        >
          {label}
        </Text>
        {selected && (
          <Check
            size={typography.ui.label.fontSize}
            color={colors.accent.terracotta}
            strokeWidth={2.5}
          />
        )}
      </View>
    </Animated.View>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ step?: string; fromPreferences?: string }>();
  const initialStep = (params.step as OnboardingStep) || "style";
  const fromPreferences = params.fromPreferences === "true";
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(initialStep);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  // Local state for selections
  const [selectedStyles, setSelectedStyles] = useState<StyleVibe[]>([]);
  const [selectedColors, setSelectedColors] = useState<ColorInfo[]>([]);
  const [fitPreference, setFitPreference] = useState<FitPreference | null>(null);

  // Track initial state to detect changes
  const [initialStyles, setInitialStyles] = useState<StyleVibe[]>([]);
  const [initialColors, setInitialColors] = useState<ColorInfo[]>([]);
  const [initialFitPreference, setInitialFitPreference] = useState<FitPreference | null>(null);

  // Database mutation for saving preferences
  const updatePreferencesMutation = useUpdatePreferences();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: existingPreferences } = usePreferences();

  // Load existing preferences when coming from preferences page
  useEffect(() => {
    if (fromPreferences && existingPreferences) {
      const styles = existingPreferences.styleVibes || [];
      const colors = existingPreferences.wardrobeColors || [];
      // Only set fit preference if it exists, otherwise keep it null
      const fit = existingPreferences.fitPreference !== undefined && existingPreferences.fitPreference !== null 
        ? existingPreferences.fitPreference 
        : null;

      // Only update if current state matches initial state (no unsaved changes)
      // This prevents overwriting user changes when query refetches
      const currentMatchesInitial = 
        JSON.stringify(initialStyles.sort()) === JSON.stringify(selectedStyles.sort()) &&
        JSON.stringify(initialColors.map(c => c.hex).sort()) === JSON.stringify(selectedColors.map(c => c.hex).sort()) &&
        initialFitPreference === fitPreference;

      if (currentMatchesInitial || (initialStyles.length === 0 && initialColors.length === 0 && initialFitPreference === null)) {
        setSelectedStyles(styles);
        setSelectedColors(colors);
        setFitPreference(fit);

        // Store initial state for comparison
        setInitialStyles(styles);
        setInitialColors(colors);
        setInitialFitPreference(fit);
      }
    }
  }, [fromPreferences, existingPreferences]);

  // Helper to save preferences (for onboarding or preferences page)
  const savePreferences = async (completeOnboarding = false) => {
    return new Promise<void>((resolve, reject) => {
      updatePreferencesMutation.mutate(
        {
          styleVibes: selectedStyles,
          wardrobeColors: selectedColors,
          sizes: { top: "", bottom: "", shoes: "" },
          fitPreference: fitPreference ?? undefined, // null becomes undefined, which triggers 'in' check to save as null in DB
          ...(completeOnboarding && { onboardingComplete: true }),
        },
        {
          onSuccess: async () => {
            // Wait for the query to refetch to ensure the cache is updated
            await queryClient.refetchQueries({ queryKey: ["preferences", user?.id] });
            
            // Update initial state to match saved state when coming from preferences
            // This ensures that when the screen reopens, the saved state is considered the new baseline
            if (fromPreferences) {
              setInitialStyles([...selectedStyles]);
              setInitialColors([...selectedColors]);
              setInitialFitPreference(fitPreference);
            }
            
            resolve();
          },
          onError: (error) => {
            reject(error);
          },
        }
      );
    });
  };

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  const toggleStyle = (style: StyleVibe) => {
    setSelectedStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    );
  };

  const toggleColor = (color: ColorInfo) => {
    setSelectedColors((prev) =>
      prev.some((c) => c.hex === color.hex)
        ? prev.filter((c) => c.hex !== color.hex)
        : [...prev, color]
    );
  };

  const handleNext = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // If coming from preferences, always save and go back
    if (fromPreferences) {
      try {
        await savePreferences(false);
        router.back();
      } catch (error) {
        console.error("Failed to save preferences:", error);
        router.back();
      }
      return;
    }

    // Otherwise, handle normal onboarding flow
    switch (currentStep) {
      case "style":
        setCurrentStep("colors");
        break;
      case "colors":
        setCurrentStep("fit_reference");
        break;
      case "fit_reference":
        try {
          await savePreferences(true);
        router.replace("/");
        } catch (error) {
          console.error("Failed to save preferences:", error);
          router.replace("/");
        }
        break;
    }
  };

  const handlePrevious = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    switch (currentStep) {
      case "colors":
        setCurrentStep("style");
        break;
      case "fit_reference":
        setCurrentStep("colors");
        break;
      case "style":
        // If coming from preferences, go back to preferences page
        if (fromPreferences) {
          router.back();
        }
        // Otherwise, can't go back from first step
        break;
    }
  };

  // Skip onboarding entirely and go to home with default preferences
  const handleSkipOnboarding = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // Save with onboardingComplete: true but empty/default preferences
      await new Promise<void>((resolve, reject) => {
        updatePreferencesMutation.mutate(
          {
            styleVibes: [],
            wardrobeColors: [],
            sizes: { top: "", bottom: "", shoes: "" },
            fitPreference: undefined,
            onboardingComplete: true,
          },
          {
            onSuccess: async () => {
              await queryClient.refetchQueries({ queryKey: ["preferences", user?.id] });
              resolve();
            },
            onError: (error) => {
              reject(error);
            },
          }
        );
      });
      router.replace("/");
    } catch (error) {
      console.error("Failed to skip onboarding:", error);
      // Still navigate even if save fails
      router.replace("/");
    }
  };

  const goNext = () => {
    handleNext();
  };

  const goPrevious = () => {
    if (currentStep !== "style") {
      handlePrevious();
    } else if (fromPreferences) {
      // If on first step and coming from preferences, go back
      handlePrevious();
    }
  };

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onEnd((event) => {
      const SWIPE_THRESHOLD = 50;
      const VELOCITY_THRESHOLD = 500;

      // Swipe left = next
      if (event.translationX < -SWIPE_THRESHOLD || event.velocityX < -VELOCITY_THRESHOLD) {
        runOnJS(goNext)();
      }
      // Swipe right = previous
      else if (event.translationX > SWIPE_THRESHOLD || event.velocityX > VELOCITY_THRESHOLD) {
        runOnJS(goPrevious)();
      }
    });

  const getStepIndex = () => {
    const steps: OnboardingStep[] = ["style", "colors", "fit_reference"];
    return steps.indexOf(currentStep);
  };

  // Check if changes were made (only relevant when fromPreferences is true)
  const hasChanges = () => {
    if (!fromPreferences) return true; // Always allow during onboarding

    switch (currentStep) {
      case "style":
        // Compare arrays - check if lengths differ or any items are different
        if (selectedStyles.length !== initialStyles.length) return true;
        return selectedStyles.some((style) => !initialStyles.includes(style)) ||
               initialStyles.some((style) => !selectedStyles.includes(style));
      case "colors":
        // Compare color arrays by hex value
        if (selectedColors.length !== initialColors.length) return true;
        const selectedHexes = selectedColors.map((c) => c.hex).sort();
        const initialHexes = initialColors.map((c) => c.hex).sort();
        return JSON.stringify(selectedHexes) !== JSON.stringify(initialHexes);
      case "fit_reference":
        return fitPreference !== initialFitPreference;
      default:
        return true;
    }
  };

  const canProceed = () => {
    if (fromPreferences) {
      return hasChanges();
    }
    // During onboarding, can always proceed
    switch (currentStep) {
      case "style":
        return true; // Can proceed without selection (balanced/neutral)
      case "colors":
        return true; // Can proceed without selection (balanced/neutral)
      case "fit_reference":
        return true;
    }
  };


  const renderStyleSelection = () => (
    <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1, paddingHorizontal: spacing.lg, backgroundColor: colors.bg.elevated }}>
      {/* Header - Centered at top */}
      <Animated.View
        entering={FadeInDown.delay(100)}
        style={{ alignItems: "center", marginTop: fromPreferences ? spacing.sm : spacing.md, marginBottom: spacing.xl }}
      >
        <Text
          style={{
            ...getTextStyle("h1", colors.text.primary),
            textAlign: "center",
            marginBottom: spacing.sm,
          }}
      >
        What's your vibe?
        </Text>
      <Text
          style={{
            ...getTextStyle("body", colors.text.secondary),
            textAlign: "center",
          }}
      >
        Choose a vibe for better matches - you can change it anytime.
      </Text>
      </Animated.View>

      {/* Style Cards Grid */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: colors.bg.elevated }}
        contentContainerStyle={{ paddingBottom: spacing.lg }}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", backgroundColor: colors.bg.elevated }}>
        {STYLE_VIBES.map((vibe, index) => (
          <StyleCard
            key={vibe.id}
            vibe={vibe}
            selected={selectedStyles.includes(vibe.id)}
            onPress={() => toggleStyle(vibe.id)}
            index={index}
          />
        ))}
      </View>
      </ScrollView>
    </Animated.View>
  );

  const renderColorSelection = () => {
    const colorGroups = [
      { id: "black", emoji: "🖤", label: "Mostly black", helper: "Black outfits, dark basics" },
      { id: "neutrals", emoji: "🤍", label: "Neutrals", helper: "White, beige, gray" },
      { id: "denim", emoji: "👖", label: "Denim & blues", helper: "Jeans, navy, blue tones" },
      { id: "earth", emoji: "🌿", label: "Earth tones", helper: "Brown, olive, tan" },
      { id: "warm", emoji: "🔥", label: "Warm brights", helper: "Red, orange, mustard" },
      { id: "cool", emoji: "💜", label: "Cool brights", helper: "Blue, teal, purple" },
    ];

    const selectedGroupIds = selectedColors
      .map((c) => {
        if (["#000000", "#1C1917"].includes(c.hex)) return "black";
        if (["#FFFFFF", "#D6D3D1", "#F5F5DC", "#FFFDD0"].includes(c.hex)) return "neutrals";
        if (["#000080", "#4169E1", "#87CEEB"].includes(c.hex)) return "denim";
        if (["#8B4513", "#D2B48C", "#800000"].includes(c.hex)) return "earth";
        if (["#DC143C", "#FFA500", "#FFD700"].includes(c.hex)) return "warm";
        if (["#800080", "#E6E6FA", "#FFB6C1"].includes(c.hex)) return "cool";
        return null;
      })
      .filter(Boolean) as string[];

    const toggleColorGroup = (groupId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const groupColorMap: Record<string, ColorInfo[]> = {
        black: [{ hex: "#000000", name: "Black" }],
        neutrals: [{ hex: "#FFFFFF", name: "White" }, { hex: "#D6D3D1", name: "Light Gray" }],
        denim: [{ hex: "#000080", name: "Navy" }, { hex: "#4169E1", name: "Royal Blue" }],
        earth: [{ hex: "#8B4513", name: "Brown" }, { hex: "#D2B48C", name: "Tan" }],
        warm: [{ hex: "#DC143C", name: "Red" }, { hex: "#FFA500", name: "Orange" }],
        cool: [{ hex: "#800080", name: "Purple" }, { hex: "#E6E6FA", name: "Lavender" }],
      };

      const groupColors = groupColorMap[groupId] || [];
      const isSelected = selectedGroupIds.includes(groupId);

      if (isSelected) {
        // Remove all colors from this group
        setSelectedColors((prev) =>
          prev.filter((c) => !groupColors.some((gc) => gc.hex === c.hex))
        );
      } else {
        // Add all colors from this group
        setSelectedColors((prev) => {
          const newColors = [...prev];
          for (const color of groupColors) {
            if (!newColors.some((c) => c.hex === color.hex)) {
              newColors.push(color);
            }
          }
          return newColors;
        });
      }
    };

    return (
      <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1, paddingHorizontal: spacing.lg, backgroundColor: colors.bg.elevated }}>
        {/* Header - Centered at top */}
        <Animated.View
          entering={FadeInDown.delay(100)}
          style={{ alignItems: "center", marginTop: fromPreferences ? spacing.sm : spacing.md, marginBottom: spacing.xl }}
        >
          <Text
            style={{
              ...getTextStyle("h1", colors.text.primary),
              textAlign: "center",
              marginBottom: spacing.sm,
            }}
        >
          What's your wardrobe palette?
          </Text>
        <Text
            style={{
              ...getTextStyle("body", colors.text.secondary),
              textAlign: "center",
            }}
        >
            Pick what you wear most - you can update this anytime.
        </Text>
        </Animated.View>

        {/* Color Cards Grid - Scrollable */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: spacing.lg }}
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            {colorGroups.map((group, index) => {
              const isSelected = selectedGroupIds.includes(group.id);
              return (
                <ColorCard
                  key={group.id}
                  group={group}
                  selected={isSelected}
                    onPress={() => toggleColorGroup(group.id)}
                  index={index}
                />
              );
            })}
          </View>
        </ScrollView>
      </Animated.View>
    );
  };

  const renderSizeSelection = () => (
    <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1, paddingHorizontal: spacing.lg, backgroundColor: colors.bg.elevated }}>
      {/* Header - Centered at top */}
      <Animated.View
        entering={FadeInDown.delay(100)}
        style={{ alignItems: "center", marginTop: fromPreferences ? spacing.sm : spacing.md, marginBottom: spacing.xl }}
      >
      <Text
          style={{
            ...getTextStyle("h1", colors.text.primary),
            textAlign: "center",
            marginBottom: spacing.sm,
          }}
      >
          How do you like it to fit?
      </Text>
          <Text
          style={{
            ...getTextStyle("body", colors.text.secondary),
            textAlign: "center",
          }}
          >
          Used to refine matches, not restrict them.
          </Text>
      </Animated.View>

      {/* Fit Cards Grid - Scrollable */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.lg }}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            <FitButton
              fit="slim"
              label="Slim"
              selected={fitPreference === "slim"}
              onPress={() => setFitPreference(fitPreference === "slim" ? null : "slim")}
              index={0}
            />
            <FitButton
              fit="regular"
              label="Regular"
              selected={fitPreference === "regular"}
              onPress={() => setFitPreference(fitPreference === "regular" ? null : "regular")}
              index={1}
            />
            <FitButton
              fit="oversized"
              label="Oversized"
              selected={fitPreference === "oversized"}
              onPress={() => setFitPreference(fitPreference === "oversized" ? null : "oversized")}
              index={2}
            />
        </View>
      </ScrollView>
    </Animated.View>
  );

  const renderContent = () => {
    switch (currentStep) {
      case "style":
        return renderStyleSelection();
      case "colors":
        return renderColorSelection();
      case "fit_reference":
        return renderSizeSelection();
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.elevated }} onLayout={onLayoutRootView}>

      {/* Safe area top spacing */}
      <View style={{ height: fromPreferences ? insets.top : insets.top + 12 }} />

      {/* Header with Back chevron (onboarding) or Back button (preferences) */}
      {!fromPreferences && (
        <Animated.View
          entering={FadeInDown.delay(50)}
          style={{
            paddingHorizontal: 24,
            paddingTop: 0,
            paddingBottom: 8,
          }}
        >
          {/* Back chevron - show on all steps except first */}
          {currentStep !== "style" ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handlePrevious();
              }}
              hitSlop={12}
              style={({ pressed }) => ({
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <ChevronLeft size={28} color={colors.text.secondary} />
            </Pressable>
          ) : null}
        </Animated.View>
      )}

      {/* Back button when coming from preferences */}
      {fromPreferences && (
        <Animated.View
          entering={FadeInDown.delay(50)}
          style={{
            paddingHorizontal: 24,
            paddingTop: 0,
            paddingBottom: 0,
          }}
        >
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            hitSlop={12}
            style={{
              alignSelf: "flex-start",
            }}
          >
            <ChevronLeft size={28} color={colors.text.secondary} />
          </Pressable>
        </Animated.View>
      )}

      {/* Step indicator - hidden on all steps to match design */}

      {/* Content - with swipe gesture (disabled when coming from preferences) */}
      {fromPreferences ? (
        <View style={{ flex: 1 }}>
      {renderContent()}
        </View>
      ) : (
        <GestureDetector gesture={swipeGesture}>
          <View style={{ flex: 1 }}>
            {renderContent()}
          </View>
        </GestureDetector>
      )}

      {/* Bottom buttons */}
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + 12,
        }}
      >
        {/* Skip button - only during onboarding */}
        {!fromPreferences && (
          <View style={{ alignItems: "center", marginBottom: spacing.md }}>
            <ButtonTertiary
              label="Skip for now"
              onPress={handleSkipOnboarding}
            />
          </View>
        )}

        {/* Continue/Save button */}
        <Pressable
          onPress={() => {
            if (canProceed()) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              handleNext();
            }
          }}
          disabled={!canProceed()}
          style={({ pressed }) => ({
            opacity: pressed && canProceed() ? 0.9 : 1,
          })}
        >
          <View
            style={{
              height: 56,
              borderRadius: borderRadius.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: button.primary.backgroundColor,
              opacity: !canProceed() ? 0.5 : 1,
            }}
        >
          <Text
            style={getTextStyle("button", colors.text.inverse)}
          >
              {fromPreferences ? "Save changes" : "Continue"}
          </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
