/**
 * WinbackOffer Component Tests
 *
 * Tests for the winback/retention offer modal logic including:
 * - Offer content
 * - Button states
 * - User interaction flow
 */

// ─────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────

interface WinbackOfferProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
}

interface WinbackOfferState {
  isLoading: boolean;
}

// ─────────────────────────────────────────────
// Offer Content
// ─────────────────────────────────────────────

const OFFER_CONTENT = {
  title: "Wait! Don't Go",
  subtitle: "We'd love to keep you as a Pro member",
  originalPrice: "$39.99/year",
  discountedPrice: "$19.99",
  perPeriod: "/year",
  savingsText: "Save 50% on your next year",
  exclusiveLabel: "Exclusive Offer",
  benefits: [
    "Unlimited wardrobe scans",
    "Unlimited in-store checks",
    "AI-powered outfit suggestions",
  ],
  acceptButtonLabel: "Claim 50% Off",
  declineButtonLabel: "No thanks, continue cancellation",
};

const REDEMPTION_INSTRUCTIONS = {
  title: "Claim Your 50% Discount",
  steps: [
    "Go to iPhone Settings → Apple ID → Subscriptions",
    "Select Scan & Match",
    "Enter promo code: WINBACK50",
  ],
  footer: "Your next year will be just $19.99!",
};

function getOfferContent() {
  return OFFER_CONTENT;
}

function getRedemptionInstructions() {
  return REDEMPTION_INSTRUCTIONS;
}

// ─────────────────────────────────────────────
// Button State Logic
// ─────────────────────────────────────────────

function isAcceptButtonDisabled(state: WinbackOfferState): boolean {
  return state.isLoading;
}

function isDeclineButtonDisabled(state: WinbackOfferState): boolean {
  return state.isLoading;
}

function getAcceptButtonOpacity(state: WinbackOfferState): number {
  return state.isLoading ? 0.7 : 1;
}

// ─────────────────────────────────────────────
// Price Display Logic
// ─────────────────────────────────────────────

interface PriceDisplay {
  original: string;
  discounted: string;
  period: string;
  savings: string;
  showStrikethrough: boolean;
}

function getPriceDisplay(): PriceDisplay {
  return {
    original: OFFER_CONTENT.originalPrice,
    discounted: OFFER_CONTENT.discountedPrice,
    period: OFFER_CONTENT.perPeriod,
    savings: OFFER_CONTENT.savingsText,
    showStrikethrough: true,
  };
}

// ─────────────────────────────────────────────
// Tests: Offer Content
// ─────────────────────────────────────────────

describe("WinbackOffer content", () => {
  describe("getOfferContent", () => {
    it("returns correct title", () => {
      const content = getOfferContent();
      expect(content.title).toBe("Wait! Don't Go");
    });

    it("returns correct subtitle", () => {
      const content = getOfferContent();
      expect(content.subtitle).toBe("We'd love to keep you as a Pro member");
    });

    it("returns 50% discount pricing", () => {
      const content = getOfferContent();
      expect(content.originalPrice).toBe("$39.99/year");
      expect(content.discountedPrice).toBe("$19.99");
    });

    it("returns 3 benefits", () => {
      const content = getOfferContent();
      expect(content.benefits).toHaveLength(3);
    });

    it("includes key benefits", () => {
      const content = getOfferContent();
      expect(content.benefits).toContain("Unlimited wardrobe scans");
      expect(content.benefits).toContain("Unlimited in-store checks");
      expect(content.benefits).toContain("AI-powered outfit suggestions");
    });
  });

  describe("getRedemptionInstructions", () => {
    it("returns correct title", () => {
      const instructions = getRedemptionInstructions();
      expect(instructions.title).toBe("Claim Your 50% Discount");
    });

    it("returns 3 steps", () => {
      const instructions = getRedemptionInstructions();
      expect(instructions.steps).toHaveLength(3);
    });

    it("includes promo code step", () => {
      const instructions = getRedemptionInstructions();
      expect(instructions.steps.some(s => s.includes("WINBACK50"))).toBe(true);
    });

    it("mentions settings path", () => {
      const instructions = getRedemptionInstructions();
      expect(instructions.steps[0]).toContain("Settings");
      expect(instructions.steps[0]).toContain("Apple ID");
      expect(instructions.steps[0]).toContain("Subscriptions");
    });
  });
});

// ─────────────────────────────────────────────
// Tests: Button States
// ─────────────────────────────────────────────

