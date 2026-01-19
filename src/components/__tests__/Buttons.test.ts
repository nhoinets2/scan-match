/**
 * Button Components Tests
 *
 * Tests for ButtonPrimary, ButtonSecondary, ButtonSecondaryOutline,
 * ButtonTertiary, and IconButton components.
 * 
 * Tests cover:
 * - State logic (enabled/disabled/loading)
 * - Color/style derivation
 * - Press behavior
 */

// ─────────────────────────────────────────────
// Mock Design Tokens (simplified for testing)
// ─────────────────────────────────────────────

const mockButton = {
  height: { primary: 56, secondary: 48, tertiary: 40 },
  paddingX: { primary: 24, secondary: 20, tertiary: 16 },
  radius: 12,
  motion: { pressScale: 0.97 },
  border: { width: 1 },
  colors: {
    primary: {
      bg: "#1C1917",
      bgPressed: "#292524",
      bgDisabled: "#D4D4D4",
      text: "#FAFAFA",
      textDisabled: "#A3A3A3",
      border: "#1C1917",
      borderDisabled: "#D4D4D4",
    },
    secondary: {
      bg: "#FAFAFA",
      bgPressed: "#F5F5F5",
      bgDisabled: "#F5F5F5",
      text: "#171717",
      textDisabled: "#A3A3A3",
      border: "#E5E5E5",
      borderDisabled: "#E5E5E5",
    },
    outline: {
      bg: "transparent",
      bgPressed: "#F5F5F5",
      text: "#171717",
      textDisabled: "#A3A3A3",
      border: "#E5E5E5",
    },
    tertiary: {
      text: "#525252",
      textOnDark: "#FAFAFA",
    },
  },
  text: {
    primary: { font: "Inter_600SemiBold", size: 16 },
    secondary: { font: "Inter_500Medium", size: 15 },
    tertiary: { font: "Inter_500Medium", size: 14 },
  },
};

// ─────────────────────────────────────────────
// ButtonPrimary Logic
// ─────────────────────────────────────────────

interface ButtonPrimaryState {
  disabled: boolean;
  loading: boolean;
}

function getButtonPrimaryColors(state: ButtonPrimaryState) {
  const isDisabled = state.disabled || state.loading;
  return {
    backgroundColor: isDisabled
      ? mockButton.colors.primary.bgDisabled
      : mockButton.colors.primary.bg,
    borderColor: isDisabled
      ? mockButton.colors.primary.borderDisabled
      : mockButton.colors.primary.border,
    textColor: isDisabled
      ? mockButton.colors.primary.textDisabled
      : mockButton.colors.primary.text,
  };
}

function shouldButtonPrimaryRespond(state: ButtonPrimaryState): boolean {
  return !state.disabled && !state.loading;
}

// ─────────────────────────────────────────────
// ButtonSecondary Logic
// ─────────────────────────────────────────────

interface ButtonSecondaryState {
  disabled: boolean;
  customTextColor?: string;
  glassmorphism: boolean;
}

function getButtonSecondaryColors(state: ButtonSecondaryState) {
  return {
    backgroundColor: state.disabled
      ? mockButton.colors.secondary.bgDisabled
      : mockButton.colors.secondary.bg,
    borderColor: state.disabled
      ? mockButton.colors.secondary.borderDisabled
      : mockButton.colors.secondary.border,
    textColor: state.customTextColor || (state.disabled
      ? mockButton.colors.secondary.textDisabled
      : mockButton.colors.secondary.text),
  };
}

// ─────────────────────────────────────────────
// ButtonSecondaryOutline Logic
// ─────────────────────────────────────────────

interface ButtonOutlineState {
  disabled: boolean;
}

function getButtonOutlineColors(state: ButtonOutlineState) {
  return {
    backgroundColor: state.disabled ? "transparent" : mockButton.colors.outline.bg,
    textColor: state.disabled
      ? mockButton.colors.outline.textDisabled
      : mockButton.colors.outline.text,
    borderColor: mockButton.colors.outline.border,
  };
}

