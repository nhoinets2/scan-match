import React, { useState, useEffect } from "react";
import { View, Text, Pressable, Dimensions, ScrollView, Modal } from "react-native";
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
import Clipboard from "@react-native-clipboard/clipboard";
import { ArrowLeft, Clock, Copy, X, CloudUpload, RefreshCw } from "lucide-react-native";
import { GridPlaceholderImage } from "@/components/PlaceholderImage";

import { useRecentChecks, useRemoveRecentCheck, SCAN_RETENTION, useWardrobe } from "@/lib/database";
import { hasPendingUpload, isUploadFailed } from "@/lib/storage";
import { colors, typography, spacing, borderRadius, cards, shadows, button } from "@/lib/design-tokens";
import { getTextStyle } from "@/lib/typography-helpers";
import { OutcomeState, RecentCheck } from "@/lib/types";
import { ButtonSecondary } from "@/components/ButtonSecondary";
import { useMatchCount } from "@/lib/useMatchCount";

// Helper to get status display info
function getStatusDisplay(outcome: OutcomeState): { label: string; isSaved: boolean } {
  if (outcome === "saved_to_revisit") {
    return { label: "Saved", isSaved: true };
  }
  return { label: "Scanned", isSaved: false };
}

// Grid tile for checks (matches Recent Scans style)
function CheckGridItem({
  check,
  index,
  onPress,
  onLongPress,
  tileSize,
  onShowDebugSnapshot,
}: {
  check: RecentCheck;
  index: number;
  onPress: (check: RecentCheck) => void;
  onLongPress: (check: RecentCheck) => void;
  tileSize: number;
  onShowDebugSnapshot?: (snapshot: any) => void;
}) {
  const statusDisplay = getStatusDisplay(check.outcome);
  
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
          <GridPlaceholderImage />
        )}

        {/* Sync status indicator - based on queue state */}
        {(hasPendingUpload(check.id) || isUploadFailed(check.id)) && (
          <View
            style={{
              position: "absolute",
              top: spacing.sm,
              right: spacing.sm,
              backgroundColor: isUploadFailed(check.id) ? colors.status.error : colors.overlay.dark,
              borderRadius: borderRadius.pill,
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.sm,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs / 2,
            }}
          >
            {isUploadFailed(check.id) ? (
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
            You'll lose the outfits and match details with it.
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
            padding: spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.border.subtle,
          }}
        >
          <View>
            <Text
              style={{
                ...typography.ui.sectionTitle,
                color: colors.text.primary,
              }}
            >
              Debug Snapshot
            </Text>
            <Text
              style={{
                ...typography.ui.caption,
                color: colors.text.tertiary,
                marginTop: spacing.xs / 2,
              }}
            >
              {snapshot.version} • {snapshot.scannedCategory}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            style={{
              width: spacing.xl,
              height: spacing.xl,
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
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
          showsVerticalScrollIndicator={true}
        >
          {/* Engine Status */}
          <View style={{
            backgroundColor: colors.bg.secondary,
            borderRadius: borderRadius.image,
            padding: spacing.md,
            marginBottom: spacing.md,
          }}>
            <Text style={{
              ...typography.ui.cardTitle,
              color: colors.text.primary,
              marginBottom: spacing.sm,
            }}>
              Engine Status
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
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
            padding: spacing.md,
            marginBottom: spacing.md,
          }}>
            <Text style={{
              ...typography.ui.cardTitle,
              color: colors.text.primary,
              marginBottom: spacing.sm,
            }}>
              Matches
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.lg }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ ...typography._internal.displayMd, fontSize: 32, color: colors.status.success }}>
                  {confidence.matchesHighCount ?? 0}
                </Text>
                <Text style={{ ...typography.ui.caption, color: colors.text.tertiary }}>
                  HIGH
                </Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ ...typography._internal.displayMd, fontSize: 32, color: colors.status.warning }}>
                  {confidence.nearMatchesCount ?? 0}
                </Text>
                <Text style={{ ...typography.ui.caption, color: colors.text.tertiary }}>
                  NEAR
                </Text>
              </View>
            </View>
          </View>

          {/* Top Matches Detail */}
          {topMatches.length > 0 && (
            <View style={{
              backgroundColor: colors.bg.secondary,
              borderRadius: borderRadius.image,
              padding: 12,
              marginBottom: 12,
            }}>
              <Text style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 14,
                color: colors.text.primary,
                marginBottom: 8,
              }}>
                Top Matches ({topMatches.length})
              </Text>
              {topMatches.map((match: any, i: number) => (
                <View key={i} style={{
                  paddingVertical: 8,
                  borderTopWidth: i > 0 ? 1 : 0,
                  borderTopColor: colors.border.subtle,
                }}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.text.primary }}>
                    {match.pairType} • Score: {(match.rawScore * 100).toFixed(0)}%
                  </Text>
                  {match.caps?.length > 0 && (
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.text.tertiary, marginTop: 2 }}>
                      Caps: {match.caps.join(', ')}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Near Matches Detail */}
          {nearMatches.length > 0 && (
            <View style={{
              backgroundColor: colors.bg.secondary,
              borderRadius: borderRadius.image,
              padding: 12,
              marginBottom: 12,
            }}>
              <Text style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 14,
                color: colors.text.primary,
                marginBottom: 8,
              }}>
                Near Matches ({nearMatches.length})
              </Text>
              {nearMatches.map((match: any, i: number) => (
                <View key={i} style={{
                  paddingVertical: 8,
                  borderTopWidth: i > 0 ? 1 : 0,
                  borderTopColor: colors.border.subtle,
                }}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.text.primary }}>
                    {match.pairType} • Score: {(match.rawScore * 100).toFixed(0)}%
                    {match.isType2a && ' (2a)'}
                    {match.isType2b && ' (2b)'}
                  </Text>
                  {match.caps?.length > 0 && (
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.text.tertiary, marginTop: 2 }}>
                      Caps: {match.caps.join(', ')}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Suggestions */}
          {(suggestions.modeABullets?.length > 0 || suggestions.modeBBullets?.length > 0) && (
            <View style={{
              backgroundColor: colors.bg.secondary,
              borderRadius: borderRadius.image,
              padding: 12,
              marginBottom: 12,
            }}>
              <Text style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 14,
                color: colors.text.primary,
                marginBottom: 8,
              }}>
                Suggestions
              </Text>
              {suggestions.modeABullets?.map((bullet: string, i: number) => (
                <Text key={`a-${i}`} style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text.secondary, marginBottom: 6 }}>
                  • {bullet}
                </Text>
              ))}
              {suggestions.modeBBullets?.map((bullet: string, i: number) => (
                <Text key={`b-${i}`} style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.text.secondary, marginBottom: 6 }}>
                  • {bullet}
                </Text>
              ))}
            </View>
          )}

          {/* Raw JSON */}
          <View style={{
            backgroundColor: button.primary.backgroundColor,
            borderRadius: borderRadius.image,
            padding: 12,
          }}>
            <Text style={{
              fontFamily: "Inter_600SemiBold",
              fontSize: 12,
              color: '#888',
              marginBottom: 8,
            }}>
              Raw JSON
            </Text>
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

        {/* Footer with copy button */}
        <View
          style={{
            padding: spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.border.subtle,
          }}
        >
          <Pressable
            onPress={handleCopy}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: copied ? colors.status.success : colors.accent.terracotta,
              paddingVertical: spacing.md + spacing.xs / 2,
              paddingHorizontal: spacing.lg,
              borderRadius: borderRadius.image,
              gap: spacing.sm,
            }}
          >
            <Copy size={18} color={colors.text.inverse} />
            <Text
              style={{
                ...typography.button.primary,
                color: colors.text.inverse,
              }}
            >
              {copied ? 'Copied!' : 'Copy JSON to Clipboard'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// Helper component for status pills
function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{
      backgroundColor: `${color}20`,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.pill,
      borderWidth: 1,
      borderColor: `${color}40`,
    }}>
      <Text style={{
        ...typography.ui.micro,
        color: color,
      }}>
        {label}
      </Text>
    </View>
  );
}

