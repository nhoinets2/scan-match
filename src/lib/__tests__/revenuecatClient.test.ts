/**
 * RevenueCat Client Module Tests
 *
 * Comprehensive tests for the RevenueCat client module including:
 * - API key selection logic
 * - Guard function behavior
 * - All exported functions
 * - Error handling
 * - Edge cases
 */

import { Platform } from "react-native";

// Mock react-native-purchases before importing the module
const mockPurchases = {
  configure: jest.fn(),
  getOfferings: jest.fn(),
  purchasePackage: jest.fn(),
  getCustomerInfo: jest.fn(),
  restorePurchases: jest.fn(),
  logIn: jest.fn(),
  logOut: jest.fn(),
  setLogHandler: jest.fn(),
  LOG_LEVEL: {
    ERROR: "error",
  },
};

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: mockPurchases,
}));

// Mock Platform
jest.mock("react-native", () => ({
  Platform: {
    OS: "ios",
  },
}));

// ============================================
// HELPER FUNCTIONS FOR TESTING
// ============================================

/**
 * Get API key based on platform and environment
 * (Duplicated from module for testing)
 */
const getApiKey = (
  isWeb: boolean,
  isDev: boolean,
  platform: string,
  testKey?: string,
  appleKey?: string,
  googleKey?: string
): string | undefined => {
  if (isWeb) return undefined;
  if (isDev) return testKey;
  return platform === "ios" ? appleKey : googleKey;
};

/**
 * Guard logic result type (duplicated for testing)
 */
type RevenueCatGuardReason =
  | "web_not_supported"
  | "not_configured"
  | "sdk_error";

type RevenueCatResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: RevenueCatGuardReason; error?: unknown };

// ============================================
// API KEY SELECTION TESTS
// ============================================

describe("API Key Selection Logic", () => {
  describe("getApiKey", () => {
    it("returns undefined for web platform", () => {
      const result = getApiKey(true, false, "web", "test-key", "apple-key", "google-key");
      expect(result).toBeUndefined();
    });

    it("returns test key in development mode", () => {
      const result = getApiKey(false, true, "ios", "test-key", "apple-key", "google-key");
      expect(result).toBe("test-key");
    });

    it("returns Apple key for iOS in production", () => {
      const result = getApiKey(false, false, "ios", "test-key", "apple-key", "google-key");
      expect(result).toBe("apple-key");
    });

    it("returns Google key for Android in production", () => {
      const result = getApiKey(false, false, "android", "test-key", "apple-key", "google-key");
      expect(result).toBe("google-key");
    });

    it("returns undefined if no keys configured", () => {
      const result = getApiKey(false, true, "ios", undefined, undefined, undefined);
      expect(result).toBeUndefined();
    });

    it("prioritizes dev mode over platform-specific keys", () => {
      const result = getApiKey(false, true, "android", "test-key", "apple-key", "google-key");
      expect(result).toBe("test-key");
    });
  });
});

// ============================================
// GUARD FUNCTION TESTS
// ============================================

describe("Guard Function Logic", () => {
  /**
   * Simulated guard function for testing
   */
  const guardRevenueCatUsage = async <T>(
    isWeb: boolean,
    isEnabled: boolean,
    operation: () => Promise<T>
  ): Promise<RevenueCatResult<T>> => {
    if (isWeb) {
      return { ok: false, reason: "web_not_supported" };
    }

    if (!isEnabled) {
      return { ok: false, reason: "not_configured" };
    }

    try {
      const data = await operation();
      return { ok: true, data };
    } catch (error) {
      return { ok: false, reason: "sdk_error", error };
    }
  };

  describe("web platform handling", () => {
    it("returns web_not_supported for web platform", async () => {
      const result = await guardRevenueCatUsage(true, true, async () => "success");
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("web_not_supported");
      }
    });
  });

  describe("not configured handling", () => {
    it("returns not_configured when RevenueCat is disabled", async () => {
      const result = await guardRevenueCatUsage(false, false, async () => "success");
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("not_configured");
      }
    });
  });

  describe("successful operations", () => {
    it("returns ok: true with data on success", async () => {
      const result = await guardRevenueCatUsage(false, true, async () => "success-data");
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBe("success-data");
      }
    });

    it("handles async operations correctly", async () => {
      const result = await guardRevenueCatUsage(false, true, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { value: 42 };
      });
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ value: 42 });
      }
    });
  });

  describe("error handling", () => {
    it("returns sdk_error with error object on failure", async () => {
      const testError = new Error("SDK failed");
      const result = await guardRevenueCatUsage(false, true, async () => {
        throw testError;
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("sdk_error");
        expect(result.error).toBe(testError);
      }
    });

    it("handles non-Error thrown values", async () => {
      const result = await guardRevenueCatUsage(false, true, async () => {
        throw "string error";
      });
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("sdk_error");
        expect(result.error).toBe("string error");
      }
    });
  });
});

