import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  Modal,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Bookmark, CloudUpload, RefreshCw, WifiOff, AlertCircle } from "lucide-react-native";
import { ImageWithFallback } from "@/components/PlaceholderImage";

import { useQueryClient } from "@tanstack/react-query";
import { useRecentChecks, useRemoveRecentCheck, useWardrobe } from "@/lib/database";
import { useAuth } from "@/lib/auth-context";
import { colors, spacing, typography, borderRadius, cards, shadows, button } from "@/lib/design-tokens";
import { getTextStyle } from "@/lib/typography-helpers";
import { RecentCheck } from "@/lib/types";
import { ButtonSecondary } from "@/components/ButtonSecondary";
import { ButtonPrimary } from "@/components/ButtonPrimary";
import { ButtonTertiary } from "@/components/ButtonTertiary";
import { useMatchCount } from "@/lib/useMatchCount";
import { 
  sweepOrphanedLocalImages, 
  isLocalUri, 
  isUploadFailed, 
  retryFailedUpload,
  hasPendingUpload,
  getPendingUploadLocalUris,
  hasAnyPendingUploads,
  getRecentlyCreatedUris,
  onQueueIdle,
} from "@/lib/storage";

// Grid tile for saved checks (matches Recent Scans / Wardrobe grid style)
function SavedCheckGridItem({
  check,
  index,
  onPress,
  onLongPress,
  tileSize,
  syncStatus,
  onRetry,
}: {
  check: RecentCheck;
  index: number;
  onPress: (check: RecentCheck) => void;
  onLongPress: (check: RecentCheck) => void;
  tileSize: number;
  syncStatus: 'synced' | 'syncing' | 'failed' | 'retrying';
  onRetry?: (check: RecentCheck) => void;
}) {
  // Get current wardrobe and calculate match count
  const { data: wardrobe = [] } = useWardrobe();
  const matchCount = useMatchCount(check, wardrobe);
  
  // Handle tap - if failed, retry; otherwise open
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (syncStatus === 'failed' && onRetry) {
      onRetry(check);
    } else {
      onPress(check);
    }
  };
  
  return (
    <Animated.View
      entering={FadeInDown.delay(300 + index * 50).springify()}
      exiting={FadeOut.duration(150)}
    >
      <Pressable
        onPress={handlePress}
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

        {/* Sync status badge - top right */}
        {syncStatus === 'syncing' && (
          <View
            style={{
              position: "absolute",
              top: spacing.sm,
              right: spacing.sm,
              backgroundColor: colors.overlay.dark,
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.sm,
              borderRadius: borderRadius.pill,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs / 2,
            }}
          >
            <CloudUpload size={12} color={colors.text.inverse} strokeWidth={2} />
            <Text style={{ ...typography.ui.caption, color: colors.text.inverse, fontFamily: typography.fontFamily.medium }}>
              Syncing
            </Text>
          </View>
        )}
        {(syncStatus === 'failed' || syncStatus === 'retrying') && (
          <View
            style={{
              position: "absolute",
              top: spacing.sm,
              right: spacing.sm,
              backgroundColor: syncStatus === 'retrying' ? colors.overlay.dark : colors.status.error,
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.sm,
              borderRadius: borderRadius.pill,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs / 2,
            }}
          >
            <RefreshCw size={12} color={colors.text.inverse} strokeWidth={2} />
            <Text style={{ ...typography.ui.caption, color: colors.text.inverse, fontFamily: typography.fontFamily.medium }}>
              {syncStatus === 'retrying' ? 'Retrying…' : 'Retry'}
            </Text>
          </View>
        )}

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
            You'll lose the outfits and match details saved with it.
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
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: recentChecks = [] } = useRecentChecks();
  const removeRecentCheckMutation = useRemoveRecentCheck();
  const [itemToDelete, setItemToDelete] = useState<RecentCheck | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [deleteError, setDeleteError] = useState<'network' | 'other' | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const hasSweepedRef = useRef(false);

  // Auto-hide toast after 2 seconds
  useEffect(() => {
    if (showToast) {
      const timeout = setTimeout(() => {
        setShowToast(false);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [showToast]);

  // Refetch data when tab gains focus (ensures fresh data after app restart)
  useFocusEffect(
    useCallback(() => {
      // Invalidate to get fresh data with updated image URIs
      queryClient.invalidateQueries({ queryKey: ["recentChecks", user?.id] });
    }, [queryClient, user?.id])
  );

  // Filter to show only saved checks (outcome = "saved_to_revisit")
  const savedChecks = recentChecks.filter(
    (check: RecentCheck) => check.outcome === "saved_to_revisit"
  );
  
  // Debounce timer for idle-triggered sweep
  const sweepDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  /**
   * ORPHAN SWEEP - Safe local file cleanup
   * 
   * INVARIANT: Only delete files that are:
   * 1. NOT referenced by any saved check in DB
   * 2. NOT queued for upload (pending or retrying)
   * 3. NOT recently created (within 60s TTL window)
   * 4. NEVER sweep while uploads are in progress
   * 
   * This prevents race conditions where a newly-saved scan's image
   * gets deleted before the DB/cache is updated.
   */
  const runOrphanSweep = useCallback(() => {
    if (hasSweepedRef.current) return;
    
    // Skip if uploads are still in progress
    if (hasAnyPendingUploads('scan')) {
      console.log('[Looks] Skipping orphan sweep - uploads in progress');
      return;
    }
    
    // Note: We run even if savedChecks.length === 0
    // There could be orphan files from previously deleted scans
    
    hasSweepedRef.current = true;
    console.log('[Looks] Running orphan sweep');
    
      // Collect all local URIs that are in use
      const validLocalUris = new Set<string>(
        savedChecks
          .map((c) => c.imageUri)
          .filter((uri): uri is string => !!uri && uri.startsWith('file://'))
      );
      
    // Include pending uploads (belt and suspenders)
    const pendingUris = getPendingUploadLocalUris('scan');
    for (const uri of pendingUris) {
      validLocalUris.add(uri);
    }
    
    // Include recently created URIs
    const recentUris = getRecentlyCreatedUris();
    for (const uri of recentUris) {
      validLocalUris.add(uri);
    }
    
      void sweepOrphanedLocalImages(validLocalUris, 'scan');
  }, [savedChecks]);
  
  // Run orphan sweep once per session after saved checks load
  // Delay slightly to avoid racing with in-flight saves that haven't updated cache yet
  useEffect(() => {
    // Small delay to let any pending cache updates settle
    const timer = setTimeout(() => {
      runOrphanSweep();
    }, 2000); // 2 second delay for cache stability
    
    return () => clearTimeout(timer);
  }, [runOrphanSweep]);
  
  // Also trigger sweep when queue becomes idle (uploads complete while screen is mounted)
  // Debounced to avoid multiple triggers if several jobs complete in one pass
  useEffect(() => {
    const unsubscribe = onQueueIdle((kind) => {
      if (kind === 'scan') {
        // Clear any pending debounce timer
        if (sweepDebounceTimer.current) {
          clearTimeout(sweepDebounceTimer.current);
        }
        // Debounce: wait 300ms before triggering (coalesces multiple idle events)
        sweepDebounceTimer.current = setTimeout(() => {
          console.log('[Looks] Queue became idle, triggering sweep + cache refresh');
          
          // Invalidate cache so UI gets fresh data with cloud URLs
          void queryClient.invalidateQueries({ queryKey: ["recentChecks", user?.id] });
          
          runOrphanSweep();
        }, 300);
      }
    });
    return () => {
      unsubscribe();
      if (sweepDebounceTimer.current) {
        clearTimeout(sweepDebounceTimer.current);
      }
    };
  }, [runOrphanSweep, queryClient, user?.id]);
  
  // Get sync status for a check
  const getSyncStatus = (check: RecentCheck): 'synced' | 'syncing' | 'failed' | 'retrying' => {
    // "Retrying" = user tapped retry AND job is now in queue (not failed anymore)
    if (retryingIds.has(check.id) && hasPendingUpload(check.id) && !isUploadFailed(check.id)) {
      return 'retrying';
    }
    if (!check.imageUri) return 'synced'; // No image
    if (!isLocalUri(check.imageUri)) return 'synced'; // Already cloud URL
    if (isUploadFailed(check.id)) return 'failed';
    if (hasPendingUpload(check.id)) return 'syncing';
    // Local file with no pending job = job hasn't been created yet (save in progress)
    return 'syncing';
  };
  
  // Handle retry for failed uploads
  const handleRetry = async (check: RecentCheck) => {
    setRetryingIds((prev) => new Set(prev).add(check.id));
    
    try {
      const success = await retryFailedUpload(check.id);
      if (!success) {
        // Job not found or not failed - clear retrying state immediately
        setRetryingIds((prev) => {
          const next = new Set(prev);
          next.delete(check.id);
          return next;
        });
        return;
      }
    } catch (error) {
      console.error('[Looks] Retry failed:', error);
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(check.id);
        return next;
      });
      return;
    }
    
    // Clear retrying state after delay to let UI update based on actual queue state
    setTimeout(() => {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(check.id);
        return next;
      });
    }, 5000); // 5s - enough time to see "Retrying..." then transition
  };

  // Show delete confirmation modal
  const handleDeleteRequest = (check: RecentCheck) => {
    setItemToDelete(check);
  };

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
      console.error('[Delete] Failed to delete saved scan:', error);
      setIsDeleting(false);
      // Keep itemToDelete so "Try again" can reopen confirmation
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      
      // Check if it's a network error
      const errMessage = error instanceof Error ? error.message : String(error || "");
      const isNetworkErr =
        errMessage.includes("Network request failed") ||
        errMessage.includes("The Internet connection appears to be offline") ||
        errMessage.includes("The network connection was lost") ||
        errMessage.includes("Unable to resolve host") ||
        errMessage.includes("Failed to fetch") ||
        errMessage.includes("fetch failed") ||
        errMessage.includes("ENOTFOUND") ||
        errMessage.includes("ECONNREFUSED");
      
      setDeleteError(isNetworkErr ? 'network' : 'other');
    }
  };

  // Cancel delete action
  const handleCancelDelete = () => {
    if (isDeleting) return;
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
                  syncStatus={getSyncStatus(check)}
                  onRetry={handleRetry}
                  tileSize={tileSize}
                />
              );
            })}
          </View>
        </ScrollView>
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
        message="Removed from Saved"
      />

      {/* Delete error modal */}
      <Modal
        visible={deleteError !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDeleteError(null);
          setItemToDelete(null);
        }}
      >
        <Pressable 
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center" }}
          onPress={() => {
            setDeleteError(null);
            setItemToDelete(null);
          }}
        >
          <Pressable 
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.bg.primary,
              borderRadius: 24,
              padding: spacing.xl,
              marginHorizontal: spacing.lg,
              alignItems: "center",
              maxWidth: 320,
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
                fontFamily: "PlayfairDisplay_600SemiBold",
                fontSize: typography.sizes.h3,
                color: colors.text.primary,
                textAlign: "center",
                marginBottom: spacing.xs,
              }}
            >
              {deleteError === 'network' ? 'Connection unavailable' : "Couldn't remove scan"}
            </Text>

            {/* Subtitle */}
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: typography.sizes.body,
                color: colors.text.secondary,
                textAlign: "center",
                marginBottom: spacing.lg,
                lineHeight: 22,
              }}
            >
              {deleteError === 'network' 
                ? 'Please check your internet and try again.' 
                : 'Please try again in a moment.'}
            </Text>

            {/* Primary Button - reopen confirmation modal */}
            <ButtonPrimary
              label="Try again"
              onPress={() => setDeleteError(null)}
              style={{ width: "100%" }}
            />

            {/* Secondary Button - close everything */}
            <ButtonTertiary
              label="Close"
              onPress={() => {
                setDeleteError(null);
                setItemToDelete(null);
              }}
              style={{ marginTop: spacing.sm }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
