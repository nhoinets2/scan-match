import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Linking,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { router } from "expo-router";

// Landing page image for sign out loading state
const HERO_LANDING_IMAGE = require("../../assets/onboarding_screens/landing_page/landing_page.webp");
import Animated, { FadeInDown } from "react-native-reanimated";
import { ChevronLeft, ChevronRight, KeyRound, FileText, Shield, Mail, LogOut, Settings, HelpCircle, AlertCircle, Star, Crown } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { useAuth } from "@/lib/auth-context";
import { useProStatus } from "@/lib/useProStatus";
import { useUsageQuota, USAGE_LIMITS } from "@/lib/database";
import { colors, spacing, typography, borderRadius, cards, button } from "@/lib/design-tokens";
import { forceRequestReview } from "@/lib/useStoreReview";
import { Paywall } from "@/components/Paywall";

// Settings row component - 56px height, 20px radius
function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
  showChevron = true,
  textColor,
  chevronColor,
  showSeparator = true,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
  showChevron?: boolean;
  textColor?: string;
  chevronColor?: string;
  showSeparator?: boolean;
}) {
  const [pressed, setPressed] = React.useState(false);

  return (
    <>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 56,
        paddingVertical: spacing.sm + spacing.xs / 2,
        paddingHorizontal: spacing.md,
          backgroundColor: pressed ? cards.states.pressedBg : "transparent",
          borderRadius: borderRadius.pill,
        }}
      >
        <View
        style={{
          width: spacing.xl - 4,
          height: spacing.xl - 4,
          borderRadius: borderRadius.image,
            backgroundColor: colors.surface.icon,
            alignItems: "center",
            justifyContent: "center",
            marginRight: spacing.md,
          }}
        >
          {icon}
        </View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text
            style={{
              ...typography.ui.bodyMedium,
              color: textColor || colors.text.primary,
            }}
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              style={{
                ...typography.ui.caption,
                color: colors.text.secondary,
                marginTop: spacing.xs / 2 + 1,
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>
        {showChevron && <ChevronRight size={18} color={chevronColor || colors.text.secondary} />}
      </Pressable>
      {showSeparator && (
        <View
          style={{
            height: 0.5,
            backgroundColor: colors.border.hairline,
            marginLeft: spacing.md + 36 + spacing.md,
            marginRight: spacing.md,
          }}
        />
      )}
    </>
  );
}

