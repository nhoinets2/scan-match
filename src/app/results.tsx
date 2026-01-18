// Results screen - displays outfit match analysis
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  useReducedMotion,
  cancelAnimation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  X,
  Check,
  AlertTriangle,
  CircleAlert,
  HelpCircle,
  Plus,
  Camera,
  Bookmark,
  BookmarkCheck,
  Lightbulb,
  Shirt,
  Layers,
  Package,
  ShoppingBag,
  Sparkles,
  Footprints,
  Circle,
  Box,
  RectangleHorizontal,
  Square,
  RectangleVertical,
  SquareStack,
  Container,
  Archive,
  Folder,
  ChevronRight,
  ChevronDown,
  Lock,
  RefreshCw,
  WifiOff,
  Clock,
  AlertOctagon,
  AlertCircle,
} from "lucide-react-native";
import { ThumbnailPlaceholderImage, ThumbnailWithFallback } from "@/components/PlaceholderImage";

import { useSnapToMatchStore } from "@/lib/store";
import { filterModeABullets } from "@/lib/mode-a-bullet-filter";
import { resolveBulletTitle } from "@/lib/confidence-engine/config";
import { getModeBBullets } from "@/lib/confidence-engine";
import { RESULTS_COPY, getMatchExplanation } from "@/lib/copy-constants";
import {
  useWardrobe,
  useWardrobeCount,
  useRecentChecks,
  useAddRecentCheck,
  useUpdateRecentCheckOutcome,
  usePreferences,
} from "@/lib/database";
import {
  ConfidenceLevel,
  OutfitCombo,
  WardrobeItem,
  Category,
  CATEGORIES,
  FitPreference,
  OutcomeState,
  StylingRisk,
  VerdictUIState,
  OkayReasonCode,
  RecentCheck,
} from "@/lib/types";
import { colors, spacing, typography, borderRadius, shadows, cards, button, components } from "@/lib/design-tokens";
import { getTextStyle } from "@/lib/typography-helpers";
import { runDecisionTree, outcomeToConfidence, DecisionTreeResult } from "@/lib/decision-tree";
import { ItemSignalsResult, analyzeClothingImage, AnalyzeError } from "@/lib/openai";
import { logAnalysisLifecycleEvent } from "@/lib/analysis-telemetry";
import { capitalizeFirst, capitalizeItems, capitalizeSentences } from "@/lib/text-utils";
import { generateIdempotencyKey } from "@/lib/database";
import { recordPositiveAction, requestReviewIfAppropriate } from "@/lib/useStoreReview";
import { useConfidenceEngine, tierToVerdictState, tierToLabel } from "@/lib/useConfidenceEngine";
import { prepareScanForSave, completeScanSave, isLocalUri, cancelUpload, cleanupScanStorage, queueScanUpload } from "@/lib/storage";
import { useAuth } from "@/lib/auth-context";
import { useComboAssembler, runShadowModeComparison } from "@/lib/useComboAssembler";
import type { AssembledCombo } from "@/lib/combo-assembler";
import { useResultsTabs, type ResultsTab } from "@/lib/useResultsTabs";
import { SegmentedControl } from "@/components/SegmentedControl";
import { MissingPiecesCard } from "@/components/MissingPiecesCard";
import {
  buildResultsRenderModel,
  shouldUseLegacyEngine,
  type UiState,
  type ResultsRenderModel,
} from "@/lib/results-ui-policy";
// Debug feature flags
import { shouldSaveDebugData } from "@/lib/debug-config";
import { buildEngineSnapshot } from "@/lib/debug-snapshot";
import { ButtonPrimary } from "@/components/ButtonPrimary";
import { ButtonTertiary } from "@/components/ButtonTertiary";
import { IconButton } from "@/components/IconButton";
import { SectionContainer } from "@/components/SectionContainer";
import { GuidanceRowModel } from "@/components/GuidanceRow";
import { PhotoViewerModal } from "@/components/PhotoViewerModal";
import { OutfitIdeasSection } from "@/components/OutfitIdeasSection";
import { TipSheetModal } from "@/components/TipSheetModal";
import { TailorSuggestionsCard } from "@/components/TailorSuggestionsCard";
import { FavoriteStoresModal } from "@/components/FavoriteStoresModal";
import type { TipSheetMode } from "@/lib/inspiration/tipsheets";
import {
  useStorePreference,
  useUpdateStorePreference,
  useTailorCardSeen,
  useMarkTailorCardSeen,
} from "@/lib/store-preferences";
import {
  trackFirstWardrobeMatchVisible,
  trackEmptyMatchesSectionExpanded,
  trackAddItemFromMatchesSection,
  trackTailorCardTapped,
  trackStorePrefModalOpened,
  trackStorePrefSaved,
  trackStorePrefDismissed,
  trackNoWardrobeMatchFound,
  trackWardrobeMatchItemTapped,
  trackHelpfulAdditionTapped,
  trackResultsTabSwitched,
  trackNearOutfitSelected,
  trackNearOutfitSelectionCleared,
  trackMissingPiecesCtaTapped,
  incrementAndGetScanCount,
} from "@/lib/analytics";

import type { UseMutationResult } from "@tanstack/react-query";
import type { ScannedItem as ScannedItemType } from "@/lib/types";

/**
 * Props for ResultsSuccess component.
 * Parent provides all dependencies; child owns scannedItem-dependent logic.
 */
interface ResultsSuccessProps {
  // Core data (guaranteed non-null by parent guard)
  scannedItem: ScannedItemType;
  resolvedImageUri: string | undefined;
  
  // Independent data from parent queries
  wardrobe: WardrobeItem[];
  wardrobeCount: number;
  preferences: { fitPreference?: "oversized" | "regular" | "slim" } | undefined;
  recentChecks: RecentCheck[];
  
  // Check context
  savedCheck: RecentCheck | null;
  isViewingSavedCheck: boolean;
  currentCheckId: string | null;
  currentScan: ScannedItemType | null;

  // Mutations (stable references from parent)
  addRecentCheckMutation: UseMutationResult<{ id: string; imageUri: string }, Error, Omit<RecentCheck, "id" | "createdAt">, unknown>;
  updateRecentCheckOutcomeMutation: UseMutationResult<{ id: string; outcome: OutcomeState; imageUri: string | undefined }, Error, { id: string; outcome: OutcomeState; imageUri?: string }, unknown>;

  // Actions
  clearScan: () => void;

  // Layout
  insets: { top: number; bottom: number; left: number; right: number };

  // Auth
  user: { id: string } | null;

  // Navigation context
  fromScan?: boolean;
}

// ============================================
// ROUTE PARAMS & STATE MACHINE TYPES
// ============================================

/**
 * Route params for results screen.
 */
type ResultsRouteParams = {
  // New flow: results owns analysis
  imageUri?: string;
  analysisKey?: string;
  source?: "camera" | "gallery" | "recent" | "saved";
  // For viewing saved/recent checks
  checkId?: string;
  from?: string;
  // Flag indicating navigation came from scan screen (for proper back navigation)
  fromScan?: string;
};

/**
 * State machine for analysis lifecycle.
 * Only used when imageUri is provided (new flow).
 */
type ResultsState =
  | { status: "loading"; imageUri: string; attempt: number }
  | { status: "failed"; imageUri: string; error: AnalyzeError; attempt: number }
  | { status: "success"; imageUri: string; item: ScannedItemType; attempt: number };

const MAX_RETRIES = 3;

// ============================================
// LOADING & FAILED COMPONENTS
// ============================================

/**
 * Loading state UI - shown while analysis is in progress.
 * Premium design: beautiful card + status pill + results skeleton preview.
 */
// Micro-step messages for the status pill
const ANALYSIS_STEPS = [
  "Identifying the item",
  "Finding wardrobe matches",
  "Building outfit options",
  "Final touches",
];

function ResultsLoading({
  imageUri,
  insets,
  fromScan,
}: {
  imageUri: string;
  insets: { top: number; bottom: number };
  fromScan?: boolean;
}) {
  // Screen dimensions for responsive sizing
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = Math.min(240, screenWidth - 96);
  const cardHeight = cardWidth * 1.25; // 4:5 aspect ratio
  
  // Skeleton color - use a visible gray instead of bg.secondary which may be too light
  const skeletonColor = `${colors.text.primary}12`; // 7% of text color = visible gray
  
  // Respect reduce motion accessibility setting
  const reduceMotion = useReducedMotion();
  
  // Micro-step animation
  const [stepIndex, setStepIndex] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % ANALYSIS_STEPS.length);
    }, 1200);
    return () => clearInterval(interval);
  }, []);
  
  // Animated dots (. .. ...)
  const [dots, setDots] = useState("");
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 400);
    return () => clearInterval(interval);
  }, []);
  
  // Card breathing animation (scale 1.0 → 1.03)
  const cardScale = useSharedValue(1);
  
  useEffect(() => {
    if (reduceMotion) {
      cardScale.value = 1;
      return;
    }
    
    cardScale.value = withRepeat(
      withTiming(1.03, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    
    return () => {
      cancelAnimation(cardScale);
    };
  }, [reduceMotion]);
  
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));
  
  // Close handler with haptic feedback
  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (fromScan) {
      router.dismiss(2);
    } else {
      router.back();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header - X icon button */}
      <View
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.lg,
        }}
      >
        <Pressable
          onPress={handleClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => ({
            width: spacing.xxl + spacing.xs,
            height: spacing.xxl + spacing.xs,
            borderRadius: borderRadius.pill,
            backgroundColor: colors.surface.icon,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <X size={22} color={colors.text.primary} strokeWidth={2} />
        </Pressable>
      </View>

      {/* Content */}
      <ScrollView 
        contentContainerStyle={{ 
          alignItems: "center", 
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card container - extra padding for breathing room */}
        <View style={{ padding: spacing.sm, marginBottom: spacing.md }}>
          {/* Hero card - beautiful card with breathing animation */}
          <Animated.View
            entering={FadeIn.duration(400)}
            style={[
              {
                width: cardWidth,
                height: cardHeight,
                borderRadius: borderRadius.card,
                overflow: "hidden",
                backgroundColor: colors.bg.secondary,
                // Hairline border
                borderWidth: 1,
                borderColor: `${colors.border.subtle}40`,
                // Tiny shadow
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.08,
                shadowRadius: 12,
                elevation: 4,
              },
              cardStyle,
            ]}
          >
          <Image
            source={{ uri: imageUri }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
          </Animated.View>
        </View>

        {/* Title */}
        <Text
          style={{
            ...typography.styles.h2,
            color: colors.text.primary,
            textAlign: "center",
            marginBottom: spacing.xs,
          }}
        >
          Analyzing your item
        </Text>
        
        {/* Subtitle */}
        <Text
          style={{
            ...typography.ui.body,
            color: colors.text.secondary,
            textAlign: "center",
            marginBottom: spacing.sm,
          }}
        >
          This usually takes a moment.
        </Text>
        
        {/* Status pill with animated dots */}
        <View
          style={{
            height: 28,
            paddingHorizontal: spacing.md,
            borderRadius: 14,
            backgroundColor: skeletonColor,
            justifyContent: "center",
            alignItems: "center",
            marginBottom: spacing.lg,
          }}
        >
          <Text
            style={{
              ...typography.ui.caption,
              color: colors.text.secondary,
              opacity: 0.8,
            }}
          >
            {ANALYSIS_STEPS[stepIndex]}{dots}
          </Text>
        </View>
        
        {/* Mini results skeleton preview */}
        <View style={{ width: "100%" }}>
          {/* Segmented control skeleton */}
          <View
            style={{
              flexDirection: "row",
              backgroundColor: skeletonColor,
              borderRadius: borderRadius.pill,
              padding: 4,
              marginBottom: spacing.lg,
            }}
          >
            <View
              style={{
                flex: 1,
                height: 32,
                borderRadius: borderRadius.pill - 2,
                backgroundColor: colors.bg.primary,
              }}
            />
            <View style={{ width: 4 }} />
            <View
              style={{
                flex: 1,
                height: 32,
                borderRadius: borderRadius.pill - 2,
                backgroundColor: "transparent",
              }}
            />
          </View>
          
          {/* Match rows skeleton */}
          {[0, 1].map((i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: spacing.sm,
                marginBottom: spacing.xs,
              }}
            >
              {/* Thumbnail */}
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: borderRadius.sm,
                  backgroundColor: skeletonColor,
                  marginRight: spacing.sm,
                }}
              />
              {/* Text lines */}
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    width: "60%",
                    height: 14,
                    borderRadius: 4,
                    backgroundColor: skeletonColor,
                    marginBottom: 6,
                  }}
                />
                <View
                  style={{
                    width: "40%",
                    height: 10,
                    borderRadius: 4,
                    backgroundColor: skeletonColor,
                  }}
                />
              </View>
            </View>
          ))}
          
          {/* Outfit ideas strip skeleton */}
          <View style={{ marginTop: spacing.md }}>
            <View
              style={{
                width: 100,
                height: 12,
                borderRadius: 4,
                backgroundColor: skeletonColor,
                marginBottom: spacing.sm,
              }}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  style={{
                    width: 80,
                    height: 100,
                    borderRadius: borderRadius.sm,
                    backgroundColor: skeletonColor,
                  }}
                />
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Failed state UI - shown when analysis fails.
 * Displays error message with retry option.
 */
function ResultsFailed({
  imageUri,
  error,
  attempt,
  onRetry,
  insets,
  fromScan,
}: {
  imageUri: string;
  error: AnalyzeError;
  attempt: number;
  onRetry: () => void;
  insets: { top: number; bottom: number };
  fromScan?: boolean;
}) {
  const isMaxRetries = attempt >= MAX_RETRIES;

  // Get error-specific hint
  const getErrorHint = () => {
    if (isMaxRetries) {
      if (error.kind === "no_network") {
        return "Check your connection and try again later.";
      }
      return "Please try again later, or scan another item.";
    }

    switch (error.kind) {
      case "no_network":
        return "Connection unavailable. Please check your internet and try again.";
      case "timeout":
        return "It's taking longer than usual. Try again in a moment.";
      case "rate_limited":
        return "We're getting a lot of requests right now. Please try again shortly.";
      default:
        return "Please try again or use a different photo.";
    }
  };

  // Get error icon
  const ErrorIcon = error.kind === "no_network" ? WifiOff : 
                    error.kind === "timeout" ? Clock : 
                    AlertOctagon;

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
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (fromScan) {
              router.dismiss(2);
            } else {
              router.back();
            }
          }}
          style={({ pressed }) => ({
            width: spacing.xxl,
            height: spacing.xxl,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.5 : 1,
          })}
          accessibilityLabel="Close"
        >
          <X size={24} color={colors.text.primary} strokeWidth={2} />
        </Pressable>
      </View>

      {/* Content */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl }}>
        {/* Image */}
        <View
          style={{
            width: 160,
            height: 200,
            borderRadius: borderRadius.card,
            overflow: "hidden",
            marginBottom: spacing.lg,
            opacity: 0.6,
          }}
        >
          <Image
            source={{ uri: imageUri }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        </View>

        {/* Error icon */}
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: colors.verdict.okay.bg,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: spacing.md,
          }}
        >
          <ErrorIcon size={24} color={colors.verdict.okay.text} />
        </View>

        {/* Error text */}
        <Text
          style={{
            ...typography.styles.h2,
            color: colors.text.primary,
            textAlign: "center",
            marginBottom: spacing.sm,
          }}
        >
          We couldn't analyze this item
        </Text>
        <Text
          style={{
            ...typography.ui.body,
            color: colors.text.secondary,
            textAlign: "center",
            marginBottom: spacing.xl,
          }}
        >
          {getErrorHint()}
        </Text>

        {/* Buttons */}
        <View style={{ width: "100%", gap: spacing.md }}>
          {isMaxRetries ? (
            // Max retries exceeded: "Scan another item" goes explicitly to scan screen
            // Use replace to avoid stacking failed results in history
            <ButtonPrimary
              label="Scan another item"
              onPress={() => router.replace("/scan")}
            />
          ) : (
            // Normal failure: "Try again" is primary, "Scan another" is secondary
            <>
              <ButtonPrimary
                label="Try again"
                onPress={onRetry}
              />
              <ButtonTertiary
                label="Scan another item"
                onPress={() => router.replace("/scan")}
              />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * Missing scan data UI - shown when neither scannedItem nor imageUri is provided.
 */
function MissingScanData({ insets }: { insets: { top: number; bottom: number } }) {
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
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <IconButton
            icon={X}
            onPress={() => router.back()}
          />
          <View style={{ width: 40 }} />
        </View>
      </View>

      {/* Content */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl }}>
        <HelpCircle size={48} color={colors.text.tertiary} style={{ marginBottom: spacing.md }} />
        <Text
          style={{
            ...typography.styles.h2,
            color: colors.text.primary,
            textAlign: "center",
            marginBottom: spacing.sm,
          }}
        >
          Missing scan data
        </Text>
        <Text
          style={{
            ...typography.ui.body,
            color: colors.text.secondary,
            textAlign: "center",
            marginBottom: spacing.xl,
          }}
        >
          Something went wrong. Please try scanning again.
        </Text>
        <ButtonPrimary
          label="Go back"
          onPress={() => router.back()}
        />
      </View>
    </View>
  );
}

