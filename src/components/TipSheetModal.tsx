/**
 * TipSheetModal
 *
 * Bottom sheet modal for displaying tip sheet content when user taps
 * a suggestion bullet in the results screen.
 *
 * Mode A: Shows filtered suggestions grid (items to buy)
 * Mode B: Shows educational boards (do/don't/try)
 *
 * SELECTION vs RANKING:
 * - Selection: Recipe filters only (no vibe pre-filtering)
 * - Ranking: Dual-array vibe sorting (scannedVibes + userVibes)
 *
 * TRANSPARENCY:
 * - Chips show actual signals used for sorting (Item: / You:)
 * - No vibe-specific "promises" in text
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
  interpolate,
} from "react-native-reanimated";

import { borderRadius, colors, spacing, cards, shadows, typography, button } from "@/lib/design-tokens";
import {
  resolveTipSheet,
  type TipSheetMode,
  type TipSheetVibe,
  type LibraryItemMeta,
} from "@/lib/inspiration/tipsheets";
import {
  resolveTipSheetContent,
  type TipSheetContent,
  type SuggestionsMeta,
  type SuggestionsContent,
} from "@/lib/inspiration/tipsheetContent";
import type { LibrarySource } from "@/lib/inspiration/recipeSuggestions";
import { resolveImage } from "@/lib/inspiration/images";
import type { StyleVibe, ScannedItem } from "@/lib/types";
import { useLibraryWithFallback } from "@/lib/inspiration/library-context";
import { usePreferences } from "@/lib/database";
import { resolveBulletTitle, isValidBulletKey } from "@/lib/confidence-engine/config";
import {
  generateTipsheetInstanceId,
  trackTipSheetLoadFailed,
  trackTipSheetRetryClicked,
  type LibraryErrorType,
} from "@/lib/inspiration/tipsheetTelemetry";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_PADDING = 20;
const GRID_GAP = 12;
const TILE_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

// ─────────────────────────────────────────────
// Vibe Normalization Helpers
// ─────────────────────────────────────────────

/**
 * Stable vibe priority order for consistent chip display.
 * Same order used everywhere to prevent chips from "jumping".
 */
const VIBE_PRIORITY: StyleVibe[] = [
  "office",
  "minimal",
  "street",
  "feminine",
  "sporty",
  "casual",
];

/**
 * User-friendly vibe labels (title case)
 */
const VIBE_LABELS: Record<StyleVibe, string> = {
  casual: "Casual",
  minimal: "Minimal",
  office: "Office",
  street: "Street",
  feminine: "Feminine",
  sporty: "Sporty",
};

/**
 * Normalize vibes for chip display.
 *
 * Behavior:
 * - Handles undefined/null safely
 * - Normalizes casing and whitespace ("Office " → "office")
 * - Drops unknown vibes (only keeps those in VIBE_PRIORITY)
 * - Drops "default" (not a human-facing vibe)
 * - Deduplicates
 * - Returns in stable priority order
 *
 * Example: ["default", "Office ", "office", "weird"] → ["office"]
 */
function normalizeVibes(vibes: StyleVibe[] | string[] | null | undefined): StyleVibe[] {
  if (!vibes?.length) return [];
  // Normalize each vibe: trim whitespace, lowercase
  const cleaned = vibes
    .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
    .filter((v) => v.length > 0);
  const set = new Set(cleaned);
  // VIBE_PRIORITY acts as allowlist: only human-facing vibes pass through
  // Use Set to deduplicate result (safety check in case VIBE_PRIORITY has duplicates)
  const result = VIBE_PRIORITY.filter((v) => set.has(v));
  return Array.from(new Set(result));
}

/**
 * Format vibe list for chip display.
 * Shows up to maxShown vibes, then +N for extras.
 */
function formatVibeList(vibes: StyleVibe[], maxShown = 2): string {
  if (vibes.length === 0) return "";
  const shown = vibes.slice(0, maxShown);
  const extra = vibes.length - shown.length;
  const labels = shown.map((v) => VIBE_LABELS[v] ?? v);
  return extra > 0 ? `${labels.join(" • ")} +${extra}` : labels.join(" • ");
}

// ─────────────────────────────────────────────
// TipSheetModal Props & Component
// ─────────────────────────────────────────────

interface TipSheetModalProps {
  visible: boolean;
  onClose: () => void;
  bulletKey: string | null;
  mode: TipSheetMode;
  vibe: StyleVibe;
  customTitle?: string;
  /** Target category from the bullet (Mode A only) - used for content type decision */
  targetCategory?: string | null;
  scannedItem?: ScannedItem | null;
  /** User's wardrobe count - affects Mode A copy and CTA */
  wardrobeCount?: number;
  /** Callback when "Add to wardrobe" CTA is pressed (Mode A, wardrobeCount === 0) */
  onAddToWardrobe?: () => void;
}

