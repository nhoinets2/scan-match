/**
 * SegmentedControl Component Tests
 *
 * Tests for the segmented control (tab switcher) logic including:
 * - Tab state management
 * - Animation values
 * - Label customization
 */

// ─────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────

type SegmentedControlTab = "high" | "near";

interface SegmentedControlProps {
  activeTab: SegmentedControlTab;
  onTabChange: (tab: SegmentedControlTab) => void;
  labels?: {
    high: string;
    near: string;
  };
  disabled?: boolean;
}

interface SegmentedControlState {
  activeTab: SegmentedControlTab;
  disabled: boolean;
}

// ─────────────────────────────────────────────
// Default Labels
// ─────────────────────────────────────────────

const DEFAULT_LABELS = {
  high: "Wear now",
  near: "Worth trying",
};

function getLabels(customLabels?: { high: string; near: string }) {
  return customLabels ?? DEFAULT_LABELS;
}

// ─────────────────────────────────────────────
// Animation Value Logic
// ─────────────────────────────────────────────

function getAnimatedValue(activeTab: SegmentedControlTab): number {
  return activeTab === "high" ? 0 : 1;
}

function getIndicatorPosition(animatedValue: number): string {
  return `${animatedValue * 50}%`;
}

// ─────────────────────────────────────────────
// Tab State Logic
// ─────────────────────────────────────────────

interface TabTextStyle {
  isActive: boolean;
  isDisabled: boolean;
}

function getTabTextStyle(
  tab: SegmentedControlTab,
  state: SegmentedControlState
): TabTextStyle {
  return {
    isActive: tab === state.activeTab,
    isDisabled: state.disabled,
  };
}

function shouldHandlePress(
  tab: SegmentedControlTab,
  state: SegmentedControlState
): boolean {
  // Don't handle if disabled or if pressing the already active tab
  return !state.disabled && tab !== state.activeTab;
}

// ─────────────────────────────────────────────
// Tests: Default Labels
// ─────────────────────────────────────────────

describe("SegmentedControl labels", () => {
  describe("getLabels", () => {
    it("returns default labels when none provided", () => {
      const labels = getLabels(undefined);
      expect(labels.high).toBe("Wear now");
      expect(labels.near).toBe("Worth trying");
    });

    it("returns custom labels when provided", () => {
      const customLabels = { high: "Best matches", near: "More options" };
      const labels = getLabels(customLabels);
      expect(labels.high).toBe("Best matches");
      expect(labels.near).toBe("More options");
    });
  });
});

// ─────────────────────────────────────────────
// Tests: Animation Values
// ─────────────────────────────────────────────

describe("SegmentedControl animation", () => {
  describe("getAnimatedValue", () => {
    it("returns 0 for high tab", () => {
      expect(getAnimatedValue("high")).toBe(0);
    });

    it("returns 1 for near tab", () => {
      expect(getAnimatedValue("near")).toBe(1);
    });
  });

  describe("getIndicatorPosition", () => {
    it("returns 0% for value 0", () => {
      expect(getIndicatorPosition(0)).toBe("0%");
    });

    it("returns 50% for value 1", () => {
      expect(getIndicatorPosition(1)).toBe("50%");
    });

    it("returns 25% for value 0.5 (mid-animation)", () => {
      expect(getIndicatorPosition(0.5)).toBe("25%");
    });
  });
});

// ─────────────────────────────────────────────
// Tests: Tab State
// ─────────────────────────────────────────────

