import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  Modal,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Shirt, Bookmark } from "lucide-react-native";

import { useRecentChecks, useRemoveRecentCheck, useWardrobe } from "@/lib/database";
import { colors, spacing, typography, borderRadius, cards, shadows, button } from "@/lib/design-tokens";
import { getTextStyle } from "@/lib/typography-helpers";
import { RecentCheck } from "@/lib/types";
import { ButtonSecondary } from "@/components/ButtonSecondary";
import { useMatchCount } from "@/lib/useMatchCount";

// Grid tile for saved checks (matches Recent Scans / Wardrobe grid style)
function SavedCheckGridItem({
  check,
  index,
  onPress,
  onLongPress,
  tileSize,
}: {
  check: RecentCheck;
  index: number;
  onPress: (check: RecentCheck) => void;
  onLongPress: (check: RecentCheck) => void;
  tileSize: number;
}) {
  // Get current wardrobe and calculate match count
  const { data: wardrobe = [] } = useWardrobe();
  const matchCount = useMatchCount(check, wardrobe);
  return (
    <Animated.View
      entering={FadeInDown.delay(300 + index * 50).springify()}
      exiting={FadeOut.duration(150)}
    >
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress(check);
        }}
        onLongPress={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          onLongPress(check);
        }}
        delayLongPress={400}
        style={{
          width: tileSize,
          aspectRatio: 1,
          position: "relative",
          // V3: cards.standard = border-first
          backgroundColor: cards.standard.backgroundColor,
          borderRadius: cards.standard.borderRadius,
          borderWidth: cards.standard.borderWidth,
          borderColor: cards.standard.borderColor,
          overflow: "hidden",
        }}
      >
        {/* Image */}
        {check.imageUri ? (
          <Image
            source={{ uri: check.imageUri }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: colors.accent.terracottaLight,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Shirt size={48} color={colors.accent.terracotta} strokeWidth={1.5} />
          </View>
        )}

        {/* Gradient overlay */}
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.7)"]}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "50%",
          }}
        />

        {/* Content overlay */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: spacing.md,
          }}
        >
          {/* Item name */}
          <Text
            style={{
              ...typography.ui.cardTitle,
              color: colors.text.inverse,
            }}
            numberOfLines={1}
          >
            {check.itemName}
          </Text>
          {/* Match count */}
          <Text
            style={{
              ...typography.ui.caption,
              color: "rgba(255,255,255,0.7)",
              marginTop: spacing.xs / 2,
            }}
          >
            {matchCount || "0 matches"}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// Delete Confirmation Modal
function DeleteConfirmationModal({
  visible,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable
        onPress={onCancel}
        style={{
          flex: 1,
          backgroundColor: colors.overlay.dark,
          justifyContent: "center",
          alignItems: "center",
          padding: spacing.lg,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            // V3: cards.elevated for modal dialogs
            backgroundColor: cards.elevated.backgroundColor,
            borderRadius: cards.elevated.borderRadius,
            padding: spacing.lg,
            width: "100%",
            maxWidth: 340,
            ...shadows.lg,
          }}
        >
          {/* Title */}
          <Text
            style={{
              ...typography.ui.cardTitle,
              textAlign: "center",
              marginBottom: spacing.sm,
            }}
          >
            Remove this scan?
          </Text>

          {/* Body */}
          <Text
            style={{
              ...typography.ui.body,
              color: colors.text.secondary,
              textAlign: "center",
              marginBottom: spacing.xl,
            }}
          >
            You'll lose the outfits and match details saved with it.
          </Text>

          {/* Buttons */}
          <View style={{ gap: spacing.sm }}>
            {/* Primary destructive */}
            <Pressable
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                onConfirm();
              }}
              style={{
                backgroundColor: colors.state.destructive,
                borderRadius: borderRadius.pill,
                height: button.height.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  ...typography.button.primary,
                  color: colors.text.inverse,
                }}
              >
                Remove
              </Text>
            </Pressable>

            {/* Secondary cancel */}
            <ButtonSecondary
              label="Cancel"
              onPress={onCancel}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Success Toast Component
