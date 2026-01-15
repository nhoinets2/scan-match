import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { ImageOff } from "lucide-react-native";
import { colors, borderRadius } from "@/lib/design-tokens";

interface PlaceholderImageProps {
  /**
   * Width of the placeholder container
   */
  width: number | "100%";
  /**
   * Height of the placeholder container
   */
  height: number | "100%";
  /**
   * Optional border radius (defaults to borderRadius.image)
   */
  borderRadius?: number;
  /**
   * Optional background color (defaults to colors.bg.elevated)
   */
  backgroundColor?: string;
  /**
   * Optional additional style for the container
   */
  style?: ViewStyle;
}

/**
 * A reusable placeholder image component for when item images are not available.
 * Uses an ImageOff icon as placeholder.
 */
export function PlaceholderImage({
  width,
  height,
  borderRadius: customBorderRadius,
  backgroundColor = colors.bg.elevated,
  style,
}: PlaceholderImageProps) {
  const containerStyle: ViewStyle = {
    width,
    height,
    borderRadius: customBorderRadius ?? borderRadius.image,
    backgroundColor,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...style,
  };

  // Calculate icon size - slightly smaller than container for padding effect
  const iconSize = typeof width === "number" ? Math.min(width * 0.35, 48) : 48;

  return (
    <View style={containerStyle}>
      <ImageOff
        size={iconSize}
        color={colors.text.tertiary}
        strokeWidth={1.5}
      />
    </View>
  );
}

/**
 * Placeholder for grid/card items (square, full-size)
 */
export function GridPlaceholderImage({
  style,
}: {
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.gridContainer, style]}>
      <ImageOff
        size={48}
        color={colors.text.tertiary}
        strokeWidth={1.5}
      />
    </View>
  );
}

/**
 * Placeholder for thumbnail images (small, fixed size)
 */
export function ThumbnailPlaceholderImage({
  size,
  borderRadius: customBorderRadius,
  style,
}: {
  size: number;
  borderRadius?: number;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: customBorderRadius ?? borderRadius.image,
          backgroundColor: colors.bg.elevated,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        },
        style,
      ]}
    >
      <ImageOff
        size={size * 0.45}
        color={colors.text.tertiary}
        strokeWidth={1.5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  gridContainer: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.bg.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
});
