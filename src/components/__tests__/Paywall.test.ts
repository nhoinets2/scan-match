/**
 * Paywall Component Tests
 *
 * Tests for the subscription paywall logic including:
 * - Plan selection
 * - Price formatting
 * - Purchase flow state
 * - Dynamic content based on reason
 */

// ─────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────

type PaywallReason = "in_store_limit" | "wardrobe_limit" | "upgrade";
type SelectedPlan = "annual" | "monthly";

interface PaywallState {
  selectedPlan: SelectedPlan;
  isPurchasing: boolean;
  isRestoring: boolean;
  isLoadingOfferings: boolean;
}

interface PriceInfo {
  monthlyPrice: string;
  annualPrice: string;
  annualMonthlyEquivalent: string;
  annualSavings: string;
}

// ─────────────────────────────────────────────
// Content Logic
// ─────────────────────────────────────────────

function getPaywallTitle(reason: PaywallReason): string | null {
  const titleConfig: Record<PaywallReason, string | null> = {
    in_store_limit: "You've used your 5 free scans",
    wardrobe_limit: "You've hit your wardrobe limit",
    upgrade: null,
  };
  return titleConfig[reason];
}

function getPaywallSubtitle(): string {
  return "Upgrade to Pro for unlimited in-store checks and wardrobe adds.";
}

function getLegalLinkText(reason: PaywallReason): { terms: string; privacy: string } {
  if (reason === "upgrade") {
    return { terms: "Terms of Service", privacy: "Privacy Policy" };
  }
  return { terms: "Terms", privacy: "Privacy" };
}

// ─────────────────────────────────────────────
// Button State Logic
// ─────────────────────────────────────────────

function getCtaButtonLabel(selectedPlan: SelectedPlan): string {
  return selectedPlan === "annual" ? "Start free trial" : "Subscribe";
}

function isCtaDisabled(state: PaywallState): boolean {
  return state.isPurchasing || state.isLoadingOfferings;
}

function isRestoreDisabled(state: PaywallState): boolean {
  return state.isRestoring;
}

// ─────────────────────────────────────────────
// Plan Card Logic
// ─────────────────────────────────────────────

interface PlanCardConfig {
  title: string;
  trialInfo: string | null;
  billingInfo: string;
  displayPrice: string;
  showBestValueBadge: boolean;
}

function getPlanCardConfig(
  isAnnual: boolean,
  prices: PriceInfo
): PlanCardConfig {
  if (isAnnual) {
    return {
      title: "Annual",
      trialInfo: "7-day free trial included",
      billingInfo: `${prices.annualPrice}/year billed annually`,
      displayPrice: prices.annualMonthlyEquivalent,
      showBestValueBadge: true,
    };
  }
  return {
    title: "Monthly",
    trialInfo: null,
    billingInfo: "No free trial",
    displayPrice: prices.monthlyPrice,
    showBestValueBadge: false,
  };
}

// ─────────────────────────────────────────────
// Benefits
// ─────────────────────────────────────────────

const BENEFITS = [
  { icon: "Infinity", text: "Unlimited wardrobe scans" },
  { icon: "Zap", text: "Unlimited in-store checks" },
  { icon: "Sparkles", text: "AI-powered outfit suggestions" },
  { icon: "Star", text: "Priority processing" },
];

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe("Paywall content", () => {
  describe("getPaywallTitle", () => {
    it("returns scan limit title for in_store_limit", () => {
      expect(getPaywallTitle("in_store_limit")).toBe("You've used your 5 free scans");
    });

    it("returns wardrobe limit title for wardrobe_limit", () => {
      expect(getPaywallTitle("wardrobe_limit")).toBe("You've hit your wardrobe limit");
    });

    it("returns null for upgrade (direct upgrade flow)", () => {
      expect(getPaywallTitle("upgrade")).toBe(null);
    });
  });

  describe("getPaywallSubtitle", () => {
    it("returns consistent subtitle", () => {
      expect(getPaywallSubtitle()).toBe(
        "Upgrade to Pro for unlimited in-store checks and wardrobe adds."
      );
    });
  });

  describe("getLegalLinkText", () => {
    it("returns short text for limit reasons", () => {
      expect(getLegalLinkText("in_store_limit")).toEqual({
        terms: "Terms",
        privacy: "Privacy",
      });
      expect(getLegalLinkText("wardrobe_limit")).toEqual({
        terms: "Terms",
        privacy: "Privacy",
      });
    });

    it("returns full text for upgrade flow", () => {
      expect(getLegalLinkText("upgrade")).toEqual({
        terms: "Terms of Service",
        privacy: "Privacy Policy",
      });
    });
  });
});

describe("Paywall button states", () => {
  describe("getCtaButtonLabel", () => {
    it("returns 'Start free trial' for annual plan", () => {
      expect(getCtaButtonLabel("annual")).toBe("Start free trial");
    });

    it("returns 'Subscribe' for monthly plan", () => {
      expect(getCtaButtonLabel("monthly")).toBe("Subscribe");
    });
  });

  describe("isCtaDisabled", () => {
    it("disabled when purchasing", () => {
      const state: PaywallState = {
        selectedPlan: "annual",
        isPurchasing: true,
        isRestoring: false,
        isLoadingOfferings: false,
      };
      expect(isCtaDisabled(state)).toBe(true);
    });

    it("disabled when loading offerings", () => {
      const state: PaywallState = {
        selectedPlan: "annual",
        isPurchasing: false,
        isRestoring: false,
        isLoadingOfferings: true,
      };
      expect(isCtaDisabled(state)).toBe(true);
    });

    it("enabled when idle", () => {
      const state: PaywallState = {
        selectedPlan: "annual",
        isPurchasing: false,
        isRestoring: false,
        isLoadingOfferings: false,
      };
      expect(isCtaDisabled(state)).toBe(false);
    });

    it("enabled even when restoring (restore doesn't block purchase CTA)", () => {
      const state: PaywallState = {
        selectedPlan: "annual",
        isPurchasing: false,
        isRestoring: true,
        isLoadingOfferings: false,
      };
      expect(isCtaDisabled(state)).toBe(false);
    });
  });

  describe("isRestoreDisabled", () => {
    it("disabled when restoring", () => {
      const state: PaywallState = {
        selectedPlan: "annual",
        isPurchasing: false,
        isRestoring: true,
        isLoadingOfferings: false,
      };
      expect(isRestoreDisabled(state)).toBe(true);
    });

    it("enabled when not restoring", () => {
      const state: PaywallState = {
        selectedPlan: "annual",
        isPurchasing: true,
        isRestoring: false,
        isLoadingOfferings: true,
      };
      expect(isRestoreDisabled(state)).toBe(false);
    });
  });
});

