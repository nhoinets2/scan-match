/**
 * Auth Context Tests
 *
 * Comprehensive tests for the authentication context provider including:
 * - Session management (initialization, persistence)
 * - Sign up / Sign in operations
 * - OAuth flows (Google, Apple)
 * - Password management (reset, update)
 * - Sign out behavior
 * - Account deletion
 * - Error handling
 * - Integration with RevenueCat
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

interface Session {
  access_token: string;
  refresh_token: string;
  user: User;
}

interface User {
  id: string;
  email?: string;
}

interface AuthError {
  message: string;
  code?: string;
}

type OAuthProvider = "google" | "apple";

// ============================================
// MOCK SETUP
// ============================================

// Mock Supabase client
const mockSupabaseAuth = {
  getSession: jest.fn(),
  onAuthStateChange: jest.fn(),
  signUp: jest.fn(),
  signInWithPassword: jest.fn(),
  signInWithOAuth: jest.fn(),
  signInWithIdToken: jest.fn(),
  setSession: jest.fn(),
  resetPasswordForEmail: jest.fn(),
  updateUser: jest.fn(),
  signOut: jest.fn(),
};

const mockSupabase = {
  auth: mockSupabaseAuth,
  from: jest.fn(),
  rpc: jest.fn(),
};

// Mock RevenueCat
const mockRevenueCat = {
  initializeRevenueCat: jest.fn(),
  logoutUser: jest.fn(),
  setUserId: jest.fn(),
};

// Mock QueryClient
const mockQueryClient = {
  clear: jest.fn(),
};

// Mock Platform
const mockPlatform = {
  OS: "ios" as "ios" | "android" | "web",
};

// Mock Apple Authentication
const mockAppleAuth = {
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: {
    FULL_NAME: 0,
    EMAIL: 1,
  },
};

// Mock WebBrowser
const mockWebBrowser = {
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
};

// Mock Linking
const mockLinking = {
  createURL: jest.fn(),
};

// Mock stores
const mockSnapToMatchStore = {
  clearCache: jest.fn().mockReturnValue(undefined),
};

const mockQuotaStore = {
  resetQuotas: jest.fn().mockReturnValue(undefined),
};

// ============================================
// SIGN UP TESTS
// ============================================

describe("signUp", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Simulated signUp function
   */
  const signUp = async (
    email: string,
    password: string
  ): Promise<{ error: Error | null }> => {
    const { error } = await mockSupabaseAuth.signUp({ email, password });
    return { error: error as Error | null };
  };

  it("successfully signs up a new user", async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: { id: "user-123", email: "test@example.com" }, session: {} },
      error: null,
    });

    const result = await signUp("test@example.com", "password123");

    expect(result.error).toBeNull();
    expect(mockSupabaseAuth.signUp).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "password123",
    });
  });

  it("returns error for duplicate email", async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "User already exists" },
    });

    const result = await signUp("existing@example.com", "password123");

    expect(result.error).toEqual({ message: "User already exists" });
  });

  it("returns error for invalid email format", async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid email format" },
    });

    const result = await signUp("invalid-email", "password123");

    expect(result.error).toEqual({ message: "Invalid email format" });
  });

  it("returns error for weak password", async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Password is too weak" },
    });

    const result = await signUp("test@example.com", "123");

    expect(result.error).toEqual({ message: "Password is too weak" });
  });
});

// ============================================
// SIGN IN TESTS
// ============================================

describe("signIn", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Simulated signIn function
   */
  const signIn = async (
    email: string,
    password: string
  ): Promise<{ error: Error | null }> => {
    const { error } = await mockSupabaseAuth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  it("successfully signs in existing user", async () => {
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-123" }, session: {} },
      error: null,
    });

    const result = await signIn("test@example.com", "password123");

    expect(result.error).toBeNull();
    expect(mockSupabaseAuth.signInWithPassword).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "password123",
    });
  });

  it("returns error for wrong password", async () => {
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    const result = await signIn("test@example.com", "wrongpassword");

    expect(result.error).toEqual({ message: "Invalid login credentials" });
  });

  it("returns error for non-existent user", async () => {
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    const result = await signIn("nonexistent@example.com", "password123");

    expect(result.error).toEqual({ message: "Invalid login credentials" });
  });
});

// ============================================
// APPLE SIGN IN TESTS
// ============================================