// Section header component
function SectionHeader({ title }: { title: string }) {
  return (
    <Text
      style={{
        ...typography.ui.label,
        color: colors.text.secondary,
        marginBottom: spacing.sm,
        marginTop: spacing.lg,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      {title}
    </Text>
  );
}

export default function AccountScreen() {
  const { user, signOut } = useAuth();
  const { isPro, isLoading: isLoadingPro, refetch: refetchProStatus } = useProStatus();
  const { 
    scansUsed, 
    wardrobeAddsUsed, 
    remainingScans, 
    remainingWardrobeAdds,
    isLoading: isLoadingQuota,
  } = useUsageQuota();
  const [loading, setLoading] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const handleSignOut = async () => {
    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await signOut();
      // Don't manually navigate - let AuthGuard handle the redirect
      // setLoading will stay true during the redirect to prevent UI flicker
    } catch (error) {
      console.error("[Account] Sign out error:", error);
      setLoading(false);
      Alert.alert("Error", "Failed to sign out. Please try again.");
    }
  };

  const handleChangePassword = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/change-password");
  };

  const openLink = (url: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(url);
  };

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
              Profile
            </Text>
          </Animated.View>
          {/* Separator line */}
          <View style={{ marginTop: spacing.md, height: 1, backgroundColor: colors.border.hairline }} />
        </View>

        <ScrollView
          style={{
            flex: 1,
          }}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.xl,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Account Identity Card - matches Home page card style */}
          <Animated.View
            entering={FadeInDown.duration(400)}
            style={{
              marginTop: spacing.sm,
            }}
          >
            <View
              style={{
                // V3: cards.standard = border-first, no shadow
                backgroundColor: cards.standard.backgroundColor,
                borderWidth: cards.standard.borderWidth,
                borderColor: colors.border.subtle, // Keep subtle for emphasis
                borderRadius: cards.standard.borderRadius,
                padding: spacing.lg - 4,
              }}
            >
              {/* Email row */}
              <Text
                style={{
                  ...typography.ui.sectionTitle,
                  color: colors.text.primary,
                  marginBottom: spacing.xs / 2,
                }}
              >
                {user?.email ?? "No email"}
              </Text>
              <Text
                style={{
                  ...typography.ui.label,
                  color: colors.text.secondary,
                }}
              >
                Email
              </Text>

              {/* Separator */}
              <View
                style={{
                  height: 1,
                  backgroundColor: colors.border.hairline,
                  marginVertical: spacing.md,
                }}
              />

              {/* Subscription status row - navigates to manage subscription */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/manage-subscription");
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: isPro ? "#FFF4EF" : colors.surface.icon,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: spacing.sm,
                    }}
                  >
                    <Crown
                      size={14}
                      color={isPro ? "#E86A33" : colors.text.tertiary}
                      strokeWidth={2}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        ...typography.ui.bodyMedium,
                        color: colors.text.primary,
                      }}
                    >
                      {isLoadingPro ? "Loading..." : isPro ? "Pro Member" : "Free Plan"}
                    </Text>
                    {isPro ? (
                      // Pro users: show "Unlimited access" only, no counter
                      <Text
                        style={{
                          ...typography.ui.caption,
                          color: "#E86A33",
                          marginTop: 2,
                        }}
                      >
                        Unlimited access
                      </Text>
                    ) : (
                      // Free users: show used credits
                      <>
                        <Text
                          style={{
                            ...typography.ui.caption,
                            color: colors.text.secondary,
                            marginTop: 2,
                          }}
                        >
                          Used credits:
                        </Text>
                        <Text
                          style={{
                            ...typography.ui.caption,
                            color: colors.text.secondary,
                            marginTop: 2,
                          }}
                        >
                          {isLoadingQuota 
                            ? `— of ${USAGE_LIMITS.FREE_WARDROBE_ADDS} wardrobe adds • — of ${USAGE_LIMITS.FREE_SCANS} scans`
                            : `${wardrobeAddsUsed} of ${USAGE_LIMITS.FREE_WARDROBE_ADDS} wardrobe adds • ${scansUsed} of ${USAGE_LIMITS.FREE_SCANS} scans`
                          }
                        </Text>
                      </>
                    )}
                  </View>
                  <ChevronRight size={18} color={colors.text.secondary} />
                </View>
              </Pressable>
            </View>
          </Animated.View>

          {/* Account Section */}
          <Animated.View entering={FadeInDown.delay(100).duration(400)}>
            <SectionHeader title="Account" />
            <SettingsRow
              icon={<Settings size={18} color={colors.text.secondary} />}
              title="Your preferences"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/preferences");
              }}
            />
            <SettingsRow
              icon={<KeyRound size={18} color={colors.text.secondary} />}
              title="Change password"
              onPress={handleChangePassword}
            />
            <SettingsRow
              icon={<LogOut size={18} color={colors.state.destructive} />}
              title="Sign out"
              onPress={handleSignOut}
              showChevron={false}
              textColor={colors.state.destructive}
              showSeparator={false}
            />
          </Animated.View>

          {/* Help Section */}
          <Animated.View entering={FadeInDown.delay(200).duration(400)}>
            <SectionHeader title="Help" />
            <SettingsRow
              icon={<HelpCircle size={18} color={colors.text.secondary} />}
              title="Help Center"
              onPress={() => router.push("/help-center")}
            />
            <SettingsRow
              icon={<AlertCircle size={18} color={colors.text.secondary} />}
              title="Report a problem"
              onPress={() => router.push("/report-problem")}
            />
            <SettingsRow
              icon={<Star size={18} color={colors.text.secondary} />}
              title="Rate Scan & Match"
              subtitle="Help us improve with a review"
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const success = await forceRequestReview();
                // Show feedback if review dialog didn't appear (dev builds, simulator, etc.)
                if (!success) {
                  if (Platform.OS === "ios") {
                    Alert.alert(
                      "Thanks for your interest!",
                      "The review dialog is only available in production builds from the App Store.",
                      [{ text: "OK" }]
                    );
                  }
                }
              }}
            />
            <SettingsRow
              icon={<Mail size={18} color={colors.text.secondary} />}
              title="Contact Support"
              onPress={() => openLink("mailto:snaptomatch@gmail.com")}
              showSeparator={false}
            />
          </Animated.View>

          {/* Legal Section */}
          <Animated.View entering={FadeInDown.delay(300).duration(400)}>
            <SectionHeader title="Legal" />
            <SettingsRow
              icon={<Shield size={18} color={colors.text.secondary} />}
              title="Privacy Policy"
              onPress={() => openLink("https://scantomatch.com/privacy-policy.html")}
            />
            <SettingsRow
              icon={<FileText size={18} color={colors.text.secondary} />}
              title="Terms of Service"
              onPress={() => openLink("https://scantomatch.com/terms-and-conditions.html")}
              showSeparator={false}
            />
          </Animated.View>


          {/* Version Footer - 12px, colors.text.tertiary */}
          <Animated.View
            entering={FadeInDown.delay(500).duration(400)}
            style={{ paddingTop: spacing.xl, paddingBottom: spacing.xl * 2, alignItems: "center" }}
          >
            <Text
              style={{
                ...typography.ui.micro,
                color: colors.text.tertiary,
              }}
            >
              Scan & Match v1.0
            </Text>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      {/* Paywall Preview */}
      <Paywall
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onPurchaseComplete={() => {
          setShowPaywall(false);
          refetchProStatus();
        }}
        reason="wardrobe_limit"
      />

      {/* Sign Out Loading Overlay - Landing image with dim overlay */}
      {/* Dark background ensures no light edges show through if image doesn't fully cover */}
      {loading && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#000",
            overflow: "hidden",
          }}
        >
          <Image
            source={HERO_LANDING_IMAGE}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="high"
          />
          {/* Dim overlay to make spinner more prominent */}
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.35)",
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        </View>
      )}
    </View>
  );
}
