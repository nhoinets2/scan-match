import React, { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
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
  const [isLoading, setIsLoading] = useState(false);
  const prevUriRef = useRef(imageUri);

  // Reset loading state when URI changes (e.g., from file:// to https:// after upload)
  useEffect(() => {
    if (imageUri !== prevUriRef.current) {
      prevUriRef.current = imageUri;
      setIsLoading(true); // Start loading when URI changes
    }
  }, [imageUri]);

  const content = (
    <View style={{ alignItems: "center", gap: spacing.xs }}>
      {/* 1:1 Image Container */}
      <View style={{ position: "relative" }}>
        <Image
          source={{ uri: imageUri }}
          style={{
            width: imageSize,
            height: imageSize,
            borderRadius: components.image.borderRadius,
            backgroundColor: colors.bg.secondary,
          }}
          contentFit="cover"
          onLoadStart={() => setIsLoading(true)}
          onLoad={() => setIsLoading(false)}
          transition={100}
          cachePolicy="memory-disk"
          recyclingKey={imageUri}
        />
        
        {/* Loading Spinner Overlay */}
        {isLoading && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.bg.secondary,
              borderRadius: components.image.borderRadius,
            }}
          >
            <ActivityIndicator size="small" color={colors.accent.terracotta} />
          </View>
        )}
      </View>

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