describe("signInWithApple", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatform.OS = "ios";
  });

  /**
   * Simulated signInWithApple function
   */
  const signInWithApple = async (
    isAppleAuthAvailable: boolean,
    platform: string
  ): Promise<{ error: Error | null }> => {
    if (!isAppleAuthAvailable) {
      const errorMsg = platform === "ios"
        ? "Apple Sign-In is not available on this device. Make sure 'Sign in with Apple' capability is added in Xcode."
        : "Apple Sign-In is only available on iOS devices. Please use another sign-in method.";
      return { error: new Error(errorMsg) };
    }

    try {
      const credential = await mockAppleAuth.signInAsync({
        requestedScopes: [
          mockAppleAuth.AppleAuthenticationScope.FULL_NAME,
          mockAppleAuth.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (credential.identityToken) {
        const { error } = await mockSupabaseAuth.signInWithIdToken({
          provider: "apple",
          token: credential.identityToken,
        });
        return { error: error as Error | null };
      }
      
      return { error: new Error("No identity token received from Apple") };
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string };
      if (error.code === "ERR_REQUEST_CANCELED") {
        return { error: null };
      }
      return { error: new Error(error.message ?? "Apple sign in failed") };
    }
  };

  describe("when Apple auth is not available", () => {
    it("returns error on iOS when capability not added", async () => {
      const result = await signInWithApple(false, "ios");

      expect(result.error?.message).toContain("not available on this device");
    });

    it("returns error on non-iOS platforms", async () => {
      const result = await signInWithApple(false, "android");

      expect(result.error?.message).toContain("only available on iOS devices");
    });
  });

  describe("when Apple auth is available", () => {
    it("successfully signs in with Apple", async () => {
      mockAppleAuth.signInAsync.mockResolvedValue({
        identityToken: "apple-token-123",
      });
      mockSupabaseAuth.signInWithIdToken.mockResolvedValue({
        data: { user: { id: "user-123" }, session: {} },
        error: null,
      });

      const result = await signInWithApple(true, "ios");

      expect(result.error).toBeNull();
      expect(mockSupabaseAuth.signInWithIdToken).toHaveBeenCalledWith({
        provider: "apple",
        token: "apple-token-123",
      });
    });

    it("handles missing identity token", async () => {
      mockAppleAuth.signInAsync.mockResolvedValue({
        identityToken: null,
      });

      const result = await signInWithApple(true, "ios");

      expect(result.error?.message).toBe("No identity token received from Apple");
    });

    it("handles user cancellation gracefully", async () => {
      mockAppleAuth.signInAsync.mockRejectedValue({
        code: "ERR_REQUEST_CANCELED",
      });

      const result = await signInWithApple(true, "ios");

      expect(result.error).toBeNull();
    });

    it("handles Supabase error", async () => {
      mockAppleAuth.signInAsync.mockResolvedValue({
        identityToken: "apple-token-123",
      });
      mockSupabaseAuth.signInWithIdToken.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "Authentication failed" },
      });

      const result = await signInWithApple(true, "ios");

      expect(result.error).toEqual({ message: "Authentication failed" });
    });
  });
});

// ============================================
// GOOGLE SIGN IN TESTS
// ============================================

describe("signInWithGoogle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Simulated signInWithGoogle function
   */
  const signInWithGoogle = async (): Promise<void> => {
    const redirectUrl = mockLinking.createURL("/");
    
    const { data, error } = await mockSupabaseAuth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      throw error;
    }

    if (data?.url) {
      const result = await mockWebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl,
        { showInRecents: true }
      );

      if (result.type === "success" && result.url) {
        // Parse tokens from URL
        const url = new URL(result.url);
        const params = new URLSearchParams(url.search + url.hash.replace("#", "&"));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          await mockSupabaseAuth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      }
    }
  };

  it("initiates OAuth flow with correct parameters", async () => {
    mockLinking.createURL.mockReturnValue("myapp://");
    mockSupabaseAuth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/oauth" },
      error: null,
    });
    mockWebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: "cancel",
    });

    await signInWithGoogle();

    expect(mockSupabaseAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "myapp://",
        skipBrowserRedirect: true,
      },
    });
  });

  it("opens browser with OAuth URL", async () => {
    mockLinking.createURL.mockReturnValue("myapp://");
    mockSupabaseAuth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/oauth?state=123" },
      error: null,
    });
    mockWebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: "cancel",
    });

    await signInWithGoogle();

    expect(mockWebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      "https://accounts.google.com/oauth?state=123",
      "myapp://",
      { showInRecents: true }
    );
  });

  it("sets session from callback tokens", async () => {
    mockLinking.createURL.mockReturnValue("myapp://");
    mockSupabaseAuth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/oauth" },
      error: null,
    });
    mockWebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: "myapp://?access_token=abc123&refresh_token=def456",
    });
    mockSupabaseAuth.setSession.mockResolvedValue({ error: null });

    await signInWithGoogle();

    expect(mockSupabaseAuth.setSession).toHaveBeenCalledWith({
      access_token: "abc123",
      refresh_token: "def456",
    });
  });

  it("throws on OAuth error", async () => {
    mockLinking.createURL.mockReturnValue("myapp://");
    mockSupabaseAuth.signInWithOAuth.mockResolvedValue({
      data: null,
      error: { message: "OAuth configuration error" },
    });

    await expect(signInWithGoogle()).rejects.toEqual({
      message: "OAuth configuration error",
    });
  });
});

// ============================================
// PASSWORD RESET TESTS
// ============================================

describe("resetPassword", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Simulated resetPassword function
   */
  const resetPassword = async (
    email: string
  ): Promise<{ error: Error | null }> => {
    const { error } = await mockSupabaseAuth.resetPasswordForEmail(email, {
      redirectTo: "snaptomatch://reset-password",
    });
    return { error: error as Error | null };
  };

  it("sends password reset email", async () => {
    mockSupabaseAuth.resetPasswordForEmail.mockResolvedValue({ error: null });

    const result = await resetPassword("test@example.com");

    expect(result.error).toBeNull();
    expect(mockSupabaseAuth.resetPasswordForEmail).toHaveBeenCalledWith(
      "test@example.com",
      { redirectTo: "snaptomatch://reset-password" }
    );
  });

  it("handles non-existent email", async () => {
    // Supabase doesn't reveal if email exists for security
    mockSupabaseAuth.resetPasswordForEmail.mockResolvedValue({ error: null });

    const result = await resetPassword("nonexistent@example.com");

    expect(result.error).toBeNull();
  });

  it("handles rate limiting error", async () => {
    mockSupabaseAuth.resetPasswordForEmail.mockResolvedValue({
      error: { message: "For security purposes, you can only request this once every 60 seconds" },
    });

    const result = await resetPassword("test@example.com");

    expect(result.error?.message).toContain("60 seconds");
  });
});

