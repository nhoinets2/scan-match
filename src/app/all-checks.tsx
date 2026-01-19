import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  Modal,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ArrowLeft, Clock, CloudUpload, RefreshCw, WifiOff, AlertCircle } from "lucide-react-native";
import { ImageWithFallback } from "@/components/PlaceholderImage";

import { useRecentChecks, useRemoveRecentCheck, useWardrobe, SCAN_RETENTION } from "@/lib/database";
import { hasPendingUpload, isUploadFailed } from "@/lib/storage";
import { colors, typography, spacing, borderRadius, cards, shadows, button } from "@/lib/design-tokens";
import { getTextStyle } from "@/lib/typography-helpers";
import { OutcomeState, RecentCheck } from "@/lib/types";
import { calculateMatchCountsForChecks } from "@/lib/useMatchCount";
import { ButtonSecondary } from "@/components/ButtonSecondary";
import { ButtonPrimary } from "@/components/ButtonPrimary";
import { ButtonTertiary } from "@/components/ButtonTertiary";

// Helper to get status display info
function getStatusDisplay(outcome: OutcomeState): { label: string; isSaved: boolean } {
  if (outcome === "saved_to_revisit") {
    return { label: "Saved", isSaved: true };
  }
  return { label: "Scanned", isSaved: false };
}

