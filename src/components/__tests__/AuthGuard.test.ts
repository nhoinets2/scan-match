/**
 * AuthGuard Component Tests
 *
 * Tests for the authentication navigation guard logic.
 * AuthGuard handles:
 * - Redirecting unauthenticated users to login
 * - Redirecting authenticated users on auth screens to main app
 * - Checking onboarding completion status
 * - Preventing duplicate redirects
 */

// ─────────────────────────────────────────────
// Navigation State Simulation
// ─────────────────────────────────────────────

type NavigationSegment = string;
type User = { id: string; email: string } | null;

interface AuthGuardState {
  user: User;
  isAuthLoading: boolean;
  isOnboardingLoading: boolean;
  onboardingComplete: boolean;
  segments: NavigationSegment[];
  navigationReady: boolean;
  hasRedirected: boolean;
  isRedirecting: boolean;
}

interface RedirectDecision {
  shouldRedirect: boolean;
  targetPath: string | null;
  reason: string;
}

/**
 * Core redirect logic from AuthGuard
 * Determines where to redirect based on auth state and current location
 */
function computeRedirectDecision(state: AuthGuardState): RedirectDecision {
  const {
    user,
    isAuthLoading,
    isOnboardingLoading,
    onboardingComplete,
    segments,
    navigationReady,
    hasRedirected,
  } = state;

  // Wait for navigation to be ready
  if (!navigationReady) {
    return {
      shouldRedirect: false,
      targetPath: null,
      reason: "Navigation not ready",
    };
  }

  // Don't redirect while loading auth status
  if (isAuthLoading) {
    return {
      shouldRedirect: false,
      targetPath: null,
      reason: "Auth is loading",
    };
  }

  // Prevent duplicate redirects
  if (hasRedirected) {
    return {
      shouldRedirect: false,
      targetPath: null,
      reason: "Already redirected",
    };
  }

  const inAuthGroup = segments[0] === "login" || segments[0] === "signup";
  const inOnboarding = segments[0] === "onboarding";
  const inMainApp = segments[0] === "(tabs)";

  // User not signed in and not on auth screens
  if (!user && !inAuthGroup) {
    return {
      shouldRedirect: true,
      targetPath: "/login",
      reason: "User not authenticated",
    };
  }

  // User signed in but on auth screens
  if (user && inAuthGroup) {
    // Wait for onboarding status to load
    if (isOnboardingLoading) {
      return {
        shouldRedirect: false,
        targetPath: null,
        reason: "Onboarding status loading",
      };
    }

    if (onboardingComplete) {
      return {
        shouldRedirect: true,
        targetPath: "/",
        reason: "User completed onboarding, redirecting to main app",
      };
    } else {
      return {
        shouldRedirect: true,
        targetPath: "/onboarding",
        reason: "User needs to complete onboarding",
      };
    }
  }

  // User signed in, not on onboarding/auth/main app, but hasn't completed onboarding
  if (user && !inOnboarding && !inAuthGroup && !inMainApp && !isOnboardingLoading && !onboardingComplete) {
    return {
      shouldRedirect: true,
      targetPath: "/onboarding",
      reason: "User needs to complete onboarding",
    };
  }

  // No redirect needed
  return {
    shouldRedirect: false,
    targetPath: null,
    reason: "User in correct location",
  };
}

/**
 * Determine what UI state to show based on auth/navigation state
 */
type UIState = "loading" | "redirecting_to_login" | "redirecting_from_auth" | "redirecting" | "children";

function computeUIState(state: AuthGuardState): UIState {
  const { user, isAuthLoading, isRedirecting, segments } = state;
  
  const inAuthGroup = segments[0] === "login" || segments[0] === "signup";
  const inMainApp = segments[0] === "(tabs)";
  const inOnboarding = segments[0] === "onboarding";

  // Auth is loading - show landing image
  if (isAuthLoading) {
    return "loading";
  }

  // Not logged in and not on auth screens - show landing with spinner
  if (!user && !inAuthGroup) {
    return "redirecting_to_login";
  }

  // Logged in but on auth screens - show landing with spinner
  if (user && inAuthGroup) {
    return "redirecting_from_auth";
  }

  // Active redirect in progress
  if (isRedirecting) {
    return "redirecting";
  }

  // Normal state - show children
  return "children";
}