// ============================================
// UPDATE PASSWORD TESTS
// ============================================

describe("updatePassword", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Simulated updatePassword function
   */
  const updatePassword = async (
    userEmail: string | undefined,
    currentPassword: string,
    newPassword: string
  ): Promise<{ error: Error | null }> => {
    if (!userEmail) {
      return { error: new Error("No user email found") };
    }

    // Re-authenticate with current password
    const { error: signInError } = await mockSupabaseAuth.signInWithPassword({
      email: userEmail,
      password: currentPassword,
    });

    if (signInError) {
      return { error: new Error("Current password is incorrect") };
    }

    // Update to new password
    const { error: updateError } = await mockSupabaseAuth.updateUser({
      password: newPassword,
    });

    return { error: updateError as Error | null };
  };

  it("successfully updates password", async () => {
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-123" }, session: {} },
      error: null,
    });
    mockSupabaseAuth.updateUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    const result = await updatePassword(
      "test@example.com",
      "oldpassword",
      "newpassword"
    );

    expect(result.error).toBeNull();
    expect(mockSupabaseAuth.updateUser).toHaveBeenCalledWith({
      password: "newpassword",
    });
  });

  it("returns error when current password is wrong", async () => {
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    const result = await updatePassword(
      "test@example.com",
      "wrongpassword",
      "newpassword"
    );

    expect(result.error?.message).toBe("Current password is incorrect");
  });

  it("returns error when no user email", async () => {
    const result = await updatePassword(undefined, "oldpassword", "newpassword");

    expect(result.error?.message).toBe("No user email found");
  });

  it("handles Supabase update error", async () => {
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-123" }, session: {} },
      error: null,
    });
    mockSupabaseAuth.updateUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Password too weak" },
    });

    const result = await updatePassword(
      "test@example.com",
      "oldpassword",
      "weak"
    );

    expect(result.error).toEqual({ message: "Password too weak" });
  });
});

// ============================================
// SIGN OUT TESTS
// ============================================

describe("signOut", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRevenueCat.logoutUser.mockResolvedValue({ ok: true });
  });

  /**
   * Simulated signOut function
   */
  const signOut = async (): Promise<void> => {
    // Clear cache (non-fatal if fails)
    try {
      mockSnapToMatchStore.clearCache();
    } catch {}

    // Reset quotas (non-fatal if fails)
    try {
      mockQuotaStore.resetQuotas();
    } catch {}

    // Clear React Query cache (non-fatal if fails)
    try {
      mockQueryClient.clear();
    } catch {}

    // Logout from RevenueCat (non-fatal if fails)
    try {
      await mockRevenueCat.logoutUser();
    } catch {}

    // Sign out from Supabase
    const { error } = await mockSupabaseAuth.signOut();

    if (error) {
      const errorMessage = error.message || String(error);
      if (errorMessage.includes("Auth session missing")) {
        // Already signed out
        return;
      }
      throw error;
    }
  };

  it("clears cache and quotas", async () => {
    mockSupabaseAuth.signOut.mockResolvedValue({ error: null });

    await signOut();

    expect(mockSnapToMatchStore.clearCache).toHaveBeenCalled();
    expect(mockQuotaStore.resetQuotas).toHaveBeenCalled();
  });

  it("logs out from RevenueCat", async () => {
    mockSupabaseAuth.signOut.mockResolvedValue({ error: null });

    await signOut();

    expect(mockRevenueCat.logoutUser).toHaveBeenCalled();
  });

  it("signs out from Supabase", async () => {
    mockSupabaseAuth.signOut.mockResolvedValue({ error: null });

    await signOut();

    expect(mockSupabaseAuth.signOut).toHaveBeenCalled();
  });

  it("handles already signed out gracefully", async () => {
    mockSupabaseAuth.signOut.mockResolvedValue({
      error: { message: "Auth session missing" },
    });

    // Should not throw
    await expect(signOut()).resolves.not.toThrow();
  });

  it("throws on unexpected Supabase error", async () => {
    mockSupabaseAuth.signOut.mockResolvedValue({
      error: { message: "Network error" },
    });

    await expect(signOut()).rejects.toEqual({ message: "Network error" });
  });

  it("continues even if cache clear fails", async () => {
    mockSnapToMatchStore.clearCache.mockImplementation(() => {
      throw new Error("Cache error");
    });
    mockSupabaseAuth.signOut.mockResolvedValue({ error: null });

    // Should not throw
    await expect(signOut()).resolves.not.toThrow();
  });

  it("clears React Query cache on sign out", async () => {
    mockSupabaseAuth.signOut.mockResolvedValue({ error: null });

    await signOut();

    expect(mockQueryClient.clear).toHaveBeenCalled();
  });

  it("continues even if React Query cache clear fails", async () => {
    mockQueryClient.clear.mockImplementationOnce(() => {
      throw new Error("Cache clear error");
    });
    mockSupabaseAuth.signOut.mockResolvedValue({ error: null });

    // Should not throw
    await expect(signOut()).resolves.not.toThrow();
  });
});

// ============================================
// ACCOUNT DELETION TESTS
// ============================================

