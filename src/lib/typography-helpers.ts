/**
 * Typography Helpers
 * 
 * Safe utilities for using the typography system.
 * Prevents common pitfalls like mixing fontWeight with custom fonts.
 */

import { TextStyle } from "react-native";
import { typography } from "@/lib/design-tokens";

// ============================================
// TYPE-SAFE STYLE GETTER
// ============================================

/**
 * Get text style from design tokens.
 * Returns explicit fontSize and lineHeight (no multipliers).
 * 
 * ⚠️ NEVER add fontWeight to the returned style - it will break on Android.
 * Custom fonts must use fontFamily variants (e.g., Inter_600SemiBold).
 * 
 * @example
 * // Good:
 * <Text style={getTextStyle('h2')}>Section Title</Text>
 * 
 * // Good (with color):
 * <Text style={getTextStyle('body', '#FF0000')}>Red text</Text>
 * 
 * // Good (with overrides):
 * <Text style={[getTextStyle('body'), { textAlign: 'center' }]}>Centered</Text>
 * 
 * // BAD (will break on Android):
 * <Text style={[getTextStyle('body'), { fontWeight: '600' }]}>Bold</Text>
 * 
 * // Instead, use button style or specific font family:
 * <Text style={getTextStyle('button')}>Bold CTA</Text>
 */
export function getTextStyle(
  style: keyof typeof typography.styles,
  color?: string
): TextStyle {
  const baseStyle = typography.styles[style];
  
  // Dev-only validation
  if (__DEV__) {
    validateTextStyle(baseStyle);
  }
  
  const result: TextStyle = {
    fontFamily: baseStyle.fontFamily,
    fontSize: baseStyle.fontSize,
    lineHeight: baseStyle.lineHeight,
  };
  
  if (color) {
    result.color = color;
  }
  
  return result;
}

// ============================================
// FONT LOADING GUARD
// ============================================

/**
 * Check if custom fonts are loaded.
 * Use this in your root layout to prevent flash of unstyled text (FOUT).
 * 
 * IMPORTANT: Keep splash visible until fonts load, then hide it.
 * 
 * @example
 * // In app/_layout.tsx:
 * import * as SplashScreen from 'expo-splash-screen';
 * 
 * // Prevent auto-hide
 * SplashScreen.preventAutoHideAsync();
 * 
 * export default function RootLayout() {
 *   const [fontsLoaded, fontError] = useFonts({
 *     Inter_400Regular,
 *     Inter_500Medium,
 *     Inter_600SemiBold,
 *     BodoniModa_600SemiBold,
 *     BodoniModa_700Bold,
 *   });
 * 
 *   useEffect(() => {
 *     if (fontsLoaded || fontError) {
 *       SplashScreen.hideAsync();
 *     }
 *   }, [fontsLoaded, fontError]);
 * 
 *   // Don't render until fonts are ready
 *   if (!fontsLoaded && !fontError) {
 *     return null;  // Splash stays visible
 *   }
 * 
 *   return <Stack />;
 * }
 */
export const REQUIRED_FONTS = [
  "Inter_400Regular",
  "Inter_500Medium",
  "Inter_600SemiBold",
  "BodoniModa_600SemiBold",
  "BodoniModa_700Bold",
] as const;

// ============================================
// VALIDATION (DEV ONLY)
// ============================================

/**
 * Validate that a style object doesn't mix fontWeight with custom fonts.
 * This function is a NO-OP in production (dev-only validation).
 * 
 * ⚠️ DEV-ONLY: Errors won't appear in production logs.
 * 
 * @example
 * if (__DEV__) {
 *   validateTextStyle({ fontFamily: 'BodoniModa_700Bold', fontWeight: '600' });
 *   // Console error: "Don't mix fontWeight with custom fonts"
 * }
 */
export function validateTextStyle(style: TextStyle): void {
  // Early return in production (no-op)
  if (!__DEV__) return;
  
  if (style.fontFamily && style.fontWeight) {
    console.error(
      "[Typography] ⚠️ MIXING fontWeight WITH CUSTOM fontFamily",
      "\nThis will break on Android!",
      "\nStyle:", style,
      "\n\nFix: Remove fontWeight and use fontFamily variants:",
      "\n  - Inter_400Regular (not fontWeight: '400')",
      "\n  - Inter_500Medium (not fontWeight: '500')",
      "\n  - Inter_600SemiBold (not fontWeight: '600')",
      "\n  - BodoniModa_600SemiBold (not fontWeight: '600')",
      "\n  - BodoniModa_700Bold (not fontWeight: '700')"
    );
  }
  
  // Warn if using Bodoni Moda at <20px
  if (
    style.fontFamily?.startsWith("BodoniModa") &&
    style.fontSize &&
    style.fontSize < 20
  ) {
    console.warn(
      "[Typography] ⚠️ BODONI MODA AT SMALL SIZE",
      "\nBodoni Moda should only be used at ≥20px.",
      "\nStyle:", style,
      "\n\nFix: Use Inter for text <20px:",
      "\n  - Inter_600SemiBold (not Bodoni Moda at 16px)"
    );
  }
}

// ============================================
// COMMON PATTERNS
// ============================================

/**
 * Get a text style with color override.
 * Useful for themed text.
 * 
 * @deprecated Use getTextStyle(style, color) instead
 */
export function getTextStyleWithColor(
  style: keyof typeof typography.styles,
  color: string
): TextStyle {
  return getTextStyle(style, color);
}

/**
 * Get a heading style (h1 or h2).
 * Both use Bodoni Moda SemiBold at ≥20px.
 */
export function getHeadingStyle(
  level: "h1" | "h2"
): TextStyle {
  return getTextStyle(level);
}

/**
 * Get a body style (regular or medium weight).
 * Always uses Inter at 15px.
 */
export function getBodyStyle(
  weight: "regular" | "medium" = "regular"
): TextStyle {
  if (weight === "medium") {
    return {
      ...getTextStyle("body"),
      fontFamily: typography._internal.bodyMedium.fontFamily,
    };
  }
  return getTextStyle("body");
}

// ============================================
// LEGACY SUPPORT (DEPRECATED)
// ============================================

/**
 * @deprecated Use getTextStyle('h3') instead
 * Subsection headers (16px) should use Inter, not exported as h3.
 */
export function getH3Style(): TextStyle {
  return {
    fontFamily: typography._internal.h3.fontFamily,
    fontSize: typography._internal.h3.fontSize,
    lineHeight: typography._internal.h3.lineHeight,
  };
}

/**
 * @deprecated Use getTextStyle('caption') instead
 * Meta text is just smaller caption text.
 */
export function getMetaStyle(): TextStyle {
  return {
    fontFamily: typography._internal.meta.fontFamily,
    fontSize: typography._internal.meta.fontSize,
    lineHeight: typography._internal.meta.lineHeight,
  };
}

// ============================================
// EXPORTS
// ============================================

export default {
  getTextStyle,
  getTextStyleWithColor,
  getHeadingStyle,
  getBodyStyle,
  validateTextStyle,
  REQUIRED_FONTS,
};

