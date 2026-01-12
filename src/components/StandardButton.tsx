import React from "react";
import { Pressable, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { typography, colors, borderRadius } from "@/lib/design-tokens";

interface StandardButtonProps {
  text: string;
  onPress: () => void;
}

export function StandardButton({ text, onPress }: StandardButtonProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={{
        backgroundColor: colors.accent.terracottaLight,
        borderRadius: borderRadius.pill,
        paddingHorizontal: 24,
        paddingVertical: 12,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: "Inter_600SemiBold",
          fontSize: typography.sizes.body,
          color: colors.accent.terracotta,
        }}
      >
        {text}
      </Text>
    </Pressable>
  );
}