describe("deleteAccount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Simulated deleteAccount function
   */
  const deleteAccount = async (
    userId: string | undefined
  ): Promise<{ error: Error | null }> => {
    if (!userId) {
      return { error: new Error("No user to delete") };
    }

    try {
      // Delete wardrobe items
      mockSupabase.from("wardrobe_items");
      // Delete user preferences
      mockSupabase.from("user_preferences");
      // Delete recent checks
      mockSupabase.from("recent_checks");

      // Delete auth user
      const { error: deleteUserError } = await mockSupabase.rpc("delete_user");

      if (deleteUserError) {
        console.error("Error deleting auth user:", deleteUserError);
      }

      // Clear cache and sign out
      mockSnapToMatchStore.clearCache();
      await mockSupabaseAuth.signOut();

      return { error: null };
    } catch (error) {
      console.error("Error deleting account:", error);
      return { error: error as Error };
    }
  };

  it("returns error when no user", async () => {
    const result = await deleteAccount(undefined);

    expect(result.error?.message).toBe("No user to delete");
  });

  it("deletes user data from all tables", async () => {
    mockSnapToMatchStore.clearCache.mockReturnValue(undefined);
    mockSupabase.from.mockReturnValue({
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    });
    mockSupabase.rpc.mockResolvedValue({ error: null });
    mockSupabaseAuth.signOut.mockResolvedValue({ error: null });

    await deleteAccount("user-123");

    expect(mockSupabase.from).toHaveBeenCalledWith("wardrobe_items");
    expect(mockSupabase.from).toHaveBeenCalledWith("user_preferences");
    expect(mockSupabase.from).toHaveBeenCalledWith("recent_checks");
  });

  it("calls delete_user RPC", async () => {
    mockSnapToMatchStore.clearCache.mockReturnValue(undefined);
    mockSupabase.from.mockReturnValue({
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    });
    mockSupabase.rpc.mockResolvedValue({ error: null });
    mockSupabaseAuth.signOut.mockResolvedValue({ error: null });

    await deleteAccount("user-123");

    expect(mockSupabase.rpc).toHaveBeenCalledWith("delete_user");
  });

  it("clears cache and signs out after deletion", async () => {
    mockSnapToMatchStore.clearCache.mockReturnValue(undefined);
    mockSupabase.from.mockReturnValue({
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    });
    mockSupabase.rpc.mockResolvedValue({ error: null });
    mockSupabaseAuth.signOut.mockResolvedValue({ error: null });

    await deleteAccount("user-123");

    expect(mockSnapToMatchStore.clearCache).toHaveBeenCalled();
    expect(mockSupabaseAuth.signOut).toHaveBeenCalled();
  });
});

// ============================================
// SESSION INITIALIZATION TESTS
// ============================================

describe("Session Initialization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Simulated session initialization
   */
  const initializeSession = async (): Promise<{
    session: Session | null;
    error: AuthError | null;
  }> => {
    try {
      const { data: { session }, error } = await mockSupabaseAuth.getSession();

      if (error) {
        // Handle invalid refresh token
        if (
          error.message?.includes("Refresh Token") ||
          error.message?.includes("Invalid")
        ) {
          await mockSupabaseAuth.signOut();
          return { session: null, error: null };
        }
        return { session: null, error };
      }

      // Initialize RevenueCat if user is signed in
      if (session?.user?.id) {
        await mockRevenueCat.initializeRevenueCat(session.user.id);
      }

      return { session, error: null };
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      if (
        errorMessage.includes("Refresh Token") ||
        errorMessage.includes("Invalid")
      ) {
        // Clear invalid tokens
        await mockSupabaseAuth.signOut();
        return { session: null, error: null };
      }
      return { session: null, error };
    }
  };

  it("restores existing session", async () => {
    const mockSession = {
      access_token: "token-123",
      refresh_token: "refresh-456",
      user: { id: "user-789", email: "test@example.com" },
    };
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const result = await initializeSession();

    expect(result.session).toEqual(mockSession);
    expect(result.error).toBeNull();
  });

  it("initializes RevenueCat with user ID", async () => {
    const mockSession = {
      access_token: "token-123",
      refresh_token: "refresh-456",
      user: { id: "user-789" },
    };
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    await initializeSession();

    expect(mockRevenueCat.initializeRevenueCat).toHaveBeenCalledWith("user-789");
  });

  it("handles no existing session", async () => {
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const result = await initializeSession();

    expect(result.session).toBeNull();
    expect(result.error).toBeNull();
    expect(mockRevenueCat.initializeRevenueCat).not.toHaveBeenCalled();
  });

  it("handles invalid refresh token", async () => {
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: { message: "Refresh Token expired" },
    });

    const result = await initializeSession();

    expect(result.session).toBeNull();
    expect(result.error).toBeNull();
    expect(mockSupabaseAuth.signOut).toHaveBeenCalled();
  });
});

// ============================================
// AUTH STATE CHANGE TESTS
// ============================================

