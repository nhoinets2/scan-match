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
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
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
  Star,
  Infinity,
  RefreshCw,
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
  terms: "https://scantomatch.com/terms-and-conditions.html",
  privacy: "https://scantomatch.com/privacy-policy.html",
} as const;

type PaywallReason = "in_store_limit" | "wardrobe_limit" | "upgrade";

interface PaywallProps {
  visible: boolean;
  onClose: () => void;
  onPurchaseComplete?: () => void;
  reason: PaywallReason;
}

// Benefits with icons
const BENEFITS = [
  { icon: Infinity, text: "Unlimited wardrobe scans" },
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
            overflow: "hidden",
          }}
        >
          {/* Best value header bar for annual */}
          {isAnnual && (
            <View
              style={{
                backgroundColor: colors.accent.terracotta,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  ...typography.ui.micro,
                  color: colors.text.inverse,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                Best value — {savings}
              </Text>
            </View>
          )}

          {/* Card content */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: spacing.md,
            }}
          >
            {/* Selection indicator on left */}
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                borderWidth: isSelected ? 0 : 2,
                borderColor: colors.border.subtle,
                backgroundColor: isSelected ? colors.accent.terracotta : "transparent",
                alignItems: "center",
                justifyContent: "center",
                marginRight: spacing.md,
              }}
            >
              {isSelected && <Check size={14} color={colors.text.inverse} strokeWidth={3} />}
            </View>

            {/* Plan details - left side */}
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  ...typography.ui.sectionTitle,
                  color: colors.text.primary,
                  marginBottom: 2,
                }}
              >
                {isAnnual ? "Annual" : "Monthly"}
              </Text>
              
              {isAnnual ? (
                <>
                  <Text
                    style={{
                      ...typography.ui.label,
                      color: colors.status.success,
                      marginBottom: 2,
                    }}
                  >
                    7-day free trial included
                  </Text>
                  <Text
                    style={{
                      ...typography.ui.caption,
                      color: colors.text.secondary,
                    }}
                  >
                    {price}/year billed annually
                  </Text>
                </>
              ) : (
                <Text
                  style={{
                    ...typography.ui.caption,
                    color: colors.text.secondary,
                  }}
                >
                  No free trial
                </Text>
              )}
            </View>

            {/* Price on right */}
            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={{
                  ...typography.ui.sectionTitle,
                  fontSize: 22,
                  color: colors.text.primary,
                }}
              >
                {isAnnual ? monthlyEquivalent : price}
              </Text>
              <Text
                style={{
                  ...typography.ui.caption,
                  color: colors.text.secondary,
                }}
              >
                / month
              </Text>
            </View>
          </View>
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
  const { data: offerings, isLoading: isLoadingOfferings, refetch: refetchOfferings } = useQuery({
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
    retry: 2, // Auto-retry twice on failure
    retryDelay: 1000, // 1 second between retries
  });

  // Get packages
  const monthlyPackage = offerings?.current?.availablePackages.find(
    (pkg) => pkg.identifier === "$rc_monthly"
  );
  const annualPackage = offerings?.current?.availablePackages.find(
    (pkg) => pkg.identifier === "$rc_annual"
  );

  // Determine purchase availability
  const packageToPurchase = selectedPlan === "annual" ? annualPackage : monthlyPackage;
  const canPurchase = !!packageToPurchase && !isPurchasing && !isLoadingOfferings;
  
  // Check if offerings are ready but packages are missing
  const isOfferingsReady = !!offerings?.current;
  const showUnavailableBanner = isOfferingsReady && (!monthlyPackage || !annualPackage);

  // Format prices - only show real prices when packages exist
  const monthlyPrice = isLoadingOfferings ? "Loading..." : 
                       monthlyPackage ? monthlyPackage.product.priceString : "Unavailable";
  const annualPrice = isLoadingOfferings ? "Loading..." : 
                      annualPackage ? annualPackage.product.priceString : "Unavailable";
  
  // Calculate annual savings only if both packages exist
  const annualMonthlyEquivalent = annualPackage && monthlyPackage
    ? `$${(annualPackage.product.price / 12).toFixed(2)}`
    : "--";
  const annualSavings = annualPackage && monthlyPackage
    ? `Save ${Math.round((1 - annualPackage.product.price / (monthlyPackage.product.price * 12)) * 100)}%`
    : "Save 44%";

  const handlePurchase = async () => {
    if (!packageToPurchase) {
      console.log("[Paywall] No package available for purchase", {
        selectedPlan,
        monthlyAvailable: !!monthlyPackage,
        annualAvailable: !!annualPackage,
        currentOffering: offerings?.current?.identifier,
        availablePackages: offerings?.current?.availablePackages?.map(p => p.identifier) || [],
      });

      Alert.alert(
        "Subscriptions unavailable",
        "We couldn't load subscription products. Please try again.",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Retry", 
            onPress: () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              refetchOfferings();
            }
          }
        ]
      );
      return;
    }

    setIsPurchasing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await purchasePackage(packageToPurchase);

      if (result.ok) {
        // Check entitlement immediately
        let hasProResult = await hasEntitlement("pro");
        
        if (hasProResult.ok && hasProResult.data) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onPurchaseComplete?.();
          return;
        }

        // If not immediately active, poll for entitlement (up to 10 seconds)
        console.log("[Paywall] Entitlement not immediately active, polling...");
        for (let i = 0; i < 5; i++) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          hasProResult = await hasEntitlement("pro");
          
          if (hasProResult.ok && hasProResult.data) {
            console.log("[Paywall] Entitlement activated after polling");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onPurchaseComplete?.();
            return;
          }
        }

        // Still not synced after 10 seconds
        console.log("[Paywall] Entitlement not synced after 10 seconds");
        Alert.alert(
          "Almost done", 
          "Purchase completed! Your subscription is being activated. Please wait a moment and try again.",
          [{ text: "OK" }]
        );
      } else {
        // Purchase failed
        console.log("[Paywall] Purchase failed:", result.reason, result.error);
        Alert.alert(
          "Purchase failed",
          "Unable to complete your purchase. Please try again.",
          [{ text: "OK" }]
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (error: any) {
      // Check if user cancelled
      if (error?.userCancelled || error?.code === "1") {
        console.log("[Paywall] User cancelled purchase");
        return; // Don't show error for cancellation
      }

      console.log("[Paywall] Purchase error:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      
      Alert.alert(
        "Purchase failed",
        error?.message || "An error occurred. Please try again.",
        [{ text: "OK" }]
      );
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
  const titleConfig: Record<PaywallReason, string | null> = {
    in_store_limit: "You've used your 5 free scans",
    wardrobe_limit: "You've hit your wardrobe limit",
    upgrade: null, // No title for upgrade flow, just show subtitle
  };

  const title = titleConfig[reason];
  const subtitle = "Upgrade to Pro for unlimited in-store checks and wardrobe adds.";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <LinearGradient
        colors={["#171717", "#3D322F", "#C45A28", "#E86A33"]}
        locations={[0, 0.3, 0.6, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: insets.top + spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingBottom: insets.bottom + spacing.xl,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header with close button */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: spacing.xl,
            }}
          >
            {/* Drag indicator */}
            <View style={{ flex: 1, alignItems: "center" }}>
              <View
                style={{
                  width: spacing.xxl,
                  height: spacing.xs,
                  borderRadius: borderRadius.pill,
                  backgroundColor: "rgba(255, 255, 255, 0.3)",
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
                right: 0,
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: "rgba(255, 255, 255, 0.15)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={18} color={colors.text.inverse} strokeWidth={2} />
            </Pressable>
          </View>

          {/* Hero Content */}
          <Animated.View
            entering={FadeInDown.delay(100).springify()}
            style={{
              alignItems: "center",
              marginBottom: spacing.xl,
            }}
          >
            {title && (
              <Text
                style={{
                  ...typography.display.screenTitle,
                  color: colors.text.inverse,
                  textAlign: "center",
                  marginBottom: spacing.md,
                }}
              >
                {title}
              </Text>
            )}
            <Text
              style={{
                ...typography.ui.cardTitle,
                color: colors.text.inverse,
                textAlign: "center",
                maxWidth: 320,
                lineHeight: 26,
              }}
            >
              {subtitle}
            </Text>
          </Animated.View>

          {/* Unavailable banner */}
          {showUnavailableBanner && (
            <Animated.View
              entering={FadeInDown.delay(150).springify()}
              style={{
                backgroundColor: "rgba(255, 200, 100, 0.95)",
                borderRadius: borderRadius.card,
                padding: spacing.md,
                marginBottom: spacing.md,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    ...typography.ui.bodyMedium,
                    color: colors.text.primary,
                    marginBottom: spacing.xs,
                  }}
                >
                  Subscriptions temporarily unavailable
                </Text>
                <Text
                  style={{
                    ...typography.ui.caption,
                    color: colors.text.secondary,
                  }}
                >
                  Please try again in a moment.
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  refetchOfferings();
                }}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  backgroundColor: colors.accent.terracotta,
                  borderRadius: borderRadius.pill,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <RefreshCw size={14} color={colors.text.inverse} strokeWidth={2} />
                <Text
                  style={{
                    ...typography.ui.label,
                    color: colors.text.inverse,
                    marginLeft: spacing.xs,
                  }}
                >
                  Retry
                </Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Benefits Card - Glass effect */}
          <Animated.View
            entering={FadeInDown.delay(200).springify()}
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              borderRadius: borderRadius.card,
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
                      backgroundColor: colors.surface.icon,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: spacing.md,
                    }}
                  >
                    <Icon
                      size={18}
                      color={colors.text.secondary}
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
            style={{ gap: spacing.md, marginBottom: spacing.xl }}
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

          {/* CTA Button - Primary Inverse (white on dark gradient) */}
          <Animated.View entering={FadeInUp.delay(400).springify()}>
            <View
              style={{
                height: button.height.primary,
                borderRadius: button.primaryInverse.borderRadius,
                backgroundColor: button.primaryInverse.backgroundColor,
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                opacity: canPurchase ? 1 : 0.5,
              }}
            >
              <Pressable
                onPress={handlePurchase}
                disabled={!canPurchase}
                style={{
                  width: "100%",
                  height: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isPurchasing ? (
                  <ActivityIndicator color={button.primaryInverse.textColor} />
                ) : isLoadingOfferings ? (
                  <Text
                    style={{
                      ...typography.button.primary,
                      color: button.primaryInverse.textColor,
                    }}
                  >
                    Loading...
                  </Text>
                ) : !packageToPurchase ? (
                  <Text
                    style={{
                      ...typography.button.primary,
                      color: button.primaryInverse.textColor,
                    }}
                  >
                    Unavailable
                  </Text>
                ) : (
                  <Text
                    style={{
                      ...typography.button.primary,
                      color: button.primaryInverse.textColor,
                    }}
                  >
                    {selectedPlan === "annual" ? "Start free trial" : "Subscribe"}
                  </Text>
                )}
              </Pressable>
            </View>
          </Animated.View>

          {/* Trial terms - only show for annual plan */}
          {selectedPlan === "annual" && (
            <Text
              style={{
                ...typography.ui.micro,
                color: "rgba(255, 255, 255, 0.6)",
                textAlign: "center",
                marginTop: spacing.sm,
              }}
            >
              7 days free, then {annualPrice}/year. Cancel anytime before trial ends.
            </Text>
          )}

          {/* Restore purchases */}
          <Pressable
            onPress={handleRestore}
            disabled={isRestoring}
            style={{
              alignItems: "center",
              marginTop: selectedPlan === "annual" ? spacing.md : spacing.lg,
              paddingVertical: spacing.sm,
            }}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color="rgba(255, 255, 255, 0.7)" />
            ) : (
              <Text
                style={{
                  ...typography.ui.label,
                  color: "rgba(255, 255, 255, 0.7)",
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
                ...typography.ui.caption,
                color: "rgba(255, 255, 255, 0.5)",
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
                    color: "rgba(255, 255, 255, 0.5)",
                    textDecorationLine: "underline",
                  }}
                >
                  {reason === "upgrade" ? "Terms of Service" : "Terms"}
                </Text>
              </Pressable>
              <Text
                style={{
                  ...typography.ui.caption,
                  color: "rgba(255, 255, 255, 0.5)",
                  marginHorizontal: spacing.xs,
                }}
              >
                •
              </Text>
              <Pressable onPress={() => handleOpenLink(LEGAL_URLS.privacy)}>
                <Text
                  style={{
                    ...typography.ui.caption,
                    color: "rgba(255, 255, 255, 0.5)",
                    textDecorationLine: "underline",
                  }}
                >
                  {reason === "upgrade" ? "Privacy Policy" : "Privacy"}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
}
