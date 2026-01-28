import React, { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { X, Package } from "lucide-react-native";
import {
  colors,
  typography,
  spacing,
  borderRadius,
  components,
  cards,
  shadows,
} from "@/lib/design-tokens";
import type { AddOnCategory, AddOnItem } from "@/lib/types";

export interface AddOnsBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  addOns: AddOnItem[];
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
}: AddOnsBottomSheetProps) {
  const insets = useSafeAreaInsets();
  
  // Internal state for viewing images - no external modal needed
  const [viewingImageUri, setViewingImageUri] = useState<string | null>(null);

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
  
  // Reset viewing state when modal closes
  useEffect(() => {
    if (!visible) {
      setViewingImageUri(null);
    }
  }, [visible]);

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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (viewingImageUri) {
          setViewingImageUri(null);
        } else {
          onClose();
        }
      }}
    >
      {/* Full-screen image viewer - rendered inside the same modal */}
      {viewingImageUri ? (
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.95)",
            justifyContent: "center",
            alignItems: "center",
          }}
          onPress={() => setViewingImageUri(null)}
        >
          <Image
            source={{ uri: viewingImageUri }}
            style={{ width: "100%", height: "80%" }}
            contentFit="contain"
          />
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setViewingImageUri(null);
            }}
            style={{
              position: "absolute",
              top: insets.top + 16,
              right: 16,
              width: 44,
              height: 44,
              borderRadius: borderRadius.pill,
              backgroundColor: "rgba(255, 255, 255, 0.15)",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <X size={24} color="#fff" strokeWidth={2} />
          </Pressable>
        </Pressable>
      ) : (
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: colors.overlay.dark,
            }}
            onPress={(e) => {
              e.stopPropagation();
              onClose();
            }}
          />
          <View
            style={{
              backgroundColor: cards.elevated.backgroundColor,
              borderTopLeftRadius: cards.elevated.borderRadius,
              borderTopRightRadius: cards.elevated.borderRadius,
              paddingBottom: insets.bottom || spacing.lg,
              maxHeight: "85%",
              ...shadows.lg,
              overflow: "hidden",
            }}
          >
            {/* Drag handle - pressable area to close */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              style={{
                alignItems: "center",
                paddingTop: spacing.md,
                paddingBottom: spacing.sm,
                minHeight: 44,
                justifyContent: "center",
              }}
              hitSlop={{ top: 10, bottom: 10, left: 50, right: 50 }}
            >
              <View
                style={{
                  width: spacing.xxl,
                  height: spacing.xs,
                  borderRadius: borderRadius.pill,
                  backgroundColor: colors.bg.tertiary,
                }}
              />
            </Pressable>

            <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
              {/* Header: Title matching other bottom sheets */}
              <Text
                style={{
                  ...typography.display.screenTitle,
                  color: colors.text.primary,
                  marginBottom: spacing.xs,
                }}
              >
                Add-ons
              </Text>
              <Text
                style={{
                  ...typography.ui.caption,
                  color: colors.text.secondary,
                  marginBottom: spacing.md,
                }}
              >
                From your wardrobe
              </Text>
            </View>

            {/* Category filter chips */}
            <View
              style={{
                flexDirection: "row",
                paddingHorizontal: spacing.lg,
                paddingBottom: spacing.md,
                gap: spacing.sm,
                flexWrap: "wrap",
              }}
            >
              {visibleTabs.map((tab) => {
                const isActive = tab === activeTab;
                return (
                  <Pressable
                    key={tab}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setActiveTab(tab);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${TAB_LABELS[tab]}`}
                    style={{
                      paddingVertical: spacing.sm + spacing.xs / 2,
                      paddingHorizontal: spacing.md + spacing.xs / 2,
                      borderRadius: borderRadius.image,
                      borderWidth: 0.5,
                      borderColor: isActive
                        ? colors.accent.terracottaLight
                        : colors.border.hairline,
                      backgroundColor: isActive
                        ? colors.accent.terracottaLight
                        : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        ...typography.ui.label,
                        color: isActive ? colors.text.primary : colors.text.secondary,
                      }}
                    >
                      {TAB_LABELS[tab]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Items grid */}
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
                    onPress={(e) => {
                      e.stopPropagation();
                      if (item.imageUri) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setViewingImageUri(item.imageUri);
                      }
                    }}
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
        </View>
      )}
    </Modal>
  );
}