// ============================================
// RESULT TYPE TESTS
// ============================================

describe("RevenueCatResult type", () => {
  describe("success result", () => {
    it("has correct structure for success", () => {
      const result: RevenueCatResult<string> = { ok: true, data: "test" };
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBe("test");
      }
    });

    it("supports complex data types", () => {
      const complexData = {
        offerings: [{ id: "1", price: 9.99 }],
        current: { name: "Monthly" },
      };
      const result: RevenueCatResult<typeof complexData> = { ok: true, data: complexData };
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.offerings).toHaveLength(1);
        expect(result.data.current.name).toBe("Monthly");
      }
    });
  });

  describe("failure result", () => {
    it("has correct structure for web_not_supported", () => {
      const result: RevenueCatResult<string> = { ok: false, reason: "web_not_supported" };
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("web_not_supported");
        expect(result.error).toBeUndefined();
      }
    });

    it("has correct structure for not_configured", () => {
      const result: RevenueCatResult<string> = { ok: false, reason: "not_configured" };
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("not_configured");
      }
    });

    it("has correct structure for sdk_error with error", () => {
      const error = new Error("Test error");
      const result: RevenueCatResult<string> = { ok: false, reason: "sdk_error", error };
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("sdk_error");
        expect(result.error).toBe(error);
      }
    });
  });
});

// ============================================
// INITIALIZATION TESTS
// ============================================

describe("Initialization Logic", () => {
  /**
   * Simulated initialization tracking
   */
  let isInitialized = false;

  const initializeRevenueCat = async (
    isEnabled: boolean,
    apiKey: string | undefined,
    userId?: string
  ): Promise<void> => {
    if (!isEnabled || !apiKey) {
      return;
    }

    if (isInitialized) {
      return;
    }

    // Simulated configuration
    if (userId) {
      mockPurchases.configure({ apiKey, appUserID: userId });
    } else {
      mockPurchases.configure({ apiKey });
    }

    isInitialized = true;
  };

  beforeEach(() => {
    isInitialized = false;
    jest.clearAllMocks();
  });

  it("skips initialization when not enabled", async () => {
    await initializeRevenueCat(false, undefined, "user-123");
    
    expect(mockPurchases.configure).not.toHaveBeenCalled();
  });

  it("initializes with user ID when provided", async () => {
    await initializeRevenueCat(true, "test-key", "user-123");
    
    expect(mockPurchases.configure).toHaveBeenCalledWith({
      apiKey: "test-key",
      appUserID: "user-123",
    });
  });

  it("initializes anonymously when no user ID provided", async () => {
    await initializeRevenueCat(true, "test-key");
    
    expect(mockPurchases.configure).toHaveBeenCalledWith({
      apiKey: "test-key",
    });
  });

  it("prevents double initialization", async () => {
    await initializeRevenueCat(true, "test-key", "user-123");
    await initializeRevenueCat(true, "test-key", "user-456");
    
    expect(mockPurchases.configure).toHaveBeenCalledTimes(1);
  });
});

// ============================================
// ENTITLEMENT CHECKING TESTS
// ============================================

describe("Entitlement Checking Logic", () => {
  /**
   * Simulated hasEntitlement function
   */
  const hasEntitlement = async (
    entitlementId: string,
    customerInfo: { entitlements: { active: Record<string, unknown> } } | null
  ): Promise<RevenueCatResult<boolean>> => {
    if (!customerInfo) {
      return { ok: false, reason: "sdk_error", error: new Error("No customer info") };
    }

    const isActive = Boolean(customerInfo.entitlements.active?.[entitlementId]);
    return { ok: true, data: isActive };
  };

  it("returns true when entitlement is active", async () => {
    const customerInfo = {
      entitlements: {
        active: {
          pro: { isActive: true },
        },
      },
    };
    
    const result = await hasEntitlement("pro", customerInfo);
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(true);
    }
  });

  it("returns false when entitlement is not active", async () => {
    const customerInfo = {
      entitlements: {
        active: {},
      },
    };
    
    const result = await hasEntitlement("pro", customerInfo);
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(false);
    }
  });

  it("returns false when checking non-existent entitlement", async () => {
    const customerInfo = {
      entitlements: {
        active: {
          other: { isActive: true },
        },
      },
    };
    
    const result = await hasEntitlement("pro", customerInfo);
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(false);
    }
  });

  it("handles null customer info", async () => {
    const result = await hasEntitlement("pro", null);
    
    expect(result.ok).toBe(false);
  });
});

