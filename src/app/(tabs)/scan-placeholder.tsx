import React, { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  Camera,
  Puzzle,
  Shirt,
  Sparkles,
} from "lucide-react-native";

import { 
  colors, 
  typography, 
  spacing, 
  borderRadius, 
  shadows,
  segmentedControl,
  button,
} from "@/lib/design-tokens";

type ScanMode = "try" | "wardrobe";

// Segmented Control Component
function SegmentedControl({
  selected,
  onSelect,
}: {
  selected: ScanMode;
  onSelect: (mode: ScanMode) => void;
}) {
  const tryScale = useSharedValue(1);
  const wardrobeScale = useSharedValue(1);

  const tryAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: tryScale.value }],
  }));

  const wardrobeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: wardrobeScale.value }],
  }));

  return (
    <View
      style={{
        backgroundColor: segmentedControl.container.backgroundColor,
        borderRadius: segmentedControl.container.borderRadius,
        padding: segmentedControl.container.padding,
        flexDirection: "row",
        ...shadows.sm,
      }}
    >
      {/* Try Item Tab */}
      <Animated.View style={[{ flex: 1 }, tryAnimatedStyle]}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onSelect("try");
          }}
          onPressIn={() => {
            tryScale.value = withSpring(0.97);
          }}
          onPressOut={() => {
            tryScale.value = withSpring(1);
          }}
          style={{
            backgroundColor: selected === "try" ? segmentedControl.selected.backgroundColor : "transparent",
            borderRadius: segmentedControl.segment.borderRadius,
            paddingVertical: 12,
            paddingHorizontal: segmentedControl.segment.paddingHorizontal,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: selected === "try" ? segmentedControl.selected.borderWidth : 0,
            borderColor: selected === "try" ? segmentedControl.selected.borderColor : "transparent",
            ...(selected === "try" ? shadows.sm : shadows.none),
          }}
        >
          <Puzzle
            size={18}
            color={selected === "try" ? colors.text.primary : colors.text.secondary}
            strokeWidth={1.5}
          />
          <Text
            style={{
              ...typography.segment.label,
              color: selected === "try" ? colors.text.primary : colors.text.secondary,
              marginLeft: spacing.sm,
            }}
          >
            Try Item
          </Text>
          {selected === "try" && (
            <View
              style={{
                position: "absolute",
                bottom: 4,
                width: 24,
                height: segmentedControl.selected.indicatorHeight,
                backgroundColor: segmentedControl.selected.indicatorColor,
                borderRadius: 1,
              }}
            />
          )}
        </Pressable>
      </Animated.View>

      {/* Add to Wardrobe Tab */}
      <Animated.View style={[{ flex: 1 }, wardrobeAnimatedStyle]}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onSelect("wardrobe");
          }}
          onPressIn={() => {
            wardrobeScale.value = withSpring(0.97);
          }}
          onPressOut={() => {
            wardrobeScale.value = withSpring(1);
          }}
          style={{
            backgroundColor: selected === "wardrobe" ? segmentedControl.selected.backgroundColor : "transparent",
            borderRadius: segmentedControl.segment.borderRadius,
            paddingVertical: 12,
            paddingHorizontal: segmentedControl.segment.paddingHorizontal,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: selected === "wardrobe" ? segmentedControl.selected.borderWidth : 0,
            borderColor: selected === "wardrobe" ? segmentedControl.selected.borderColor : "transparent",
            ...(selected === "wardrobe" ? shadows.sm : shadows.none),
          }}
        >
          <Shirt
            size={18}
            color={selected === "wardrobe" ? colors.text.primary : colors.text.secondary}
            strokeWidth={1.5}
          />
          <Text
            style={{
              ...typography.segment.label,
              color: selected === "wardrobe" ? colors.text.primary : colors.text.secondary,
              marginLeft: spacing.sm,
            }}
          >
            Add to Wardrobe
          </Text>
          {selected === "wardrobe" && (
            <View
              style={{
                position: "absolute",
                bottom: 4,
                width: 24,
                height: segmentedControl.selected.indicatorHeight,
                backgroundColor: segmentedControl.selected.indicatorColor,
                borderRadius: 1,
              }}
            />
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

// Main Scan Drop Zone
function ScanDropZone({ onPress }: { onPress: () => void }) {
  const buttonScale = useSharedValue(1);
  const outerRingScale = useSharedValue(1);

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const outerRingAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: outerRingScale.value }],
  }));

  return (
    <View
      style={{
        backgroundColor: colors.bg.tertiary,
        borderRadius: borderRadius.xl,
        padding: spacing.xxl,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderStyle: "dashed",
        borderColor: colors.border.subtle,
        ...shadows.md,
        minHeight: 380,
      }}
    >
      {/* Center Action Button */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        onPressIn={() => {
          buttonScale.value = withSpring(0.95);
          outerRingScale.value = withSpring(1.05);
        }}
        onPressOut={() => {
          buttonScale.value = withSpring(1);
          outerRingScale.value = withSpring(1);
        }}
        style={{ alignItems: "center" }}
      >
        {/* Outer Ring Glow */}
        <Animated.View
          style={[
            outerRingAnimatedStyle,
            {
              position: "absolute",
              width: 100,
              height: 100,
              borderRadius: 50,
              backgroundColor: colors.accent.brassLight,
              borderWidth: 1,
              borderColor: `${colors.accent.brass}30`,
            },
          ]}
        />

        {/* Main Button */}
        <Animated.View
          style={[
            buttonAnimatedStyle,
            {
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: button.primary.backgroundColor,
              alignItems: "center",
              justifyContent: "center",
              ...shadows.md,
            },
          ]}
        >
          <Camera size={32} color={colors.text.inverse} strokeWidth={1.5} />
        </Animated.View>
      </Pressable>

      {/* Text */}
      <Text
        style={{
          ...typography.ui.sectionTitle,
          color: colors.text.primary,
          marginTop: spacing.lg,
        }}
      >
        Tap to Scan
      </Text>
      <Text
        style={{
          ...typography.ui.label,
          fontFamily: typography.fontFamily.regular,
          color: colors.text.secondary,
          marginTop: spacing.xs,
        }}
      >
        or upload a photo
      </Text>
    </View>
  );
}

