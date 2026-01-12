import React, { forwardRef } from "react";
import { Pressable, Text, StyleSheet, View, PressableProps } from "react-native";
import { BlurView } from "expo-blur";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { button } from "@/lib/design-tokens";

const ForwardedPressable = forwardRef<View, PressableProps>(
  function ForwardedPressable(props, ref) {
    return <Pressable ref={ref} {...props} />;
  }
);
const AnimatedPressable = Animated.createAnimatedComponent(ForwardedPressable);

interface ButtonTertiaryProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  onDark?: boolean; // For dark camera UI
  style?: any;
  glassmorphism?: boolean;
  textColor?: string;
}

export function ButtonTertiary({
  label,
  onPress,
  disabled = false,
  onDark = false,
  style,
  glassmorphism = false,
  textColor,
}: ButtonTertiaryProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = () => {
    if (!disabled) {
      scale.value = withSpring(button.motion.pressScale);
      opacity.value = withSpring(0.7);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
    opacity.value = withSpring(1);
  };

  const handlePress = () => {
    if (!disabled) {
      onPress();
    }
  };

  const defaultTextColor = textColor || (onDark
    ? button.colors.tertiary.textOnDark
    : button.colors.tertiary.text);

  const buttonContent = (
    <Text
      style={[
        styles.text,
        {
          fontFamily: button.text.tertiary.font,
          fontSize: button.text.tertiary.size,
          color: defaultTextColor,
        },
      ]}
    >
      {label}
    </Text>
  );

  if (glassmorphism) {
    return (
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={[
          {
            borderRadius: button.radius,
            overflow: "hidden",
          },
          animatedStyle,
          style,
        ]}
      >
        <BlurView
          intensity={10}
          tint="light"
          style={{
            backgroundColor: "rgba(255,255,255,0.05)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            borderRadius: button.radius,
            height: button.height.tertiary,
            paddingHorizontal: button.paddingX.tertiary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {buttonContent}
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
          height: button.height.tertiary,
          paddingHorizontal: button.paddingX.tertiary,
        },
        animatedStyle,
        style,
      ]}
    >
      {buttonContent}
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