export function TipSheetModal({
  visible,
  onClose,
  bulletKey,
  mode,
  vibe,
  customTitle,
  targetCategory,
  scannedItem = null,
  wardrobeCount = 1, // Default to non-empty to preserve existing behavior
  onAddToWardrobe,
}: TipSheetModalProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const isClosing = useSharedValue(false);

  // Generate a stable instance ID for this TipSheet open (for telemetry attribution)
  const [tipsheetInstanceId] = useState(() => generateTipsheetInstanceId());

  // Get library items from Supabase with fallback to hardcoded
  const { libraryByCategory, isRemote, isLoading: libraryLoading, isEmpty, errorType, retry } = useLibraryWithFallback();

  // Get user preferences for vibe-based ranking
  const { data: preferences } = usePreferences();
  const userVibes = useMemo(
    () => normalizeVibes(preferences?.styleVibes as StyleVibe[] | undefined),
    [preferences?.styleVibes]
  );

  // Extract scanned item vibes
  const scannedVibes = useMemo(
    () => normalizeVibes(scannedItem?.styleTags),
    [scannedItem?.styleTags]
  );

  // Classify bulletKey state: loading (null), valid, or invalid
  const bulletKeyState = useMemo(() => {
    if (bulletKey === null) {
      return { kind: "loading" as const, validKey: null };
    }
    if (isValidBulletKey(bulletKey)) {
      return { kind: "valid" as const, validKey: bulletKey };
    }
    return { kind: "invalid" as const, validKey: null };
  }, [bulletKey]);

  // Track load failures for telemetry
  const [hasTrackedLoadFailed, setHasTrackedLoadFailed] = useState(false);
  useEffect(() => {
    if (visible && errorType && !hasTrackedLoadFailed && bulletKeyState.kind === "valid") {
      trackTipSheetLoadFailed({
        tipsheetInstanceId,
        bulletKey: bulletKeyState.validKey!,
        targetCategory: (targetCategory as import("@/lib/types").Category) ?? null,
        vibe: vibe as TipSheetVibe,
        errorType,
      });
      setHasTrackedLoadFailed(true);
    }
  }, [visible, errorType, hasTrackedLoadFailed, tipsheetInstanceId, bulletKeyState, targetCategory, vibe]);

  // Reset tracking state when modal closes
  useEffect(() => {
    if (!visible) {
      setHasTrackedLoadFailed(false);
    }
  }, [visible]);

  // Retry handler with telemetry
  const handleRetry = useCallback(() => {
    if (errorType && bulletKeyState.kind === "valid") {
      trackTipSheetRetryClicked({
        tipsheetInstanceId,
        bulletKey: bulletKeyState.validKey!,
        targetCategory: (targetCategory as import("@/lib/types").Category) ?? null,
        vibe: vibe as TipSheetVibe,
        errorType,
      });
    }
    retry();
  }, [errorType, bulletKeyState, tipsheetInstanceId, targetCategory, vibe, retry]);

  // Create library source for content resolver
  const librarySource: LibrarySource = useMemo(() => ({
    libraryByCategory,
    getItemById: (id: string) => {
      for (const items of Object.values(libraryByCategory)) {
        const found = items.find((item) => item.id === id);
        if (found) return found;
      }
      return undefined;
    },
  }), [libraryByCategory]);

  // Normalize customTitle: treat empty/whitespace strings as "not provided"
  const normalizedCustomTitle = customTitle?.trim() || null;

  // Resolve tip sheet metadata (only if we have a valid key)
  const resolvedSheet = useMemo(() => {
    if (bulletKeyState.kind !== "valid" || !bulletKeyState.validKey) return null;
    return resolveTipSheet({ mode, bulletKey: bulletKeyState.validKey, vibe });
  }, [bulletKeyState, mode, vibe]);

  // Resolve content (suggestions or educational)
  const content: TipSheetContent | null = useMemo(() => {
    if (bulletKeyState.kind !== "valid" || !bulletKeyState.validKey || !resolvedSheet) return null;
    return resolveTipSheetContent({
      mode,
      bulletKey: bulletKeyState.validKey,
      scannedItem: scannedItem ?? null,
      vibe: vibe as TipSheetVibe,
      userVibes,
      resolved: resolvedSheet,
      targetCategory,
      librarySource,
    });
  }, [bulletKeyState, mode, scannedItem, vibe, userVibes, resolvedSheet, targetCategory, librarySource]);

  // Callback to actually close the modal
  const performClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Animate close with smooth slide down
  const animateClose = useCallback(() => {
    "worklet";
    if (isClosing.value) return;
    isClosing.value = true;
    translateY.value = withTiming(
      800,
      { duration: 180, easing: Easing.out(Easing.quad) },
      (finished) => {
        if (finished) {
          runOnJS(performClose)();
        }
      }
    );
  }, [performClose, translateY, isClosing]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateClose();
  }, [animateClose]);

  // Pan gesture for swipe down to close
  const panGesture = Gesture.Pan()
    .activeOffsetY([5, Infinity])
    .onUpdate((event) => {
      if (event.translationY > 0 && !isClosing.value) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (isClosing.value) return;

      const SWIPE_THRESHOLD = 80;
      if (event.translationY > SWIPE_THRESHOLD || event.velocityY > 400) {
        isClosing.value = true;
        translateY.value = withTiming(
          800,
          { duration: 180, easing: Easing.out(Easing.quad) },
          (finished) => {
            if (finished) {
              runOnJS(performClose)();
            }
          }
        );
      } else {
        translateY.value = withSpring(0, {
          damping: 25,
          stiffness: 400,
          mass: 0.8,
        });
      }
    });

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: interpolate(translateY.value, [0, 300, 600], [1, 0.5, 0], "clamp"),
  }));

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, 300], [1, 0], "clamp"),
  }));

  // Animate entrance when modal becomes visible
  useEffect(() => {
    if (visible) {
      // Start from off-screen position
      translateY.value = 600;
      isClosing.value = false;
      // Animate in with spring for smooth entrance
      translateY.value = withSpring(0, {
        damping: 28,
        stiffness: 300,
        mass: 0.8,
      });
    }
  }, [visible, translateY, isClosing]);

  // Auto-dismiss on invalid bulletKey (bad deep link or stale reference)
  useEffect(() => {
    if (!visible || bulletKeyState.kind !== "invalid") return;

    if (__DEV__) {
      console.warn(`[TipSheetModal] Invalid bulletKey: "${bulletKey}" - auto-dismissing`);
    }

    // Haptic feedback for error
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    // Auto-dismiss after brief delay (allows haptic to fire)
    const timer = setTimeout(() => {
      onClose();
    }, 100);

    return () => clearTimeout(timer);
  }, [visible, bulletKeyState.kind, bulletKey, onClose]);

  // Early return: loading state (bulletKey is null, waiting for deep link to resolve)
  if (bulletKeyState.kind === "loading") {
    return null;
  }

  // Early return: invalid bulletKey (auto-dismiss effect will handle closing)
  if (bulletKeyState.kind === "invalid") {
    return null;
  }

  // Debug: log vibe and title resolution
  if (__DEV__ && visible && bulletKeyState.validKey) {
    console.log(
      `[TipSheetModal] bulletKey="${bulletKeyState.validKey}" ` +
      `scannedVibes=[${scannedVibes.join(",")}] userVibes=[${userVibes.join(",")}]`
    );
  }

  // Early return if no sheet resolved (shouldn't happen with valid key, but safety)
  if (!resolvedSheet || !content) {
    if (__DEV__ && bulletKeyState.validKey) {
      console.warn(`[TipSheetModal] No TIP_SHEETS entry for valid key: "${bulletKeyState.validKey}"`);
    }
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Full-screen backdrop overlay */}
      <Animated.View 
        style={[
          { 
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.overlay.dark,
          }, 
          animatedBackdropStyle
        ]}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={handleClose}
          accessibilityLabel="Close sheet"
        />
      </Animated.View>

      {/* Sheet container - positions sheet at bottom */}
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        {/* Sheet content */}
        <Animated.View
          style={[
            {
              // V3: cards.elevated for bottom sheet
              backgroundColor: cards.elevated.backgroundColor,
              borderTopLeftRadius: cards.elevated.borderRadius,
              borderTopRightRadius: cards.elevated.borderRadius,
              maxHeight: "85%",
              paddingBottom: insets.bottom,
              ...shadows.lg,
              overflow: "hidden", // Ensures corners are clipped properly
            },
            animatedSheetStyle,
          ]}
        >
          {/* Draggable header area */}
          <GestureDetector gesture={panGesture}>
            <Animated.View>
              {/* Handle bar */}
              <View style={{ alignItems: "center", paddingTop: spacing.sm + 4, paddingBottom: spacing.sm }}>
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
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  paddingHorizontal: spacing.lg,
                  paddingBottom: spacing.md,
                }}
              >
                <View style={{ flex: 1 }}>
                  {/* Title: Use BASE title (not vibe-resolved) */}
                  <Text
                    style={{
                      ...typography.display.screenTitle,
                      color: colors.text.primary,
                      marginBottom: spacing.xs / 2,
                    }}
                  >
                    {normalizedCustomTitle ?? resolveBulletTitle(bulletKeyState.validKey, undefined) ?? (__DEV__ ? `[Missing: ${bulletKeyState.validKey}]` : "Suggestion")}
                  </Text>

                  {/* Subtitle (if exists) */}
                  {resolvedSheet.subtitle && (
                    <Text
                      style={{
                        ...typography.ui.body,
                        color: colors.text.secondary,
                        marginBottom: spacing.sm,
                      }}
                    >
                      {resolvedSheet.subtitle}
                    </Text>
                  )}

                  {/* Chips row (only for suggestions, not educational) */}
                  {content.kind === "suggestions" && (
                    <SortedForYouChips
                      scannedVibes={scannedVibes}
                      userVibes={userVibes}
                    />
                  )}
                </View>
                <Pressable
                  onPress={handleClose}
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
            </Animated.View>
          </GestureDetector>

          {/* Content */}
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              // Extra bottom padding when CTA is shown to prevent content being hidden behind it
              paddingBottom: (wardrobeCount === 0 && onAddToWardrobe && content.kind === "suggestions") ? 80 : 20,
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* Suggestions grid (Mode A with targetCategory) */}
            {content.kind === "suggestions" && (
              <SuggestionsSection
                content={content}
                category={targetCategory ?? null}
                scannedVibes={scannedVibes}
                userVibes={userVibes}
                isLoading={libraryLoading}
                isEmpty={isEmpty}
                errorType={errorType}
                onRetry={handleRetry}
                onClose={handleClose}
                wardrobeCount={wardrobeCount}
              />
            )}

            {/* Educational boards (Mode B) - pure styling advice */}
            {content.kind === "educational" && (
              <EducationalSection
                boards={content.boards}
              />
            )}
          </ScrollView>

          {/* Sticky bottom CTA - only shown when wardrobeCount === 0 and Mode A */}
          {/* Matches results screen bottom actions styling */}
          {wardrobeCount === 0 && onAddToWardrobe && content.kind === "suggestions" && (
            <View
              style={{
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.md,
                backgroundColor: colors.bg.elevated,
                borderTopWidth: 1,
                borderTopColor: colors.border.hairline,
              }}
            >
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onAddToWardrobe();
                }}
                accessibilityLabel="Add items to wardrobe"
                style={{
                  backgroundColor: button.primary.backgroundColor,
                  borderRadius: borderRadius.pill,
                  height: button.height.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  ...shadows.sm,
                }}
              >
                <Text
                  style={{
                    ...typography.button.primary,
                    color: colors.text.inverse,
                  }}
                >
                  Add to wardrobe
                </Text>
              </Pressable>
            </View>
          )}

        </Animated.View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Vibe Tooltip Component
