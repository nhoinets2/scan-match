import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
import { router, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Camera, CloudUpload, RefreshCw, WifiOff, AlertCircle } from "lucide-react-native";
import { ImageWithFallback } from "@/components/PlaceholderImage";

import { useQueryClient } from "@tanstack/react-query";
import { useWardrobe, useRemoveWardrobeItem } from "@/lib/database";
import { useAuth } from "@/lib/auth-context";
import { colors, spacing, typography, borderRadius, cards, shadows, button } from "@/lib/design-tokens";
import { getTextStyle } from "@/lib/typography-helpers";
import { WardrobeItem, CATEGORIES, Category } from "@/lib/types";
import { ButtonSecondary } from "@/components/ButtonSecondary";
import { ButtonPrimary } from "@/components/ButtonPrimary";
import { ButtonTertiary } from "@/components/ButtonTertiary";
import { capitalizeFirst } from "@/lib/text-utils";
import { sweepOrphanedLocalImages, isUploadFailed, retryFailedUpload, getPendingUploadLocalUris, hasAnyPendingUploads, getRecentlyCreatedUris, hasPendingUpload, onQueueIdle } from "@/lib/storage";

const WARDROBE_FILTER_KEY = "wardrobe_filter_selection";

// Screen dimensions
const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// Get category label from category id
function getCategoryLabel(categoryId: string): string {
  const category = CATEGORIES.find((c) => c.id === categoryId);
  return category?.label || categoryId;
}

// Generate item name from wardrobe item
function getItemName(item: WardrobeItem): string {
  // Prioritize AI-detected label if available (matches detail screen)
  if (item.detectedLabel) {
    return capitalizeFirst(item.detectedLabel);
  }
  
  // Fallback: Build from colors and category
  const primaryColor = item.colors[0]?.name?.toLowerCase() || "";
  const categoryLabel = getCategoryLabel(item.category);

  if (primaryColor) {
    return `${primaryColor.charAt(0).toUpperCase() + primaryColor.slice(1)} ${categoryLabel.toLowerCase()}`;
  }

  return categoryLabel;
}

// Grid tile for wardrobe items (matches Recent Scans style)
function WardrobeGridItem({
  item,
  index,
  onPress,
  onLongPress,
  tileSize,
  isInitialRender,
}: {
  item: WardrobeItem;
  index: number;
  onPress: (item: WardrobeItem) => void;
  onLongPress: (item: WardrobeItem) => void;
  tileSize: number;
  isInitialRender?: boolean;
}) {
  const itemName = getItemName(item);
  const categoryLabel = getCategoryLabel(item.category);

  // Stagger animation based on grid position
  const enteringAnimation = isInitialRender 
    ? FadeInDown.delay(300 + index * 50).springify() 
    : FadeIn.delay(index * 30).duration(200);

  return (
    <Animated.View
      entering={enteringAnimation}
      exiting={FadeOut.duration(150)}
    >
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress(item);
        }}
        onLongPress={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          onLongPress(item);
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
        <ImageWithFallback uri={item.imageUri} />

        {/* Upload status indicator - based on queue state, not URI prefix */}
        {/* Shows "Syncing" when upload is pending, "Retry" when failed */}
        {(hasPendingUpload(item.id) || isUploadFailed(item.id)) && (
          <Pressable
            onPress={async (e) => {
              e.stopPropagation();
              // If upload failed, allow manual retry
              if (isUploadFailed(item.id)) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                await retryFailedUpload(item.id);
              }
            }}
            style={{
              position: "absolute",
              top: spacing.sm,
              right: spacing.sm,
              backgroundColor: isUploadFailed(item.id) ? colors.status.error : colors.overlay.dark,
              borderRadius: borderRadius.pill,
              paddingVertical: spacing.xs,
              paddingHorizontal: isUploadFailed(item.id) ? spacing.sm : spacing.xs,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs / 2,
            }}
          >
            {isUploadFailed(item.id) ? (
              <>
                <RefreshCw size={12} color={colors.text.inverse} strokeWidth={2} />
                <Text 
                  style={{ 
                    ...typography.ui.caption,
                    color: colors.text.inverse, 
                    fontFamily: typography.fontFamily.medium,
                  }}
                >
                  Retry
                </Text>
              </>
            ) : (
              <>
                <CloudUpload size={12} color={colors.text.inverse} strokeWidth={2} />
                <Text 
                  style={{ 
                    ...typography.ui.caption,
                    color: colors.text.inverse, 
                    fontFamily: typography.fontFamily.medium,
                  }}
                >
                  Syncing
                </Text>
              </>
            )}
          </Pressable>
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
          <Text
            style={{
              ...typography.ui.cardTitle,
              color: colors.text.inverse,
            }}
            numberOfLines={1}
          >
            {itemName}
          </Text>
          <Text
            style={{
              ...typography.ui.caption,
              color: "rgba(255,255,255,0.7)",
              marginTop: spacing.xs / 2,
            }}
            numberOfLines={1}
          >
            {categoryLabel}
          </Text>
        </View>
      </Pressable>
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
        <Text
          style={{
            ...typography.ui.cardTitle,
            color: colors.text.secondary,
            marginBottom: spacing.xs,
            textAlign: "center",
          }}
        >
          Start your wardrobe
        </Text>
        <Text
          style={{
            ...typography.ui.caption,
            color: colors.text.secondary,
            textAlign: "center",
            marginBottom: spacing.lg,
          }}
        >
          Scan a few pieces to unlock better outfit guidance.
        </Text>
        <ButtonSecondary
          label="Scan to add"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/add-item");
          }}
        />
        <Text
          style={{
            ...typography.ui.caption,
            color: colors.text.secondary,
            textAlign: "center",
            marginTop: spacing.sm,
          }}
        >
          Most people scan 5–10 items to start.
        </Text>
      </View>
    </Animated.View>
  );
}

