import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { ImageOff } from "lucide-react-native";
import Svg, { Line, Defs, Pattern, Rect } from "react-native-svg";
import { colors, borderRadius } from "@/lib/design-tokens";

/**
 * Diagonal stripe pattern background
 */
function DiagonalStripes({ color = colors.border.subtle }: { color?: string }) {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <Pattern
          id="diagonalStripes"
          patternUnits="userSpaceOnUse"
          width="8"
          height="8"
          patternTransform="rotate(45)"
        >
          <Line
            x1="0"
            y1="0"
            x2="0"
            y2="8"
            stroke={color}
            strokeWidth="1"
          />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#diagonalStripes)" />
    </Svg>
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
