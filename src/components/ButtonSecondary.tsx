import React, { useEffect } from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, cancelAnimation } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { button, shadows } from "@/lib/design-tokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ButtonSecondaryProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: any;
  textColor?: string;
  glassmorphism?: boolean;
}

export function ButtonSecondary({
  label,
  onPress,
  disabled = false,
  style,
  textColor,
  glassmorphism = false,
}: ButtonSecondaryProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const bgColorValue = useSharedValue<string>(
    disabled
      ? button.colors.secondary.bgDisabled
      : button.colors.secondary.bg
  );

  // Update background color when disabled state changes
  useEffect(() => {
    // Cancel any ongoing animation to prevent conflicts
    cancelAnimation(bgColorValue);
    // Use withTiming for smooth state transitions (not bouncy like withSpring)
    bgColorValue.value = withTiming(
      disabled
        ? button.colors.secondary.bgDisabled
        : button.colors.secondary.bg,
      { duration: 200 }
    );
  }, [disabled, bgColorValue]);

  const animatedBgStyle = useAnimatedStyle(() => ({
    backgroundColor: bgColorValue.value,
  }));

  const handlePressIn = () => {
    if (!disabled) {
      scale.value = withSpring(button.motion.pressScale);
      bgColorValue.value = withSpring(button.colors.secondary.bgPressed as string);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
    bgColorValue.value = withSpring(
      disabled
        ? button.colors.secondary.bgDisabled
        : button.colors.secondary.bg
    );
  };

  const handlePress = () => {
    if (!disabled) {
      onPress();
    }
  };

  const textColorValue = textColor || (disabled
    ? button.colors.secondary.textDisabled
    : button.colors.secondary.text);

  if (glassmorphism) {
    return (
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={[
          animatedStyle,
          {
            borderRadius: button.radius,
            overflow: "hidden",
            // V3: use shadow tokens for glassmorphism
            ...shadows.md,
          },
          style,
        ]}
      >
        <BlurView
          intensity={14}
          tint="light"
          style={{
            backgroundColor: "rgba(255,255,255,0.15)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.2)",
            borderRadius: button.radius,
            height: button.height.secondary,
            paddingHorizontal: button.paddingX.secondary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={[
              styles.text,
              {
                fontFamily: button.text.secondary.font,
                fontSize: button.text.secondary.size,
                color: textColorValue,
              },
            ]}
          >
            {label}
          </Text>
        </BlurView>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[
        styles.button,
        {
          height: button.height.secondary,
          paddingHorizontal: button.paddingX.secondary,
          borderWidth: 1,
          borderColor: disabled ? button.colors.secondary.borderDisabled : button.colors.secondary.border,
        },
        animatedBgStyle,
        animatedStyle,
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            fontFamily: button.text.secondary.font,
            fontSize: button.text.secondary.size,
            color: textColorValue,
          },
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: button.radius,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    textAlign: "center",
  },
});
