/**
 * SegmentedControl Component
 *
 * A two-segment tab control for switching between "Wear now" and "Worth trying" views.
 * Follows the app's design system with subtle animations.
 */

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { borderRadius, colors, typography, shadows, spacing } from "@/lib/design-tokens";

export type SegmentedControlTab = "high" | "near";

export interface SegmentedControlProps {
  /** Currently selected tab */
  activeTab: SegmentedControlTab;
  /** Callback when tab changes */
  onTabChange: (tab: SegmentedControlTab) => void;
  /** Optional custom labels */
  labels?: {
    high: string;
    near: string;
  };
  /** Whether the control is disabled */
  disabled?: boolean;
}

const DEFAULT_LABELS = {
  high: "Wear now",
  near: "Worth trying",
};

export function SegmentedControl({
  activeTab,
  onTabChange,
  labels = DEFAULT_LABELS,
  disabled = false,
}: SegmentedControlProps) {
  const animatedValue = useSharedValue(activeTab === "high" ? 0 : 1);

  // Update animation when activeTab changes
  React.useEffect(() => {
    animatedValue.value = withTiming(activeTab === "high" ? 0 : 1, {
      duration: 200,
    });
  }, [activeTab, animatedValue]);

  const indicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateX: interpolate(
            animatedValue.value,
            [0, 1],
            [0, 1] // Will be multiplied by half-width in layout
          ),
        },
      ],
      left: `${animatedValue.value * 50}%`,
    };
  });

  const handlePress = (tab: SegmentedControlTab) => {
    if (disabled || tab === activeTab) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTabChange(tab);
  };

  return (
    <View style={styles.container}>
      {/* Background track */}
      <View style={styles.track}>
        {/* Animated indicator */}
        <Animated.View style={[styles.indicator, indicatorStyle]} />

        {/* Tab buttons */}
        <Pressable
          style={styles.tab}
          onPress={() => handlePress("high")}
          disabled={disabled}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "high" && styles.tabTextActive,
              disabled && styles.tabTextDisabled,
            ]}
          >
            {labels.high}
          </Text>
        </Pressable>

        <Pressable
          style={styles.tab}
          onPress={() => handlePress("near")}
          disabled={disabled}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "near" && styles.tabTextActive,
              disabled && styles.tabTextDisabled,
            ]}
          >
            {labels.near}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  track: {
    flexDirection: "row",
    backgroundColor: colors.bg.tertiary,
    borderRadius: borderRadius.md,
    padding: spacing.xs,
    position: "relative",
  },
  indicator: {
    position: "absolute",
    top: spacing.xs,
    bottom: spacing.xs,
    width: "50%",
    backgroundColor: colors.bg.secondary,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.hairline,
    ...shadows.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm - 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  tabText: {
    ...typography.segment.label,
    color: colors.text.secondary,
  },
  tabTextActive: {
    color: colors.text.primary,
  },
  tabTextDisabled: {
    opacity: 0.4,
  },
});