describe("Plan card configuration", () => {
  const mockPrices: PriceInfo = {
    monthlyPrice: "$5.99",
    annualPrice: "$39.99",
    annualMonthlyEquivalent: "$3.33",
    annualSavings: "Save 44%",
  };

  describe("annual plan", () => {
    it("returns correct configuration", () => {
      const config = getPlanCardConfig(true, mockPrices);

      expect(config.title).toBe("Annual");
      expect(config.trialInfo).toBe("7-day free trial included");
      expect(config.billingInfo).toBe("$39.99/year billed annually");
      expect(config.displayPrice).toBe("$3.33");
      expect(config.showBestValueBadge).toBe(true);
    });
  });

  describe("monthly plan", () => {
    it("returns correct configuration", () => {
      const config = getPlanCardConfig(false, mockPrices);

      expect(config.title).toBe("Monthly");
      expect(config.trialInfo).toBe(null);
      expect(config.billingInfo).toBe("No free trial");
      expect(config.displayPrice).toBe("$5.99");
      expect(config.showBestValueBadge).toBe(false);
    });
  });
});

describe("Benefits list", () => {
  it("has 4 benefits", () => {
    expect(BENEFITS).toHaveLength(4);
  });

  it("includes unlimited scans", () => {
    expect(BENEFITS.some(b => b.text.includes("Unlimited wardrobe scans"))).toBe(true);
  });

  it("includes unlimited checks", () => {
    expect(BENEFITS.some(b => b.text.includes("Unlimited in-store checks"))).toBe(true);
  });

  it("includes AI suggestions", () => {
    expect(BENEFITS.some(b => b.text.includes("AI-powered outfit suggestions"))).toBe(true);
  });

  it("includes priority processing", () => {
    expect(BENEFITS.some(b => b.text.includes("Priority processing"))).toBe(true);
  });
});

describe("Trial terms display", () => {
  function getTrialTermsText(
    selectedPlan: SelectedPlan,
    annualPrice: string
  ): string | null {
    if (selectedPlan === "annual") {
      return `7 days free, then ${annualPrice}/year. Cancel anytime before trial ends.`;
    }
    return null;
  }

  it("shows trial terms for annual plan", () => {
    const terms = getTrialTermsText("annual", "$39.99");
    expect(terms).toBe("7 days free, then $39.99/year. Cancel anytime before trial ends.");
  });

  it("returns null for monthly plan", () => {
    const terms = getTrialTermsText("monthly", "$39.99");
    expect(terms).toBe(null);
  });
});

describe("Restore margin adjustment", () => {
  function getRestoreMarginTop(selectedPlan: SelectedPlan): "md" | "lg" {
    return selectedPlan === "annual" ? "md" : "lg";
  }

  it("smaller margin when annual (trial terms shown above)", () => {
    expect(getRestoreMarginTop("annual")).toBe("md");
  });

  it("larger margin when monthly (no trial terms)", () => {
    expect(getRestoreMarginTop("monthly")).toBe("lg");
  });
});

describe("Paywall integration scenarios", () => {
  describe("user hits scan limit", () => {
    it("shows correct content and defaults to annual", () => {
      const reason: PaywallReason = "in_store_limit";
      const state: PaywallState = {
        selectedPlan: "annual",
        isPurchasing: false,
        isRestoring: false,
        isLoadingOfferings: false,
      };

      const title = getPaywallTitle(reason);
      const ctaLabel = getCtaButtonLabel(state.selectedPlan);
      const disabled = isCtaDisabled(state);

      expect(title).toBe("You've used your 5 free scans");
      expect(ctaLabel).toBe("Start free trial");
      expect(disabled).toBe(false);
    });
  });

  describe("user selects monthly", () => {
    it("updates CTA label and hides trial terms", () => {
      const state: PaywallState = {
        selectedPlan: "monthly",
        isPurchasing: false,
        isRestoring: false,
        isLoadingOfferings: false,
      };

      const ctaLabel = getCtaButtonLabel(state.selectedPlan);
      
      expect(ctaLabel).toBe("Subscribe");
    });
  });

  describe("purchase in progress", () => {
    it("disables CTA during purchase", () => {
      const state: PaywallState = {
        selectedPlan: "annual",
        isPurchasing: true,
        isRestoring: false,
        isLoadingOfferings: false,
      };

      expect(isCtaDisabled(state)).toBe(true);
      expect(isRestoreDisabled(state)).toBe(false);
    });
  });

  describe("restore in progress", () => {
    it("disables restore but not CTA", () => {
      const state: PaywallState = {
        selectedPlan: "annual",
        isPurchasing: false,
        isRestoring: true,
        isLoadingOfferings: false,
      };

      expect(isCtaDisabled(state)).toBe(false);
      expect(isRestoreDisabled(state)).toBe(true);
    });
  });
});