// ─────────────────────────────────────────────
// Redirect Logic Tests
// ─────────────────────────────────────────────

describe("AuthGuard redirect logic", () => {
  const authenticatedUser: User = { id: "user-123", email: "test@example.com" };

  describe("navigation not ready", () => {
    it("does not redirect when navigation is not ready", () => {
      const state: AuthGuardState = {
        user: null,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: false,
        segments: ["login"],
        navigationReady: false,
        hasRedirected: false,
        isRedirecting: false,
      };

      const decision = computeRedirectDecision(state);

      expect(decision.shouldRedirect).toBe(false);
      expect(decision.reason).toBe("Navigation not ready");
    });
  });

  describe("auth loading", () => {
    it("does not redirect while auth is loading", () => {
      const state: AuthGuardState = {
        user: null,
        isAuthLoading: true,
        isOnboardingLoading: false,
        onboardingComplete: false,
        segments: ["(tabs)"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      const decision = computeRedirectDecision(state);

      expect(decision.shouldRedirect).toBe(false);
      expect(decision.reason).toBe("Auth is loading");
    });
  });

  describe("duplicate redirect prevention", () => {
    it("does not redirect if already redirected", () => {
      const state: AuthGuardState = {
        user: null,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: false,
        segments: ["(tabs)"],
        navigationReady: true,
        hasRedirected: true,
        isRedirecting: false,
      };

      const decision = computeRedirectDecision(state);

      expect(decision.shouldRedirect).toBe(false);
      expect(decision.reason).toBe("Already redirected");
    });
  });

  describe("unauthenticated user", () => {
    it("redirects to login when not on auth screens", () => {
      const state: AuthGuardState = {
        user: null,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: false,
        segments: ["(tabs)"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      const decision = computeRedirectDecision(state);

      expect(decision.shouldRedirect).toBe(true);
      expect(decision.targetPath).toBe("/login");
    });

    it("does not redirect when already on login", () => {
      const state: AuthGuardState = {
        user: null,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: false,
        segments: ["login"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      const decision = computeRedirectDecision(state);

      expect(decision.shouldRedirect).toBe(false);
      expect(decision.reason).toBe("User in correct location");
    });

    it("does not redirect when on signup", () => {
      const state: AuthGuardState = {
        user: null,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: false,
        segments: ["signup"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      const decision = computeRedirectDecision(state);

      expect(decision.shouldRedirect).toBe(false);
    });
  });

  describe("authenticated user on auth screens", () => {
    it("waits for onboarding status before redirecting", () => {
      const state: AuthGuardState = {
        user: authenticatedUser,
        isAuthLoading: false,
        isOnboardingLoading: true,
        onboardingComplete: false,
        segments: ["login"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      const decision = computeRedirectDecision(state);

      expect(decision.shouldRedirect).toBe(false);
      expect(decision.reason).toBe("Onboarding status loading");
    });

    it("redirects to main app when onboarding complete", () => {
      const state: AuthGuardState = {
        user: authenticatedUser,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: true,
        segments: ["login"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      const decision = computeRedirectDecision(state);

      expect(decision.shouldRedirect).toBe(true);
      expect(decision.targetPath).toBe("/");
    });

    it("redirects to onboarding when not complete", () => {
      const state: AuthGuardState = {
        user: authenticatedUser,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: false,
        segments: ["login"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      const decision = computeRedirectDecision(state);

      expect(decision.shouldRedirect).toBe(true);
      expect(decision.targetPath).toBe("/onboarding");
    });
  });

  describe("authenticated user not in correct location", () => {
    it("redirects to onboarding when on other routes without completing it", () => {
      const state: AuthGuardState = {
        user: authenticatedUser,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: false,
        segments: ["account"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      const decision = computeRedirectDecision(state);

      expect(decision.shouldRedirect).toBe(true);
      expect(decision.targetPath).toBe("/onboarding");
    });

    it("does not redirect when on onboarding", () => {
      const state: AuthGuardState = {
        user: authenticatedUser,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: false,
        segments: ["onboarding"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      const decision = computeRedirectDecision(state);

      expect(decision.shouldRedirect).toBe(false);
    });

    it("does not redirect when in main app with onboarding complete", () => {
      const state: AuthGuardState = {
        user: authenticatedUser,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: true,
        segments: ["(tabs)"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      const decision = computeRedirectDecision(state);

      expect(decision.shouldRedirect).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
// UI State Tests
// ─────────────────────────────────────────────

describe("AuthGuard UI state", () => {
  const authenticatedUser: User = { id: "user-123", email: "test@example.com" };

  describe("loading states", () => {
    it("shows loading when auth is loading", () => {
      const state: AuthGuardState = {
        user: null,
        isAuthLoading: true,
        isOnboardingLoading: false,
        onboardingComplete: false,
        segments: ["(tabs)"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      expect(computeUIState(state)).toBe("loading");
    });
  });

  describe("redirect states", () => {
    it("shows redirecting_to_login when user not authenticated", () => {
      const state: AuthGuardState = {
        user: null,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: false,
        segments: ["(tabs)"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      expect(computeUIState(state)).toBe("redirecting_to_login");
    });

    it("shows redirecting_from_auth when user on auth screens", () => {
      const state: AuthGuardState = {
        user: authenticatedUser,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: true,
        segments: ["login"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      expect(computeUIState(state)).toBe("redirecting_from_auth");
    });

    it("shows redirecting when redirect is in progress", () => {
      const state: AuthGuardState = {
        user: authenticatedUser,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: true,
        segments: ["(tabs)"],
        navigationReady: true,
        hasRedirected: true,
        isRedirecting: true,
      };

      expect(computeUIState(state)).toBe("redirecting");
    });
  });

  describe("normal state", () => {
    it("shows children when in correct location", () => {
      const state: AuthGuardState = {
        user: authenticatedUser,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: true,
        segments: ["(tabs)"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      expect(computeUIState(state)).toBe("children");
    });

    it("shows children when unauthenticated on login", () => {
      const state: AuthGuardState = {
        user: null,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: false,
        segments: ["login"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      expect(computeUIState(state)).toBe("children");
    });
  });
});

// ─────────────────────────────────────────────
// Route Segment Detection Tests
// ─────────────────────────────────────────────

describe("route segment detection", () => {
  function isInAuthGroup(segments: string[]): boolean {
    return segments[0] === "login" || segments[0] === "signup";
  }

  function isInOnboarding(segments: string[]): boolean {
    return segments[0] === "onboarding";
  }

  function isInMainApp(segments: string[]): boolean {
    return segments[0] === "(tabs)";
  }

  describe("auth group detection", () => {
    it("detects login screen", () => {
      expect(isInAuthGroup(["login"])).toBe(true);
    });

    it("detects signup screen", () => {
      expect(isInAuthGroup(["signup"])).toBe(true);
    });

    it("rejects other screens", () => {
      expect(isInAuthGroup(["(tabs)"])).toBe(false);
      expect(isInAuthGroup(["onboarding"])).toBe(false);
      expect(isInAuthGroup(["account"])).toBe(false);
    });
  });

  describe("onboarding detection", () => {
    it("detects onboarding screen", () => {
      expect(isInOnboarding(["onboarding"])).toBe(true);
    });

    it("rejects other screens", () => {
      expect(isInOnboarding(["(tabs)"])).toBe(false);
      expect(isInOnboarding(["login"])).toBe(false);
    });
  });

  describe("main app detection", () => {
    it("detects tabs screen", () => {
      expect(isInMainApp(["(tabs)"])).toBe(true);
    });

    it("rejects other screens", () => {
      expect(isInMainApp(["login"])).toBe(false);
      expect(isInMainApp(["onboarding"])).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
// State Transition Tests
// ─────────────────────────────────────────────

describe("AuthGuard state transitions", () => {
  const authenticatedUser: User = { id: "user-123", email: "test@example.com" };

  describe("login flow", () => {
    it("user starts on login → signs in → redirected to onboarding", () => {
      // Step 1: User on login, not authenticated
      const step1: AuthGuardState = {
        user: null,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: false,
        segments: ["login"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      let decision = computeRedirectDecision(step1);
      expect(decision.shouldRedirect).toBe(false);
      expect(computeUIState(step1)).toBe("children");

      // Step 2: User authenticates (onboarding loading)
      const step2: AuthGuardState = {
        ...step1,
        user: authenticatedUser,
        isOnboardingLoading: true,
      };

      decision = computeRedirectDecision(step2);
      expect(decision.shouldRedirect).toBe(false);
      expect(decision.reason).toBe("Onboarding status loading");

      // Step 3: Onboarding not complete
      const step3: AuthGuardState = {
        ...step2,
        isOnboardingLoading: false,
        onboardingComplete: false,
      };

      decision = computeRedirectDecision(step3);
      expect(decision.shouldRedirect).toBe(true);
      expect(decision.targetPath).toBe("/onboarding");
    });

    it("returning user → signs in → redirected to main app", () => {
      // Returning user who completed onboarding
      const state: AuthGuardState = {
        user: authenticatedUser,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: true,
        segments: ["login"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      const decision = computeRedirectDecision(state);
      expect(decision.shouldRedirect).toBe(true);
      expect(decision.targetPath).toBe("/");
    });
  });

  describe("logout flow", () => {
    it("user logs out → redirected to login", () => {
      // Step 1: User authenticated in main app
      const step1: AuthGuardState = {
        user: authenticatedUser,
        isAuthLoading: false,
        isOnboardingLoading: false,
        onboardingComplete: true,
        segments: ["(tabs)"],
        navigationReady: true,
        hasRedirected: false,
        isRedirecting: false,
      };

      let decision = computeRedirectDecision(step1);
      expect(decision.shouldRedirect).toBe(false);

      // Step 2: User logs out (auth loading briefly)
      const step2: AuthGuardState = {
        ...step1,
        user: null,
        isAuthLoading: true,
      };

      decision = computeRedirectDecision(step2);
      expect(decision.shouldRedirect).toBe(false);
      expect(decision.reason).toBe("Auth is loading");

      // Step 3: Auth loading complete, user null
      const step3: AuthGuardState = {
        ...step2,
        isAuthLoading: false,
      };

      decision = computeRedirectDecision(step3);
      expect(decision.shouldRedirect).toBe(true);
      expect(decision.targetPath).toBe("/login");
    });
  });
});

// ─────────────────────────────────────────────
// Edge Cases
// ─────────────────────────────────────────────

describe("AuthGuard edge cases", () => {
  const authenticatedUser: User = { id: "user-123", email: "test@example.com" };

  it("handles empty segments array", () => {
    const state: AuthGuardState = {
      user: null,
      isAuthLoading: false,
      isOnboardingLoading: false,
      onboardingComplete: false,
      segments: [],
      navigationReady: true,
      hasRedirected: false,
      isRedirecting: false,
    };

    const decision = computeRedirectDecision(state);
    expect(decision.shouldRedirect).toBe(true);
    expect(decision.targetPath).toBe("/login");
  });

  it("handles deep nested routes in tabs", () => {
    const state: AuthGuardState = {
      user: authenticatedUser,
      isAuthLoading: false,
      isOnboardingLoading: false,
      onboardingComplete: true,
      segments: ["(tabs)", "wardrobe", "item", "123"],
      navigationReady: true,
      hasRedirected: false,
      isRedirecting: false,
    };

    const decision = computeRedirectDecision(state);
    expect(decision.shouldRedirect).toBe(false);
    expect(decision.reason).toBe("User in correct location");
  });

  it("handles onboarding nested routes", () => {
    const state: AuthGuardState = {
      user: authenticatedUser,
      isAuthLoading: false,
      isOnboardingLoading: false,
      onboardingComplete: false,
      segments: ["onboarding", "step2"],
      navigationReady: true,
      hasRedirected: false,
      isRedirecting: false,
    };

    const decision = computeRedirectDecision(state);
    expect(decision.shouldRedirect).toBe(false);
  });
});
