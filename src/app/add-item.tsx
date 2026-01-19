import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  AppState,
  AppStateStatus,
} from "react-native";
import { Image } from "expo-image";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  X,
  Camera,
  ImageIcon,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  Pencil,
  WifiOff,
} from "lucide-react-native";

import { cn } from "@/lib/cn";
import { useAddWardrobeItem } from "@/lib/database";
import {
  Category,
  CATEGORIES,
  ColorInfo,
  StyleVibe,
  STYLE_VIBES,
  COLOR_PALETTE,
} from "@/lib/types";
import { analyzeClothingImage, ClothingAnalysisResult } from "@/lib/openai";
import { colors, spacing, typography, components, borderRadius, cards, shadows, button } from "@/lib/design-tokens";
import { getTextStyle } from "@/lib/typography-helpers";
import { ButtonPrimary } from "@/components/ButtonPrimary";
import { ButtonTertiary } from "@/components/ButtonTertiary";
import { IconButton } from "@/components/IconButton";
import { capitalizeFirst, capitalizeItems } from "@/lib/text-utils";
import { useProStatus } from "@/lib/useProStatus";
import { useAuth } from "@/lib/auth-context";
import { saveImageLocally, queueBackgroundUpload } from "@/lib/storage";
import { Paywall } from "@/components/Paywall";
import { useUsageQuota, generateIdempotencyKey } from "@/lib/database";

type ScreenState = "ready" | "processing" | "analyzed";

// DEBUG: Set to true to show on-screen quota debug info
const SHOW_DEBUG_OVERLAY = false;

const TIPS = [
  "Lay flat or hang up for best results",
  "Good lighting helps us see colors",
  "Include the full item in frame",
  "Plain backgrounds work best",
];

// Find hex color from color name (case-insensitive)
function findColorHexByName(name: string): string | null {
  const normalizedName = name.trim().toLowerCase();
  const found = COLOR_PALETTE.find(
    (c) => c.name.toLowerCase() === normalizedName
  );
  return found?.hex ?? null;
}

// Calculate if a color is light or dark for text contrast
function isLightColor(hex: string): boolean {
  // Remove # if present
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  
  // Calculate relative luminance (WCAG formula)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // If luminance is greater than 0.5, it's a light color
  return luminance > 0.5;
}

// Adjust color saturation to fit design (reduce saturation by ~18%)
function adjustColorSaturation(hex: string): string {
  // Remove # if present
  const cleanHex = hex.replace("#", "");
  let r = parseInt(cleanHex.substring(0, 2), 16);
  let g = parseInt(cleanHex.substring(2, 4), 16);
  let b = parseInt(cleanHex.substring(4, 6), 16);
  
  // Convert RGB to HSL
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  // Reduce saturation by 18% to fit design
  s = Math.max(0, Math.min(1, s * 0.82));
  
  // Convert HSL back to RGB
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  let p = 2 * l - q;
  
  r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
  g = Math.round(hue2rgb(p, q, h) * 255);
  b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
  
  return `#${[r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("")}`;
}

// Subtle overlay with rotating tips (matches Scan screen)
function CameraOverlay({ currentTip }: { currentTip: string }) {
  const pulseAnim = useSharedValue(1);
  const tipOpacity = useSharedValue(1);

  useEffect(() => {
    pulseAnim.value = withRepeat(
      withTiming(1.02, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [pulseAnim]);

  useEffect(() => {
    tipOpacity.value = withSequence(
      withTiming(0, { duration: 200 }),
      withTiming(1, { duration: 200 })
    );
  }, [currentTip, tipOpacity]);

  const frameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const tipStyle = useAnimatedStyle(() => ({
    opacity: tipOpacity.value,
  }));

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
      {/* Subtle rounded frame guide - same as Scan */}
      <Animated.View
        style={[
          frameStyle,
          {
            width: 260,
            height: 340,
            borderWidth: 2,
            borderColor: "rgba(255,255,255,0.12)",
            borderRadius: borderRadius.card,
            backgroundColor: "transparent",
          },
        ]}
      />

      {/* Rotating tip */}
      <View style={{ position: "absolute", bottom: spacing.xl, alignItems: "center", paddingHorizontal: spacing.xl }}>
        <Animated.View
          style={[
            tipStyle,
            {
              backgroundColor: "rgba(0,0,0,0.5)",
              borderRadius: borderRadius.pill,
              paddingHorizontal: spacing.md + spacing.xs,
              paddingVertical: spacing.sm + spacing.xs / 2,
            },
          ]}
        >
          <Text
            style={{ 
              ...typography.ui.caption,
              color: colors.text.inverse,
              opacity: 0.9,
              textAlign: "center",
            }}
          >
            {currentTip}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

// Processing overlay (matches Scan screen)
function ProcessingOverlay() {
  const dotAnim = useSharedValue(0);

  useEffect(() => {
    dotAnim.value = withRepeat(
      withTiming(1, { duration: 1500 }),
      -1,
      false
    );
  }, [dotAnim]);

  const dot1Style = useAnimatedStyle(() => ({
    opacity: interpolate(dotAnim.value, [0, 0.33, 0.66, 1], [0.3, 1, 0.3, 0.3]),
  }));

  const dot2Style = useAnimatedStyle(() => ({
    opacity: interpolate(dotAnim.value, [0, 0.33, 0.66, 1], [0.3, 0.3, 1, 0.3]),
  }));

  const dot3Style = useAnimatedStyle(() => ({
    opacity: interpolate(dotAnim.value, [0, 0.33, 0.66, 1], [0.3, 0.3, 0.3, 1]),
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={{ 
        position: "absolute", 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        backgroundColor: "rgba(0,0,0,0.8)", 
        alignItems: "center", 
        justifyContent: "center" 
      }}
    >
      <View style={{ alignItems: "center" }}>
        <View style={{ flexDirection: "row", marginBottom: spacing.lg }}>
          <Animated.View style={[dot1Style, { width: spacing.sm + spacing.xs / 2, height: spacing.sm + spacing.xs / 2, borderRadius: borderRadius.pill, backgroundColor: colors.accent.terracotta, marginHorizontal: spacing.xs }]} />
          <Animated.View style={[dot2Style, { width: spacing.sm + spacing.xs / 2, height: spacing.sm + spacing.xs / 2, borderRadius: borderRadius.pill, backgroundColor: colors.accent.terracotta, marginHorizontal: spacing.xs }]} />
          <Animated.View style={[dot3Style, { width: spacing.sm + spacing.xs / 2, height: spacing.sm + spacing.xs / 2, borderRadius: borderRadius.pill, backgroundColor: colors.accent.terracotta, marginHorizontal: spacing.xs }]} />
        </View>
        <Text
          style={{ 
            ...typography.ui.cardTitle,
            color: colors.text.inverse,
            textAlign: "center",
          }}
        >
          Looking at your item...
        </Text>
      </View>
    </Animated.View>
  );
}

// Help bottom sheet - explains how to take good photos
function HelpBottomSheet({
  visible,
  onClose
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: colors.overlay.dark }}
        onPress={onClose}
      />
      <View
        style={{ 
          backgroundColor: colors.bg.elevated,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingBottom: insets.bottom + 20 
        }}
      >
        <View style={{ alignItems: "center", paddingTop: spacing.sm + spacing.xs / 2, paddingBottom: spacing.md }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.bg.tertiary }} />
        </View>

        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
          <Text
            style={{
              ...typography.display.screenTitle,
              color: colors.text.primary,
              marginBottom: spacing.md,
            }}
          >
            How to scan
          </Text>

          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <View style={{ 
                width: 24, 
                height: 24, 
                borderRadius: 12, 
                backgroundColor: colors.accent.terracottaLight,
                alignItems: "center",
                justifyContent: "center",
                marginRight: spacing.sm,
                marginTop: 2,
              }}>
                <Text style={{ ...typography.ui.micro, color: colors.accent.terracotta }}>1</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...typography.ui.bodyMedium, color: colors.text.primary }}>
                  Hold the item up
                </Text>
                <Text style={{ ...typography.ui.caption, color: colors.text.secondary, marginTop: spacing.xs }}>
                  Lay it flat, hang it up, or hold it against a plain background
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <View style={{ 
                width: 24, 
                height: 24, 
                borderRadius: 12, 
                backgroundColor: colors.accent.terracottaLight,
                alignItems: "center",
                justifyContent: "center",
                marginRight: spacing.sm,
                marginTop: 2,
              }}>
                <Text style={{ ...typography.ui.micro, color: colors.accent.terracotta }}>2</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...typography.ui.bodyMedium, color: colors.text.primary }}>
                  Fit it in the frame
                </Text>
                <Text style={{ ...typography.ui.caption, color: colors.text.secondary, marginTop: spacing.xs }}>
                  Best results when the full item is visible
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <View style={{ 
                width: 24, 
                height: 24, 
                borderRadius: 12, 
                backgroundColor: colors.accent.terracottaLight,
                alignItems: "center",
                justifyContent: "center",
                marginRight: spacing.sm,
                marginTop: 2,
              }}>
                <Text style={{ ...typography.ui.micro, color: colors.accent.terracotta }}>3</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...typography.ui.bodyMedium, color: colors.text.primary }}>
                  Tap to capture
                </Text>
                <Text style={{ ...typography.ui.caption, color: colors.text.secondary, marginTop: spacing.xs }}>
                  We'll analyze the colors and style to find matches
                </Text>
              </View>
            </View>
          </View>

          <View style={{ marginTop: spacing.lg }}>
            <ButtonPrimary
              label="Got it"
              onPress={onClose}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Category picker (required)
