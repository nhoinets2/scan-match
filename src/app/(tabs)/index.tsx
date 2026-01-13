import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { View, Text, ScrollView, Pressable, Dimensions, Modal } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import Svg, { Path } from "react-native-svg";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  Camera,
  Plus,
  ChevronRight,
  Clock,
  Shirt,
  User,
  Check,
  X,
  Copy,
  Sparkles,
  Puzzle,
} from "lucide-react-native";
import Clipboard from "@react-native-clipboard/clipboard";

import {
  useWardrobe,
  useWardrobeCount,
  useRecentChecks,
  useOnboardingComplete,
  useRemoveWardrobeItem,
  useRemoveRecentCheck,
} from "@/lib/database";
import { useAuth } from "@/lib/auth-context";
import { colors, spacing, typography, components, button, borderRadius, shadows, cards } from "@/lib/design-tokens";
import { getTextStyle } from "@/lib/typography-helpers";
import { OutcomeState, RecentCheck, WardrobeItem, CATEGORIES } from "@/lib/types";
import { useMatchCount } from "@/lib/useMatchCount";

// Screen dimensions

// Hero Card - AI-Powered Styling CTA
function HeroCard({ 
  onPress,
}: { 
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(200).springify()}
      style={animatedStyle}
    >
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        onPressIn={() => {
          scale.value = withSpring(0.98);
        }}
        onPressOut={() => {
          scale.value = withSpring(1);
        }}
      >
        <LinearGradient
          colors={cards.hero.gradient.colors}
          start={cards.hero.gradient.start}
          end={cards.hero.gradient.end}
          style={{
            borderRadius: cards.hero.borderRadius,
            padding: spacing.lg,
            ...shadows.lg,
          }}
        >
          {/* Badge - AI-Powered Styling */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              alignSelf: "flex-start",
              backgroundColor: colors.accent.brassLight,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: borderRadius.pill,
              marginBottom: 20,
            }}
          >
            <Sparkles size={14} color={colors.accent.brass} strokeWidth={2} />
            <Text
              style={{
                ...typography.ui.micro,
                color: colors.accent.brass,
                marginLeft: 6,
              }}
            >
              AI-Powered Styling
            </Text>
          </View>

          {/* Headline */}
          <Text
            style={{
              ...typography.display.screenTitle,
              color: colors.text.inverse,
              marginBottom: 12,
            }}
          >
            Shop smarter with your wardrobe in mind
          </Text>

          {/* Supporting text */}
          <Text
            style={{
              ...typography.ui.body,
              color: "rgba(255, 255, 255, 0.7)",
              marginBottom: spacing.lg,
            }}
          >
            Scan any item to see how it fits with what you already own.
          </Text>

          {/* Primary CTA Button (Inverse - white on dark) */}
          <View
            style={{
              backgroundColor: colors.bg.primary,
              borderRadius: borderRadius.pill,
              paddingVertical: 14,
              paddingHorizontal: spacing.lg,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "center",
            }}
          >
            <Camera size={button.icon.size} color={colors.text.primary} strokeWidth={2} />
            <Text
              style={{
                ...typography.button.primary,
                color: colors.text.primary,
                marginLeft: button.icon.gap,
              }}
            >
              Start Scanning
            </Text>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// Feature Tiles (Try Before Buy & Add to Wardrobe)