// Grid tile for checks (matches Recent Scans style)
const CheckGridItem = React.memo(function CheckGridItem({
  check,
  index,
  onPress,
  onLongPress,
  tileSize,
  matchCount,
}: {
  check: RecentCheck;
  index: number;
  onPress: (check: RecentCheck) => void;
  onLongPress: (check: RecentCheck) => void;
  tileSize: number;
  matchCount: string | null;
}) {
  const statusDisplay = getStatusDisplay(check.outcome);
  
  // Cache sync status to avoid duplicate function calls
  const isPending = hasPendingUpload(check.id);
  const isFailed = isUploadFailed(check.id);
  const showSyncStatus = isPending || isFailed;

  return (
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
        <ImageWithFallback uri={check.imageUri} />

        {/* Sync status indicator - based on queue state */}
        {showSyncStatus && (
          <View
            style={{
              position: "absolute",
              top: spacing.sm,
              right: spacing.sm,
              backgroundColor: isFailed ? colors.status.error : colors.overlay.dark,
              borderRadius: borderRadius.pill,
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.sm,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs / 2,
            }}
          >
            {isFailed ? (
              <>
                <RefreshCw size={12} color={colors.text.inverse} strokeWidth={2} />
                <Text style={{ ...typography.ui.caption, color: colors.text.inverse, fontFamily: typography.fontFamily.medium }}>
                  Retry
                </Text>
              </>
            ) : (
              <>
                <CloudUpload size={12} color={colors.text.inverse} strokeWidth={2} />
                <Text style={{ ...typography.ui.caption, color: colors.text.inverse, fontFamily: typography.fontFamily.medium }}>
                  Syncing
                </Text>
              </>
            )}
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
          {/* Status and match count row */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs }}>
            <Text
              style={{
                ...typography.ui.caption,
                color: "rgba(255,255,255,0.85)",
              }}
              numberOfLines={1}
            >
              {statusDisplay.label}
            </Text>
            {matchCount && (
              <View
                style={{
                  backgroundColor: "rgba(255,255,255,0.2)",
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xs / 2 + 1,
                  borderRadius: borderRadius.pill,
                }}
              >
                <Text
                  style={{
                    ...typography.ui.micro,
                    color: colors.text.inverse,
                  }}
                >
                  {matchCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
  );
});

// Delete Confirmation Modal
function DeleteConfirmationModal({
  visible,
  isDeleting,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isDeleting ? undefined : onCancel}
    >
      <Pressable
        onPress={isDeleting ? undefined : onCancel}
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
            You'll lose the outfits and match details with it.
          </Text>

          {/* Buttons */}
          <View style={{ gap: spacing.sm }}>
            {/* Primary destructive */}
            <Pressable
              onPress={onConfirm}
              disabled={isDeleting}
              style={{
                backgroundColor: colors.state.destructive,
                borderRadius: borderRadius.pill,
                height: button.height.primary,
                alignItems: "center",
                justifyContent: "center",
                opacity: isDeleting ? 0.7 : 1,
              }}
            >
              {isDeleting ? (
                <ActivityIndicator color={colors.text.inverse} />
              ) : (
                <Text
                  style={{
                    ...typography.button.primary,
                    color: colors.text.inverse,
                  }}
                >
                  Remove
                </Text>
              )}
            </Pressable>

            {/* Secondary cancel */}
            <ButtonSecondary
              label="Cancel"
              onPress={onCancel}
              disabled={isDeleting}
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
        paddingBottom: 100,
      }}
    >
      <View style={{ alignItems: "center" }}>
        <View style={{
          height: spacing.lg * 2,
          width: spacing.lg * 2,
          borderRadius: spacing.lg,
          backgroundColor: colors.surface.icon,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.md,
        }}>
          <Clock size={spacing.lg} color={colors.text.primary} strokeWidth={1.5} />
        </View>
        <Text
          style={{
            ...typography.ui.cardTitle,
            color: colors.text.secondary,
            marginBottom: spacing.xs,
            textAlign: "center",
          }}
        >
          No scans yet
        </Text>
        <Text
          style={{
            ...typography.ui.caption,
            color: colors.text.secondary,
            textAlign: "center",
          }}
        >
          Scan items while you shop to see{"\n"}how they work with your wardrobe.
        </Text>
      </View>
    </Animated.View>
  );
}
export default function AllChecksScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data: recentChecks = [], refetch, isFetching } = useRecentChecks();
  const { data: wardrobe = [] } = useWardrobe();
  const removeRecentCheckMutation = useRemoveRecentCheck();
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Pull-to-refresh handler with minimum delay for visual feedback
  const onRefresh = useCallback(async () => {
    if (__DEV__) console.log('[AllChecks] Pull-to-refresh triggered');
    setIsRefreshing(true);
    try {
      // Add minimum delay so spinner is visible even if data is cached
      await Promise.all([
        refetch(),
        new Promise(resolve => setTimeout(resolve, 500)),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);
  const [itemToDelete, setItemToDelete] = useState<RecentCheck | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [deleteError, setDeleteError] = useState<'network' | 'other' | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debug: Log image URIs when checks change (helps diagnose cross-device sync issues)
  useEffect(() => {
    if (__DEV__ && recentChecks.length > 0) {
      console.log('[AllChecks] Loaded checks with imageUris:', recentChecks.slice(0, 5).map(c => ({
        id: c.id.slice(0, 8),
        outcome: c.outcome,
        imageUri: c.imageUri?.slice(0, 60) + (c.imageUri?.length > 60 ? '...' : ''),
        isCloud: c.imageUri?.startsWith('http'),
        isLocal: c.imageUri?.startsWith('file://'),
      })));
    }
  }, [recentChecks]);
  
  // Memoize tile size calculation - updates on rotation via useWindowDimensions
  const tileSize = useMemo(() => {
    return (width - spacing.md * 2 - spacing.md) / 2;
  }, [width]);
  
  // Pre-calculate match counts for all checks (avoid per-item hook calls)
  // Uses canonical calculateMatchCountsForChecks() - never use debugSnapshot for this!
  const matchCountMap = useMemo(
    () => calculateMatchCountsForChecks(recentChecks, wardrobe),
    [recentChecks, wardrobe]
  );

  // Auto-hide toast after 2 seconds
  useEffect(() => {
    if (showToast) {
      const timeout = setTimeout(() => {
        setShowToast(false);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [showToast]);

  // Show delete confirmation modal
  const handleDeleteRequest = useCallback((check: RecentCheck) => {
    setItemToDelete(check);
  }, []);

  // Confirm delete action
  const handleConfirmDelete = async () => {
    if (!itemToDelete || isDeleting) return;
    
    setIsDeleting(true);
    
    try {
      await removeRecentCheckMutation.mutateAsync({ id: itemToDelete.id, imageUri: itemToDelete.imageUri });
      
      // Success - close modal, show toast
      setItemToDelete(null);
      setIsDeleting(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowToast(true);
    } catch (error) {
      console.error('[Delete] Failed to delete scan:', error);
      setIsDeleting(false);
      // Keep itemToDelete so "Try again" can reopen confirmation
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      
      // Check if it's a network error
      // Note: Supabase errors have .message but aren't Error instances
      const errMessage = (error as any)?.message || (error instanceof Error ? error.message : String(error || ""));
      const errLower = errMessage.toLowerCase();
      const isNetworkErr =
        errMessage.includes("Network request failed") ||
        errMessage.includes("The Internet connection appears to be offline") ||
        errMessage.includes("The network connection was lost") ||
        errMessage.includes("Unable to resolve host") ||
        errMessage.includes("Failed to fetch") ||
        errMessage.includes("fetch failed") ||
        errMessage.includes("ENOTFOUND") ||
        errMessage.includes("ECONNREFUSED") ||
        errMessage.includes("Could not connect to the server") ||
        errMessage.includes("A server with the specified hostname could not be found") ||
        errMessage.includes("A data connection is not currently allowed") ||
        errMessage.includes("not connected to the internet") ||
        errLower.includes("offline") ||
        errLower.includes("no internet") ||
        errLower.includes("network error") ||
        errLower.includes("network is unreachable") ||
        errLower.includes("socket is not connected") ||
        errLower.includes("timed out");

      console.log("[AllChecks] Delete error:", errMessage, "isNetwork:", isNetworkErr);
      setDeleteError(isNetworkErr ? 'network' : 'other');
    }
  };

  // Cancel delete action
  const handleCancelDelete = () => {
    setItemToDelete(null);
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleCheckPress = useCallback((check: RecentCheck) => {
    // Navigate to saved result screen
    router.push({
      pathname: "/results",
      params: { checkId: check.id },
    });
  }, []);
  
  // Memoized renderItem for FlatList performance
  const renderItem = useCallback(
    ({ item, index }: { item: RecentCheck; index: number }) => (
      <CheckGridItem
        check={item}
        index={index}
        onPress={handleCheckPress}
        onLongPress={handleDeleteRequest}
        tileSize={tileSize}
        matchCount={matchCountMap[item.id]}
      />
    ),
    [tileSize, handleCheckPress, handleDeleteRequest, matchCountMap]
  );

  // getItemLayout for FlatList scroll performance optimization
  // Each row contains 2 items, row height = tileSize + marginBottom (spacing.md)
  const getItemLayout = useCallback(
    (_data: ArrayLike<RecentCheck> | null | undefined, index: number) => {
      const rowHeight = tileSize + spacing.md;
      const rowIndex = Math.floor(index / 2); // 2 columns
      return {
        length: tileSize,
        offset: rowIndex * rowHeight,
        index,
      };
    },
    [tileSize]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: insets.top + spacing.md,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable
            onPress={handleBack}
            style={{
              height: spacing.xxl + spacing.sm,
              width: spacing.xxl + spacing.sm,
              borderRadius: borderRadius.pill,
              backgroundColor: colors.surface.icon,
              alignItems: "center",
              justifyContent: "center",
              marginRight: spacing.md,
            }}
          >
            <ArrowLeft size={20} color={colors.text.primary} />
          </Pressable>
          <Text
            style={{
              ...getTextStyle("h1", colors.text.primary),
              letterSpacing: 0.3,
              flex: 1,
            }}
          >
            All scans
          </Text>
        </View>
      </View>

      {/* Grid */}
      {recentChecks.length > 0 ? (
        <FlatList
          key={`checks-${Math.round(tileSize)}`} // Re-layout cleanly on rotation/width change
          data={recentChecks}
          numColumns={2}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          showsVerticalScrollIndicator
          indicatorStyle="black"
          contentContainerStyle={{
            paddingHorizontal: spacing.md,
            paddingTop: spacing.lg,
            paddingBottom: 100,
          }}
          columnWrapperStyle={{ justifyContent: "space-between", marginBottom: spacing.md }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing || isFetching}
              onRefresh={onRefresh}
              tintColor={colors.text.secondary}
            />
          }
          // Performance optimizations
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={true}
          scrollEventThrottle={16} // 60fps scroll events
          ListFooterComponent={
            <Animated.View 
              entering={FadeIn.delay(600)}
              style={{ 
                marginTop: spacing.lg,
                paddingHorizontal: spacing.sm,
              }}
            >
              <Text
                style={{
                  ...typography.ui.caption,
                  color: colors.text.tertiary,
                  textAlign: "center",
                }}
              >
                Unsaved scans are automatically removed after {SCAN_RETENTION.TTL_DAYS} days.
              </Text>
            </Animated.View>
          }
        />
      ) : (
        <EmptyState />
      )}

      {/* Delete Confirmation Modal - hide when error modal is showing */}
      <DeleteConfirmationModal
        visible={!!itemToDelete && deleteError === null}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* Success Toast */}
      <SuccessToast
        visible={showToast}
        message="Removed from All scans"
      />

      {/* Delete error modal */}
      <Modal
        visible={deleteError !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteError(null)}
      >
        <Pressable 
          style={{ 
            flex: 1, 
            backgroundColor: colors.overlay.dark, 
            justifyContent: "center", 
            alignItems: "center",
            padding: spacing.lg,
          }}
          onPress={() => setDeleteError(null)}
        >
          <Pressable 
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: cards.elevated.backgroundColor,
              borderRadius: cards.elevated.borderRadius,
              padding: spacing.lg,
              width: "100%",
              maxWidth: 340,
              alignItems: "center",
              ...shadows.lg,
            }}
          >
            {/* Icon */}
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: colors.verdict.okay.bg,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing.md,
              }}
            >
              {deleteError === 'network' ? (
                <WifiOff size={28} color={colors.verdict.okay.text} strokeWidth={2} />
              ) : (
                <AlertCircle size={28} color={colors.verdict.okay.text} strokeWidth={2} />
              )}
            </View>

            {/* Title */}
            <Text
              style={{
                ...typography.ui.cardTitle,
                textAlign: "center",
                marginBottom: spacing.sm,
              }}
            >
              {deleteError === 'network' ? 'Connection unavailable' : "Couldn't remove scan"}
            </Text>

            {/* Subtitle */}
            <Text
              style={{
                ...typography.ui.body,
                color: colors.text.secondary,
                textAlign: "center",
                marginBottom: spacing.xl,
              }}
            >
              {deleteError === 'network'
                ? 'Please check your internet and try again.'
                : 'Please try again in a moment.'}
            </Text>

            {/* Buttons */}
            <View style={{ gap: spacing.sm, width: "100%" }}>
              <ButtonPrimary
                label="Try again"
                onPress={() => setDeleteError(null)}
              />
              <ButtonTertiary
                label="Close"
                onPress={() => {
                  setDeleteError(null);
                  setItemToDelete(null);
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