// Shows all vibes in a bubble popover next to the chip
// ─────────────────────────────────────────────

function VibeTooltip({
  visible,
  onClose,
  vibes,
  title,
  chipLayout,
}: {
  visible: boolean;
  onClose: () => void;
  vibes: StyleVibe[];
  title: string;
  chipLayout: { x: number; y: number; width: number; height: number } | null;
}) {
  if (!visible || vibes.length === 0 || !chipLayout) return null;

  // Position tooltip below the chip with some spacing
  const tooltipTop = chipLayout.y + chipLayout.height + 8;
  const tooltipLeft = chipLayout.x;

  return (
    <>
      {/* Invisible backdrop to close on tap outside - only covers the header area */}
      <Pressable
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 998,
        }}
        onPress={onClose}
      />
      {/* Tooltip bubble */}
      <Pressable
        onPress={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: tooltipTop,
          left: tooltipLeft,
          zIndex: 999,
          // V3: cards.elevated for tooltip
          backgroundColor: cards.elevated.backgroundColor,
        borderRadius: cards.elevated.borderRadius,
        padding: spacing.md,
          minWidth: 180,
          maxWidth: 280,
          ...shadows.lg,
        }}
      >
        {/* Arrow pointing up to chip */}
        <View
          style={{
            position: "absolute",
            top: -6,
          left: spacing.md,
          width: 0,
          height: 0,
            borderLeftWidth: 6,
            borderRightWidth: 6,
            borderBottomWidth: 6,
            borderLeftColor: "transparent",
            borderRightColor: "transparent",
            borderBottomColor: colors.bg.elevated,
          }}
        />
        <Text
          style={{
            ...typography.ui.label,
            color: colors.text.primary,
            marginBottom: spacing.sm + spacing.xs / 2,
          }}
        >
          {title}
        </Text>
        <View>
          {vibes.map((vibe, index) => (
            <View
              key={`${vibe}-${index}`}
              style={{
                flexDirection: "row",
              alignItems: "center",
              paddingVertical: spacing.xs + spacing.xs / 2,
              borderBottomWidth: index < vibes.length - 1 ? 1 : 0,
                borderBottomColor: colors.border.hairline,
              }}
            >
              <View
                style={{
                  width: spacing.xs + spacing.xs / 2,
                  height: spacing.xs + spacing.xs / 2,
                  borderRadius: borderRadius.pill,
                  backgroundColor: colors.accent.terracotta,
                  marginRight: 10,
                }}
              />
              <Text
                style={{
                  ...typography.ui.label,
                  color: colors.text.primary,
                }}
              >
                {VIBE_LABELS[vibe] ?? vibe}
              </Text>
            </View>
          ))}
        </View>
      </Pressable>
    </>
  );
}