function FeatureTiles() {
  const scale1 = useSharedValue(1);
  const scale2 = useSharedValue(1);

  return (
    <View style={{ flexDirection: "row", gap: spacing.md }}>
      {/* Left Tile - Try Before Buy */}
      <Animated.View style={{ flex: 1 }}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/scan");
          }}
          onPressIn={() => {
            scale1.value = withSpring(0.97);
          }}
          onPressOut={() => {
            scale1.value = withSpring(1);
          }}
          style={{
            // V3: cards.standard = border-first, no shadow
            backgroundColor: cards.standard.backgroundColor,
            borderRadius: cards.standard.borderRadius,
            borderWidth: cards.standard.borderWidth,
            borderColor: cards.standard.borderColor,
            padding: spacing.lg,
          }}
        >
          {/* Icon Container - Brass */}
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: borderRadius.md,
              backgroundColor: colors.accent.brass,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: spacing.md,
            }}
          >
            <Puzzle size={22} color={colors.text.inverse} strokeWidth={2} />
          </View>

          {/* Title */}
          <Text
            numberOfLines={1}
            style={{
              ...typography.ui.cardTitle,
              color: colors.text.primary,
              marginBottom: spacing.xs,
            }}
          >
            Scan & Match
          </Text>

          {/* Caption */}
          <Text
            numberOfLines={2}
            style={{
              ...typography.ui.caption,
              color: colors.text.secondary,
            }}
          >
            Scan store items to check compatibility.
          </Text>
        </Pressable>
      </Animated.View>

      {/* Right Tile - Add to Wardrobe */}
      <Animated.View style={{ flex: 1 }}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/add-item");
          }}
          onPressIn={() => {
            scale2.value = withSpring(0.97);
          }}
          onPressOut={() => {
            scale2.value = withSpring(1);
          }}
          style={{
            // V3: cards.standard = border-first, no shadow
            backgroundColor: cards.standard.backgroundColor,
            borderRadius: cards.standard.borderRadius,
            borderWidth: cards.standard.borderWidth,
            borderColor: cards.standard.borderColor,
            padding: spacing.lg,
          }}
        >
          {/* Icon Container - Terracotta */}
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: borderRadius.md,
              backgroundColor: colors.accent.terracotta,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: spacing.md,
            }}
          >
            <Shirt size={22} color={colors.text.inverse} strokeWidth={2} />
          </View>

          {/* Title */}
          <Text
            numberOfLines={1}
            style={{
              ...typography.ui.cardTitle,
              color: colors.text.primary,
              marginBottom: spacing.xs,
            }}
          >
            Build Wardrobe
          </Text>

          {/* Caption */}
          <Text
            numberOfLines={2}
            style={{
              ...typography.ui.caption,
              color: colors.text.secondary,
            }}
          >
            Use it in future matches.
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// Helper to get simple status label
function getStatusLabel(outcome: OutcomeState): string {
  return outcome === "saved_to_revisit" ? "Saved" : "Scanned";
}

// Helper to get relative time
function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString();
}