// Core vs Optional category definitions for matches routing
// Core: used in outfit formulas (TOP+BOTTOM+SHOES or DRESS+SHOES)
// Optional: finishing touches shown in "Optional add-ons" section
const CORE_CATEGORIES: Category[] = ['tops', 'bottoms', 'shoes', 'dresses', 'skirts'];
const OPTIONAL_CATEGORIES: Category[] = ['outerwear', 'bags', 'accessories'];

const isCoreCategory = (category: Category): boolean => CORE_CATEGORIES.includes(category);
const isOptionalCategory = (category: Category): boolean => OPTIONAL_CATEGORIES.includes(category);

// Dev guard: verify all categories are in exactly one bucket
if (__DEV__) {
  const allDefinedCategories = CATEGORIES.map(c => c.id);
  const corePlusOptional = [...CORE_CATEGORIES, ...OPTIONAL_CATEGORIES];
  const missing = allDefinedCategories.filter(c => !corePlusOptional.includes(c));
  const duplicates = corePlusOptional.filter((c, i) => corePlusOptional.indexOf(c) !== i);
  if (missing.length > 0) {
    console.warn('[CategoryRouting] Categories not in core or optional bucket:', missing);
  }
  if (duplicates.length > 0) {
    console.warn('[CategoryRouting] Categories in multiple buckets:', duplicates);
  }
}


// Generate verdict explanation based on confidence, context, and AI analysis
function getVerdictExplanation(
  confidence: ConfidenceLevel,
  hasWardrobe: boolean,
  fitPreference: FitPreference,
  category: string,
  styleNotes: string[],
  descriptiveLabel: string
): { main: string; secondary?: string } {
  const notesLower = styleNotes.map(n => n.toLowerCase());
  const isLoose = notesLower.some(n => n.includes("loose") || n.includes("relaxed") || n.includes("oversized"));
  const isSlim = notesLower.some(n => n.includes("slim") || n.includes("fitted") || n.includes("tailored"));
  const isLayerable = notesLower.some(n => n.includes("layerable") || n.includes("layering"));

  if (confidence === "great") {
    if (hasWardrobe) {
      return {
        main: `This ${descriptiveLabel.toLowerCase()} works well with your fit preference and pairs nicely with what you already own.`,
      };
    }
    return {
      main: `This ${descriptiveLabel.toLowerCase()} works well with your fit preference and neutral colors.`,
    };
  } else if (confidence === "okay") {
    // Dynamic suggestions based on AI analysis
    if (isLoose && (category === "tops" || category === "outerwear")) {
      return {
        main: `This ${descriptiveLabel.toLowerCase()} has a relaxed silhouette — consider pairing with more structured pieces for balance.`,
        secondary: hasWardrobe ? undefined : "Add wardrobe items for more specific matches.",
      };
    }
    if (isSlim && category === "bottoms") {
      return {
        main: `This ${descriptiveLabel.toLowerCase()} has a slim cut — works well with looser tops for proportion.`,
        secondary: hasWardrobe ? undefined : "Add wardrobe items for more specific matches.",
      };
    }
    if (isLayerable) {
      return {
        main: `This ${descriptiveLabel.toLowerCase()} is versatile for layering — consider what you'll wear it with.`,
        secondary: hasWardrobe ? undefined : "Add wardrobe items for more specific matches.",
      };
    }
    return {
      main: `This ${descriptiveLabel.toLowerCase()} could work with the right pieces in your wardrobe.`,
      secondary: hasWardrobe ? undefined : "Add wardrobe items for more specific matches.",
    };
  } else {
    if (fitPreference === "slim" && isLoose) {
      return {
        main: `This ${descriptiveLabel.toLowerCase()} has a loose silhouette which may not match your slim fit preference.`,
      };
    }
    if (fitPreference === "oversized" && isSlim) {
      return {
        main: `This ${descriptiveLabel.toLowerCase()} has a fitted cut which may not match your oversized preference.`,
      };
    }
    return {
      main: `Based on your preferences, this ${descriptiveLabel.toLowerCase()} might not be the most versatile addition.`,
    };
  }
}

// Wardrobe match row component
function WardrobeMatchRow({
  scannedCategory,
  wardrobeItem,
  index,
}: {
  scannedCategory: string;
  wardrobeItem: WardrobeItem;
  index: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(400 + index * 80)}
      style={{
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.secondary,
      borderRadius: borderRadius.card,
      padding: spacing.md,
      marginBottom: spacing.sm,
    }}
  >
    <View style={{
      height: spacing.xxl + spacing.sm,
      width: spacing.xxl + spacing.sm,
      borderRadius: borderRadius.image,
      backgroundColor: colors.accent.secondary,
      alignItems: "center",
      justifyContent: "center",
      marginRight: spacing.md,
    }}>
      <Text style={{ fontSize: typography.sizes.body + 6 }}>
        {wardrobeItem.category === "tops" ? "👕" : wardrobeItem.category === "outerwear" ? "🧥" : wardrobeItem.category === "shoes" ? "👟" : "👖"}
      </Text>
    </View>
    <Text
      style={{
        flex: 1,
        ...typography.ui.body,
        color: colors.text.primary,
      }}
    >
        This {scannedCategory.slice(0, -1)} + your{" "}
        <Text style={typography.ui.bodyMedium}>
          {wardrobeItem.colors[0]?.name?.toLowerCase() || ""} {wardrobeItem.category}
        </Text>
      </Text>
    {wardrobeItem.imageUri && (
      <Image
        source={{ uri: wardrobeItem.imageUri }}
        style={{ width: spacing.xxl, height: spacing.xxl, borderRadius: borderRadius.image }}
        contentFit="cover"
      />
    )}
    </Animated.View>
  );
}

// Store selector bottom sheet
function StoreBottomSheet({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (store: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const stores = ["Zara", "H&M", "Uniqlo", "COS", "Mango", "& Other Stories", "Other"];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay.dark }} onPress={onClose} />
      <View
        style={{
          backgroundColor: colors.bg.primary,
          borderTopLeftRadius: borderRadius.xl,
          borderTopRightRadius: borderRadius.xl,
          paddingBottom: insets.bottom + 20,
        }}
      >
        <View style={{ alignItems: "center", paddingTop: spacing.md, paddingBottom: spacing.md }}>
          <View style={{ width: spacing.xxl, height: spacing.xs, borderRadius: borderRadius.pill, backgroundColor: colors.border.subtle }} />
        </View>

        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
          <Text
            style={{
              ...typography.ui.sectionTitle,
              color: colors.text.primary,
              marginBottom: spacing.md,
            }}
          >
            Where are you shopping?
          </Text>

          {stores.map((store) => (
            <Pressable
              key={store}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(store);
                onClose();
              }}
              style={{
                paddingVertical: spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: colors.border.subtle,
              }}
            >
              <Text
                style={{
                  ...typography.ui.cardTitle,
                  color: colors.text.primary,
                }}
              >
                {store}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

// Matches bottom sheet - displays all HIGH or NEAR matches
function MatchesBottomSheet({
  visible,
  onClose,
  matches,
  matchType,
  scannedCategory,
  scannedItemImageUri,
  scannedItemLabel,
  onItemPress,
}: {
  visible: boolean;
  onClose: () => void;
  matches: Array<{ wardrobeItem: WardrobeItem; explanation?: string | null }>;
  matchType: "high" | "near";
  scannedCategory: Category;
  scannedItemImageUri?: string;
  scannedItemLabel?: string;
  onItemPress: (item: WardrobeItem, index: number) => void;
}) {
  const insets = useSafeAreaInsets();
  // Internal state for viewing images - no external modal needed
  const [viewingImageUri, setViewingImageUri] = useState<string | null>(null);
  // Track image load errors
  const [scannedImageError, setScannedImageError] = useState(false);
  const [itemImageErrors, setItemImageErrors] = useState<Record<string, boolean>>({});

  const getCategoryLabel = (category: Category): string => {
    const categoryObj = CATEGORIES.find((c) => c.id === category);
    return (categoryObj?.label || category).toLowerCase();
  };

  // Get match explanation using centralized copy constants
  const getMatchTitle = (wardrobeLabel: string, itemId?: string) => {
    return getMatchExplanation(itemId ?? "", wardrobeLabel, matchType);
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setViewingImageUri(null);
      setScannedImageError(false);
      setItemImageErrors({});
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (viewingImageUri) {
          setViewingImageUri(null);
        } else {
          onClose();
        }
      }}
    >
      {/* Full-screen image viewer - rendered inside the same modal */}
      {viewingImageUri ? (
        <Pressable
          style={{
            flex: 1,
            backgroundColor: button.primary.backgroundColor,
            justifyContent: "center",
            alignItems: "center",
          }}
          onPress={() => setViewingImageUri(null)}
        >
          <Image
            source={{ uri: viewingImageUri }}
            style={{ width: "100%", height: "80%" }}
            contentFit="contain"
          />
          <Pressable
            onPress={() => setViewingImageUri(null)}
            style={{
              position: "absolute",
              top: insets.top + 16,
              right: 16,
              width: spacing.xxl,
              height: spacing.xxl,
              borderRadius: borderRadius.pill,
              backgroundColor: colors.bg.elevated,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <X size={24} color={colors.text.primary} />
          </Pressable>
        </Pressable>
      ) : (
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable 
            style={{ 
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: colors.overlay.dark,
            }} 
            onPress={(e) => {
              e.stopPropagation();
              onClose();
            }} 
          />
          <View
            style={{
              backgroundColor: cards.elevated.backgroundColor,
              borderTopLeftRadius: cards.elevated.borderRadius,
              borderTopRightRadius: cards.elevated.borderRadius,
              paddingBottom: insets.bottom || spacing.lg,
              maxHeight: "85%",
              ...shadows.lg,
              overflow: "hidden",
            }}
          >
            {/* Drag handle - pressable area to close */}
            <Pressable 
              onPress={onClose}
              style={{ 
                alignItems: "center", 
                paddingTop: spacing.md, 
                paddingBottom: spacing.sm,
                // Larger touch target for easier closing
                minHeight: 44,
                justifyContent: "center",
              }}
              hitSlop={{ top: 10, bottom: 10, left: 50, right: 50 }}
            >
              <View style={{ width: spacing.xxl, height: spacing.xs, borderRadius: borderRadius.pill, backgroundColor: colors.bg.tertiary }} />
            </Pressable>

            <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
              {/* Header: Title matching other bottom sheets */}
              <Text
                style={{
                  ...typography.display.screenTitle,
                  color: colors.text.primary,
                  marginBottom: spacing.xs,
                }}
              >
                {RESULTS_COPY.bottomSheet.header[matchType]}
              </Text>
              <Text
                style={{
                  ...typography.ui.caption,
                  color: colors.text.secondary,
                  marginBottom: spacing.md,
                }}
              >
                {RESULTS_COPY.bottomSheet.subtitle}
              </Text>

              {/* Scanned item: compact context header */}
              <View style={{ marginBottom: spacing.md }}>
                <Text
                  style={{
                    ...typography.ui.micro,
                    color: colors.text.tertiary,
                    marginBottom: spacing.xs,
                  }}
                >
                  {RESULTS_COPY.bottomSheet.scannedItemLabel}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  {scannedItemImageUri && !scannedImageError ? (
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setViewingImageUri(scannedItemImageUri);
                      }}
                      style={{
                        width: spacing.xl - 4,
                        height: spacing.xl - 4,
                        borderRadius: borderRadius.image,
                        overflow: "hidden",
                        backgroundColor: colors.bg.tertiary,
                        marginRight: spacing.sm,
                      }}
                    >
                      <Image
                        source={{ uri: scannedItemImageUri }}
                        style={{ width: spacing.xl - 4, height: spacing.xl - 4 }}
                        contentFit="cover"
                        onError={() => setScannedImageError(true)}
                      />
                    </Pressable>
                  ) : (
                    <ThumbnailPlaceholderImage
                      size={spacing.xl - 4}
                      style={{ marginRight: spacing.sm }}
                    />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        ...typography.ui.body,
                        color: colors.text.primary,
                      }}
                    >
                      {scannedItemLabel || getCategoryLabel(scannedCategory)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Matches list - wrapped in a surface card with maxHeight to enable scrolling */}
              <View
                style={{
                  backgroundColor: colors.bg.elevated,
                  borderWidth: 1,
                  borderColor: colors.border.hairline,
                  borderRadius: borderRadius.card,
                  overflow: "hidden",
                  // Max height allows content to scroll when there are many matches
                  // ~6 items visible before scrolling (each item ~60px)
                  maxHeight: 400,
                }}
              >
                <ScrollView 
                  showsVerticalScrollIndicator={true}
                  scrollEventThrottle={16}
                  nestedScrollEnabled={true}
                >
                  {matches.map((match, index) => {
                    const item = match.wardrobeItem;
                    const wardrobeColor = (item.colors[0]?.name ?? "").toLowerCase();
                    const wardrobeCategory = getCategoryLabel(item.category);
                    const wardrobeLabel = `${wardrobeColor ? `${wardrobeColor} ` : ""}${wardrobeCategory}`.trim();

                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          onItemPress(item, index);
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: spacing.lg - spacing.xs,
                          paddingHorizontal: spacing.md,
                          borderBottomWidth: index < matches.length - 1 ? 1 : 0,
                          borderBottomColor: colors.border.hairline,
                        }}
                      >
                        {/* Thumbnail or icon - separate pressable for image viewing */}
                        {item.imageUri && !itemImageErrors[item.id] ? (
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation();
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setViewingImageUri(item.imageUri);
                            }}
                            hitSlop={spacing.xs}
                            style={{
                              width: spacing.xl - 4,
                              height: spacing.xl - 4,
                              borderRadius: borderRadius.image,
                              backgroundColor: colors.accent.terracottaLight,
                              alignItems: "center",
                              justifyContent: "center",
                              marginRight: spacing.sm,
                              overflow: "hidden",
                            }}
                          >
                            <Image
                              source={{ uri: item.imageUri }}
                              style={{ width: spacing.xl - 4, height: spacing.xl - 4 }}
                              contentFit="cover"
                              onError={() => setItemImageErrors(prev => ({ ...prev, [item.id]: true }))}
                            />
                          </Pressable>
                        ) : (
                          <ThumbnailPlaceholderImage
                            size={spacing.xl - 4}
                            style={{ marginRight: spacing.sm }}
                          />
                        )}

                        {/* Title and subtitle */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ ...typography.ui.body, color: colors.text.primary }}>
                            {getMatchTitle(wardrobeLabel, item.id)}
                          </Text>
                          {match.explanation && matchType === "high" && (
                            <Text
                              style={{
                                ...typography.ui.caption,
                                color: colors.text.secondary,
                                marginTop: spacing.xs,
                              }}
                            >
                              {match.explanation}
                            </Text>
                          )}
                        </View>
                        
                        {/* Chevron */}
                        <ChevronRight size={spacing.md + 2} color={colors.text.tertiary} strokeWidth={1.5} />
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </View>
        </View>
      )}
    </Modal>
  );
}

// Empty wardrobe state
function EmptyWardrobeState({ itemLabel }: { itemLabel: string }) {
  return (
    <Animated.View
      entering={FadeIn.delay(400)}
      style={{
        backgroundColor: colors.bg.secondary,
        borderRadius: borderRadius.card,
        padding: spacing.lg,
      }}
    >
      <Text
        style={{
          ...typography.ui.body,
          color: colors.text.secondary,
          textAlign: "center",
          marginBottom: spacing.sm,
        }}
      >
        Adding a few wardrobe items helps us suggest more specific pairings for this {itemLabel}.
      </Text>
      <View style={{ alignSelf: "center" }}>
        <ButtonTertiary
          label="Add item"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/add-item");
          }}
        />
      </View>
    </Animated.View>
  );
}

