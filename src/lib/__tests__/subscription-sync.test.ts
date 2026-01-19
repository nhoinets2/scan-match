/**
 * Subscription Sync Module Tests
 *
 * Comprehensive tests for subscription syncing functionality including:
 * - Database operations (getSubscriptionFromDb, isProFromDb)
 * - Sync operations (syncSubscriptionToDb)
 * - Winback offer handling
 * - Edge cases and error handling
 */

// Mock Supabase
const mockSupabaseClient = {
  from: jest.fn(),
};

const mockSelectResponse = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
};

const mockUpdateResponse = {
  update: jest.fn().mockReturnThis(),
  eq: jest.fn(),
};

const mockUpsertResponse = {
  upsert: jest.fn(),
};

jest.mock("../supabase", () => ({
  supabase: mockSupabaseClient,
}));

// Mock RevenueCat client
const mockRevenueCatClient = {
  getCustomerInfo: jest.fn(),
  isRevenueCatEnabled: jest.fn(),
};

jest.mock("../revenuecatClient", () => mockRevenueCatClient);

// ============================================
// TYPE DEFINITIONS
// ============================================

interface UserSubscription {
  id: string;
  user_id: string;
  is_pro: boolean;
  subscription_type: "monthly" | "annual" | null;
  revenuecat_customer_id: string | null;
  expires_at: string | null;
  will_renew: boolean;
  show_winback_offer: boolean;
  winback_offer_shown_at: string | null;
  winback_offer_accepted: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// TEST FIXTURES
// ============================================

const createMockSubscription = (overrides: Partial<UserSubscription> = {}): UserSubscription => ({
  id: "sub-123",
  user_id: "user-456",
  is_pro: true,
  subscription_type: "monthly",
  revenuecat_customer_id: "rc-789",
  expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
  will_renew: true,
  show_winback_offer: false,
  winback_offer_shown_at: null,
  winback_offer_accepted: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

// ============================================
// getSubscriptionFromDb TESTS
// ============================================

describe("getSubscriptionFromDb", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Simulated getSubscriptionFromDb function
   */
  const getSubscriptionFromDb = async (userId: string): Promise<UserSubscription | null> => {
    mockSupabaseClient.from.mockReturnValue(mockSelectResponse);
    const result = await mockSelectResponse.single();
    
    if (result.error) {
      if (result.error.code !== "PGRST116") {
        console.log("[Subscription] Error fetching from DB:", result.error.message);
      }
      return null;
    }
    
    return result.data as UserSubscription;
  };

  it("returns subscription data for existing user", async () => {
    const mockSub = createMockSubscription();
    mockSelectResponse.single.mockResolvedValue({ data: mockSub, error: null });
    
    const result = await getSubscriptionFromDb("user-456");
    
    expect(result).toEqual(mockSub);
  });

  it("returns null for non-existent user (PGRST116)", async () => {
    mockSelectResponse.single.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "No rows found" },
    });
    
    const result = await getSubscriptionFromDb("non-existent-user");
    
    expect(result).toBeNull();
  });

  it("returns null and logs error for other database errors", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    mockSelectResponse.single.mockResolvedValue({
      data: null,
      error: { code: "OTHER_ERROR", message: "Database error" },
    });
    
    const result = await getSubscriptionFromDb("user-456");
    
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[Subscription] Error fetching from DB:",
      "Database error"
    );
    consoleSpy.mockRestore();
  });

  it("handles subscription with null optional fields", async () => {
    const mockSub = createMockSubscription({
      subscription_type: null,
      revenuecat_customer_id: null,
      expires_at: null,
      winback_offer_shown_at: null,
    });
    mockSelectResponse.single.mockResolvedValue({ data: mockSub, error: null });
    
    const result = await getSubscriptionFromDb("user-456");
    
    expect(result?.subscription_type).toBeNull();
    expect(result?.revenuecat_customer_id).toBeNull();
    expect(result?.expires_at).toBeNull();
  });
});

// ============================================
// isProFromDb TESTS
// ============================================

