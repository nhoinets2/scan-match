import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, Pressable, Modal, ScrollView, Image } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import Animated, {
  FadeIn,
  FadeOut,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  X,
  Camera,
  ImageIcon,
  HelpCircle,
  ChevronDown,
} from "lucide-react-native";

import { useSnapToMatchStore } from "@/lib/store";
import { prewarmCacheConnection } from "@/lib/analysis-cache";
import { colors, typography, spacing, components, borderRadius, cards, shadows } from "@/lib/design-tokens";
import { ButtonTertiary } from "@/components/ButtonTertiary";
import { IconButton } from "@/components/IconButton";
import { ButtonPrimary } from "@/components/ButtonPrimary";
import { generateIdempotencyKey, useUsageQuota } from "@/lib/database";
import { useProStatus } from "@/lib/useProStatus";
import { Paywall } from "@/components/Paywall";

const TIPS = [
  "Lay flat or hang up for best results",
  "Good lighting helps us see colors",
  "Include the full item in frame",
  "Plain backgrounds work best",
];

function ScanOverlay({ currentTip }: { currentTip: string }) {
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
    // Fade tip in/out on change
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
      {/* Subtle rounded frame guide */}
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
          <Animated.View style={[dot1Style, { width: spacing.sm + spacing.xs, height: spacing.sm + spacing.xs, borderRadius: (spacing.sm + spacing.xs) / 2, backgroundColor: colors.accent.terracotta, marginHorizontal: spacing.xs }]} />
          <Animated.View style={[dot2Style, { width: spacing.sm + spacing.xs, height: spacing.sm + spacing.xs, borderRadius: (spacing.sm + spacing.xs) / 2, backgroundColor: colors.accent.terracotta, marginHorizontal: spacing.xs }]} />
          <Animated.View style={[dot3Style, { width: spacing.sm + spacing.xs, height: spacing.sm + spacing.xs, borderRadius: (spacing.sm + spacing.xs) / 2, backgroundColor: colors.accent.terracotta, marginHorizontal: spacing.xs }]} />
        </View>
        <Text
          style={{
            ...typography.ui.sectionTitle,
            color: colors.text.inverse,
            textAlign: "center",
          }}
        >
          Checking scan access...
        </Text>
      </View>
    </Animated.View>
  );
}

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

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isFocused, setIsFocused] = useState(true);

  const clearScan = useSnapToMatchStore((s) => s.clearScan);

  // Quota and Pro status
  const { isPro, refetch: refetchProStatus } = useProStatus();
  const { scansUsed, hasScansRemaining, isLoading: isLoadingQuota } = useUsageQuota();

  const captureScale = useSharedValue(1);

  // Clear any previous scan when entering this screen
  useEffect(() => {
    clearScan();
  }, [clearScan]);

  // Pre-warm cache connection to avoid cold start latency during scan
  useEffect(() => {
    prewarmCacheConnection();
  }, []);

  // Check quota on mount - show paywall if exceeded
  useEffect(() => {
    if (isLoadingQuota) return;
    if (!isPro && !hasScansRemaining) {
      console.log("[Scan] Quota exceeded, showing paywall");
      setShowPaywall(true);
    }
  }, [isPro, hasScansRemaining, isLoadingQuota]);

  // Rotate tips every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Reset processing state when screen regains focus
  // This fixes the issue where the processing overlay stays visible
  // when navigating back from results (e.g., after tapping X or "Scan another item")
  useFocusEffect(
    useCallback(() => {
      // Screen is now focused
      setIsFocused(true);
      setIsProcessing(false);
      setIsCapturing(false);

      return () => {
        // Screen is losing focus
        setIsFocused(false);
      };
    }, [])
  );

  const captureButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: captureScale.value }],
  }));

  // Check quota before allowing capture
  const checkQuotaAndProceed = (): boolean => {
    if (isPro) return true;
    if (hasScansRemaining) return true;
    console.log("[Scan] Quota check failed, showing paywall");
    setShowPaywall(true);
    return false;
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing || isProcessing) return;

    // Check quota before capture
    if (!checkQuotaAndProceed()) return;

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
        processImage(photo.uri, 'camera');
      }
    } catch (error) {
      console.error("Error capturing photo:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Friendly error - no "Error" word
      setIsCapturing(false);
    }
  };

  const handlePickImage = async () => {
    if (isProcessing) return;

    // Check quota before gallery pick
    if (!checkQuotaAndProceed()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,  // No crop UI - full image selected as-is
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      processImage(result.assets[0].uri, 'gallery');
    }
  };

  // Helper to get image dimensions
  const getImageDimensions = (uri: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      Image.getSize(
        uri,
        (width, height) => resolve({ width, height }),
        () => resolve({ width: 0, height: 0 }) // Fallback on error
      );
    });
  };

  // ============================================
  // SIMPLIFIED processImage
  // ============================================
  // Navigates directly to results with imageUri.
  // Quota is now handled atomically by the Edge Function in results.tsx.
  const processImage = async (imageUri: string, source: 'camera' | 'gallery' = 'camera') => {
    setIsProcessing(true);
    setIsCapturing(false);
    console.log("processImage called with imageUri:", imageUri?.slice(0, 50));

    // Generate analysisKey for idempotency (quota + analysis atomically handled by Edge Function)
    const analysisKey = generateIdempotencyKey();

    // Navigate to results - results.tsx will handle quota + analysis via Edge Function
    // Using push instead of replace to avoid flash of previous screen during transition
    router.push({
      pathname: "/results",
      params: {
        imageUri,
        analysisKey,
        source,
        fromScan: "true", // Flag to indicate this came from scan (for proper back navigation)
      },
    });

    // Don't reset isProcessing here - keep the processing overlay visible
    // The scan screen stays in the stack underneath results, so we want to keep
    // showing the overlay until results fully covers it
    // This prevents a flash of the camera view during the transition
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  // Paywall handlers
  const handlePaywallClose = () => {
    setShowPaywall(false);
    router.back(); // Go back when closing paywall (user can't scan without quota)
  };

  const handlePaywallSuccess = () => {
    setShowPaywall(false);
    refetchProStatus(); // Refresh Pro status after purchase
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
      <View style={{ flex: 1, backgroundColor: colors.bg.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl }}>
        <View style={{ 
          width: 96, 
          height: 96, 
          borderRadius: 48, 
          backgroundColor: colors.accent.terracottaLight,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.lg,
        }}>
          <Camera size={40} color={colors.accent.terracotta} strokeWidth={1.5} />
        </View>
        <Text
          style={{
            ...typography.display.screenTitle,
            color: colors.text.primary,
            textAlign: "center",
            marginBottom: spacing.xs,
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
          Scan & Match needs camera access to{"\n"}scan items while you shop
        </Text>
        <ButtonPrimary
          label="Allow Camera"
          onPress={requestPermission}
          style={{ marginBottom: spacing.md }}
        />
        <View style={{ marginTop: spacing.md }}>
          <ButtonTertiary
            label="Maybe Later"
            onPress={handleClose}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing="back"
      >
        {/* Scan overlay with rotating tips */}
        <ScanOverlay currentTip={TIPS[currentTipIndex]} />

        {/* Processing overlay - only show when screen is focused */}
        {isProcessing && isFocused && <ProcessingOverlay />}

        {/* Top bar - simplified */}
        <View
          style={{ 
            position: "absolute", 
            top: 0, 
            left: 0, 
            right: 0, 
            paddingHorizontal: spacing.md + spacing.xs,
            paddingTop: insets.top + spacing.sm + spacing.xs 
          }}
        >
          <Animated.View entering={FadeInDown.delay(100)}>
            {/* Close and Help buttons */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
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

            {/* Title and subtitle */}
            <View style={{ alignItems: "center" }}>
              <Text
                style={{ 
                  ...typography.display.hero,
                  color: colors.text.inverse,
                  textAlign: "center",
                  marginBottom: spacing.xs,
                }}
              >
                Scan item
              </Text>
              <Text
                style={{ 
                  ...typography.ui.body,
                  color: colors.text.inverse,
                  opacity: 0.7,
                  textAlign: "center",
                }}
              >
                Take a photo of the item you're considering.
              </Text>
            </View>
          </Animated.View>
        </View>

        {/* Bottom controls - simplified */}
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
            {/* Shutter button */}
            <Animated.View style={captureButtonStyle}>
              <Pressable
                onPress={handleCapture}
                disabled={isCapturing || isProcessing}
                style={{ 
                  width: 80, 
                  height: 80, 
                  borderRadius: 40, 
                  borderWidth: 4, 
                  borderColor: "#FFFFFF", 
                  alignItems: "center", 
                  justifyContent: "center", 
                  backgroundColor: "rgba(255,255,255,0.1)",
                  opacity: isCapturing || isProcessing ? 0.5 : 1 
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
                disabled={isProcessing}
                onDark
              />
            </View>

            {/* Skip option */}
            <View style={{ marginTop: spacing.md }}>
              <ButtonTertiary
                label="Skip for now"
                onPress={handleSkip}
                onDark
              />
            </View>
          </Animated.View>
        </View>
      </CameraView>

      {/* Help bottom sheet */}
      <HelpBottomSheet visible={showHelp} onClose={() => setShowHelp(false)} />

      {/* Paywall modal */}
      <Paywall
        visible={showPaywall}
        onClose={handlePaywallClose}
        onPurchaseComplete={handlePaywallSuccess}
        reason="in_store_limit"
      />
    </View>
  );
}
