import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { colors, borderRadius } from "@/lib/design-tokens";

// The placeholder image asset
const PLACEHOLDER_IMAGE = require("../../assets/icons/empty_state_image/no_image_state.webp");

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
 * Uses the no_image_state.webp asset.
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

  // Calculate image size - slightly smaller than container for padding effect
  const imageSize = typeof width === "number" ? Math.min(width * 0.5, 64) : 64;

  return (
    <View style={containerStyle}>
      <Image
        source={PLACEHOLDER_IMAGE}
        style={{
          width: imageSize,
          height: imageSize,
          opacity: 0.6,
        }}
        contentFit="contain"
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
      <Image
        source={PLACEHOLDER_IMAGE}
        style={styles.gridImage}
        contentFit="contain"
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
      <Image
        source={PLACEHOLDER_IMAGE}
        style={{
          width: size * 0.6,
          height: size * 0.6,
          opacity: 0.6,
        }}
        contentFit="contain"
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
  gridImage: {
    width: 64,
    height: 64,
    opacity: 0.6,
  },
});

export { PLACEHOLDER_IMAGE };
