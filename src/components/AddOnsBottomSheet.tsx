import React, { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Package } from "lucide-react-native";
import {
  colors,
  typography,
  spacing,
  borderRadius,
  components,
  segmentedControl,
} from "@/lib/design-tokens";
import type { AddOnCategory, AddOnItem } from "@/lib/types";

export interface AddOnsBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  addOns: AddOnItem[];
  onPressItem: (item: AddOnItem) => void;
}

const TAB_ORDER: AddOnCategory[] = ["outerwear", "bags", "accessories"];
const TAB_LABELS: Record<AddOnCategory, string> = {
  outerwear: "Layers",
  bags: "Bags",
  accessories: "Accessories",
};

function getAddOnLabel(item: AddOnItem): string {
  const detectedLabel = item.detectedLabel?.trim();
  if (detectedLabel) {
    return detectedLabel;
  }
  if (item.colors?.[0]?.name) {
    return `${item.colors[0].name} ${TAB_LABELS[item.category].toLowerCase()}`;
  }
  return `${TAB_LABELS[item.category]} add-on`;
}

export function AddOnsBottomSheet({
  visible,
  onClose,
  addOns,
  onPressItem,
}: AddOnsBottomSheetProps) {
  const insets = useSafeAreaInsets();

  const visibleTabs = useMemo(
    () => TAB_ORDER.filter((cat) => addOns.some((item) => item.category === cat)),
    [addOns]
  );

  const [activeTab, setActiveTab] = useState<AddOnCategory | null>(visibleTabs[0] ?? null);

  useEffect(() => {
    if (visible) {
      setActiveTab(visibleTabs[0] ?? null);
    }
  }, [visible, visibleTabs]);

  const activeItems = useMemo(() => {
    if (!activeTab) return [];
    return addOns.filter((item) => item.category === activeTab);
  }, [addOns, activeTab]);

  if (!visible) {
    return null;
  }

  if (visibleTabs.length === 0) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay.dark }} onPress={onClose} />
      <View
        style={{
          backgroundColor: colors.bg.primary,
          borderTopLeftRadius: borderRadius.xl,
          borderTopRightRadius: borderRadius.xl,
          paddingBottom: insets.bottom + spacing.lg,
        }}
      >
        <View style={{ alignItems: "center", paddingTop: spacing.md, paddingBottom: spacing.sm }}>
          <View
            style={{
              width: spacing.xxl,
              height: spacing.xs,
              borderRadius: borderRadius.pill,
              backgroundColor: colors.border.subtle,
            }}
          />
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.md,
          }}
        >
          <Text style={{ ...typography.ui.sectionTitle, color: colors.text.primary, flex: 1 }}>
            Add-ons
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close add-ons"
            accessibilityHint="Closes the add-ons sheet"
          >
            <X size={20} color={colors.text.primary} />
          </Pressable>
        </View>

        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.md,
            gap: spacing.sm,
          }}
        >
          {visibleTabs.map((tab) => {
            const isActive = tab === activeTab;
            return (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                accessibilityRole="button"
                accessibilityLabel={`Show ${TAB_LABELS[tab]}`}
                style={{
                  backgroundColor: isActive
                    ? segmentedControl.selected.backgroundColor
                    : segmentedControl.container.backgroundColor,
                  borderRadius: segmentedControl.segment.borderRadius,
                  paddingHorizontal: segmentedControl.segment.paddingHorizontal,
                  paddingVertical: spacing.sm,
                  borderWidth: isActive ? segmentedControl.selected.borderWidth : 0,
                  borderColor: isActive ? segmentedControl.selected.borderColor : "transparent",
                }}
              >
                <Text
                  style={{
                    ...typography.ui.label,
                    color: isActive ? colors.text.primary : segmentedControl.unselected.textColor,
                  }}
                >
                  {TAB_LABELS[tab]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.lg,
            gap: spacing.sm,
          }}
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {activeItems.map((item) => (
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
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