export default function ResultsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<ResultsRouteParams>();
  const { data: recentChecks = [] } = useRecentChecks();
  const wardrobeCount = useWardrobeCount();
  const { data: wardrobe = [] } = useWardrobe();
  const { data: preferences } = usePreferences();
  const clearScan = useSnapToMatchStore((s) => s.clearScan);
  const currentScan = useSnapToMatchStore((s) => s.currentScan);
  const { user } = useAuth();
  const addRecentCheckMutation = useAddRecentCheck();
  const updateRecentCheckOutcomeMutation = useUpdateRecentCheckOutcome();
  
  // ============================================
  // STATE MACHINE FOR imageUri FLOW
  // ============================================
  const imageUri = params.imageUri;
  const analysisKey = params.analysisKey ?? generateIdempotencyKey();
  const source = params.source;
  
  // Determine if we should use the imageUri flow (fresh scan from camera)
  // imageUri flow: imageUri provided AND not viewing a saved check
  const shouldUseImageUriFlow = !!imageUri && !currentScan && !params.checkId;
  
  // State machine for imageUri flow
  const [analysisState, setAnalysisState] = useState<ResultsState | null>(() => {
    if (!shouldUseImageUriFlow || !imageUri) return null;
    return { status: "loading", imageUri, attempt: 1 };
  });
  
  // Retry handler
  const handleRetry = useCallback(() => {
    if (!analysisState || analysisState.status === "loading") return;
    if (analysisState.attempt >= MAX_RETRIES) return;
    
    logAnalysisLifecycleEvent({
      name: "analysis_retry_tapped",
      props: { attempt: analysisState.attempt + 1, analysisKey, source },
    });
    
    setAnalysisState({
      status: "loading",
      imageUri: analysisState.imageUri,
      attempt: analysisState.attempt + 1,
    });
  }, [analysisState, analysisKey, source]);
  
  // Analysis effect - runs when imageUri flow is active and status is loading
  useEffect(() => {
    if (!shouldUseImageUriFlow || !imageUri || !analysisState) return;
    if (analysisState.status !== "loading") return;
    
    const ac = new AbortController();
    const startTime = Date.now();
    
    logAnalysisLifecycleEvent({
      name: "analysis_started",
      props: { attempt: analysisState.attempt, analysisKey, source },
    });
    
    (async () => {
      const result = await analyzeClothingImage({
        imageUri,
        signal: ac.signal,
      });
      
      if (ac.signal.aborted) return;
      
      const durationMs = Date.now() - startTime;
      
      if (!result.ok) {
        // Don't show failed UI for cancellations
        if (result.error.kind === "cancelled") return;
        
        logAnalysisLifecycleEvent({
          name: "analysis_failed",
          props: {
            attempt: analysisState.attempt,
            analysisKey,
            source,
            errorKind: result.error.kind,
            durationMs,
          },
        });
        
        // Check if max retries reached
        if (analysisState.attempt >= MAX_RETRIES) {
          logAnalysisLifecycleEvent({
            name: "analysis_max_retries",
            props: { attempt: analysisState.attempt, analysisKey, source, errorKind: result.error.kind },
          });
        }
        
        setAnalysisState({
          status: "failed",
          imageUri,
          error: result.error,
          attempt: analysisState.attempt,
        });
        return;
      }
      
      // Success!
      if (analysisState.attempt > 1) {
        logAnalysisLifecycleEvent({
          name: "analysis_recovered_success",
          props: { attempt: analysisState.attempt, analysisKey, source, durationMs, cacheHit: result.cacheHit },
        });
      } else {
        logAnalysisLifecycleEvent({
          name: "analysis_succeeded",
          props: { attempt: analysisState.attempt, analysisKey, source, durationMs, cacheHit: result.cacheHit },
        });
      }
      
      setAnalysisState({
        status: "success",
        imageUri,
        item: result.data as unknown as ScannedItemType,
        attempt: analysisState.attempt,
      });
    })();
    
    return () => {
      ac.abort();
      // Only log cancelled if we were actually loading
      if (analysisState.status === "loading") {
        logAnalysisLifecycleEvent({
          name: "analysis_cancelled",
          props: { attempt: analysisState.attempt, analysisKey, source },
        });
      }
    };
  }, [shouldUseImageUriFlow, imageUri, analysisState?.status, analysisState?.attempt, analysisKey, source]);
  
  // Extract checkId from params (for viewing saved checks)
  const checkId = params.checkId;

  // Check if viewing a saved check
  const savedCheck = useMemo(() => {
    if (checkId) {
      return recentChecks.find((c: RecentCheck) => c.id === checkId) ?? null;
    }
    return null;
  }, [checkId, recentChecks]);

  // Determine if we're viewing a saved check or fresh scan
  const isViewingSavedCheck = !!savedCheck;

  console.log("ResultsScreen mount, currentScan exists:", !!currentScan, "savedCheck:", !!savedCheck);

  // Get the ID of the most recently added check (for saving)
  // Works for both fresh scans (imageUri flow) and saved checks (checkId flow)
  const currentCheckId = useMemo(() => {
    if (recentChecks.length === 0) return null;
    
    // New imageUri flow: match by imageUri param
    if (imageUri) {
      const matchingCheck = recentChecks.find(
        (c: RecentCheck) => c.imageUri === imageUri
      );
      if (matchingCheck) return matchingCheck.id;
    }
    
    // Legacy flow: match by currentScan.imageUri
    if (currentScan) {
      const matchingCheck = recentChecks.find(
        (c: RecentCheck) => c.imageUri === currentScan.imageUri
      );
      if (matchingCheck) return matchingCheck.id;
    }
    
    return null;
  }, [imageUri, currentScan, recentChecks]);

  // ============================================
  // EARLY RETURNS FOR STATE MACHINE
  // ============================================
  // These must come BEFORE scannedItem-dependent hooks.
  // All hooks after this point will be in ResultsSuccess.
  if (shouldUseImageUriFlow && analysisState) {
    if (analysisState.status === "loading") {
      return <ResultsLoading imageUri={analysisState.imageUri} insets={insets} fromScan={params.fromScan === "true"} />;
    }
    if (analysisState.status === "failed") {
      return (
        <ResultsFailed
          imageUri={analysisState.imageUri}
          error={analysisState.error}
          attempt={analysisState.attempt}
          onRetry={handleRetry}
          insets={insets}
          fromScan={params.fromScan === "true"}
        />
      );
    }
  }

  // Extract scannedItem from available sources (in priority order):
  // 1. analysisState.item - from imageUri flow (fresh scan)
  // 2. currentScan - from store (if navigating back)
  // 3. savedCheck.scannedItem - from database (viewing saved check)
  const scannedItem = 
    (analysisState?.status === "success" ? analysisState.item : null) ??
    currentScan ?? 
    savedCheck?.scannedItem ?? 
    null;
  
  // IMPORTANT: Use the top-level imageUri from savedCheck if available
  // The scannedItem.imageUri is stored in JSONB and never gets updated after upload
  // savedCheck.imageUri is what gets updated to the remote URL after successful upload
  // For new imageUri flow, use the imageUri from params (freshest source)
  const resolvedImageUri = imageUri ?? savedCheck?.imageUri ?? scannedItem?.imageUri;

  // Guard for missing data
  if (!scannedItem) {
    return <MissingScanData insets={insets} />;
  }

  // ============================================
  // RENDER RESULTS SUCCESS
  // ============================================
  // All scannedItem-dependent hooks and UI are in ResultsSuccess
  return (
    <ResultsSuccess
      scannedItem={scannedItem}
      resolvedImageUri={resolvedImageUri}
      wardrobe={wardrobe}
      wardrobeCount={wardrobeCount}
      preferences={preferences}
      recentChecks={recentChecks}
      savedCheck={savedCheck}
      isViewingSavedCheck={isViewingSavedCheck}
      currentCheckId={currentCheckId}
      currentScan={currentScan}
      clearScan={clearScan}
      addRecentCheckMutation={addRecentCheckMutation}
      updateRecentCheckOutcomeMutation={updateRecentCheckOutcomeMutation}
      insets={insets}
      user={user}
      fromScan={params.fromScan === "true"}
    />
  );
}

// ============================================
// RESULTS SUCCESS COMPONENT
// ============================================
// Contains all scannedItem-dependent hooks and UI.
// Only mounts when scannedItem is guaranteed non-null.
//
// IMPORTANT: All scannedItem-dependent hooks must live inside ResultsSuccess.
// Do NOT add hooks that depend on scannedItem above the loading/failed early
// returns in ResultsScreen — doing so will cause "hooks order changed" errors
// when transitioning from loading → success state.