// Empty state when filters cause empty list
function FilteredEmptyState({ onShowAll }: { onShowAll: () => void }) {
  return (
    <Animated.View 
      entering={FadeIn} 
      style={{ 
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: spacing.lg,
      }}
    >
      <View style={{ alignItems: "center", marginTop: -20 }}>
        <Text
          style={{
            ...typography.ui.cardTitle,
            color: colors.text.secondary,
            marginBottom: spacing.xs,
            textAlign: "center",
          }}
        >
          No items to show
        </Text>
        <Text
          style={{
            ...typography.ui.caption,
            color: colors.text.secondary,
            textAlign: "center",
            marginBottom: spacing.md,
          }}
        >
          The current filter has no matching items.
        </Text>
        <ButtonSecondary
          label="Show all"
          onPress={onShowAll}
        />
      </View>
    </Animated.View>
  );
}

// Filter chip component
function FilterChip({
  label,
  isSelected,
  onPress,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: spacing.md + spacing.xs / 2,
        paddingVertical: spacing.sm + spacing.xs / 2,
        borderRadius: borderRadius.image,
        backgroundColor: isSelected ? colors.accent.terracottaLight : "transparent",
        borderWidth: 0.5,
        borderColor: isSelected ? colors.accent.terracottaLight : colors.border.subtle,
        marginRight: spacing.sm,
      }}
    >
      <Text
        style={{
          ...typography.ui.caption,
          fontFamily: typography.fontFamily.regular,
          color: isSelected ? colors.text.primary : colors.text.secondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Delete Confirmation Modal
function DeleteConfirmationModal({
  visible,
  itemName,
  isDeleting,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  itemName: string;
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
            Remove {itemName}?
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
            This may affect existing scans and outfit suggestions.
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
        bottom: 140,
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

export default function WardrobeScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ deleted?: string }>();
  const { data: wardrobe = [] } = useWardrobe();
  const removeWardrobeItemMutation = useRemoveWardrobeItem();
  const [selectedFilters, setSelectedFilters] = useState<(Category | "all")[]>(["all"]); // multi-select filter state
  const [itemToDelete, setItemToDelete] = useState<WardrobeItem | null>(null);
  const [isInitialRender, setIsInitialRender] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [deleteError, setDeleteError] = useState<'network' | 'other' | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Show toast when navigated back from item deletion
  useEffect(() => {
    if (params.deleted === 'true') {
      setShowToast(true);
      // Clear the param to prevent showing toast on subsequent renders
      router.setParams({ deleted: undefined });
    }
  }, [params.deleted]);

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
      queryClient.invalidateQueries({ queryKey: ["wardrobe", user?.id] });
    }, [queryClient, user?.id])
  );

  // Load saved filter selection on mount
  useEffect(() => {
    const loadFilter = async () => {
      try {
        const saved = await AsyncStorage.getItem(WARDROBE_FILTER_KEY);
        if (saved) {
          // Handle legacy format (plain string) vs new format (JSON array)
          let parsed: unknown;
          try {
            parsed = JSON.parse(saved);
          } catch {
            // Legacy format: plain string like "all" - migrate to new format
            if (saved === "all" || CATEGORIES.some((c) => c.id === saved)) {
              setSelectedFilters([saved as Category | "all"]);
              await AsyncStorage.setItem(WARDROBE_FILTER_KEY, JSON.stringify([saved]));
            }
            return;
          }

          if (Array.isArray(parsed) && parsed.length > 0) {
            // Validate that all saved filters are valid
            const valid = parsed.filter(
              (f) => f === "all" || CATEGORIES.some((c) => c.id === f)
            );
            if (valid.length > 0) {
              setSelectedFilters(valid);
            }
          }
        }
      } catch (error) {
        // Clear corrupted data
        await AsyncStorage.removeItem(WARDROBE_FILTER_KEY);
      }
      // Mark initial render as complete after loading
      setTimeout(() => setIsInitialRender(false), 500);
    };
    loadFilter();
  }, []);

  // Save filter selection when it changes
  useEffect(() => {
    const saveFilter = async () => {
      try {
        await AsyncStorage.setItem(WARDROBE_FILTER_KEY, JSON.stringify(selectedFilters));
      } catch (error) {
        console.error("Error saving filter:", error);
      }
    };
    saveFilter();
  }, [selectedFilters]);

  // Track if orphan sweep has run this session
  const hasRunOrphanSweep = useRef(false);
  // Debounce timer for idle-triggered sweep
  const sweepDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  /**
   * ORPHAN SWEEP - Safe local file cleanup
   * 
   * INVARIANT: Only delete files that are:
   * 1. NOT referenced by any wardrobe item in DB
   * 2. NOT queued for upload (pending or retrying)
   * 3. NOT recently created (within 60s TTL window)
   * 4. NEVER sweep while uploads are in progress
   * 
   * This prevents race conditions where a newly-added item's image
   * gets deleted before the DB/cache is updated.
   */
  const runOrphanSweep = useCallback(() => {
    if (hasRunOrphanSweep.current) return;
    
    // Note: We run even if wardrobe.length === 0
    // There could be orphan files from previously deleted items
    
    // Skip if uploads are still in progress
    if (hasAnyPendingUploads('wardrobe')) {
      console.log('[Wardrobe] Skipping orphan sweep - uploads in progress');
      return;
    }
    
    hasRunOrphanSweep.current = true;
    console.log('[Wardrobe] Running orphan sweep');
    
    // Collect all local URIs from wardrobe items
    const validLocalUris = new Set(
      wardrobe
        .filter(item => item.imageUri?.startsWith('file://'))
        .map(item => item.imageUri)
    );
    
    // Include pending uploads (belt and suspenders)
    const pendingUris = getPendingUploadLocalUris('wardrobe');
    for (const uri of pendingUris) {
      validLocalUris.add(uri);
    }
    
    // Include recently created URIs
    const recentUris = getRecentlyCreatedUris();
    for (const uri of recentUris) {
      validLocalUris.add(uri);
    }
    
    void sweepOrphanedLocalImages(validLocalUris);
  }, [wardrobe]);
  
  // Orphan file sweep - run once per cold start when wardrobe data is available
  useEffect(() => {
    runOrphanSweep();
  }, [runOrphanSweep]);
  
  // Also trigger sweep when queue becomes idle (uploads complete while screen is mounted)
  // Debounced to avoid multiple triggers if several jobs complete in one pass
  useEffect(() => {
    const unsubscribe = onQueueIdle((kind) => {
      if (kind === 'wardrobe') {
        // Clear any pending debounce timer
        if (sweepDebounceTimer.current) {
          clearTimeout(sweepDebounceTimer.current);
        }
        // Debounce: wait 300ms before triggering (coalesces multiple idle events)
        sweepDebounceTimer.current = setTimeout(() => {
          console.log('[Wardrobe] Queue became idle, triggering sweep + cache refresh');
          
          // Invalidate cache so UI gets fresh data with cloud URLs
          void queryClient.invalidateQueries({ queryKey: ["wardrobe", user?.id] });
          
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

  // Reset filters to "all" when wardrobe becomes empty
  // This prevents the bug where a newly added first item is filtered out by stale filters
  useEffect(() => {
    if (wardrobe.length === 0 && !selectedFilters.includes("all")) {
      setSelectedFilters(["all"]);
    }
  }, [wardrobe.length, selectedFilters]);

  // Calculate available categories from wardrobe items
  const availableCategories = useMemo(() => {
    const categoriesInWardrobe = new Set(wardrobe.map((item) => item.category));
    return CATEGORIES.filter((cat) => categoriesInWardrobe.has(cat.id));
  }, [wardrobe]);

  // Filter wardrobe items based on selected filters
  const filteredWardrobe = useMemo(() => {
    return selectedFilters.includes("all")
      ? wardrobe
      : wardrobe.filter((item) => selectedFilters.includes(item.category));
  }, [wardrobe, selectedFilters]);

  // Show delete confirmation (triggered by long press)
  const handleDeleteRequest = (item: WardrobeItem) => {
    setItemToDelete(item);
  };

  // Confirm delete action
  const handleConfirmDelete = async () => {
    if (!itemToDelete || isDeleting) return;
    
    setIsDeleting(true);
    
    try {
      await removeWardrobeItemMutation.mutateAsync({ id: itemToDelete.id, imageUri: itemToDelete.imageUri });
      
      // Success - close modal, show toast
      setItemToDelete(null);
      setIsDeleting(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowToast(true);
    } catch (error) {
      console.error('[Delete] Failed to delete wardrobe item:', error);
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
    setItemToDelete(null);
  };

  const handleItemPress = (item: WardrobeItem) => {
    // Navigate to item detail (lightweight view)
    router.push({
      pathname: "/wardrobe-item",
      params: { itemId: item.id },
    });
  };

  const handleFilterChange = (filter: Category | "all") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    setSelectedFilters((prev) => {
      const isCurrentlySelected = prev.includes(filter);
      
      // If clicking "all"
      if (filter === "all") {
        if (isCurrentlySelected) {
          // If "all" is already selected, do nothing (keep it selected)
          return prev;
        } else {
          // Select "all" and deselect all other filters
          return ["all"];
        }
      }
      
      // If clicking a category filter
      if (isCurrentlySelected) {
        // Deselect the filter
        const newFilters = prev.filter((f) => f !== filter);
        // If no filters remain, select "all"
        return newFilters.length > 0 ? newFilters : ["all"];
      } else {
        // Select the filter, but remove "all" if it's selected
        const withoutAll = prev.filter((f) => f !== "all");
        return [...withoutAll, filter];
      }
    });
  };

  const handleShowAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedFilters(["all"]);
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
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text
              style={[getTextStyle("h1", colors.text.primary), { letterSpacing: 0.3 }]}
            >
              Wardrobe
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/add-item");
              }}
              style={{
                width: 36,
                height: 36,
                borderRadius: borderRadius.pill,
                backgroundColor: colors.surface.icon,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Camera size={18} color={colors.text.primary} strokeWidth={1.5} />
            </Pressable>
          </View>
        </Animated.View>
      </View>

      {wardrobe.length > 0 ? (
        <>
          {/* Filter chips */}
          <View
            style={{
              paddingTop: spacing.md,
              paddingBottom: spacing.md,
              position: "relative",
            }}
          >
            <Animated.View entering={FadeInDown.delay(150)} style={{ position: "relative" }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: spacing.lg,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <FilterChip
                  label="All"
                  isSelected={selectedFilters.includes("all")}
                  onPress={() => handleFilterChange("all")}
                />
                {availableCategories.map((category) => (
                  <FilterChip
                    key={category.id}
                    label={category.label}
                    isSelected={selectedFilters.includes(category.id)}
                    onPress={() => handleFilterChange(category.id)}
                  />
                ))}
              </ScrollView>
              {/* Right fade gradient */}
              <View
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: 20,
                  zIndex: 10,
                  pointerEvents: "none",
                }}
              />
            </Animated.View>
          </View>

          {filteredWardrobe.length > 0 ? (
            <ScrollView
              showsVerticalScrollIndicator={true}
              indicatorStyle="black"
              contentContainerStyle={{
                paddingHorizontal: spacing.md,
                paddingTop: spacing.sm,
                paddingBottom: 100,
              }}
            >
              {/* 2-column grid */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
                {filteredWardrobe.map((item: WardrobeItem, index: number) => {
                  // Calculate tile size for 2-column grid with spacing.md padding on each side and spacing.md gap
                  const screenWidth = Dimensions.get("window").width;
                  const tileSize = (screenWidth - spacing.md * 2 - spacing.md) / 2;
                  
                  return (
                    <WardrobeGridItem
                      key={item.id}
                      item={item}
                      index={index}
                      onPress={handleItemPress}
                      onLongPress={handleDeleteRequest}
                      tileSize={tileSize}
                      isInitialRender={isInitialRender}
                    />
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <FilteredEmptyState onShowAll={handleShowAll} />
          )}
        </>
      ) : (
        <EmptyState />
      )}

      {/* Delete Confirmation Modal - hide when error modal is showing */}
      <DeleteConfirmationModal
        visible={!!itemToDelete && deleteError === null}
        itemName={itemToDelete ? getItemName(itemToDelete) : ""}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* Success Toast */}
      <SuccessToast
        visible={showToast}
        message="Removed from Wardrobe"
      />

      {/* Delete error modal */}
      <Modal
        visible={deleteError !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteError(null)}
      >
        <Pressable 
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center" }}
          onPress={() => setDeleteError(null)}
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
              {deleteError === 'network' ? 'Connection unavailable' : "Couldn't remove item"}
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