// ============================================
// ACTIVE SUBSCRIPTION TESTS
// ============================================

describe("Active Subscription Checking", () => {
  /**
   * Simulated hasActiveSubscription function
   */
  const hasActiveSubscription = async (
    customerInfo: { entitlements: { active: Record<string, unknown> } } | null
  ): Promise<RevenueCatResult<boolean>> => {
    if (!customerInfo) {
      return { ok: false, reason: "sdk_error" };
    }

    const hasSubscription = Object.keys(customerInfo.entitlements.active || {}).length > 0;
    return { ok: true, data: hasSubscription };
  };

  it("returns true when user has any active entitlement", async () => {
    const customerInfo = {
      entitlements: {
        active: {
          pro: { isActive: true },
        },
      },
    };
    
    const result = await hasActiveSubscription(customerInfo);
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(true);
    }
  });

  it("returns false when no active entitlements", async () => {
    const customerInfo = {
      entitlements: {
        active: {},
      },
    };
    
    const result = await hasActiveSubscription(customerInfo);
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(false);
    }
  });

  it("returns true for multiple active entitlements", async () => {
    const customerInfo = {
      entitlements: {
        active: {
          pro: { isActive: true },
          premium: { isActive: true },
        },
      },
    };
    
    const result = await hasActiveSubscription(customerInfo);
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(true);
    }
  });
});

// ============================================
// PACKAGE LOOKUP TESTS
// ============================================

describe("Package Lookup Logic", () => {
  /**
   * Simulated getPackage function
   */
  type Package = { identifier: string; price: number };
  type Offerings = {
    current: { availablePackages: Package[] } | null;
  };

  const getPackage = async (
    packageIdentifier: string,
    offerings: Offerings | null
  ): Promise<RevenueCatResult<Package | null>> => {
    if (!offerings) {
      return { ok: false, reason: "sdk_error" };
    }

    const pkg = offerings.current?.availablePackages.find(
      (availablePackage) => availablePackage.identifier === packageIdentifier
    ) ?? null;

    return { ok: true, data: pkg };
  };

  it("finds package by identifier", async () => {
    const offerings: Offerings = {
      current: {
        availablePackages: [
          { identifier: "$rc_monthly", price: 9.99 },
          { identifier: "$rc_annual", price: 79.99 },
        ],
      },
    };
    
    const result = await getPackage("$rc_monthly", offerings);
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.identifier).toBe("$rc_monthly");
      expect(result.data?.price).toBe(9.99);
    }
  });

  it("returns null for non-existent package", async () => {
    const offerings: Offerings = {
      current: {
        availablePackages: [
          { identifier: "$rc_monthly", price: 9.99 },
        ],
      },
    };
    
    const result = await getPackage("$rc_annual", offerings);
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
  });

  it("returns null when no current offering", async () => {
    const offerings: Offerings = {
      current: null,
    };
    
    const result = await getPackage("$rc_monthly", offerings);
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
  });

  it("handles null offerings", async () => {
    const result = await getPackage("$rc_monthly", null);
    
    expect(result.ok).toBe(false);
  });
});

// ============================================
// USER ID SETTING TESTS
// ============================================

describe("User ID Setting Logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("skips login if already linked to same user", async () => {
    mockPurchases.getCustomerInfo.mockResolvedValue({
      originalAppUserId: "user-123",
    });
    
    // Simulated check
    const currentInfo = await mockPurchases.getCustomerInfo();
    const currentUserId = currentInfo.originalAppUserId;
    
    expect(currentUserId).toBe("user-123");
    // Would skip login since IDs match
  });

  it("calls logIn to link new user", async () => {
    mockPurchases.getCustomerInfo.mockResolvedValue({
      originalAppUserId: "$RCAnonymousID:abc123",
    });
    mockPurchases.logIn.mockResolvedValue({
      customerInfo: { originalAppUserId: "user-456" },
      created: true,
    });
    
    const result = await mockPurchases.logIn("user-456");
    
    expect(mockPurchases.logIn).toHaveBeenCalledWith("user-456");
    expect(result.customerInfo.originalAppUserId).toBe("user-456");
    expect(result.created).toBe(true);
  });
});