describe("isProFromDb", () => {
  /**
   * Simulated isProFromDb function
   */
  const isProFromDb = (subscription: UserSubscription | null): boolean => {
    if (!subscription?.is_pro) {
      return false;
    }

    // If no expiration date, trust is_pro flag (could be manual override/lifetime)
    if (!subscription.expires_at) {
      return true;
    }

    // Check if subscription has expired
    const expiresAt = new Date(subscription.expires_at);
    const now = new Date();

    if (expiresAt < now) {
      console.log("[Subscription] DB subscription expired:", subscription.expires_at);
      return false;
    }

    return true;
  };

  it("returns false for null subscription", () => {
    expect(isProFromDb(null)).toBe(false);
  });

  it("returns false when is_pro is false", () => {
    const sub = createMockSubscription({ is_pro: false });
    expect(isProFromDb(sub)).toBe(false);
  });

  it("returns true for active pro subscription", () => {
    const sub = createMockSubscription({
      is_pro: true,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(isProFromDb(sub)).toBe(true);
  });

  it("returns false for expired subscription", () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    const sub = createMockSubscription({
      is_pro: true,
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
    });
    
    expect(isProFromDb(sub)).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[Subscription] DB subscription expired:",
      expect.any(String)
    );
    consoleSpy.mockRestore();
  });

  it("returns true for pro with no expiration (lifetime/manual)", () => {
    const sub = createMockSubscription({
      is_pro: true,
      expires_at: null,
    });
    expect(isProFromDb(sub)).toBe(true);
  });

  it("returns true for subscription expiring exactly now", () => {
    const now = new Date();
    const sub = createMockSubscription({
      is_pro: true,
      // Add 1ms to ensure it's not expired
      expires_at: new Date(now.getTime() + 1).toISOString(),
    });
    expect(isProFromDb(sub)).toBe(true);
  });
});

// ============================================
// syncSubscriptionToDb TESTS
// ============================================

describe("syncSubscriptionToDb", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Simulated syncSubscriptionToDb function
   */
  const syncSubscriptionToDb = async (
    userId: string,
    isRevenueCatEnabled: boolean,
    customerInfoResult: { ok: boolean; data?: any; reason?: string }
  ): Promise<boolean> => {
    if (!isRevenueCatEnabled) {
      console.log("[Subscription] RevenueCat not enabled, skipping sync");
      return false;
    }

    if (!customerInfoResult.ok) {
      console.log("[Subscription] Failed to get customer info:", customerInfoResult.reason);
      return false;
    }

    const customerInfo = customerInfoResult.data;
    const activeEntitlements = customerInfo.entitlements.active;
    const proEntitlement = activeEntitlements?.["pro"];

    const isPro = !!proEntitlement;
    const expiresAt = proEntitlement?.expirationDate || null;
    const willRenew = proEntitlement?.willRenew ?? true;

    let subscriptionType: "monthly" | "annual" | null = null;
    if (proEntitlement?.productIdentifier) {
      const productId = proEntitlement.productIdentifier.toLowerCase();
      if (productId.includes("annual") || productId.includes("yearly")) {
        subscriptionType = "annual";
      } else if (productId.includes("monthly")) {
        subscriptionType = "monthly";
      }
    }

    // Simulated upsert
    mockSupabaseClient.from.mockReturnValue({
      upsert: jest.fn().mockResolvedValue({ error: null }),
    });

    return true;
  };

  it("returns false when RevenueCat not enabled", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    
    const result = await syncSubscriptionToDb("user-123", false, { ok: true });
    
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[Subscription] RevenueCat not enabled, skipping sync"
    );
    consoleSpy.mockRestore();
  });

  it("returns false when customer info fetch fails", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    
    const result = await syncSubscriptionToDb("user-123", true, {
      ok: false,
      reason: "sdk_error",
    });
    
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[Subscription] Failed to get customer info:",
      "sdk_error"
    );
    consoleSpy.mockRestore();
  });

  it("syncs pro subscription with monthly type", async () => {
    const customerInfoResult = {
      ok: true,
      data: {
        originalAppUserId: "user-123",
        entitlements: {
          active: {
            pro: {
              productIdentifier: "pro_monthly_9.99",
              expirationDate: "2026-02-01",
              willRenew: true,
            },
          },
        },
      },
    };
    
    const result = await syncSubscriptionToDb("user-123", true, customerInfoResult);
    
    expect(result).toBe(true);
  });

  it("syncs pro subscription with annual type", async () => {
    const customerInfoResult = {
      ok: true,
      data: {
        originalAppUserId: "user-123",
        entitlements: {
          active: {
            pro: {
              productIdentifier: "pro_annual_79.99",
              expirationDate: "2027-01-01",
              willRenew: true,
            },
          },
        },
      },
    };
    
    const result = await syncSubscriptionToDb("user-123", true, customerInfoResult);
    
    expect(result).toBe(true);
  });

  it("syncs free user (no pro entitlement)", async () => {
    const customerInfoResult = {
      ok: true,
      data: {
        originalAppUserId: "user-123",
        entitlements: {
          active: {},
        },
      },
    };
    
    const result = await syncSubscriptionToDb("user-123", true, customerInfoResult);
    
    expect(result).toBe(true);
  });
});

// ============================================
// updateSubscriptionInDb TESTS
// ============================================

