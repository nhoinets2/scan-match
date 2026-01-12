import React, { useState } from "react";
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
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Eye, EyeOff, Check } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { useAuth } from "@/lib/auth-context";
import { colors, spacing, button, borderRadius, typography } from "@/lib/design-tokens";

export default function ChangePasswordScreen() {
  const { updatePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Password validation
  const isPasswordValid = newPassword.length >= 8;
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const canSubmit = currentPassword.length > 0 && isPasswordValid && passwordsMatch && !loading;

  const handleChangePassword = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { error: updateError } = await updatePassword(currentPassword, newPassword);

      if (updateError) {
        setError(updateError.message);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        setSuccess(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Go back after a short delay
        setTimeout(() => {
          router.back();
        }, 1500);
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
                width: spacing.xxl * 2,
                height: spacing.xxl * 2,
                borderRadius: borderRadius.pill,
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
                ...typography.display.screenTitle,
                textAlign: "center",
                marginBottom: spacing.sm,
              }}
            >
              Password changed
            </Animated.Text>
            <Animated.Text
              entering={FadeInDown.delay(200).springify()}
              style={{
                ...typography.ui.body,
                color: colors.text.secondary,
                textAlign: "center",
              }}
            >
              Your password has been updated successfully.
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
          <Text
            style={{
              ...typography.display.screenTitle,
              letterSpacing: 0.3,
            }}
          >
            Change password
          </Text>
        </View>

        {/* Separator line */}
        <View style={{ marginHorizontal: spacing.lg, height: 1, backgroundColor: colors.border.hairline }} />

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
            {/* Current Password */}
            <Animated.View entering={FadeInDown.delay(100).springify()}>
              <Text
                style={{
                  ...typography.ui.caption,
                  color: colors.text.secondary,
                  marginBottom: spacing.sm,
                }}
              >
                Current password
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.bg.elevated,
                  borderWidth: 1.5,
                  borderColor: colors.border.subtle,
                  borderRadius: borderRadius.card,
                  paddingHorizontal: spacing.md,
                  marginBottom: spacing.lg,
                }}
              >
                <TextInput
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder=""
                  placeholderTextColor={colors.text.tertiary}
                  secureTextEntry={!showCurrentPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    flex: 1,
                    ...typography.ui.body,
                    color: colors.text.primary,
                    paddingVertical: spacing.md,
                  }}
                />
                <Pressable
                  onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                  hitSlop={8}
                >
                  {showCurrentPassword ? (
                    <EyeOff size={20} color={colors.text.tertiary} />
                  ) : (
                    <Eye size={20} color={colors.text.tertiary} />
                  )}
                </Pressable>
              </View>
            </Animated.View>

            {/* New Password */}
            <Animated.View entering={FadeInDown.delay(200).springify()}>
              <Text
                style={{
                  ...typography.ui.caption,
                  color: colors.text.secondary,
                  marginBottom: spacing.sm,
                }}
              >
                New password
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.bg.elevated,
                  borderWidth: 1.5,
                  borderColor: newPassword.length > 0 && !isPasswordValid 
                    ? colors.state.destructive 
                    : colors.border.subtle,
                  borderRadius: borderRadius.card,
                  paddingHorizontal: spacing.md,
                  marginBottom: spacing.xs + spacing.xs / 2,
                }}
              >
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder=""
                  placeholderTextColor={colors.text.tertiary}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    flex: 1,
                    ...typography.ui.body,
                    color: colors.text.primary,
                    paddingVertical: spacing.md,
                  }}
                />
                <Pressable
                  onPress={() => setShowNewPassword(!showNewPassword)}
                  hitSlop={8}
                >
                  {showNewPassword ? (
                    <EyeOff size={20} color={colors.text.tertiary} />
                  ) : (
                    <Eye size={20} color={colors.text.tertiary} />
                  )}
                </Pressable>
              </View>
              <Text
                style={{
                  ...typography.ui.caption,
                  color: newPassword.length > 0 && !isPasswordValid 
                    ? colors.state.destructive 
                    : colors.text.tertiary,
                  marginBottom: spacing.lg,
                }}
              >
                At least 8 characters
              </Text>
            </Animated.View>

            {/* Confirm Password */}
            <Animated.View entering={FadeInDown.delay(300).springify()}>
              <Text
                style={{
                  ...typography.ui.caption,
                  color: colors.text.secondary,
                  marginBottom: spacing.sm,
                }}
              >
                Confirm new password
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.bg.elevated,
                  borderWidth: 1.5,
                  borderColor: confirmPassword.length > 0 && !passwordsMatch 
                    ? colors.state.destructive 
                    : colors.border.subtle,
                  borderRadius: borderRadius.card,
                  paddingHorizontal: spacing.md,
                  marginBottom: spacing.xs + spacing.xs / 2,
                }}
              >
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder=""
                  placeholderTextColor={colors.text.tertiary}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    flex: 1,
                    ...typography.ui.body,
                    color: colors.text.primary,
                    paddingVertical: spacing.md,
                  }}
                />
                <Pressable
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  hitSlop={8}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={20} color={colors.text.tertiary} />
                  ) : (
                    <Eye size={20} color={colors.text.tertiary} />
                  )}
                </Pressable>
              </View>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <Text
                  style={{
                    ...typography.ui.caption,
                    color: colors.state.destructive,
                    marginBottom: spacing.lg,
                  }}
                >
                  Passwords don't match
                </Text>
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
                <Text
                  style={{
                    ...typography.ui.body,
                    color: colors.state.destructive,
                  }}
                >
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
                paddingBottom: spacing.sm,
                borderTopWidth: 1,
                borderTopColor: colors.border.hairline,
              }}
            >
            <Pressable
              onPress={handleChangePassword}
              disabled={!canSubmit}
              style={({ pressed }) => ({
                opacity: pressed && canSubmit ? 0.9 : 1,
              })}
            >
              <View
                style={{
                  height: button.height.primary,
                  borderRadius: button.radius,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: canSubmit 
                    ? button.primary.backgroundColor 
                    : button.primary.backgroundColorDisabled,
                }}
              >
                {loading ? (
                  <ActivityIndicator color={colors.text.inverse} />
                ) : (
                  <Text
                    style={{
                      ...typography.button.primary,
                      color: colors.text.inverse,
                    }}
                  >
                    Update password
                  </Text>
                )}
              </View>
            </Pressable>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

