/**
 * FavoriteStoresModal
 *
 * Modal for selecting favorite stores for future shopping suggestions.
 * Shows a chip grid with multi-select (max 5 stores).
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { borderRadius, colors, spacing, typography, button } from "@/lib/design-tokens";
import { ButtonPrimary } from "@/components/ButtonPrimary";
import {
  STORE_CATALOG,
  MAX_FAVORITE_STORES,
  getStoreLabel,
} from "@/lib/store-preferences";
import {
  trackStorePrefModalOpened,
  trackStorePrefStoreSelected,
  trackStorePrefStoreRemoved,
  trackStorePrefSaved,
  trackStorePrefDismissed,
} from "@/lib/analytics";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_PADDING = 20;
const GRID_GAP = 10;
// Flexible chip width: min for short names, max for long names
const CHIP_MIN_WIDTH = 100;
const CHIP_MAX_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2; // Max 2 chips per row

export interface FavoriteStoresModalProps {
  /** Whether modal is visible */
  visible: boolean;
  /** Current saved store IDs (for initial state) */
  savedStores: string[];
  /** Callback when modal is closed without saving */
  onClose: () => void;
  /** Callback when stores are saved (returns store IDs) */
  onSave: (storeIds: string[]) => void;
}

export function FavoriteStoresModal({
  visible,
  savedStores,
  onClose,
  onSave,
}: FavoriteStoresModalProps) {
  const insets = useSafeAreaInsets();
  // Internal state uses store IDs
  const [selectedIds, setSelectedIds] = useState<string[]>(savedStores);
  const [showLimitToast, setShowLimitToast] = useState(false);

  // Reset selection when modal opens + track analytics
  useEffect(() => {
    if (visible) {
      setSelectedIds(savedStores);
      setShowLimitToast(false);
      trackStorePrefModalOpened({ existingStoreCount: savedStores.length });
    }
  }, [visible, savedStores]);

  const toggleStore = (storeId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const storeName = getStoreLabel(storeId);
    
    if (selectedIds.includes(storeId)) {
      // Deselect
      const newSelection = selectedIds.filter((id) => id !== storeId);
      setSelectedIds(newSelection);
      setShowLimitToast(false);
      trackStorePrefStoreRemoved({ storeName, selectionCount: newSelection.length });
    } else {
      // Select
      if (selectedIds.length >= MAX_FAVORITE_STORES) {
        // Show limit toast
        setShowLimitToast(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setTimeout(() => setShowLimitToast(false), 2000);
        return;
      }
      const newSelection = [...selectedIds, storeId];
      setSelectedIds(newSelection);
      trackStorePrefStoreSelected({ storeName, selectionCount: newSelection.length });
    }
  };

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    trackStorePrefSaved({
      storeCount: selectedIds.length,
      stores: selectedIds.map(id => getStoreLabel(id)),
    });
    onSave(selectedIds);
  };

  // Compare sorted arrays to avoid order changes triggering "hasChanges"
  const hasChanges = (() => {
    if (selectedIds.length !== savedStores.length) return true;
    const sortedSelected = [...selectedIds].sort();
    const sortedSaved = [...savedStores].sort();
    return !sortedSelected.every((id, i) => id === sortedSaved[i]);
  })();

  const handleDismiss = (method: "x" | "backdrop") => {
    trackStorePrefDismissed({ method });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => handleDismiss("x")}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.overlay.dark,
          justifyContent: "flex-end",
        }}
      >
        {/* Tap outside to close */}
        <Pressable
          style={{ flex: 1 }}
          onPress={() => handleDismiss("backdrop")}
        />

        {/* Modal content */}
        <View
          style={{
            backgroundColor: colors.bg.elevated,
            borderTopLeftRadius: borderRadius.card,
            borderTopRightRadius: borderRadius.card,
            paddingBottom: insets.bottom || spacing.lg,
            maxHeight: "85%",
            overflow: "hidden", // Ensures corners are clipped properly
          }}
        >
          {/* Handle bar */}
          <View style={{ alignItems: "center", paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
            <View
              style={{
                width: spacing.xxl,
                height: spacing.xs,
                borderRadius: borderRadius.pill,
                backgroundColor: colors.bg.tertiary,
              }}
            />
          </View>

          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.sm,
            }}
          >
            <Text
              style={{
                ...typography.display.screenTitle,
                color: colors.text.primary,
                flex: 1,
              }}
            >
              Favorite stores (up to {MAX_FAVORITE_STORES})
            </Text>
            <Pressable
              onPress={() => handleDismiss("x")}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Close"
              style={{
                height: spacing.xxl,
                width: spacing.xxl,
                borderRadius: borderRadius.pill,
                backgroundColor: colors.state.pressed,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={20} color={colors.text.primary} strokeWidth={1.5} />
            </Pressable>
          </View>

          {/* Description */}
          <Text
            style={{
              ...typography.ui.body,
              color: colors.text.secondary,
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.md,
            }}
          >
            Coming soon — we'll use these to tailor shopping suggestions.
          </Text>

          {/* Limit toast */}
          {showLimitToast && (
            <Animated.View
              entering={FadeIn.duration(150)}
              exiting={FadeOut.duration(150)}
              style={{
                position: "absolute",
                top: 100,
                left: spacing.lg,
                right: spacing.lg,
                backgroundColor: button.primary.backgroundColor,
              borderRadius: borderRadius.image,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              zIndex: 100,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  ...typography.ui.bodyMedium,
                  color: colors.text.inverse,
                }}
              >
                Up to {MAX_FAVORITE_STORES} stores.
              </Text>
            </Animated.View>
          )}

          {/* Chip grid */}
          <ScrollView
            style={{ maxHeight: 350 }}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.lg,
            }}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: GRID_GAP,
              }}
            >
              {STORE_CATALOG.map((store) => {
                const isSelected = selectedIds.includes(store.id);
                return (
                  <Pressable
                    key={store.id}
                    onPress={() => toggleStore(store.id)}
                    style={{
                      minWidth: CHIP_MIN_WIDTH,
                    maxWidth: CHIP_MAX_WIDTH,
                    paddingVertical: spacing.sm + spacing.xs / 2,
                    paddingHorizontal: spacing.md + spacing.xs / 2,
                    borderRadius: borderRadius.image,
                      borderWidth: 0.5,
                      borderColor: isSelected
                        ? colors.accent.terracottaLight
                        : colors.border.hairline,
                      backgroundColor: isSelected
                        ? colors.accent.terracottaLight
                        : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        ...typography.ui.label,
                        color: isSelected
                          ? colors.text.primary
                          : colors.text.secondary,
                        textAlign: "center",
                      }}
                    >
                      {store.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Selection count + Save button */}
          <View
            style={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              borderTopWidth: 1,
              borderTopColor: colors.border.hairline,
            }}
          >
            {/* Selection counter */}
            <Text
              style={{
                ...typography.ui.label,
                color: colors.text.secondary,
                textAlign: "center",
                marginBottom: spacing.md - spacing.xs,
              }}
            >
              {selectedIds.length} of {MAX_FAVORITE_STORES} selected
            </Text>

            {/* Save button */}
            <ButtonPrimary
              label="Save"
              onPress={handleSave}
              disabled={!hasChanges}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

