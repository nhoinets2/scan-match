import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { ImageOff } from "lucide-react-native";
import { colors, borderRadius } from "@/lib/design-tokens";

/**
 * Diagonal stripe pattern background using View elements
 * More reliable than SVG patterns in React Native
 */
function DiagonalStripes({ 
  stripeColor = colors.border.subtle,
  stripeWidth = 1,
  spacing = 8,
}: { 
  stripeColor?: string;
  stripeWidth?: number;
  spacing?: number;
}) {
  // Create multiple stripe lines
  const stripes = [];
  const numStripes = 40; // Enough to cover typical card sizes
  
  for (let i = 0; i < numStripes; i++) {
    stripes.push(
      <View
        key={i}
        style={{
          position: "absolute",
          width: stripeWidth,
          height: 500, // Long enough to cover diagonal
          backgroundColor: stripeColor,
          left: i * spacing,
          top: -100,
          transform: [{ rotate: "45deg" }],
          opacity: 0.4,
        }}
      />
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      {stripes}
    </View>
  );
}

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
 * A reusable placeholder component for when item images are not available.
 * Shows a diagonal stripe pattern with an ImageOff icon.
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

  const iconSize = typeof width === "number" ? Math.min(width * 0.3, 32) : 32;

  return (
    <View style={containerStyle}>
      <DiagonalStripes />
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
      <DiagonalStripes />
      <ImageOff
        size={40}
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
  const iconSize = Math.max(size * 0.4, 16);
  
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
      <DiagonalStripes />
      <ImageOff
        size={iconSize}
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
