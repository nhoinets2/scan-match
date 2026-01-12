// ============================================
// SNAPTOMATCH DESIGN SYSTEM V3
// Single Source of Truth - Do NOT use hardcoded values
// ============================================

// ============================================
// COLOR PALETTE ()
// ============================================

export const colors = {
  // Backgrounds (Off-white system for clean, editorial look)
  bg: {
    primary: "#FAFAFA",      // Off-white - main app background
    secondary: "#FFFFFF",    // Pure white - cards, elevated elements
    tertiary: "#F5F5F5",     // Light gray - grouped controls, inset cards
    elevated: "#FFFFFF",     // Pure white for tab bar, modals
  },

  // Text
  text: {
    primary: "#171717",      // Near black - main text, headings
    secondary: "#737373",    // Medium gray - subtitles, helper text
    tertiary: "#A3A3A3",     // Light gray - placeholder text, hints
    inverse: "#FFFFFF",      // White text on dark backgrounds
    link: "#C56A3A",         // Terracotta - text links only
  },

  // Borders
  border: {
    hairline: "#E5E5E5",     // Subtle dividers, card borders
    subtle: "#D4D4D4",       // Slightly darker for emphasis
  },

  // Accents
  accent: {
    brass: "#C6A26B",        // Muted brass - badges, highlights, selected states
    terracotta: "#C56A3A",   // Warm terracotta - CTAs, icons, wardrobe actions
    brassLight: "rgba(198, 162, 107, 0.15)", // Brass tint for backgrounds
    terracottaLight: "rgba(197, 106, 58, 0.12)", // Terracotta tint
    secondary: "#C6A26B",    // Alias for brass (legacy)
  },

  // Semantic/Status Colors
  verdict: {
    great: {
      bg: "#EEF6F0",
      text: "#1E6F4C",
    },
    okay: {
      bg: "#F6F3EA",
      text: "#7A5B14",
    },
    risky: {
      bg: "#F3EDEE",
      text: "#7B2E2E",
    },
    context: {
      bg: "#F2F3F5",
      text: "#4B5563",
    },
  },

  // UI States
  state: {
    pressed: "rgba(23, 23, 23, 0.08)",   // Updated for new text.primary
    disabled: "rgba(23, 23, 23, 0.4)",   // Updated for new text.primary
    destructive: "#C85A54",       // Sign out, delete actions
    destructiveBg: "#FEF2F2",     // Light red background
  },

  // Overlays
  overlay: {
    dark: "rgba(0, 0, 0, 0.5)",      // Modal backgrounds
    light: "rgba(255, 255, 255, 0.4)", // Reduced opacity for cleaner look
  },

  // Status/Debug Colors (for dev tools, status indicators)
  status: {
    success: "#22C55E",           // Green - success states
    successBg: "#DCFCE7",         // Light green background
    warning: "#F59E0B",           // Amber - warnings
    warningBg: "#FEF3C7",         // Light amber background
    error: "#EF4444",             // Red - errors
    errorBg: "#FEE2E2",           // Light red background
    info: "#3B82F6",              // Blue - info states
    infoBg: "#DBEAFE",            // Light blue background
  },

  // Brand Colors (external platforms - do not change)
  brand: {
    google: {
      blue: "#4285F4",
      green: "#34A853",
      yellow: "#FBBC05",
      red: "#EA4335",
    },
    apple: "#000000",
    facebook: "#1877F2",
  },

  // Surface colors (icon backgrounds, etc.)
  surface: {
    icon: "#F5F5F5", // Icon button backgrounds (matches bg.tertiary)
  },

} as const;

// ============================================
// TYPOGRAPHY SYSTEM
// ============================================
// Rule: Bodoni = display/titles ONLY, Inter = everything else

