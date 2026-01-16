import React, { useState, useRef, useEffect } from "react";
import { View, Text, Pressable, Modal, ScrollView, Image } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
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
  RefreshCw,
  WifiOff,
} from "lucide-react-native";

import { useSnapToMatchStore } from "@/lib/store";
import { ScannedItem } from "@/lib/types";
import { analyzeClothingImage } from "@/lib/openai";
import { prewarmCacheConnection } from "@/lib/analysis-cache";
import { colors, typography, spacing, components } from "@/lib/design-tokens";
import { ButtonTertiary } from "@/components/ButtonTertiary";
import { IconButton } from "@/components/IconButton";
import { ButtonPrimary } from "@/components/ButtonPrimary";
import { useWardrobe, usePreferences, useUsageQuota, useConsumeScanCredit, generateIdempotencyKey } from "@/lib/database";
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
    <View className="absolute inset-0 items-center justify-center">
      {/* Subtle rounded frame guide */}
      <Animated.View
        style={[
          frameStyle,
          {
            width: 260,
            height: 340,
            borderWidth: 2,
            borderColor: "rgba(255,255,255,0.12)",
            borderRadius: 20,
            backgroundColor: "transparent",
          },
        ]}
      />

      {/* Rotating tip */}
      <View className="absolute bottom-8 items-center px-8">
        <Animated.View
          style={[tipStyle]}
          className="bg-black/50 rounded-full px-5 py-2.5"
        >
          <Text
            style={{ 
              fontFamily: "Inter_400Regular", 
              fontSize: typography.sizes.caption,
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
      className="absolute inset-0 bg-black/80 items-center justify-center"
    >
      <View className="items-center">
        <View className="flex-row mb-6">
          <Animated.View style={[dot1Style, { width: spacing.sm + spacing.xs, height: spacing.sm + spacing.xs, borderRadius: (spacing.sm + spacing.xs) / 2, backgroundColor: colors.accent.terracotta, marginHorizontal: spacing.xs }]} />
          <Animated.View style={[dot2Style, { width: spacing.sm + spacing.xs, height: spacing.sm + spacing.xs, borderRadius: (spacing.sm + spacing.xs) / 2, backgroundColor: colors.accent.terracotta, marginHorizontal: spacing.xs }]} />
          <Animated.View style={[dot3Style, { width: spacing.sm + spacing.xs, height: spacing.sm + spacing.xs, borderRadius: (spacing.sm + spacing.xs) / 2, backgroundColor: colors.accent.terracotta, marginHorizontal: spacing.xs }]} />
        </View>
        <Text
          style={{ 
            fontFamily: "Inter_500Medium", 
            fontSize: typography.sizes.h3,
            color: colors.text.inverse,
            textAlign: "center",
          }}
        >
          Checking how this might work for you...
        </Text>
      </View>
    </Animated.View>
  );
}