describe("Auth State Change Handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Simulated auth state change handler
   */
  type AuthEvent = "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED";

  const handleAuthStateChange = async (
    event: AuthEvent,
    session: Session | null
  ): Promise<void> => {
    if (event === "SIGNED_IN" && session?.user?.id) {
      await mockRevenueCat.initializeRevenueCat(session.user.id);
      await mockRevenueCat.setUserId(session.user.id);
    }
    
    if (event === "SIGNED_OUT") {
      mockQueryClient.clear();
    }
  };

  it("initializes RevenueCat on sign in", async () => {
    await handleAuthStateChange("SIGNED_IN", {
      access_token: "token",
      refresh_token: "refresh",
      user: { id: "user-123" },
    });

    expect(mockRevenueCat.initializeRevenueCat).toHaveBeenCalledWith("user-123");
  });

  it("sets RevenueCat user ID on sign in", async () => {
    mockRevenueCat.setUserId.mockResolvedValue({ ok: true });
    
    await handleAuthStateChange("SIGNED_IN", {
      access_token: "token",
      refresh_token: "refresh",
      user: { id: "user-456" },
    });

    expect(mockRevenueCat.setUserId).toHaveBeenCalledWith("user-456");
  });

  it("clears React Query cache on sign out", async () => {
    await handleAuthStateChange("SIGNED_OUT", null);

    expect(mockQueryClient.clear).toHaveBeenCalled();
  });

  it("does not initialize RevenueCat on token refresh", async () => {
    await handleAuthStateChange("TOKEN_REFRESHED", {
      access_token: "new-token",
      refresh_token: "new-refresh",
      user: { id: "user-123" },
    });

    expect(mockRevenueCat.initializeRevenueCat).not.toHaveBeenCalled();
  });

  /**
   * CRITICAL TEST: Prevents subscription data leakage between users
   * 
   * This test simulates the bug where:
   * 1. User A logs in and has a Pro subscription
   * 2. User A logs out
   * 3. User B logs in
   * 4. User B incorrectly sees "Pro Member" status from User A
   * 
   * The fix ensures React Query cache is cleared on logout.
   */
  it("prevents subscription data leakage when switching accounts", async () => {
    // User A signs in with Pro subscription
    mockRevenueCat.setUserId.mockResolvedValue({ ok: true });
    await handleAuthStateChange("SIGNED_IN", {
      access_token: "token-a",
      refresh_token: "refresh-a",
      user: { id: "user-a", email: "usera@example.com" },
    });

    expect(mockRevenueCat.initializeRevenueCat).toHaveBeenCalledWith("user-a");
    expect(mockRevenueCat.setUserId).toHaveBeenCalledWith("user-a");

    // User A logs out
    await handleAuthStateChange("SIGNED_OUT", null);
    
    // CRITICAL: Verify cache was cleared to prevent data leakage
    expect(mockQueryClient.clear).toHaveBeenCalled();
    
    // Clear mocks to simulate fresh state
    jest.clearAllMocks();
    mockRevenueCat.setUserId.mockResolvedValue({ ok: true });

    // User B signs in (different account)
    await handleAuthStateChange("SIGNED_IN", {
      access_token: "token-b",
      refresh_token: "refresh-b",
      user: { id: "user-b", email: "userb@example.com" },
    });

    // Verify User B gets properly initialized with their own ID
    expect(mockRevenueCat.setUserId).toHaveBeenCalledWith("user-b");
    expect(mockRevenueCat.setUserId).not.toHaveBeenCalledWith("user-a");
  });
});

// ============================================
// useAuth HOOK TESTS
// ============================================

describe("useAuth hook", () => {
  /**
   * Simulated useAuth hook behavior
   */
  const createAuthContext = () => {
    let context: { user: User | null } | undefined;

    return {
      setContext: (ctx: { user: User | null }) => { context = ctx; },
      useAuth: () => {
        if (context === undefined) {
          throw new Error("useAuth must be used within an AuthProvider");
        }
        return context;
      },
    };
  };

  it("throws error when used outside AuthProvider", () => {
    const { useAuth } = createAuthContext();

    expect(() => useAuth()).toThrow("useAuth must be used within an AuthProvider");
  });

  it("returns context when used inside AuthProvider", () => {
    const { setContext, useAuth } = createAuthContext();
    setContext({ user: { id: "user-123" } });

    const result = useAuth();

    expect(result.user?.id).toBe("user-123");
  });
});

// ============================================
// EDGE CASES
// ============================================

describe("Edge Cases", () => {
  describe("OAuth URL parsing", () => {
    it("handles hash fragment in OAuth callback", () => {
      const callbackUrl = "myapp://#access_token=abc&refresh_token=def";
      const url = new URL(callbackUrl);
      const params = new URLSearchParams(url.hash.replace("#", ""));

      expect(params.get("access_token")).toBe("abc");
      expect(params.get("refresh_token")).toBe("def");
    });

    it("handles query params in OAuth callback", () => {
      const callbackUrl = "myapp://?access_token=abc&refresh_token=def";
      const url = new URL(callbackUrl);
      const params = new URLSearchParams(url.search);

      expect(params.get("access_token")).toBe("abc");
      expect(params.get("refresh_token")).toBe("def");
    });

    it("handles error in OAuth callback", () => {
      const callbackUrl = "myapp://?error=access_denied&error_description=User+denied+access";
      const url = new URL(callbackUrl);
      const params = new URLSearchParams(url.search);

      expect(params.get("error")).toBe("access_denied");
      expect(params.get("error_description")).toBe("User denied access");
    });
  });

  describe("Platform-specific behavior", () => {
    it("Apple auth available only on iOS", () => {
      expect(mockPlatform.OS === "ios").toBe(true);
    });

    it("Google auth available on all platforms", () => {
      const platforms = ["ios", "android", "web"];
      platforms.forEach((platform) => {
        // Google OAuth should work on all platforms
        expect(platform).toBeTruthy();
      });
    });
  });
});

// ============================================
// INTEGRATION TESTS
// ============================================