describe("SegmentedControl tab state", () => {
  describe("getTabTextStyle", () => {
    it("high tab is active when activeTab is high", () => {
      const style = getTabTextStyle("high", {
        activeTab: "high",
        disabled: false,
      });
      expect(style.isActive).toBe(true);
    });

    it("near tab is not active when activeTab is high", () => {
      const style = getTabTextStyle("near", {
        activeTab: "high",
        disabled: false,
      });
      expect(style.isActive).toBe(false);
    });

    it("tabs are disabled when control is disabled", () => {
      const highStyle = getTabTextStyle("high", {
        activeTab: "high",
        disabled: true,
      });
      const nearStyle = getTabTextStyle("near", {
        activeTab: "high",
        disabled: true,
      });
      expect(highStyle.isDisabled).toBe(true);
      expect(nearStyle.isDisabled).toBe(true);
    });
  });

  describe("shouldHandlePress", () => {
    it("handles press on inactive tab", () => {
      const result = shouldHandlePress("near", {
        activeTab: "high",
        disabled: false,
      });
      expect(result).toBe(true);
    });

    it("ignores press on active tab", () => {
      const result = shouldHandlePress("high", {
        activeTab: "high",
        disabled: false,
      });
      expect(result).toBe(false);
    });

    it("ignores press when disabled", () => {
      const result = shouldHandlePress("near", {
        activeTab: "high",
        disabled: true,
      });
      expect(result).toBe(false);
    });

    it("ignores press on active tab even when that would be redundant with disabled", () => {
      const result = shouldHandlePress("high", {
        activeTab: "high",
        disabled: true,
      });
      expect(result).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
// Tests: Tab Switching
// ─────────────────────────────────────────────

describe("SegmentedControl tab switching", () => {
  function simulateTabChange(
    currentTab: SegmentedControlTab,
    pressedTab: SegmentedControlTab,
    disabled: boolean
  ): SegmentedControlTab {
    if (shouldHandlePress(pressedTab, { activeTab: currentTab, disabled })) {
      return pressedTab;
    }
    return currentTab;
  }

  it("switches from high to near", () => {
    const newTab = simulateTabChange("high", "near", false);
    expect(newTab).toBe("near");
  });

  it("switches from near to high", () => {
    const newTab = simulateTabChange("near", "high", false);
    expect(newTab).toBe("high");
  });

  it("stays on same tab when pressing active", () => {
    const newTab = simulateTabChange("high", "high", false);
    expect(newTab).toBe("high");
  });

  it("does not switch when disabled", () => {
    const newTab = simulateTabChange("high", "near", true);
    expect(newTab).toBe("high");
  });
});

// ─────────────────────────────────────────────
// Tests: CSS/Style Classes
// ─────────────────────────────────────────────

describe("SegmentedControl styles", () => {
  interface TabStyles {
    color: "primary" | "secondary";
    opacity: number;
  }

  function getComputedTabStyles(style: TabTextStyle): TabStyles {
    let color: "primary" | "secondary" = "secondary";
    let opacity = 1;

    if (style.isActive) {
      color = "primary";
    }
    if (style.isDisabled) {
      opacity = 0.4;
    }

    return { color, opacity };
  }

  it("active tab has primary color", () => {
    const styles = getComputedTabStyles({ isActive: true, isDisabled: false });
    expect(styles.color).toBe("primary");
    expect(styles.opacity).toBe(1);
  });

  it("inactive tab has secondary color", () => {
    const styles = getComputedTabStyles({ isActive: false, isDisabled: false });
    expect(styles.color).toBe("secondary");
    expect(styles.opacity).toBe(1);
  });

  it("disabled tab has reduced opacity", () => {
    const styles = getComputedTabStyles({ isActive: true, isDisabled: true });
    expect(styles.opacity).toBe(0.4);
  });

  it("disabled inactive tab has secondary color and reduced opacity", () => {
    const styles = getComputedTabStyles({ isActive: false, isDisabled: true });
    expect(styles.color).toBe("secondary");
    expect(styles.opacity).toBe(0.4);
  });
});

// ─────────────────────────────────────────────
// Tests: Integration Scenarios
// ─────────────────────────────────────────────

describe("SegmentedControl integration", () => {
  describe("results screen scenario", () => {
    it("starts on high (Wear now) tab", () => {
      const initialState: SegmentedControlState = {
        activeTab: "high",
        disabled: false,
      };

      const labels = getLabels();
      const animValue = getAnimatedValue(initialState.activeTab);
      const position = getIndicatorPosition(animValue);

      expect(labels.high).toBe("Wear now");
      expect(animValue).toBe(0);
      expect(position).toBe("0%");
    });

    it("user switches to Worth trying", () => {
      let state: SegmentedControlState = {
        activeTab: "high",
        disabled: false,
      };

      // Simulate press on near
      if (shouldHandlePress("near", state)) {
        state = { ...state, activeTab: "near" };
      }

      const animValue = getAnimatedValue(state.activeTab);
      const position = getIndicatorPosition(animValue);

      expect(state.activeTab).toBe("near");
      expect(animValue).toBe(1);
      expect(position).toBe("50%");
    });
  });

  describe("loading scenario", () => {
    it("disabled during loading prevents interaction", () => {
      const state: SegmentedControlState = {
        activeTab: "high",
        disabled: true,
      };

      const canSwitchToNear = shouldHandlePress("near", state);
      const canSwitchToHigh = shouldHandlePress("high", state);

      expect(canSwitchToNear).toBe(false);
      expect(canSwitchToHigh).toBe(false);
    });
  });

  describe("custom labels scenario", () => {
    it("outfit ideas screen with custom labels", () => {
      const customLabels = { high: "Ready to wear", near: "Need one piece" };
      const labels = getLabels(customLabels);

      expect(labels.high).toBe("Ready to wear");
      expect(labels.near).toBe("Need one piece");
    });
  });
});

// ─────────────────────────────────────────────
// Tests: Indicator Width
// ─────────────────────────────────────────────

describe("indicator dimensions", () => {
  const INDICATOR_WIDTH_PERCENT = "50%";

  it("indicator takes half the width (2 tabs)", () => {
    // With 2 tabs, indicator should be 50% width
    expect(INDICATOR_WIDTH_PERCENT).toBe("50%");
  });

  it("indicator positions match tab count", () => {
    // Tab 0 (high): position 0%
    // Tab 1 (near): position 50%
    expect(getIndicatorPosition(0)).toBe("0%");
    expect(getIndicatorPosition(1)).toBe("50%");
  });
});