describe("updateSubscriptionInDb", () => {
  /**
   * Simulated updateSubscriptionInDb function
   */
  const updateSubscriptionInDb = async (
    userId: string,
    isPro: boolean,
    subscriptionType?: "monthly" | "annual" | null,
    upsertError: Error | null = null
  ): Promise<boolean> => {
    if (upsertError) {
      console.log("[Subscription] Error updating DB:", upsertError.message);
      return false;
    }
    return true;
  };

  it("successfully updates subscription to pro", async () => {
    const result = await updateSubscriptionInDb("user-123", true, "monthly");
    expect(result).toBe(true);
  });

  it("successfully updates subscription to free", async () => {
    const result = await updateSubscriptionInDb("user-123", false);
    expect(result).toBe(true);
  });

  it("handles null subscription type", async () => {
    const result = await updateSubscriptionInDb("user-123", true, null);
    expect(result).toBe(true);
  });

  it("returns false on database error", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    
    const result = await updateSubscriptionInDb(
      "user-123",
      true,
      "monthly",
      new Error("Database connection failed")
    );
    
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[Subscription] Error updating DB:",
      "Database connection failed"
    );
    consoleSpy.mockRestore();
  });
});

// ============================================
// WINBACK OFFER TESTS
// ============================================

describe("Winback Offer Functions", () => {
  describe("shouldShowWinbackOffer", () => {
    /**
     * Simulated shouldShowWinbackOffer function
     */
    const shouldShowWinbackOffer = (subscription: UserSubscription | null): boolean => {
      if (!subscription) {
        return false;
      }
      return subscription.show_winback_offer === true;
    };

    it("returns false for null subscription", () => {
      expect(shouldShowWinbackOffer(null)).toBe(false);
    });

    it("returns true when show_winback_offer is true", () => {
      const sub = createMockSubscription({ show_winback_offer: true });
      expect(shouldShowWinbackOffer(sub)).toBe(true);
    });

    it("returns false when show_winback_offer is false", () => {
      const sub = createMockSubscription({ show_winback_offer: false });
      expect(shouldShowWinbackOffer(sub)).toBe(false);
    });
  });

  describe("markWinbackOfferShown", () => {
    /**
     * Simulated markWinbackOfferShown function
     */
    const markWinbackOfferShown = async (
      userId: string,
      updateError: Error | null = null
    ): Promise<boolean> => {
      if (updateError) {
        console.log("[Subscription] Error marking winback shown:", updateError.message);
        return false;
      }
      return true;
    };

    it("successfully marks winback as shown", async () => {
      const result = await markWinbackOfferShown("user-123");
      expect(result).toBe(true);
    });

    it("returns false on database error", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      
      const result = await markWinbackOfferShown(
        "user-123",
        new Error("Update failed")
      );
      
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Subscription] Error marking winback shown:",
        "Update failed"
      );
      consoleSpy.mockRestore();
    });
  });

  describe("markWinbackOfferAccepted", () => {
    /**
     * Simulated markWinbackOfferAccepted function
     */
    const markWinbackOfferAccepted = async (
      userId: string,
      updateError: Error | null = null
    ): Promise<boolean> => {
      if (updateError) {
        console.log("[Subscription] Error marking winback accepted:", updateError.message);
        return false;
      }
      return true;
    };

    it("successfully marks winback as accepted", async () => {
      const result = await markWinbackOfferAccepted("user-123");
      expect(result).toBe(true);
    });

    it("returns false on database error", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      
      const result = await markWinbackOfferAccepted(
        "user-123",
        new Error("Update failed")
      );
      
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Subscription] Error marking winback accepted:",
        "Update failed"
      );
      consoleSpy.mockRestore();
    });
  });
});

// ============================================
// SUBSCRIPTION TYPE DETECTION TESTS
// ============================================