function CategoryPicker({
  selected,
  onSelect,
}: {
  selected: Category | null;
  onSelect: (cat: Category) => void;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(100)} style={{ marginBottom: spacing.lg }}>
      <Text
        style={{ 
          ...typography.ui.sectionTitle,
          color: colors.text.primary,
          marginBottom: spacing.md,
        }}
      >
        Category
      </Text>
      <View className="flex-row flex-wrap">
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat.id}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(cat.id);
            }}
            style={{
              paddingHorizontal: spacing.md + spacing.xs / 2,
              paddingVertical: spacing.sm + spacing.xs / 2,
              borderRadius: borderRadius.image,
              backgroundColor: selected === cat.id ? colors.accent.terracottaLight : "transparent",
              borderWidth: 0.5,
              borderColor: selected === cat.id ? colors.accent.terracottaLight : colors.border.subtle,
              marginRight: spacing.sm,
              marginBottom: spacing.sm,
            }}
          >
            <Text
              style={{
                ...typography.ui.label,
                color: selected === cat.id ? colors.text.primary : colors.text.secondary,
              }}
            >
              {cat.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

// Style tag picker (required, multi-select)
function StyleTagPicker({
  selectedStyles,
  onToggleStyle,
}: {
  selectedStyles: StyleVibe[];
  onToggleStyle: (style: StyleVibe) => void;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(150)} style={{ marginBottom: spacing.md + spacing.xs }}>
      <Text
        style={{ 
          ...typography.ui.sectionTitle,
          color: colors.text.primary,
          marginBottom: spacing.md,
        }}
      >
        Style
      </Text>
      <View className="flex-row flex-wrap">
        {STYLE_VIBES.map((vibe) => {
          const isSelected = selectedStyles.includes(vibe.id);
          return (
            <Pressable
              key={vibe.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onToggleStyle(vibe.id);
              }}
              style={{
                paddingHorizontal: spacing.md + spacing.xs / 2,
                paddingVertical: spacing.sm + spacing.xs / 2,
                borderRadius: borderRadius.image,
                backgroundColor: isSelected ? colors.accent.terracottaLight : "transparent",
                borderWidth: 0.5,
                borderColor: isSelected ? colors.accent.terracottaLight : colors.border.subtle,
                marginRight: spacing.sm,
                marginBottom: spacing.sm,
              }}
            >
              <Text
                style={{
                  ...typography.ui.label,
                  color: isSelected ? colors.text.primary : colors.text.secondary,
                }}
              >
                {vibe.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
}

// Collapsible optional details section
function OptionalDetails({
  detectedColors,
  originalColors,
  brand,
  onBrandChange,
  onColorsChange,
  onExpand,
}: {
  detectedColors: ColorInfo[];
  originalColors?: ColorInfo[];
  brand: string;
  onBrandChange: (text: string) => void;
  onColorsChange?: (colors: ColorInfo[]) => void;
  onExpand?: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingColors, setIsEditingColors] = useState(false);
  const [colorInputText, setColorInputText] = useState(""); // Raw text input for colors

  const handleToggle = () => {
    const wasExpanded = isExpanded;
    setIsExpanded(!wasExpanded);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // If expanding, trigger scroll after a short delay to allow layout
    if (!wasExpanded && onExpand) {
      setTimeout(() => {
        onExpand();
      }, 100);
    }
  };

  const handleStartEditColors = () => {
    console.log("[OptionalDetails] Starting edit mode, detectedColors:", detectedColors.length);
    // Initialize text input with existing color names joined by comma
    const text = detectedColors.length > 0
      ? detectedColors.map(c => c.name).join(", ")
      : "";
    setColorInputText(text);
    setIsEditingColors(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveColors = () => {
    if (!isEditingColors) return; // Guard against multiple calls

    console.log("[OptionalDetails] Saving colors, colorInputText:", colorInputText);

    // First exit edit mode
    setIsEditingColors(false);

    // Split by comma and filter out empty names
    const validNames = colorInputText
      .split(",")
      .map((name: string) => name.trim())
      .filter((name: string) => name.length > 0);

    if (validNames.length === 0) {
      // No valid names, keep original colors
      return;
    }

    // Create new color objects with hex lookup
    const newColors: ColorInfo[] = validNames.map((name: string) => {
      const hex = findColorHexByName(name);
      
      // If found in palette, use that
      if (hex) {
        return { name, hex };
      }
      
      // If same color name as original, preserve its hex
      const fromOriginal = originalColors?.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (fromOriginal) {
        return { name, hex: fromOriginal.hex };
      }
      
      // For new/unknown colors, default to grey
      return { name, hex: "#808080" };
    });

    console.log("[OptionalDetails] Updated colors:", newColors);

    // Notify parent of changes
    if (onColorsChange) {
      onColorsChange(newColors);
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Generate summary for collapsed state
  const getSummary = () => {
    const parts: string[] = [];
    if (detectedColors.length > 0) {
      parts.push(detectedColors.map(c => c.name).join(", "));
    }
    if (brand.trim().length > 0) {
      parts.push(brand.trim());
    }
    return parts.join(" • ");
  };

  const summary = getSummary();

  return (
    <Animated.View
      entering={FadeInDown.delay(200)}
      style={{ 
        marginBottom: 0,
        backgroundColor: colors.bg.elevated,
        borderWidth: 1,
        borderColor: colors.border.subtle,
        borderRadius: borderRadius.card,
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={handleToggle}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: spacing.md + spacing.xs / 2,
          paddingHorizontal: spacing.md,
        }}
      >
        <View style={{ flex: 1, marginRight: spacing.sm }}>
          <Text
            style={{
              ...typography.ui.sectionTitle,
              color: colors.text.primary,
            }}
          >
            Add details
          </Text>
          {!isExpanded && summary.length > 0 && (
            <Text
              style={{
                ...typography.ui.caption,
                color: colors.text.tertiary,
                marginTop: spacing.xs / 2 + 1,
              }}
              numberOfLines={1}
            >
              {summary}
            </Text>
          )}
        </View>
        {isExpanded ? (
          <ChevronUp size={20} color={colors.text.tertiary} strokeWidth={1.5} />
        ) : (
          <ChevronDown size={20} color={colors.text.tertiary} strokeWidth={1.5} />
        )}
      </Pressable>

      {isExpanded && (
        <Animated.View 
          entering={FadeIn} 
          style={{ 
            paddingHorizontal: spacing.md,
            paddingBottom: spacing.md,
            borderTopWidth: 0.5,
            borderTopColor: colors.border.subtle,
          }}
        >
          {/* Colors - editable with simple text field */}
          <View style={{ marginBottom: spacing.lg, marginTop: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }}>
              <Text
                style={{
                  ...typography.ui.sectionTitle,
                  color: colors.text.primary,
                  flex: 1,
                }}
              >
                Colors
              </Text>
              {!isEditingColors && detectedColors.length > 0 && (
                <Pressable
                  onPress={handleStartEditColors}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={{
                    padding: spacing.sm,
                  }}
                >
                  <Pencil size={15} color={colors.text.tertiary} strokeWidth={1.5} />
                </Pressable>
              )}
            </View>
            {isEditingColors ? (
              // Show simple text field when editing (like Brand field)
              <TextInput
                value={colorInputText}
                onChangeText={setColorInputText}
                onSubmitEditing={handleSaveColors}
                onBlur={handleSaveColors}
                placeholder="White, Blue, Navy..."
                placeholderTextColor={colors.text.tertiary}
                returnKeyType="done"
                autoFocus
                style={{
                  backgroundColor: colors.bg.elevated,
                  borderRadius: components.image.borderRadius,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm + spacing.xs,
                  ...typography.ui.body,
                  color: colors.text.primary,
                  borderWidth: 1,
                  borderColor: colors.border.subtle,
                }}
              />
            ) : detectedColors.length > 0 ? (
              // Show swatch + label when not editing and colors exist
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
                {detectedColors.map((color, i) => {
                  const adjustedColor = adjustColorSaturation(color.hex);
                  return (
                    <Pressable
                      key={`chip-${i}`}
                      onPress={handleStartEditColors}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: spacing.sm,
                      }}
                    >
                      <View
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: borderRadius.pill,
                          backgroundColor: adjustedColor,
                          marginRight: 8,
                          borderWidth: 0.5,
                          borderColor: "rgba(0,0,0,0.06)",
                        }}
                      />
                      <Text
                        style={{
                          ...typography.ui.body,
                          color: colors.text.primary,
                        }}
                      >
                        {color.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              // Show placeholder when no colors
              <Pressable onPress={handleStartEditColors}>
                <View
                  style={{
                    backgroundColor: colors.bg.elevated,
                    borderRadius: components.image.borderRadius,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm + spacing.xs,
                    borderWidth: 1,
                    borderColor: colors.border.subtle,
                  }}
                >
                  <Text
                    style={{
                      ...typography.ui.body,
                      color: colors.text.tertiary,
                    }}
                  >
                    White, Blue, Navy...
                  </Text>
                </View>
              </Pressable>
            )}
          </View>

          {/* Brand */}
          <View>
            <Text
              style={{ 
                ...typography.ui.sectionTitle,
                color: colors.text.primary,
                marginBottom: spacing.sm,
              }}
            >
              Brand
            </Text>
            <TextInput
              value={brand}
              onChangeText={onBrandChange}
              placeholder="Zara, H&M..."
              placeholderTextColor={colors.text.tertiary}
              style={{ 
                backgroundColor: colors.bg.elevated,
                borderRadius: components.image.borderRadius,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm + spacing.xs,
                ...typography.ui.body,
                color: colors.text.primary,
                borderWidth: 1,
                borderColor: colors.border.subtle,
              }}
            />
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

export default function AddItemScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string }>();
  const cameraRef = useRef<CameraView>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const optionalDetailsY = useRef<number>(0); // scroll target for optional details
  const [permission, requestPermission] = useCameraPermissions();
  const addWardrobeItemMutation = useAddWardrobeItem();
  const { user } = useAuth();

  // State
  const [screenState, setScreenState] = useState<ScreenState>("ready");
  const [isCapturing, setIsCapturing] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const [isNonFashionItem, setIsNonFashionItem] = useState(false);
  const [isUncertainFashion, setIsUncertainFashion] = useState(false);
  const [creditCheckError, setCreditCheckError] = useState<'network' | 'other' | null>(null);
  const [saveError, setSaveError] = useState<'network' | 'other' | null>(null);
  const [analysis, setAnalysis] = useState<ClothingAnalysisResult | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [selectedStyles, setSelectedStyles] = useState<StyleVibe[]>([]);
  const [editedColors, setEditedColors] = useState<ColorInfo[]>([]);
  const [brand, setBrand] = useState("");
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // Loading state for Add to Wardrobe button
  // Idempotency key for current attempt - reused if AI fails and user retries
  const [currentIdempotencyKey, setCurrentIdempotencyKey] = useState<string | null>(null);
  
  // AbortController for cancelling in-flight analysis when user closes screen
  // isActiveRef prevents state updates after unmount
  const analysisAbortRef = useRef<AbortController | null>(null);
  const isActiveRef = useRef(true);
  
  // Background state tracking for auto-retry
  const wasBackgroundedDuringAnalysis = useRef(false);
  const pendingRetryUri = useRef<string | null>(null);
  const pendingRetryKey = useRef<string | null>(null);

  // Quota and Pro status (usage-based, synced across devices)
  const { isPro, refetch: refetchProStatus } = useProStatus();
  const { wardrobeAddsUsed, hasWardrobeAddsRemaining, isLoading: isLoadingQuota } = useUsageQuota();

  const captureScale = useSharedValue(1);

  // Debug: Log quota state on mount and changes
  useEffect(() => {
    console.log("[Quota Debug] Add Item Screen - isPro:", isPro, "wardrobeAddsUsed:", wardrobeAddsUsed, "hasWardrobeAddsRemaining:", hasWardrobeAddsRemaining);
  }, [isPro, wardrobeAddsUsed, hasWardrobeAddsRemaining]);

  // Check quota on mount and when usage changes - show paywall if exceeded and not Pro
  // BUT only if we're in "ready" state - don't interrupt if analysis already succeeded
  useEffect(() => {
    // Wait for quota to load before checking
    if (isLoadingQuota) return;
    // Don't show paywall if analysis already succeeded (credit was used for this session)
    if (screenState === "analyzed" || screenState === "processing") return;
    if (!isPro && !hasWardrobeAddsRemaining) {
      console.log("[Quota Debug] Showing paywall - quota exceeded");
      setShowPaywall(true);
    }
  }, [isPro, hasWardrobeAddsRemaining, isLoadingQuota, screenState]);

  // Rotate tips every 4 seconds (same as Scan)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Cleanup: mark inactive + abort any in-flight analysis on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      analysisAbortRef.current?.abort();
    };
  }, []);

  // AppState listener for auto-retry when returning from background
  // If user backgrounds the app during analysis, retry automatically when they return
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' && screenState === 'processing') {
        // Mark that we went background during analysis
        console.log('[AddItem] App went background during analysis, will retry on return');
        wasBackgroundedDuringAnalysis.current = true;
        pendingRetryUri.current = imageUri;
        pendingRetryKey.current = currentIdempotencyKey;
      } else if (nextState === 'active' && wasBackgroundedDuringAnalysis.current) {
        // Returned to foreground after backgrounding during analysis
        wasBackgroundedDuringAnalysis.current = false;
        const retryUri = pendingRetryUri.current;
        const retryKey = pendingRetryKey.current;
        pendingRetryUri.current = null;
        pendingRetryKey.current = null;
        
        // Auto-retry if analysis failed while backgrounded (state reset to 'ready')
        // Use the same idempotency key to prevent double quota charge
        if (retryUri && screenState === 'ready') {
          console.log('[AddItem] Returning from background, auto-retrying analysis');
          processImage(retryUri, retryKey ?? undefined);
        } else if (screenState === 'analyzed') {
          console.log('[AddItem] Returning from background, analysis already succeeded');
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [screenState, imageUri, currentIdempotencyKey]);

  // Optional preselect from route params (used by "Helpful additions" flows)
  useEffect(() => {
    if (category) return; // don't override user/AI selection
    const maybe = params.category;
    if (typeof maybe !== "string") return;
    const match = CATEGORIES.find((c) => c.id === maybe)?.id;
    if (match) {
      setCategory(match);
    }
  }, [params.category, category]);

  const captureButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: captureScale.value }],
  }));

  // Check quota before allowing capture
  const checkQuotaAndProceed = (): boolean => {
    console.log("[Quota Debug] checkQuotaAndProceed - isPro:", isPro, "hasWardrobeAddsRemaining:", hasWardrobeAddsRemaining, "wardrobeAddsUsed:", wardrobeAddsUsed);
    if (isPro) {
      console.log("[Quota Debug] User is Pro - bypassing quota");
      return true;
    }
    if (hasWardrobeAddsRemaining) {
      console.log("[Quota Debug] Free user has adds remaining");
      return true;
    }

    // Show paywall
    console.log("[Quota Debug] Showing paywall - no adds remaining");
    setShowPaywall(true);
    return false;
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Abort any in-flight analysis to prevent state updates after close
    // Don't null the ref here - let finally clean it up safely
    analysisAbortRef.current?.abort();
    router.back();
  };

  const handlePaywallClose = () => {
    setShowPaywall(false);
    // Go back since user declined to upgrade
    router.back();
  };

  const handlePaywallSuccess = () => {
    setShowPaywall(false);
    // Refetch pro status to update state
    refetchProStatus();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const processImage = async (uri: string, retryKey?: string) => {
    setImageUri(uri);
    setScreenState("processing");
    setAnalysisFailed(false);
    setIsNonFashionItem(false);
    setIsUncertainFashion(false);
    setAnalysis(null);

    // Create local AbortController for this analysis attempt
    // Store in ref so close/unmount can abort, but use local var for checks
    const controller = new AbortController();
    analysisAbortRef.current?.abort(); // Cancel any previous in-flight analysis
    analysisAbortRef.current = controller;

    // For new attempts, generate new idempotency key
    // For retries, reuse the existing key to prevent double-charging
    const idempotencyKey = retryKey ?? generateIdempotencyKey();
    if (!retryKey) {
      setCurrentIdempotencyKey(idempotencyKey);
    }

    try {
      // Call Edge Function which handles quota + AI call atomically
      // No separate client-side quota check - Edge Function is the single source of truth
      // Using operationType: 'wardrobe_add' to consume from the correct quota pool
      // Using skipCache: true since wardrobe photos are user's own images (unlikely to be cached)
      console.log("[AddItem] Starting analysis with key:", idempotencyKey);
      
      const result = await analyzeClothingImage({ 
        imageUri: uri, 
        idempotencyKey,
        operationType: 'wardrobe_add', // Use wardrobe add quota pool
        skipCache: true, // Skip cache lookup for user's own photos
        signal: controller.signal,
      });
      
      // Check if user closed screen or component unmounted during analysis
      if (!isActiveRef.current || controller.signal.aborted) {
        console.log("[AddItem] Aborted - screen closed/unmounted, skipping state update");
        return;
      }
      
      // Handle analysis failure
      if (!result.ok) {
        console.log("Analysis failed:", result.error.kind, result.error.message);
        
        // Don't show error UI for user cancellations
        if (result.error.kind === "cancelled") {
          console.log("Analysis cancelled by user, resetting");
          setScreenState("ready");
          return;
        }
        
        // Quota exceeded: show paywall
        if (result.error.kind === "quota_exceeded") {
          console.log("Quota exceeded, showing paywall");
          setScreenState("ready");
          setShowPaywall(true);
          return;
        }
        
        // Network errors: show modal (user can't save without connection anyway)
        if (result.error.kind === "no_network") {
          console.log("Network error during analysis, showing modal");
          // Reset isCapturing so user can take another photo after dismissing
          setIsCapturing(false);
          setCreditCheckError('network');
          setScreenState("ready");
          return;
        }
        
        // Other errors: let user proceed with manual form
        setAnalysisFailed(true);
        setScreenState("analyzed");
        return;
      }
      
      // Success - extract analysis data
      const analysisData = result.data;
      setAnalysis(analysisData);
      
      // Check if this is a non-fashion item (mug, phone, etc.)
      if (analysisData.isFashionItem === false) {
        setIsNonFashionItem(true);
        setIsUncertainFashion(false);
        setCategory(null);
        setSelectedStyles([]);
        setEditedColors([]);
        setAnalysisFailed(false);
        setScreenState("analyzed");
        return;
      }
      
      // Check if fashion but uncertain category (blurry photo)
      if (analysisData.category === "unknown") {
        setIsUncertainFashion(true);
        setIsNonFashionItem(false);
        setCategory(null);
        setSelectedStyles([]);
        setEditedColors(analysisData.colors || []);
        setAnalysisFailed(false);
        setScreenState("analyzed");
        // Don't return - let user pick a category
      } else {
        setCategory(analysisData.category);
        // Pre-select style tags from AI analysis
        if (analysisData.styleTags && analysisData.styleTags.length > 0) {
          setSelectedStyles(analysisData.styleTags);
        }
        if (analysisData.colors) {
          setEditedColors(analysisData.colors); // Initialize edited colors with detected colors
        }
        setAnalysisFailed(false);
        setIsNonFashionItem(false);
        setIsUncertainFashion(false);
        setScreenState("analyzed");
      }
    } catch (error) {
      // Unexpected errors (not from analyzeClothingImage)
      // Usually network errors during credit consumption
      // Note: Supabase errors have .message but aren't Error instances
      const errMessage = (error as any)?.message || (error instanceof Error ? error.message : String(error || ""));
      const isNetworkErr =
        errMessage.includes("Network request failed") ||
        errMessage.includes("The Internet connection appears to be offline") ||
        errMessage.includes("The network connection was lost") ||
        errMessage.includes("Unable to resolve host") ||
        errMessage.includes("Failed to fetch") ||
        errMessage.includes("fetch failed") ||
        errMessage.includes("ENOTFOUND") ||
        errMessage.includes("ECONNREFUSED");
      
      // Don't show modal for user-initiated cancellation (abort on unmount)
      const isCancelled = errMessage.includes("cancelled") || errMessage.includes("aborted");
      if (isCancelled) {
        console.log("[AddItem] Credit check cancelled, ignoring");
        setIsCapturing(false);
        setScreenState("ready");
        return;
      }
      
      console.log("[AddItem] Error during processing:", errMessage, "isNetwork:", isNetworkErr);
      
      // Reset isCapturing so user can take another photo after dismissing
      setIsCapturing(false);
      
      if (isNetworkErr) {
        // Network error: show modal (can't proceed without connection)
        setCreditCheckError('network');
        setScreenState("ready");
      } else {
        // Other errors during credit check: show modal
        setCreditCheckError('other');
        setScreenState("ready");
      }
    } finally {
      // Clear ref only if it still points to this controller (prevents race with new attempts)
      if (analysisAbortRef.current === controller) {
        analysisAbortRef.current = null;
      }
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing || screenState === "processing") return;

    // Check quota first
    if (!checkQuotaAndProceed()) {
      return;
    }

    setIsCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    captureScale.value = withSpring(0.9, {}, () => {
      captureScale.value = withSpring(1);
    });

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
      });

      if (photo?.uri) {
        processImage(photo.uri);
      }
    } catch (error) {
      console.error("Error capturing photo:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setIsCapturing(false);
    }
  };

  const handlePickImage = async () => {
    if (screenState === "processing") return;

    // Check quota first
    if (!checkQuotaAndProceed()) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,  // No crop UI - full image selected as-is
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      processImage(result.assets[0].uri);
    }
  };

  const toggleStyle = (style: StyleVibe) => {
    setSelectedStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    );
  };

  // Require category AND at least one style tag AND must be a fashion item (or uncertain with category selected)
  const canAdd = imageUri && category && selectedStyles.length > 0 && screenState === "analyzed" && !isNonFashionItem;

  const handleAddToWardrobe = async () => {
    if (!canAdd || !imageUri || !category || selectedStyles.length === 0 || !user?.id || isSaving) return;

    try {
      // Show loading state on button (brief - just for local save)
      setIsSaving(true);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Note: Quota was already consumed in processImage() before the AI call
      // No need to increment here

      // PHASE 1: Save image locally (instant!)
      console.log("[Storage] Saving image locally for instant access...");
      const localImageUri = await saveImageLocally(imageUri, user.id);
      console.log("[Storage] Image saved locally:", localImageUri);

      const attributes = analysis?.itemSignals
        ? {
            silhouette: analysis.itemSignals.silhouetteVolume || analysis.itemSignals.dressSilhouette,
            length: analysis.itemSignals.lengthCategory as "cropped" | "regular" | "long" | "unknown" | undefined,
            structure: analysis.itemSignals.structure as "soft" | "structured" | "unknown" | undefined,
            layering: analysis.itemSignals.layeringFriendly,
          }
        : undefined;

      // Save to database with local URI (instant!)
      const savedItem = await addWardrobeItemMutation.mutateAsync({
        imageUri: localImageUri,
        category,
        detectedLabel: analysis?.descriptiveLabel,
        attributes,
        colors: editedColors.length > 0 ? editedColors : (analysis?.colors || []),
        styleNotes: analysis?.styleNotes,
        brand: brand || undefined,
        userStyleTags: selectedStyles,
      });

      // Queue background upload (non-blocking, fire-and-forget)
      console.log("[Storage] Queuing background upload for:", savedItem.id);
      void queueBackgroundUpload(savedItem.id, localImageUri, user.id);

      // Set global flag for wardrobe page to show "Added to Wardrobe" toast
      (globalThis as typeof globalThis & { __wardrobeItemAdded?: boolean }).__wardrobeItemAdded = true;

      // Navigate back to previous screen (wardrobe tab if came from there)
      // Using back() instead of replace() to avoid duplicate screens in stack
      if (router.canGoBack()) {
        router.back();
      } else {
        // Fallback: if no history (deep link), go to wardrobe tab
        router.replace("/(tabs)/wardrobe");
      }
    } catch (error) {
      console.error("[Storage] Failed to add item:", error);
      setIsSaving(false); // Reset loading state
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      // Check if it's a network error
      // Note: Supabase errors have .message but aren't Error instances
      const errMessage = (error as any)?.message || (error instanceof Error ? error.message : String(error || ""));
      const errLower = errMessage.toLowerCase();
      const isNetworkErr =
        errMessage.includes("Network request failed") ||
        errMessage.includes("The Internet connection appears to be offline") ||
        errMessage.includes("The network connection was lost") ||
        errMessage.includes("Unable to resolve host") ||
        errMessage.includes("Failed to fetch") ||
        errMessage.includes("fetch failed") ||
        errMessage.includes("ENOTFOUND") ||
        errMessage.includes("ECONNREFUSED") ||
        errMessage.includes("Could not connect to the server") ||
        errMessage.includes("A server with the specified hostname could not be found") ||
        errMessage.includes("A data connection is not currently allowed") ||
        errMessage.includes("not connected to the internet") ||
        errLower.includes("offline") ||
        errLower.includes("no internet") ||
        errLower.includes("network error") ||
        errLower.includes("network is unreachable") ||
        errLower.includes("socket is not connected") ||
        errLower.includes("timed out");

      console.log("[AddItem] Save error:", errMessage, "isNetwork:", isNetworkErr);
      setSaveError(isNetworkErr ? 'network' : 'other');
    }
  };

  // Permission handling
  if (!permission) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000", alignItems: "center", justifyContent: "center" }}>
        <Text 
          style={{ 
            ...typography.ui.body,
            color: colors.text.inverse,
          }}
        >
          Loading camera...
        </Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View 
        style={{ 
          flex: 1, 
          backgroundColor: colors.bg.primary, 
          alignItems: "center", 
          justifyContent: "center",
          paddingHorizontal: spacing.xl 
        }}
      >
        <View 
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            backgroundColor: colors.accent.terracottaLight,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: spacing.lg,
          }}
        >
          <Camera size={40} color={colors.accent.terracotta} strokeWidth={1.5} />
        </View>
        <Text
          style={{ 
            ...typography.display.screenTitle,
            color: colors.text.primary,
            textAlign: "center",
            marginBottom: spacing.sm,
          }}
        >
          Camera Access
        </Text>
        <Text
          style={{ 
            ...typography.ui.body,
            color: colors.text.secondary,
            textAlign: "center",
            marginBottom: spacing.xl,
          }}
        >
          Scan & Match needs camera access to{"\n"}capture your wardrobe items
        </Text>
        <ButtonPrimary
          label="Allow Camera"
          onPress={requestPermission}
          style={{ marginBottom: spacing.md }}
        />
        <ButtonTertiary
          label="Maybe Later"
          onPress={handleClose}
        />
      </View>
    );
  }

  // Debug overlay component
  const DebugOverlay = () => {
    if (!SHOW_DEBUG_OVERLAY) return null;
    const remaining = 15 - wardrobeAddsUsed;
    return (
      <View
        style={{
          position: "absolute",
          bottom: 120,
          left: spacing.md,
          right: spacing.md,
          backgroundColor: "rgba(0,0,0,0.85)",
          borderRadius: 12,
          padding: spacing.md,
          zIndex: 9999,
        }}
      >
        <Text style={{ color: "#FFD700", fontWeight: "bold", fontSize: 14, marginBottom: 4 }}>
          🔧 DEBUG: Quota Status (Usage-based)
        </Text>
        <Text style={{ color: "#FFF", fontSize: 12 }}>
          isPro: {isPro ? "✅ YES" : "❌ NO"}
        </Text>
        <Text style={{ color: "#FFF", fontSize: 12 }}>
          wardrobeAddsUsed: {wardrobeAddsUsed} / 15 (from DB)
        </Text>
        <Text style={{ color: "#FFF", fontSize: 12 }}>
          hasWardrobeAddsRemaining: {hasWardrobeAddsRemaining ? "✅ YES" : "❌ NO"}
        </Text>
        <Text style={{ color: remaining > 0 ? "#4ADE80" : "#F87171", fontSize: 12, fontWeight: "bold", marginTop: 4 }}>
          {remaining > 0 ? `${remaining} adds left` : "⚠️ SHOULD SHOW PAYWALL"}
        </Text>
      </View>
    );
  };

  // Camera view (Ready state or Processing state)
  if (screenState === "ready" || screenState === "processing") {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        <DebugOverlay />
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing="back"
        >
          {/* Camera overlay with rotating tips */}
          <CameraOverlay currentTip={TIPS[currentTipIndex]} />

          {/* Processing overlay */}
          {screenState === "processing" && <ProcessingOverlay />}

          {/* Top bar - matches Scan screen layout */}
          <View
            style={{ 
              position: "absolute", 
              top: 0, 
              left: 0, 
              right: 0, 
              paddingHorizontal: spacing.md + spacing.xs,
              paddingTop: insets.top + spacing.md 
            }}
          >
            <Animated.View entering={FadeInDown.delay(100)}>
              {/* Close and Help buttons */}
              <View style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: spacing.md,
              }}>
                <IconButton
                  icon={X}
                  onPress={handleClose}
                  onDark
                />

                <IconButton
                  icon={HelpCircle}
                  onPress={() => setShowHelp(true)}
                  onDark
                />
              </View>

              {/* Title and subtitle - different text from Scan */}
              <View style={{ alignItems: "center" }}>
                <Text
                  style={{ 
                    ...typography.display.hero,
                    color: colors.text.inverse,
                    textAlign: "center",
                    marginBottom: spacing.xs,
                  }}
                >
                  Add to wardrobe
                </Text>
                <Text
                  style={{ 
                    ...typography.ui.body,
                    color: colors.text.inverse,
                    opacity: 0.7,
                    textAlign: "center",
                  }}
                >
                  Scan an item you already own.
                </Text>
              </View>
            </Animated.View>
          </View>

          {/* Bottom controls - matches Scan screen layout exactly */}
          <View
            style={{ 
              position: "absolute", 
              bottom: 0, 
              left: 0, 
              right: 0, 
              alignItems: "center",
              paddingBottom: insets.bottom + spacing.lg 
            }}
          >
            <Animated.View entering={FadeInUp.delay(200)} style={{ alignItems: "center" }}>
              {/* Shutter button - same size and style */}
              <Animated.View style={captureButtonStyle}>
                <Pressable
                  onPress={handleCapture}
                  disabled={isCapturing || screenState === "processing"}
                  style={{ 
                    width: 80, 
                    height: 80, 
                    borderRadius: 40, 
                    borderWidth: 4, 
                    borderColor: "#FFFFFF", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    backgroundColor: "rgba(255,255,255,0.1)",
                    opacity: isCapturing || screenState === "processing" ? 0.5 : 1 
                  }}
                >
                  <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#FFFFFF" }} />
                </Pressable>
              </Animated.View>

              {/* Secondary actions */}
              <View style={{ marginTop: spacing.lg, alignItems: "center" }}>
                <ButtonTertiary
                  label="Upload from photos"
                  onPress={handlePickImage}
                  disabled={screenState === "processing"}
                  onDark
                />
              </View>

              {/* Skip option */}
              <View style={{ marginTop: spacing.md }}>
                <ButtonTertiary
                  label="Skip for now"
                  onPress={handleClose}
                  onDark
                />
              </View>
            </Animated.View>
          </View>
        </CameraView>

        {/* Paywall modal */}
        <Paywall
          visible={showPaywall}
          onClose={handlePaywallClose}
          onPurchaseComplete={handlePaywallSuccess}
          reason="wardrobe_limit"
        />

        {/* Help bottom sheet */}
        <HelpBottomSheet
          visible={showHelp}
          onClose={() => setShowHelp(false)}
        />

        {/* Credit check error modal */}
        <Modal
          visible={creditCheckError !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setCreditCheckError(null)}
        >
          <Pressable 
            style={{ 
              flex: 1, 
              backgroundColor: colors.overlay.dark, 
              justifyContent: "center", 
              alignItems: "center",
              padding: spacing.lg,
            }}
            onPress={() => setCreditCheckError(null)}
          >
            <Pressable 
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: cards.elevated.backgroundColor,
                borderRadius: cards.elevated.borderRadius,
                padding: spacing.lg,
                width: "100%",
                maxWidth: 340,
                alignItems: "center",
                ...shadows.lg,
              }}
            >
              {/* Icon */}
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: colors.verdict.okay.bg,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: spacing.md,
                }}
              >
                {creditCheckError === 'network' ? (
                  <WifiOff size={28} color={colors.verdict.okay.text} strokeWidth={2} />
                ) : (
                  <AlertCircle size={28} color={colors.verdict.okay.text} strokeWidth={2} />
                )}
              </View>

              {/* Title */}
              <Text
                style={{
                  ...typography.ui.cardTitle,
                  textAlign: "center",
                  marginBottom: spacing.sm,
                }}
              >
                {creditCheckError === 'network' ? 'Connection unavailable' : "Couldn't check credits"}
              </Text>

              {/* Subtitle */}
              <Text
                style={{
                  ...typography.ui.body,
                  color: colors.text.secondary,
                  textAlign: "center",
                  marginBottom: spacing.xl,
                }}
              >
                {creditCheckError === 'network' 
                  ? 'Please check your internet and try again.' 
                  : 'Please try again in a moment.'}
              </Text>

              {/* Buttons */}
              <View style={{ gap: spacing.sm, width: "100%" }}>
                <ButtonPrimary
                  label="Try again"
                  onPress={() => setCreditCheckError(null)}
                />
                <ButtonTertiary
                  label="Close"
                  onPress={() => setCreditCheckError(null)}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  // ============================================
  // NON-FASHION ITEM GATE (full screen)
  // ============================================
  if (isNonFashionItem) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + spacing.md,
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.md,
          }}
        >
          <Pressable
            onPress={handleClose}
            style={{
              width: spacing.xxl,
              height: spacing.xxl,
              borderRadius: borderRadius.pill,
              backgroundColor: colors.surface.icon,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={20} color={colors.text.primary} strokeWidth={2} />
          </Pressable>
        </View>

        {/* Content */}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl }}>
          {/* Image preview */}
          {imageUri && (
            <View
              style={{
                width: 120,
                height: 120,
                borderRadius: borderRadius.card,
                overflow: "hidden",
                marginBottom: spacing.xl,
                ...shadows.md,
              }}
            >
              <Image
                source={{ uri: imageUri }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            </View>
          )}

          {/* Icon */}
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: borderRadius.card,
              backgroundColor: colors.accent.terracottaLight,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: spacing.lg,
            }}
          >
            <AlertTriangle size={32} color={colors.accent.terracotta} strokeWidth={1.5} />
          </View>

          {/* Title */}
          <Text
            style={{
              ...typography.display.screenTitle,
              color: colors.text.primary,
              textAlign: "center",
              marginBottom: spacing.sm,
            }}
          >
            Not a fashion item
          </Text>

          {/* Description */}
          <Text
            style={{
              ...typography.ui.body,
              color: colors.text.secondary,
              textAlign: "center",
              marginBottom: spacing.xl,
            }}
          >
            This doesn't look like clothing, shoes, a bag, or an accessory. Try scanning something wearable.
          </Text>

          {/* Label (if available) */}
          {analysis?.descriptiveLabel && (
            <Text
              style={{
                ...typography.ui.caption,
                color: colors.text.tertiary,
                textAlign: "center",
                marginBottom: spacing.xl,
              }}
            >
              Detected: {analysis.descriptiveLabel}
            </Text>
          )}

          {/* Actions */}
          <ButtonPrimary
            label="Try Another Photo"
            onPress={() => {
              setImageUri(null);
              setAnalysis(null);
              setIsNonFashionItem(false);
              setScreenState("ready");
            }}
            style={{ width: "100%", marginBottom: spacing.md }}
          />
          <ButtonTertiary
            label="Go Back"
            onPress={handleClose}
          />
        </View>
      </View>
    );
  }

  // ============================================
  // UNCERTAIN FASHION GATE (full screen with tips)
  // ============================================
  if (isUncertainFashion) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + spacing.md,
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.md,
          }}
        >
          <Pressable
            onPress={handleClose}
            style={{
              width: spacing.xxl,
              height: spacing.xxl,
              borderRadius: borderRadius.pill,
              backgroundColor: colors.surface.icon,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={20} color={colors.text.primary} strokeWidth={2} />
          </Pressable>
        </View>

        {/* Content */}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl }}>
          {/* Image preview */}
          {imageUri && (
            <View
              style={{
                width: 120,
                height: 120,
                borderRadius: borderRadius.card,
                overflow: "hidden",
                marginBottom: spacing.xl,
                ...shadows.md,
              }}
            >
              <Image
                source={{ uri: imageUri }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            </View>
          )}

          {/* Icon */}
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: borderRadius.card,
              backgroundColor: colors.verdict.context.bg,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: spacing.lg,
            }}
          >
            <HelpCircle size={32} color={colors.verdict.context.text} strokeWidth={1.5} />
          </View>

          {/* Title */}
          <Text
            style={{
              ...typography.display.screenTitle,
              color: colors.text.primary,
              textAlign: "center",
              marginBottom: spacing.sm,
            }}
          >
            Couldn't identify this item
          </Text>

          {/* Description */}
          <Text
            style={{
              ...typography.ui.body,
              color: colors.text.secondary,
              textAlign: "center",
              marginBottom: spacing.lg,
            }}
          >
            We couldn't determine what type of clothing this is. Try a clearer photo with better lighting.
          </Text>

          {/* Tips */}
          <View
            style={{
              backgroundColor: colors.bg.tertiary,
              borderRadius: borderRadius.card,
              padding: spacing.md,
              marginBottom: spacing.xl,
              width: "100%",
            }}
          >
            <Text style={{ ...typography.ui.caption, color: colors.text.tertiary, marginBottom: spacing.sm }}>
              Tips for better results:
            </Text>
            <Text style={{ ...typography.ui.body, color: colors.text.secondary, marginBottom: spacing.xs }}>
              • Lay flat or hang the item up
            </Text>
            <Text style={{ ...typography.ui.body, color: colors.text.secondary, marginBottom: spacing.xs }}>
              • Use good lighting
            </Text>
            <Text style={{ ...typography.ui.body, color: colors.text.secondary }}>
              • Include the full item in frame
            </Text>
          </View>

          {/* Actions */}
          <ButtonPrimary
            label="Try Another Photo"
            onPress={() => {
              setImageUri(null);
              setAnalysis(null);
              setIsUncertainFashion(false);
              setScreenState("ready");
            }}
            style={{ width: "100%", marginBottom: spacing.md }}
          />
          <ButtonTertiary
            label="Go Back"
            onPress={handleClose}
          />
        </View>
      </View>
    );
  }

  // Analyzed state - show results with category selection
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <DebugOverlay />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: insets.top + spacing.md,
            paddingBottom: spacing.md,
            backgroundColor: colors.bg.primary,
          }}
        >
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Pressable
                onPress={handleClose}
                style={{
                  width: spacing.xxl,
                  height: spacing.xxl,
                  borderRadius: borderRadius.pill,
                  backgroundColor: colors.surface.icon,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={20} color={colors.text.primary} strokeWidth={1.5} />
              </Pressable>
              <View style={{ alignItems: "center", flex: 1, marginHorizontal: spacing.md }}>
                <Text
                  style={{
                    ...typography.display.screenTitle,
                    color: colors.text.primary,
                  }}
                  numberOfLines={1}
                >
                  Confirm details
                </Text>
              </View>
              <View style={{ width: spacing.xxl }} />
            </View>
          </Animated.View>
          {/* Separator line */}
          <View style={{ height: 1, backgroundColor: colors.border.hairline }} />
        </View>

        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ 
            paddingTop: spacing.md, 
            paddingBottom: insets.bottom + 100, // Bottom bar: paddingTop(16) + separator(1) + margin(16) + button(56) + paddingBottom(16) = 105, plus safe area
            paddingHorizontal: spacing.lg 
          }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {/* Item Summary Card */}
          <Animated.View
            entering={FadeInDown.delay(150)}
            style={{
              marginBottom: spacing.lg,
              // V3: cards.standard = border-first, no shadow
              backgroundColor: cards.standard.backgroundColor,
              borderWidth: cards.standard.borderWidth,
              borderColor: cards.standard.borderColor,
              borderRadius: cards.standard.borderRadius,
              overflow: "hidden",
            }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setIsSummaryExpanded(!isSummaryExpanded);
              }}
              accessibilityLabel={isSummaryExpanded ? "Collapse item details" : "Expand item details"}
            >
              <View
                style={{
                  padding: spacing.md,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                {imageUri && (
                  <Image
                    source={{ uri: imageUri }}
                    style={{ width: spacing.xxl + spacing.xs, height: spacing.xxl + spacing.xs, borderRadius: borderRadius.image }}
                    contentFit="cover"
                  />
                )}
                <View style={{ flex: 1, marginLeft: spacing.sm + spacing.xs / 2 }}>
                  {analysisFailed ? (
                    <View style={{ flexDirection: "column" }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <AlertCircle size={16} color={colors.verdict.okay.text} style={{ marginRight: spacing.sm }} />
                        <Text
                          style={{ 
                            ...typography.ui.bodyMedium,
                            color: colors.text.primary,
                            flex: 1,
                          }}
                        >
                          Couldn't analyze automatically
                        </Text>
                      </View>
                      <Text
                        style={{
                          ...typography.ui.caption,
                          color: colors.text.tertiary,
                          marginTop: spacing.xs,
                          marginLeft: 16 + spacing.sm, // Align with text after icon
                        }}
                      >
                        Select a category below to add this item manually.
                      </Text>
                    </View>
                  ) : analysis ? (
                    <Text
                      style={{
                        ...typography.ui.cardTitle,
                        color: colors.text.primary,
                      }}
                    >
                      {capitalizeFirst(analysis.descriptiveLabel)}
                    </Text>
                  ) : (
                    <Text
                      style={{
                        ...typography.ui.bodyMedium,
                        color: colors.text.primary,
                      }}
                    >
                      Analyzing...
                    </Text>
                  )}
                </View>
                {/* Chevron */}
                {analysis && analysis.styleNotes && analysis.styleNotes.length > 0 && (
                  <ChevronDown
                    size={20}
                    color={colors.text.secondary}
                    style={{
                      transform: [{ rotate: isSummaryExpanded ? "180deg" : "0deg" }],
                    }}
                  />
                )}
              </View>
              {/* Expanded description */}
              {isSummaryExpanded && analysis && analysis.styleNotes && analysis.styleNotes.length > 0 && (
                <Animated.View
                  entering={FadeIn.duration(200)}
                  exiting={FadeOut.duration(200)}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingBottom: spacing.md,
                    borderTopWidth: 1,
                    borderTopColor: colors.border.hairline,
                    marginTop: spacing.sm + spacing.xs / 2,
                    paddingTop: spacing.sm + spacing.xs / 2,
                  }}
                >
                  <Text
                    style={{
                      ...typography.ui.caption,
                      color: colors.text.secondary,
                    }}
                  >
                    {capitalizeItems(analysis.styleNotes).join(" · ")}
                  </Text>
                </Animated.View>
              )}
            </Pressable>
          </Animated.View>

          {/* Category, Style, and optional details */}
          <View style={{ paddingHorizontal: 0 }}>
            <CategoryPicker selected={category} onSelect={setCategory} />

          {category && (
            <>
              <StyleTagPicker
                selectedStyles={selectedStyles}
                onToggleStyle={toggleStyle}
              />
              <View
                onLayout={(event) => {
                  optionalDetailsY.current = event.nativeEvent.layout.y;
                }}
              >
                <OptionalDetails
                  detectedColors={editedColors.length > 0 ? editedColors : (analysis?.colors || [])}
                  originalColors={analysis?.colors}
                  brand={brand}
                  onBrandChange={setBrand}
                  onColorsChange={setEditedColors}
                  onExpand={() => {
                    // Scroll to the OptionalDetails position smoothly
                    if (scrollViewRef.current && optionalDetailsY.current > 0) {
                      scrollViewRef.current.scrollTo({
                        y: optionalDetailsY.current - 20,
                        animated: true,
                      });
                    }
                  }}
                />
              </View>
            </>
          )}
        </View>
      </ScrollView>

        {/* Bottom action */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: colors.bg.primary,
            paddingHorizontal: spacing.lg,
            paddingBottom: insets.bottom,
            paddingTop: spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.border.hairline,
            // V3: upward shadow for sticky footer
            ...shadows.md,
          }}
        >
          <ButtonPrimary
            label="Add to wardrobe"
            onPress={handleAddToWardrobe}
            disabled={!canAdd}
            loading={isSaving}
          />
        </View>
      </KeyboardAvoidingView>

      {/* Save error modal */}
      <Modal
        visible={saveError !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSaveError(null)}
      >
        <Pressable 
          style={{ 
            flex: 1, 
            backgroundColor: colors.overlay.dark, 
            justifyContent: "center", 
            alignItems: "center",
            padding: spacing.lg,
          }}
          onPress={() => setSaveError(null)}
        >
          <Pressable 
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: cards.elevated.backgroundColor,
              borderRadius: cards.elevated.borderRadius,
              padding: spacing.lg,
              width: "100%",
              maxWidth: 340,
              alignItems: "center",
              ...shadows.lg,
            }}
          >
            {/* Icon */}
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: colors.verdict.okay.bg,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing.md,
              }}
            >
              {saveError === 'network' ? (
                <WifiOff size={28} color={colors.verdict.okay.text} strokeWidth={2} />
              ) : (
                <AlertCircle size={28} color={colors.verdict.okay.text} strokeWidth={2} />
              )}
            </View>

            {/* Title */}
            <Text
              style={{
                ...typography.ui.cardTitle,
                textAlign: "center",
                marginBottom: spacing.sm,
              }}
            >
              {saveError === 'network' ? 'Connection unavailable' : "Couldn't save item"}
            </Text>

            {/* Subtitle */}
            <Text
              style={{
                ...typography.ui.body,
                color: colors.text.secondary,
                textAlign: "center",
                marginBottom: spacing.xl,
              }}
            >
              {saveError === 'network' 
                ? 'Please check your internet and try again.' 
                : 'Please try again in a moment.'}
            </Text>

            {/* Buttons */}
            <View style={{ gap: spacing.sm, width: "100%" }}>
              <ButtonPrimary
                label="Try again"
                onPress={() => setSaveError(null)}
              />
              <ButtonTertiary
                label="Close"
                onPress={() => setSaveError(null)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
