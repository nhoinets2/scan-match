import React, { forwardRef } from "react";
import { Pressable, StyleSheet, ViewStyle, View, PressableProps } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { LucideIcon } from "lucide-react-native";

import { borderRadius, colors } from "@/lib/design-tokens";

const ForwardedPressable = forwardRef<View, PressableProps>(
  function ForwardedPressable(props, ref) {
    return <Pressable ref={ref} {...props} />;
  }
);
const AnimatedPressable = Animated.createAnimatedComponent(ForwardedPressable);

interface IconButtonProps {
  icon: LucideIcon;
  onPress: () => void;
  disabled?: boolean;
  onDark?: boolean; // For dark camera UI
  size?: number; // Icon size, default 20
  style?: ViewStyle;
}

export function IconButton({
  icon: Icon,
  onPress,
  disabled = false,
  onDark = false,
  size = 20,
  style,
}: IconButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!disabled) {
      scale.value = withSpring(0.95);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const handlePress = () => {
    if (!disabled) {
      onPress();
    }
  };

  const bgColor = onDark
    ? "rgba(255,255,255,0.12)"
    : colors.state.pressed;
  const iconColor = onDark ? colors.text.inverse : colors.text.primary;

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[
        styles.button,
        {
          width: 44,
          height: 44,
          borderRadius: borderRadius.pill,
          backgroundColor: bgColor,
        },
        animatedStyle,
        style,
      ]}
    >
      <Icon size={size} color={iconColor} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
});
