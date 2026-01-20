import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet, ViewStyle, ActivityIndicator } from "react-native";
import { Image, ImageStyle } from "expo-image";
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

/**
 * Image component with automatic fallback to placeholder on error
 * Use this instead of raw Image + GridPlaceholderImage pattern
 */
export function ImageWithFallback({
  uri,
  style,
  contentFit = "cover",
}: {
  uri: string | null | undefined;
  style?: ImageStyle;
  contentFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
}) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const prevUriRef = useRef(uri);

  // Reset error and loading state when URI actually changes (e.g., from local to cloud URL after upload)
  useEffect(() => {
    if (uri !== prevUriRef.current) {
      prevUriRef.current = uri;
      setHasError(false);
      setIsLoading(true); // Start loading when URI changes
    }
  }, [uri]);

  if (!uri || hasError) {
    return <GridPlaceholderImage />;
  }

  return (
    <>
      <Image
        source={{ uri }}
        style={[{ width: "100%", height: "100%" }, style]}
        contentFit={contentFit}
        onLoadStart={() => setIsLoading(true)}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
        // Shorter transition (100ms) for snappier feel while still smooth
        // Longer transitions cause visible "blinking" when scrolling lists
        transition={100}
        cachePolicy="memory-disk"
        // recyclingKey helps expo-image manage image recycling in lists
        // Using the URI ensures the same image isn't re-animated when recycled
        recyclingKey={uri}
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
            backgroundColor: colors.bg.elevated,
          }}
        >
          <ActivityIndicator size="small" color={colors.accent.terracotta} />
        </View>
      )}
    </>
  );
}

/**
 * Thumbnail image with automatic fallback to placeholder on error
 */
export function ThumbnailWithFallback({
  uri,
  size,
  borderRadius: customBorderRadius,
  style,
}: {
  uri: string | null | undefined;
  size: number;
  borderRadius?: number;
  style?: ImageStyle;
}) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const prevUriRef = useRef(uri);

  // Reset error and loading state when URI actually changes (e.g., from local to cloud URL after upload)
  useEffect(() => {
    if (uri !== prevUriRef.current) {
      prevUriRef.current = uri;
      setHasError(false);
      setIsLoading(true); // Start loading when URI changes
    }
  }, [uri]);

  if (!uri || hasError) {
    return (
      <ThumbnailPlaceholderImage 
        size={size} 
        borderRadius={customBorderRadius}
        style={style}
      />
    );
  }

  return (
    <View style={{ position: "relative" }}>
      <Image
        source={{ uri }}
        style={[
          { 
            width: size, 
            height: size, 
            borderRadius: customBorderRadius ?? borderRadius.image,
          },
          style,
        ]}
        contentFit="cover"
        onLoadStart={() => setIsLoading(true)}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
        // Shorter transition for snappier feel in lists
        transition={100}
        cachePolicy="memory-disk"
        // recyclingKey helps expo-image manage image recycling in lists
        recyclingKey={uri}
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
            backgroundColor: colors.bg.elevated,
            borderRadius: customBorderRadius ?? borderRadius.image,
          }}
        >
          <ActivityIndicator size="small" color={colors.accent.terracotta} />
        </View>
      )}
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