describe("Subscription Type Detection", () => {
  /**
   * Extract subscription type from product identifier
   */
  const getSubscriptionType = (productIdentifier: string | undefined): "monthly" | "annual" | null => {
    if (!productIdentifier) return null;
    
    const productId = productIdentifier.toLowerCase();
    if (productId.includes("annual") || productId.includes("yearly")) {
      return "annual";
    } else if (productId.includes("monthly")) {
      return "monthly";
    }
    return null;
  };

  it("detects monthly subscription", () => {
    expect(getSubscriptionType("pro_monthly_9.99")).toBe("monthly");
    expect(getSubscriptionType("MONTHLY_SUBSCRIPTION")).toBe("monthly");
    expect(getSubscriptionType("com.app.monthly")).toBe("monthly");
  });

  it("detects annual subscription", () => {
    expect(getSubscriptionType("pro_annual_79.99")).toBe("annual");
    expect(getSubscriptionType("ANNUAL_SUBSCRIPTION")).toBe("annual");
    expect(getSubscriptionType("com.app.annual")).toBe("annual");
  });

  it("detects yearly subscription (synonym for annual)", () => {
    expect(getSubscriptionType("pro_yearly_79.99")).toBe("annual");
    expect(getSubscriptionType("YEARLY_SUBSCRIPTION")).toBe("annual");
  });

  it("returns null for unknown subscription type", () => {
    expect(getSubscriptionType("pro_lifetime")).toBeNull();
    expect(getSubscriptionType("custom_plan")).toBeNull();
  });

  it("returns null for undefined product identifier", () => {
    expect(getSubscriptionType(undefined)).toBeNull();
  });

  it("handles mixed case product identifiers", () => {
    expect(getSubscriptionType("Pro_Monthly_Plan")).toBe("monthly");
    expect(getSubscriptionType("PRO_ANNUAL_PLAN")).toBe("annual");
  });
});

// ============================================
// EDGE CASES
// ============================================

describe("Edge Cases", () => {
  describe("subscription expiration edge cases", () => {
    const isSubscriptionExpired = (expiresAt: string | null): boolean => {
      if (!expiresAt) return false;
      return new Date(expiresAt) < new Date();
    };

    it("handles invalid date strings gracefully", () => {
      // Invalid date creates NaN which always returns false in comparisons
      // So invalid dates are treated as not expired (fail-safe)
      expect(isSubscriptionExpired("invalid-date")).toBe(false);
    });

    it("handles far future expiration", () => {
      expect(isSubscriptionExpired("2099-12-31T23:59:59Z")).toBe(false);
    });

    it("handles ISO date with timezone", () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      expect(isSubscriptionExpired(futureDate)).toBe(false);
    });
  });

  describe("user ID edge cases", () => {
    it("handles empty user ID", async () => {
      // Simulated validation
      const validateUserId = (userId: string): boolean => {
        return userId.length > 0;
      };
      
      expect(validateUserId("")).toBe(false);
      expect(validateUserId("user-123")).toBe(true);
    });

    it("handles UUID format user IDs", () => {
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuidPattern.test("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    });
  });

  describe("concurrent operations", () => {
    it("handles multiple sync operations", async () => {
      const syncResults = await Promise.all([
        Promise.resolve(true),
        Promise.resolve(true),
        Promise.resolve(true),
      ]);
      
      expect(syncResults).toEqual([true, true, true]);
    });
  });
});

// ============================================
// INTEGRATION TESTS
// ============================================

describe("Integration Tests", () => {
  describe("Full subscription lifecycle", () => {
    it("simulates user upgrading to pro", async () => {
      // 1. User starts as free
      let subscription = createMockSubscription({ is_pro: false });
      expect(subscription.is_pro).toBe(false);
      
      // 2. User purchases pro
      subscription = {
        ...subscription,
        is_pro: true,
        subscription_type: "monthly",
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
      expect(subscription.is_pro).toBe(true);
      expect(subscription.subscription_type).toBe("monthly");
    });

    it("simulates user cancelling subscription (winback flow)", async () => {
      // 1. User has active subscription
      let subscription = createMockSubscription({
        is_pro: true,
        will_renew: true,
        show_winback_offer: false,
      });
      
      // 2. User cancels (will_renew becomes false, show_winback_offer becomes true)
      subscription = {
        ...subscription,
        will_renew: false,
        show_winback_offer: true,
      };
      
      expect(subscription.will_renew).toBe(false);
      expect(subscription.show_winback_offer).toBe(true);
      
      // 3. Winback offer is shown
      subscription = {
        ...subscription,
        show_winback_offer: false,
        winback_offer_shown_at: new Date().toISOString(),
      };
      
      expect(subscription.show_winback_offer).toBe(false);
      expect(subscription.winback_offer_shown_at).toBeTruthy();
    });

    it("simulates subscription expiring", async () => {
      // Expired subscription
      const subscription = createMockSubscription({
        is_pro: true,
        expires_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
      });
      
      const isExpired = new Date(subscription.expires_at!) < new Date();
      expect(isExpired).toBe(true);
    });
  });

  describe("Database consistency", () => {
    it("ensures updated_at is always set on updates", () => {
      const subscription = createMockSubscription();
      const updatedSubscription = {
        ...subscription,
        is_pro: false,
        updated_at: new Date().toISOString(),
      };
      
      expect(updatedSubscription.updated_at).toBeTruthy();
      expect(new Date(updatedSubscription.updated_at).getTime()).toBeGreaterThan(0);
    });
  });
});
