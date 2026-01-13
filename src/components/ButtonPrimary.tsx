import React, { useEffect } from "react";
import { Pressable, Text, ActivityIndicator, View, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, cancelAnimation } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { button } from "@/lib/design-tokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ButtonPrimaryProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: any;
}

export function ButtonPrimary({
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
}: ButtonPrimaryProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const bgColorValue = useSharedValue<string>(
    disabled || loading
      ? button.colors.primary.bgDisabled
      : button.colors.primary.bg
  );

  const borderColorValue = useSharedValue<string>(
    disabled || loading
      ? button.colors.primary.borderDisabled
      : button.colors.primary.border
  );

  // Update background and border color when disabled/loading state changes
  useEffect(() => {
    // Cancel any ongoing animation to prevent conflicts
    cancelAnimation(bgColorValue);
    cancelAnimation(borderColorValue);
    // Use withTiming for smooth state transitions (not bouncy like withSpring)
    bgColorValue.value = withTiming(
      disabled || loading
        ? button.colors.primary.bgDisabled
        : button.colors.primary.bg,
      { duration: 200 }
    );
    borderColorValue.value = withTiming(
      disabled || loading
        ? button.colors.primary.borderDisabled
        : button.colors.primary.border,
      { duration: 200 }
    );
  }, [disabled, loading, bgColorValue, borderColorValue]);

  const animatedBgStyle = useAnimatedStyle(() => ({
    backgroundColor: bgColorValue.value,
  }));

  const animatedBorderStyle = useAnimatedStyle(() => ({
    borderColor: borderColorValue.value,
  }));

  const handlePressIn = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(button.motion.pressScale);
      bgColorValue.value = withSpring(button.colors.primary.bgPressed);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
    bgColorValue.value = withSpring(
      disabled || loading
        ? button.colors.primary.bgDisabled
        : button.colors.primary.bg
    );
    borderColorValue.value = withSpring(
      disabled || loading
        ? button.colors.primary.borderDisabled
        : button.colors.primary.border
    );
  };

  const handlePress = () => {
    if (!disabled && !loading) {
      onPress();
    }
  };

  const isDisabled = disabled || loading;
  const textColor = isDisabled
    ? button.colors.primary.textDisabled
    : button.colors.primary.text;

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      style={[
        styles.button,
        {
          height: button.height.primary,
          paddingHorizontal: button.paddingX.primary,
          borderWidth: button.border.width,
          shadowColor: button.shadow.color,
          shadowOffset: button.shadow.offset,
          shadowOpacity: button.shadow.opacity,
          shadowRadius: button.shadow.radius,
          elevation: button.shadow.elevation,
        },
        animatedBgStyle,
        animatedBorderStyle,
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <Text
          style={[
            styles.text,
            {
              fontFamily: button.text.primary.font,
              fontSize: button.text.primary.size,
              color: textColor,
            },
          ]}
        >
          {label}
        </Text>
      )}
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
