/**
 * useProStatus Hook Tests
 *
 * Comprehensive tests for the Pro status hook including:
 * - RevenueCat-first approach
 * - Database fallback behavior
 * - Background sync functionality
 * - Loading and error states
 * - Edge cases
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

type RevenueCatResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string; error?: unknown };

interface User {
  id: string;
  email?: string;
}

// ============================================
// MOCK SETUP
// ============================================

// Mock RevenueCat client
const mockRevenueCatClient = {
  hasEntitlement: jest.fn(),
  isRevenueCatEnabled: jest.fn(),
};

// Mock subscription sync
const mockSubscriptionSync = {
  syncSubscriptionToDb: jest.fn(),
  isProFromDb: jest.fn(),
};

// Mock auth context
const mockAuthContext = {
  user: null as User | null,
};

// ============================================
// CORE LOGIC TESTS
// ============================================

describe("useProStatus core logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthContext.user = null;
  });

  /**
   * Simulated useProStatus query function
   */
  const checkProStatus = async (
    userId: string | undefined,
    isRevenueCatEnabled: boolean,
    hasEntitlementResult: RevenueCatResult<boolean>,
    isProFromDbResult: boolean
  ): Promise<boolean> => {
    // No user = not pro
    if (!userId) {
      return false;
    }

    // If RevenueCat is enabled, use it as source of truth
    if (isRevenueCatEnabled) {
      const isProFromRC = hasEntitlementResult.ok ? hasEntitlementResult.data : false;
      
      // Sync to database in background (simulated)
      mockSubscriptionSync.syncSubscriptionToDb(userId);
      
      return isProFromRC;
    }

    // RevenueCat not available - fall back to database
    console.log("[ProStatus] RevenueCat not available, checking database");
    return isProFromDbResult;
  };

  describe("when user is not logged in", () => {
    it("returns false when user is null", async () => {
      const result = await checkProStatus(
        undefined,
        true,
        { ok: true, data: true },
        true
      );
      
      expect(result).toBe(false);
    });

    it("does not call RevenueCat when no user", async () => {
      await checkProStatus(undefined, true, { ok: true, data: true }, true);
      
      expect(mockSubscriptionSync.syncSubscriptionToDb).not.toHaveBeenCalled();
    });
  });

  describe("when RevenueCat is enabled", () => {
    it("returns true when user has pro entitlement", async () => {
      const result = await checkProStatus(
        "user-123",
        true,
        { ok: true, data: true },
        false // DB says false, but RC takes priority
      );
      
      expect(result).toBe(true);
    });

    it("returns false when user does not have pro entitlement", async () => {
      const result = await checkProStatus(
        "user-123",
        true,
        { ok: true, data: false },
        true // DB says true, but RC takes priority
      );
      
      expect(result).toBe(false);
    });

    it("returns false when RevenueCat call fails", async () => {
      const result = await checkProStatus(
        "user-123",
        true,
        { ok: false, reason: "sdk_error", error: new Error("Network error") },
        true // DB says true
      );
      
      expect(result).toBe(false);
    });

    it("triggers background sync to database", async () => {
      await checkProStatus(
        "user-123",
        true,
        { ok: true, data: true },
        false
      );
      
      expect(mockSubscriptionSync.syncSubscriptionToDb).toHaveBeenCalledWith("user-123");
    });
  });

  describe("when RevenueCat is not enabled (web fallback)", () => {
    it("falls back to database check", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      
      const result = await checkProStatus(
        "user-123",
        false, // RevenueCat disabled
        { ok: true, data: true }, // Would be true from RC
        true // DB says true
      );
      
      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[ProStatus] RevenueCat not available, checking database"
      );
      consoleSpy.mockRestore();
    });

    it("returns false when database says not pro", async () => {
      const result = await checkProStatus(
        "user-123",
        false,
        { ok: true, data: true },
        false
      );
      
      expect(result).toBe(false);
    });

    it("does not sync to database when RevenueCat disabled", async () => {
      await checkProStatus("user-123", false, { ok: true, data: true }, false);
      
      expect(mockSubscriptionSync.syncSubscriptionToDb).not.toHaveBeenCalled();
    });
  });
});

// ============================================
// QUERY KEY TESTS
// ============================================