// TEMPORARY: Debug snapshot modal component
function DebugSnapshotModal({
  visible,
  snapshot,
  onClose,
}: {
  visible: boolean;
  snapshot: any;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const snapshotJson = JSON.stringify(snapshot, null, 2);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    Clipboard.setString(snapshotJson);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!visible || !snapshot) return null;

  // Extract key info for formatted summary
  const engines = snapshot.engines || {};
  const confidence = engines.confidence || {};
  const legacy = engines.legacy || {};
  const topMatches = snapshot.topMatches || [];
  const nearMatches = snapshot.nearMatches || [];
  const suggestions = snapshot.suggestions || {};

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg.primary,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.border.subtle,
          }}
        >
          <View>
            <Text
              style={{
                ...getTextStyle("h2", colors.text.primary),
                fontSize: 18,
              }}
            >
              Debug Snapshot
            </Text>
            <Text
              style={{
                ...getTextStyle("caption", colors.text.tertiary),
                marginTop: 2,
              }}
            >
              {snapshot.version} • {snapshot.scannedCategory}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: borderRadius.card,
              backgroundColor: colors.bg.secondary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} color={colors.text.primary} />
          </Pressable>
        </View>

        {/* Content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={true}
        >
          {/* Engine Status */}
          <View style={{
            backgroundColor: colors.bg.secondary,
            borderRadius: borderRadius.image,
            padding: 12,
            marginBottom: 12,
          }}>
            <Text style={{
              ...getTextStyle("h2"),
              fontSize: 14,
              color: colors.text.primary,
              marginBottom: 8,
            }}>
              Engine Status
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <StatusPill
                label={`Tier: ${confidence.debugTier || 'N/A'}`}
                color={confidence.debugTier === 'HIGH' ? colors.status.success : confidence.debugTier === 'MEDIUM' ? colors.status.warning : colors.status.error}
              />
              <StatusPill
                label={confidence.evaluated ? 'Evaluated' : 'Not Evaluated'}
                color={confidence.evaluated ? colors.status.success : colors.status.error}
              />
              <StatusPill
                label={`Mode ${confidence.suggestionsMode || '?'}`}
                color={colors.status.info}
              />
              {legacy.usedForMatches && (
                <StatusPill label="Legacy Used" color={colors.status.warning} />
              )}
            </View>
          </View>

          {/* Match Counts */}
          <View style={{
            backgroundColor: colors.bg.secondary,
            borderRadius: borderRadius.image,
            padding: 12,
            marginBottom: 12,
          }}>
            <Text style={{
              ...getTextStyle("h2"),
              fontSize: 14,
              color: colors.text.primary,
              marginBottom: 8,
            }}>
              Matches
            </Text>
            <View style={{ flexDirection: "row", gap: 24 }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ ...typography._internal.displayMd, fontSize: 32, color: colors.status.success }}>
                  {confidence.matchesHighCount ?? 0}
                </Text>
                <Text style={{ ...getTextStyle("caption", colors.text.tertiary) }}>
                  HIGH
                </Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ ...typography._internal.displayMd, fontSize: 32, color: colors.status.warning }}>
                  {confidence.nearMatchesCount ?? 0}
                </Text>
                <Text style={{ ...getTextStyle("caption", colors.text.tertiary) }}>
                  NEAR
                </Text>
              </View>
            </View>
          </View>

          {/* Decision Table Info (if v2.0) */}
          {snapshot.inputs && (
            <View style={{
              backgroundColor: colors.bg.secondary,
              borderRadius: borderRadius.image,
              padding: 12,
              marginBottom: 12,
            }}>
              <Text style={{
                ...getTextStyle("h2"),
                fontSize: 14,
                color: colors.text.primary,
                marginBottom: 8,
              }}>
                Decision Table Inputs
              </Text>
              <View style={{ gap: 4 }}>
                <Text style={{ ...getTextStyle("caption", colors.text.secondary) }}>
                  Evaluated: {snapshot.inputs.evaluated ? '✅' : '❌'}
                </Text>
                <Text style={{ ...getTextStyle("caption", colors.text.secondary) }}>
                  High Matches: {snapshot.inputs.highMatchCount}
                </Text>
                <Text style={{ ...getTextStyle("caption", colors.text.secondary) }}>
                  Near Matches: {snapshot.inputs.nearMatchCount}
                </Text>
                <Text style={{ ...getTextStyle("caption", colors.text.secondary) }}>
                  Wardrobe Count: {snapshot.inputs.wardrobeCount}
                </Text>
              </View>
            </View>
          )}

          {snapshot.ruleTrace && (
            <View style={{
              backgroundColor: colors.bg.secondary,
              borderRadius: borderRadius.image,
              padding: 12,
              marginBottom: 12,
            }}>
              <Text style={{
                ...getTextStyle("h2"),
                fontSize: 14,
                color: colors.text.primary,
                marginBottom: 8,
              }}>
                Rule Trace
              </Text>
              <View style={{ gap: 4 }}>
                <Text style={{ ...getTextStyle("caption", colors.text.secondary) }}>
                  Phase 1: Rule {snapshot.ruleTrace.phase1.ruleId} → {snapshot.ruleTrace.phase1.uiState}
                </Text>
                <Text style={{ ...getTextStyle("caption", colors.text.secondary) }}>
                  Phase 2: Rule {snapshot.ruleTrace.phase2.ruleId} → {snapshot.ruleTrace.phase2.variant}
                </Text>
                <Text style={{ ...getTextStyle("caption", colors.text.secondary) }}>
                  Phase 3: Rule {snapshot.ruleTrace.phase3.ruleId} → Mode {snapshot.ruleTrace.phase3.mode}
                </Text>
                <Text style={{ ...getTextStyle("caption", colors.text.secondary) }}>
                  Phase 4: Rule {snapshot.ruleTrace.phase4.ruleId} → Rescan: {snapshot.ruleTrace.phase4.showRescanCta ? 'Yes' : 'No'}
                </Text>
              </View>
            </View>
          )}

          {/* Raw JSON */}
          <View style={{
            backgroundColor: button.primary.backgroundColor,
            borderRadius: borderRadius.image,
            padding: 12,
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{
                ...getTextStyle("caption"),
                fontSize: 12,
                fontFamily: "Inter_600SemiBold",
                color: '#888',
              }}>
                Raw JSON
              </Text>
              <Pressable
                onPress={handleCopy}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  backgroundColor: copied ? colors.status.success : colors.status.info,
                  borderRadius: borderRadius.pill,
                }}
              >
                <Text style={{
                  ...getTextStyle("caption"),
                  fontSize: 12,
                  fontFamily: "Inter_500Medium",
                  color: colors.text.inverse,
                }}>
                  {copied ? 'Copied!' : 'Copy'}
                </Text>
              </Pressable>
            </View>
            <Text
              style={{
                fontFamily: "Courier",
                fontSize: 11,
                color: colors.text.tertiary,
                lineHeight: 16,
              }}
              selectable
            >
              {snapshotJson}
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{
      backgroundColor: `${color}20`,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: borderRadius.pill,
    }}>
      <Text style={{
        ...getTextStyle("caption"),
        fontSize: 11,
        fontFamily: "Inter_500Medium",
        color: color,
      }}>
        {label}
      </Text>
    </View>
  );
}