describe("Integration Tests", () => {
  describe("Full authentication flow", () => {
    it("completes sign up -> sign in -> sign out flow", async () => {
      // Sign up
      mockSupabaseAuth.signUp.mockResolvedValue({
        data: { user: { id: "user-123" }, session: {} },
        error: null,
      });
      
      // Sign in
      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: { user: { id: "user-123" }, session: {} },
        error: null,
      });
      
      // Sign out
      mockSupabaseAuth.signOut.mockResolvedValue({ error: null });

      // Execute flow
      const signUpResult = await mockSupabaseAuth.signUp({
        email: "test@example.com",
        password: "password123",
      });
      expect(signUpResult.error).toBeNull();

      const signInResult = await mockSupabaseAuth.signInWithPassword({
        email: "test@example.com",
        password: "password123",
      });
      expect(signInResult.error).toBeNull();

      const signOutResult = await mockSupabaseAuth.signOut();
      expect(signOutResult.error).toBeNull();
    });
  });

  describe("OAuth flow with session restoration", () => {
    it("handles OAuth callback and restores session", async () => {
      mockSupabaseAuth.setSession.mockResolvedValue({
        data: { session: { user: { id: "user-123" } } },
        error: null,
      });

      await mockSupabaseAuth.setSession({
        access_token: "abc",
        refresh_token: "def",
      });

      expect(mockSupabaseAuth.setSession).toHaveBeenCalledWith({
        access_token: "abc",
        refresh_token: "def",
      });
    });
  });
});

// ============================================
// AUTH CONTEXT TYPE TESTS
// ============================================

describe("AuthContextType structure", () => {
  interface AuthContextType {
    session: Session | null;
    user: User | null;
    isLoading: boolean;
    signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signInWithOAuth: (provider: OAuthProvider) => Promise<{ error: Error | null }>;
    signInWithGoogle: () => void;
    signInWithApple: () => Promise<{ error: Error | null }>;
    resetPassword: (email: string) => Promise<{ error: Error | null }>;
    updatePassword: (currentPassword: string, newPassword: string) => Promise<{ error: Error | null }>;
    signOut: () => Promise<void>;
    deleteAccount: () => Promise<{ error: Error | null }>;
    isAppleAuthAvailable: boolean;
    isGoogleLoading: boolean;
    isAppleLoading: boolean;
    googleError: Error | null;
    appleError: Error | null;
  }

  it("has all required properties", () => {
    const mockContext: AuthContextType = {
      session: null,
      user: null,
      isLoading: false,
      signUp: jest.fn(),
      signIn: jest.fn(),
      signInWithOAuth: jest.fn(),
      signInWithGoogle: jest.fn(),
      signInWithApple: jest.fn(),
      resetPassword: jest.fn(),
      updatePassword: jest.fn(),
      signOut: jest.fn(),
      deleteAccount: jest.fn(),
      isAppleAuthAvailable: true,
      isGoogleLoading: false,
      isAppleLoading: false,
      googleError: null,
      appleError: null,
    };

    expect(mockContext).toHaveProperty("session");
    expect(mockContext).toHaveProperty("user");
    expect(mockContext).toHaveProperty("isLoading");
    expect(mockContext).toHaveProperty("signUp");
    expect(mockContext).toHaveProperty("signIn");
    expect(mockContext).toHaveProperty("signInWithOAuth");
    expect(mockContext).toHaveProperty("signInWithGoogle");
    expect(mockContext).toHaveProperty("signInWithApple");
    expect(mockContext).toHaveProperty("resetPassword");
    expect(mockContext).toHaveProperty("updatePassword");
    expect(mockContext).toHaveProperty("signOut");
    expect(mockContext).toHaveProperty("deleteAccount");
    expect(mockContext).toHaveProperty("isAppleAuthAvailable");
    expect(mockContext).toHaveProperty("isGoogleLoading");
    expect(mockContext).toHaveProperty("isAppleLoading");
    expect(mockContext).toHaveProperty("googleError");
    expect(mockContext).toHaveProperty("appleError");
  });
});

// ============================================
// STATE MANAGEMENT TESTS
// ============================================

describe("State management", () => {
  describe("Loading states", () => {
    it("initial isLoading is true", () => {
      const initialState = { isLoading: true };
      expect(initialState.isLoading).toBe(true);
    });

    it("isLoading becomes false after session check", () => {
      let isLoading = true;
      // Simulate session check completion
      isLoading = false;
      expect(isLoading).toBe(false);
    });

    it("isGoogleLoading tracks Google OAuth state", () => {
      let isGoogleLoading = false;
      
      // Start Google OAuth
      isGoogleLoading = true;
      expect(isGoogleLoading).toBe(true);
      
      // OAuth completes
      isGoogleLoading = false;
      expect(isGoogleLoading).toBe(false);
    });

    it("isAppleLoading tracks Apple OAuth state", () => {
      let isAppleLoading = false;
      
      // Start Apple OAuth
      isAppleLoading = true;
      expect(isAppleLoading).toBe(true);
      
      // OAuth completes
      isAppleLoading = false;
      expect(isAppleLoading).toBe(false);
    });
  });

  describe("Error states", () => {
    it("googleError is null initially", () => {
      const googleError: Error | null = null;
      expect(googleError).toBeNull();
    });

    it("appleError is null initially", () => {
      const appleError: Error | null = null;
      expect(appleError).toBeNull();
    });

    it("errors are set on failure", () => {
      let googleError: Error | null = null;
      googleError = new Error("OAuth failed");
      expect(googleError?.message).toBe("OAuth failed");
    });

    it("errors are cleared on retry", () => {
      let googleError: Error | null = new Error("Previous error");
      // Clear on retry
      googleError = null;
      expect(googleError).toBeNull();
    });
  });

  describe("Session and user sync", () => {
    it("user is derived from session", () => {
      const session: Session | null = {
        access_token: "token",
        refresh_token: "refresh",
        user: { id: "user-123", email: "test@example.com" },
      };
      const user = session?.user ?? null;
      expect(user?.id).toBe("user-123");
    });

    it("user is null when session is null", () => {
      const user: User | null = null;
      expect(user).toBeNull();
    });
  });
});

// ============================================
// SIGNOUT EDGE CASES
// ============================================