export default function AllChecksScreen() {
  const insets = useSafeAreaInsets();
  const { data: recentChecks = [] } = useRecentChecks();
  const removeRecentCheckMutation = useRemoveRecentCheck();
  const [itemToDelete, setItemToDelete] = useState<RecentCheck | null>(null);
  const [showToast, setShowToast] = useState(false);
  // TEMPORARY: Debug snapshot modal state
  const [showDebugSnapshot, setShowDebugSnapshot] = useState(false);
  const [debugSnapshot, setDebugSnapshot] = useState<any>(null);

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
  const handleDeleteRequest = (check: RecentCheck) => {
    setItemToDelete(check);
  };

  // Confirm delete action
  const handleConfirmDelete = () => {
    if (!itemToDelete) return;
    removeRecentCheckMutation.mutate({ id: itemToDelete.id, imageUri: itemToDelete.imageUri });
    setItemToDelete(null);
    setShowToast(true);
  };

  // Cancel delete action
  const handleCancelDelete = () => {
    setItemToDelete(null);
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleCheckPress = (check: RecentCheck) => {
    // Navigate to saved result screen
    router.push({
      pathname: "/results",
      params: { checkId: check.id },
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
        </Animated.View>
      </View>

      {/* Grid */}
      {recentChecks.length > 0 ? (
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
            {recentChecks.map((check: RecentCheck, index: number) => {
              // Calculate tile size for 2-column grid with spacing.md padding on each side and spacing.md gap
              const screenWidth = Dimensions.get("window").width;
              const tileSize = (screenWidth - spacing.md * 2 - spacing.md) / 2;
              
              return (
                <CheckGridItem
                  key={check.id}
                  check={check}
                  index={index}
                  onPress={handleCheckPress}
                  onLongPress={handleDeleteRequest}
                  tileSize={tileSize}
                  onShowDebugSnapshot={(snapshot) => {
                    setDebugSnapshot(snapshot);
                    setShowDebugSnapshot(true);
                  }}
                />
              );
            })}
          </View>
          
          {/* Retention notice */}
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
        message="Removed from All scans"
      />

      {/* TEMPORARY: Debug Snapshot Modal */}
      <DebugSnapshotModal
        visible={showDebugSnapshot}
        snapshot={debugSnapshot}
        onClose={() => {
          setShowDebugSnapshot(false);
          setDebugSnapshot(null);
        }}
      />
    </View>
  );
}