function ErrorOverlay({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const isNetworkError = message.toLowerCase().includes('connection');

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      className="absolute inset-0 bg-black/85 items-center justify-center px-8"
    >
      <View className="items-center">
        {/* Icon */}
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: "rgba(255,255,255,0.1)",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          {isNetworkError ? (
            <WifiOff size={28} color="rgba(255,255,255,0.8)" strokeWidth={1.5} />
          ) : (
            <RefreshCw size={28} color="rgba(255,255,255,0.8)" strokeWidth={1.5} />
          )}
        </View>

        {/* Message */}
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 16,
            color: colors.text.inverse,
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          {isNetworkError ? "Connection issue" : "Couldn't analyze"}
        </Text>
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 14,
            color: "rgba(255,255,255,0.7)",
            textAlign: "center",
            lineHeight: 20,
            marginBottom: 24,
          }}
        >
          {message}
        </Text>

        {/* Buttons */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => ({
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.1)",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 15,
                color: "rgba(255,255,255,0.8)",
              }}
            >
              Dismiss
            </Text>
          </Pressable>
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => ({
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: colors.accent.terracotta,
              opacity: pressed ? 0.8 : 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            })}
          >
            <RefreshCw size={16} color={colors.text.inverse} strokeWidth={2} />
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 15,
                color: colors.text.inverse,
              }}
            >
              Try again
            </Text>
          </Pressable>
        </View>
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
        className="flex-1 bg-black/50"
        onPress={onClose}
      />
      <View
        className="bg-bg rounded-t-3xl"
        style={{ paddingBottom: insets.bottom + 20 }}
      >
        <View className="items-center pt-3 pb-4">
          <View className="w-10 h-1 rounded-full bg-text/20" />
        </View>

        <View className="px-6 pb-4">
          <Text
            className="text-text mb-4"
            style={{ fontFamily: "Poppins_600SemiBold", fontSize: typography.styles.h2.fontSize, lineHeight: typography.styles.h2.lineHeight }}
          >
            How to scan
          </Text>

          <View className="space-y-4">
            <View className="flex-row items-start">
              <View className="h-6 w-6 rounded-full bg-accent/10 items-center justify-center mr-3 mt-0.5">
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: typography.sizes.meta, color: colors.accent.terracotta }}>1</Text>
              </View>
              <View className="flex-1">
                <Text className="text-text" style={{ fontFamily: "Inter_600SemiBold", fontSize: typography.sizes.body }}>
                  Hold the item up
                </Text>
                <Text className="text-text-muted mt-1" style={{ fontFamily: "Inter_400Regular", fontSize: typography.sizes.caption }}>
                  Lay it flat, hang it up, or hold it against a plain background
                </Text>
              </View>
            </View>

            <View className="flex-row items-start">
              <View className="h-6 w-6 rounded-full bg-accent/10 items-center justify-center mr-3 mt-0.5">
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: typography.sizes.meta, color: colors.accent.terracotta }}>2</Text>
              </View>
              <View className="flex-1">
                <Text className="text-text" style={{ fontFamily: "Inter_600SemiBold", fontSize: typography.sizes.body }}>
                  Fit it in the frame
                </Text>
                <Text className="text-text-muted mt-1" style={{ fontFamily: "Inter_400Regular", fontSize: typography.sizes.caption }}>
                  Best results when the full item is visible
                </Text>
              </View>
            </View>

            <View className="flex-row items-start">
              <View className="h-6 w-6 rounded-full bg-accent/10 items-center justify-center mr-3 mt-0.5">
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: typography.sizes.meta, color: colors.accent.terracotta }}>3</Text>
              </View>
              <View className="flex-1">
                <Text className="text-text" style={{ fontFamily: "Inter_600SemiBold", fontSize: typography.sizes.body }}>
                  Tap to capture
                </Text>
                <Text className="text-text-muted mt-1" style={{ fontFamily: "Inter_400Regular", fontSize: typography.sizes.caption }}>
                  We'll analyze the colors and style to find matches
                </Text>
              </View>
            </View>
          </View>

          <View style={{ marginTop: 24 }}>
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
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastImageUri, setLastImageUri] = useState<string | null>(null);
  const [lastImageSource, setLastImageSource] = useState<'camera' | 'gallery'>('camera');
  const [showPaywall, setShowPaywall] = useState(false);
  // Idempotency key for current attempt - reused on retries to prevent double-charging
  const [currentIdempotencyKey, setCurrentIdempotencyKey] = useState<string | null>(null);

  const setScannedItem = useSnapToMatchStore((s) => s.setScannedItem);
  const clearScan = useSnapToMatchStore((s) => s.clearScan);
  const setCachedWardrobe = useSnapToMatchStore((s) => s.setCachedWardrobe);
  const setCachedPreferences = useSnapToMatchStore((s) => s.setCachedPreferences);

  // Quota and Pro status (usage-based, synced across devices)
  const { isPro, refetch: refetchProStatus } = useProStatus();
  const { scansUsed, hasScansRemaining, isLoading: isLoadingQuota } = useUsageQuota();
  const consumeScanCredit = useConsumeScanCredit();

  // Fetch wardrobe and preferences to cache for Confidence Engine
  const { data: wardrobe = [] } = useWardrobe();
  const { data: preferences } = usePreferences();

  const captureScale = useSharedValue(1);

  // Check quota on mount and when usage changes - show paywall if exceeded and not Pro
  useEffect(() => {
    // Wait for quota to load before checking
    if (isLoadingQuota) return;
    if (!isPro && !hasScansRemaining) {
      setShowPaywall(true);
    }
  }, [isPro, hasScansRemaining, isLoadingQuota]);

  // Clear any previous scan when entering this screen
  useEffect(() => {
    clearScan();
  }, [clearScan]);

  // Pre-warm cache connection to avoid cold start latency during scan
  useEffect(() => {
    prewarmCacheConnection();
  }, []);

  // Rotate tips every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const captureButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: captureScale.value }],
  }));

  // Check quota before allowing capture
  const checkQuotaAndProceed = (): boolean => {
    if (isPro) return true; // Pro users have unlimited scans
    if (hasScansRemaining) return true; // Free user with scans remaining

    // Show paywall
    setShowPaywall(true);
    return false;
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing || isProcessing) return;

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

    // Check quota first
    if (!checkQuotaAndProceed()) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [3, 4],
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

  const processImage = async (imageUri: string, source: 'camera' | 'gallery' = 'camera', retryKey?: string) => {
    setIsProcessing(true);
    setIsCapturing(false);
    setScanError(null);
    setLastImageUri(imageUri);
    setLastImageSource(source);
    console.log("processImage called with imageUri:", imageUri?.slice(0, 50));

    // For new attempts, generate new idempotency key
    // For retries, reuse the existing key to prevent double-charging
    const idempotencyKey = retryKey ?? generateIdempotencyKey();
    if (!retryKey) {
      setCurrentIdempotencyKey(idempotencyKey);
    }

    try {
      // CRITICAL: Consume credit BEFORE AI call to prevent over-quota usage
      // This is atomic and server-side enforced
      // Pass idempotency key - same key for retries prevents double-charge
      console.log("[Quota] Attempting to consume scan credit with key:", idempotencyKey);
      const consumeResult = await consumeScanCredit.mutateAsync(idempotencyKey);
      console.log("[Quota] Consume result:", consumeResult.reason, consumeResult);
      
      if (!consumeResult.allowed) {
        // Credit denied - show paywall, DO NOT make AI call
        console.log("[Quota] Credit denied (reason:", consumeResult.reason, "), showing paywall");
        setIsProcessing(false);
        setShowPaywall(true);
        return;
      }
      
      // Credit consumed (or idempotent replay) - now safe to make AI call
      console.log("[Quota] Credit allowed (reason:", consumeResult.reason, "), proceeding with AI call");
      
      // Get image dimensions for telemetry
      const dimensions = await getImageDimensions(imageUri);
      
      // Analyze the image using AI - now returns AnalyzeResult
      console.log("Calling analyzeClothingImage...");
      const result = await analyzeClothingImage({
        imageUri,
        ctx: {
          image_source: source,
          image_width: dimensions.width,
          image_height: dimensions.height,
        },
      });
      
      // Handle analysis failure - show error, don't navigate
      if (!result.ok) {
        console.log("Analysis failed:", result.error.kind, result.error.message);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setIsProcessing(false);
        
        // Map error kind to user-friendly message
        let errorMessage: string;
        switch (result.error.kind) {
          case "no_network":
            errorMessage = "Connection issue. Check your internet and try again.";
            break;
          case "timeout":
            errorMessage = "Taking too long. Please try again.";
            break;
          case "rate_limited":
            errorMessage = "Too many requests. Please wait a moment and try again.";
            break;
          case "server_error":
            errorMessage = "Server issue. Please try again in a moment.";
            break;
          default:
            errorMessage = "Couldn't analyze this image. Try again or use a different photo.";
        }
        setScanError(errorMessage);
        return;
      }
      
      // Success - extract analysis data
      const analysis = result.data;
      console.log("Analysis result:", JSON.stringify(analysis));

      const scannedItem: ScannedItem = {
        id: Math.random().toString(36).substring(2, 15),
        imageUri,
        category: analysis.category,
        colors: analysis.colors,
        styleTags: analysis.styleTags,
        descriptiveLabel: analysis.descriptiveLabel,
        styleNotes: analysis.styleNotes,
        store: undefined,
        scannedAt: Date.now(),
        itemSignals: analysis.itemSignals,
        contextSufficient: analysis.contextSufficient,
        isFashionItem: analysis.isFashionItem,
      };

      setScannedItem(scannedItem);
      console.log("Scanned item set");

      // Sync wardrobe and preferences to store for Confidence Engine
      setCachedWardrobe(wardrobe);
      if (preferences) {
        setCachedPreferences(preferences);
      }

      // Navigate to results - Confidence Engine will evaluate matches there
      console.log("Navigating to results...");
      router.replace("/results");
      setIsProcessing(false);
    } catch (error) {
      // This catch handles unexpected errors (not from analyzeClothingImage)
      console.log("Unexpected error processing image:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setIsProcessing(false);
      setScanError("Something went wrong. Please try again.");
    }
  };

  const handleRetry = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setScanError(null);
    if (lastImageUri) {
      // IMPORTANT: Reuse the same idempotency key for retries
      // This prevents double-charging if the credit was consumed but AI failed
      processImage(lastImageUri, lastImageSource, currentIdempotencyKey ?? undefined);
    }
  };

  const handleDismissError = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setScanError(null);
    setLastImageUri(null);
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  // Permission handling
  if (!permission) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: typography.sizes.body,
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
      <View className="flex-1 bg-bg items-center justify-center px-8">
        <View className="h-24 w-24 rounded-full bg-accent/10 items-center justify-center mb-6">
          <Camera size={40} color={colors.accent.terracotta} strokeWidth={1.5} />
        </View>
        <Text
          style={{
            fontFamily: "Poppins_600SemiBold",
            fontSize: typography.styles.h2.fontSize,
            lineHeight: typography.styles.h2.lineHeight,
            color: colors.text.primary,
            textAlign: "center",
            marginBottom: spacing.xs,
          }}
        >
          Camera Access
        </Text>
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: typography.sizes.body,
            color: colors.text.secondary,
            lineHeight: typography.lineHeight.normal * typography.sizes.body,
            textAlign: "center",
            marginBottom: spacing.xl,
          }}
        >
          Scan & Match needs camera access to{"\n"}scan items while you shop
        </Text>
        <ButtonPrimary
          label="Allow Camera"
          onPress={requestPermission}
          style={{ marginBottom: 16 }}
        />
        <View style={{ marginTop: 16 }}>
          <ButtonTertiary
            label="Maybe Later"
            onPress={handleClose}
          />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing="back"
      >
        {/* Scan overlay with rotating tips */}
        <ScanOverlay currentTip={TIPS[currentTipIndex]} />

        {/* Processing overlay */}
        {isProcessing && <ProcessingOverlay />}

        {/* Error overlay */}
        {scanError && !isProcessing && (
          <ErrorOverlay
            message={scanError}
            onRetry={handleRetry}
            onDismiss={handleDismissError}
          />
        )}

        {/* Top bar - simplified */}
        <View
          className="absolute top-0 left-0 right-0 px-5"
          style={{ paddingTop: insets.top + 12 }}
        >
          <Animated.View entering={FadeInDown.delay(100)}>
            {/* Close and Help buttons */}
            <View className="flex-row justify-between items-center mb-4">
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
            <View className="items-center">
              <Text
                style={{ 
                  fontFamily: "Poppins_600SemiBold", 
                  fontSize: typography.styles.h1.fontSize,
                  lineHeight: typography.styles.h1.lineHeight,
                  color: colors.text.inverse,
                  textAlign: "center",
                  marginBottom: spacing.xs,
                }}
              >
                Scan item
              </Text>
              <Text
                style={{ 
                  fontFamily: "Inter_400Regular", 
                  fontSize: typography.sizes.body,
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
          className="absolute bottom-0 left-0 right-0 items-center"
          style={{ paddingBottom: insets.bottom + 24 }}
        >
          <Animated.View entering={FadeInUp.delay(200)} className="items-center">
            {/* Shutter button */}
            <Animated.View style={captureButtonStyle}>
              <Pressable
                onPress={handleCapture}
                disabled={isCapturing || isProcessing}
                className="h-20 w-20 rounded-full border-4 border-white items-center justify-center bg-white/10"
                style={{ opacity: isCapturing || isProcessing ? 0.5 : 1 }}
              >
                <View className="h-16 w-16 rounded-full bg-white" />
              </Pressable>
            </Animated.View>

            {/* Secondary actions */}
            <View style={{ marginTop: 24, alignItems: "center" }}>
              <ButtonTertiary
                label="Upload from photos"
                onPress={handlePickImage}
                disabled={isProcessing}
                onDark
              />
            </View>

            {/* Skip option */}
            <View style={{ marginTop: 16 }}>
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