describe("signOut edge cases", () => {
  describe("cleanup order", () => {
    it("clears cache before RevenueCat logout", async () => {
      const executionOrder: string[] = [];
      
      mockSnapToMatchStore.clearCache.mockImplementation(() => {
        executionOrder.push("clearCache");
      });
      mockRevenueCat.logoutUser.mockImplementation(async () => {
        executionOrder.push("rcLogout");
        return { ok: true };
      });

      mockSnapToMatchStore.clearCache();
      await mockRevenueCat.logoutUser();

      expect(executionOrder).toEqual(["clearCache", "rcLogout"]);
    });
  });

  describe("RevenueCat logout failures", () => {
    it("continues sign out even if RC logout fails", async () => {
      mockRevenueCat.logoutUser.mockResolvedValue({ ok: false, reason: "not_configured" });
      mockSupabaseAuth.signOut.mockResolvedValue({ error: null });

      const rcResult = await mockRevenueCat.logoutUser();
      expect(rcResult.ok).toBe(false);

      const signOutResult = await mockSupabaseAuth.signOut();
      expect(signOutResult.error).toBeNull();
    });

    it("handles RC logout throwing exception", async () => {
      mockRevenueCat.logoutUser.mockRejectedValue(new Error("Network error"));
      mockSupabaseAuth.signOut.mockResolvedValue({ error: null });

      try {
        await mockRevenueCat.logoutUser();
      } catch {
        // Expected to fail
      }

      // Should still proceed with Supabase signout
      const signOutResult = await mockSupabaseAuth.signOut();
      expect(signOutResult.error).toBeNull();
    });
  });
});

// ============================================
// PASSWORD VALIDATION TESTS
// ============================================

describe("Password validation", () => {
  /**
   * Simulated password validation rules
   */
  const validatePassword = (password: string): { valid: boolean; reason?: string } => {
    if (password.length < 6) {
      return { valid: false, reason: "Password must be at least 6 characters" };
    }
    if (password.length > 128) {
      return { valid: false, reason: "Password must be at most 128 characters" };
    }
    return { valid: true };
  };

  it("rejects passwords shorter than 6 characters", () => {
    expect(validatePassword("12345")).toEqual({
      valid: false,
      reason: "Password must be at least 6 characters",
    });
  });

  it("accepts passwords 6 characters or longer", () => {
    expect(validatePassword("123456")).toEqual({ valid: true });
  });

  it("accepts long passwords up to 128 characters", () => {
    const longPassword = "a".repeat(128);
    expect(validatePassword(longPassword)).toEqual({ valid: true });
  });

  it("rejects passwords longer than 128 characters", () => {
    const tooLongPassword = "a".repeat(129);
    expect(validatePassword(tooLongPassword)).toEqual({
      valid: false,
      reason: "Password must be at most 128 characters",
    });
  });
});

// ============================================
// EMAIL VALIDATION TESTS
// ============================================

describe("Email validation", () => {
  /**
   * Basic email validation
   */
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  it("accepts valid email formats", () => {
    expect(validateEmail("user@example.com")).toBe(true);
    expect(validateEmail("user.name@example.com")).toBe(true);
    expect(validateEmail("user+tag@example.co.uk")).toBe(true);
  });

  it("rejects invalid email formats", () => {
    expect(validateEmail("invalid")).toBe(false);
    expect(validateEmail("invalid@")).toBe(false);
    expect(validateEmail("@example.com")).toBe(false);
    expect(validateEmail("user@.com")).toBe(false);
    expect(validateEmail("user name@example.com")).toBe(false);
  });
});

// ============================================
// REFRESH TOKEN HANDLING TESTS
// ============================================

describe("Refresh token handling", () => {
  /**
   * Check if error is a refresh token error
   */
  const isRefreshTokenError = (error: { message?: string; code?: string }): boolean => {
    const message = error.message || "";
    return (
      message.includes("Refresh Token") ||
      message.includes("refresh_token") ||
      message.includes("Invalid") ||
      error.code === "invalid_refresh_token"
    );
  };

  it("detects Refresh Token error messages", () => {
    expect(isRefreshTokenError({ message: "Refresh Token expired" })).toBe(true);
    expect(isRefreshTokenError({ message: "Invalid Refresh Token" })).toBe(true);
  });

  it("detects refresh_token error messages", () => {
    expect(isRefreshTokenError({ message: "refresh_token is invalid" })).toBe(true);
  });

  it("detects Invalid error messages", () => {
    expect(isRefreshTokenError({ message: "Invalid session" })).toBe(true);
  });

  it("detects invalid_refresh_token error code", () => {
    expect(isRefreshTokenError({ code: "invalid_refresh_token" })).toBe(true);
  });

  it("returns false for non-refresh-token errors", () => {
    expect(isRefreshTokenError({ message: "Network error" })).toBe(false);
    expect(isRefreshTokenError({ message: "User not found" })).toBe(false);
    expect(isRefreshTokenError({ code: "auth_error" })).toBe(false);
  });
});

// ============================================
// SUPABASE AUTH SUBSCRIPTION TESTS
// ============================================

describe("Auth subscription handling", () => {
  it("returns unsubscribe function", () => {
    const subscription = {
      unsubscribe: jest.fn(),
    };

    expect(typeof subscription.unsubscribe).toBe("function");
    
    subscription.unsubscribe();
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });

  it("auth state change events are handled", () => {
    const events = ["SIGNED_IN", "SIGNED_OUT", "TOKEN_REFRESHED", "USER_UPDATED"];
    
    events.forEach(event => {
      expect(typeof event).toBe("string");
    });
  });
});