export const typography = {
  // Font Families
  fontFamily: {
    // Display Serif (Bodoni) - brand + hero moments ONLY
    display: "BodoniModa_600SemiBold",
    displayBold: "BodoniModa_700Bold",
    
    // UI Sans (Inter) - everything interactive + everything small
    regular: "Inter_400Regular",
    medium: "Inter_500Medium",
    semibold: "Inter_600SemiBold",
  },

  // ============================================
  // SEMANTIC TYPOGRAPHY ROLES
  // Use ONLY these roles - don't create ad-hoc styles
  // ============================================
  
  // DISPLAY STYLES (Bodoni - headlines only)
  display: {
    // Hero headlines (Home hero card, onboarding)
    hero: {
      fontFamily: "BodoniModa_700Bold",
      fontSize: 36,
      lineHeight: 42,  // ~115%
      letterSpacing: -0.2,
    },
    // Screen titles ("Your matches", "Wardrobe", "Saved")
    screenTitle: {
      fontFamily: "BodoniModa_600SemiBold",
      fontSize: 28,
      lineHeight: 34,  // ~120%
      letterSpacing: 0,
    },
  },

  // UI STYLES (Inter - everything else)
  ui: {
    // Section headers ("Matches from your wardrobe")
    sectionTitle: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 18,
      lineHeight: 24,  // ~133%
    },
    // Card titles, list item titles
    cardTitle: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 16,
      lineHeight: 22,
    },
    // Paragraphs, explanations
    body: {
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      lineHeight: 22,  // ~147%
    },
    // Body with emphasis
    bodyMedium: {
      fontFamily: "Inter_500Medium",
      fontSize: 15,
      lineHeight: 22,
    },
    // Chips, small headings, list metadata
    label: {
      fontFamily: "Inter_500Medium",
      fontSize: 14,
      lineHeight: 20,  // ~143%
    },
    // Helper text, footnotes
    caption: {
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      lineHeight: 16,  // ~133%
    },
    // Badges only (keep short)
    micro: {
      fontFamily: "Inter_500Medium",
      fontSize: 11,
      lineHeight: 14,
      letterSpacing: 0.2,
    },
  },

  // BUTTON TYPOGRAPHY (Inter always - never Bodoni)
  button: {
    primary: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 16,
      lineHeight: 22,
    },
    secondary: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 16,
      lineHeight: 22,
    },
    tertiary: {
      fontFamily: "Inter_500Medium",
      fontSize: 14,
      lineHeight: 20,
    },
  },

  // TAB BAR (Inter)
  tabBar: {
    label: {
      fontFamily: "Inter_500Medium",
      fontSize: 11,
      lineHeight: 14,
    },
  },

  // SEGMENT CONTROL (Inter)
  segment: {
    label: {
      fontFamily: "Inter_500Medium",
      fontSize: 14,
      lineHeight: 20,
    },
  },

  // ============================================
  // LEGACY MAPPINGS (for backward compatibility)
  // Migrate to semantic roles above
  // ============================================
  styles: {
    h1: {
      fontFamily: "BodoniModa_600SemiBold",
      fontSize: 28,
      lineHeight: 34,
    },
    h2: {
      fontFamily: "BodoniModa_600SemiBold",
      fontSize: 20,
      lineHeight: 26,
    },
    body: {
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      lineHeight: 22,
    },
    caption: {
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      lineHeight: 16,
    },
    button: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 16,
      lineHeight: 22,
    },
  },

  // ============================================
  // LEGACY SIZE MAPPINGS (for backward compatibility)
  // ============================================
  sizes: {
    h1: 28,
    h2: 20,
    h3: 16,
    body: 15,
    caption: 12,
    meta: 11,
  },

  lineHeight: {
    tight: 1.2,
    normal: 1.47,
    relaxed: 1.6,
  },

  // ============================================
  // INTERNAL STYLES (DEPRECATED - for legacy code only)
  // New code should use typography.display.* or typography.ui.*
  // ============================================
  _internal: {
    bodyMedium: {
      fontFamily: "Inter_500Medium",
      fontSize: 15,
      lineHeight: 22,
    },
    h3: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 16,
      lineHeight: 22,
    },
    meta: {
      fontFamily: "Inter_400Regular",
      fontSize: 11,
      lineHeight: 14,
    },
    displayMd: {
      fontFamily: "BodoniModa_600SemiBold",
      fontSize: 24,
      lineHeight: 30,
    },
  },
} as const;

// ============================================
// SPACING SYSTEM (8pt grid)
// ============================================

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// ============================================
// BORDER RADIUS SYSTEM
// ============================================

