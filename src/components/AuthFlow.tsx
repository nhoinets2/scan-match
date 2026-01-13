// AuthFlow.tsx - Editorial fashion-forward auth UI
import React, { useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  ImageBackground,
  Dimensions,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
  interpolate,
  useAnimatedReaction,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { Mail, Lock, Eye, EyeOff, ChevronLeft } from "lucide-react-native";
import Svg, { Path, G, Rect, Defs, ClipPath, Stop, LinearGradient as SvgLinearGradient, RadialGradient } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import BottomSheet, {
  BottomSheetView,
  BottomSheetBackgroundProps,
  BottomSheetHandleProps,
  useBottomSheetInternal,
} from "@gorhom/bottom-sheet";
import MaskedView from "@react-native-masked-view/masked-view";

import { colors, typography, spacing, button, borderRadius, shadows, motion, cards } from "@/lib/design-tokens";
import { getTextStyle } from "@/lib/typography-helpers";

// Google "G" Logo
function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill={colors.brand.google.blue}
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill={colors.brand.google.green}
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill={colors.brand.google.yellow}
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill={colors.brand.google.red}
      />
    </Svg>
  );
}

// Apple Logo
function AppleIcon({ size = 20, color = "#000" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </Svg>
  );
}

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

// Hero landing page image
const HERO_LANDING_IMAGE = require("../../assets/onboarding_screens/landing_page/landing_page.webp");

// ============================================
// CURVED GRADIENT SHEET COMPONENTS
// ============================================

// SVG mask - full rectangle so gradient covers entire sheet including handle
function CurvedMask({ width, height }: { width: number; height: number }) {
  const h = Math.max(height, 1200);
  return (
    <Svg width={width} height={h}>
      <Path d={`M 0 0 H ${width} V ${h} H 0 Z`} fill="#000" />
    </Svg>
  );
}

// Warm gradient fill with smooth curved top edge using elliptical arc
function CurvedGradientFill({ width, height }: { width: number; height: number }) {
  const h = Math.max(height, 1200);
  
  // Use elliptical arc (A command) for a naturally smooth curve
  // A rx ry x-axis-rotation large-arc-flag sweep-flag x y
  const startY = 160;           // Left edge starts here  
  const endY = 0;               // Right edge at top
  const rx = width * 1.2;       // Large horizontal radius for gentle curve
  const ry = 200;               // Vertical radius controls arc height
  
  // Path: start left, arc to right edge top, down right edge, across bottom, close
  const curvedPath = `M 0 ${startY} 
                      A ${rx} ${ry} 0 0 1 ${width} ${endY}
                      L ${width} ${h} 
                      L 0 ${h} 
                      Z`;

  return (
    <Svg width={width} height={h}>
      <Defs>
        {/* Base diagonal gradient: dark start with more Hermès orange */}
        <SvgLinearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#171717" stopOpacity={1} />
          <Stop offset="30%" stopColor="#3D322F" stopOpacity={1} />
          <Stop offset="60%" stopColor="#C45A28" stopOpacity={1} />
          <Stop offset="100%" stopColor="#E86A33" stopOpacity={1} />
        </SvgLinearGradient>

        {/* Stronger warm glow in bottom-right for more orange presence */}
        <RadialGradient id="glow" cx="85%" cy="75%" rx="80%" ry="70%">
          <Stop offset="0%" stopColor="#E86A33" stopOpacity={0.65} />
          <Stop offset="50%" stopColor="#E86A33" stopOpacity={0.35} />
          <Stop offset="100%" stopColor="#E86A33" stopOpacity={0} />
        </RadialGradient>

        {/* Subtle dust/sparkle for texture */}
        <RadialGradient id="dust" cx="75%" cy="50%" rx="40%" ry="45%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.03} />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {/* Curved gradient shape */}
      <Path d={curvedPath} fill="url(#bg)" />
      <Path d={curvedPath} fill="url(#glow)" />
      <Path d={curvedPath} fill="url(#dust)" />
    </Svg>
  );
}

// Custom BottomSheet background with asymmetric curved gradient (full-bleed)
function CurvedGradientBackground({ style }: BottomSheetBackgroundProps) {
  const sheetWidth = SCREEN_WIDTH; // Full width for edge-to-edge swoosh

  return (
    <Animated.View style={[style, { backgroundColor: "transparent" }]}>
      <MaskedView
        style={{ flex: 1 }}
        maskElement={<CurvedMask width={sheetWidth} height={1200} />}
      >
        <CurvedGradientFill width={sheetWidth} height={1200} />
      </MaskedView>
    </Animated.View>
  );
}

// Spotlight background behind mannequin (soft radial glow)
function SpotlightBg({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} style={{ position: "absolute", top: 0, left: 0 }}>
      <Defs>
        <RadialGradient id="spotlight" cx="50%" cy="22%" rx="85%" ry="75%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="70%" stopColor="#FAFAFA" stopOpacity={1} />
          <Stop offset="100%" stopColor="#F5F5F5" stopOpacity={1} />
        </RadialGradient>
      </Defs>
      <Path d={`M0 0 H${width} V${height} H0 Z`} fill="url(#spotlight)" />
    </Svg>
  );
}

