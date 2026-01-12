import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { button } from "@/lib/design-tokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ButtonSecondaryOutlineProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: any;
}

export function ButtonSecondaryOutline({
  label,
  onPress,
  disabled = false,
  style,
}: ButtonSecondaryOutlineProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const bgColorValue = useSharedValue<string>(
    disabled
      ? "transparent"
      : button.colors.outline.bg
  );

  const animatedBgStyle = useAnimatedStyle(() => ({
    backgroundColor: bgColorValue.value,
  }));

  const handlePressIn = () => {
    if (!disabled) {
      scale.value = withSpring(button.motion.pressScale);
      bgColorValue.value = withSpring(button.colors.outline.bgPressed as string);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
    bgColorValue.value = withSpring(
      disabled
        ? "transparent"
        : button.colors.outline.bg
    );
  };

  const handlePress = () => {
    if (!disabled) {
      onPress();
    }
  };

  const textColor = disabled
    ? button.colors.outline.textDisabled
    : button.colors.outline.text;

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
          borderColor: button.colors.outline.border,
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
            color: textColor,
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

