import React from "react";
import { View, Text } from "react-native";
import { colors, spacing } from "@/lib/design-tokens";

interface SectionContainerProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Add extra top margin (use between sections) */
  spacingTop?: boolean;
}

/**
 * Section Container (V1 Design System)
 * Pattern:
 *   Title
 *   Supportive subtitle
 *   [ content ]
 *
 * Rules:
 * - Subtitle always lighter (text.secondary)
 * - No borders between title & content
 * - Content starts after 12-16px
 */
export function SectionContainer({
  title,
  subtitle,
  children,
  spacingTop = false,
}: SectionContainerProps) {
  return (
    <View style={{ marginTop: spacingTop ? spacing.lg : 0 }}>
      {/* Title */}
      <Text
        style={{
          fontFamily: "BodoniModa_600SemiBold",
          fontSize: 20,
          color: colors.text.primary,
          lineHeight: 28,
        }}
      >
        {title}
      </Text>

      {/* Subtitle */}
      {subtitle && (
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 15,
            color: colors.text.secondary,
            lineHeight: 21,
            marginTop: spacing.xs,
          }}
        >
          {subtitle}
        </Text>
      )}

      {/* Content */}
      <View style={{ marginTop: spacing.md }}>{children}</View>
    </View>
  );
}