function SuccessToast({
  visible,
  message,
}: {
  visible: boolean;
  message: string;
}) {
  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(300).springify().damping(20)}
      exiting={FadeOut.duration(200)}
      style={{
        position: "absolute",
        bottom: 100,
        left: 24,
        right: 24,
        zIndex: 1000,
      }}
    >
      <View
        style={{
          // V3: Toast styling with shadows
          backgroundColor: button.primary.backgroundColor,
          borderRadius: borderRadius.card,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          alignItems: "center",
          ...shadows.lg,
        }}
      >
        <Text
          style={{
            ...typography.ui.body,
            fontFamily: typography.fontFamily.medium,
            color: colors.text.inverse,
          }}
        >
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

// Empty state
function EmptyState() {
  return (
    <Animated.View 
      entering={FadeIn.delay(400)} 
      style={{ 
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: spacing.lg,
      }}
    >
      <View style={{ alignItems: "center", marginTop: -20 }}>
        <View style={{
          width: 40,
          height: 40,
          borderRadius: borderRadius.card,
          backgroundColor: colors.surface.icon,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.md,
        }}>
          <Bookmark size={20} color={colors.text.primary} strokeWidth={1.5} />
        </View>
        <Text
          style={{
            ...typography.ui.cardTitle,
            color: colors.text.secondary,
            marginBottom: spacing.xs,
            textAlign: "center",
          }}
        >
          Nothing saved yet
        </Text>
        <Text
          style={{
            ...typography.ui.caption,
            color: colors.text.secondary,
            textAlign: "center",
          }}
        >
          Save scans you want to revisit later.
        </Text>
      </View>
    </Animated.View>
  );
}

export default function SavedChecksScreen() {
  const insets = useSafeAreaInsets();
  const { data: recentChecks = [] } = useRecentChecks();
  const removeRecentCheckMutation = useRemoveRecentCheck();
  const [itemToDelete, setItemToDelete] = useState<RecentCheck | null>(null);
  const [showToast, setShowToast] = useState(false);

  // Auto-hide toast after 2 seconds
  useEffect(() => {
    if (showToast) {
      const timeout = setTimeout(() => {
        setShowToast(false);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [showToast]);

  // Filter to show only saved checks (outcome = "saved_to_revisit")
  const savedChecks = recentChecks.filter(
    (check: RecentCheck) => check.outcome === "saved_to_revisit"
  );

  // Show delete confirmation modal
  const handleDeleteRequest = (check: RecentCheck) => {
    setItemToDelete(check);
  };

  // Confirm delete action
  const handleConfirmDelete = () => {
    if (!itemToDelete) return;
    removeRecentCheckMutation.mutate(itemToDelete.id);
    setItemToDelete(null);
    setShowToast(true);
  };

  // Cancel delete action
  const handleCancelDelete = () => {
    setItemToDelete(null);
  };

  const handleCheckPress = (check: RecentCheck) => {
    // Navigate to saved result screen with checkId
    router.push({
      pathname: "/results",
      params: { checkId: check.id, from: "saved-checks" },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: insets.top + spacing.md,
        }}
      >
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Text
            style={[getTextStyle("h1", colors.text.primary), { letterSpacing: 0.3 }]}
          >
            Saved
          </Text>
        </Animated.View>
      </View>

      {/* Grid */}
      {savedChecks.length > 0 ? (
        <ScrollView
          showsVerticalScrollIndicator={true}
          indicatorStyle="black"
          contentContainerStyle={{
            paddingHorizontal: spacing.md,
            paddingTop: spacing.lg,
            paddingBottom: 100,
          }}
        >
          {/* 2-column grid */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
            {savedChecks.map((check: RecentCheck, index: number) => {
              // Calculate tile size for 2-column grid with spacing.md padding on each side and spacing.md gap
              const screenWidth = Dimensions.get("window").width;
              const tileSize = (screenWidth - spacing.md * 2 - spacing.md) / 2;
              
              return (
                <SavedCheckGridItem
                  key={check.id}
                  check={check}
                  index={index}
                  onPress={handleCheckPress}
                  onLongPress={handleDeleteRequest}
                  tileSize={tileSize}
                />
              );
            })}
          </View>
        </ScrollView>
      ) : (
        <EmptyState />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        visible={!!itemToDelete}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* Success Toast */}
      <SuccessToast
        visible={showToast}
        message="Removed from Saved"
      />
    </View>
  );
}
