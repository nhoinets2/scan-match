import React, { useState } from "react";
import { Pressable, Text, View, Modal, LayoutChangeEvent } from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { ChevronRight } from "lucide-react-native";
import { colors, spacing, components, typography, borderRadius, shadows, cards } from "@/lib/design-tokens";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

export type GuidanceRowModel = {
  id: string;

  leadingType: "icon" | "thumb" | "none";
  leadingIcon?: string | React.ReactElement; // emoji, short string, or React icon component
  leadingThumbUrl?: string;

  title: string;
  subtitle?: string;

  /** Bullet key for tip sheet lookup (Mode A suggestions) */
  bulletKey?: string;

  /** Target category for Mode A bullets (used by TipSheet for content type decision) */
  targetCategory?: string | null;

  trailingType?: "none" | "thumb" | "chevron" | "pill";
  trailingThumbUrl?: string;
  trailingPillText?: string;
  trailingChevronColor?: string;
  subtitleOpacity?: number;
  showSubtitleTooltip?: boolean; // If true, subtitle is truncated and tap shows tooltip

  onPress?: () => void;
  onThumbPress?: () => void; // Tap thumbnail to view full-size photo
  iconGlassmorphism?: boolean;
};

export function GuidanceRow({
  leadingType,
  leadingIcon,
  leadingThumbUrl,
  title,
  subtitle,
  trailingType = "none",
  trailingThumbUrl,
  trailingPillText,
  trailingChevronColor,
  subtitleOpacity,
  showSubtitleTooltip = false,
  onPress,
  onThumbPress,
  iconGlassmorphism = false,
}: Omit<GuidanceRowModel, "id">) {
  const Container: React.ElementType = onPress ? Pressable : View;
  const isClickable = !!onPress;
  const [showTooltip, setShowTooltip] = useState(false);
  const [cardDimensions, setCardDimensions] = useState<{ width: number; height: number } | null>(null);

  const handleCardLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCardDimensions({ width, height });
  };

  const handleContainerPress = () => {
    // Don't navigate if tooltip is showing
    if (showTooltip) return;
    onPress?.();
  };

  return (
    <Container
      onPress={onPress ? handleContainerPress : undefined}
      onLayout={handleCardLayout}
      className="flex-row items-center justify-between"
      style={{ minHeight: 68 }}
    >
      {/* Leading */}
      {leadingType !== "none" && (
        iconGlassmorphism ? (
          <View style={{ width: 40, height: 40, borderRadius: borderRadius.sm, overflow: "hidden" }}>
            <BlurView
              intensity={8}
              tint="light"
              style={{
                backgroundColor: colors.bg.elevated,
                borderWidth: 1,
                borderColor: colors.border.subtle,
                borderRadius: borderRadius.sm,
                width: 40,
                height: 40,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {leadingType === "thumb" && leadingThumbUrl ? (
                onThumbPress ? (
                  <Pressable onPress={(e) => { e.stopPropagation?.(); onThumbPress(); }}>
                    <Image
                      source={{ uri: leadingThumbUrl }}
                      style={{ width: 40, height: 40 }}
                      contentFit="cover"
                    />
                  </Pressable>
                ) : (
                  <Image
                    source={{ uri: leadingThumbUrl }}
                    style={{ width: 40, height: 40 }}
                    contentFit="cover"
                  />
                )
              ) : React.isValidElement(leadingIcon) ? (
                leadingIcon
              ) : (
                <Text style={{ fontSize: 18 }}>{leadingIcon ?? "✨"}</Text>
              )}
            </BlurView>
          </View>
        ) : (
          <View className="w-10 h-10 rounded-xl bg-text/5 items-center justify-center overflow-hidden">
            {leadingType === "thumb" && leadingThumbUrl ? (
              onThumbPress ? (
                <Pressable onPress={(e) => { e.stopPropagation?.(); onThumbPress(); }}>
                  <Image
                    source={{ uri: leadingThumbUrl }}
                    style={{ width: 40, height: 40 }}
                    contentFit="cover"
                  />
                </Pressable>
              ) : (
                <Image
                  source={{ uri: leadingThumbUrl }}
                  style={{ width: 40, height: 40 }}
                  contentFit="cover"
                />
              )
            ) : React.isValidElement(leadingIcon) ? (
              leadingIcon
            ) : (
              <Text style={{ fontSize: 18 }}>{leadingIcon ?? "✨"}</Text>
            )}
          </View>
        )
      )}

      {/* Text */}
      <Pressable
        onPress={showSubtitleTooltip && subtitle ? (e) => {
          e?.stopPropagation?.();
          setShowTooltip(true);
        } : undefined}
        style={{ 
          flex: 1, 
          flexShrink: 1,
          marginHorizontal: spacing.md 
        }}
        disabled={!showSubtitleTooltip || !subtitle}
      >
        <Text
          className="text-text"
          style={{ ...typography.ui.bodyMedium }}
        >
          {title}
        </Text>
        {!!subtitle && (
          <Text
            className="text-text-muted mt-0.5"
            numberOfLines={showSubtitleTooltip ? 1 : undefined}
            ellipsizeMode="tail"
            style={{ 
              ...typography.ui.micro,
              opacity: subtitleOpacity ?? 1
            }}
          >
            {subtitle}
          </Text>
        )}
      </Pressable>

      {/* Trailing */}
      {trailingType === "thumb" && trailingThumbUrl ? (
        <View className="flex-row items-center">
          <View
            className="w-8 h-8 overflow-hidden bg-text/5"
            style={{ borderRadius: components.image.borderRadius }}
          >
            <Image
              source={{ uri: trailingThumbUrl }}
              style={{ width: 32, height: 32 }}
              contentFit="cover"
            />
          </View>
          {isClickable && (
            <ChevronRight size={18} color={trailingChevronColor ?? colors.text.tertiary} style={{ marginLeft: spacing.sm }} />
          )}
        </View>
      ) : trailingType === "chevron" || (trailingType === "none" && isClickable) ? (
        <ChevronRight size={18} color={trailingChevronColor ?? colors.text.tertiary} />
      ) : trailingType === "pill" && trailingPillText ? (
        <View className="px-2 py-1 rounded-full bg-text/5">
          <Text
            className="text-text-muted"
            style={{ fontSize: 7 }}
          >
            {trailingPillText}
          </Text>
        </View>
      ) : (
        <View style={{ width: 18, height: 18 }} />
      )}

      {/* Tooltip Modal for full subtitle */}
      {showSubtitleTooltip && subtitle && (
        <Modal
          visible={showTooltip}
          transparent
          animationType="fade"
          onRequestClose={() => setShowTooltip(false)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.05)",
              justifyContent: "center",
              alignItems: "center",
              padding: 20,
            }}
            onPress={() => setShowTooltip(false)}
          >
            <Animated.View
              entering={FadeIn}
              exiting={FadeOut}
              style={{
                // V3: using shadow tokens + custom background
                borderRadius: cards.elevated.borderRadius,
                padding: 20,
                width: cardDimensions?.width ? (cardDimensions.width - 32) * 0.9 : undefined,
                maxWidth: cardDimensions?.width ? undefined : "80%",
                minHeight: cardDimensions?.height,
                ...shadows.lg,
                overflow: "hidden",
                backgroundColor: colors.accent.terracotta,
              }}
            >
              <View style={{ marginBottom: 12 }}>
                <Text
                  style={{
                    ...typography.ui.cardTitle,
                    color: colors.text.inverse,
                  }}
                >
                  {title}
                </Text>
              </View>
              <Text
                style={{
                  ...typography.ui.body,
                  color: colors.text.primary,
                }}
              >
                {subtitle}
              </Text>
            </Animated.View>
          </Pressable>
        </Modal>
      )}
    </Container>
  );
}