// Auth content that fades in/out based on sheet position
function AuthContent({
  loading,
  props,
  handleAction,
  clearForm,
  setMode,
}: {
  loading: boolean;
  props: AuthFlowProps;
  handleAction: (action: () => Promise<void>) => void;
  clearForm: () => void;
  setMode: (mode: "landing" | "login" | "signup" | "checkEmail") => void;
}) {
  const { animatedIndex } = useBottomSheetInternal();
  const [isExpanded, setIsExpanded] = useState(false);

  // Only enable interaction when sheet is mostly expanded
  useAnimatedReaction(
    () => animatedIndex.value,
    (v) => {
      runOnJS(setIsExpanded)(v > 0.6);
    }
  );

  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(animatedIndex.value, [0, 0.75, 1], [0, 0, 1]);
    const translateY = interpolate(animatedIndex.value, [0, 1], [18, 0]);
    return { opacity, transform: [{ translateY }] };
  });

  // Handle hint animation - visible when collapsed, fades when expanded
  const hintStyle = useAnimatedStyle(() => {
    const opacity = interpolate(animatedIndex.value, [0, 0.5, 1], [1, 0.3, 0]);
    const translateY = interpolate(animatedIndex.value, [0, 1], [0, -8]);
    return { opacity, transform: [{ translateY }] };
  });

  return (
    <View style={{ flex: 1, alignSelf: "stretch" }}>
      {/* Handle UI - positioned lower to sit fully inside the gradient */}
      <View style={{ alignItems: "center", paddingTop: 48, paddingBottom: 20 }}>
        {/* Handle pill */}
        <View
          style={{
            width: 48,
            height: 5,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.45)",
          }}
        />
        {/* Swipe hint text - fades out when expanded */}
        <Animated.Text
          style={[
            {
              marginTop: 14,
              color: "rgba(255,255,255,0.85)",
              fontFamily: typography.fontFamily.medium,
              fontSize: 15,
              letterSpacing: 0.2,
            },
            hintStyle,
          ]}
        >
          Swipe up to continue
        </Animated.Text>
      </View>

      {/* Auth content - fades in when expanded, pushed down to stay inside gradient */}
      <Animated.View style={[animatedStyle, { alignSelf: "stretch", marginTop: 48 }]} pointerEvents={isExpanded ? "auto" : "none"}>
        {/* Social Login Row - Large buttons with solid white bg */}
      <View
        style={{
          flexDirection: "row",
          gap: spacing.md,
        }}
      >
        {/* Apple Sign In */}
        <View style={{ flex: 1 }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handleAction(() => props.onOAuth("apple"));
            }}
            disabled={loading || props.isAppleLoading}
            style={({ pressed }) => ({
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <View
              style={{
                height: 56,
                borderRadius: borderRadius.lg,
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
                opacity: (loading || props.isAppleLoading) ? 0.7 : 1,
              }}
            >
              {props.isAppleLoading ? (
                <ActivityIndicator color={colors.text.primary} />
              ) : (
                <AppleIcon size={24} color={colors.text.primary} />
              )}
            </View>
          </Pressable>
        </View>

        {/* Google Sign In */}
        <View style={{ flex: 1 }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              props.onGoogleSignIn();
            }}
            disabled={loading || props.isGoogleLoading}
            style={({ pressed }) => ({
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <View
              style={{
                height: 56,
                borderRadius: borderRadius.lg,
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
                opacity: (loading || props.isGoogleLoading) ? 0.7 : 1,
              }}
            >
              {props.isGoogleLoading ? (
                <ActivityIndicator color={colors.text.primary} />
              ) : (
                <GoogleIcon size={24} />
              )}
            </View>
          </Pressable>
        </View>
      </View>

      {/* Divider */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginVertical: 40,
        }}
      >
        <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.25)" }} />
        <Text
          style={{
            ...typography.ui.caption,
            color: "rgba(255,255,255,0.6)",
            paddingHorizontal: spacing.lg,
          }}
        >
          or
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.25)" }} />
      </View>

      {/* Primary CTA - Sign in with email (dark button) */}
      <Pressable
        onPress={() => {
          clearForm();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setMode("login");
        }}
        disabled={loading}
        style={({ pressed }) => ({
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        <View
          style={{
            height: 56,
            borderRadius: borderRadius.lg,
            backgroundColor: loading ? "rgba(23,23,23,0.6)" : "#1C1C1E",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              ...typography.button.primary,
              color: "#FFFFFF",
            }}
          >
            Sign in with email
          </Text>
        </View>
      </Pressable>

      {/* Create Account link */}
      <View style={{ alignItems: "center", marginTop: 36 }}>
        <Pressable
          onPress={() => {
            clearForm();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setMode("signup");
          }}
          disabled={loading}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: spacing.xs,
          }}
        >
          <Text
            style={{
              ...typography.ui.caption,
              color: "rgba(255,255,255,0.65)",
              opacity: loading ? 0.5 : 1,
            }}
          >
            New here?{" "}
          </Text>
          <Text
            style={{
              ...typography.ui.caption,
              fontFamily: typography.fontFamily.semibold,
              color: "#E07B45",
            }}
          >
            Create account
          </Text>
        </Pressable>
      </View>

      {/* Error Display */}
      {(props.googleError || props.appleError) && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={{
            backgroundColor: "rgba(200,90,84,0.25)",
            padding: spacing.md,
            borderRadius: borderRadius.sm,
            marginTop: spacing.sm,
          }}
        >
          <Text
            style={{
              ...typography.ui.caption,
              fontFamily: typography.fontFamily.medium,
              color: "#FF9B93",
              textAlign: "center",
            }}
          >
            {props.googleError?.message || props.appleError?.message}
          </Text>
        </Animated.View>
      )}

      {/* Legal Text - only visible when expanded */}
      <Text
        style={{
          ...typography.ui.micro,
          color: "rgba(255,255,255,0.55)",
          textAlign: "center",
          marginTop: 140,
          marginHorizontal: spacing.md,
        }}
      >
        By continuing, you agree to our Terms and Privacy Policy
      </Text>
      </Animated.View>
    </View>
  );
}

// Empty handle - we'll render handle UI inside the sheet content on top of gradient
function LandingHandle(_props: BottomSheetHandleProps) {
  return <View style={{ height: 0 }} />;
}

// Auth screen gradient colors - using design tokens
const GRADIENT_WARM = colors.accent.terracotta;
const GRADIENT_COOL = "#1A5DB8"; // Cool blue for gradient - intentional standalone color

type AuthMode = "landing" | "login" | "signup" | "checkEmail";
type OAuthProvider = "google" | "apple";

type AuthFlowProps = {
  onEmailSignIn: (email: string, password: string) => Promise<void>;
  onEmailSignUp: (email: string, password: string) => Promise<void>;
  onOAuth: (provider: OAuthProvider) => Promise<void>;
  onGoogleSignIn: () => void;
  onResetPassword: (email: string) => Promise<void>;
  onLogout: () => Promise<void>;
  isAuthed?: boolean;
  isAppleAuthAvailable?: boolean;
  isGoogleLoading?: boolean;
  isAppleLoading?: boolean;
  googleError?: Error | null;
  appleError?: Error | null;
};