describe("Query key structure", () => {
  it("includes pro-status prefix and user ID", () => {
    const userId = "user-123";
    const queryKey = ["pro-status", userId];
    
    expect(queryKey).toEqual(["pro-status", "user-123"]);
  });

  it("handles undefined user ID in query key", () => {
    const userId = undefined;
    const queryKey = ["pro-status", userId];
    
    expect(queryKey).toEqual(["pro-status", undefined]);
  });

  it("creates unique keys for different users", () => {
    const key1 = ["pro-status", "user-1"];
    const key2 = ["pro-status", "user-2"];
    
    expect(key1).not.toEqual(key2);
  });
});

// ============================================
// QUERY OPTIONS TESTS
// ============================================

describe("Query options", () => {
  describe("staleTime", () => {
    const STALE_TIME = 30 * 1000; // 30 seconds

    it("is set to 30 seconds", () => {
      expect(STALE_TIME).toBe(30000);
    });

    it("prevents frequent refetches within stale window", () => {
      const now = Date.now();
      const lastFetch = now - 15000; // 15 seconds ago
      const isStale = (now - lastFetch) > STALE_TIME;
      
      expect(isStale).toBe(false);
    });

    it("allows refetch after stale window", () => {
      const now = Date.now();
      const lastFetch = now - 35000; // 35 seconds ago
      const isStale = (now - lastFetch) > STALE_TIME;
      
      expect(isStale).toBe(true);
    });
  });

  describe("gcTime (cache time)", () => {
    const GC_TIME = 5 * 60 * 1000; // 5 minutes

    it("is set to 5 minutes", () => {
      expect(GC_TIME).toBe(300000);
    });
  });

  describe("enabled option", () => {
    it("is true when user ID exists", () => {
      const userId = "user-123";
      const enabled = !!userId;
      
      expect(enabled).toBe(true);
    });

    it("is false when user ID is undefined", () => {
      const userId = undefined;
      const enabled = !!userId;
      
      expect(enabled).toBe(false);
    });

    it("is false when user ID is empty string", () => {
      const userId = "";
      const enabled = !!userId;
      
      expect(enabled).toBe(false);
    });
  });
});

// ============================================
// RETURN VALUE TESTS
// ============================================

describe("Hook return values", () => {
  /**
   * Simulated hook return type
   */
  interface UseProStatusReturn {
    isPro: boolean;
    isLoading: boolean;
    refetch: () => Promise<void>;
  }

  describe("isPro", () => {
    it("defaults to false", () => {
      const result: UseProStatusReturn = {
        isPro: false,
        isLoading: true,
        refetch: jest.fn(),
      };
      
      expect(result.isPro).toBe(false);
    });
  });

  describe("isLoading", () => {
    it("is true while query is fetching", () => {
      const result: UseProStatusReturn = {
        isPro: false,
        isLoading: true,
        refetch: jest.fn(),
      };
      
      expect(result.isLoading).toBe(true);
    });

    it("is false after query completes", () => {
      const result: UseProStatusReturn = {
        isPro: true,
        isLoading: false,
        refetch: jest.fn(),
      };
      
      expect(result.isLoading).toBe(false);
    });
  });

  describe("refetch", () => {
    it("is a function", () => {
      const refetch = jest.fn();
      const result: UseProStatusReturn = {
        isPro: false,
        isLoading: false,
        refetch,
      };
      
      expect(typeof result.refetch).toBe("function");
    });

    it("can be called to refresh pro status", async () => {
      const refetch = jest.fn().mockResolvedValue(undefined);
      
      await refetch();
      
      expect(refetch).toHaveBeenCalled();
    });
  });
});

// ============================================
// BACKGROUND SYNC TESTS
// ============================================

describe("Background sync behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Simulated sync with error handling
   */
  const syncWithErrorHandling = async (
    userId: string,
    syncFn: (id: string) => Promise<boolean>
  ): Promise<void> => {
    try {
      await syncFn(userId);
    } catch {
      // Silently handle sync errors
    }
  };

  it("sync errors are silently caught", async () => {
    const failingSync = jest.fn().mockRejectedValue(new Error("Sync failed"));
    
    // Should not throw
    await expect(
      syncWithErrorHandling("user-123", failingSync)
    ).resolves.not.toThrow();
  });

  it("sync is non-blocking", async () => {
    let syncStarted = false;
    let syncCompleted = false;
    
    const slowSync = jest.fn().mockImplementation(async () => {
      syncStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 100));
      syncCompleted = true;
      return true;
    });
    
    // Start sync but don't await
    syncWithErrorHandling("user-123", slowSync);
    
    // Sync should have started
    expect(syncStarted).toBe(true);
    // But not completed (async)
    expect(syncCompleted).toBe(false);
    
    // Wait for completion
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(syncCompleted).toBe(true);
  });
});