// ─────────────────────────────────────────────
// Sorted For You Chips
// Shows actual signals used for sorting (Item: / You:)
// ─────────────────────────────────────────────

function SortedForYouChips({
  scannedVibes,
  userVibes,
}: {
  scannedVibes: StyleVibe[];
  userVibes: StyleVibe[];
}) {
  const hasScanned = scannedVibes.length > 0;
  const hasUser = userVibes.length > 0;
  const [showScannedTooltip, setShowScannedTooltip] = useState(false);
  const [showUserTooltip, setShowUserTooltip] = useState(false);
  const [scannedChipLayout, setScannedChipLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [userChipLayout, setUserChipLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // If no chips to show, render italic fallback line
  if (!hasScanned && !hasUser) {
    return (
      <Text
        style={{
          ...typography.ui.label,
          fontStyle: "italic",
          color: colors.text.secondary,
          marginTop: 4,
        }}
      >
        Best matches shown first.
      </Text>
    );
  }

  const showScannedTooltipEnabled = scannedVibes.length > 2;
  const showUserTooltipEnabled = userVibes.length > 2;

  const handleScannedChipPress = () => {
    if (showScannedTooltipEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setShowScannedTooltip(true);
    }
  };

  const handleUserChipPress = () => {
    if (showUserTooltipEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setShowUserTooltip(true);
    }
  };

  return (
    <View style={{ position: "relative" }}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 6, // Closer to subtitle
        }}
      >
        {/* Item vibe chip */}
        {hasScanned && (
          <Pressable
            onPress={handleScannedChipPress}
            disabled={!showScannedTooltipEnabled}
            onLayout={(event) => {
              const { x, y, width, height } = event.nativeEvent.layout;
              setScannedChipLayout({ x, y, width, height });
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.bg.tertiary,
              borderRadius: borderRadius.pill,
              paddingHorizontal: 10,
              height: 24,
              opacity: showScannedTooltipEnabled ? 1 : 1,
            }}
          >
            <Text
              style={{
                ...typography.tabBar.label,
                color: colors.text.secondary,
              }}
            >
              Item vibe {formatVibeList(scannedVibes)}
            </Text>
          </Pressable>
        )}

        {/* Your vibe chip */}
        {hasUser && (
          <Pressable
            onPress={handleUserChipPress}
            disabled={!showUserTooltipEnabled}
            onLayout={(event) => {
              const { x, y, width, height } = event.nativeEvent.layout;
              setUserChipLayout({ x, y, width, height });
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.bg.tertiary,
              borderRadius: borderRadius.pill,
              paddingHorizontal: 10,
              height: 24,
              opacity: showUserTooltipEnabled ? 1 : 1,
            }}
          >
            <Text
              style={{
                ...typography.tabBar.label,
                color: colors.text.secondary,
              }}
            >
              Your vibe {formatVibeList(userVibes)}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Tooltips */}
      {showScannedTooltip && (
        <VibeTooltip
          visible={showScannedTooltip}
          onClose={() => setShowScannedTooltip(false)}
          vibes={scannedVibes}
          title="Item vibes"
          chipLayout={scannedChipLayout}
        />
      )}
      {showUserTooltip && (
        <VibeTooltip
          visible={showUserTooltip}
          onClose={() => setShowUserTooltip(false)}
          vibes={userVibes}
          title="Your vibes"
          chipLayout={userChipLayout}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────
// Suggestion Tile Component (with loading indicator)
// ─────────────────────────────────────────────

function SuggestionTile({
  item,
  imageSource,
  onPress,
}: {
  item: LibraryItemMeta;
  imageSource: ReturnType<typeof resolveImage> | null;
  onPress: () => void;
}) {
  const [imageLoading, setImageLoading] = useState(true);

  return (
    <Pressable
      onPress={onPress}
      style={{
        width: TILE_WIDTH,
        marginBottom: GRID_GAP,
      }}
    >
      <View
        style={{
          backgroundColor: colors.bg.elevated,
          borderRadius: borderRadius.image,
          borderWidth: 1,
          borderColor: colors.border.hairline,
          overflow: "hidden", // Clip image to rounded corners
        }}
      >
        {/* Image container: fixed aspect ratio (1:1) with cover */}
        <View
          style={{
            width: TILE_WIDTH - 2, // Account for border
            aspectRatio: 1, // Fixed 1:1 aspect ratio
            backgroundColor: colors.bg.secondary,
            borderTopLeftRadius: 13, // Match tile radius minus border
            borderTopRightRadius: 13,
            overflow: "hidden", // Ensures Android clips properly
          }}
        >
          {imageSource ? (
            <>
              <Image
                source={imageSource}
                style={{
                  width: "100%",
                  height: "100%",
                }}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
                onLoadStart={() => setImageLoading(true)}
                onLoad={() => setImageLoading(false)}
              />
              {/* Loading indicator */}
              {imageLoading && (
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.bg.secondary,
                  }}
                >
                  <ActivityIndicator size="small" color={colors.accent.terracotta} />
                </View>
              )}
            </>
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  ...typography.tabBar.label,
                  color: colors.text.tertiary,
                }}
              >
                No image
              </Text>
            </View>
          )}
        </View>
        {/* Label: 2 lines max with ellipsis, fixed height to prevent jitter */}
        <View style={{ 
          paddingHorizontal: 12, 
          paddingVertical: 10,
          minHeight: 50, // lineHeight(15) * 2 lines + padding(20) = stable height
          justifyContent: "center",
        }}>
          <Text
            style={{
              ...typography.ui.caption,
              color: colors.text.primary,
              textAlign: "center",
            }}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {item.label}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────
// Suggestions Section (with user-controlled fallback)
// ─────────────────────────────────────────────

function SuggestionsSection({
  content,
  category,
  scannedVibes,
  userVibes,
  isLoading,
  isEmpty: libraryIsEmpty,
  errorType,
  onRetry,
  onClose,
  wardrobeCount = 1,
}: {
  content: SuggestionsContent;
  category: string | null;
  scannedVibes: StyleVibe[];
  userVibes: StyleVibe[];
  isLoading: boolean;
  isEmpty: boolean;
  errorType: LibraryErrorType;
  onRetry: () => void;
  onClose: () => void;
  wardrobeCount?: number;
}) {
  // User-controlled state for showing broader results
  const [showMore, setShowMore] = useState(false);

  // Full-size image viewer state
  const [selectedImage, setSelectedImage] = useState<{
    source: ReturnType<typeof resolveImage>;
    label: string;
  } | null>(null);

  // Determine which items to display
  const displayItems = showMore && content.moreItems.length > 0
    ? content.moreItems
    : content.items;

  const { meta, label } = content;

  // Loading state: show skeleton placeholders
  if (isLoading) {
    return (
      <View>
          <View
            style={{
              width: 120,
              height: 14,
              backgroundColor: colors.bg.tertiary,
              borderRadius: borderRadius.pill,
              marginBottom: spacing.sm,
            }}
          />
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <View
              key={`skeleton-${i}`}
              style={{
                width: TILE_WIDTH,
                marginBottom: GRID_GAP,
              }}
            >
              <View
                style={{
                  backgroundColor: colors.bg.elevated,
                  borderRadius: borderRadius.image,
                  borderWidth: 1,
                  borderColor: colors.border.hairline,
                  overflow: "hidden",
                }}
              >
                {/* Image skeleton with fixed aspect ratio */}
                <View
                  style={{
                    width: TILE_WIDTH - 2,
                    aspectRatio: 1,
                    backgroundColor: colors.bg.tertiary,
                    borderTopLeftRadius: 13,
                    borderTopRightRadius: 13,
                  }}
                />
                {/* Label skeleton with consistent padding + fixed height */}
                <View style={{ 
                  paddingHorizontal: 12, 
                  paddingVertical: 10, 
                  minHeight: 52,
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <View
                    style={{
                      width: "80%",
                      height: 12,
                      backgroundColor: colors.bg.tertiary,
                      borderRadius: borderRadius.pill,
                    }}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // Fetch failed state
  if (errorType === "fetch_failed") {
    return (
      <View style={{ paddingVertical: spacing.xl * 2, paddingHorizontal: spacing.lg, alignItems: "center" }}>
        <Text
          style={{
            ...typography.ui.bodyMedium,
            color: colors.text.secondary,
            textAlign: "center",
            marginBottom: spacing.sm,
          }}
        >
          Can't load suggestions right now
        </Text>
        <Text
          style={{
            ...typography.ui.label,
            color: colors.text.tertiary,
            textAlign: "center",
            marginBottom: spacing.md,
          }}
        >
          Check your connection and try again.
        </Text>
        <Pressable
          onPress={onRetry}
          style={{
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            backgroundColor: colors.state.pressed,
            borderRadius: borderRadius.image,
          }}
        >
          <Text
            style={{
              ...typography.ui.bodyMedium,
              color: colors.text.secondary,
            }}
          >
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  // Library is empty (no items in Supabase)
  if (libraryIsEmpty || errorType === "empty") {
    return (
      <View style={{ paddingVertical: spacing.xl * 2, paddingHorizontal: spacing.lg, alignItems: "center" }}>
        <Text
          style={{
            ...typography.ui.bodyMedium,
            color: colors.text.secondary,
            textAlign: "center",
            marginBottom: spacing.sm,
          }}
        >
          No suggestions yet
        </Text>
        <Text
          style={{
            ...typography.ui.label,
            color: colors.text.tertiary,
            textAlign: "center",
          }}
        >
          We're adding items regularly.
        </Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────
  // Empty state with user-controlled fallback
  // Shows when recipe filters find nothing
  // Chips are already shown in header, so we just show body + button
  // ─────────────────────────────────────────────
  if (content.items.length === 0 && !showMore) {
    return (
      <View style={{ paddingVertical: spacing.xl * 2, paddingHorizontal: spacing.lg, alignItems: "center" }}>
        <Text
          style={{
            ...typography.ui.sectionTitle,
            color: colors.text.primary,
            textAlign: "center",
            marginBottom: spacing.sm,
          }}
        >
          No exact matches yet.
        </Text>
        <Text
          style={{
            ...typography.ui.body,
            color: colors.text.secondary,
            textAlign: "center",
            marginBottom: spacing.lg,
          }}
        >
          Want to see more items from this category?
        </Text>

        {/* Show more button - user-controlled fallback (inline) */}
        {content.canShowMore && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowMore(true);
            }}
            style={{
              backgroundColor: button.secondary.backgroundColor,
              borderRadius: borderRadius.pill,
              borderWidth: button.secondary.borderWidth,
              borderColor: button.secondary.borderColor,
              height: button.height.secondary,
              paddingHorizontal: button.paddingX.secondary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                ...typography.button.secondary,
                color: button.secondary.textColor,
              }}
            >
              Show more items
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  // ─────────────────────────────────────────────
  // Items grid (primary or "more items" mode)
  // ─────────────────────────────────────────────
  return (
    <View>
      {/* Dev-only relaxation debug */}
      {__DEV__ && meta.wasRelaxed && (
        <Text
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            color: colors.text.tertiary,
            marginBottom: spacing.sm,
            backgroundColor: colors.bg.tertiary,
            padding: 6,
            borderRadius: borderRadius.pill,
          }}
        >
          [DEV] Relaxed: {meta.relaxedKeys.join(", ") || "all"} | Locked: {meta.lockedKeys.join(", ") || "none"}
        </Text>
      )}

      {/* Section heading: sentence case, lighter weight */}
      {/* When wardrobeCount === 0: "Examples to add" instead of "Suggested X" */}
      <Text
        style={{
          ...typography.tabBar.label,
          color: colors.text.tertiary,
          marginBottom: showMore ? 4 : (meta.wasRelaxed ? 4 : 10),
        }}
      >
        {showMore
          ? `More items (${displayItems.length})`
          : wardrobeCount === 0
            ? `Examples to add (${displayItems.length})`
            : `Suggested ${category ?? "items"} (${displayItems.length})`}
      </Text>

      {/* Context note for different states */}
      {showMore ? (
        // User-controlled fallback mode - header already says "More items"
        <Text
          style={{
            ...typography.ui.caption,
            color: colors.text.tertiary,
            marginBottom: spacing.sm,
            fontStyle: "italic",
          }}
        >
          These may not be exact matches.
        </Text>
      ) : meta.wasRelaxed ? (
        // Relaxed filters mode
        <Text
          style={{
            ...typography.ui.caption,
            color: colors.text.tertiary,
            marginBottom: spacing.sm,
            fontStyle: "italic",
          }}
        >
          Showing close options.
        </Text>
      ) : null}

      {/* Grid */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        {displayItems.map((item, index) => {
          const imageSource = item.image ? resolveImage(item.image) : null;
          return (
            <SuggestionTile
              key={`suggestion-${item.id}-${index}`}
              item={item}
              imageSource={imageSource}
              onPress={() => {
                if (imageSource) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedImage({ source: imageSource, label: item.label });
                }
              }}
            />
          );
        })}
      </View>

      {/* Full-size image viewer modal */}
      <Modal
        visible={selectedImage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedImage(null)}
      >
        {/* Backdrop - tap here to close */}
        <Pressable
          onPress={() => setSelectedImage(null)}
          style={{
            flex: 1,
            backgroundColor: button.primary.backgroundColor,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {selectedImage && (
            <>
              {/* Close hint */}
              <View
                style={{
                  position: "absolute",
                  top: 60,
                  right: spacing.lg,
                  backgroundColor: "rgba(255,255,255,0.15)" /* On dark BG */,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xs,
                  borderRadius: borderRadius.image,
                }}
              >
                <Text
                  style={{
                    ...typography.ui.label,
                    color: colors.text.inverse,
                  }}
                >
                  Tap outside to close
                </Text>
              </View>

              {/* Content container - taps here don't close modal */}
              <Pressable onPress={(e) => e.stopPropagation()}>
                {/* Full-size image - portrait aspect ratio (2:3) */}
                <Image
                  source={selectedImage.source}
                  style={{
                    width: Dimensions.get("window").width - 40,
                    height: (Dimensions.get("window").width - 40) * 1.5, // 2:3 portrait
                    borderRadius: borderRadius.image,
                  }}
                  contentFit="contain"
                  transition={200}
                />

                {/* Label below image */}
                <Text
                  style={{
                    ...typography.ui.body,
                    color: colors.text.inverse,
                    marginTop: spacing.md,
                    textAlign: "center",
                    paddingHorizontal: spacing.lg,
                  }}
                  numberOfLines={2}
                >
                  {selectedImage.label}
                </Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────
// Board Card (with graceful image error handling)
// ─────────────────────────────────────────────

// Warn-once guard to prevent console spam on re-renders
const _boardCardWarned = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (!__DEV__) return;
  if (_boardCardWarned.has(key)) return;
  _boardCardWarned.add(key);
  console.warn(message);
}

type BoardCardProps = {
  board: {
    kind: "do" | "dont" | "try";
    image: string;
    label: string;
    _debug?: {
      packId: string;
      variant: string;
      kind: string;
    };
  };
  onPress?: () => void;
  /** Subtle visual prominence for "do" card */
  isLead?: boolean;
};

/** Kind pill labels - user-friendly versions */
const KIND_LABELS: Record<"do" | "dont" | "try", string> = {
  do: "Do",
  dont: "Avoid",
  try: "Try",
};

/** Normalize label: strip prefix, capitalize first letter */
function normalizeLabel(label: string): string {
  const stripped = label.replace(/^(Do:|Avoid:|Try:)\s*/i, "");
  if (stripped.length === 0) return stripped;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function BoardCard({ board, onPress, isLead }: BoardCardProps) {
  // Normalize URL (treat empty string as missing)
  const url = useMemo(() => {
    const u = (board.image ?? "").trim();
    return u.length > 0 ? u : null;
  }, [board.image]);

  const [failed, setFailed] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const isMissing = !url;
  const showPlaceholder = isMissing || failed;

  // Build actionable context for warnings
  const debugContext = board._debug
    ? `pack=${board._debug.packId} variant=${board._debug.variant} kind=${board._debug.kind}`
    : `label="${board.label}"`;

  // Warn once for missing URL
  if (isMissing) {
    warnOnce(
      `missing:${debugContext}`,
      `[BoardCard] Missing image URL: ${debugContext}`
    );
  }

  const CardWrapper = onPress ? Pressable : View;

  return (
    <CardWrapper
      onPress={onPress}
      style={{
        // V3: cards.standard = border-first, isLead gets subtle shadow
        backgroundColor: cards.standard.backgroundColor,
        borderRadius: borderRadius.image, // Match Mode A tile radius
        borderWidth: cards.standard.borderWidth,
        borderColor: cards.standard.borderColor,
        // NOTE: overflow NOT set here - allows shadow to render on Android
        // Subtle elevation for lead card (Do)
        ...(isLead && shadows.sm),
      }}
    >
      {/* Image area with stable aspect ratio (avoids layout jump) */}
      {/* overflow: hidden HERE to clip image corners, not on outer card */}
      <View
        style={{
          width: "100%",
          aspectRatio: 2 / 3, // Portrait boards (do/dont/try)
          backgroundColor: colors.bg.tertiary,
          borderTopLeftRadius: 13, // Match outer radius minus border
          borderTopRightRadius: 13,
          overflow: "hidden", // Clip image to rounded corners
        }}
      >
        {showPlaceholder ? (
          // Graceful placeholder - dev shows warning, prod shows neutral gray
          __DEV__ ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                padding: spacing.md,
              }}
            >
              <Text
                style={{
                  ...typography.ui.label,
                  color: colors.accent.terracotta,
                  marginBottom: spacing.xs,
                }}
              >
                ⚠️ Board image missing
              </Text>
              <Text
                style={{
                  ...typography.tabBar.label,
                  color: colors.text.tertiary,
                  textAlign: "center",
                }}
                numberOfLines={2}
              >
                {isMissing ? "No URL provided" : "Failed to load"}
              </Text>
              {board._debug && (
                <Text
                  style={{
                    fontFamily: "monospace",
                    fontSize: 9,
                    color: colors.text.tertiary,
                    marginTop: spacing.xs,
                  }}
                >
                  {board._debug.packId}/{board._debug.variant}/{board._debug.kind}
                </Text>
              )}
            </View>
          ) : null // Prod: just neutral gray background
        ) : (
          <>
            <Image
              source={{ uri: url! }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
              onLoadStart={() => setImageLoading(true)}
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageLoading(false);
                setFailed(true);
                warnOnce(
                  `failed:${url}`,
                  `[BoardCard] Failed to load image: ${debugContext} url=${url?.slice(0, 60)}...`
                );
              }}
            />
            {/* Loading indicator */}
            {imageLoading && (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.bg.secondary,
                }}
              >
                <ActivityIndicator size="small" color={colors.accent.terracotta} />
              </View>
            )}
          </>
        )}
      </View>

      {/* Caption with kind pill */}
      <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
        {/* Kind pill */}
        <View
          style={{
            alignSelf: "flex-start",
            backgroundColor: colors.state.pressed,
            paddingHorizontal: spacing.xs,
            paddingVertical: spacing.xs / 2,
            borderRadius: borderRadius.pill,
            marginBottom: spacing.xs,
          }}
        >
          <Text
            style={{
              ...typography.tabBar.label,
              color: colors.text.secondary,
              textTransform: "uppercase",
              letterSpacing: 0.3,
            }}
          >
            {KIND_LABELS[board.kind]}
          </Text>
        </View>
        {/* Label (strip prefix, capitalize first letter) */}
        <Text
          style={{
            ...typography.ui.caption,
            color: colors.text.secondary,
          }}
          numberOfLines={2}
        >
          {normalizeLabel(board.label)}
        </Text>
      </View>
    </CardWrapper>
  );
}

// ─────────────────────────────────────────────
// Educational Section (Mode B: do/don't/try)
// Aligned with Mode A: same design tokens, stacked card layout
// ─────────────────────────────────────────────

function EducationalSection({
  boards,
}: {
  boards: BoardCardProps["board"][];
}) {
  // Full-size image viewer state (matches Mode A behavior)
  const [selectedBoard, setSelectedBoard] = useState<{
    url: string;
    label: string;
  } | null>(null);

  return (
    <View>
      {/* Educational boards - stacked cards with tap-to-view */}
      {/* Cards are sized as previews (~70% width) to invite tapping for full size */}
      {/* index 0 = lead (no top margin), others have larger spacing */}
      <View style={{ alignItems: "center" }}>
        {boards.map((board, index) => {
          const isLead = index === 0; // First board after resolver normalization is always "do"
          return (
            <View
              key={`board-${index}`}
              style={{
                marginTop: isLead ? 0 : spacing.md,
                width: "75%", // Preview size - tap to see full
              }}
            >
              <BoardCard
                board={board}
                isLead={isLead}
                onPress={() => {
                  const url = (board.image ?? "").trim();
                  if (url.length > 0) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedBoard({ url, label: board.label });
                  }
                }}
              />
            </View>
          );
        })}
      </View>

      {/* Full-size image viewer modal (matches Mode A) */}
      <Modal
        visible={selectedBoard !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBoard(null)}
      >
        {/* Backdrop - tap here to close */}
        <Pressable
          onPress={() => setSelectedBoard(null)}
          style={{
            flex: 1,
            backgroundColor: button.primary.backgroundColor,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {selectedBoard && (
            <>
              {/* Close hint */}
              <View
                style={{
                  position: "absolute",
                  top: 60,
                  right: spacing.lg,
                  backgroundColor: "rgba(255,255,255,0.15)" /* On dark BG */,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xs,
                  borderRadius: borderRadius.image,
                }}
              >
                <Text
                  style={{
                    ...typography.ui.label,
                    color: colors.text.inverse,
                  }}
                >
                  Tap outside to close
                </Text>
              </View>

              {/* Content container - taps here don't close modal */}
              <Pressable onPress={(e) => e.stopPropagation()}>
                {/* Full-size image - portrait aspect ratio */}
                <Image
                  source={{ uri: selectedBoard.url }}
                  style={{
                    width: Dimensions.get("window").width - 40,
                    height: (Dimensions.get("window").width - 40) * 1.5, // 2:3 portrait
                    borderRadius: borderRadius.image,
                  }}
                  contentFit="contain"
                  transition={200}
                />

                {/* Label below image */}
                <Text
                  style={{
                    ...typography.ui.body,
                    color: colors.text.inverse,
                    marginTop: spacing.md,
                    textAlign: "center",
                    paddingHorizontal: spacing.lg,
                  }}
                  numberOfLines={2}
                >
                  {selectedBoard.label}
                </Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}