export const borderRadius = {
  none: 0,
  sm: 8,           // Small elements
  md: 16,          // Row cards, smaller containers
  lg: 20,          // Standard cards
  xl: 24,          // Hero cards, large containers (default for cards)
  xxl: 32,         // Extra large elements
  pill: 999,       // Buttons, pills, avatars
  
  // Semantic aliases
  card: 24,        // Standard cards use this
  heroCard: 36,    // Hero cards (larger, feels special)
  button: 999,     // All buttons are pills
  input: 12,       // Form inputs
  chip: 999,       // Chips and tags
  image: 16,       // Image containers
} as const;

// ============================================
// SHADOW SYSTEM
// ============================================

export const shadows = {
  // No shadow
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  
  // Subtle shadow (cards, containers)
  sm: {
    shadowColor: "#171717",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  
  // Medium shadow (elevated cards, dropdowns)
  md: {
    shadowColor: "#171717",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  
  // Large shadow (modals, hero cards)
  lg: {
    shadowColor: "#171717",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

// ============================================
// CARD SYSTEM (4 tiers - Border-first philosophy)
// ============================================
// Standard cards = border-first (crisp, editorial on white)
// Elevated cards = shadow-only (key callouts, modals)

export const cards = {
  // HERO - Brand moments, gradient backgrounds
  hero: {
    borderRadius: borderRadius.heroCard,
    ...shadows.lg,
    gradient: {
      // Dramatic 4-stop gradient: dark → warm brown → deep orange → Hermès orange
      colors: ["#171717", "#3D322F", "#C45A28", "#E86A33"],
      locations: [0, 0.3, 0.6, 1],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
  },
  
  // CTA SHELF - Glass panel inside hero for auth actions
  ctaShelf: {
    backgroundColor: "rgba(255, 255, 255, 0.86)",
    borderRadius: borderRadius.lg,  // 20 - smaller than hero 36
    borderWidth: 1,
    borderColor: colors.border.hairline,
    ...shadows.none,  // border-first philosophy
    padding: spacing.md,
  },
  
  // STANDARD - Border-first, no shadow (feature tiles, list rows, grid items)
  standard: {
    borderRadius: borderRadius.xl,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.hairline,
    ...shadows.none, // ✅ Key change: no shadow for border-first
  },
  
  // ELEVATED - Shadow-only, no border (verdict card, auth panel, key callouts)
  elevated: {
    borderRadius: borderRadius.xl,
    backgroundColor: colors.bg.secondary,
    borderWidth: 0,
    borderColor: "transparent",
    ...shadows.md,
  },
  
  // INSET - Quiet grouping, no border/shadow (section wrappers)
  inset: {
    borderRadius: borderRadius.lg,
    backgroundColor: colors.bg.tertiary,
    borderWidth: 0,
    ...shadows.none,
  },
  
  // STATES - Official press/select feedback (prevents per-component improvisation)
  states: {
    pressedBg: "#F5F5F5",                    // Use this, not random colors
    pressedOverlay: "rgba(23, 23, 23, 0.08)", // colors.state.pressed
    selectedBorder: colors.border.subtle,
  },
} as const;

// Legacy glass surfaces (only use on image backgrounds, not solid UI)
export const glass = {
  card: "rgba(255, 255, 255, 0.85)",
  cardPressed: "rgba(255, 255, 255, 0.7)",
} as const;

// ============================================
// BUTTON SYSTEM (CTA Hierarchy)
// ============================================

export const button = {
  // Shape
  radius: 999,  // Pill-shaped buttons
  
  // Dimensions
  height: {
    primary: 52,
    secondary: 52,
    tertiary: 40,
  },
  paddingX: {
    primary: 24,
    secondary: 24,
    tertiary: 16,
  },
  
  // Border (legacy)
  border: {
    width: 0,
    color: "transparent",
  },
  
  // Shadow
  shadow: {
    color: "#171717",
    offset: { width: 0, height: 2 },
    opacity: 0.04,
    radius: 8,
    elevation: 2,
  },
  
  // Text styles (legacy - for existing components)
  text: {
    primary: { font: "Inter_600SemiBold", size: 16 },
    secondary: { font: "Inter_600SemiBold", size: 16 },
    tertiary: { font: "Inter_500Medium", size: 14 },
  },
  
  // Icon specs
  icon: {
    size: 18,
    gap: 8,  // Gap between icon and text
  },
  
  // Motion
  motion: {
    pressScale: 0.97,
    duration: 150,
  },

  // ============================================
  // PRIMARY CTA (P1) - "do the main thing"
  // Fill: Off-black (matches tab bar capsule), Text: White
  // ============================================
  primary: {
    backgroundColor: "#1A1A1A",                // Off-black (aligned with tab bar)
    backgroundColorPressed: "#0D0D0D",         // Darker
    backgroundColorDisabled: "rgba(26, 26, 26, 0.45)",
    textColor: "#FFFFFF",                      // White
    textColorDisabled: "rgba(255, 255, 255, 0.5)",
    borderRadius: borderRadius.pill,
    borderWidth: 0,
    ...shadows.sm,
  },

  // Primary Inverse (for dark backgrounds like hero card)
  primaryInverse: {
    backgroundColor: "#FFFFFF",                // White
    backgroundColorPressed: "#F5F5F5",         // Light gray
    backgroundColorDisabled: "rgba(255, 255, 255, 0.45)",
    textColor: colors.text.primary,            // Near-black
    textColorDisabled: "rgba(23, 23, 23, 0.5)",
    borderRadius: borderRadius.pill,
    borderWidth: 0,
    ...shadows.sm,
  },

  // ============================================
  // SECONDARY CTA (P2) - "alternative action"
  // Fill: White, Border: Hairline
  // ============================================
  secondary: {
    backgroundColor: colors.bg.secondary,      // White #FFFFFF
    backgroundColorPressed: "#F5F5F5",         // Light gray
    backgroundColorDisabled: "rgba(255, 255, 255, 0.45)",
    textColor: colors.text.primary,            // Near-black
    textColorDisabled: "rgba(23, 23, 23, 0.4)",
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    borderColor: colors.border.hairline,
    borderColorDisabled: "rgba(229, 229, 229, 0.5)",
    ...shadows.none,
  },

  // ============================================
  // TERTIARY CTA (P3) - "lightweight / navigational"
  // Text link style, no container
  // ============================================
  tertiary: {
    backgroundColor: "transparent",
    backgroundColorPressed: "transparent",
    textColor: colors.accent.terracotta,       // Terracotta #C56A3A
    textColorPressed: "rgba(197, 106, 58, 0.7)",
    textColorDisabled: "rgba(197, 106, 58, 0.4)",
    borderRadius: 0,
    borderWidth: 0,
  },

  // ============================================
  // LEGACY COLORS (for existing components)
  // Updated to match off-black system (aligned with tab bar)
  // ============================================
  colors: {
    primary: {
      bg: "#1A1A1A",
      bgPressed: "#0D0D0D",
      bgDisabled: "rgba(26,26,26,0.45)",
      text: "#FFFFFF",
      textDisabled: "rgba(255,255,255,0.5)",
      border: "transparent",
      borderDisabled: "transparent",
    },
    secondary: {
      bg: "#FFFFFF",
      bgPressed: "#F5F5F5",
      bgDisabled: "rgba(255,255,255,0.45)",
      text: "#171717",
      textDisabled: "rgba(23,23,23,0.4)",
      border: "#E5E5E5",
      borderDisabled: "rgba(229,229,229,0.5)",
    },
    tertiary: {
      text: "#C56A3A",
      textOnDark: "rgba(255,255,255,0.85)",
      textPressed: "rgba(197,106,58,0.7)",
      textDisabled: "rgba(197,106,58,0.4)",
    },
    outline: {
      bg: "transparent",
      bgPressed: "rgba(23,23,23,0.05)",
      text: "#171717",
      textDisabled: "rgba(23,23,23,0.4)",
      border: "#E5E5E5",
    },
    // Destructive (delete account, sign out, etc.)
    destructive: {
      bg: "#1A1A1A",                     // Off-black (same as primary)
      bgPressed: "#0D0D0D",              // Darker
      bgDisabled: "rgba(26,26,26,0.45)",
      text: colors.text.inverse,         // White
      textDisabled: "rgba(255,255,255,0.5)",
      border: "transparent",
    },
  },
} as const;

// ============================================
// ICON CONTAINERS
// ============================================

export const iconContainer = {
  // Brass container (compatibility moments)
  brass: {
    backgroundColor: colors.accent.brassLight,
    borderRadius: borderRadius.md,
    size: 40,
    iconColor: colors.accent.brass,
  },
  
  // Terracotta container (wardrobe actions)
  terracotta: {
    backgroundColor: colors.accent.terracottaLight,
    borderRadius: borderRadius.md,
    size: 40,
    iconColor: colors.accent.terracotta,
  },
  
  // Neutral container
  neutral: {
    backgroundColor: colors.bg.tertiary,
    borderRadius: borderRadius.md,
    size: 40,
    iconColor: colors.text.secondary,
  },
} as const;

// ============================================
// TAB BAR (Capsule Style)
// ============================================

export const tabBar = {
  // Capsule container
  capsule: {
    backgroundColor: "#1A1A1A",           // Off-black
    height: 72,
    horizontalMargin: 20,
    borderRadius: borderRadius.pill,
  },
  
  // Icon circles
  iconCircle: {
    size: 48,
    activeBackground: "#E07A3A",          // Hermès-style orange
    inactiveBackground: "rgba(255, 255, 255, 0.08)",
    inactiveBorderColor: "rgba(255, 255, 255, 0.12)",
    inactiveBorderWidth: 1,
  },
  
  // Icons
  icon: {
    size: 22,
    activeColor: "#1A1A1A",               // Dark icon on orange bg
    inactiveColor: "rgba(255, 255, 255, 0.6)",  // Soft white
    activeStrokeWidth: 2,
    inactiveStrokeWidth: 1.5,
  },
  
  // Legacy (for backward compatibility)
  height: 72,
  backgroundColor: "#1A1A1A",
  borderTopWidth: 0,
  borderTopColor: "transparent",
  
  label: {
    activeColor: colors.text.primary,
    inactiveColor: colors.text.secondary,
  },
} as const;

// ============================================
// SEGMENTED CONTROL
// ============================================

export const segmentedControl = {
  container: {
    backgroundColor: colors.bg.tertiary,
    borderRadius: borderRadius.pill,
    padding: 4,
    height: 48,
  },
  
  segment: {
    borderRadius: borderRadius.pill,
    paddingHorizontal: 16,
  },
  
  selected: {
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.hairline,
    ...shadows.sm,
    // Brass indicator
    indicatorColor: colors.accent.brass,
    indicatorHeight: 2,
  },
  
  unselected: {
    backgroundColor: "transparent",
    textColor: colors.text.secondary,
  },
} as const;

// ============================================
// COMPONENT SPECS (Legacy - use specific systems above)
// ============================================

export const components = {
  card: {
    borderRadius: borderRadius.card,
    padding: spacing.md,
  },
  image: {
    borderRadius: borderRadius.image,
  },
  verdictCard: {
    borderRadius: borderRadius.card,
    padding: spacing.md,
  },
  wardrobeItem: {
    imageSize: 80,
    imageBorderRadius: borderRadius.image,
  },
} as const;

// ============================================
// MOTION / ANIMATION
// ============================================

export const motion = {
  // Durations
  duration: {
    instant: 100,
    fast: 150,
    normal: 250,
    slow: 400,
  },
  
  // Easing
  easing: {
    default: "ease-out",
    spring: { damping: 15, stiffness: 150 },
  },
  
  // Press feedback
  press: {
    scale: 0.97,
    opacity: 0.92,
  },
} as const;

// ============================================
// TYPE EXPORTS
// ============================================

export type Colors = typeof colors;
export type Typography = typeof typography;
export type Spacing = typeof spacing;
export type BorderRadius = typeof borderRadius;
export type Shadows = typeof shadows;
export type Cards = typeof cards;
export type Button = typeof button;

// ============================================
// HELPER: Get text style (for convenience)
// ============================================

type DisplayStyleKey = keyof typeof typography.display;
type UIStyleKey = keyof typeof typography.ui;

export function getTextStyle(
  role: DisplayStyleKey | UIStyleKey,
  color?: string
) {
  const style =
    role in typography.display
      ? typography.display[role as DisplayStyleKey]
      : typography.ui[role as UIStyleKey];
  
  return {
    ...style,
    color: color ?? colors.text.primary,
  };
}
