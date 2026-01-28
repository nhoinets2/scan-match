import React, { useMemo } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Package, ChevronRight } from "lucide-react-native";
import { colors, typography, spacing, borderRadius, components } from "@/lib/design-tokens";
import { scoreAndSortAddOns } from "@/lib/add-ons-sorting";
import type { AddOnCategory, AddOnItem, PersonalizedSuggestions } from "@/lib/types";

export interface OptionalAddOnsStripProps {
  addOns: AddOnItem[];
  suggestions?: PersonalizedSuggestions | null;
  /** Whether this scan is eligible for AI-aware sorting (HIGH tab + has matches) */
  isEligibleForAiSorting: boolean;
  onOpenViewAll: () => void;
  onPressItem: (item: AddOnItem) => void;
}

function getCategoryLabel(category: AddOnCategory): string {
  if (category === "outerwear") return "Layer";
  if (category === "bags") return "Bag";
  return "Acc";
}

function getAddOnLabel(item: AddOnItem): string {
  const detectedLabel = item.detectedLabel?.trim();
  if (detectedLabel) {
    return detectedLabel;
  }
  if (item.colors?.[0]?.name) {
    return `${item.colors[0].name} ${getCategoryLabel(item.category)}`;
  }
  return `${getCategoryLabel(item.category)} add-on`;
}

function CategoryBadge({ category }: { category: AddOnCategory }) {
  return (
    <View
      style={{
        position: "absolute",
        top: 4,
        left: 4,
        backgroundColor: "rgba(0, 0, 0, 0.35)",
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 6,
      }}
    >
      <Text
        style={{
          fontFamily: typography.fontFamily.medium,
          fontSize: 9,
          color: "rgba(255, 255, 255, 0.95)",
          letterSpacing: 0.3,
        }}
      >
        {getCategoryLabel(category)}
      </Text>
    </View>
  );
}

export function OptionalAddOnsStrip({
  addOns,
  suggestions,
  isEligibleForAiSorting,
  onOpenViewAll,
  onPressItem,
}: OptionalAddOnsStripProps) {
  const sortedAddOns = useMemo(
    () => scoreAndSortAddOns(addOns, suggestions?.to_elevate),
    [addOns, suggestions?.to_elevate]
  );

  // Title is stable based on eligibility, not AI readiness
  // On HIGH tab with matches: show "Suggested add-ons" (AI will improve sorting when ready)
  // Otherwise: show "Finish the look"
  const title = isEligibleForAiSorting ? "Suggested add-ons" : "Finish the look";

  const showViewAll = useMemo(() => {
    if (addOns.length === 0) return false;
    if (addOns.length > 6) return true;
    const counts: Record<AddOnCategory, number> = {
      outerwear: 0,
      bags: 0,
      accessories: 0,
    };
    addOns.forEach((item) => {
      counts[item.category] += 1;
    });
    const nonEmpty = Object.values(counts).filter((count) => count > 0);
    if (nonEmpty.length > 1) return true;
    if (nonEmpty.length > 0 && Math.max(...nonEmpty) > 4) return true;
    return false;
  }, [addOns]);

  if (addOns.length === 0) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeInDown.delay(325)}
      style={{ marginBottom: spacing.lg, marginTop: spacing.xs / 2 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: spacing.sm,
          paddingHorizontal: spacing.xs,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              ...typography.ui.sectionTitle,
              color: colors.text.primary,
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              ...typography.ui.caption,
              color: colors.text.secondary,
              marginTop: spacing.xs / 2,
            }}
          >
            From your wardrobe
          </Text>
        </View>
        {showViewAll && (
          <Pressable
            onPress={onOpenViewAll}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs,
              marginTop: spacing.xs / 2,
            }}
          >
            <Text
              style={{
                ...typography.ui.label,
                color: colors.text.tertiary,
              }}
            >
              View all ({addOns.length})
            </Text>
            <ChevronRight size={14} color={colors.text.tertiary} strokeWidth={1.5} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{
          paddingHorizontal: spacing.xs,
          gap: spacing.sm + spacing.xs / 2,
        }}
      >
        {sortedAddOns.slice(0, 6).map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onPressItem(item)}
            accessibilityRole="button"
            accessibilityLabel={getAddOnLabel(item)}
            accessibilityHint="Opens a larger preview"
            style={{
              width: components.wardrobeItem.imageSize,
              height: components.wardrobeItem.imageSize,
              borderRadius: components.wardrobeItem.imageBorderRadius,
              borderWidth: 1,
              borderColor: colors.border.hairline,
              backgroundColor: colors.bg.tertiary,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {item.imageUri ? (
              <Image
                source={{ uri: item.imageUri }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <Package size={24} color={colors.text.tertiary} />
            )}
            <CategoryBadge category={item.category} />
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}
