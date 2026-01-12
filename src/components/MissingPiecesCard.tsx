/**
 * MissingPiecesCard Component
 *
 * Displays a card explaining why outfits can't be formed in a tab.
 * Shows missing categories or a generic message.
 */

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Plus, Shirt, Footprints, ShoppingBag } from "lucide-react-native";
import { Image } from "expo-image";
import { router } from "expo-router";

import type { OutfitEmptyReasonDetails } from "@/lib/useResultsTabs";
import { colors, typography, borderRadius } from "@/lib/design-tokens";

export interface MissingPiecesCardProps {
  /** The reason outfits are empty */
  emptyReason: OutfitEmptyReasonDetails;
  /** Human-readable message */
  message: string | null;
  /** Optional CTA label override */
  ctaLabel?: string;
  /** Animation delay (ms) */
  delay?: number;
  /** Optional callback when CTA is pressed (for analytics) */
  onCtaPress?: (action: "scan" | "add" | "viewWorthTrying", category?: string) => void;
  /** Callback to switch to Worth trying tab (for missingHighTierCorePieces) */
  onViewWorthTrying?: () => void;
}

/**
 * Get icon for a category
 */
function getCategoryIcon(category: string) {
  const iconProps = { size: 20, color: colors.text.tertiary, strokeWidth: 1.5 };

  switch (category) {
    case "shoes":
      return <Footprints {...iconProps} />;
    case "tops":
      return <Shirt {...iconProps} />;
    case "bottoms":
      return <Shirt size={20} color={colors.text.tertiary} style={{ transform: [{ rotate: "90deg" }] }} />;
    case "outerwear":
      return <Shirt size={20} color={colors.text.tertiary} />;
    case "bags":
      return <ShoppingBag {...iconProps} />;
    default:
      return <Plus {...iconProps} />;
  }
}

export function MissingPiecesCard({
  emptyReason,
  message,
  ctaLabel,
  delay = 200,
  onCtaPress,
  onViewWorthTrying,
}: MissingPiecesCardProps) {
  const handleAddItem = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCtaPress?.("add");
    router.push("/add-item");
  };

  const handleScanAnother = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCtaPress?.("scan");
    router.push("/scan");
  };

  const handleViewWorthTrying = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCtaPress?.("viewWorthTrying");
    onViewWorthTrying?.();
  };

  // Determine what to show based on empty reason
  const isMissingPieces = emptyReason.kind === "missingCorePieces";
  const isMissingHighTier = emptyReason.kind === "missingHighTierCorePieces";
  const hasItemsNoMatch = emptyReason.kind === "hasItemsButNoMatches";
  
  // Only show chips for truly missing pieces (not for "has items but no match")
  const missingCategories = isMissingPieces ? emptyReason.missing : [];
  
  // Extract blocking/weak categories for hasItemsButNoMatches
  const blockingCategories = hasItemsNoMatch ? emptyReason.blockingCategories : [];
  const weakCategories = hasItemsNoMatch ? emptyReason.weakCategories : [];

  // Default message if none provided
  const displayMessage = message ?? "No outfit combinations found yet.";

  // Title based on reason
  const title = isMissingHighTier
    ? "Not quite 'wear now' yet"
    : hasItemsNoMatch
      ? "No style matches found"
      : "Can't build outfits yet";

  // CTA label and handler based on reason type
  // For hasItemsButNoMatches: "Scan another item" (items exist, don't blame inventory)
  const buttonLabel = ctaLabel ?? (
    isMissingHighTier
      ? "View worth trying outfits"
      : hasItemsNoMatch
        ? "Scan another item"
        : "Add to wardrobe"
  );

  const handlePrimaryAction = isMissingHighTier
    ? handleViewWorthTrying
    : hasItemsNoMatch
      ? handleScanAnother
      : handleAddItem;

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify()}
      style={styles.container}
    >
      {/* Title */}
      <Text style={styles.title}>{title}</Text>

      {/* Message */}
      <Text style={styles.message}>{displayMessage}</Text>

      {/* Missing categories chips (only for missingCorePieces) */}
      {isMissingPieces && missingCategories.length > 0 && (
        <View style={styles.chipsContainer}>
          {missingCategories.map((missing, index) => (
            <View key={`${missing.slot}-${index}`} style={styles.chip}>
              {getCategoryIcon(missing.category)}
              <Text style={styles.chipText}>
                {missing.category.charAt(0).toUpperCase() + missing.category.slice(1)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* CTA Button */}
      <Pressable
        onPress={handlePrimaryAction}
        style={({ pressed }) => [
          styles.ctaButton,
          pressed && styles.ctaButtonPressed,
        ]}
      >
        <Text style={styles.ctaText}>
          {buttonLabel}
        </Text>
      </Pressable>

      {/* Dev warnings */}
      {__DEV__ && emptyReason.kind === "hasCorePiecesButNoCombos" && (
        <Text style={styles.devWarning}>
          ⚠️ DEV: Has core pieces but no combos formed
        </Text>
      )}
      {__DEV__ && emptyReason.kind === "hasItemsButNoMatches" && (
        <Text style={styles.devWarning}>
          ⚠️ DEV: blocking=[{blockingCategories.join(", ")}] weak=[{weakCategories.join(", ")}]
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg.tertiary,
    borderRadius: borderRadius.card,
    padding: 20,
    alignItems: "center",
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: colors.text.secondary,
    marginBottom: 8,
  },
  message: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 16,
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.state.pressed,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.pill,
    gap: 6,
  },
  chipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: colors.text.secondary,
  },
  ctaButton: {
    backgroundColor: colors.accent.terracottaLight,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.card,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaButtonPressed: {
    opacity: 0.7,
  },
  ctaText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: colors.accent.terracotta,
    lineHeight: 16,
  },
  devWarning: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: colors.accent.terracotta,
    marginTop: 12,
  },
});

// For non-RN environments
declare const __DEV__: boolean;

