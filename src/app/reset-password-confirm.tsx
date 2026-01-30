import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Eye, EyeOff, Check } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { supabase } from "@/lib/supabase";
import { colors, spacing, borderRadius, typography, button, iconContainer } from "@/lib/design-tokens";
import { ButtonPrimary } from "@/components/ButtonPrimary";

export default function ResetPasswordConfirmScreen() {
  const params = useLocalSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [validatingLink, setValidatingLink] = useState(true);
  const hasValidatedSession = useRef(false);

  // Validate recovery session by polling for session
  // DeepLinkHandler calls setSession() which may happen after this screen mounts,
  // so we need to poll and wait for it to complete
  useEffect(() => {
    // Prevent running validation multiple times (e.g., if screen mounts twice)
    if (hasValidatedSession.current) {
      console.log("[ResetPassword] Already validated, skipping duplicate validation");
      return;
    }

    console.log("[ResetPassword] Starting session validation...");
    
    let validationTimeout: ReturnType<typeof setTimeout> | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let hasCompleted = false;
    
    const completeValidation = (isValid: boolean, errorMessage?: string) => {
      if (hasCompleted) return;
      hasCompleted = true;
      hasValidatedSession.current = true;
      
      if (validationTimeout) clearTimeout(validationTimeout);
      if (pollInterval) clearInterval(pollInterval);
      
      if (isValid) {
        console.log("[ResetPassword] ✅ Valid recovery session confirmed");
        setValidatingLink(false);
      } else {
        console.log("[ResetPassword] ❌ Invalid or expired recovery session");
        setError(errorMessage || "Reset link has expired or is invalid. Please request a new password reset.");
        setValidatingLink(false);
      }
    };

    // Listen for auth state changes (SIGNED_IN fires when setSession is called)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[ResetPassword] Auth state change:", event, "Session:", !!session);
      
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
        console.log("[ResetPassword] Session established via auth event");
        completeValidation(true);
      }
    });
    
    // Poll for session - DeepLinkHandler may set it after we mount
    const checkSession = async () => {
      if (hasCompleted) return;
      
      const { data: { session }, error } = await supabase.auth.getSession();
      console.log("[ResetPassword] Polling session:", !!session, "Error:", error?.message);
      
      if (session) {
        completeValidation(true);
      }
    };
    
    // Check immediately
    checkSession();
    
    // Then poll every 300ms (DeepLinkHandler needs time to process URL and call setSession)
    pollInterval = setInterval(checkSession, 300);
    
    // Set a timeout to fail gracefully if no session is established after 6 seconds
    validationTimeout = setTimeout(() => {
      if (!hasCompleted) {
        console.log("[ResetPassword] Validation timeout reached after 6 seconds");
        completeValidation(false, "Reset link has expired or is invalid. Please request a new password reset.");
      }
    }, 6000);
    
    return () => {
      subscription.unsubscribe();
      if (validationTimeout) clearTimeout(validationTimeout);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  // Password validation
  const isValidPassword = (password: string): boolean => {
    return password.length >= 8;
  };

  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit = 
    isValidPassword(newPassword) && 
    passwordsMatch && 
    newPassword.length > 0 && 
    !loading;

  const handleResetPassword = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // First check if we have a valid session from the recovery token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setError("Reset link has expired or is invalid. Please request a new password reset.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setLoading(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        // Provide more helpful error messages
        const errorMessage = updateError.message.includes("same as the old password")
          ? "New password must be different from your current password"
          : updateError.message.includes("session")
          ? "Reset link has expired. Please request a new password reset."
          : updateError.message;
        
        setError(errorMessage);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        setSuccess(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Redirect to home after a short delay
        setTimeout(() => {
          router.replace("/(tabs)");
        }, 2000);
      }
    } catch (e) {
      setError("An unexpected error occurred. Please try requesting a new password reset.");
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
                width: spacing.xxl * 2,
                height: spacing.xxl * 2,
                borderRadius: borderRadius.pill,
                backgroundColor: colors.verdict.great.bg,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing.lg,
              }}
            >
              <Check size={iconContainer.brass.size} color={colors.verdict.great.text} strokeWidth={2} />
            </Animated.View>
            <Animated.Text
              entering={FadeInDown.delay(100).springify()}
              style={{
                ...typography.display.screenTitle,
                textAlign: "center",
                marginBottom: spacing.sm,
              }}
            >
              Password reset!
            </Animated.Text>
            <Animated.Text
              entering={FadeInDown.delay(200).springify()}
              style={{
                ...typography.ui.body,
                color: colors.text.secondary,
                textAlign: "center",
              }}
            >
              Your password has been updated successfully
            </Animated.Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Show loading state while validating the reset link
  if (validatingLink) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing.lg }}>
            <ActivityIndicator size="large" color={colors.accent.terracotta} />
            <Text
              style={{
                ...typography.ui.body,
                color: colors.text.secondary,
                marginTop: spacing.lg,
                textAlign: "center",
              }}
            >
              Validating reset link...
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Show error state if link is invalid/expired
  if (error && !newPassword && !confirmPassword) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing.lg }}>
            <Animated.View
              entering={FadeInDown.springify()}
              style={{
                width: spacing.xxl * 2,
                height: spacing.xxl * 2,
                borderRadius: borderRadius.pill,
                backgroundColor: colors.state.destructiveBg,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing.lg,
              }}
            >
              <Text style={{ fontSize: 40 }}>⚠️</Text>
            </Animated.View>
            <Animated.Text
              entering={FadeInDown.delay(100).springify()}
              style={{
                ...typography.display.screenTitle,
                textAlign: "center",
                marginBottom: spacing.sm,
              }}
            >
              Link expired
            </Animated.Text>
            <Animated.Text
              entering={FadeInDown.delay(200).springify()}
              style={{
                ...typography.ui.body,
                color: colors.text.secondary,
                textAlign: "center",
                marginBottom: spacing.xl,
              }}
            >
              {error}
            </Animated.Text>
            <ButtonPrimary
              label="Back to login"
              onPress={() => router.replace("/login")}
            />
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
            paddingBottom: spacing.md,
          }}
        >
          <Text style={typography.display.screenTitle}>
            Set new password
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
            {/* New Password Input */}
            <Animated.View entering={FadeInDown.delay(100).springify()}>
              <Text
                style={{
                  ...typography.ui.label,
                  color: colors.text.secondary,
                  marginBottom: spacing.sm,
                }}
              >
                New password
              </Text>
              <View
                style={{
                  height: button.height.secondary,
                  borderRadius: borderRadius.input,
                  backgroundColor: colors.bg.secondary,
                  paddingHorizontal: spacing.md,
                  flexDirection: "row",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.border.hairline,
                  marginBottom: spacing.md,
                }}
              >
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="At least 8 characters"
                  placeholderTextColor={colors.text.tertiary}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    flex: 1,
                    ...typography.ui.bodyMedium,
                    color: colors.text.primary,
                  }}
                />
                <Pressable onPress={() => setShowNewPassword(!showNewPassword)}>
                  {showNewPassword ? (
                    <EyeOff size={button.icon.size} color={colors.text.tertiary} />
                  ) : (
                    <Eye size={button.icon.size} color={colors.text.tertiary} />
                  )}
                </Pressable>
              </View>
            </Animated.View>

            {/* Confirm Password Input */}
            <Animated.View entering={FadeInDown.delay(150).springify()}>
              <Text
                style={{
                  ...typography.ui.label,
                  color: colors.text.secondary,
                  marginBottom: spacing.sm,
                }}
              >
                Confirm password
              </Text>
              <View
                style={{
                  height: button.height.secondary,
                  borderRadius: borderRadius.input,
                  backgroundColor: colors.bg.secondary,
                  paddingHorizontal: spacing.md,
                  flexDirection: "row",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.border.hairline,
                  marginBottom: spacing.lg,
                }}
              >
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm your password"
                  placeholderTextColor={colors.text.tertiary}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    flex: 1,
                    ...typography.ui.bodyMedium,
                    color: colors.text.primary,
                  }}
                />
                <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  {showConfirmPassword ? (
                    <EyeOff size={button.icon.size} color={colors.text.tertiary} />
                  ) : (
                    <Eye size={button.icon.size} color={colors.text.tertiary} />
                  )}
                </Pressable>
              </View>
            </Animated.View>

            {/* Password Requirements */}
            {newPassword.length > 0 && !isValidPassword(newPassword) && (
              <Animated.View entering={FadeIn.duration(200)} style={{ marginBottom: spacing.md }}>
                <Text
                  style={{
                    ...typography.ui.caption,
                    color: colors.state.destructive,
                  }}
                >
                  Password must be at least 8 characters
                </Text>
              </Animated.View>
            )}

            {/* Passwords Don't Match */}
            {confirmPassword.length > 0 && !passwordsMatch && (
              <Animated.View entering={FadeIn.duration(200)} style={{ marginBottom: spacing.md }}>
                <Text
                  style={{
                    ...typography.ui.caption,
                    color: colors.state.destructive,
                  }}
                >
                  Passwords do not match
                </Text>
              </Animated.View>
            )}

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
                <Text style={{ ...typography.ui.body, color: colors.state.destructive }}>
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
                label="Reset password"
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