// Guidance Tip Component
function GuidanceTip() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        paddingHorizontal: spacing.sm,
      }}
    >
      <Sparkles size={16} color={colors.accent.brass} strokeWidth={2} style={{ marginTop: 2 }} />
      <Text
        style={{
          ...typography.ui.caption,
          color: colors.text.secondary,
          marginLeft: spacing.sm,
          flex: 1,
        }}
      >
        For best results, use good lighting and capture the entire item.
      </Text>
    </View>
  );
}

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const [scanMode, setScanMode] = useState<ScanMode>("try");

  const handleScanPress = () => {
    // Navigate to appropriate camera screen based on selected mode
    if (scanMode === "wardrobe") {
      router.push("/add-item");
    } else {
      router.push("/scan");
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg.primary,
      }}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.xxl,
          paddingBottom: insets.bottom + 80,
          paddingHorizontal: spacing.lg,
        }}
      >
        {/* Header */}
        <View style={{ marginBottom: spacing.xl }}>
          <Text
            style={{
              ...typography.display.screenTitle,
              color: colors.text.primary,
              marginBottom: spacing.sm,
            }}
          >
            {scanMode === "try" ? "Try Before You Buy" : "Build Your Wardrobe"}
          </Text>
          <Text
            style={{
              ...typography.ui.label,
              fontFamily: typography.fontFamily.regular,
              color: colors.text.secondary,
            }}
          >
            {scanMode === "try" 
              ? "Scan an item to see how it fits your style."
              : "Add items you own to get better recommendations."}
          </Text>
        </View>

        {/* Segmented Control */}
        <View style={{ marginBottom: spacing.xl }}>
          <SegmentedControl selected={scanMode} onSelect={setScanMode} />
        </View>

        {/* Main Scan Area */}
        <View style={{ marginBottom: spacing.lg }}>
          <ScanDropZone onPress={handleScanPress} />
        </View>

        {/* Guidance Tip */}
        <GuidanceTip />
      </ScrollView>
    </View>
  );
}