// Animated button component with press feedback
function AnimatedButton({
  onPress,
  disabled,
  loading,
  variant = "primary",
  children,
  style,
}: {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "outline" | "social";
  children: React.ReactNode;
  style?: object;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(button.motion.pressScale, { damping: motion.easing.spring.damping, stiffness: motion.easing.spring.stiffness });
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: motion.easing.spring.damping, stiffness: motion.easing.spring.stiffness });
  };

  const getButtonStyle = () => {
    const getHeight = () => {
      if (variant === "primary") return button.height.primary;
      if (variant === "secondary") return button.height.secondary;
      return button.height.secondary; // default for outline and social
    };

    const base = {
      height: getHeight(),
      borderRadius: button.radius,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      flexDirection: "row" as const,
      gap: button.icon.gap,
    };

    if (variant === "primary") {
      return {
        ...base,
        opacity: disabled ? 0.5 : 1,
      };
    }
    if (variant === "secondary") {
      return {
        ...base,
        backgroundColor: disabled ? button.secondary.backgroundColorDisabled : button.secondary.backgroundColor,
        borderWidth: button.secondary.borderWidth,
        borderColor: disabled ? button.secondary.borderColorDisabled : button.secondary.borderColor,
      };
    }
    if (variant === "outline") {
      return {
        ...base,
        backgroundColor: button.colors.outline.bg,
        borderWidth: 1,
        borderColor: button.colors.outline.border,
        opacity: disabled ? 0.5 : 1,
      };
    }
    if (variant === "social") {
      return {
        ...base,
        backgroundColor: colors.bg.elevated,
        opacity: disabled ? 0.5 : 1,
      };
    }
    return base;
  };

  const getTextStyle = () => {
    if (variant === "primary") {
      return {
        fontFamily: typography.button.primary.fontFamily,
        fontSize: typography.button.primary.fontSize,
        lineHeight: typography.button.primary.lineHeight,
        color: disabled ? button.primary.textColorDisabled : button.primary.textColor,
      };
    }
    if (variant === "secondary") {
      return {
        fontFamily: typography.button.secondary.fontFamily,
        fontSize: typography.button.secondary.fontSize,
        lineHeight: typography.button.secondary.lineHeight,
        color: disabled ? button.secondary.textColorDisabled : button.secondary.textColor,
      };
    }
    if (variant === "outline") {
      return {
        fontFamily: typography.button.secondary.fontFamily,
        fontSize: typography.button.secondary.fontSize,
        lineHeight: typography.button.secondary.lineHeight,
        color: disabled ? button.colors.outline.textDisabled : button.colors.outline.text,
      };
    }
    if (variant === "social") {
      return {
        fontFamily: typography.button.secondary.fontFamily,
        fontSize: typography.button.secondary.fontSize,
        lineHeight: typography.button.secondary.lineHeight,
        color: colors.text.primary,
      };
    }
    // Default fallback
    return {
      fontFamily: typography.button.secondary.fontFamily,
      fontSize: typography.button.secondary.fontSize,
      lineHeight: typography.button.secondary.lineHeight,
      color: colors.text.primary,
    };
  };

  const content = (
    <Animated.View style={[getButtonStyle(), animatedStyle, style]}>
      {loading ? (
        <ActivityIndicator
          color={variant === "social" || variant === "outline" ? colors.text.primary : colors.text.inverse}
        />
      ) : (
        children
      )}
    </Animated.View>
  );

  // Wrap with gradient for primary button (standard primary - espresso/black)
  if (variant === "primary") {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
      >
        <Animated.View
          style={[
            {
              height: button.height.primary,
              borderRadius: button.radius,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: disabled ? button.primary.backgroundColorDisabled : button.primary.backgroundColor,
              opacity: disabled ? 1 : 1,
              flexDirection: "row",
              gap: button.icon.gap,
              ...shadows.sm,
            },
            animatedStyle,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={button.primary.textColor} />
          ) : (
            <Text style={getTextStyle()}>{children}</Text>
          )}
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
    >
      {typeof children === "string" ? (
        <Animated.View style={[getButtonStyle(), animatedStyle, style]}>
          {loading ? (
            <ActivityIndicator
              color={variant === "social" || variant === "outline" ? colors.text.primary : colors.text.inverse}
            />
          ) : (
            <Text style={getTextStyle()}>{children}</Text>
          )}
        </Animated.View>
      ) : (
        content
      )}
    </Pressable>
  );
}

