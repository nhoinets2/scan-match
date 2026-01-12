import React from "react";
import { View, Text, Image, Pressable } from "react-native";
import { colors, spacing, components } from "@/lib/design-tokens";
import type { Category } from "@/lib/types";

interface WardrobeItemCardProps {
  imageUri: string;
  category?: Category;
  brand?: string;
  onPress?: () => void;
  size?: "small" | "medium" | "large";
}

const sizeMap = {
  small: 64,
  medium: 80,
  large: 100,
};

export function WardrobeItemCard({
  imageUri,
  category,
  brand,
  onPress,
  size = "medium",
}: WardrobeItemCardProps) {
  const imageSize = sizeMap[size];

  const content = (
    <View style={{ alignItems: "center", gap: spacing.xs }}>
      {/* 1:1 Image */}
      <Image
        source={{ uri: imageUri }}
        style={{
          width: imageSize,
          height: imageSize,
          borderRadius: components.image.borderRadius,
          backgroundColor: colors.bg.secondary,
        }}
        resizeMode="cover"
      />

      {/* Optional Category Label */}
      {category && (
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            color: colors.text.secondary,
            textTransform: "capitalize",
          }}
          numberOfLines={1}
        >
          {category}
          {brand ? ` · ${brand}` : ""}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        {content}
      </Pressable>
    );
  }

  return content;
}
