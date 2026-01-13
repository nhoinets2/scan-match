/**
 * Paywall Component - Premium subscription upgrade screen
 *
 * Shows when user exceeds free quota for scanning features.
 * Offers monthly ($5.99) and annual ($39.99) subscription options.
 * 
 * Uses design token system for consistent styling.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ActivityIndicator,
  Linking,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
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
  Infinity,
} from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";

import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  hasEntitlement,
  isRevenueCatEnabled,
} from "@/lib/revenuecatClient";
import {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  cards,
  button,
} from "@/lib/design-tokens";

// Legal URLs
const LEGAL_URLS = {
  terms: "https://snaptomatch.app/terms",
  privacy: "https://snaptomatch.app/privacy",
} as const;

type PaywallReason = "in_store_limit" | "wardrobe_limit";

interface PaywallProps {
  visible: boolean;
  onClose: () => void;
  onPurchaseComplete?: () => void;
  reason: PaywallReason;
}

// Benefits with icons
const BENEFITS = [
  { icon: Infinity, text: "Unlimited wardrobe scans", highlight: true },
  { icon: Zap, text: "Unlimited in-store checks" },
  { icon: Sparkles, text: "AI-powered outfit suggestions" },
  { icon: Star, text: "Priority processing" },
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
    <View>
      <Animated.View style={animatedStyle}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onSelect();
          }}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={{
            backgroundColor: colors.bg.secondary,
            borderRadius: borderRadius.card,
            borderWidth: isSelected ? 2 : 1,
            borderColor: isSelected ? colors.accent.terracotta : colors.border.hairline,
            padding: spacing.md,
            position: "relative",
            overflow: "visible",
            minHeight: isAnnual ? 140 : 100,
          }}
        >
          {/* Best value badge for annual */}
          {isAnnual && (
            <View
              style={{
                position: "absolute",
                top: -12,
                left: spacing.md,
                backgroundColor: colors.accent.terracotta,
                paddingHorizontal: spacing.sm + 2,
                paddingVertical: spacing.xs,
                borderRadius: borderRadius.pill,
              }}
            >
              <Text
                style={{
                  ...typography.ui.micro,
                  color: colors.text.inverse,
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
              width: 22,
              height: 22,
              borderRadius: 11,
              borderWidth: isSelected ? 0 : 1.5,
              borderColor: colors.border.subtle,
              backgroundColor: isSelected ? colors.accent.terracotta : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isSelected && <Check size={13} color={colors.text.inverse} strokeWidth={3} />}
          </View>

          {/* Plan details */}
          <Text
            style={{
              ...typography.ui.label,
              color: colors.text.secondary,
              marginBottom: spacing.xs,
              marginTop: isAnnual ? spacing.sm : 0,
            }}
          >
            {isAnnual ? "Annual" : "Monthly"}
          </Text>

          <Text
            style={{
              ...typography.ui.sectionTitle,
              color: colors.text.primary,
              marginBottom: isAnnual ? spacing.xs : 0,
            }}
          >
            {price}
            <Text
              style={{
                ...typography.ui.body,
                color: colors.text.secondary,
              }}
            >
              {isAnnual ? " / year" : " / month"}
            </Text>
          </Text>

          {isAnnual && monthlyEquivalent && (
            <Text
              style={{
                ...typography.ui.caption,
                color: colors.text.secondary,
              }}
            >
              Only {monthlyEquivalent}/mo
            </Text>
          )}

          {isAnnual && savings && (
            <Text
              style={{
                ...typography.ui.micro,
                color: colors.accent.terracotta,
                marginTop: spacing.xs,
              }}
            >
              {savings}
            </Text>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function Paywall({ visible, onClose, onPurchaseComplete, reason }: PaywallProps) {
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<"annual" | "monthly">("annual");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Fetch offerings from RevenueCat
  const { data: offerings, isLoading: isLoadingOfferings } = useQuery({
    queryKey: ["revenuecat-offerings"],
    queryFn: async () => {
      const result = await getOfferings();
      if (result.ok) {
        return result.data;
      }
      return null;
    },
    enabled: visible && isRevenueCatEnabled(),
    staleTime: 5 * 60 * 1000,
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
  const annualMonthlyEquivalent = "$3.33";
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
        const hasProResult = await hasEntitlement("pro");
        if (hasProResult.ok && hasProResult.data) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onPurchaseComplete?.();
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
        const hasProResult = await hasEntitlement("pro");
        if (hasProResult.ok && hasProResult.data) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onPurchaseComplete?.();
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

  // Dynamic header based on reason
  const headerConfig = {
    in_store_limit: {
      title: "You've used your 5 free scans",
      subtitle: "Upgrade to Pro for unlimited in-store checks",
    },
    wardrobe_limit: {
      title: "You've hit your wardrobe limit",
      subtitle: "Upgrade to Pro for unlimited wardrobe adds",
    },
  };

  const { title, subtitle } = headerConfig[reason];

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
          backgroundColor: colors.bg.primary,
        }}
      >
        {/* Header with close button */}
        <View
          style={{
            paddingTop: insets.top + spacing.sm,
            paddingHorizontal: spacing.lg,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {/* Drag indicator */}
          <View style={{ flex: 1, alignItems: "center" }}>
            <View
              style={{
                width: spacing.xxl,
                height: spacing.xs,
                borderRadius: borderRadius.pill,
                backgroundColor: colors.bg.tertiary,
              }}
            />
          </View>
          
          {/* Close button */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onClose();
            }}
            hitSlop={12}
            style={{
              position: "absolute",
              right: spacing.lg,
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: colors.surface.icon,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} color={colors.text.secondary} strokeWidth={2} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.xl,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Section */}
          <Animated.View
            entering={FadeInDown.delay(100).springify()}
            style={{
              alignItems: "center",
              marginTop: spacing.xl,
              marginBottom: spacing.lg,
            }}
          >
            {/* Crown icon in accent container */}
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: colors.accent.terracottaLight,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing.md,
              }}
            >
              <Crown size={36} color={colors.accent.terracotta} strokeWidth={1.5} />
            </View>

            <Text
              style={{
                ...typography.display.screenTitle,
                color: colors.text.primary,
                textAlign: "center",
                marginBottom: spacing.xs,
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                ...typography.ui.body,
                color: colors.text.secondary,
                textAlign: "center",
                maxWidth: 280,
              }}
            >
              {subtitle}
            </Text>
          </Animated.View>

          {/* Benefits Card */}
          <Animated.View
            entering={FadeInDown.delay(200).springify()}
            style={{
              ...cards.standard,
              padding: spacing.lg,
              marginBottom: spacing.lg,
            }}
          >
            <Text
              style={{
                ...typography.ui.cardTitle,
                color: colors.text.primary,
                marginBottom: spacing.md,
              }}
            >
              What you get with Pro
            </Text>

            {BENEFITS.map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                <View
                  key={index}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: index === BENEFITS.length - 1 ? 0 : spacing.md,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: benefit.highlight
                        ? colors.accent.terracottaLight
                        : colors.surface.icon,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: spacing.md,
                    }}
                  >
                    <Icon
                      size={18}
                      color={benefit.highlight ? colors.accent.terracotta : colors.text.secondary}
                      strokeWidth={2}
                    />
                  </View>
                  <Text
                    style={{
                      ...typography.ui.bodyMedium,
                      color: colors.text.primary,
                      flex: 1,
                    }}
                  >
                    {benefit.text}
                  </Text>
                  <Check size={16} color={colors.status.success} strokeWidth={2.5} />
                </View>
              );
            })}
          </Animated.View>

          {/* Plan selector - Vertical layout */}
          <Animated.View
            entering={FadeInDown.delay(300).springify()}
            style={{ gap: spacing.md }}
          >
            <PlanCard
              isAnnual={true}
              isSelected={selectedPlan === "annual"}
              onSelect={() => setSelectedPlan("annual")}
              price={annualPrice}
              monthlyEquivalent={annualMonthlyEquivalent}
              savings={annualSavings}
            />
            <PlanCard
              isAnnual={false}
              isSelected={selectedPlan === "monthly"}
              onSelect={() => setSelectedPlan("monthly")}
              price={monthlyPrice}
            />
          </Animated.View>
        </ScrollView>

        {/* Bottom CTA Section */}
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.md,
            backgroundColor: colors.bg.primary,
            borderTopWidth: 1,
            borderTopColor: colors.border.hairline,
          }}
        >
          {/* CTA Button - Off-black with white text */}
          <Animated.View entering={FadeInUp.delay(400).springify()}>
            <View
              style={{
                height: 52,
                borderRadius: 999,
                backgroundColor: "#1A1A1A",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <Pressable
                onPress={handlePurchase}
                disabled={isPurchasing || isLoadingOfferings}
                style={{
                  width: "100%",
                  height: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: isPurchasing || isLoadingOfferings ? 0.7 : 1,
                }}
              >
                {isPurchasing ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text
                    style={{
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 16,
                      lineHeight: 22,
                      color: "#FFFFFF",
                    }}
                  >
                    {selectedPlan === "annual"
                      ? `Continue with Annual (${annualPrice})`
                      : `Continue with Monthly (${monthlyPrice})`}
                  </Text>
                )}
              </Pressable>
            </View>
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
              <ActivityIndicator size="small" color={colors.text.secondary} />
            ) : (
              <Text
                style={{
                  ...typography.ui.label,
                  color: colors.text.secondary,
                }}
              >
                Restore purchases
              </Text>
            )}
          </Pressable>

          {/* Legal footer */}
          <View style={{ alignItems: "center", marginTop: spacing.sm }}>
            <Text
              style={{
                ...typography.ui.caption,
                color: colors.text.tertiary,
                textAlign: "center",
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
                    ...typography.ui.caption,
                    color: colors.text.tertiary,
                    textDecorationLine: "underline",
                  }}
                >
                  Terms
                </Text>
              </Pressable>
              <Text
                style={{
                  ...typography.ui.caption,
                  color: colors.text.tertiary,
                  marginHorizontal: spacing.xs,
                }}
              >
                •
              </Text>
              <Pressable onPress={() => handleOpenLink(LEGAL_URLS.privacy)}>
                <Text
                  style={{
                    ...typography.ui.caption,
                    color: colors.text.tertiary,
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