export default function AuthFlow(props: AuthFlowProps) {
  const [mode, setMode] = useState<AuthMode>("landing");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);


  async function handleAction(action: () => Promise<void>) {
    try {
      setLoading(true);
      setError(null);
      await action();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err?.message ?? "Something went wrong");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError(null);
    if (mode === "checkEmail") {
      clearForm();
      setMode("login");
    } else {
      clearForm();
      setMode("landing");
    }
  }

  // Edge-swipe gesture for back navigation
  const startX = useSharedValue(0);
  const edgeSwipeGesture = Gesture.Pan()
    .onStart((event) => {
      startX.value = event.x; // Capture starting X position
    })
    .activeOffsetX([10, Infinity]) // Only activate on rightward swipe
    .failOffsetY([-15, 15]) // Fail if too much vertical movement
    .onEnd((event) => {
      const EDGE_THRESHOLD = 50; // Consider swipes from left edge (first 50px)
      const SWIPE_THRESHOLD = 100; // Minimum swipe distance
      const VELOCITY_THRESHOLD = 500; // Minimum velocity for quick swipes

      // Check if swipe started from left edge and moved right
      if (
        startX.value < EDGE_THRESHOLD &&
        (event.translationX > SWIPE_THRESHOLD || event.velocityX > VELOCITY_THRESHOLD)
      ) {
        runOnJS(goBack)();
      }
    });

  function clearForm() {
    setEmail("");
    setPassword("");
    setPassword2("");
    setShowPw(false);
    setError(null);
    setEmailError(null);
    setPasswordError(null);
    setTouched({ email: false, password: false });
  }

  // Email validation
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  // Password validation
  const isValidPassword = (password: string): boolean => {
    return password.length >= 8;
  };

  // Validation error states
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [touched, setTouched] = React.useState({ email: false, password: false });

  // Bottom sheet refs and values - must be at top level (before any early returns)
  const { height: screenHeight } = Dimensions.get("window");
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["26%", "55%"], []); // 26% shows dramatic swoosh with less overlay, 55% shows auth

  // Validate on blur
  const validateEmail = () => {
    if (!touched.email) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError("Email is required");
    } else if (!isValidEmail(trimmedEmail)) {
      setEmailError("Please enter a valid email");
    } else {
      setEmailError(null);
    }
  };

  const validatePassword = () => {
    if (!touched.password) return;
    if (!password) {
      setPasswordError("Password is required");
    } else if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
    } else {
      setPasswordError(null);
    }
  };

  // Run validation when email or password changes
  React.useEffect(() => {
    if (touched.email) validateEmail();
  }, [email, touched.email]);

  React.useEffect(() => {
    if (touched.password) validatePassword();
  }, [password, touched.password]);

  const canLogin = isValidEmail(email) && password.length >= 6 && !emailError;
  const canSignup = isValidEmail(email) && isValidPassword(password) && !emailError && !passwordError;

  // If user is logged in, show logout screen
  if (props.isAuthed) {
    return (
      <View style={{ flex: 1 }}>
        <ImageBackground
          source={{
            uri: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=800&q=80",
          }}
          style={{ flex: 1 }}
          blurRadius={25}
        >
          {/* Dark overlay for readability */}
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: colors.overlay.light,
            }}
          />
          <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
            <SafeAreaView style={{ flex: 1 }}>
              <View
                style={{
                  flex: 1,
                  paddingHorizontal: spacing.lg,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                {/* Header */}
                <Animated.View
                  entering={FadeInDown.duration(500)}
                  style={{ alignItems: "center", marginBottom: spacing.xl }}
                >
                  <Text
                    style={{
                      fontFamily: "BodoniModa_600SemiBold",
                      fontSize: 22,
                      lineHeight: 30,
                      color: colors.text.primary,
                      textAlign: "center",
                      marginBottom: spacing.xs,
                    }}
                  >
                    You're signed in
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Inter_400Regular",
                      fontSize: 14,
                      color: colors.text.secondary,
                      textAlign: "center",
                      maxWidth: 260,
                      lineHeight: 20,
                    }}
                  >
                    Sign out to switch accounts
                  </Text>
                </Animated.View>

                {/* Glass Card */}
                <Animated.View
                  entering={FadeInDown.delay(150).duration(500)}
                  style={{
                    backgroundColor: colors.bg.elevated,
                    borderRadius: borderRadius.card,
                    padding: spacing.lg,
                    borderWidth: 1,
                    borderColor: colors.border.subtle,
                    width: "100%",
                  }}
                >
                  {/* Sign Out Button */}
                  <Pressable
                    onPress={() => handleAction(() => props.onLogout())}
                    disabled={loading}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.9 : 1,
                    })}
                  >
                    <View
                      style={{
                        height: 56,
                        borderRadius: borderRadius.pill,
                        backgroundColor: colors.state.destructiveBg,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {loading ? (
                        <ActivityIndicator color={colors.state.destructive} />
                      ) : (
                        <Text
                          style={{
                            fontFamily: "Inter_600SemiBold",
                            fontSize: 16,
                            color: colors.state.destructive,
                          }}
                        >
                          Sign out
                        </Text>
                      )}
                    </View>
                  </Pressable>
                </Animated.View>
              </View>
            </SafeAreaView>
          </View>
        </ImageBackground>
      </View>
    );
  }

  // ============================================
  // LANDING SCREEN - Bottom Sheet with snap points
  // ============================================
  // Note: bottomSheetRef, snapPoints, screenHeight are declared at top of component

  // Dynamic values tied to sheet height
  const collapsedPx = Math.round(screenHeight * 0.32);
  const textBottom = collapsedPx + 28;           // keeps text above the peek
  const bgFadeHeight = collapsedPx + 100;        // blends image into bg behind sheet

  if (mode === "landing") {
    return (
          <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        {/* Brand Header */}
        <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.bg.primary }}>
            <Animated.View
            entering={FadeInDown.duration(500)}
              style={{
              paddingVertical: spacing.md,
                alignItems: "center",
              }}
            >
                    <Text
                      style={{
                        fontFamily: "BodoniModa_700Bold",
                fontSize: 24,
                        color: colors.text.primary,
                        letterSpacing: 0.5,
                      }}
                    >
                      Scan & Match
                  </Text>
                </Animated.View>
        </SafeAreaView>

        {/* Hero Image Background with Spotlight */}
        <View style={{ flex: 1, overflow: "hidden" }}>
          {/* Spotlight radial gradient behind mannequin */}
          <SpotlightBg width={SCREEN_WIDTH} height={screenHeight} />
          
          <Image
            source={HERO_LANDING_IMAGE}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }}
            resizeMode="cover"
          />

          {/* 1) Contrast gradient for white text readability */}
                <LinearGradient
            pointerEvents="none"
            colors={[
              "rgba(23,23,23,0.00)",
              "rgba(23,23,23,0.10)",
              "rgba(23,23,23,0.55)",
            ]}
            locations={[0, 0.65, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />

          {/* 2) Fade image into app background where sheet sits */}
                  <LinearGradient
            pointerEvents="none"
            colors={["rgba(250,250,250,0.00)", "rgba(250,250,250,1.00)"]}
            locations={[0, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: 0,
              height: bgFadeHeight,
            }}
          />

          {/* Subtle scrim behind headline for better readability */}
          <LinearGradient
            pointerEvents="none"
            colors={[
              "rgba(0,0,0,0.0)",
              "rgba(0,0,0,0.08)",
              "rgba(0,0,0,0.12)",
              "rgba(0,0,0,0.08)",
              "rgba(0,0,0,0.0)",
            ]}
            locations={[0, 0.2, 0.5, 0.8, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: textBottom - 20,
              height: 220,
            }}
          />

          {/* Hero Text - positioned above sheet */}
          <Animated.View
            entering={FadeInDown.duration(600).delay(200)}
            style={{
              position: "absolute",
              left: spacing.lg,
              right: spacing.lg,
              bottom: textBottom + 16,
            }}
          >
            <Text
              style={{
                fontFamily: "BodoniModa_700Bold",
                fontSize: 48,
                lineHeight: 52,
                color: colors.text.inverse,
                textAlign: "center",
                textShadowColor: "rgba(0,0,0,0.15)",
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 8,
              }}
            >
              Match{"\n"}Before{"\n"}You Buy
            </Text>
            <Text
              style={{
                ...typography.ui.body,
                color: "rgba(255,255,255,0.88)",
                textAlign: "center",
                marginTop: spacing.md,
                textShadowColor: "rgba(0,0,0,0.25)",
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 4,
              }}
            >
              Scan an item. See how{"\n"}it works with your wardrobe.
            </Text>
          </Animated.View>
            </View>

        {/* Curved Gradient Bottom Sheet (full-bleed) */}
        <BottomSheet
          ref={bottomSheetRef}
          index={0}
          snapPoints={snapPoints}
          enablePanDownToClose={false}
          backgroundComponent={CurvedGradientBackground}
          handleComponent={LandingHandle}
        >
          <BottomSheetView style={{ backgroundColor: "transparent", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg }}>
            {/* Auth Content - Fades in when expanded */}
            <AuthContent
              loading={loading}
              props={props}
              handleAction={handleAction}
              clearForm={clearForm}
              setMode={setMode}
            />
          </BottomSheetView>
        </BottomSheet>
      </View>
    );
  }

  // ============================================
  // LOGIN SCREEN - Elegant glass card design
  // ============================================
  if (mode === "login") {
    return (
      <View style={{ flex: 1 }}>
        <ImageBackground
          source={{
            uri: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=800&q=80",
          }}
          style={{ flex: 1 }}
          blurRadius={25}
        >
          {/* Dark overlay for readability */}
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: colors.overlay.light,
            }}
          />
          <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
            <SafeAreaView style={{ flex: 1 }}>
              <GestureDetector gesture={edgeSwipeGesture}>
              <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.select({ ios: "padding", android: undefined })}
              >
                  <View style={{ flex: 1, paddingBottom: spacing.xs }}>
                  <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
                  {/* Back Button */}
                  <Pressable
                    onPress={goBack}
                      hitSlop={spacing.md}
                    style={{ marginBottom: spacing.xl }}
                  >
                      <ChevronLeft size={spacing.xl - spacing.xs} color={colors.text.primary} />
                  </Pressable>

                  {/* Header - Centered, minimal */}
                  <Animated.View
                    entering={FadeInDown.duration(500)}
                    style={{ alignItems: "center", marginBottom: spacing.lg }}
                  >
                    <Text
                      style={{
                          ...typography.display.screenTitle,
                        color: colors.text.primary,
                        textAlign: "center",
                        marginBottom: spacing.xs,
                      }}
                    >
                      Welcome back
                    </Text>
                    <Text
                      style={{
                          ...typography.ui.label,
                        color: colors.text.secondary,
                        textAlign: "center",
                          maxWidth: spacing.xxl * 5 + spacing.md + spacing.xs,
                      }}
                    >
                      Sign in to access your account.
                    </Text>
                  </Animated.View>

                  {/* Glass Card Form */}
                  <Animated.View
                    entering={FadeInDown.delay(150).duration(500)}
                    style={{
                      backgroundColor: colors.bg.elevated,
                      borderRadius: borderRadius.card,
                      padding: spacing.md,
                      borderWidth: 1,
                      borderColor: colors.border.subtle,
                    }}
                  >
                    {/* Email Input */}
                    <View style={{ marginBottom: spacing.md }}>
                      <Text
                        style={{
                          ...typography.ui.label,
                          color: colors.text.primary,
                          marginBottom: spacing.xs,
                        }}
                      >
                        Email
                      </Text>
                      <View
                        style={{
                          height: button.height.secondary,
                          borderRadius: borderRadius.input,
                          backgroundColor: colors.bg.secondary,
                          paddingHorizontal: spacing.md,
                          justifyContent: "center",
                          borderWidth: 1,
                          borderColor: emailError ? colors.state.destructive : colors.border.hairline,
                        }}
                      >
                        <TextInput
                          value={email}
                          onChangeText={setEmail}
                          onBlur={() => {
                            setTouched({ ...touched, email: true });
                            validateEmail();
                          }}
                          placeholder="you@email.com"
                          placeholderTextColor={colors.text.tertiary}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          editable={!loading}
                          style={{
                            fontFamily: typography.ui.body.fontFamily,
                            fontSize: typography.ui.body.fontSize,
                            color: colors.text.primary,
                          }}
                        />
                      </View>
                      {emailError && (
                        <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: spacing.xs }}>
                          <Text
                            style={{
                              ...typography.ui.caption,
                              color: colors.state.destructive,
                            }}
                          >
                            {emailError}
                          </Text>
                        </Animated.View>
                      )}
                    </View>

                    {/* Password Input */}
                    <View style={{ marginBottom: 0 }}>
                      <Text
                        style={{
                          ...typography.ui.label,
                          color: colors.text.primary,
                          marginBottom: spacing.xs,
                        }}
                      >
                        Password
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
                        }}
                      >
                        <TextInput
                          value={password}
                          onChangeText={setPassword}
                          placeholder="Enter password"
                          placeholderTextColor={colors.text.tertiary}
                          secureTextEntry={!showPw}
                          autoCapitalize="none"
                          editable={!loading}
                          style={{
                            flex: 1,
                            fontFamily: typography.ui.body.fontFamily,
                            fontSize: typography.ui.body.fontSize,
                            color: colors.text.primary,
                          }}
                        />
                        <Pressable onPress={() => setShowPw(!showPw)} hitSlop={spacing.sm + spacing.xs} disabled={loading}>
                          {showPw ? (
                            <EyeOff size={typography.ui.caption.fontSize + spacing.sm} color={colors.text.tertiary} />
                          ) : (
                            <Eye size={typography.ui.caption.fontSize + spacing.sm} color={colors.text.tertiary} />
                          )}
                        </Pressable>
                      </View>
                      
                      {/* Forgot Password - Under password field */}
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push("/reset-password");
                        }}
                        style={{
                          alignSelf: "flex-start",
                          marginTop: spacing.xs,
                        }}
                        disabled={loading}
                      >
                        <Text
                          style={{
                            ...typography.ui.caption,
                            color: colors.accent.terracotta,
                            opacity: loading ? 0.5 : 1,
                          }}
                        >
                          Forgot password?
                        </Text>
                      </Pressable>
                    </View>

                    {/* Error - Subtle, not shouting */}
                    {error && (
                      <Animated.View
                        entering={FadeIn.duration(200)}
                        style={{
                          backgroundColor: colors.bg.elevated,
                          padding: spacing.md,
                          borderRadius: borderRadius.input,
                          marginTop: spacing.sm,
                        }}
                      >
                        <Text
                          style={{
                            ...typography.ui.caption,
                            fontFamily: typography.fontFamily.medium,
                            color: colors.state.destructive,
                          }}
                        >
                          {error}
                        </Text>
                      </Animated.View>
                    )}
                  </Animated.View>

                  {/* Sign In Button */}
                  <Animated.View
                    entering={FadeInDown.delay(180).duration(500)}
                    style={{ marginTop: spacing.md }}
                  >
                    <AnimatedButton
                      variant="primary"
                      onPress={() => handleAction(() => props.onEmailSignIn(email.trim(), password))}
                      disabled={!canLogin || loading}
                    >
                      Sign in
                    </AnimatedButton>
                  </Animated.View>

                  {/* Social Login Divider */}
                  <Animated.View
                    entering={FadeInDown.delay(200).duration(500)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: spacing.lg,
                      paddingHorizontal: spacing.xl,
                    }}
                  >
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border.hairline }} />
                    <Text
                      style={{
                        ...typography.ui.caption,
                        color: colors.text.tertiary,
                        paddingHorizontal: spacing.md,
                      }}
                    >
                      or
                    </Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border.hairline }} />
                  </Animated.View>

                  {/* Social Login Buttons */}
                  <Animated.View
                    entering={FadeInDown.delay(250).duration(500)}
                    style={{ gap: spacing.md, marginTop: spacing.lg }}
                  >
                    <View style={{ flexDirection: "row", gap: spacing.md }}>
                    {/* Apple Sign In */}
                    <View style={{ flex: 1 }}>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          handleAction(() => props.onOAuth("apple"));
                        }}
                        disabled={loading || props.isAppleLoading}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.9 : 1,
                        })}
                      >
                        <View
                          style={{
                            height: 56,
                            borderRadius: borderRadius.lg,
                            backgroundColor: "#FFFFFF",
                            alignItems: "center",
                            justifyContent: "center",
                            borderWidth: 1,
                            borderColor: colors.border.hairline,
                            opacity: (loading || props.isAppleLoading) ? 0.7 : 1,
                          }}
                        >
                          {props.isAppleLoading ? (
                            <ActivityIndicator color={colors.text.primary} />
                          ) : (
                            <AppleIcon size={24} color={colors.text.primary} />
                          )}
                        </View>
                      </Pressable>
                    </View>

                    {/* Google Sign In */}
                    <View style={{ flex: 1 }}>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          props.onGoogleSignIn();
                        }}
                        disabled={loading || props.isGoogleLoading}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.9 : 1,
                        })}
                      >
                        <View
                          style={{
                            height: 56,
                            borderRadius: borderRadius.lg,
                            backgroundColor: "#FFFFFF",
                            alignItems: "center",
                            justifyContent: "center",
                            borderWidth: 1,
                            borderColor: colors.border.hairline,
                            opacity: (loading || props.isGoogleLoading) ? 0.7 : 1,
                          }}
                        >
                          {props.isGoogleLoading ? (
                            <ActivityIndicator color={colors.text.primary} />
                          ) : (
                            <GoogleIcon size={24} />
                          )}
                        </View>
                      </Pressable>
                    </View>
                    </View>
                  </Animated.View>

                  {/* Secondary Action - Very soft */}
                  <Animated.View
                    entering={FadeInDown.delay(300).duration(500)}
                    style={{
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      marginTop: spacing.lg,
                    }}
                  >
                    <Pressable
                      onPress={() => {
                        clearForm();
                        setMode("signup");
                      }}
                      disabled={loading}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                            ...typography.ui.label,
                          color: colors.text.secondary,
                          opacity: loading ? 0.5 : 1,
                        }}
                      >
                        New here?{" "}
                      </Text>
                      <Text
                        style={{
                            ...typography.ui.label,
                            fontFamily: typography.fontFamily.semibold,
                          color: colors.accent.terracotta,
                          opacity: loading ? 0.5 : 1,
                        }}
                      >
                        Create account
                      </Text>
                    </Pressable>
                  </Animated.View>
                  </View>

                  {/* Spacer - minimal gap to keep legal at bottom */}
                  <View style={{ flex: 1, minHeight: spacing.sm }} />

                  {/* Legal Text - Outside the card */}
                    <Text
                      style={{
                      ...typography.ui.micro,
                        color: colors.text.tertiary,
                        textAlign: "center",
                      marginTop: spacing.md,
                      marginHorizontal: spacing.lg,
                      paddingBottom: spacing.xs,
                      }}
                    >
                      By continuing, you agree to our Terms and Privacy Policy
                    </Text>
                </View>
              </KeyboardAvoidingView>
              </GestureDetector>
            </SafeAreaView>
          </View>
        </ImageBackground>
      </View>
    );
  }

  // ============================================
  // SIGNUP SCREEN - Elegant glass card design
  // ============================================
  if (mode === "signup") {
    return (
      <View style={{ flex: 1 }}>
        <ImageBackground
          source={{
            uri: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=800&q=80",
          }}
          style={{ flex: 1 }}
          blurRadius={25}
        >
          {/* Dark overlay for readability */}
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: colors.overlay.light,
            }}
          />
          <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
            <SafeAreaView style={{ flex: 1 }}>
              <GestureDetector gesture={edgeSwipeGesture}>
              <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.select({ ios: "padding", android: undefined })}
              >
                  <View style={{ flex: 1, paddingBottom: spacing.xs }}>
                  <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
                  {/* Back Button */}
                  <Pressable
                    onPress={goBack}
                      hitSlop={spacing.md}
                    style={{ marginBottom: spacing.xl }}
                  >
                      <ChevronLeft size={spacing.xl} color={colors.text.primary} />
                  </Pressable>

                  {/* Header - Centered, minimal */}
                  <Animated.View
                    entering={FadeInDown.duration(500)}
                    style={{ alignItems: "center", marginBottom: spacing.lg }}
                  >
                    <Text
                      style={{
                          ...typography.display.screenTitle,
                        color: colors.text.primary,
                        textAlign: "center",
                        marginBottom: spacing.xs,
                      }}
                    >
                      Create your account
                    </Text>
                    <Text
                      style={{
                          ...typography.ui.label,
                        color: colors.text.secondary,
                        textAlign: "center",
                          maxWidth: spacing.xxl * 5 + spacing.md + spacing.xs,
                      }}
                    >
                      So we can save your scans and wardrobe.
                    </Text>
                  </Animated.View>

                  {/* Glass Card Form */}
                  <Animated.View
                    entering={FadeInDown.delay(150).duration(500)}
                    style={{
                      backgroundColor: colors.bg.elevated,
                      borderRadius: borderRadius.card,
                        padding: spacing.md,
                      borderWidth: 1,
                      borderColor: colors.border.subtle,
                    }}
                  >
                    {/* Email Input */}
                    <View style={{ marginBottom: spacing.md }}>
                      <Text
                        style={{
                            ...typography.ui.label,
                          color: colors.text.primary,
                          marginBottom: spacing.xs,
                        }}
                      >
                        Email
                      </Text>
                      <View
                        style={{
                            height: button.height.secondary,
                            borderRadius: borderRadius.input,
                          backgroundColor: colors.bg.secondary,
                          paddingHorizontal: spacing.md,
                          justifyContent: "center",
                          borderWidth: 1,
                          borderColor: emailError ? colors.state.destructive : colors.border.hairline,
                        }}
                      >
                        <TextInput
                          value={email}
                          onChangeText={setEmail}
                          onBlur={() => {
                            setTouched({ ...touched, email: true });
                            validateEmail();
                          }}
                          placeholder="you@email.com"
                          placeholderTextColor={colors.text.tertiary}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          editable={!loading}
                          style={{
                            fontFamily: typography.ui.body.fontFamily,
                            fontSize: typography.ui.body.fontSize,
                            color: colors.text.primary,
                          }}
                        />
                      </View>
                      {emailError && (
                        <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: spacing.xs }}>
                          <Text
                            style={{
                              ...typography.ui.caption,
                              color: colors.state.destructive,
                            }}
                          >
                            {emailError}
                          </Text>
                        </Animated.View>
                      )}
                    </View>

                    {/* Password Input */}
                    <View style={{ marginBottom: 0 }}>
                      <Text
                        style={{
                          ...typography.ui.label,
                          color: colors.text.primary,
                          marginBottom: spacing.xs,
                        }}
                      >
                        Password
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
                          borderColor: passwordError ? colors.state.destructive : colors.border.hairline,
                        }}
                      >
                        <TextInput
                          value={password}
                          onChangeText={setPassword}
                          onBlur={() => {
                            setTouched({ ...touched, password: true });
                            validatePassword();
                          }}
                          placeholder="At least 8 characters"
                          placeholderTextColor={colors.text.tertiary}
                          secureTextEntry={!showPw}
                          autoCapitalize="none"
                          editable={!loading}
                          style={{
                            flex: 1,
                            fontFamily: typography.ui.body.fontFamily,
                            fontSize: typography.ui.body.fontSize,
                            color: colors.text.primary,
                          }}
                        />
                        <Pressable onPress={() => setShowPw(!showPw)} hitSlop={spacing.sm} disabled={loading}>
                          {showPw ? (
                            <EyeOff size={button.icon.size} color={colors.text.tertiary} />
                          ) : (
                            <Eye size={button.icon.size} color={colors.text.tertiary} />
                          )}
                        </Pressable>
                      </View>
                      {passwordError && (
                        <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: spacing.xs }}>
                          <Text
                            style={{
                              ...typography.ui.caption,
                              color: colors.state.destructive,
                            }}
                          >
                            {passwordError}
                          </Text>
                        </Animated.View>
                      )}
                    </View>

                    {/* Error - Subtle, not shouting */}
                    {error && (
                      <Animated.View
                        entering={FadeIn.duration(200)}
                        style={{
                          backgroundColor: colors.bg.elevated,
                          padding: spacing.md,
                          borderRadius: borderRadius.input,
                          marginTop: spacing.sm,
                        }}
                      >
                        <Text
                          style={{
                            ...typography.ui.caption,
                            fontFamily: typography.fontFamily.medium,
                            color: colors.state.destructive,
                          }}
                        >
                          {error}
                        </Text>
                      </Animated.View>
                    )}
                  </Animated.View>

                  {/* Create Account Button */}
                  <Animated.View
                    entering={FadeInDown.delay(180).duration(500)}
                    style={{ marginTop: spacing.md }}
                  >
                    <AnimatedButton
                      variant="primary"
                      onPress={() =>
                        handleAction(async () => {
                          await props.onEmailSignUp(email.trim(), password);
                          setMode("checkEmail");
                        })
                      }
                      disabled={!canSignup || loading}
                    >
                      Create account
                    </AnimatedButton>
                  </Animated.View>

                  {/* Social Login Divider */}
                  <Animated.View
                    entering={FadeInDown.delay(200).duration(500)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: spacing.lg,
                      paddingHorizontal: spacing.xl,
                    }}
                  >
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border.hairline }} />
                    <Text
                      style={{
                        ...typography.ui.caption,
                        color: colors.text.tertiary,
                        paddingHorizontal: spacing.md,
                      }}
                    >
                      or
                    </Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.border.hairline }} />
                  </Animated.View>

                  {/* Social Login Buttons */}
                  <Animated.View
                    entering={FadeInDown.delay(250).duration(500)}
                    style={{ gap: spacing.md, marginTop: spacing.lg }}
                  >
                    <View style={{ flexDirection: "row", gap: spacing.md }}>
                    {/* Apple Sign In */}
                    <View style={{ flex: 1 }}>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          handleAction(() => props.onOAuth("apple"));
                        }}
                        disabled={loading || props.isAppleLoading}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.9 : 1,
                        })}
                      >
                        <View
                          style={{
                            height: 56,
                            borderRadius: borderRadius.lg,
                            backgroundColor: "#FFFFFF",
                            alignItems: "center",
                            justifyContent: "center",
                            borderWidth: 1,
                            borderColor: colors.border.hairline,
                            opacity: (loading || props.isAppleLoading) ? 0.7 : 1,
                          }}
                        >
                          {props.isAppleLoading ? (
                            <ActivityIndicator color={colors.text.primary} />
                          ) : (
                            <AppleIcon size={24} color={colors.text.primary} />
                          )}
                        </View>
                      </Pressable>
                    </View>

                    {/* Google Sign In */}
                    <View style={{ flex: 1 }}>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          props.onGoogleSignIn();
                        }}
                        disabled={loading || props.isGoogleLoading}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.9 : 1,
                        })}
                      >
                        <View
                          style={{
                            height: 56,
                            borderRadius: borderRadius.lg,
                            backgroundColor: "#FFFFFF",
                            alignItems: "center",
                            justifyContent: "center",
                            borderWidth: 1,
                            borderColor: colors.border.hairline,
                            opacity: (loading || props.isGoogleLoading) ? 0.7 : 1,
                          }}
                        >
                          {props.isGoogleLoading ? (
                            <ActivityIndicator color={colors.text.primary} />
                          ) : (
                            <GoogleIcon size={24} />
                          )}
                        </View>
                      </Pressable>
                    </View>
                    </View>
                  </Animated.View>

                  {/* Secondary Action - Very soft */}
                  <Animated.View
                    entering={FadeInDown.delay(300).duration(500)}
                    style={{
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      marginTop: spacing.lg,
                    }}
                  >
                    <Pressable
                      onPress={() => {
                        clearForm();
                        setMode("login");
                      }}
                      disabled={loading}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                            ...typography.ui.label,
                          color: colors.text.secondary,
                            opacity: loading ? 0.5 : 1,
                        }}
                      >
                        Already have an account?{" "}
                      </Text>
                      <Text
                        style={{
                            ...typography.ui.label,
                            fontFamily: typography.fontFamily.semibold,
                          color: colors.accent.terracotta,
                            opacity: loading ? 0.5 : 1,
                        }}
                      >
                        Sign in
                      </Text>
                    </Pressable>
                  </Animated.View>
                  </View>

                  {/* Spacer - minimal gap to keep legal at bottom */}
                  <View style={{ flex: 1, minHeight: spacing.sm }} />

                  {/* Legal Text - Outside the card */}
                    <Text
                      style={{
                      ...typography.ui.micro,
                        color: colors.text.tertiary,
                        textAlign: "center",
                      marginTop: spacing.md,
                      marginHorizontal: spacing.lg,
                      paddingBottom: spacing.xs,
                      }}
                    >
                      By continuing, you agree to our Terms and Privacy Policy
                    </Text>
                </View>
              </KeyboardAvoidingView>
              </GestureDetector>
            </SafeAreaView>
          </View>
        </ImageBackground>
      </View>
    );
  }

  // ============================================
  // CHECK EMAIL SCREEN
  // ============================================
  if (mode === "checkEmail") {
    return (
      <View style={{ flex: 1 }}>
        <ImageBackground
          source={{
            uri: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=800&q=80",
          }}
          style={{ flex: 1 }}
          blurRadius={12}
        >
          <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
            <SafeAreaView style={{ flex: 1 }}>
              <View
                style={{
                  flex: 1,
                  padding: spacing.lg,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Animated.View entering={FadeIn.duration(500)} style={{ alignItems: "center" }}>
                  <View
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: borderRadius.card,
                      backgroundColor: colors.surface.icon,
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: spacing.lg,
                    }}
                  >
                    <Mail size={36} color={colors.accent.terracotta} />
                  </View>

                  <Text
                    style={{
                      fontFamily: "Inter_600SemiBold",
                      fontSize: typography.sizes.h1,
                      color: colors.text.primary,
                      textAlign: "center",
                      marginBottom: spacing.sm,
                    }}
                  >
                    Check your email
                  </Text>

                  <Text
                    style={{
                      fontFamily: "Inter_400Regular",
                      fontSize: typography.sizes.body,
                      color: colors.text.secondary,
                      textAlign: "center",
                      lineHeight: 22,
                      paddingHorizontal: spacing.lg,
                      marginBottom: spacing.xl,
                    }}
                  >
                    We sent a link to{"\n"}
                    <Text style={{ fontFamily: "Inter_500Medium", color: colors.text.primary }}>
                      {email.trim()}
                    </Text>
                  </Text>

                  <AnimatedButton
                    variant="social"
                    onPress={() => {
                      clearForm();
                      setMode("login");
                    }}
                    style={{ paddingHorizontal: spacing.xl * 2 }}
                  >
                    <Text
                      style={{
                        fontFamily: "Inter_600SemiBold",
                        fontSize: typography.sizes.body,
                        color: colors.text.primary,
                      }}
                    >
                      Back to sign in
                    </Text>
                  </AnimatedButton>
                </Animated.View>
              </View>
            </SafeAreaView>
          </View>
        </ImageBackground>
      </View>
    );
  }

  return null;
}
