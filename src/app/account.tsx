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
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ChevronLeft, ChevronRight, KeyRound, FileText, Shield, Mail, LogOut, Settings, HelpCircle, AlertCircle, Star } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { useAuth } from "@/lib/auth-context";
import { colors, spacing, typography, borderRadius, cards, button } from "@/lib/design-tokens";
import { forceRequestReview } from "@/lib/useStoreReview";

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
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await signOut();
      // Close the account modal first by going back
      // This ensures we exit modal mode before navigating to login
      if (router.canGoBack()) {
        router.back();
        setTimeout(() => {
          router.replace("/login");
        }, 300);
      } else {
        router.replace("/login");
      }
    } catch (error) {
      console.error("Sign out error:", error);
    } finally {
      setLoading(false);
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
              title="Rate SnapToMatch"
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
              onPress={() => openLink("https://example.com/privacy")}
            />
            <SettingsRow
              icon={<FileText size={18} color={colors.text.secondary} />}
              title="Terms of Service"
              onPress={() => openLink("https://example.com/terms")}
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
              SnapToMatch v1.0
            </Text>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
