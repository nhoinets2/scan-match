/**
 * Paywall Component - Premium subscription upgrade screen
 *
 * Shows when user exceeds free quota for scanning features.
 * Offers monthly ($5.99) and annual ($39.99) subscription options.
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  X,
  Check,
  Sparkles,
  Zap,
  Shirt,
  Star,
  Crown,
} from "lucide-react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { PurchasesPackage } from "react-native-purchases";

import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  hasEntitlement,
  isRevenueCatEnabled,
} from "@/lib/revenuecatClient";
import { borderRadius, spacing } from "@/lib/design-tokens";

// Paywall colors (per spec)
const PAYWALL_COLORS = {
  background: "#FAFAFA",
  primaryText: "#171717",
  secondaryText: "#6B6B6B",
  accent: "#E86A33",
  accentLight: "#FFF4EF",
  border: "#E5E5E5",
  cardBg: "#FFFFFF",
  bestValueBg: "#E86A33",
} as const;

// Legal URLs (placeholders - replace with actual URLs)
const LEGAL_URLS = {
  terms: "https://fitmatch.app/terms",
  privacy: "https://fitmatch.app/privacy",
} as const;

type PaywallReason = "in_store_limit" | "wardrobe_limit";

interface PaywallProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  reason: PaywallReason;
}

// Benefits list
const BENEFITS = [
  { icon: Zap, text: "Unlimited in-store scans" },
  { icon: Shirt, text: "Unlimited wardrobe adds" },
  { icon: Sparkles, text: "More outfit ideas" },
  { icon: Star, text: "Priority results" },
];

function PlanCard({
  isAnnual,
  isSelected,
  onSelect,
  price,
  monthlyEquivalent,
  savings,
}: {
  isAnnual: boolean;
  isSelected: boolean;
  onSelect: () => void;
  price: string;
  monthlyEquivalent?: string;
  savings?: string;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onSelect();
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={{
          backgroundColor: PAYWALL_COLORS.cardBg,
          borderRadius: borderRadius.card,
          borderWidth: isSelected ? 2 : 1,
          borderColor: isSelected ? PAYWALL_COLORS.accent : PAYWALL_COLORS.border,
          padding: spacing.md,
          position: "relative",
          overflow: "visible",
        }}
      >
        {/* Best value badge for annual */}
        {isAnnual && (
          <View
            style={{
              position: "absolute",
              top: -10,
              left: spacing.md,
              backgroundColor: PAYWALL_COLORS.bestValueBg,
              paddingHorizontal: spacing.sm,
              paddingVertical: 4,
              borderRadius: borderRadius.pill,
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 11,
                color: "#FFFFFF",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Best value
            </Text>
          </View>
        )}

        {/* Selection indicator */}
        <View
          style={{
            position: "absolute",
            top: spacing.md,
            right: spacing.md,
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: isSelected ? 0 : 1.5,
            borderColor: PAYWALL_COLORS.border,
            backgroundColor: isSelected ? PAYWALL_COLORS.accent : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isSelected && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
        </View>

        {/* Plan details */}
        <Text
          style={{
            fontFamily: "Inter_600SemiBold",
            fontSize: 15,
            color: PAYWALL_COLORS.primaryText,
            marginBottom: spacing.xs,
            marginTop: isAnnual ? spacing.sm : 0,
          }}
        >
          {isAnnual ? "Annual" : "Monthly"}
        </Text>

        <Text
          style={{
            fontFamily: "Inter_600SemiBold",
            fontSize: 22,
            color: PAYWALL_COLORS.primaryText,
            marginBottom: isAnnual ? spacing.xs : 0,
          }}
        >
          {price}
          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              color: PAYWALL_COLORS.secondaryText,
            }}
          >
            {isAnnual ? " / year" : " / month"}
          </Text>
        </Text>

        {isAnnual && monthlyEquivalent && (
          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 13,
              color: PAYWALL_COLORS.secondaryText,
            }}
          >
            Only {monthlyEquivalent}/mo
          </Text>
        )}

        {isAnnual && savings && (
          <Text
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 12,
              color: PAYWALL_COLORS.accent,
              marginTop: 4,
            }}
          >
            {savings}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function Paywall({ visible, onClose, onSuccess, reason }: PaywallProps) {
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<"annual" | "monthly">("annual");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Fetch offerings from RevenueCat
  const {
    data: offerings,
    isLoading: isLoadingOfferings,
  } = useQuery({
    queryKey: ["revenuecat-offerings"],
    queryFn: async () => {
      const result = await getOfferings();
      if (result.ok) {
        return result.data;
      }
      return null;
    },
    enabled: visible && isRevenueCatEnabled(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Get packages
  const monthlyPackage = offerings?.current?.availablePackages.find(
    (pkg) => pkg.identifier === "$rc_monthly"
  );
  const annualPackage = offerings?.current?.availablePackages.find(
    (pkg) => pkg.identifier === "$rc_annual"
  );

  // Format prices
  const monthlyPrice = monthlyPackage?.product.priceString || "$5.99";
  const annualPrice = annualPackage?.product.priceString || "$39.99";
  const annualMonthlyEquivalent = "$3.33"; // 39.99 / 12
  const annualSavings = "Save 44%";

  const handlePurchase = async () => {
    const packageToPurchase = selectedPlan === "annual" ? annualPackage : monthlyPackage;

    if (!packageToPurchase) {
      console.log("[Paywall] No package available for purchase");
      return;
    }

    setIsPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await purchasePackage(packageToPurchase);

      if (result.ok) {
        // Check if purchase granted the "pro" entitlement
        const hasProResult = await hasEntitlement("pro");
        if (hasProResult.ok && hasProResult.data) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onSuccess();
        }
      }
    } catch (error) {
      console.log("[Paywall] Purchase error:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const result = await restorePurchases();

      if (result.ok) {
        // Check if restore gave us the "pro" entitlement
        const hasProResult = await hasEntitlement("pro");
        if (hasProResult.ok && hasProResult.data) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onSuccess();
        }
      }
    } catch (error) {
      console.log("[Paywall] Restore error:", error);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleOpenLink = (url: string) => {
    Linking.openURL(url);
  };

  // Header text based on reason
  const headerText =
    reason === "in_store_limit"
      ? "You've used your 5 free in-store scans"
      : "You've used your 15 free wardrobe adds";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: PAYWALL_COLORS.background,
        }}
      >
        {/* Close button */}
        <View
          style={{
            paddingTop: insets.top + spacing.sm,
            paddingHorizontal: spacing.lg,
            alignItems: "flex-end",
          }}
        >
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onClose();
            }}
            hitSlop={12}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: "rgba(0,0,0,0.05)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} color={PAYWALL_COLORS.secondaryText} strokeWidth={2} />
          </Pressable>
        </View>

        {/* Content */}
        <View style={{ flex: 1, paddingHorizontal: spacing.lg }}>
          {/* Header */}
          <Animated.View
            entering={FadeInDown.delay(100)}
            style={{ alignItems: "center", marginTop: spacing.lg }}
          >
            {/* Crown icon */}
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: PAYWALL_COLORS.accentLight,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing.md,
              }}
            >
              <Crown size={32} color={PAYWALL_COLORS.accent} strokeWidth={1.5} />
            </View>

            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 20,
                color: PAYWALL_COLORS.primaryText,
                textAlign: "center",
                marginBottom: spacing.xs,
              }}
            >
              {headerText}
            </Text>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 15,
                color: PAYWALL_COLORS.secondaryText,
                textAlign: "center",
              }}
            >
              Go unlimited with Pro.
            </Text>
          </Animated.View>

          {/* Benefits */}
          <Animated.View
            entering={FadeInDown.delay(200)}
            style={{ marginTop: spacing.xl }}
          >
            {BENEFITS.map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                <View
                  key={index}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: spacing.md,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: PAYWALL_COLORS.accentLight,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: spacing.md,
                    }}
                  >
                    <Icon size={16} color={PAYWALL_COLORS.accent} strokeWidth={2} />
                  </View>
                  <Text
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 15,
                      color: PAYWALL_COLORS.primaryText,
                    }}
                  >
                    {benefit.text}
                  </Text>
                </View>
              );
            })}
          </Animated.View>

          {/* Plan selector */}
          <Animated.View
            entering={FadeInDown.delay(300)}
            style={{
              flexDirection: "row",
              gap: spacing.md,
              marginTop: spacing.xl,
            }}
          >
            <View style={{ flex: 1 }}>
              <PlanCard
                isAnnual={true}
                isSelected={selectedPlan === "annual"}
                onSelect={() => setSelectedPlan("annual")}
                price={annualPrice}
                monthlyEquivalent={annualMonthlyEquivalent}
                savings={annualSavings}
              />
            </View>
            <View style={{ flex: 1 }}>
              <PlanCard
                isAnnual={false}
                isSelected={selectedPlan === "monthly"}
                onSelect={() => setSelectedPlan("monthly")}
                price={monthlyPrice}
              />
            </View>
          </Animated.View>
        </View>

        {/* Bottom section */}
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingBottom: insets.bottom + spacing.md,
          }}
        >
          {/* CTA Button */}
          <Animated.View entering={FadeInUp.delay(400)}>
            <Pressable
              onPress={handlePurchase}
              disabled={isPurchasing || isLoadingOfferings}
              style={({ pressed }) => ({
                height: 56,
                borderRadius: borderRadius.pill,
                backgroundColor: PAYWALL_COLORS.accent,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.9 : 1,
              })}
            >
              {isPurchasing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 16,
                    color: "#FFFFFF",
                  }}
                >
                  {selectedPlan === "annual"
                    ? "Start Pro (Annual)"
                    : "Start Pro (Monthly)"}
                </Text>
              )}
            </Pressable>
          </Animated.View>

          {/* Restore purchases */}
          <Pressable
            onPress={handleRestore}
            disabled={isRestoring}
            style={{
              alignItems: "center",
              marginTop: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color={PAYWALL_COLORS.secondaryText} />
            ) : (
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 14,
                  color: PAYWALL_COLORS.secondaryText,
                }}
              >
                Restore purchases
              </Text>
            )}
          </Pressable>

          {/* Legal footer */}
          <View style={{ alignItems: "center", marginTop: spacing.md }}>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 11,
                color: PAYWALL_COLORS.secondaryText,
                textAlign: "center",
                lineHeight: 16,
              }}
            >
              Subscription auto-renews. Cancel anytime in Settings.
            </Text>
            <View
              style={{
                flexDirection: "row",
                marginTop: spacing.xs,
              }}
            >
              <Pressable onPress={() => handleOpenLink(LEGAL_URLS.terms)}>
                <Text
                  style={{
                    fontFamily: "Inter_400Regular",
                    fontSize: 11,
                    color: PAYWALL_COLORS.secondaryText,
                    textDecorationLine: "underline",
                  }}
                >
                  Terms
                </Text>
              </Pressable>
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 11,
                  color: PAYWALL_COLORS.secondaryText,
                  marginHorizontal: spacing.xs,
                }}
              >
                •
              </Text>
              <Pressable onPress={() => handleOpenLink(LEGAL_URLS.privacy)}>
                <Text
                  style={{
                    fontFamily: "Inter_400Regular",
                    fontSize: 11,
                    color: PAYWALL_COLORS.secondaryText,
                    textDecorationLine: "underline",
                  }}
                >
                  Privacy
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