function ResultsSuccess({
  scannedItem,
  resolvedImageUri,
  wardrobe,
  wardrobeCount,
  preferences,
  recentChecks,
  savedCheck,
  isViewingSavedCheck,
  currentCheckId,
  currentScan,
  clearScan,
  addRecentCheckMutation,
  updateRecentCheckOutcomeMutation,
  insets,
  user,
  fromScan,
}: ResultsSuccessProps) {
  const hasAddedCheck = useRef(false);
  
  const [showStoreSheet, setShowStoreSheet] = useState(false);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const lastSaveTimestampRef = useRef(0);
  
  // Get current outcome for syncing saved state
  const currentOutcome = useMemo(() => {
    if (isViewingSavedCheck && savedCheck) {
      return savedCheck.outcome;
    } else if (currentCheckId) {
      const checkRecord = recentChecks.find((c: RecentCheck) => c.id === currentCheckId);
      return checkRecord?.outcome;
    }
    return null;
  }, [isViewingSavedCheck, savedCheck, currentCheckId, recentChecks]);
  
  // Sync isSaved state with database outcome
  // BUT: skip if we just initiated a save (prevents cache refetch from resetting state)
  useEffect(() => {
    const timeSinceLastSave = Date.now() - lastSaveTimestampRef.current;
    // Skip sync for 5 seconds after user-initiated save to prevent race with cache invalidation
    if (lastSaveTimestampRef.current > 0 && timeSinceLastSave < 5000) {
      return;
    }
    setIsSaved(currentOutcome === "saved_to_revisit");
  }, [currentOutcome]);
  
  // Store preferences (for Tailor Suggestions card)
  const [showFavoriteStoresModal, setShowFavoriteStoresModal] = useState(false);
  const [showStoreSavedToast, setShowStoreSavedToast] = useState(false);
  const [showScanSavedToast, setShowScanSavedToast] = useState(false);
  const [showScanUnsavedToast, setShowScanUnsavedToast] = useState(false);
  const [saveError, setSaveError] = useState<'network' | 'other' | null>(null);
  const { data: storePreference } = useStorePreference();
  const updateStorePreference = useUpdateStorePreference();
  const { data: tailorCardSeen } = useTailorCardSeen();
  const markTailorCardSeen = useMarkTailorCardSeen();

  // Bottom sheet for adding from wardrobe
  const [showAddFromWardrobeSheet, setShowAddFromWardrobeSheet] = useState(false);
  const [addFromWardrobeCategory, setAddFromWardrobeCategory] = useState<Category | null>(null);

  // Bottom sheet for showing all matches
  const [showMatchesSheet, setShowMatchesSheet] = useState(false);
  const [matchesSheetType, setMatchesSheetType] = useState<"high" | "near">("high");
  // Track if bottom sheet should be rendered (delayed after close to prevent animation artifacts)
  const [shouldRenderMatchesSheet, setShouldRenderMatchesSheet] = useState(false);

  // Scroll ref for scrolling to top on tab switch
  const mainScrollRef = useRef<ScrollView>(null);

  // Photo viewer state
  const [photoViewerUri, setPhotoViewerUri] = useState<string | null>(null);
  const [photoViewerSource, setPhotoViewerSource] = useState<'main' | 'bottomSheet' | null>(null);

  // Control bottom sheet rendering to prevent animation artifacts
  useEffect(() => {
    if (showMatchesSheet) {
      setShouldRenderMatchesSheet(true);
    } else {
      // Delay unmounting after close
      const timeout = setTimeout(() => {
        setShouldRenderMatchesSheet(false);
      }, 350);
      return () => clearTimeout(timeout);
    }
  }, [showMatchesSheet]);

  // Tip sheet modal state (for "What to add first" section)
  const [selectedTipSheet, setSelectedTipSheet] = useState<{
    bulletKey: string;
    mode: TipSheetMode;
    title: string;
    targetCategory?: string | null;
  } | null>(null);

  // Collapsible state for "Matches in your wardrobe" section
  const [isWardrobeSectionCollapsed, setIsWardrobeSectionCollapsed] = useState(true);
  // Expandable scanned item card state (for empty state)
  const [isScannedItemExpanded, setIsScannedItemExpanded] = useState(false);
  const [scannedItemImageError, setScannedItemImageError] = useState(false);

  // Analytics tracking refs
  const hasTrackedScan = useRef(false);
  const hasTrackedFirstMatch = useRef(false);
  const hasTrackedNoMatch = useRef(false);

  // Reset image error state when image URI changes
  useEffect(() => {
    setScannedItemImageError(false);
  }, [resolvedImageUri]);

  // Confidence Engine evaluation - primary matching system
  const confidenceResult = useConfidenceEngine(scannedItem, wardrobe);

  // Log confidence engine results for debugging (dev only)
  useEffect(() => {
    if (__DEV__ && confidenceResult.evaluated) {
      console.debug('[ConfidenceEngine] Evaluation complete:', {
        tier: confidenceResult.debugTier,
        showMatches: confidenceResult.showMatchesSection,
        matchCount: confidenceResult.matches.length,
        nearMatchCount: confidenceResult.nearMatchCount,
        suggestionsMode: confidenceResult.suggestionsMode,
      });
    }
  }, [confidenceResult]);

  // ComboAssembler: Generate outfit combos from CE-ranked items
  const comboAssemblerResult = useComboAssembler(scannedItem, wardrobe, confidenceResult);

  // Results Tabs: Manages "Wear now" vs "Worth trying" tab state
  const tabsState = useResultsTabs(
    scannedItem?.id ?? null,
    confidenceResult,
    comboAssemblerResult,
    wardrobe,
    scannedItem?.category ?? null // For diversity slot selection
  );

  // Tab helpers for cleaner conditional rendering
  const isHighTab = tabsState.activeTab === 'high';
  const tab = tabsState.activeTabContent;

  // Selected outfit state for NEAR tab (drives precise Mode B bullets)
  const [selectedNearOutfit, setSelectedNearOutfit] = useState<AssembledCombo | null>(null);
  
  // Reset selected outfit on scan change or tab switch
  // Track tab_switch source only when selectedNearOutfit exists (otherwise nothing to clear)
  const prevTabRef = useRef(tabsState.activeTab);
  useEffect(() => {
    if (selectedNearOutfit && prevTabRef.current !== tabsState.activeTab && scannedItem?.category) {
      trackNearOutfitSelectionCleared({
        scannedItemCategory: scannedItem.category,
        source: "tab_switch",
      });
    }
    prevTabRef.current = tabsState.activeTab;
    setSelectedNearOutfit(null);
  }, [scannedItem?.id, tabsState.activeTab]);

  // Clear selection if the selected combo no longer exists in the NEAR outfits list
  // (e.g., due to filtering, sorting, or data recompute)
  useEffect(() => {
    if (selectedNearOutfit && tabsState.nearTab.outfits.length > 0) {
      const stillExists = tabsState.nearTab.outfits.some(
        (combo) => combo.id === selectedNearOutfit.id
      );
      if (!stillExists) {
        if (__DEV__) {
          console.log('[SelectedOutfit] Clearing stale selection - combo no longer in list');
        }
        if (scannedItem?.category) {
          trackNearOutfitSelectionCleared({
            scannedItemCategory: scannedItem.category,
            source: "stale_selection",
          });
        }
        setSelectedNearOutfit(null);
      }
    }
  }, [selectedNearOutfit, tabsState.nearTab.outfits, scannedItem?.category]);

  // Helper to clear the selection (escape hatch for users)
  const clearSelectedOutfit = useCallback((source: "show_all_chip" | "tab_switch" | "stale_selection") => {
    if (scannedItem?.category) {
      trackNearOutfitSelectionCleared({
        scannedItemCategory: scannedItem.category,
        source,
      });
    }
    setSelectedNearOutfit(null);
  }, [scannedItem?.category]);

  // Tracked tab change handler (no scroll - preserves comparison flow)
  const handleTabChange = useCallback((newTab: ResultsTab) => {
    if (scannedItem?.category && newTab !== tabsState.activeTab) {
      trackResultsTabSwitched({
        fromTab: tabsState.activeTab,
        toTab: newTab,
        scannedItemCategory: scannedItem.category,
        highOutfitCount: tabsState.highOutfitCount,
        nearOutfitCount: tabsState.nearOutfitCount,
      });
    }
    tabsState.setActiveTab(newTab);
  }, [scannedItem?.category, tabsState]);

  // CTA handler for "View worth trying outfits" - navigates AND scrolls to top
  const handleViewWorthTrying = useCallback(() => {
    if (scannedItem?.category) {
      trackResultsTabSwitched({
        fromTab: 'high',
        toTab: 'near',
        scannedItemCategory: scannedItem.category,
        highOutfitCount: tabsState.highOutfitCount,
        nearOutfitCount: tabsState.nearOutfitCount,
      });
    }
    tabsState.setActiveTab('near');
    requestAnimationFrame(() => {
      mainScrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, [scannedItem?.category, tabsState]);

  // Tracked near outfit selection handler
  // Only fire analytics when selection actually changes (id diff)
  const handleNearOutfitSelect = useCallback((combo: AssembledCombo) => {
    // Skip if already selected (prevent duplicate analytics)
    if (selectedNearOutfit?.id === combo.id) {
      return;
    }
    
    if (scannedItem?.category) {
      const position = tabsState.nearTab.outfits.findIndex((c) => c.id === combo.id);
      trackNearOutfitSelected({
        outfitId: combo.id,
        outfitPosition: position,
        scannedItemCategory: scannedItem.category,
        totalNearOutfits: tabsState.nearTab.outfits.length,
      });
    }
    setSelectedNearOutfit(combo);
  }, [scannedItem?.category, tabsState.nearTab.outfits, selectedNearOutfit?.id]);

  // Log tabs state for debugging (dev only)
  useEffect(() => {
    if (__DEV__ && confidenceResult.evaluated) {
      console.debug('[ResultsTabs] State:', {
        showTabs: tabsState.showTabs,
        showHigh: tabsState.showHigh,
        showNear: tabsState.showNear,
        showEmptyState: tabsState.showEmptyState,
        activeTab: tabsState.activeTab,
        highMatches: tabsState.highMatchCount,
        nearMatches: tabsState.nearMatchCount,
        highOutfits: tabsState.highOutfitCount,
        nearOutfits: tabsState.nearOutfitCount,
      });
    }
  }, [confidenceResult.evaluated, tabsState]);

  // Log combo assembler results (dev only)
  useEffect(() => {
    if (__DEV__ && confidenceResult.evaluated) {
      console.debug('[ComboAssembler] Result:', {
        canFormCombos: comboAssemblerResult.canFormCombos,
        comboCount: comboAssemblerResult.combos.length,
        missingSlots: comboAssemblerResult.missingSlots,
        missingMessage: comboAssemblerResult.missingMessage,
      });
    }
  }, [confidenceResult.evaluated, comboAssemblerResult]);

  // Build itemSummary from scannedItem (with safe defaults for hooks)
  const itemSummary = useMemo(() => {
    if (scannedItem) {
      return {
        category: scannedItem.category,
        colors: scannedItem.colors,
        styleTags: scannedItem.styleTags,
      };
    }
    return { category: "tops" as Category, colors: [], styleTags: [] };
  }, [scannedItem]);

  // Add recent check when results are displayed (only once) - skip if viewing saved check
  // Works for both fresh scans (scannedItem from analysis) and saved checks (from database)
  useEffect(() => {
    // Skip if:
    // - Already added a check this session
    // - Viewing a saved/recent check (not a fresh scan)
    // - No preferences loaded yet
    if (hasAddedCheck.current || isViewingSavedCheck || !preferences) {
      return;
    }
    
    hasAddedCheck.current = true;

    // Run decision tree to determine outcome
    const defaultSignals: ItemSignalsResult = {
      stylingRisk: "medium" as StylingRisk,
    };

    const result = runDecisionTree({
      category: scannedItem.category,
      itemSignals: scannedItem.itemSignals || defaultSignals,
      userFitPreference: preferences?.fitPreference ?? "regular",
      contextSufficient: scannedItem.contextSufficient ?? true,
      wardrobeCount,
    });

    const confidence = outcomeToConfidence(result.outcome);
    // Use confidence engine matches for score
    const confidenceScore = confidenceResult.matches.length > 0
      ? confidenceResult.matches[0].evaluation.raw_score
      : 0.5;

    // Build debug snapshot (only in development mode)
    let engineSnapshot = null;
    if (shouldSaveDebugData()) {
      // Generate a temporary scanId (will be replaced with actual check ID after save)
      const tempScanId = `temp-${Date.now()}`;

      // Get itemCard category and label for debugging
      const itemCardCategory = itemSummary.category;
      const itemLabel = scannedItem.descriptiveLabel || getCategoryLabel(itemSummary.category);

      engineSnapshot = buildEngineSnapshot(
        confidenceResult,
        null, // No legacy matchResult
        false, // Not using legacy engine
        tempScanId,
        scannedItem.category,
        wardrobeCount,
        wardrobe,
        itemCardCategory,
        itemLabel
      );
    }

    // Capitalize scannedItem fields before saving to database
    const capitalizedScannedItem = {
      ...scannedItem,
      descriptiveLabel: scannedItem.descriptiveLabel 
        ? capitalizeFirst(scannedItem.descriptiveLabel) 
        : scannedItem.descriptiveLabel,
      styleNotes: scannedItem.styleNotes 
        ? capitalizeItems(scannedItem.styleNotes) 
        : scannedItem.styleNotes,
    };

    // Use async IIFE to handle async mutation + upload queue
    const imageUriForScan = resolvedImageUri || scannedItem.imageUri;
    
    (async () => {
      try {
        const savedScan = await addRecentCheckMutation.mutateAsync({
          itemName: capitalizeFirst(scannedItem.descriptiveLabel || "Scanned item"),
          category: scannedItem.category,
          // Use resolvedImageUri for fresh source (param > savedCheck > JSONB)
          imageUri: imageUriForScan,
          outcome: result.outcome,
          confidence,
          confidenceScore,
          scannedItem: capitalizedScannedItem,
          // TEMPORARY: Add engine snapshot
          ...(engineSnapshot && { engineSnapshot }),
        });
        
        // Queue image upload immediately for cross-device sync
        // This ensures images are available when viewing scans on other devices
        if (user?.id && imageUriForScan.startsWith('file://')) {
          console.log('[Results] Queuing immediate scan upload:', savedScan.id);
          void queueScanUpload(savedScan.id, imageUriForScan, user.id);
        }
      } catch (error) {
        console.error('[Results] Failed to save scan:', error);
        // Non-fatal: scan save failure doesn't block the UI
      }
    })();
  }, [scannedItem, resolvedImageUri, wardrobeCount, preferences, isViewingSavedCheck, addRecentCheckMutation, confidenceResult, itemSummary, wardrobe, user?.id]);

  // Trigger store review after successful scan save (iOS only)
  useEffect(() => {
    if (addRecentCheckMutation.isSuccess) {
      // Record this as a positive action and potentially prompt for review
      // Fire-and-forget: failures are non-critical and should never bubble up
      void recordPositiveAction()
        .then(() => requestReviewIfAppropriate())
        .catch(() => {}); // Silently ignore - review prompts are non-critical
    }
  }, [addRecentCheckMutation.isSuccess]);

  const getCategoryLabel = (category: Category): string =>
    (CATEGORIES.find((c) => c.id === category)?.label ?? category).toLowerCase();

  // Returns the appropriate icon component for a clothing category
  const getCategoryIcon = (category: Category) => {
    const props = { size: 18, color: colors.text.secondary, strokeWidth: 1.75 };
    switch (category) {
      case "shoes":
        return <Footprints {...props} />;
      case "tops":
        return <Shirt {...props} />;
      case "bottoms":
        return <Layers {...props} />;
      case "outerwear":
        return <Package {...props} />;
      case "bags":
        return <ShoppingBag {...props} />;
      case "accessories":
        return <Circle {...props} />;
      case "dresses":
        return <Shirt {...props} />;
      case "skirts":
        return <Layers {...props} />;
      default:
        return <Circle {...props} />;
    }
  };

  const getScannedNoun = (category: Category): string => {
    switch (category) {
      case "tops":
        return "top";
      case "bottoms":
        return "bottoms";
      case "outerwear":
        return "outerwear";
      case "shoes":
        return "shoes";
      case "bags":
        return "bag";
      case "accessories":
        return "accessory";
      case "dresses":
        return "dress";
      case "skirts":
        return "skirt";
      default:
        return category;
    }
  };

  // Can save if: 1) fresh scan not yet saved, or 2) viewing unsaved check
  // Works for both fresh scans (imageUri flow) and saved checks (checkId flow)
  const canSaveCheck = 
    (!isViewingSavedCheck && !!currentCheckId && !isSaved) ||
    (isViewingSavedCheck && savedCheck?.outcome !== "saved_to_revisit" && !isSaved);

  // Build wardrobe match rows from confidence engine (preferred) or legacy engine
  const fromWardrobeRows: GuidanceRowModel[] = useMemo(() => {
    const scannedCategory = itemSummary.category as Category;
    const scannedIcon = getCategoryIcon(scannedCategory);
    const scannedNoun = getScannedNoun(scannedCategory);

    // Get match explanation using centralized copy constants
    const getWardrobeMatchTitle = (wardrobeLabel: string, itemId: string) => {
      return getMatchExplanation(itemId, wardrobeLabel, "high");
    };

    // Use confidence engine matches if available and should show
    // Filter to core categories only - optional categories go in "Optional add-ons" section
    if (confidenceResult.evaluated && confidenceResult.showMatchesSection && confidenceResult.matches.length > 0) {
      const allMatches = confidenceResult.matches;
      const coreMatches = allMatches.filter(m => isCoreCategory(m.wardrobeItem.category as Category));
      const totalMatches = coreMatches.length;
      
      if (coreMatches.length === 0) {
        return [];
      }

      return coreMatches.slice(0, 1).map((match, index) => {
        const item = match.wardrobeItem;
        const wardrobeColor = (item.colors[0]?.name ?? "").toLowerCase();
        const wardrobeCategory = getCategoryLabel(item.category);
        const wardrobeLabel = `${wardrobeColor ? `${wardrobeColor} ` : ""}${wardrobeCategory}`.trim();

        // Use explanation from confidence engine if available
        const subtitle = match.explanation ?? undefined;

        return {
          id: `wardrobe-${item.id}`,
          leadingType: item.imageUri ? "thumb" : "none",
          leadingThumbUrl: item.imageUri,
          title: getWardrobeMatchTitle(wardrobeLabel, item.id),
          subtitle,
          subtitleOpacity: 0.6,
          showSubtitleTooltip: !!subtitle,
          trailingType: "chevron",
          trailingChevronColor: colors.text.primary,
          // href for navigation to wardrobe item screen
          href: `/wardrobe-item?itemId=${encodeURIComponent(String(item.id))}`,
          onPressAnalytics: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            trackWardrobeMatchItemTapped({
              matchCategory: item.category,
              matchPosition: index,
              scannedItemCategory: scannedCategory,
              totalMatches,
            });
          },
          onThumbPress: item.imageUri ? () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setPhotoViewerSource('main');
            setPhotoViewerUri(item.imageUri);
          } : undefined,
        };
      });
    }

    // No matches from confidence engine
    return [];
  }, [itemSummary.category, confidenceResult, setPhotoViewerUri, trackWardrobeMatchItemTapped]);

  // Set collapsed state based on whether there are rows
  const hasWardrobeMatches = fromWardrobeRows.length > 0;
  useEffect(() => {
    // Collapse by default if empty, expand if there are matches
    setIsWardrobeSectionCollapsed(!hasWardrobeMatches);
  }, [hasWardrobeMatches]);

  // Analytics: Track scan count and match events
  useEffect(() => {
    if (!scannedItem || isViewingSavedCheck) return;

    // Increment scan count once per fresh scan
    if (!hasTrackedScan.current) {
      hasTrackedScan.current = true;
      incrementAndGetScanCount();
    }

    // Track first wardrobe match visible (aha moment)
    if (hasWardrobeMatches && !hasTrackedFirstMatch.current) {
      hasTrackedFirstMatch.current = true;
      trackFirstWardrobeMatchVisible({
        wardrobeItemCount: wardrobeCount,
        matchingItemCount: fromWardrobeRows.length,
        scannedItemCategory: scannedItem.category,
      });
    }

    // Track no wardrobe match found (silent logging for ML)
    if (wardrobeCount > 0 && !hasWardrobeMatches && !hasTrackedNoMatch.current) {
      hasTrackedNoMatch.current = true;
      const wardrobeCategories = [...new Set(wardrobe.map((item) => item.category))];
      const styleFamilies = scannedItem.styleTags?.flatMap((tag) => {
        // Extract style families from tags - simplified extraction
        return tag.toLowerCase();
      }) ?? [];

      trackNoWardrobeMatchFound({
        wardrobeItemCount: wardrobeCount,
        scannedItemCategory: scannedItem.category,
        wardrobeCategories,
        styleFamilies: [...new Set(styleFamilies)],
      });
    }
  }, [scannedItem, isViewingSavedCheck, hasWardrobeMatches, wardrobeCount, fromWardrobeRows.length, wardrobe]);

  // Custom pants icon using optimized bottoms icon image
  const PantsIcon = ({ size = 32 }: { size?: number }) => {
    return (
      <View style={{
        position: "relative",
        // V3: icon drop shadow
        ...shadows.sm,
      }}>
        <Image
          source={require("../../assets/icons/bottoms.png")}
          style={{
            width: size,
            height: size,
          }}
          tintColor={colors.text.primary}
          contentFit="contain"
        />
      </View>
    );
  };

  // Custom coat icon using optimized coats icon image
  const CoatIcon = ({ size = 32 }: { size?: number }) => {
    return (
      <View style={{
        position: "relative",
        // V3: icon drop shadow
        ...shadows.sm,
      }}>
        <Image
          source={require("../../assets/icons/coats.png")}
          style={{
            width: size,
            height: size,
          }}
          tintColor={colors.text.primary}
          contentFit="contain"
        />
      </View>
    );
  };

  // Build styling suggestion rows - tab-aware (Mode A for HIGH, Mode B for NEAR)
  const helpfulAdditionRows: GuidanceRowModel[] = useMemo(() => {
    const iconProps = { size: 20, color: colors.text.secondary, strokeWidth: 1.75 };

    // NEAR tab with actual NEAR content: Compute Mode B dynamically
    // Guard: Only use Mode B if we have NEAR matches OR selected outfit candidates
    // (covers future UI changes where selection might exist without nearMatches)
    const hasNearContent =
      (tabsState.nearTab.nearMatches?.length ?? 0) > 0 ||
      (selectedNearOutfit?.candidates?.length ?? 0) > 0;
    
    if (!isHighTab && hasNearContent) {
      // Get near matches from the tabs state (PairEvaluation[])
      const nearMatchEvals = tabsState.nearTab.nearMatches;
      
      // Compute Mode B suggestions using getModeBBullets
      // - If outfit selected: uses only MEDIUM candidates from that outfit
      // - If no selection: aggregates across all nearMatches
      const modeBResult = getModeBBullets(
        selectedNearOutfit?.candidates ?? null,
        nearMatchEvals,
        confidenceResult.uiVibeForCopy
      );

      if (modeBResult && modeBResult.bullets.length > 0) {
        // Mode B: Keep VIBE-RESOLVED title since there's no item list to "lie" about.
        // Mode B shows educational boards (do/don't/try), not filtered suggestions.
        return modeBResult.bullets.slice(0, 3).map((bullet, idx) => ({
          id: `mode-b-${idx}`,
          leadingType: "icon",
          leadingIcon: <Lightbulb {...iconProps} />,
          title: bullet.text, // Keep vibe-resolved for Mode B
          subtitle: undefined,
          trailingType: "none",
          iconGlassmorphism: true,
          bulletKey: bullet.key,
        }));
      }
      // Fall through to Mode A if Mode B is empty
    }

    // HIGH tab OR LOW tier (no matches) OR Mode B empty: Use Mode A
    // DEBUG: Check if we enter Mode A block
    if (__DEV__) {
      console.log('[ModeA Check] evaluated:', confidenceResult.evaluated, 
        'modeASuggestions:', !!confidenceResult.modeASuggestions,
        'isHighTab:', isHighTab, 'hasNearContent:', hasNearContent);
    }
    
    if (confidenceResult.evaluated && confidenceResult.modeASuggestions) {
      const suggestion = confidenceResult.modeASuggestions;
      
      // Filter out bullets for:
      // 1. target: null when wardrobe is empty (generic advice)
      // 2. Categories that already have MEDIUM+ matches (redundant suggestions)
      const matchedCategories = confidenceResult.rawEvaluation?.matched_categories;
      const filteredBullets = filterModeABullets(suggestion.bullets, wardrobeCount, matchedCategories);
      
      // DEBUG: Log filtering details to find the bug
      if (__DEV__) {
        console.log('[ModeA Bullets] Raw:', suggestion.bullets.length, 'Filtered:', filteredBullets.length, 
          'matchedCategories:', matchedCategories, 
          'wardrobeCount:', wardrobeCount,
          'bullets:', suggestion.bullets.map(b => ({ text: b.text.substring(0, 20), target: b.target })));
      }
      
      // If all bullets were filtered out, return empty array (section will be hidden)
      if (filteredBullets.length === 0) {
        return [];
      }
      
      // Mode A suggestions are structured bullets with text and target category
      // Use target category to determine icon, fallback to text parsing
      const getIconForBullet = (bullet: { text: string; target: string | null }) => {
        // First try to use target category for icon
        if (bullet.target) {
          switch (bullet.target) {
            case 'bottoms':
            case 'skirts':
              return <PantsIcon size={32} />;
            case 'tops':
              return <Shirt {...iconProps} />;
            case 'shoes':
              return <View style={{ opacity: 0.6 }}><Footprints {...iconProps} /></View>;
            case 'outerwear':
              return <CoatIcon size={32} />;
            case 'bags':
              return <ShoppingBag {...iconProps} />;
            case 'accessories':
              return <Circle {...iconProps} />;
            case 'dresses':
              return <Shirt {...iconProps} />;
          }
        }
        // Fallback: parse text for icon (for legacy/null targets)
        const lowerBullet = bullet.text.toLowerCase();
        if (lowerBullet.includes('bottom') || lowerBullet.includes('trouser') || lowerBullet.includes('pant') || lowerBullet.includes('jean')) {
          return <PantsIcon size={32} />;
        }
        if (lowerBullet.includes('top') || lowerBullet.includes('shirt') || lowerBullet.includes('layer') || lowerBullet.includes('base')) {
          return <Shirt {...iconProps} />;
        }
        if (lowerBullet.includes('shoe') || lowerBullet.includes('sneaker') || lowerBullet.includes('boot') || lowerBullet.includes('footwear')) {
          return <View style={{ opacity: 0.6 }}><Footprints {...iconProps} /></View>;
        }
        if (lowerBullet.includes('outer') || lowerBullet.includes('jacket') || lowerBullet.includes('coat')) {
          return <CoatIcon size={32} />;
        }
        if (lowerBullet.includes('bag') || lowerBullet.includes('purse')) {
          return <ShoppingBag {...iconProps} />;
        }
        if (lowerBullet.includes('accessory') || lowerBullet.includes('accessories') || lowerBullet.includes('minimal')) {
          return <Circle {...iconProps} />;
        }
        // Default: use a generic styling icon
        return <Sparkles {...iconProps} />;
      };

      // Use BASE title (not vibe-resolved) to avoid promising specific items
      // The vibe-specific text will appear as a "Style note" inside the TipSheet
      return filteredBullets.slice(0, 3).map((bullet, idx) => ({
        id: `mode-a-${idx}`,
        leadingType: "icon",
        leadingIcon: getIconForBullet(bullet),
        title: resolveBulletTitle(bullet.key, undefined) ?? bullet.text,
        subtitle: undefined,
        trailingType: "none",
        iconGlassmorphism: true,
        bulletKey: bullet.key,
        targetCategory: bullet.target, // Pass target for TipSheet content type decision
      }));
    }

    // No suggestions
    return [];
    // Note: Using selectedNearOutfit?.id instead of full object to avoid extra renders
    // when the object reference changes but the selection is the same outfit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHighTab, tabsState.nearTab.nearMatches, selectedNearOutfit?.id, selectedNearOutfit?.candidates, confidenceResult.uiVibeForCopy, confidenceResult.modeASuggestions, wardrobeCount]);

  // DEBUG: Log helpfulAdditionRows result
  if (__DEV__ && confidenceResult.evaluated) {
    console.log('[helpfulAdditionRows] count:', helpfulAdditionRows.length, 
      'rows:', helpfulAdditionRows.map(r => ({ id: r.id, title: r.title?.substring(0, 25) })));
  }

  // Build the complete render model from confidence engine result
  // This is the SINGLE SOURCE OF TRUTH for section visibility
  const renderModel: ResultsRenderModel = useMemo(() => {
    return buildResultsRenderModel(confidenceResult, wardrobeCount, wardrobe);
  }, [confidenceResult, wardrobeCount, wardrobe]);

  // Extract values from render model for convenience
  // uiState is for presentation (colors/icons) ONLY — never use for visibility decisions
  const uiState = renderModel.uiState;
  const showMatchesSection = renderModel.matchesSection.visible;
  const nearMatches = renderModel.matchesSection.nearMatches;

  // Build NEAR match rows for the "Worth trying" tab
  // Filter to core categories only - optional categories go in "Optional add-ons" section
  const nearMatchRows: GuidanceRowModel[] = useMemo(() => {
    // Use enriched near matches from render model
    if (nearMatches.length === 0) {
      return [];
    }

    // Filter to core categories only
    const coreNearMatches = nearMatches.filter(m => isCoreCategory(m.wardrobeItem.category as Category));
    
    if (coreNearMatches.length === 0) {
      return [];
    }

    // Get match explanation using centralized copy constants
    const getNearMatchTitle = (wardrobeLabel: string, itemId: string) => {
      return getMatchExplanation(itemId, wardrobeLabel, "near");
    };

    return coreNearMatches.slice(0, 1).map((match, index) => {
      const item = match.wardrobeItem;
      const wardrobeColor = (item.colors[0]?.name ?? "").toLowerCase();
      const wardrobeCategory = getCategoryLabel(item.category);
      const wardrobeLabel = `${wardrobeColor ? `${wardrobeColor} ` : ""}${wardrobeCategory}`.trim();

      // Near matches don't show explanations (trust guardrail)
      return {
        id: `near-${item.id}`,
        leadingType: item.imageUri ? "thumb" : "none",
        leadingThumbUrl: item.imageUri,
        title: getNearMatchTitle(wardrobeLabel, item.id),
        subtitle: undefined,
        subtitleOpacity: 0.6,
        showSubtitleTooltip: false,
        trailingType: "chevron",
        trailingChevronColor: colors.text.primary,
        // href for navigation to wardrobe item screen
        href: `/wardrobe-item?itemId=${encodeURIComponent(String(item.id))}`,
        onPressAnalytics: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
        onThumbPress: item.imageUri ? () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setPhotoViewerUri(item.imageUri);
        } : undefined,
      };
    });
  }, [nearMatches, setPhotoViewerUri]);

  // Optional add-ons: Layer (outerwear), Bag, Accessories
  // Grouped by category and filtered by tier based on active tab
  interface AddOnItem {
    id: string;
    imageUri: string | undefined;
    category: Category;
    tier: 'HIGH' | 'MEDIUM';
  }

  // HIGH add-ons (for Wear now tab) - only HIGH tier optional items
  const highAddOns = useMemo((): AddOnItem[] => {
    if (!confidenceResult.evaluated || !confidenceResult.showMatchesSection) {
      return [];
    }
    return confidenceResult.matches
      .filter(m => isOptionalCategory(m.wardrobeItem.category as Category))
      .map(m => ({
        id: m.wardrobeItem.id,
        imageUri: m.wardrobeItem.imageUri,
        category: m.wardrobeItem.category as Category,
        tier: 'HIGH' as const,
      }));
  }, [confidenceResult.evaluated, confidenceResult.showMatchesSection, confidenceResult.matches]);

  // NEAR add-ons (for Worth trying tab) - HIGH + MEDIUM tier optional items
  const nearAddOns = useMemo((): AddOnItem[] => {
    if (nearMatches.length === 0 && (!confidenceResult.evaluated || !confidenceResult.showMatchesSection)) {
      return [];
    }
    
    const result: AddOnItem[] = [];
    const seenIds = new Set<string>();
    
    // Add HIGH tier optional items (no badge needed)
    if (confidenceResult.evaluated && confidenceResult.showMatchesSection) {
      for (const m of confidenceResult.matches) {
        if (isOptionalCategory(m.wardrobeItem.category as Category)) {
          if (!seenIds.has(m.wardrobeItem.id)) {
            seenIds.add(m.wardrobeItem.id);
            result.push({
              id: m.wardrobeItem.id,
              imageUri: m.wardrobeItem.imageUri,
              category: m.wardrobeItem.category as Category,
              tier: 'HIGH',
            });
          }
        }
      }
    }
    
    // Add MEDIUM tier optional items (will show "Needs tweak" badge)
    for (const m of nearMatches) {
      if (isOptionalCategory(m.wardrobeItem.category as Category)) {
        if (!seenIds.has(m.wardrobeItem.id)) {
          seenIds.add(m.wardrobeItem.id);
          result.push({
            id: m.wardrobeItem.id,
            imageUri: m.wardrobeItem.imageUri,
            category: m.wardrobeItem.category as Category,
            tier: 'MEDIUM',
          });
        }
      }
    }
    
    return result;
  }, [nearMatches, confidenceResult.evaluated, confidenceResult.showMatchesSection, confidenceResult.matches]);

  // Group add-ons by category for rendering rows
  // Sorted: HIGH first (no badge), then MEDIUM (with "Needs tweak") for optimistic feel
  const getAddOnsByCategory = useCallback((addOns: AddOnItem[], category: Category): AddOnItem[] => {
    return addOns
      .filter(a => a.category === category)
      .sort((a, b) => {
        // HIGH comes before MEDIUM
        if (a.tier === 'HIGH' && b.tier === 'MEDIUM') return -1;
        if (a.tier === 'MEDIUM' && b.tier === 'HIGH') return 1;
        return 0;
      });
  }, []);

  // Suggestions visibility is driven by helpfulAdditionRows.length > 0
  // Titles are tab-aware: "Complete the look" (HIGH) / "Make it work" (NEAR)

  // Debug: Log when showRescanCta triggers (rare edge case - helps track frequency)
  useEffect(() => {
    if (__DEV__ && renderModel.showRescanCta && confidenceResult.evaluated) {
      console.warn('[RenderModel] showRescanCta triggered - no actionable content', {
        showTabs: tabsState.showTabs,
        showHigh: tabsState.showHigh,
        showNear: tabsState.showNear,
        highMatches: tabsState.highMatchCount,
        nearMatches: tabsState.nearMatchCount,
        wardrobeCount,
      });
    }
  }, [renderModel.showRescanCta, confidenceResult.evaluated, tabsState, wardrobeCount]);

  const wardrobeItemsForAddCategory = useMemo(() => {
    if (!addFromWardrobeCategory) return [];
    return wardrobe.filter((w) => w.category === addFromWardrobeCategory);
  }, [addFromWardrobeCategory, wardrobe]);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!isViewingSavedCheck) {
      clearScan();
    }
    // If we came from scan, go back twice to skip the scan screen
    // This prevents showing the scan camera briefly when closing results
    if (fromScan) {
      router.dismiss(2);
    } else {
      router.back();
    }
  };

  // Get original outcome based on verdict state (for unsaving)
  const getOriginalOutcome = (): OutcomeState => {
    // Map verdictUIState back to outcome
    const stateToOutcome: Record<VerdictUIState, OutcomeState> = {
      'great': 'looks_like_good_match',
      'okay': 'could_work_with_pieces',
      'risky': 'might_feel_tricky',
      'context_needed': 'needs_more_context',
    };
    return stateToOutcome[decisionTreeResult.verdictUIState] || 'looks_like_good_match';
  };

  const handleToggleSave = () => {
    // Debounce rapid taps (300ms minimum between taps)
    const now = Date.now();
    if (now - lastSaveTimestampRef.current < 300) {
      return;
    }
    
    lastSaveTimestampRef.current = now;
    
    // Toggle between saved and unsaved based on current visual state
    if (isSaved) {
      // Unsave: restore original outcome
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsSaved(false); // Immediate visual feedback
      
      const originalOutcome = getOriginalOutcome();
      // Use currentCheckId for fresh scans, savedCheck.id for saved checks
      const idToUnsave = !isViewingSavedCheck && currentCheckId 
        ? currentCheckId 
        : savedCheck?.id;
      // Use resolvedImageUri for fresh scans, savedCheck.imageUri for saved checks
      const imageUriToCleanup = !isViewingSavedCheck && currentCheckId
        ? (resolvedImageUri || scannedItem.imageUri)
        : savedCheck?.imageUri;
      
      if (idToUnsave) {
        // 1. Cancel any pending upload (prevents wasted bandwidth/storage)
        void cancelUpload(idToUnsave);
        
        // 2. Clean up local storage (image copy in scan-images/)
        // Only if it's a local file (not already synced to cloud)
        if (imageUriToCleanup && isLocalUri(imageUriToCleanup)) {
          void cleanupScanStorage(idToUnsave, imageUriToCleanup);
        }
        
        // 3. Update DB outcome
        updateRecentCheckOutcomeMutation.mutate(
          { id: idToUnsave, outcome: originalOutcome }
        );
        
        // Show unsaved toast
        setShowScanUnsavedToast(true);
        setTimeout(() => setShowScanUnsavedToast(false), 2000);
      }
    } else {
      // Save - optimistic visual feedback only (bookmark filled)
      setIsSaved(true);
      
      // Helper to perform save with local storage + cloud upload
      const performSave = async (id: string, currentImageUri: string) => {
        if (!user?.id) {
          console.error('[Save] No user ID, cannot save');
          setIsSaved(false);
          return;
        }
        
        try {
          // 1. Prepare: copy image to local storage with deterministic name
          const localUri = await prepareScanForSave(id, currentImageUri, user.id);
          
          // 2. Update DB with outcome AND new local imageUri (await to catch errors)
          await updateRecentCheckOutcomeMutation.mutateAsync({ 
            id, 
            outcome: "saved_to_revisit",
            imageUri: localUri !== currentImageUri ? localUri : undefined, // Only update if changed
          });
          
          // Success! Show haptic and toast now
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setShowScanSavedToast(true);
          setTimeout(() => setShowScanSavedToast(false), 2000);
          
          // 3. Queue background upload (fire and forget)
          try {
            await completeScanSave(id, localUri, user.id);
          } catch (uploadError) {
            console.error('[Save] Failed to queue upload:', uploadError);
            // Non-fatal: scan is saved locally, upload will retry
          }
        } catch (error) {
          console.error('[Save] Failed to save scan:', error);
          // Revert visual state
          setIsSaved(false);

          // Check if it's a network error
          const errMessage = error instanceof Error ? error.message : String(error || "");
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

          console.log("[Save] Error:", errMessage, "isNetwork:", isNetworkErr);
          setSaveError(isNetworkErr ? 'network' : 'other');
        }
      };
      
      // Use resolvedImageUri for the fresh source, fall back to scannedItem.imageUri
      const imageUriToSave = resolvedImageUri || scannedItem.imageUri;
      
      if (!isViewingSavedCheck && currentCheckId) {
        // Fresh scan (new imageUri flow or legacy flow)
        void performSave(currentCheckId, imageUriToSave);
      } else if (isViewingSavedCheck && savedCheck?.id) {
        // Viewing saved check
        void performSave(savedCheck.id, savedCheck.imageUri);
      }
    }
  };

  const handleScanAnother = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearScan();
    router.replace("/scan");
  };

  const handleAddWardrobe = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Analytics: Track add item from matches section
    if (scannedItem) {
      trackAddItemFromMatchesSection({
        scannedItemCategory: scannedItem.category,
      });
    }
    router.push("/add-item");
  };

  // ============================================
  // NON-FASHION / UNCERTAIN ITEM GUARDS
  // ============================================
  // These must come before the success rendering to show appropriate UIs
  if (!scannedItem) {
    return <MissingScanData insets={insets} />;
  }

  // ============================================
  // NON-FASHION / UNCERTAIN ITEM GATES
  // ============================================
  // Two distinct states:
  // 1. Non-fashion: isFashionItem === false (mug, phone, etc.)
  // 2. Uncertain fashion: isFashionItem !== false && category === "unknown" (blurry shirt)
  const isNonFashionItem = scannedItem.isFashionItem === false;
  const isUncertainFashion = scannedItem.isFashionItem !== false && scannedItem.category === "unknown";
  
  // Gate 1: Non-fashion item (definitely not clothing)
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
            onPress={handleBack}
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
          {resolvedImageUri && (
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
                source={{ uri: resolvedImageUri }}
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
          {scannedItem.descriptiveLabel && (
            <Text
              style={{
                ...typography.ui.caption,
                color: colors.text.tertiary,
                textAlign: "center",
                marginBottom: spacing.xl,
              }}
            >
              Detected: {scannedItem.descriptiveLabel}
            </Text>
          )}

          {/* Actions */}
          <ButtonPrimary
            label="Try Another Photo"
            onPress={() => {
              clearScan();
              router.replace("/scan");
            }}
            style={{ width: "100%", marginBottom: spacing.md }}
          />
          <ButtonTertiary
            label="Go Back"
            onPress={handleBack}
          />
        </View>
      </View>
    );
  }

  // Gate 2: Uncertain fashion item (fashion but couldn't identify category)
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
            onPress={handleBack}
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
          {resolvedImageUri && (
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
                source={{ uri: resolvedImageUri }}
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
              clearScan();
              router.replace("/scan");
            }}
            style={{ width: "100%", marginBottom: spacing.md }}
          />
          <ButtonTertiary
            label="Go Back"
            onPress={handleBack}
          />
        </View>
      </View>
    );
  }

  console.log("[ResultsScreen] CE matches count:", confidenceResult.matches.length);
  console.log("[ResultsScreen] CE matches categories:", confidenceResult.matches.map(m => m.wardrobeItem.category));

  // Run decision tree to get outcome
  const defaultSignals: ItemSignalsResult = {
    stylingRisk: "medium" as StylingRisk,
  };

  const decisionTreeResult: DecisionTreeResult = runDecisionTree({
    category: scannedItem.category,
    itemSignals: scannedItem.itemSignals || defaultSignals,
    userFitPreference: preferences?.fitPreference ?? "regular",
    contextSufficient: scannedItem.contextSufficient ?? true,
    wardrobeCount,
  });

  // Use AI-generated labels and notes if available, otherwise use category name
  const itemLabel = capitalizeFirst(scannedItem.descriptiveLabel || getCategoryLabel(itemSummary.category));
  const styleNotes = capitalizeItems(scannedItem.styleNotes || []);
  const styleTags = scannedItem.styleTags || [];

  // Generate context-aware explanation based on outcome
  const getContextAwareExplanation = (): { main: string; hint?: string } => {
    // Handle context_needed state with specific copy
    if (decisionTreeResult.verdictUIState === "context_needed") {
      return {
        main: "We need a bit more context to see how this fits with your wardrobe staples.",
      };
    }

    // For other states, use the decision tree explanation
    return { main: decisionTreeResult.explanation };
  };

  const explanationData = getContextAwareExplanation();

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ 
          position: "absolute", 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0,
          backgroundColor: colors.bg.primary
        }}
      />
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
              onPress={handleBack}
              style={{
                width: spacing.xxl,
                height: spacing.xxl,
                borderRadius: borderRadius.pill,
                backgroundColor: "rgba(255,255,255,0.1)",
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
                {RESULTS_COPY.mainHeader}
              </Text>
            </View>
            <Pressable
              onPress={handleToggleSave}
              style={{
                width: spacing.xxl,
                height: spacing.xxl,
                borderRadius: borderRadius.pill,
                backgroundColor: "rgba(255,255,255,0.1)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isSaved ? (
                <BookmarkCheck size={20} color={colors.text.primary} strokeWidth={2} />
              ) : (
                <Bookmark size={20} color={colors.text.secondary} strokeWidth={1.5} />
              )}
            </Pressable>
          </View>
        </Animated.View>
        {/* Separator line */}
        <View style={{ height: 1, backgroundColor: colors.border.hairline }} />
      </View>

      {/* Segmented Control - Only show when both tabs have content */}
      {wardrobeCount > 0 && tabsState.showTabs && (
        <SegmentedControl
          activeTab={tabsState.activeTab}
          onTabChange={handleTabChange}
        />
      )}

      {/* Empty State ScrollView - Only show when wardrobeCount === 0 */}
      {wardrobeCount === 0 && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: insets.bottom + 100, paddingHorizontal: spacing.lg }}
        >
          {/* Item Summary Card */}
          {wardrobeCount === 0 ? (
          /* Compact expandable card for empty state */
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
                setIsScannedItemExpanded(!isScannedItemExpanded);
              }}
              accessibilityLabel={isScannedItemExpanded ? "Collapse item details" : "Expand item details"}
            >
              <View
                style={{
                  padding: spacing.md,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                {/* Thumbnail - tappable to open photo viewer */}
                <Pressable
                  onPress={() => {
                    if (!scannedItemImageError && resolvedImageUri) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setPhotoViewerSource('main');
                      setPhotoViewerUri(resolvedImageUri);
                    }
                  }}
                >
                  {scannedItemImageError ? (
                    <ThumbnailPlaceholderImage size={spacing.xxl + spacing.md - 4} />
                  ) : (
                    <Image
                      source={{ uri: resolvedImageUri }}
                      style={{ width: spacing.xxl + spacing.md - 4, height: spacing.xxl + spacing.md - 4, borderRadius: borderRadius.image }}
                      contentFit="cover"
                      onError={() => setScannedItemImageError(true)}
                    />
                  )}
                </Pressable>
                {/* Title */}
                <View style={{ flex: 1, marginLeft: spacing.md - spacing.xs }}>
                  <Text
                    style={{
                      ...typography.ui.cardTitle,
                      color: colors.text.primary,
                    }}
                  >
                    {itemLabel}
                  </Text>
                </View>
                {/* Chevron */}
                <ChevronDown
                  size={20}
                  color={colors.text.secondary}
                  style={{
                    transform: [{ rotate: isScannedItemExpanded ? "180deg" : "0deg" }],
                  }}
                />
              </View>
              {/* Expanded description - only show if style notes exist */}
              {isScannedItemExpanded && styleNotes.length > 0 && (
                <Animated.View
                  entering={FadeIn.duration(200)}
                  exiting={FadeOut.duration(200)}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingBottom: spacing.md,
                    borderTopWidth: 1,
                    borderTopColor: colors.border.hairline,
                    marginTop: spacing.sm,
                    paddingTop: spacing.sm + spacing.xs / 2,
                  }}
                >
                  <Text
                    style={{
                      ...typography.ui.micro,
                      color: colors.text.secondary,
                    }}
                  >
                    {styleNotes.join(" · ")}
                  </Text>
                </Animated.View>
              )}
            </Pressable>
          </Animated.View>
        ) : (
          /* Original card for non-empty state */
          <Animated.View
            entering={FadeInDown.delay(150)}
            style={{
              marginBottom: spacing.lg,
              borderRadius: borderRadius.card,
              overflow: "hidden",
            }}
          >
            <BlurView
              intensity={20}
              tint="light"
              style={{
                backgroundColor: "rgba(255,255,255,0.15)" /* On dark BG */,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.22)" /* On dark BG */,
                borderRadius: borderRadius.card,
                padding: spacing.lg,
                flexDirection: "row",
                // V3: glassmorphism with shadow
                ...shadows.md,
              }}
            >
              <Pressable
                onPress={() => {
                  if (!scannedItemImageError && resolvedImageUri) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setPhotoViewerUri(resolvedImageUri);
                  }
                }}
              >
                {scannedItemImageError ? (
                  <ThumbnailPlaceholderImage 
                    size={spacing.xxl * 2 - spacing.xs}
                    style={{ height: spacing.xxl * 2 + spacing.lg + spacing.xs / 2 }}
                  />
                ) : (
                  <Image
                    source={{ uri: resolvedImageUri }}
                    style={{ width: spacing.xxl * 2 - spacing.xs, height: spacing.xxl * 2 + spacing.lg + spacing.xs / 2, borderRadius: borderRadius.image }}
                    contentFit="cover"
                    onError={() => setScannedItemImageError(true)}
                  />
                )}
              </Pressable>
              <View style={{ flex: 1, marginLeft: 16, justifyContent: "center" }}>
                <Text
                  style={{
                    ...typography.ui.cardTitle,
                    color: colors.text.primary,
                    marginBottom: styleNotes.length > 0 ? spacing.xs : 0,
                  }}
                >
                  {itemLabel}
                </Text>
                {styleNotes.length > 0 && (
                  <Text
                    style={{
                      ...typography.ui.caption,
                      color: colors.text.secondary,
                    }}
                  >
                    {styleNotes.join(" · ")}
                  </Text>
                )}
              </View>
            </BlurView>
          </Animated.View>
        )}

        {/* Empty State Content - Only show when wardrobeCount === 0 */}
        {wardrobeCount === 0 ? (
          <>
            {/* Step Timeline Card */}
            <Animated.View entering={FadeInDown.delay(300)} style={{ marginBottom: spacing.sm }}>
            <View
              style={{
                // V3: cards.standard = border-first, no shadow
                backgroundColor: cards.standard.backgroundColor,
                borderWidth: cards.standard.borderWidth,
                borderColor: cards.standard.borderColor,
                borderRadius: borderRadius.pill,
                padding: spacing.lg,
              }}
            >
              {/* Step 1 - Completed */}
              <View style={{ flexDirection: "row", marginBottom: spacing.md }}>
                {/* Circle with check */}
                <View
                  style={{
                    width: spacing.xl,
                    height: spacing.xl,
                    borderRadius: borderRadius.card,
                    backgroundColor: colors.accent.terracottaLight,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                  }}
                >
                  <Check size={18} color={colors.accent.terracotta} strokeWidth={2.5} />
                </View>
                {/* Text */}
                <View style={{ flex: 1, paddingTop: spacing.xs }}>
                  <Text
                    style={{
                      ...typography.ui.cardTitle,
                      color: colors.text.primary,
                    }}
                  >
                    You scanned an item
                  </Text>
                </View>
              </View>

              {/* Connector line */}
              <View
                style={{
width: spacing.xs / 2,
                height: spacing.md - spacing.xs,
                  backgroundColor: colors.bg.tertiary,
                  marginLeft: spacing.md,
                  marginBottom: spacing.xs / 2,
                }}
              />

              {/* Step 2 - Current */}
              <View style={{ flexDirection: "row", marginBottom: spacing.md }}>
                {/* Circle with number */}
                <View
                  style={{
                    width: spacing.xl,
                    height: spacing.xl,
                    borderRadius: borderRadius.card,
                    borderWidth: 2,
                    borderColor: colors.accent.terracotta,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                    backgroundColor: colors.bg.elevated,
                  }}
                >
                  <Text
                    style={{
                      ...typography.ui.bodyMedium,
                      color: colors.accent.terracotta,
                    }}
                  >
                    2
                  </Text>
                </View>
                {/* Text */}
                <View style={{ flex: 1, paddingTop: spacing.xs }}>
                  <Text
                    style={{
                      ...typography.ui.cardTitle,
                      color: colors.text.primary,
                      marginBottom: spacing.xs / 2,
                    }}
                  >
                    Add a few wardrobe items
                  </Text>
                  <Text
                    style={{
                      ...typography.ui.micro,
                      color: colors.text.secondary,
                    }}
                  >
                    Add 3–5 pieces and we'll start matching instantly.
                  </Text>
                </View>
              </View>

              {/* Connector line */}
              <View
                style={{
width: spacing.xs / 2,
                height: spacing.md - spacing.xs,
                  backgroundColor: colors.bg.tertiary,
                  marginLeft: spacing.md,
                  marginBottom: spacing.xs / 2,
                }}
              />

              {/* Step 3 - Locked/Future */}
              <View style={{ flexDirection: "row" }}>
                {/* Circle with number */}
                <View
                  style={{
                    width: spacing.xl,
                    height: spacing.xl,
                    borderRadius: borderRadius.card,
                    borderWidth: 2,
                    borderColor: colors.border.hairline,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                    backgroundColor: colors.bg.elevated,
                  }}
                >
                  <Text
                    style={{
                      ...typography.ui.bodyMedium,
                      color: colors.text.tertiary,
                    }}
                  >
                    3
                  </Text>
                </View>
                {/* Text */}
                <View style={{ flex: 1, paddingTop: spacing.xs }}>
                  <Text
                    style={{
                      ...typography.ui.sectionTitle,
                      color: colors.text.secondary,
                      marginBottom: spacing.xs / 2,
                    }}
                  >
                    Get outfit matches
                  </Text>
                  <Text
                    style={{
                      ...typography.ui.caption,
                      color: colors.text.tertiary,
                    }}
                  >
                    See what works with this item.
                  </Text>
                </View>
              </View>
            </View>
          </Animated.View>

            {/* What to add first - tappable tips that open bottom sheet */}
            {helpfulAdditionRows.length > 0 && (
              <Animated.View entering={FadeInDown.delay(400)} style={{ marginBottom: spacing.md, marginTop: spacing.xs / 2 }}>
                <Text
                  style={{
                    ...typography.ui.sectionTitle,
                    color: colors.text.primary,
                    marginBottom: spacing.sm,
                    paddingHorizontal: spacing.xs,
                  }}
                >
                  {RESULTS_COPY.sections.whatToAddFirst}
                </Text>
                <View
                  style={{
                    // V3: cards.standard = border-first, no shadow
                    backgroundColor: cards.standard.backgroundColor,
                    borderWidth: cards.standard.borderWidth,
                    borderColor: cards.standard.borderColor,
                    borderRadius: cards.standard.borderRadius,
                    overflow: "hidden",
                  }}
                >
                  {helpfulAdditionRows.map((row, index) => {
                    // Use bulletKey directly from the row (set in helpfulAdditionRows)
                    const hasTipSheet = !!row.bulletKey;
                    // Determine the mode based on the row id prefix
                    const tipSheetMode = row.id.startsWith('mode-b-') ? 'B' : 'A';

                    return (
                      <Pressable
                        key={row.id}
                        onPress={() => {
                          if (hasTipSheet && row.bulletKey) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedTipSheet({
                              bulletKey: row.bulletKey,
                              mode: tipSheetMode,
                              title: row.title,
                              targetCategory: row.targetCategory,
                            });
                          }
                        }}
                        onLongPress={() => {
                          // Debug: show vibe + title resolution info
                          if (__DEV__ && row.bulletKey) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            const vibe = confidenceResult.uiVibeForCopy;
                            const resolvedTitle = resolveBulletTitle(row.bulletKey, vibe);
                            console.log(`[Bullet Debug] key="${row.bulletKey}" vibe="${vibe}" → resolved="${resolvedTitle}" displayed="${row.title}"`);
                          }
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 14,
                          paddingHorizontal: spacing.md,
                          borderBottomWidth: index < helpfulAdditionRows.length - 1 ? 1 : 0,
                          borderBottomColor: colors.border.hairline,
                        }}
                      >
                        <View
                          style={{
                            width: spacing.xl - 4,
                            height: spacing.xl - 4,
                            borderRadius: borderRadius.image,
                            backgroundColor: colors.accent.terracottaLight,
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 12,
                          }}
                        >
                          {row.leadingIcon}
                        </View>
                        <Text
                          style={{
                            flex: 1,
                            ...typography.ui.bodyMedium,
                            color: colors.text.primary,
                          }}
                        >
                          {row.title}
                        </Text>
                        <ChevronRight size={18} color={colors.text.tertiary} />
                      </Pressable>
                    );
                  })}
                </View>
              </Animated.View>
            )}
          </>
        ) : null}
        </ScrollView>
      )}

      {/* Regular content ScrollView - only show when wardrobeCount > 0 */}
      {wardrobeCount > 0 && (
        <ScrollView
          ref={mainScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: insets.bottom + 100, paddingHorizontal: spacing.lg }}
        >
          {/* Item Summary Card - Updated to match new design */}
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
                setIsScannedItemExpanded(!isScannedItemExpanded);
              }}
              accessibilityLabel={isScannedItemExpanded ? "Collapse item details" : "Expand item details"}
            >
              <View
                style={{
                  padding: spacing.md,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                {/* Thumbnail - tappable to open photo viewer */}
                <Pressable
                  onPress={() => {
                    if (!scannedItemImageError && resolvedImageUri) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setPhotoViewerSource('main');
                      setPhotoViewerUri(resolvedImageUri);
                    }
                  }}
                >
                  {scannedItemImageError ? (
                    <ThumbnailPlaceholderImage size={spacing.xxl + spacing.md - 4} />
                  ) : (
                    <Image
                      source={{ uri: resolvedImageUri }}
                      style={{ width: spacing.xxl + spacing.md - 4, height: spacing.xxl + spacing.md - 4, borderRadius: borderRadius.image }}
                      contentFit="cover"
                      onError={() => setScannedItemImageError(true)}
                    />
                  )}
                </Pressable>
                {/* Title */}
                <View style={{ flex: 1, marginLeft: spacing.md - spacing.xs }}>
                  <Text
                    style={{
                      ...typography.ui.cardTitle,
                      color: colors.text.primary,
                    }}
                  >
                    {itemLabel}
                  </Text>
                </View>
                {/* Chevron */}
                <ChevronDown
                  size={20}
                  color={colors.text.secondary}
                  style={{
                    transform: [{ rotate: isScannedItemExpanded ? "180deg" : "0deg" }],
                  }}
                />
              </View>
              {/* Expanded description - only show if style notes exist */}
              {isScannedItemExpanded && styleNotes.length > 0 && (
                <Animated.View
                  entering={FadeIn.duration(200)}
                  exiting={FadeOut.duration(200)}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingBottom: spacing.md,
                    borderTopWidth: 1,
                    borderTopColor: colors.border.hairline,
                    marginTop: spacing.sm,
                    paddingTop: spacing.sm + spacing.xs / 2,
                  }}
                >
                  <Text
                    style={{
                      ...typography.ui.micro,
                      color: colors.text.secondary,
                    }}
                  >
                    {styleNotes.join(" · ")}
                  </Text>
                </Animated.View>
              )}
            </Pressable>
          </Animated.View>

          {/* Matches section - tab-aware: HIGH matches on HIGH tab, NEAR matches on NEAR tab */}
          {/* For HIGH tab: show if showMatchesSection (from render model) */}
          {/* For NEAR tab: show if there are nearMatchRows (even when showMatchesSection is false) */}
          {((isHighTab && showMatchesSection) || (!isHighTab && nearMatchRows.length > 0)) && (
            <Animated.View entering={FadeInDown.delay(200)} style={{ marginBottom: spacing.lg, marginTop: spacing.xs / 2 }}>
              {(() => {
                // Calculate if we should show "See all" button
                const matchRows = isHighTab ? fromWardrobeRows : nearMatchRows;
                const allCoreMatches = isHighTab 
                  ? (confidenceResult.evaluated && confidenceResult.showMatchesSection 
                      ? confidenceResult.matches.filter(m => isCoreCategory(m.wardrobeItem.category as Category))
                      : [])
                  : nearMatches.filter(m => isCoreCategory(m.wardrobeItem.category as Category));
                const hasMoreCoreMatches = allCoreMatches.length > matchRows.length;
                
                return (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: spacing.sm,
                      paddingHorizontal: spacing.xs,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          ...typography.ui.sectionTitle,
                          color: colors.text.primary,
                        }}
                      >
                        {isHighTab ? RESULTS_COPY.sections.highMatches : RESULTS_COPY.sections.nearMatches}
                      </Text>
                      <Text
                        style={{
                          ...typography.ui.caption,
                          color: colors.text.secondary,
                          marginTop: spacing.xs / 2,
                        }}
                      >
                        {RESULTS_COPY.subtitles.fromWardrobe}
                      </Text>
                    </View>
                    {hasMoreCoreMatches && (
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setMatchesSheetType(isHighTab ? "high" : "near");
                          setShowMatchesSheet(true);
                        }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: spacing.xs,
                          marginTop: spacing.xs / 2,
                        }}
                      >
                        <Text
                          style={{
                            ...typography.ui.label,
                            color: colors.text.tertiary,
                          }}
                        >
                          View all ({allCoreMatches.length})
                        </Text>
                        <ChevronRight size={14} color={colors.text.tertiary} strokeWidth={1.5} />
                      </Pressable>
                    )}
                  </View>
                );
              })()}
              <View
                style={{
                  // V3: cards.standard = border-first, no shadow
                  backgroundColor: cards.standard.backgroundColor,
                  borderWidth: cards.standard.borderWidth,
                  borderColor: cards.standard.borderColor,
                  borderRadius: cards.standard.borderRadius,
                  overflow: "hidden",
                }}
              >
                {/* Tab-aware match rows: HIGH matches on HIGH tab, NEAR matches on NEAR tab */}
                {/* Only shows core categories - optional categories are in "Optional add-ons" section */}
                {(() => {
                  const matchRows = isHighTab ? fromWardrobeRows : nearMatchRows;
                  
                  return matchRows.length > 0 ? (
                    <>
                      {matchRows.map((row, index) => {
                        // Type assertion for extended row model with href
                        const rowWithHref = row as GuidanceRowModel & { 
                          href?: string; 
                          onPressAnalytics?: () => void;
                        };
                        
                        // Show border if not last item
                        const showBorder = index < matchRows.length - 1;
                        
                        return (
                        <Pressable
                          key={row.id}
                          onPress={() => {
                            // Fire analytics/haptics
                            if (rowWithHref.onPressAnalytics) {
                              rowWithHref.onPressAnalytics();
                            }
                            // Navigate to wardrobe item (stacks on top of results modal)
                            if (rowWithHref.href) {
                              router.push(rowWithHref.href);
                            }
                          }}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingVertical: 14,
                            paddingHorizontal: spacing.md,
                            borderBottomWidth: showBorder ? 1 : 0,
                            borderBottomColor: colors.border.hairline,
                          }}
                        >
                          {/* Thumbnail or icon */}
                          {row.leadingType === "thumb" && row.leadingThumbUrl ? (
                            <Pressable
                              onPress={() => {
                                if (row.onThumbPress) {
                                  row.onThumbPress();
                                }
                              }}
                              style={{
                                width: spacing.xl - 4,
                                height: spacing.xl - 4,
                                borderRadius: borderRadius.image,
                                backgroundColor: colors.accent.terracottaLight,
                                alignItems: "center",
                                justifyContent: "center",
                                marginRight: 12,
                                overflow: "hidden",
                              }}
                            >
                              <Image
                                source={{ uri: row.leadingThumbUrl }}
                                style={{ width: spacing.xl - 4, height: spacing.xl - 4 }}
                                contentFit="cover"
                              />
                            </Pressable>
                          ) : (
                            <View
                              style={{
                                width: spacing.xl - 4,
                                height: spacing.xl - 4,
                                borderRadius: borderRadius.image,
                                backgroundColor: colors.accent.terracottaLight,
                                alignItems: "center",
                                justifyContent: "center",
                                marginRight: 12,
                                overflow: "hidden",
                              }}
                            >
                              <Shirt size={18} color={colors.accent.terracotta} strokeWidth={1.75} />
                            </View>
                          )}
                        {/* Title and subtitle */}
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              ...typography.ui.bodyMedium,
                              color: colors.text.primary,
                            }}
                          >
                            {row.title}
                          </Text>
                          {row.subtitle && (
                            <Text
                              style={{
                                ...typography.ui.caption,
                                color: colors.text.secondary,
                                marginTop: spacing.xs / 2 + 1,
                              }}
                            >
                              {row.subtitle}
                            </Text>
                          )}
                        </View>
                        <ChevronRight size={18} color={colors.text.tertiary} />
                        </Pressable>
                        );
                      })}
                    </>
                  ) : (
                    <View style={{ padding: spacing.lg, alignItems: "center" }}>
                      <Text
                        style={{
                          ...typography.ui.body,
                          color: colors.text.secondary,
                          textAlign: "center",
                          marginBottom: spacing.sm,
                        }}
                      >
                        {isHighTab ? "No matches from your wardrobe yet" : "No close matches yet"}
                      </Text>
                      <Pressable
                        onPress={handleAddWardrobe}
                        style={{
                          backgroundColor: colors.accent.terracottaLight,
                          paddingHorizontal: spacing.md,
                          paddingVertical: 8,
                          borderRadius: borderRadius.image,
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            ...typography.ui.bodyMedium,
                            color: colors.accent.terracotta,
                          }}
                        >
                          Add to wardrobe
                        </Text>
                        <ChevronRight size={16} color={colors.accent.terracotta} style={{ marginLeft: 4 }} />
                      </Pressable>
                    </View>
                  );
                })()}
              </View>
            </Animated.View>
          )}

          {/* Outfit Ideas - tab-aware: uses tab.outfits + MissingPiecesCard when empty */}
          {(() => {
            const hasCombos = tab.outfits && tab.outfits.length > 0;
            const hasEmptyReason = tab.outfitEmptyReason !== null;
            
            // Apply display cap: 5 for single tab, 3 for both tabs
            const displayOutfits = tab.outfits.slice(0, tabsState.maxOutfitsPerTab);
            
            // Show section if we have outfits OR have an empty reason to display
            if (hasCombos) {
              return (
                <OutfitIdeasSection
                  combos={displayOutfits}
                  canFormCombos={true}
                  missingMessage={null}
                  sectionTitle={isHighTab ? RESULTS_COPY.sections.outfitsWearNow : RESULTS_COPY.sections.outfitsWorthTrying}
                  wardrobeItems={wardrobe}
                  scannedItemImageUri={resolvedImageUri}
                  scannedCategory={scannedItem?.category}
                  onAddToWardrobe={handleAddWardrobe}
                  onComboPress={isHighTab ? undefined : handleNearOutfitSelect}
                  onThumbPress={(uri) => {
                    setPhotoViewerSource('main');
                    setPhotoViewerUri(uri);
                  }}
                  showMediumBadge={!isHighTab}
                  selectedComboId={isHighTab ? null : selectedNearOutfit?.id ?? null}
                  showInfoIcon={!isHighTab && displayOutfits.length > 0}
                />
              );
            }
            
            // Show MissingPiecesCard when outfits are empty but we have a reason
            if (hasEmptyReason) {
              return (
                <Animated.View
                  entering={FadeInDown.delay(300)}
                  style={{ marginBottom: spacing.lg, marginTop: spacing.xs / 2 }}
                >
                  {/* Section header */}
                  <Text
                    style={{
                      ...typography.ui.sectionTitle,
                      color: colors.text.primary,
                      marginBottom: spacing.sm,
                      paddingHorizontal: spacing.xs,
                    }}
                  >
                    {isHighTab ? RESULTS_COPY.sections.outfitsWearNow : RESULTS_COPY.sections.outfitsWorthTrying}
                  </Text>
                  <MissingPiecesCard
                    emptyReason={tab.outfitEmptyReason!}
                    message={tab.missingMessage}
                    onCtaPress={(action, category) => {
                      const missingCategories = 
                        tab.outfitEmptyReason?.kind === "missingCorePieces" || 
                        tab.outfitEmptyReason?.kind === "missingHighTierCorePieces"
                          ? tab.outfitEmptyReason.missing.map((m) => m.category)
                          : [];
                      if (scannedItem?.category) {
                        trackMissingPiecesCtaTapped({
                          missingCategories: category ? [category] : missingCategories,
                          tab: tabsState.activeTab,
                          scannedItemCategory: scannedItem.category,
                        });
                      }
                    }}
                    onViewWorthTrying={handleViewWorthTrying}
                  />
                </Animated.View>
              );
            }
            
            return null;
          })()}

          {/* Optional add-ons section - Layer, Bag, Accessories */}
          {(() => {
            const addOns = isHighTab ? highAddOns : nearAddOns;
            
            // Group by category
            const layerItems = getAddOnsByCategory(addOns, 'outerwear');
            const bagItems = getAddOnsByCategory(addOns, 'bags');
            const accessoryItems = getAddOnsByCategory(addOns, 'accessories');
            
            // Check if any rows have content
            const hasContent = layerItems.length > 0 || bagItems.length > 0 || accessoryItems.length > 0;
            
            if (!hasContent) {
              return null;
            }
            
            const rows: { label: string; items: typeof addOns }[] = [];
            if (layerItems.length > 0) rows.push({ label: 'Layer', items: layerItems });
            if (bagItems.length > 0) rows.push({ label: 'Bag', items: bagItems });
            if (accessoryItems.length > 0) rows.push({ label: 'Accessories', items: accessoryItems });
            
            return (
              <Animated.View
                entering={FadeInDown.delay(325)}
                style={{ marginBottom: spacing.lg, marginTop: spacing.xs / 2 }}
              >
                {/* Section header */}
                <Text
                  style={{
                    ...typography.ui.sectionTitle,
                    color: colors.text.primary,
                    marginBottom: spacing.xs / 2,
                    paddingHorizontal: spacing.xs,
                  }}
                >
                  {RESULTS_COPY.sections.optionalAddOns}
                </Text>
                <Text
                  style={{
                    ...typography.ui.caption,
                    color: colors.text.secondary,
                    marginBottom: spacing.md - spacing.xs / 2,
                    paddingHorizontal: spacing.xs,
                  }}
                >
                  {RESULTS_COPY.subtitles.fromWardrobe}
                </Text>
                
                {/* Category rows */}
                {rows.map((row, rowIndex) => (
                  <View key={row.label} style={{ marginBottom: rowIndex < rows.length - 1 ? 20 : 0 }}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: spacing.xs, gap: spacing.sm + spacing.xs / 2, paddingBottom: 0 }}
                      decelerationRate="fast"
                    >
                      {row.items.slice(0, 4).map((item) => (
                        <View 
                          key={item.id}
                          style={{ alignItems: 'center' }}
                        >
                          <Pressable
                            onPress={() => {
                              if (item.imageUri) {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setPhotoViewerSource('main');
                                setPhotoViewerUri(item.imageUri);
                              }
                            }}
                            style={{
                              width: components.wardrobeItem.imageSize,
                              height: components.wardrobeItem.imageSize,
                              borderRadius: components.wardrobeItem.imageBorderRadius,
                              borderWidth: 1,
                              borderColor: colors.border.hairline,
                              backgroundColor: colors.bg.tertiary,
                              overflow: 'hidden',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {item.imageUri ? (
                              <View style={{ width: '92%', height: '92%', alignItems: 'center', justifyContent: 'center' }}>
                                <Image
                                  source={{ uri: item.imageUri }}
                                  style={{ 
                                    width: '100%', 
                                    height: '100%',
                                    transform: [{ scale: 1.08 }],
                                  }}
                                  contentFit="contain"
                                />
                              </View>
                            ) : (
                              <Package size={24} color={colors.text.tertiary} />
                            )}
                          </Pressable>
                          
                          {/* "Needs tweak" badge for MEDIUM items - tucked under tile */}
                          {!isHighTab && item.tier === 'MEDIUM' && (
                            <View
                              style={{
                                marginTop: -4,
                                backgroundColor: colors.accent.brass,
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: borderRadius.pill,
                              }}
                            >
                              <Text
                                style={{
                                  fontFamily: 'Inter_500Medium',
                                  fontSize: 7,
                                  color: colors.text.primary,
                                  textAlign: 'center',
                                }}
                              >
                                Needs tweak
                              </Text>
                            </View>
                          )}
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                ))}
              </Animated.View>
            );
          })()}

            {/* Styling suggestions - tab-aware: Mode A (HIGH) vs Mode B (NEAR) */}
            {helpfulAdditionRows.length > 0 && (
              <Animated.View entering={FadeInDown.delay(350)} style={{ marginBottom: spacing.md, marginTop: spacing.xs }}>
                <Text
                  style={{
                    ...typography.ui.sectionTitle,
                    color: colors.text.primary,
                    marginBottom: spacing.xs,
                    paddingHorizontal: spacing.xs,
                  }}
                >
                  {isHighTab ? RESULTS_COPY.sections.expandLook : RESULTS_COPY.sections.makeItWork}
                </Text>
                {isHighTab ? (
                  <Text
                    style={{
                      ...typography.ui.caption,
                      color: colors.text.secondary,
                      marginBottom: spacing.sm + spacing.xs,
                      paddingHorizontal: spacing.xs,
                    }}
                  >
                    {RESULTS_COPY.subtitles.suggestionsToAdd}
                  </Text>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm + spacing.xs, paddingHorizontal: spacing.xs }}>
                    <Text
                      style={{
                        ...typography.ui.caption,
                        color: colors.text.secondary,
                        flex: 1,
                      }}
                    >
                      {selectedNearOutfit
                        ? RESULTS_COPY.subtitles.weakLinkTips
                        : RESULTS_COPY.subtitles.stylingTweaks}
                    </Text>
                    {selectedNearOutfit && (
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          clearSelectedOutfit("show_all_chip");
                        }}
                        style={{
                          backgroundColor: colors.state.pressed,
                          paddingHorizontal: spacing.sm + 2,
                          paddingVertical: spacing.xs,
                          borderRadius: borderRadius.image,
                          marginLeft: spacing.sm,
                        }}
                      >
                        <Text
                          style={{
                            ...typography.ui.label,
                            color: colors.text.secondary,
                          }}
                        >
                          Show all
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
                <View
                  style={{
                    backgroundColor: colors.bg.elevated,
                    borderWidth: 1,
                    borderColor: colors.border.hairline,
                    borderRadius: borderRadius.card,
                    overflow: "hidden",
                    ...shadows.sm,
                  }}
                >
                  {helpfulAdditionRows.length > 0 ? (
                    helpfulAdditionRows.map((row, index) => {
                      // Use bulletKey directly from the row (set in helpfulAdditionRows)
                      const hasTipSheet = !!row.bulletKey;
                      // Determine mode from row id prefix (handles LOW tier edge case where
                      // isHighTab=false but we're showing Mode A bullets)
                      const tipSheetMode: 'A' | 'B' = row.id.startsWith('mode-b-') ? 'B' : 'A';

                      return (
                      <Pressable
                        key={row.id}
                        onPress={() => {
                          if (hasTipSheet && row.bulletKey) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedTipSheet({
                              bulletKey: row.bulletKey,
                              mode: tipSheetMode,
                              title: row.title,
                              targetCategory: row.targetCategory,
                            });
                          }
                        }}
                        onLongPress={() => {
                          // Debug: show vibe + title resolution info
                          if (__DEV__ && row.bulletKey) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            const vibe = confidenceResult.uiVibeForCopy;
                            const resolvedTitle = resolveBulletTitle(row.bulletKey, vibe);
                            console.log(`[Bullet Debug] key="${row.bulletKey}" vibe="${vibe}" → resolved="${resolvedTitle}" displayed="${row.title}"`);
                          }
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: spacing.sm + 6,
                          paddingHorizontal: spacing.md,
                          borderBottomWidth: index < helpfulAdditionRows.length - 1 ? 1 : 0,
                          borderBottomColor: colors.border.hairline,
                        }}
                      >
                        {/* Icon or thumbnail */}
                        <View
                          style={{
                            width: spacing.xl - 4,
                            height: spacing.xl - 4,
                            borderRadius: borderRadius.image,
                            backgroundColor: colors.accent.terracottaLight,
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: spacing.sm + spacing.xs,
                            overflow: "hidden",
                          }}
                        >
                          {row.leadingType === "thumb" && row.leadingThumbUrl ? (
                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation();
                                if (row.onThumbPress) row.onThumbPress();
                              }}
                            >
                              <Image
                                source={{ uri: row.leadingThumbUrl }}
                                style={{ width: spacing.xl - 4, height: spacing.xl - 4 }}
                                contentFit="cover"
                              />
                            </Pressable>
                          ) : (
                            row.leadingIcon
                          )}
                        </View>
                        {/* Title and subtitle */}
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              ...typography.ui.bodyMedium,
                              color: colors.text.primary,
                            }}
                          >
                            {row.title}
                          </Text>
                          {row.subtitle && (
                            <Text
                              style={{
                                ...typography.ui.caption,
                                color: colors.text.secondary,
                                marginTop: spacing.xs / 2 + 1,
                              }}
                            >
                              {row.subtitle}
                            </Text>
                          )}
                        </View>
                        <ChevronRight size={18} color={colors.text.tertiary} />
                      </Pressable>
                      );
                    })
                  ) : (
                    <View style={{ padding: spacing.lg, alignItems: "center" }}>
                      <Text
                        style={{
                          ...typography.ui.body,
                          color: colors.text.secondary,
                          textAlign: "center",
                        }}
                      >
                        No suggestions available
                      </Text>
                    </View>
                  )}
                </View>
              </Animated.View>
            )}

            {/* Rescan CTA - shown when nothing actionable is displayed (Scenario E) */}
            {renderModel.showRescanCta && (
              <Animated.View entering={FadeInDown.delay(300)} style={{ marginBottom: spacing.lg }}>
                <View
                  style={{
                    backgroundColor: colors.state.pressed,
                    borderRadius: borderRadius.card,
                    padding: spacing.lg,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      ...typography.ui.bodyMedium,
                      color: colors.text.primary,
                      textAlign: "center",
                      marginBottom: spacing.xs,
                    }}
                  >
                    We couldn't find styling suggestions for this item
                  </Text>
                  <Text
                    style={{
                      ...typography.ui.caption,
                      color: colors.text.secondary,
                      textAlign: "center",
                      marginBottom: spacing.md,
                    }}
                  >
                    Try rescanning with better lighting, or add more items to your wardrobe.
                  </Text>
                  <View style={{ flexDirection: "row", gap: spacing.sm + spacing.xs / 2 }}>
                    <Pressable
                      onPress={handleScanAnother}
                      style={{
                        backgroundColor: "rgba(255,255,255,0.15)" /* On dark BG */,
                        paddingHorizontal: 20,
                        paddingVertical: 12,
                        borderRadius: borderRadius.image,
                      }}
                    >
                      <Text
                        style={{
                          ...typography.ui.bodyMedium,
                          color: colors.text.primary,
                        }}
                      >
                        Rescan item
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleAddWardrobe}
                      style={{
                        backgroundColor: colors.accent.terracotta,
                        paddingHorizontal: 20,
                        paddingVertical: 12,
                        borderRadius: borderRadius.image,
                      }}
                    >
                      <Text
                        style={{
                          ...typography.ui.bodyMedium,
                          color: colors.text.primary,
                        }}
                      >
                        Add to wardrobe
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </Animated.View>
            )}

            {/* Tailor Suggestions Card - Store picks coming soon */}
            <Animated.View entering={FadeIn.delay(450)} style={{ marginBottom: spacing.md, marginTop: spacing.xs }}>
              <TailorSuggestionsCard
                favoriteStores={storePreference?.favoriteStores ?? []}
                showNewIndicator={!tailorCardSeen}
                onPress={() => {
                  trackTailorCardTapped({
                    tab: isHighTab ? "high" : "near",
                    hasSavedStores: (storePreference?.favoriteStores?.length ?? 0) > 0,
                  });
                  // Open modal (analytics fired in modal's useEffect)
                  setShowFavoriteStoresModal(true);
                  // Mark as seen when modal actually opens (not just on card tap)
                  if (!tailorCardSeen) {
                    markTailorCardSeen.mutate();
                  }
                }}
              />
            </Animated.View>
        </ScrollView>
      )}

      {/* Bottom Actions */}
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
        {/* When wardrobeCount === 0: Single primary CTA only (no secondary scan link) */}
        {wardrobeCount === 0 ? (
          <Pressable
            onPress={handleAddWardrobe}
            accessibilityLabel="Add items to wardrobe"
            style={{
              backgroundColor: colors.accent.terracotta,
              borderRadius: borderRadius.pill,
              height: button.height.primary,
              alignItems: "center",
              justifyContent: "center",
              // V3: button shadow
              ...shadows.sm,
            }}
          >
            <Text
              style={{
                ...typography.button.primary,
                color: colors.text.inverse,
              }}
            >
              Add to wardrobe
            </Text>
          </Pressable>
        ) : (
          <ButtonPrimary
            label="Scan another item"
            onPress={handleScanAnother}
          />
        )}
      </View>


      {/* Store selector bottom sheet */}
      <StoreBottomSheet
        visible={showStoreSheet}
        onClose={() => setShowStoreSheet(false)}
        onSelect={setSelectedStore}
      />

      {/* Styling suggestions: add-from-wardrobe picker */}
      <Modal
        visible={showAddFromWardrobeSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddFromWardrobeSheet(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: colors.overlay.dark }}
          onPress={() => setShowAddFromWardrobeSheet(false)}
        />
        <View
          style={{
            backgroundColor: colors.bg.primary,
            borderTopLeftRadius: borderRadius.xl,
            borderTopRightRadius: borderRadius.xl,
            paddingBottom: insets.bottom + spacing.lg - spacing.xs,
          }}
        >
          <View style={{ alignItems: "center", paddingTop: spacing.sm + spacing.xs / 2, paddingBottom: spacing.md }}>
            <View style={{ width: spacing.xxl, height: spacing.xs, borderRadius: borderRadius.pill, backgroundColor: colors.border.subtle }} />
          </View>

          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
              <Text
                style={{
                  ...typography.ui.sectionTitle,
                  color: colors.text.primary,
                }}
              >
                Add from your wardrobe
              </Text>
              <Pressable
                onPress={() => setShowAddFromWardrobeSheet(false)}
                style={{
                  height: spacing.xl - 4,
                  width: spacing.xl - 4,
                  borderRadius: borderRadius.pill,
                  backgroundColor: colors.bg.secondary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={18} color={colors.text.primary} />
              </Pressable>
            </View>

            <Text
              style={{
                ...typography.ui.caption,
                color: colors.text.secondary,
                marginBottom: spacing.md,
              }}
              numberOfLines={1}
            >
              {addFromWardrobeCategory
                ? `Showing your ${getCategoryLabel(addFromWardrobeCategory)}`
                : "Pick an item to try with this"}
            </Text>

            {wardrobeItemsForAddCategory.length === 0 ? (
              <View style={{
                backgroundColor: colors.bg.secondary,
                borderRadius: borderRadius.card,
                padding: spacing.md,
              }}>
                <Text
                  style={{
                    ...typography.ui.bodyMedium,
                    color: colors.text.primary,
                  }}
                >
                  No items in this category yet
                </Text>
                <View style={{ alignSelf: "flex-start", marginTop: spacing.sm }}>
                  <ButtonTertiary
                    label="Add item"
                    onPress={() => {
                      if (addFromWardrobeCategory) {
                        router.push(`/add-item?category=${addFromWardrobeCategory}`);
                      } else {
                        router.push("/add-item");
                      }
                      setShowAddFromWardrobeSheet(false);
                    }}
                  />
                </View>
              </View>
            ) : (
              <View style={{
                backgroundColor: colors.bg.secondary,
                borderRadius: borderRadius.card,
                paddingHorizontal: spacing.md,
                paddingVertical: 8,
              }}>
                {wardrobeItemsForAddCategory.slice(0, 8).map((w, idx) => (
                  <Pressable
                    key={w.id}
                    onPress={() => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      setShowAddFromWardrobeSheet(false);
                    }}
                    style={{
                      paddingVertical: 8,
                      borderBottomWidth: idx === wardrobeItemsForAddCategory.slice(0, 8).length - 1 ? 0 : 1,
                      borderBottomColor: colors.border.subtle,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={{
                        width: spacing.xxl,
                        height: spacing.xxl,
                        borderRadius: borderRadius.image,
                        overflow: "hidden",
                        backgroundColor: colors.bg.secondary,
                      }}>
                        {w.imageUri ? (
                          <Image
                            source={{ uri: w.imageUri }}
                            style={{ width: spacing.xxl, height: spacing.xxl }}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 18 }}>🧺</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1, marginLeft: spacing.md - spacing.xs }}>
                        <Text
                          numberOfLines={1}
                          style={{
                            ...typography.ui.bodyMedium,
                            color: colors.text.primary,
                          }}
                        >
                          {capitalizeFirst(w.detectedLabel ??
                            `${(w.colors[0]?.name ?? "").toLowerCase()} ${getCategoryLabel(w.category)}`.trim())}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={{
                            ...typography.ui.caption,
                            color: colors.text.secondary,
                            marginTop: spacing.xs / 2 + 1,
                          }}
                        >
                          Tap to use this item
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Photo viewer modal */}
      <PhotoViewerModal
        visible={!!photoViewerUri}
        imageUri={photoViewerUri}
        onClose={() => {
          setPhotoViewerUri(null);
          setPhotoViewerSource(null);
        }}
      />

      {/* Tip sheet modal for "What to add first" section */}
      <TipSheetModal
        visible={!!selectedTipSheet}
        bulletKey={selectedTipSheet?.bulletKey || null}
        mode={selectedTipSheet?.mode || 'A'}
        vibe={confidenceResult.uiVibeForCopy}
        customTitle={selectedTipSheet?.title}
        targetCategory={selectedTipSheet?.targetCategory}
        scannedItem={scannedItem}
        onClose={() => setSelectedTipSheet(null)}
        wardrobeCount={wardrobeCount}
        onAddToWardrobe={() => {
          setSelectedTipSheet(null); // Close tip sheet first
          handleAddWardrobe(); // Navigate to add wardrobe flow
        }}
      />

      {/* Favorite Stores Modal */}
      <FavoriteStoresModal
        visible={showFavoriteStoresModal}
        savedStores={storePreference?.favoriteStores ?? []}
        onClose={() => {
          trackStorePrefDismissed({ method: "x" });
          setShowFavoriteStoresModal(false);
        }}
        onSave={(stores) => {
          updateStorePreference.mutate(stores, {
            onSuccess: () => {
              trackStorePrefSaved({
                storeCount: stores.length,
                stores: stores,
              });
              setShowFavoriteStoresModal(false);
              // Show confirmation toast (only if stores were actually saved)
              if (stores.length > 0) {
                setShowStoreSavedToast(true);
                setTimeout(() => setShowStoreSavedToast(false), 3000);
              }
            },
          });
        }}
      />

      {/* Store saved toast */}
      {showStoreSavedToast && (
        <Animated.View
          entering={FadeInUp.duration(300)}
          exiting={FadeOut.duration(200)}
          style={{
            position: "absolute",
            bottom: insets.bottom + 100,
            left: 24,
            right: 24,
            backgroundColor: button.primary.backgroundColor,
            borderRadius: borderRadius.image,
            paddingVertical: 14,
            paddingHorizontal: 20,
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <Text
            style={{
              ...typography.ui.bodyMedium,
              color: colors.text.inverse,
            }}
          >
            Saved. Coming soon — we'll use these to tailor suggestions.
          </Text>
        </Animated.View>
      )}

      {/* Scan saved toast */}
      {showScanSavedToast && (
        <Animated.View
          entering={FadeInUp.duration(300)}
          exiting={FadeOut.duration(200)}
          style={{
            position: "absolute",
            bottom: insets.bottom + 100,
            left: 24,
            right: 24,
            backgroundColor: button.primary.backgroundColor,
            borderRadius: borderRadius.image,
            paddingVertical: 14,
            paddingHorizontal: 20,
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <Text
            style={{
              ...typography.ui.bodyMedium,
              color: colors.text.inverse,
            }}
          >
            Scan saved
          </Text>
        </Animated.View>
      )}

      {/* Scan unsaved toast */}
      {showScanUnsavedToast && (
        <Animated.View
          entering={FadeInUp.duration(300)}
          exiting={FadeOut.duration(200)}
          style={{
            position: "absolute",
            bottom: insets.bottom + 100,
            left: 24,
            right: 24,
            backgroundColor: button.primary.backgroundColor,
            borderRadius: borderRadius.image,
            paddingVertical: 14,
            paddingHorizontal: 20,
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <Text
            style={{
              ...typography.ui.bodyMedium,
              color: colors.text.inverse,
            }}
          >
            Scan not saved
          </Text>
        </Animated.View>
      )}

      {/* Save error modal */}
      <Modal
        visible={saveError !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSaveError(null)}
      >
        <Pressable 
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center" }}
          onPress={() => setSaveError(null)}
        >
          <Pressable 
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.bg.primary,
              borderRadius: 24,
              padding: spacing.xl,
              marginHorizontal: spacing.lg,
              alignItems: "center",
              maxWidth: 320,
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
                color: colors.text.primary,
                textAlign: "center",
                marginBottom: spacing.sm,
              }}
            >
              {saveError === 'network' ? 'Connection unavailable' : "Couldn't save scan"}
            </Text>

            {/* Subtitle */}
            <Text
              style={{
                ...typography.ui.body,
                color: colors.text.secondary,
                textAlign: "center",
                marginBottom: spacing.lg,
              }}
            >
              {saveError === 'network'
                ? 'Please check your internet and try again.'
                : 'Please try again in a moment.'}
            </Text>

            {/* Primary Button */}
            <ButtonPrimary
              label="Try again"
              onPress={() => setSaveError(null)}
              style={{ width: "100%" }}
            />

            {/* Secondary Button */}
            <ButtonTertiary
              label="Close"
              onPress={() => setSaveError(null)}
              style={{ marginTop: spacing.sm }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Matches bottom sheet - shows all HIGH or NEAR core matches only */}
      {shouldRenderMatchesSheet && (
      <MatchesBottomSheet
        visible={showMatchesSheet}
        onClose={() => setShowMatchesSheet(false)}
        matches={
          matchesSheetType === "high"
            ? (confidenceResult.evaluated && confidenceResult.showMatchesSection 
                ? confidenceResult.matches.filter(m => isCoreCategory(m.wardrobeItem.category as Category)) 
                : [])
            : nearMatches.filter(m => isCoreCategory(m.wardrobeItem.category as Category))
        }
        matchType={matchesSheetType}
        scannedCategory={itemSummary.category}
        scannedItemImageUri={resolvedImageUri}
        scannedItemLabel={itemLabel}
        onItemPress={(item, index) => {
          const scannedCategory = itemSummary.category as Category;
          if (matchesSheetType === "high") {
            trackWardrobeMatchItemTapped({
              matchCategory: item.category,
              matchPosition: index,
              scannedItemCategory: scannedCategory,
              totalMatches: confidenceResult.matches.length,
            });
          }
          // Navigate to wardrobe item
          const itemId = item.id;
          router.push(`/wardrobe-item?itemId=${encodeURIComponent(String(itemId))}`);
        }}
      />
      )}
    </View>
  );
}