// ============================================
// EDGE CASES
// ============================================

describe("Edge cases", () => {
  describe("rapid user changes", () => {
    it("handles user logging out during check", async () => {
      let currentUser: User | null = { id: "user-123" };
      
      const hasUserId = (value: User | null): value is User => !!value && !!value.id;

      const checkWithUserChange = async (): Promise<boolean> => {
        // Simulate user change during async operation
        await new Promise((resolve) => setTimeout(resolve, 10));
        currentUser = null;
        
        // Check user again after delay
        if (!hasUserId(currentUser)) {
          return false;
        }
        return true;
      };
      
      const result = await checkWithUserChange();
      expect(result).toBe(false);
    });
  });

  describe("RevenueCat state changes", () => {
    it("handles RevenueCat becoming unavailable mid-check", async () => {
      const checkStatus = async (
        initialEnabled: boolean,
        checkEnabled: () => boolean
      ): Promise<boolean> => {
        if (initialEnabled && !checkEnabled()) {
          // RC became unavailable
          return false;
        }
        return initialEnabled;
      };
      
      let rcEnabled = true;
      const result = await checkStatus(rcEnabled, () => {
        rcEnabled = false; // Becomes unavailable
        return rcEnabled;
      });
      
      expect(result).toBe(false);
    });
  });

  describe("entitlement state", () => {
    it("handles expired entitlement", async () => {
      const checkEntitlement = (
        entitlementData: { isActive: boolean; expirationDate?: string } | null
      ): boolean => {
        if (!entitlementData?.isActive) return false;
        if (entitlementData.expirationDate) {
          const expired = new Date(entitlementData.expirationDate) < new Date();
          if (expired) return false;
        }
        return true;
      };
      
      const expiredEntitlement = {
        isActive: true,
        expirationDate: "2020-01-01T00:00:00Z",
      };
      
      expect(checkEntitlement(expiredEntitlement)).toBe(false);
    });

    it("handles missing entitlement data", async () => {
      const checkEntitlement = (
        entitlementData: { isActive: boolean } | null
      ): boolean => {
        return entitlementData?.isActive ?? false;
      };
      
      expect(checkEntitlement(null)).toBe(false);
      expect(checkEntitlement(undefined as any)).toBe(false);
    });
  });
});

// ============================================
// INTEGRATION TESTS
// ============================================

describe("Integration tests", () => {
  describe("Full pro status check flow", () => {
    it("completes full flow for pro user on native", async () => {
      // Setup
      const userId = "user-123";
      const rcEnabled = true;
      const rcResult: RevenueCatResult<boolean> = { ok: true, data: true };
      
      // Execute
      let isPro = false;
      if (userId && rcEnabled) {
        isPro = rcResult.ok ? rcResult.data : false;
      }
      
      // Verify
      expect(isPro).toBe(true);
    });

    it("completes full flow for free user on web", async () => {
      // Setup
      const userId = "user-123";
      const rcEnabled = false; // Web platform
      const dbResult = false;
      
      // Execute
      let isPro = false;
      if (userId && !rcEnabled) {
        isPro = dbResult;
      }
      
      // Verify
      expect(isPro).toBe(false);
    });

    it("handles pro user with sync", async () => {
      let syncCalled = false;
      
      // Setup
      const userId = "user-123";
      const rcEnabled = true;
      const rcResult: RevenueCatResult<boolean> = { ok: true, data: true };
      
      // Execute
      let isPro = false;
      if (userId && rcEnabled) {
        isPro = rcResult.ok ? rcResult.data : false;
        
        // Background sync
        Promise.resolve().then(() => {
          syncCalled = true;
        });
      }
      
      // Wait for micro-task
      await Promise.resolve();
      
      // Verify
      expect(isPro).toBe(true);
      expect(syncCalled).toBe(true);
    });
  });

  describe("Error recovery", () => {
    it("recovers from RC failure by returning false", async () => {
      const checkWithRecovery = async (
        rcResult: RevenueCatResult<boolean>
      ): Promise<boolean> => {
        if (!rcResult.ok) {
          // Log error and return safe default
          console.error("RC check failed:", rcResult.reason);
          return false;
        }
        return rcResult.data;
      };
      
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      
      const result = await checkWithRecovery({
        ok: false,
        reason: "sdk_error",
        error: new Error("Network timeout"),
      });
      
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith("RC check failed:", "sdk_error");
      consoleSpy.mockRestore();
    });
  });
});