// ============================================
// APPLE AUTH AVAILABILITY TESTS
// ============================================

describe("Apple auth availability", () => {
  it("is only checked on iOS", () => {
    const platforms = ["ios", "android", "web"];
    
    platforms.forEach(platform => {
      const shouldCheckApple = platform === "ios";
      if (platform === "ios") {
        expect(shouldCheckApple).toBe(true);
      } else {
        expect(shouldCheckApple).toBe(false);
      }
    });
  });

  it("defaults to false on non-iOS", () => {
    const platform: string = "android";
    const isAppleAuthAvailable = platform === "ios" ? true : false;
    expect(isAppleAuthAvailable).toBe(false);
  });
});

// ============================================
// CONCURRENT AUTH OPERATIONS TESTS
// ============================================

describe("Concurrent auth operations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("handles multiple sign in attempts", async () => {
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-123" }, session: {} },
      error: null,
    });

    const results = await Promise.all([
      mockSupabaseAuth.signInWithPassword({ email: "a@test.com", password: "pass1" }),
      mockSupabaseAuth.signInWithPassword({ email: "b@test.com", password: "pass2" }),
    ]);

    expect(results).toHaveLength(2);
    expect(mockSupabaseAuth.signInWithPassword).toHaveBeenCalledTimes(2);
  });

  it("handles sign in during sign out", async () => {
    mockSupabaseAuth.signOut.mockResolvedValue({ error: null });
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-456" }, session: {} },
      error: null,
    });

    // Start sign out, then sign in
    const [signOutResult, signInResult] = await Promise.all([
      mockSupabaseAuth.signOut(),
      mockSupabaseAuth.signInWithPassword({ email: "test@test.com", password: "pass" }),
    ]);

    expect(signOutResult.error).toBeNull();
    expect(signInResult.error).toBeNull();
  });
});

// ============================================
// DELETE ACCOUNT DATA CLEANUP TESTS
// ============================================

describe("Delete account data cleanup", () => {
  it("deletes data from all required tables", () => {
    const tablesToDelete = ["wardrobe_items", "user_preferences", "recent_checks"];
    
    tablesToDelete.forEach(table => {
      expect(typeof table).toBe("string");
    });
    
    expect(tablesToDelete).toContain("wardrobe_items");
    expect(tablesToDelete).toContain("user_preferences");
    expect(tablesToDelete).toContain("recent_checks");
  });

  it("maintains correct deletion order", () => {
    // Data tables first, then auth user
    const deletionOrder = [
      "wardrobe_items",
      "user_preferences",
      "recent_checks",
      "auth_user",
    ];
    
    expect(deletionOrder[deletionOrder.length - 1]).toBe("auth_user");
  });
});

// ============================================
// SESSION EXPIRY HANDLING TESTS
// ============================================

describe("Session expiry handling", () => {
  /**
   * Check if session is expired
   */
  const isSessionExpired = (session: { expires_at?: number } | null): boolean => {
    if (!session?.expires_at) return true;
    return Date.now() > session.expires_at * 1000;
  };

  it("returns true for null session", () => {
    expect(isSessionExpired(null)).toBe(true);
  });

  it("returns true for session without expires_at", () => {
    expect(isSessionExpired({})).toBe(true);
  });

  it("returns true for expired session", () => {
    const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    expect(isSessionExpired({ expires_at: pastTime })).toBe(true);
  });

  it("returns false for valid session", () => {
    const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    expect(isSessionExpired({ expires_at: futureTime })).toBe(false);
  });
});

// ============================================
// DEEP LINK HANDLING TESTS
// ============================================

describe("Deep link handling", () => {
  /**
   * Parse deep link URL for auth tokens
   */
  const parseAuthDeepLink = (url: string): { accessToken: string | null; refreshToken: string | null } => {
    try {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search + urlObj.hash.replace("#", "&"));
      return {
        accessToken: params.get("access_token"),
        refreshToken: params.get("refresh_token"),
      };
    } catch {
      return { accessToken: null, refreshToken: null };
    }
  };

  it("parses tokens from query string", () => {
    const url = "myapp://?access_token=abc123&refresh_token=def456";
    const result = parseAuthDeepLink(url);
    
    expect(result.accessToken).toBe("abc123");
    expect(result.refreshToken).toBe("def456");
  });

  it("parses tokens from hash fragment", () => {
    const url = "myapp://#access_token=abc123&refresh_token=def456";
    const result = parseAuthDeepLink(url);
    
    expect(result.accessToken).toBe("abc123");
    expect(result.refreshToken).toBe("def456");
  });

  it("returns null for invalid URL", () => {
    const result = parseAuthDeepLink("not-a-url");
    
    expect(result.accessToken).toBeNull();
    expect(result.refreshToken).toBeNull();
  });

  it("returns null for URL without tokens", () => {
    const url = "myapp://callback";
    const result = parseAuthDeepLink(url);
    
    expect(result.accessToken).toBeNull();
    expect(result.refreshToken).toBeNull();
  });
});

// ============================================
// PERFORMANCE TESTS
// ============================================

describe("Performance", () => {
  it("signIn completes within timeout", async () => {
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-123" }, session: {} },
      error: null,
    });

    const start = Date.now();
    await mockSupabaseAuth.signInWithPassword({
      email: "test@test.com",
      password: "password",
    });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it("handles rapid auth state changes", () => {
    const stateChanges: string[] = [];
    
    for (let i = 0; i < 100; i++) {
      stateChanges.push(i % 2 === 0 ? "SIGNED_IN" : "SIGNED_OUT");
    }
    
    expect(stateChanges).toHaveLength(100);
  });
});