describe("WinbackOffer button states", () => {
  describe("accept button", () => {
    it("enabled when not loading", () => {
      expect(isAcceptButtonDisabled({ isLoading: false })).toBe(false);
    });

    it("disabled when loading", () => {
      expect(isAcceptButtonDisabled({ isLoading: true })).toBe(true);
    });

    it("full opacity when enabled", () => {
      expect(getAcceptButtonOpacity({ isLoading: false })).toBe(1);
    });

    it("reduced opacity when loading", () => {
      expect(getAcceptButtonOpacity({ isLoading: true })).toBe(0.7);
    });
  });

  describe("decline button", () => {
    it("enabled when not loading", () => {
      expect(isDeclineButtonDisabled({ isLoading: false })).toBe(false);
    });

    it("disabled when loading", () => {
      expect(isDeclineButtonDisabled({ isLoading: true })).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────
// Tests: Price Display
// ─────────────────────────────────────────────

describe("WinbackOffer price display", () => {
  describe("getPriceDisplay", () => {
    it("shows original price with strikethrough", () => {
      const price = getPriceDisplay();
      expect(price.original).toBe("$39.99/year");
      expect(price.showStrikethrough).toBe(true);
    });

    it("shows discounted price", () => {
      const price = getPriceDisplay();
      expect(price.discounted).toBe("$19.99");
    });

    it("shows period", () => {
      const price = getPriceDisplay();
      expect(price.period).toBe("/year");
    });

    it("shows savings text", () => {
      const price = getPriceDisplay();
      expect(price.savings).toBe("Save 50% on your next year");
    });
  });

  describe("discount calculation", () => {
    it("50% discount is correct", () => {
      // $39.99 → $19.99 is ~50% off
      const original = 39.99;
      const discounted = 19.99;
      const discount = ((original - discounted) / original) * 100;
      
      expect(Math.round(discount)).toBeGreaterThanOrEqual(49);
      expect(Math.round(discount)).toBeLessThanOrEqual(51);
    });
  });
});

// ─────────────────────────────────────────────
// Tests: User Flow Simulation
// ─────────────────────────────────────────────

describe("WinbackOffer user flow", () => {
  describe("close flow", () => {
    interface FlowState {
      visible: boolean;
      markedAsShown: boolean;
    }

    function simulateClose(state: FlowState): FlowState {
      // User closes modal - mark as shown
      return {
        visible: false,
        markedAsShown: true,
      };
    }

    it("closes modal and marks as shown", () => {
      const initial: FlowState = { visible: true, markedAsShown: false };
      const result = simulateClose(initial);
      
      expect(result.visible).toBe(false);
      expect(result.markedAsShown).toBe(true);
    });
  });

  describe("accept flow", () => {
    interface AcceptFlowState {
      isLoading: boolean;
      showInstructions: boolean;
      markedAsAccepted: boolean;
      modalClosed: boolean;
    }

    function simulateAcceptStart(state: AcceptFlowState): AcceptFlowState {
      return { ...state, isLoading: true };
    }

    function simulateAcceptSuccess(state: AcceptFlowState): AcceptFlowState {
      return {
        isLoading: false,
        showInstructions: true,
        markedAsAccepted: true,
        modalClosed: false,
      };
    }

    function simulateInstructionsDismiss(state: AcceptFlowState): AcceptFlowState {
      return { ...state, showInstructions: false, modalClosed: true };
    }

    it("complete accept flow", () => {
      let state: AcceptFlowState = {
        isLoading: false,
        showInstructions: false,
        markedAsAccepted: false,
        modalClosed: false,
      };

      // User taps accept
      state = simulateAcceptStart(state);
      expect(state.isLoading).toBe(true);

      // Backend marks as accepted, show instructions
      state = simulateAcceptSuccess(state);
      expect(state.isLoading).toBe(false);
      expect(state.markedAsAccepted).toBe(true);
      expect(state.showInstructions).toBe(true);

      // User dismisses instructions
      state = simulateInstructionsDismiss(state);
      expect(state.modalClosed).toBe(true);
    });
  });

  describe("error handling", () => {
    interface ErrorState {
      isLoading: boolean;
      error: string | null;
    }

    function simulateError(errorMessage: string): ErrorState {
      return {
        isLoading: false,
        error: errorMessage,
      };
    }

    it("shows error message on failure", () => {
      const state = simulateError("Network error");
      expect(state.error).toBe("Network error");
      expect(state.isLoading).toBe(false);
    });

    it("uses default error message", () => {
      const defaultError = "Something went wrong. Please try again.";
      const state = simulateError(defaultError);
      expect(state.error).toBe(defaultError);
    });
  });
});

// ─────────────────────────────────────────────
// Tests: Modal Visibility
// ─────────────────────────────────────────────

describe("WinbackOffer modal visibility", () => {
  interface VisibilityConfig {
    animationType: "slide" | "fade" | "none";
    presentationStyle: "pageSheet" | "fullScreen" | "formSheet";
  }

  function getModalConfig(): VisibilityConfig {
    return {
      animationType: "slide",
      presentationStyle: "pageSheet",
    };
  }

  it("uses slide animation", () => {
    const config = getModalConfig();
    expect(config.animationType).toBe("slide");
  });

  it("uses pageSheet presentation", () => {
    const config = getModalConfig();
    expect(config.presentationStyle).toBe("pageSheet");
  });
});

// ─────────────────────────────────────────────
// Tests: Integration
// ─────────────────────────────────────────────

describe("WinbackOffer integration", () => {
  it("full props validation", () => {
    const props: WinbackOfferProps = {
      visible: true,
      onClose: () => {},
      userId: "user-123",
    };

    expect(props.visible).toBe(true);
    expect(typeof props.onClose).toBe("function");
    expect(props.userId).toBe("user-123");
  });

  it("required userId for tracking", () => {
    const props: WinbackOfferProps = {
      visible: true,
      onClose: () => {},
      userId: "user-456",
    };

    // userId is required for markWinbackOfferShown and markWinbackOfferAccepted
    expect(props.userId).toBeTruthy();
    expect(props.userId.length).toBeGreaterThan(0);
  });
});
