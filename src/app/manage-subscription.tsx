import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { ChevronLeft, User, Infinity, Sparkles, Crown, Zap, Star } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { useProStatus } from "@/lib/useProStatus";
import { restorePurchases } from "@/lib/revenuecatClient";
import { useUsageQuota, USAGE_LIMITS } from "@/lib/database";
import { colors, spacing, typography, borderRadius, cards, shadows } from "@/lib/design-tokens";
import { ButtonPrimary } from "@/components/ButtonPrimary";
import { ButtonSecondaryOutline } from "@/components/ButtonSecondaryOutline";
import { Paywall } from "@/components/Paywall";

export default function ManageSubscriptionScreen() {
  const { isPro, isLoading: isLoadingPro, refetch: refetchProStatus } = useProStatus();
  const { 
    scansUsed, 
    wardrobeAddsUsed, 
    remainingScans, 
    remainingWardrobeAdds,
    isLoading: isLoadingQuota,
  } = useUsageQuota();
  
  const [showPaywall, setShowPaywall] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleUpgrade = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowPaywall(true);
  };

  const handleRestorePurchases = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRestoring(true);
    try {
      await restorePurchases();
      await refetchProStatus();
    } catch (error) {
      console.error("Restore purchases error:", error);
    } finally {
      setIsRestoring(false);
    }
  };

  // Calculate progress percentages
  const scansProgress = USAGE_LIMITS.FREE_SCANS > 0 
    ? Math.min(scansUsed / USAGE_LIMITS.FREE_SCANS, 1) 
    : 0;
  const wardrobeProgress = USAGE_LIMITS.FREE_WARDROBE_ADDS > 0 
    ? Math.min(wardrobeAddsUsed / USAGE_LIMITS.FREE_WARDROBE_ADDS, 1) 
    : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Drag handle for modal feel */}
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
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
          }}
        >
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <Text
              style={{
                ...typography.display.screenTitle,
                letterSpacing: 0.3,
              }}
            >
              Manage Subscription
            </Text>
          </Animated.View>
          {/* Separator line */}
          <View style={{ marginTop: spacing.md, height: 1, backgroundColor: colors.border.hairline }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.xl,
          }}
          showsVerticalScrollIndicator={false}
        >
        {/* Current Plan Card */}
        <Animated.View
          entering={FadeInDown.delay(150).duration(400)}
          style={{ marginTop: spacing.md }}
        >
          <View
            style={{
              backgroundColor: cards.standard.backgroundColor,
              borderWidth: cards.standard.borderWidth,
              borderColor: cards.standard.borderColor,
              borderRadius: cards.standard.borderRadius,
              padding: spacing.lg,
            }}
          >
            {/* Plan header */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.lg }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: isPro ? "#FFF4EF" : colors.surface.icon,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: spacing.sm,
                }}
              >
                {isPro ? (
                  <Crown size={16} color="#E86A33" strokeWidth={2} />
                ) : (
                  <User size={16} color={colors.text.secondary} strokeWidth={2} />
                )}
              </View>
              <Text
                style={{
                  ...typography.ui.cardTitle,
                  color: colors.text.primary,
                }}
              >
                {isLoadingPro ? "Loading..." : isPro ? "Pro Plan" : "Free Plan"}
              </Text>
            </View>

            {/* Usage stats - only show for free users */}
            {!isPro && (
              <>
                {/* Separator */}
                <View
                  style={{
                    height: 1,
                    backgroundColor: colors.border.hairline,
                    marginBottom: spacing.lg,
                  }}
                />

                {/* Scans usage */}
                <View style={{ marginBottom: spacing.lg }}>
                  <Text
                    style={{
                      ...typography.ui.label,
                      color: colors.text.secondary,
                      marginBottom: spacing.sm,
                    }}
                  >
                    Scans Used
                  </Text>
                  {/* Progress bar - empty container always visible */}
                  <View
                    style={{
                      height: 6,
                      width: "100%",
                      backgroundColor: colors.border.subtle,
                      borderRadius: 3,
                      marginBottom: spacing.sm,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        height: "100%",
                        width: `${scansProgress * 100}%`,
                        backgroundColor: colors.accent.terracotta,
                        borderRadius: 3,
                      }}
                    />
                  </View>
                  <Text
                    style={{
                      ...typography.ui.bodyMedium,
                      color: colors.text.primary,
                    }}
                  >
                    {isLoadingQuota ? "—" : scansUsed} of {USAGE_LIMITS.FREE_SCANS} scans used
                  </Text>
                  <Text
                    style={{
                      ...typography.ui.caption,
                      color: colors.text.secondary,
                      marginTop: 2,
                    }}
                  >
                    {isLoadingQuota ? "—" : remainingScans} free scans remaining
                  </Text>
                </View>

                {/* Wardrobe adds usage */}
                <View>
                  <Text
                    style={{
                      ...typography.ui.label,
                      color: colors.text.secondary,
                      marginBottom: spacing.sm,
                    }}
                  >
                    Wardrobe Adds Used
                  </Text>
                  {/* Progress bar - empty container always visible */}
                  <View
                    style={{
                      height: 6,
                      width: "100%",
                      backgroundColor: colors.border.subtle,
                      borderRadius: 3,
                      marginBottom: spacing.sm,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        height: "100%",
                        width: `${wardrobeProgress * 100}%`,
                        backgroundColor: colors.accent.terracotta,
                        borderRadius: 3,
                      }}
                    />
                  </View>
                  <Text
                    style={{
                      ...typography.ui.bodyMedium,
                      color: colors.text.primary,
                    }}
                  >
                    {isLoadingQuota ? "—" : wardrobeAddsUsed} of {USAGE_LIMITS.FREE_WARDROBE_ADDS} wardrobe adds used
                  </Text>
                  <Text
                    style={{
                      ...typography.ui.caption,
                      color: colors.text.secondary,
                      marginTop: 2,
                    }}
                  >
                    {isLoadingQuota ? "—" : remainingWardrobeAdds} free wardrobe adds remaining
                  </Text>
                </View>
              </>
            )}

            {/* Pro status message */}
            {isPro && (
              <Text
                style={{
                  ...typography.ui.body,
                  color: "#E86A33",
                }}
              >
                You have unlimited access to all features.
              </Text>
            )}
          </View>
        </Animated.View>

        {/* Unlock with Pro section - only show for free users */}
        {!isPro && (
          <Animated.View
            entering={FadeInDown.delay(250).duration(400)}
            style={{ marginTop: spacing.xl }}
          >
            <Text
              style={{
                ...typography.ui.label,
                color: colors.text.secondary,
                marginBottom: spacing.md,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Unlock with Pro
            </Text>

            <View
              style={{
                backgroundColor: cards.standard.backgroundColor,
                borderWidth: cards.standard.borderWidth,
                borderColor: cards.standard.borderColor,
                borderRadius: cards.standard.borderRadius,
                padding: spacing.lg,
              }}
            >
              {/* Benefit 1 - Unlimited wardrobe scans */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: colors.surface.icon,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: spacing.md,
                  }}
                >
                  <Infinity size={18} color={colors.text.secondary} strokeWidth={2} />
                </View>
                <Text
                  style={{
                    ...typography.ui.bodyMedium,
                    color: colors.text.primary,
                    flex: 1,
                  }}
                >
                  Unlimited wardrobe scans
                </Text>
              </View>

              {/* Benefit 2 - Unlimited in-store checks */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: colors.surface.icon,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: spacing.md,
                  }}
                >
                  <Zap size={18} color={colors.text.secondary} strokeWidth={2} />
                </View>
                <Text
                  style={{
                    ...typography.ui.bodyMedium,
                    color: colors.text.primary,
                    flex: 1,
                  }}
                >
                  Unlimited in-store checks
                </Text>
              </View>

              {/* Benefit 3 - AI-powered outfit suggestions */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: colors.surface.icon,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: spacing.md,
                  }}
                >
                  <Sparkles size={18} color={colors.text.secondary} strokeWidth={2} />
                </View>
                <Text
                  style={{
                    ...typography.ui.bodyMedium,
                    color: colors.text.primary,
                    flex: 1,
                  }}
                >
                  AI-powered outfit suggestions
                </Text>
              </View>

              {/* Benefit 4 - Priority processing */}
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: colors.surface.icon,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: spacing.md,
                  }}
                >
                  <Star size={18} color={colors.text.secondary} strokeWidth={2} />
                </View>
                <Text
                  style={{
                    ...typography.ui.bodyMedium,
                    color: colors.text.primary,
                    flex: 1,
                  }}
                >
                  Priority processing
                </Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Action buttons */}
        <Animated.View
          entering={FadeInDown.delay(350).duration(400)}
          style={{ marginTop: spacing.xl }}
        >
          {!isPro && (
            <ButtonPrimary
              label="Upgrade to Pro"
              onPress={handleUpgrade}
              style={{ marginBottom: spacing.md }}
            />
          )}

          <ButtonSecondaryOutline
            label={isRestoring ? "Restoring..." : "Restore Purchases"}
            onPress={handleRestorePurchases}
            disabled={isRestoring}
          />
        </Animated.View>

        {/* Legal text */}
        <Animated.View
          entering={FadeInDown.delay(450).duration(400)}
          style={{ marginTop: spacing.xl }}
        >
          <Text
            style={{
              ...typography.ui.micro,
              color: colors.text.tertiary,
              textAlign: "center",
              lineHeight: 18,
            }}
          >
            Subscriptions are managed through your Apple ID account. Payment will be charged to your account at confirmation of purchase. Subscription automatically renews unless canceled at least 24 hours before the end of the current period. You can manage and cancel your subscriptions by going to your account settings on the App Store.
          </Text>
        </Animated.View>
        </ScrollView>
      </SafeAreaView>

      {/* Paywall */}
      <Paywall
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onPurchaseComplete={() => {
          setShowPaywall(false);
          refetchProStatus();
        }}
        reason="upgrade"
      />
    </View>
  );
}
