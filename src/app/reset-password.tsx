import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Check } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { useAuth } from "@/lib/auth-context";
import { colors, spacing, borderRadius, typography } from "@/lib/design-tokens";
import { getTextStyle } from "@/lib/typography-helpers";
import { ButtonPrimary } from "@/components/ButtonPrimary";

export default function ResetPasswordScreen() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Email validation
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  // Validation error states
  const [emailError, setEmailError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Validate on blur
  const validateEmail = () => {
    if (!touched) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError("Email is required");
    } else if (!isValidEmail(trimmedEmail)) {
      setEmailError("Please enter a valid email");
    } else {
      setEmailError(null);
    }
  };

  // Run validation when email changes
  useEffect(() => {
    if (touched) validateEmail();
  }, [email, touched]);

  const canSubmit = isValidEmail(email) && !emailError && !loading;

  const handleResetPassword = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setEmailError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { error: resetError } = await resetPassword(email.trim());

      if (resetError) {
        setError(resetError.message);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        setSuccess(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Go back after a short delay
        setTimeout(() => {
          router.back();
        }, 2000);
      }
    } catch (e) {
      setError("An unexpected error occurred");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing.lg }}>
            <Animated.View
              entering={FadeInDown.springify()}
              style={{
                width: 80,
                height: 80,
                borderRadius: borderRadius.card,
                backgroundColor: colors.verdict.great.bg,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing.lg,
              }}
            >
              <Check size={40} color={colors.verdict.great.text} strokeWidth={2} />
            </Animated.View>
            <Animated.Text
              entering={FadeInDown.delay(100).springify()}
              style={{
                ...getTextStyle("h1", colors.text.primary),
                textAlign: "center",
                marginBottom: spacing.sm,
              }}
            >
              Check your email
            </Animated.Text>
            <Animated.Text
              entering={FadeInDown.delay(200).springify()}
              style={{
                ...getTextStyle("body", colors.text.secondary),
                textAlign: "center",
              }}
            >
              We've sent a password reset link to {email}
            </Animated.Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        {/* Drag handle for modal feel */}
        <View style={{ alignItems: "center", paddingTop: spacing.sm + 4, paddingBottom: spacing.sm }}>
          <View
            style={{
              width: 40,
              height: 4,
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
            paddingBottom: spacing.md,
          }}
        >
          <Text style={[getTextStyle("h1", colors.text.primary), { letterSpacing: 0.3 }]}>
            Reset password
          </Text>
        </View>

        {/* Separator line */}
        <View style={{ marginHorizontal: spacing.lg, height: 1, backgroundColor: colors.border.subtle }} />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.xl,
              paddingBottom: spacing.xl,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Email Input */}
            <Animated.View entering={FadeInDown.delay(100).springify()}>
              <Text
                style={{
                  ...getTextStyle("caption", colors.text.secondary),
                  marginBottom: spacing.sm,
                }}
              >
                Email
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.bg.secondary,
                  borderWidth: 1,
                  borderColor: emailError ? colors.state.destructive : colors.border.hairline,
                  borderRadius: borderRadius.image,
                  paddingHorizontal: spacing.md,
                  marginBottom: emailError ? 0 : spacing.lg,
                }}
              >
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  onBlur={() => {
                    setTouched(true);
                    validateEmail();
                  }}
                  placeholder=""
                  placeholderTextColor={colors.text.tertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    flex: 1,
                    fontFamily: "Inter_400Regular",
                    fontSize: typography.sizes.body,
                    color: colors.text.primary,
                    paddingVertical: spacing.md,
                  }}
                />
              </View>
              {emailError && (
                <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
                  <Text
                    style={{
                      fontFamily: "Inter_400Regular",
                      fontSize: typography.sizes.caption,
                      color: colors.state.destructive,
                    }}
                  >
                    {emailError}
                  </Text>
                </Animated.View>
              )}
            </Animated.View>

            {/* Error Message */}
            {error && (
              <Animated.View
                entering={FadeInDown.springify()}
                style={{
                  backgroundColor: colors.state.destructiveBg,
                  borderRadius: borderRadius.image,
                  padding: spacing.md,
                  marginTop: spacing.md,
                }}
              >
                <Text style={getTextStyle("body", colors.state.destructive)}>
                  {error}
                </Text>
              </Animated.View>
            )}
          </ScrollView>

          {/* Bottom Button */}
          <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.bg.primary }}>
            <View
              style={{
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.md,
                paddingBottom: spacing.xl,
                borderTopWidth: 1,
                borderTopColor: colors.border.subtle,
              }}
            >
              <ButtonPrimary
                label="Send reset link"
                onPress={handleResetPassword}
                disabled={!canSubmit}
                loading={loading}
              />
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

