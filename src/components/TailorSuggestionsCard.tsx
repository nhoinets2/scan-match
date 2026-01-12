/**
 * TailorSuggestionsCard Component
 *
 * Bottom section shown on both tabs to let users pick favorite stores.
 * Part of the "Store picks coming soon" feature.
 *
 * Clean, minimal design:
 * - No card border or icon
 * - Center-aligned content
 * - Dynamic status bar: "Coming soon • [stores] • [Action →]"
 */

import React from "react";
import { View, Text, Pressable } from "react-native";
import * as Haptics from "expo-haptics";

import { getStoreLabel } from "@/lib/store-preferences";
import { borderRadius, colors } from "@/lib/design-tokens";

export interface TailorSuggestionsCardProps {
  /** User's saved favorite stores (IDs) */
  favoriteStores: string[];
  /** Whether to show "New" indicator (first time seeing card) */
  showNewIndicator?: boolean;
  /** Callback when card is tapped */
  onPress: () => void;
}

/**
 * Formats store names for status bar display
 * Examples:
 * - [zara] → "Zara"
 * - [zara, hm] → "Zara, H&M"
 * - [zara, hm, cos] → "Zara, H&M, COS"
 * - [zara, hm, cos, uniqlo] → "Zara, H&M, COS +1"
 * - [zara, hm, cos, uniqlo, nike] → "Zara, H&M, COS +2"
 */
function formatStoreList(storeIds: string[]): string {
  if (storeIds.length === 0) return "";
  
  const labels = storeIds.map(id => getStoreLabel(id));
  const displayCount = 3;
  const displayed = labels.slice(0, displayCount);
  const remaining = labels.length - displayCount;
  
  let result = displayed.join(", ");
  if (remaining > 0) {
    result += ` +${remaining}`;
  }
  
  return result;
}

export function TailorSuggestionsCard({
  favoriteStores,
  showNewIndicator = false,
  onPress,
}: TailorSuggestionsCardProps) {
  const hasSavedStores = favoriteStores.length > 0;
  const storeList = formatStoreList(favoriteStores);
  
  // Build accessibility label
  const accessibilityLabel = hasSavedStores
    ? `Tailor suggestions. Coming soon. ${favoriteStores.length} stores selected: ${storeList}. Tap to edit.`
    : `Tailor suggestions. Coming soon. Tap to save preferences.`;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{
        backgroundColor: "rgba(255,255,255,0.5)",
        borderRadius: borderRadius.card,
        paddingVertical: 20,
        paddingHorizontal: 16,
        alignItems: "center",
      }}
    >
      {/* Heading */}
      <Text
        style={{
          fontFamily: "Inter_600SemiBold",
          fontSize: 14,
          color: colors.text.primary,
          textAlign: "center",
          marginBottom: 8,
        }}
      >
        Looking for something specific?
      </Text>

      {/* Secondary text with optional "New" dot */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 13,
            color: colors.text.secondary,
            textAlign: "center",
          }}
        >
          Tailor suggestions
        </Text>
        {showNewIndicator && (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: borderRadius.pill,
              backgroundColor: colors.accent.terracotta,
              marginLeft: 6,
            }}
          />
        )}
      </View>

      {/* Status bar: "Coming soon • [stores] • [Action →]" */}
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        {/* "Coming soon" */}
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 13,
            color: colors.text.secondary,
          }}
        >
          Coming soon
        </Text>

        {/* Bullet separator */}
        <Text style={{ fontSize: 13, color: colors.text.secondary, marginHorizontal: 8 }}>•</Text>

        {/* Store list (if any) */}
        {hasSavedStores && (
          <>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                color: colors.text.secondary,
              }}
            >
              {storeList}
            </Text>
            {/* Bullet separator */}
            <Text style={{ fontSize: 13, color: colors.text.secondary, marginHorizontal: 8 }}>•</Text>
          </>
        )}

        {/* Action button */}
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 13,
            color: colors.accent.terracotta,
          }}
        >
          {hasSavedStores ? "Edit →" : "Save preferences →"}
        </Text>
      </View>
    </Pressable>
  );
}