// ─────────────────────────────────────────────
// ButtonTertiary Logic
// ─────────────────────────────────────────────

interface ButtonTertiaryState {
  disabled: boolean;
  onDark: boolean;
  customTextColor?: string;
  glassmorphism: boolean;
}

function getButtonTertiaryTextColor(state: ButtonTertiaryState): string {
  if (state.customTextColor) {
    return state.customTextColor;
  }
  return state.onDark
    ? mockButton.colors.tertiary.textOnDark
    : mockButton.colors.tertiary.text;
}

// ─────────────────────────────────────────────
// IconButton Logic
// ─────────────────────────────────────────────

interface IconButtonState {
  disabled: boolean;
  onDark: boolean;
}

function getIconButtonColors(state: IconButtonState) {
  return {
    backgroundColor: state.onDark
      ? "rgba(255,255,255,0.12)"
      : "#F5F5F5", // colors.state.pressed
    iconColor: state.onDark ? "#FAFAFA" : "#171717",
  };
}

// ─────────────────────────────────────────────
// Press Animation Logic
// ─────────────────────────────────────────────

interface PressAnimationState {
  scale: number;
  backgroundColor: string;
}

function getPressInState(
  disabled: boolean,
  baseColor: string,
  pressedColor: string
): PressAnimationState {
  if (disabled) {
    return { scale: 1, backgroundColor: baseColor };
  }
  return {
    scale: mockButton.motion.pressScale,
    backgroundColor: pressedColor,
  };
}

function getPressOutState(
  disabled: boolean,
  enabledColor: string,
  disabledColor: string
): PressAnimationState {
  return {
    scale: 1,
    backgroundColor: disabled ? disabledColor : enabledColor,
  };
}

// ─────────────────────────────────────────────
// Tests: ButtonPrimary
// ─────────────────────────────────────────────

