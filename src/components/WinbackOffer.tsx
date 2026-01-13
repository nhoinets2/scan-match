/**
 * Winback Offer Component - Retention offer for cancelled subscriptions
 * 
 * Shows when user cancels annual subscription but still has active access.
 * Offers 50% discount ($19.99 instead of $39.99) to retain the subscriber.
 */

import React, { useState } from "react";
import { View, Text, Pressable, Modal, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { X, Sparkles } from "lucide-react-native";

import { colors, typography, spacing, borderRadius, button } from "@/lib/design-tokens";
import { markWinbackOfferShown, markWinbackOfferAccepted } from "@/lib/subscription-sync";

interface WinbackOfferProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
}

export function WinbackOffer({ visible, onClose, userId }: WinbackOfferProps) {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(false);

  const handleClose = async () => {
    await markWinbackOfferShown(userId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const handleAcceptOffer = async () => {
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Mark as accepted in DB
      await markWinbackOfferAccepted(userId);

      // Show instructions for redeeming
      Alert.alert(
        "Claim Your 50% Discount",
        "To activate this offer:\n\n1. Go to iPhone Settings → Apple ID → Subscriptions\n2. Select Scan & Match\n3. Enter promo code: WINBACK50\n\nYour next year will be just $19.99!",
        [
          {
            text: "Got it",
            onPress: () => {
              onClose();
            },
          },
        ]
      );
    } catch (error) {
      console.error("[Winback] Error accepting offer:", error);
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <LinearGradient
        colors={["#171717", "#3D322F", "#C45A28", "#E86A33"]}
        locations={[0, 0.3, 0.6, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            paddingTop: insets.top + spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
          }}
        >
          {/* Close button */}
          <View style={{ alignItems: "flex-end", marginBottom: spacing.lg }}>
            <Pressable
              onPress={handleClose}
              hitSlop={12}
              style={{
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

          {/* Content */}
          <Animated.View
            entering={FadeInDown.delay(100).springify()}
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            {/* Icon */}
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: "rgba(255, 255, 255, 0.15)",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing.lg,
              }}
            >
              <Sparkles size={40} color={colors.text.inverse} strokeWidth={1.5} />
            </View>

            {/* Title */}
            <Text
              style={{
                ...typography.display.hero,
                color: colors.text.inverse,
                textAlign: "center",
                marginBottom: spacing.md,
              }}
            >
              Wait! Don't Go
            </Text>

            {/* Subtitle */}
            <Text
              style={{
                ...typography.ui.body,
                color: "rgba(255, 255, 255, 0.8)",
                textAlign: "center",
                marginBottom: spacing.sm,
              }}
            >
              We'd love to keep you as a Pro member
            </Text>

            {/* Offer card */}
            <View
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                borderRadius: borderRadius.card,
                padding: spacing.lg,
                marginTop: spacing.xl,
                width: "100%",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  ...typography.ui.micro,
                  color: colors.accent.terracotta,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: spacing.sm,
                }}
              >
                Exclusive Offer
              </Text>

              {/* Price comparison */}
              <View style={{ alignItems: "center", marginBottom: spacing.md }}>
                <Text
                  style={{
                    ...typography.ui.body,
                    color: colors.text.secondary,
                    textDecorationLine: "line-through",
                  }}
                >
                  $39.99/year
                </Text>
                <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                  <Text
                    style={{
                      fontFamily: "Inter_700Bold",
                      fontSize: 36,
                      color: colors.text.primary,
                    }}
                  >
                    $19.99
                  </Text>
                  <Text
                    style={{
                      ...typography.ui.body,
                      color: colors.text.secondary,
                      marginLeft: spacing.xs,
                    }}
                  >
                    /year
                  </Text>
                </View>
                <Text
                  style={{
                    ...typography.ui.label,
                    color: colors.status.success,
                    marginTop: spacing.xs,
                  }}
                >
                  Save 50% on your next year
                </Text>
              </View>

              {/* Benefits */}
              <View style={{ width: "100%", gap: spacing.sm }}>
                <Text
                  style={{
                    ...typography.ui.caption,
                    color: colors.text.secondary,
                    textAlign: "center",
                  }}
                >
                  • Unlimited wardrobe scans{"\n"}
                  • Unlimited in-store checks{"\n"}
                  • AI-powered outfit suggestions
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* CTA Buttons */}
          <View style={{ gap: spacing.md }}>
            {/* Accept button */}
            <Pressable
              onPress={handleAcceptOffer}
              disabled={isLoading}
              style={({ pressed }) => ({
                height: button.height.primary,
                borderRadius: button.primaryInverse.borderRadius,
                backgroundColor: pressed
                  ? button.primaryInverse.backgroundColorPressed
                  : button.primaryInverse.backgroundColor,
                alignItems: "center",
                justifyContent: "center",
                opacity: isLoading ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  ...typography.button.primary,
                  color: button.primaryInverse.textColor,
                }}
              >
                Claim 50% Off
              </Text>
            </Pressable>

            {/* Decline button */}
            <Pressable
              onPress={handleClose}
              disabled={isLoading}
              style={{
                alignItems: "center",
                paddingVertical: spacing.sm,
              }}
            >
              <Text
                style={{
                  ...typography.ui.label,
                  color: "rgba(255, 255, 255, 0.7)",
                }}
              >
                No thanks, continue cancellation
              </Text>
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </Modal>
  );
}