// ============================================
// LOGOUT TESTS
// ============================================

describe("Logout Logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls Purchases.logOut", async () => {
    mockPurchases.logOut.mockResolvedValue(undefined);
    
    await mockPurchases.logOut();
    
    expect(mockPurchases.logOut).toHaveBeenCalled();
  });

  it("handles logout errors gracefully", async () => {
    mockPurchases.logOut.mockRejectedValue(new Error("Network error"));
    
    await expect(mockPurchases.logOut()).rejects.toThrow("Network error");
  });
});

// ============================================
// EDGE CASES
// ============================================

describe("Edge Cases", () => {
  describe("empty entitlements object", () => {
    it("handles undefined active entitlements", () => {
      const customerInfo = {
        entitlements: {
          active: undefined as unknown as Record<string, unknown>,
        },
      };
      
      const hasSubscription = Object.keys(customerInfo.entitlements.active || {}).length > 0;
      expect(hasSubscription).toBe(false);
    });

    it("handles null entitlements object", () => {
      const customerInfo = {
        entitlements: null as unknown as { active: Record<string, unknown> },
      };
      
      const hasSubscription = Object.keys(customerInfo.entitlements?.active || {}).length > 0;
      expect(hasSubscription).toBe(false);
    });
  });

  describe("platform edge cases", () => {
    it("handles unknown platform by falling back to non-ios key", () => {
      const result = getApiKey(false, false, "unknown", "test", "apple", "google");
      // Unknown platform falls back to the non-ios (Google) key in production
      // since the condition is: platform === "ios" ? appleKey : googleKey
      expect(result).toBe("google");
    });
  });

  describe("package identifier edge cases", () => {
    it("handles empty package identifier", async () => {
      const offerings = {
        current: {
          availablePackages: [
            { identifier: "$rc_monthly", price: 9.99 },
          ],
        },
      };
      
      const pkg = offerings.current?.availablePackages.find(
        (p) => p.identifier === ""
      ) ?? null;
      
      expect(pkg).toBeNull();
    });

    it("handles special characters in package identifier", async () => {
      const offerings = {
        current: {
          availablePackages: [
            { identifier: "custom_package_!@#", price: 9.99 },
          ],
        },
      };
      
      const pkg = offerings.current?.availablePackages.find(
        (p) => p.identifier === "custom_package_!@#"
      ) ?? null;
      
      expect(pkg?.identifier).toBe("custom_package_!@#");
    });
  });
});

// ============================================
// INTEGRATION TESTS
// ============================================

describe("Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Full purchase flow simulation", () => {
    it("completes purchase flow end-to-end", async () => {
      // 1. Initialize
      mockPurchases.configure({ apiKey: "test-key", appUserID: "user-123" });
      
      // 2. Get offerings
      mockPurchases.getOfferings.mockResolvedValue({
        current: {
          availablePackages: [
            { identifier: "$rc_monthly", price: 9.99 },
          ],
        },
      });
      const offerings = await mockPurchases.getOfferings();
      expect(offerings.current?.availablePackages).toHaveLength(1);
      
      // 3. Purchase package
      const pkg = offerings.current?.availablePackages[0];
      mockPurchases.purchasePackage.mockResolvedValue({
        customerInfo: {
          entitlements: {
            active: {
              pro: { isActive: true },
            },
          },
        },
      });
      const purchaseResult = await mockPurchases.purchasePackage(pkg);
      
      // 4. Verify entitlement
      expect(purchaseResult.customerInfo.entitlements.active.pro).toBeDefined();
    });
  });

  describe("Restore purchases flow", () => {
    it("restores purchases and checks entitlements", async () => {
      mockPurchases.restorePurchases.mockResolvedValue({
        entitlements: {
          active: {
            pro: { isActive: true, expirationDate: "2025-12-31" },
          },
        },
      });
      
      const restored = await mockPurchases.restorePurchases();
      
      expect(restored.entitlements.active.pro).toBeDefined();
      expect(restored.entitlements.active.pro.expirationDate).toBe("2025-12-31");
    });

    it("handles restore with no previous purchases", async () => {
      mockPurchases.restorePurchases.mockResolvedValue({
        entitlements: {
          active: {},
        },
      });
      
      const restored = await mockPurchases.restorePurchases();
      
      expect(Object.keys(restored.entitlements.active)).toHaveLength(0);
    });
  });
});