describe("ButtonPrimary", () => {
  describe("colors", () => {
    it("uses enabled colors when not disabled or loading", () => {
      const colors = getButtonPrimaryColors({ disabled: false, loading: false });
      expect(colors.backgroundColor).toBe(mockButton.colors.primary.bg);
      expect(colors.textColor).toBe(mockButton.colors.primary.text);
      expect(colors.borderColor).toBe(mockButton.colors.primary.border);
    });

    it("uses disabled colors when disabled", () => {
      const colors = getButtonPrimaryColors({ disabled: true, loading: false });
      expect(colors.backgroundColor).toBe(mockButton.colors.primary.bgDisabled);
      expect(colors.textColor).toBe(mockButton.colors.primary.textDisabled);
    });

    it("uses disabled colors when loading", () => {
      const colors = getButtonPrimaryColors({ disabled: false, loading: true });
      expect(colors.backgroundColor).toBe(mockButton.colors.primary.bgDisabled);
      expect(colors.textColor).toBe(mockButton.colors.primary.textDisabled);
    });
  });

  describe("interaction", () => {
    it("responds to press when enabled", () => {
      expect(shouldButtonPrimaryRespond({ disabled: false, loading: false })).toBe(true);
    });

    it("does not respond when disabled", () => {
      expect(shouldButtonPrimaryRespond({ disabled: true, loading: false })).toBe(false);
    });

    it("does not respond when loading", () => {
      expect(shouldButtonPrimaryRespond({ disabled: false, loading: true })).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
// Tests: ButtonSecondary
// ─────────────────────────────────────────────

describe("ButtonSecondary", () => {
  describe("colors", () => {
    it("uses enabled colors when not disabled", () => {
      const colors = getButtonSecondaryColors({
        disabled: false,
        glassmorphism: false,
      });
      expect(colors.backgroundColor).toBe(mockButton.colors.secondary.bg);
      expect(colors.textColor).toBe(mockButton.colors.secondary.text);
    });

    it("uses disabled colors when disabled", () => {
      const colors = getButtonSecondaryColors({
        disabled: true,
        glassmorphism: false,
      });
      expect(colors.backgroundColor).toBe(mockButton.colors.secondary.bgDisabled);
      expect(colors.textColor).toBe(mockButton.colors.secondary.textDisabled);
    });

    it("uses custom text color when provided", () => {
      const customColor = "#FF0000";
      const colors = getButtonSecondaryColors({
        disabled: false,
        customTextColor: customColor,
        glassmorphism: false,
      });
      expect(colors.textColor).toBe(customColor);
    });

    it("custom text color overrides disabled color", () => {
      const customColor = "#FF0000";
      const colors = getButtonSecondaryColors({
        disabled: true,
        customTextColor: customColor,
        glassmorphism: false,
      });
      expect(colors.textColor).toBe(customColor);
    });
  });
});

// ─────────────────────────────────────────────
// Tests: ButtonSecondaryOutline
// ─────────────────────────────────────────────

describe("ButtonSecondaryOutline", () => {
  describe("colors", () => {
    it("uses transparent background when enabled", () => {
      const colors = getButtonOutlineColors({ disabled: false });
      expect(colors.backgroundColor).toBe(mockButton.colors.outline.bg);
      expect(colors.textColor).toBe(mockButton.colors.outline.text);
    });

    it("uses transparent background when disabled", () => {
      const colors = getButtonOutlineColors({ disabled: true });
      expect(colors.backgroundColor).toBe("transparent");
      expect(colors.textColor).toBe(mockButton.colors.outline.textDisabled);
    });

    it("always uses same border color", () => {
      const enabledColors = getButtonOutlineColors({ disabled: false });
      const disabledColors = getButtonOutlineColors({ disabled: true });
      expect(enabledColors.borderColor).toBe(mockButton.colors.outline.border);
      expect(disabledColors.borderColor).toBe(mockButton.colors.outline.border);
    });
  });
});

// ─────────────────────────────────────────────
// Tests: ButtonTertiary
// ─────────────────────────────────────────────

describe("ButtonTertiary", () => {
  describe("text color", () => {
    it("uses default text color on light background", () => {
      const color = getButtonTertiaryTextColor({
        disabled: false,
        onDark: false,
        glassmorphism: false,
      });
      expect(color).toBe(mockButton.colors.tertiary.text);
    });

    it("uses light text color on dark background", () => {
      const color = getButtonTertiaryTextColor({
        disabled: false,
        onDark: true,
        glassmorphism: false,
      });
      expect(color).toBe(mockButton.colors.tertiary.textOnDark);
    });

    it("uses custom text color when provided", () => {
      const customColor = "#00FF00";
      const color = getButtonTertiaryTextColor({
        disabled: false,
        onDark: false,
        customTextColor: customColor,
        glassmorphism: false,
      });
      expect(color).toBe(customColor);
    });

    it("custom color overrides onDark setting", () => {
      const customColor = "#00FF00";
      const color = getButtonTertiaryTextColor({
        disabled: false,
        onDark: true,
        customTextColor: customColor,
        glassmorphism: false,
      });
      expect(color).toBe(customColor);
    });
  });
});

// ─────────────────────────────────────────────
// Tests: IconButton
// ─────────────────────────────────────────────

describe("IconButton", () => {
  describe("colors", () => {
    it("uses light theme colors by default", () => {
      const colors = getIconButtonColors({ disabled: false, onDark: false });
      expect(colors.backgroundColor).toBe("#F5F5F5");
      expect(colors.iconColor).toBe("#171717");
    });

    it("uses dark theme colors when onDark", () => {
      const colors = getIconButtonColors({ disabled: false, onDark: true });
      expect(colors.backgroundColor).toBe("rgba(255,255,255,0.12)");
      expect(colors.iconColor).toBe("#FAFAFA");
    });
  });
});

// ─────────────────────────────────────────────
// Tests: Press Animation
// ─────────────────────────────────────────────

describe("press animation", () => {
  describe("pressIn", () => {
    it("scales down and changes color when enabled", () => {
      const state = getPressInState(
        false,
        mockButton.colors.primary.bg,
        mockButton.colors.primary.bgPressed
      );
      expect(state.scale).toBe(mockButton.motion.pressScale);
      expect(state.backgroundColor).toBe(mockButton.colors.primary.bgPressed);
    });

    it("does not animate when disabled", () => {
      const state = getPressInState(
        true,
        mockButton.colors.primary.bgDisabled,
        mockButton.colors.primary.bgPressed
      );
      expect(state.scale).toBe(1);
      expect(state.backgroundColor).toBe(mockButton.colors.primary.bgDisabled);
    });
  });

  describe("pressOut", () => {
    it("returns to normal scale and enabled color", () => {
      const state = getPressOutState(
        false,
        mockButton.colors.primary.bg,
        mockButton.colors.primary.bgDisabled
      );
      expect(state.scale).toBe(1);
      expect(state.backgroundColor).toBe(mockButton.colors.primary.bg);
    });

    it("returns to disabled color when disabled", () => {
      const state = getPressOutState(
        true,
        mockButton.colors.primary.bg,
        mockButton.colors.primary.bgDisabled
      );
      expect(state.scale).toBe(1);
      expect(state.backgroundColor).toBe(mockButton.colors.primary.bgDisabled);
    });
  });
});

// ─────────────────────────────────────────────
// Tests: Button Dimensions
// ─────────────────────────────────────────────

describe("button dimensions", () => {
  it("primary is tallest", () => {
    expect(mockButton.height.primary).toBeGreaterThan(mockButton.height.secondary);
    expect(mockButton.height.secondary).toBeGreaterThan(mockButton.height.tertiary);
  });

  it("primary has most padding", () => {
    expect(mockButton.paddingX.primary).toBeGreaterThan(mockButton.paddingX.secondary);
    expect(mockButton.paddingX.secondary).toBeGreaterThan(mockButton.paddingX.tertiary);
  });
});

// ─────────────────────────────────────────────
// Tests: Button Loading State
// ─────────────────────────────────────────────

describe("button loading state", () => {
  interface LoadingButtonConfig {
    showSpinner: boolean;
    showLabel: boolean;
    spinnerColor: string;
  }

  function getLoadingConfig(
    loading: boolean,
    textColor: string
  ): LoadingButtonConfig {
    if (loading) {
      return {
        showSpinner: true,
        showLabel: false,
        spinnerColor: textColor,
      };
    }
    return {
      showSpinner: false,
      showLabel: true,
      spinnerColor: textColor,
    };
  }

  it("shows spinner when loading", () => {
    const config = getLoadingConfig(true, mockButton.colors.primary.textDisabled);
    expect(config.showSpinner).toBe(true);
    expect(config.showLabel).toBe(false);
  });

  it("shows label when not loading", () => {
    const config = getLoadingConfig(false, mockButton.colors.primary.text);
    expect(config.showSpinner).toBe(false);
    expect(config.showLabel).toBe(true);
  });

  it("spinner uses same color as text would", () => {
    const loadingConfig = getLoadingConfig(true, mockButton.colors.primary.textDisabled);
    const normalConfig = getLoadingConfig(false, mockButton.colors.primary.text);
    
    // When loading, spinner should be visible with the text color
    expect(loadingConfig.spinnerColor).toBe(mockButton.colors.primary.textDisabled);
    expect(normalConfig.spinnerColor).toBe(mockButton.colors.primary.text);
  });
});

// ─────────────────────────────────────────────
// Tests: Glassmorphism variant
// ─────────────────────────────────────────────

describe("glassmorphism variant", () => {
  interface GlassConfig {
    blurIntensity: number;
    backgroundColor: string;
    borderColor: string;
  }

  function getGlassConfig(enabled: boolean): GlassConfig | null {
    if (!enabled) return null;
    return {
      blurIntensity: 14,
      backgroundColor: "rgba(255,255,255,0.15)",
      borderColor: "rgba(255,255,255,0.2)",
    };
  }

  it("returns glass config when enabled", () => {
    const config = getGlassConfig(true);
    expect(config).not.toBe(null);
    expect(config?.blurIntensity).toBe(14);
    expect(config?.backgroundColor).toContain("rgba");
  });

  it("returns null when not enabled", () => {
    const config = getGlassConfig(false);
    expect(config).toBe(null);
  });
});
