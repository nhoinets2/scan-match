import React, { useEffect, forwardRef } from "react";
import { Pressable, Text, ActivityIndicator, StyleSheet, View, PressableProps } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, cancelAnimation } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { button } from "@/lib/design-tokens";

const ForwardedPressable = forwardRef<View, PressableProps>(
  function ForwardedPressable(props, ref) {
    return <Pressable ref={ref} {...props} />;
  }
);
const AnimatedPressable = Animated.createAnimatedComponent(ForwardedPressable);

interface ButtonDestructiveProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: any;
}

/**
 * Destructive action button (delete account, sign out, etc.)
 * Uses the same visual style as ButtonPrimary but semantically indicates a destructive action.
 */
export function ButtonDestructive({
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
}: ButtonDestructiveProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const bgColorValue = useSharedValue<string>(
    disabled || loading
      ? button.colors.destructive.bgDisabled
      : button.colors.destructive.bg
  );

  // Update background color when disabled/loading state changes
  useEffect(() => {
    cancelAnimation(bgColorValue);
    bgColorValue.value = withTiming(
      disabled || loading
        ? button.colors.destructive.bgDisabled
        : button.colors.destructive.bg,
      { duration: 200 }
    );
  }, [disabled, loading, bgColorValue]);

  const animatedBgStyle = useAnimatedStyle(() => ({
    backgroundColor: bgColorValue.value,
  }));

  const handlePressIn = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(button.motion.pressScale);
      bgColorValue.value = withSpring(button.colors.destructive.bgPressed);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
    bgColorValue.value = withSpring(
      disabled || loading
        ? button.colors.destructive.bgDisabled
        : button.colors.destructive.bg
    );
  };

  const handlePress = () => {
    if (!disabled && !loading) {
      onPress();
    }
  };

  const isDisabled = disabled || loading;
  const textColor = isDisabled
    ? button.colors.destructive.textDisabled
    : button.colors.destructive.text;

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
        },
        animatedBgStyle,
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

