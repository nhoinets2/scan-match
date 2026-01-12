import React from "react";
import { View, Text } from "react-native";
import { colors, spacing, components, borderRadius } from "@/lib/design-tokens";
import type { Category } from "@/lib/types";

interface HelpfulAdditionCardProps {
  category: Category | string;
  suggestion: string;
  explanation?: string;
}

function formatCategory(category: Category | string): string {
  // Capitalize first letter
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Helpful Addition Card (V1 Design System)
 * Purpose: Gentle suggestions, NOT shopping pressure
 * Rules:
 * - No prices
 * - No CTAs inside card
 * - Background: bg.secondary
 * - Rounded: 12
 */
export function HelpfulAdditionCard({
  category,
  suggestion,
  explanation,
}: HelpfulAdditionCardProps) {
  return (
    <View
      style={{
        backgroundColor: colors.bg.secondary,
        borderRadius: borderRadius.card,
        padding: spacing.md,
        gap: spacing.xs,
      }}
    >
      {/* Category */}
      <Text
        style={{
          fontFamily: "Inter_600SemiBold",
          fontSize: 14,
          color: colors.text.primary,
        }}
      >
        {formatCategory(category)}
      </Text>

      {/* Suggestion */}
      <Text
        style={{
          fontFamily: "Inter_400Regular",
          fontSize: 15,
          color: colors.text.secondary,
          lineHeight: 21,
        }}
      >
        {suggestion}
      </Text>

      {/* Optional Explanation */}
      {explanation && (
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 13,
            color: colors.text.tertiary,
            lineHeight: 18,
            marginTop: spacing.xs,
          }}
        >
          {explanation}
        </Text>
      )}
    </View>
  );
}