// Recent check list item with long press to delete
function RecentCheckListItem({
  check,
  index,
  onPress,
  onLongPressDelete,
  onShowDebugSnapshot,
}: {
  check: RecentCheck;
  index: number;
  onPress: (check: RecentCheck) => void;
  onLongPressDelete?: (check: RecentCheck) => void;
  onShowDebugSnapshot?: (snapshot: any) => void;
}) {
  // Calculate tile size for horizontal carousel (slightly larger than 2-column grid)
  const screenWidth = Dimensions.get("window").width;
  const tileSize = screenWidth * 0.42; // ~42% of screen width
  
  // Get current wardrobe and calculate match count
  const { data: wardrobe = [] } = useWardrobe();
  const matchCount = useMatchCount(check, wardrobe);
  
  return (
    <Animated.View
      entering={FadeInDown.delay(400 + index * 60).springify()}
    >
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress(check);
        }}
        onLongPress={() => {
          // Trigger delete on long press
          if (onLongPressDelete) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            onLongPressDelete(check);
          }
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
            padding: 12,
          }}
        >
          <Text
            style={{
              fontFamily: "Inter_600SemiBold",
              fontSize: 14,
              lineHeight: 20,
              color: colors.text.inverse,
            }}
            numberOfLines={1}
          >
            {check.itemName}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                lineHeight: 16,
                color: "rgba(255,255,255,0.85)",
              }}
              numberOfLines={1}
            >
              {getStatusLabel(check.outcome)}
            </Text>
            {matchCount && (
              <View
                style={{
                  backgroundColor: "rgba(255,255,255,0.2)",
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: borderRadius.pill,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 11,
                    lineHeight: 14,
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
    </Animated.View>
  );
}


// Undo Toast Component
function UndoToast({
  visible,
  onUndo,
  onDismiss,
}: {
  visible: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(300).springify().damping(20)}
      exiting={FadeOut.duration(200)}
      style={{
        position: "absolute",
        bottom: 100,
        left: spacing.lg,
        right: spacing.lg,
        zIndex: 1000,
      }}
    >
      <View
        style={{
          backgroundColor: "rgba(28,27,25,0.92)",
          borderRadius: borderRadius.card,
          paddingHorizontal: 20,
          paddingVertical: spacing.md,
          flexDirection: "row",
          alignItems: "center",
          ...shadows.lg,
        }}
      >
        <Text
          style={{
            flex: 1,
            ...typography.ui.body,
            fontFamily: typography.fontFamily.medium,
            color: "rgba(255,255,255,0.9)",
          }}
        >
          Item removed ·{" "}
          <Text
            onPress={onUndo}
            style={{
              fontFamily: typography.fontFamily.semibold,
              color: colors.accent.terracotta,
            }}
          >
            Undo
          </Text>
        </Text>
      </View>
    </Animated.View>
  );
}

// Get category label from category id
function getCategoryLabel(categoryId: string): string {
  const category = CATEGORIES.find((c) => c.id === categoryId);
  return category?.label || categoryId;
}


export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const wardrobeCount = useWardrobeCount();
  const { data: wardrobe = [] } = useWardrobe();
  const { data: recentChecks = [] } = useRecentChecks();
  
  // TEMPORARY: Debug snapshot modal state
  const [showDebugSnapshot, setShowDebugSnapshot] = useState(false);
  const [debugSnapshot, setDebugSnapshot] = useState<any>(null);

  // Wardrobe item delete state
  const removeWardrobeItemMutation = useRemoveWardrobeItem();
  const [wardrobeItemToDelete, setWardrobeItemToDelete] = useState<WardrobeItem | null>(null);
  const [showWardrobeToast, setShowWardrobeToast] = useState(false);

  // Auto-hide wardrobe toast after 2 seconds
  useEffect(() => {
    if (showWardrobeToast) {
      const timeout = setTimeout(() => {
        setShowWardrobeToast(false);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [showWardrobeToast]);

  // Wardrobe delete handlers
  const handleWardrobeDeleteRequest = (item: WardrobeItem) => {
    setWardrobeItemToDelete(item);
  };

  const handleWardrobeConfirmDelete = () => {
    if (!wardrobeItemToDelete) return;
    removeWardrobeItemMutation.mutate(wardrobeItemToDelete.id);
    setWardrobeItemToDelete(null);
    setShowWardrobeToast(true);
  };

  const handleWardrobeCancelDelete = () => {
    setWardrobeItemToDelete(null);
  };

  // Scan item delete state
  const removeRecentCheckMutation = useRemoveRecentCheck();
  const [scanItemToDelete, setScanItemToDelete] = useState<RecentCheck | null>(null);
  const [showScanToast, setShowScanToast] = useState(false);

  // Auto-hide scan toast after 2 seconds
  useEffect(() => {
    if (showScanToast) {
      const timeout = setTimeout(() => {
        setShowScanToast(false);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [showScanToast]);

  // Scan delete handlers
  const handleScanDeleteRequest = (check: RecentCheck) => {
    setScanItemToDelete(check);
  };

  const handleScanConfirmDelete = () => {
    if (!scanItemToDelete) return;
    removeRecentCheckMutation.mutate(scanItemToDelete.id);
    setScanItemToDelete(null);
    setShowScanToast(true);
  };

  const handleScanCancelDelete = () => {
    setScanItemToDelete(null);
  };

  // Force re-render when screen gains focus to update relative timestamps
  const [, setTimestampTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      // Update timestamp tick to force re-render and recalculate relative times
      setTimestampTick(tick => tick + 1);
    }, [])
  );

  // Show up to 5 most recent wardrobe items on home (wardrobe is already sorted by created_at desc)
  const displayedWardrobeItems = wardrobe.slice(0, 5);

  // Use recent checks directly (no filtering needed for carousel)
  const effectiveRecentChecks = recentChecks;

  // Show up to 5 recent checks on home
  const displayedChecks = recentChecks.slice(0, 5);

  // Check if content should be centered (no wardrobe items and no recent checks)
  const shouldCenterContent = wardrobeCount === 0 && effectiveRecentChecks.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ 
          paddingBottom: insets.bottom + 100,
          flexGrow: shouldCenterContent ? 1 : undefined,
          justifyContent: shouldCenterContent ? "center" : undefined,
        }}
      >
        {/* Header */}
        <View style={{ paddingHorizontal: 24, paddingTop: shouldCenterContent ? insets.top + 16 : insets.top + 16 }}>
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View>
                <Text
                  style={{
                    ...getTextStyle("h1", colors.text.primary),
                    letterSpacing: 0.3,
                  }}
                >
                  Scan & Match
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/account");
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
                <User size={18} color={colors.text.primary} strokeWidth={1.5} />
              </Pressable>
            </View>
          </Animated.View>
        </View>

        {/* Main content container - centered when empty */}
        <View style={{ flex: shouldCenterContent ? 0 : undefined }}>
          {/* Hero Card - AI-Powered Styling */}
          <View style={{ paddingHorizontal: 24, marginTop: shouldCenterContent ? spacing.xl : 32 }}>
            <HeroCard 
              onPress={() => router.push("/(tabs)/scan-placeholder")} 
            />
          </View>

          {/* Feature Tiles */}
          <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
            <FeatureTiles />
          </View>
        </View>

        {/* Recent Checks Section - Only show if there are scans */}
        {effectiveRecentChecks.length > 0 && (
          <View style={{ marginTop: 32, marginBottom: 4 }}>
            <View style={{ paddingHorizontal: spacing.lg, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
              <Text
                style={{
                  ...typography.ui.sectionTitle,
                  fontFamily: typography.fontFamily.display, // Use Bodoni for section titles
                  fontSize: 20,
                  color: colors.text.primary,
                }}
              >
                Recent scans
              </Text>
              {effectiveRecentChecks.length > 5 && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/all-checks");
                  }}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                <Text
                  style={{
                    ...typography.ui.label,
                    color: colors.text.secondary,
                    marginRight: spacing.xs,
                  }}
                >
                  View all ({effectiveRecentChecks.length})
                </Text>
                  <ChevronRight size={16} color={colors.text.secondary} />
                </Pressable>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12, gap: 12 }}
              style={{ minHeight: 180 }}
            >
              {displayedChecks.map((check: RecentCheck, index: number) => (
                <RecentCheckListItem
                  key={check.id}
                  check={check}
                  index={index}
                  onPress={(c) => {
                    // Navigate to saved result screen
                    router.push({
                      pathname: "/results",
                      params: { checkId: c.id },
                    });
                  }}
                  onLongPressDelete={handleScanDeleteRequest}
                  onShowDebugSnapshot={(snapshot) => {
                    setDebugSnapshot(snapshot);
                    setShowDebugSnapshot(true);
                  }}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Angled Carousel Gallery - Wardrobe */}
        {wardrobeCount > 0 && (
          <Animated.View
            entering={FadeInDown.delay(400).springify()}
            style={{ marginTop: effectiveRecentChecks.length > 0 ? 16 : 32 }}
          >
            {/* Section header - Aligned with Recent scans */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
              <Text
                style={{
                  ...typography.ui.sectionTitle,
                  fontFamily: typography.fontFamily.display, // Use Bodoni for section titles
                  fontSize: 20,
                  color: colors.text.primary,
                }}
              >
                Your Wardrobe
              </Text>
              {wardrobeCount > 5 && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/wardrobe");
                  }}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  <Text
                    style={{
                      ...typography.ui.label,
                      color: colors.text.secondary,
                      marginRight: spacing.xs,
                    }}
                  >
                    View all ({wardrobeCount})
                  </Text>
                  <ChevronRight size={16} color={colors.text.secondary} />
                </Pressable>
              )}
            </View>

            {/* Wardrobe carousel - Aligned with Recent scans style */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, gap: 12, paddingTop: 12, paddingBottom: 12 }}
            >
              {displayedWardrobeItems.map((item: WardrobeItem, index: number) => {
                const screenWidth = Dimensions.get("window").width;
                const tileSize = screenWidth * 0.42; // Match Recent scans size
                
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push({
                        pathname: "/wardrobe-item",
                        params: { itemId: item.id },
                      });
                    }}
                    onLongPress={() => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                      handleWardrobeDeleteRequest(item);
                    }}
                    delayLongPress={400}
                    style={{
                      width: tileSize,
                      aspectRatio: 1,
                      // V3: cards.standard = border-first
                      backgroundColor: cards.standard.backgroundColor,
                      borderRadius: cards.standard.borderRadius,
                      borderWidth: cards.standard.borderWidth,
                      borderColor: cards.standard.borderColor,
                      overflow: "hidden",
                    }}
                  >
                    {item.imageUri ? (
                      <Image
                        source={{ uri: item.imageUri }}
                        style={{ width: "100%", height: "100%" }}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg.secondary }}>
                        <Shirt size={48} color={colors.text.tertiary} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        )}
      </ScrollView>

      {/* TEMPORARY: Debug Snapshot Modal */}
      <DebugSnapshotModal
        visible={showDebugSnapshot}
        snapshot={debugSnapshot}
        onClose={() => {
          setShowDebugSnapshot(false);
          setDebugSnapshot(null);
        }}
      />

      {/* Wardrobe Item Delete Confirmation Modal */}
      <Modal
        visible={!!wardrobeItemToDelete}
        transparent
        animationType="fade"
        onRequestClose={handleWardrobeCancelDelete}
      >
        <Pressable
          onPress={handleWardrobeCancelDelete}
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
              Remove {wardrobeItemToDelete?.detectedLabel || "item"}?
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
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  handleWardrobeConfirmDelete();
                }}
                style={{
                  backgroundColor: colors.state.destructive,
                  borderRadius: borderRadius.pill,
                  height: 52,
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
              <Pressable
                onPress={handleWardrobeCancelDelete}
                style={{
                  backgroundColor: colors.bg.secondary,
                  borderRadius: borderRadius.pill,
                  height: 52,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: colors.border.hairline,
                }}
              >
                <Text
                  style={{
                    ...typography.button.primary,
                    color: colors.text.primary,
                  }}
                >
                  Cancel
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Wardrobe Success Toast */}
      {showWardrobeToast && (
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
              paddingHorizontal: 20,
              paddingVertical: 16,
              alignItems: "center",
              ...shadows.lg,
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 15,
                color: colors.text.inverse,
              }}
            >
              Removed from Wardrobe
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Scan Item Delete Confirmation Modal */}
      <Modal
        visible={!!scanItemToDelete}
        transparent
        animationType="fade"
        onRequestClose={handleScanCancelDelete}
      >
        <Pressable
          onPress={handleScanCancelDelete}
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
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  handleScanConfirmDelete();
                }}
                style={{
                  backgroundColor: colors.state.destructive,
                  borderRadius: borderRadius.pill,
                  height: 52,
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
              <Pressable
                onPress={handleScanCancelDelete}
                style={{
                  backgroundColor: colors.bg.secondary,
                  borderRadius: borderRadius.pill,
                  height: 52,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: colors.border.hairline,
                }}
              >
                <Text
                  style={{
                    ...typography.button.primary,
                    color: colors.text.primary,
                  }}
                >
                  Cancel
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Scan Success Toast */}
      {showScanToast && (
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
              paddingHorizontal: 20,
              paddingVertical: 16,
              alignItems: "center",
              ...shadows.lg,
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 15,
                color: colors.text.inverse,
              }}
            >
              Removed from Recent scans
            </Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}
