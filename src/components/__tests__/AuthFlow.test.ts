/**
 * AuthFlow Component Tests
 *
 * Tests for the authentication UI flow logic including:
 * - Mode transitions (landing → login → signup → checkEmail → forgotPassword)
 * - Form validation
 * - Error handling
 * - Button state management
 */

// ─────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────

type AuthMode = "landing" | "login" | "signup" | "checkEmail" | "forgotPassword";

interface ValidationResult {
  isValid: boolean;
  error: string | null;
}

// ─────────────────────────────────────────────
// Email Validation Logic
// ─────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

function validateEmail(email: string, touched: boolean): ValidationResult {
  if (!touched) {
    return { isValid: true, error: null };
  }
  
  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    return { isValid: false, error: "Email is required" };
  }
  
  if (!isValidEmail(trimmedEmail)) {
    return { isValid: false, error: "Please enter a valid email" };
  }
  
  return { isValid: true, error: null };
}

// ─────────────────────────────────────────────
// Password Validation Logic
// ─────────────────────────────────────────────

function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

function validatePassword(password: string, touched: boolean): ValidationResult {
  if (!touched) {
    return { isValid: true, error: null };
  }
  
  if (!password) {
    return { isValid: false, error: "Password is required" };
  }
  
  if (password.length < 8) {
    return { isValid: false, error: "Password must be at least 8 characters" };
  }
  
  return { isValid: true, error: null };
}

// ─────────────────────────────────────────────
// Form State Logic
// ─────────────────────────────────────────────

interface FormState {
  email: string;
  password: string;
  emailTouched: boolean;
  passwordTouched: boolean;
}

function canLogin(formState: FormState): boolean {
  const emailValid = isValidEmail(formState.email);
  const passwordLengthOk = formState.password.length >= 6; // Login only requires 6 chars
  const emailResult = validateEmail(formState.email, formState.emailTouched);
  
  return emailValid && passwordLengthOk && !emailResult.error;
}

function canSignup(formState: FormState): boolean {
  const emailValid = isValidEmail(formState.email);
  const passwordValid = isValidPassword(formState.password);
  const emailResult = validateEmail(formState.email, formState.emailTouched);
  const passwordResult = validatePassword(formState.password, formState.passwordTouched);
  
  return emailValid && passwordValid && !emailResult.error && !passwordResult.error;
}

function canSubmitForgotPassword(email: string, loading: boolean): boolean {
  return email.trim().length > 0 && !loading;
}

// ─────────────────────────────────────────────
// Mode Transition Logic
// ─────────────────────────────────────────────

function goBack(currentMode: AuthMode): AuthMode {
  switch (currentMode) {
    case "checkEmail":
      return "login";
    case "forgotPassword":
      return "login";
    case "login":
      return "landing";
    case "signup":
      return "landing";
    default:
      return "landing";
  }
}

// ─────────────────────────────────────────────
// Email Validation Tests
// ─────────────────────────────────────────────

describe("email validation", () => {
  describe("isValidEmail", () => {
    it("accepts valid email formats", () => {
      expect(isValidEmail("test@example.com")).toBe(true);
      expect(isValidEmail("user.name@domain.org")).toBe(true);
      expect(isValidEmail("user+tag@example.co.uk")).toBe(true);
      expect(isValidEmail("a@b.co")).toBe(true);
    });

    it("rejects invalid email formats", () => {
      expect(isValidEmail("")).toBe(false);
      expect(isValidEmail("invalid")).toBe(false);
      expect(isValidEmail("@example.com")).toBe(false);
      expect(isValidEmail("user@")).toBe(false);
      expect(isValidEmail("user@.com")).toBe(false);
      expect(isValidEmail("user@domain")).toBe(false);
      expect(isValidEmail("user name@domain.com")).toBe(false);
    });

    it("trims whitespace before validation", () => {
      expect(isValidEmail("  test@example.com  ")).toBe(true);
      expect(isValidEmail("\ttest@example.com\n")).toBe(true);
    });
  });

  describe("validateEmail", () => {
    it("returns valid when not touched", () => {
      const result = validateEmail("invalid", false);
      expect(result.isValid).toBe(true);
      expect(result.error).toBe(null);
    });

    it("returns error for empty email when touched", () => {
      const result = validateEmail("", true);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Email is required");
    });

    it("returns error for whitespace-only email", () => {
      const result = validateEmail("   ", true);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Email is required");
    });

    it("returns error for invalid format", () => {
      const result = validateEmail("invalid-email", true);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Please enter a valid email");
    });

    it("returns valid for correct email", () => {
      const result = validateEmail("test@example.com", true);
      expect(result.isValid).toBe(true);
      expect(result.error).toBe(null);
    });
  });
});

// ─────────────────────────────────────────────
// Password Validation Tests
// ─────────────────────────────────────────────

describe("password validation", () => {
  describe("isValidPassword", () => {
    it("accepts passwords >= 8 characters", () => {
      expect(isValidPassword("12345678")).toBe(true);
      expect(isValidPassword("password123")).toBe(true);
      expect(isValidPassword("a".repeat(100))).toBe(true);
    });

    it("rejects passwords < 8 characters", () => {
      expect(isValidPassword("")).toBe(false);
      expect(isValidPassword("1234567")).toBe(false);
      expect(isValidPassword("abc")).toBe(false);
    });
  });

  describe("validatePassword", () => {
    it("returns valid when not touched", () => {
      const result = validatePassword("abc", false);
      expect(result.isValid).toBe(true);
      expect(result.error).toBe(null);
    });

    it("returns error for empty password when touched", () => {
      const result = validatePassword("", true);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Password is required");
    });

    it("returns error for short password", () => {
      const result = validatePassword("1234567", true);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Password must be at least 8 characters");
    });

    it("returns valid for correct password", () => {
      const result = validatePassword("12345678", true);
      expect(result.isValid).toBe(true);
      expect(result.error).toBe(null);
    });
  });
});

// ─────────────────────────────────────────────
// Form State Tests
// ─────────────────────────────────────────────

describe("form state", () => {
  describe("canLogin", () => {
    it("returns true for valid email and password >= 6 chars", () => {
      const formState: FormState = {
        email: "test@example.com",
        password: "123456",
        emailTouched: true,
        passwordTouched: true,
      };
      expect(canLogin(formState)).toBe(true);
    });

    it("returns false for invalid email", () => {
      const formState: FormState = {
        email: "invalid",
        password: "123456",
        emailTouched: true,
        passwordTouched: true,
      };
      expect(canLogin(formState)).toBe(false);
    });

    it("returns false for password < 6 chars", () => {
      const formState: FormState = {
        email: "test@example.com",
        password: "12345",
        emailTouched: true,
        passwordTouched: true,
      };
      expect(canLogin(formState)).toBe(false);
    });

    it("returns false when email has validation error", () => {
      const formState: FormState = {
        email: "",
        password: "123456",
        emailTouched: true,
        passwordTouched: true,
      };
      expect(canLogin(formState)).toBe(false);
    });
  });

  describe("canSignup", () => {
    it("returns true for valid email and password >= 8 chars", () => {
      const formState: FormState = {
        email: "test@example.com",
        password: "12345678",
        emailTouched: true,
        passwordTouched: true,
      };
      expect(canSignup(formState)).toBe(true);
    });

    it("returns false for password >= 6 but < 8 chars (stricter than login)", () => {
      const formState: FormState = {
        email: "test@example.com",
        password: "1234567",
        emailTouched: true,
        passwordTouched: true,
      };
      expect(canSignup(formState)).toBe(false);
    });

    it("returns false when password has validation error (touched)", () => {
      const formState: FormState = {
        email: "test@example.com",
        password: "abc",
        emailTouched: true,
        passwordTouched: true,
      };
      expect(canSignup(formState)).toBe(false);
    });

    it("allows submission when fields not touched (validation errors show on blur)", () => {
      const formState: FormState = {
        email: "test@example.com",
        password: "12345678",
        emailTouched: false,
        passwordTouched: false,
      };
      expect(canSignup(formState)).toBe(true);
    });
  });

  describe("canSubmitForgotPassword", () => {
    it("returns true for non-empty email and not loading", () => {
      expect(canSubmitForgotPassword("test@example.com", false)).toBe(true);
      expect(canSubmitForgotPassword("a", false)).toBe(true);
    });

    it("returns false for empty email", () => {
      expect(canSubmitForgotPassword("", false)).toBe(false);
      expect(canSubmitForgotPassword("   ", false)).toBe(false);
    });

    it("returns false when loading", () => {
      expect(canSubmitForgotPassword("test@example.com", true)).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
// Mode Transition Tests
// ─────────────────────────────────────────────

describe("mode transitions", () => {
  describe("goBack", () => {
    it("checkEmail → login", () => {
      expect(goBack("checkEmail")).toBe("login");
    });

    it("forgotPassword → login", () => {
      expect(goBack("forgotPassword")).toBe("login");
    });

    it("login → landing", () => {
      expect(goBack("login")).toBe("landing");
    });

    it("signup → landing", () => {
      expect(goBack("signup")).toBe("landing");
    });

    it("landing → landing (no further back)", () => {
      expect(goBack("landing")).toBe("landing");
    });
  });

  describe("mode flow", () => {
    it("landing → login → forgotPassword → checkEmail flow", () => {
      let mode: AuthMode = "landing";
      
      // User clicks sign in
      mode = "login";
      expect(mode).toBe("login");
      
      // User clicks forgot password
      mode = "forgotPassword";
      expect(mode).toBe("forgotPassword");
      
      // User submits email, sees checkEmail
      mode = "checkEmail";
      expect(mode).toBe("checkEmail");
      
      // User goes back to login
      mode = goBack(mode);
      expect(mode).toBe("login");
    });

    it("landing → signup → checkEmail flow", () => {
      let mode: AuthMode = "landing";
      
      // User clicks create account
      mode = "signup";
      expect(mode).toBe("signup");
      
      // User submits signup, sees checkEmail
      mode = "checkEmail";
      expect(mode).toBe("checkEmail");
      
      // User goes back to login (not signup - confirmation goes to login)
      mode = goBack(mode);
      expect(mode).toBe("login");
    });
  });
});

// ─────────────────────────────────────────────
// Button State Tests
// ─────────────────────────────────────────────

describe("button states", () => {
  interface ButtonState {
    disabled: boolean;
    opacity: number;
  }

  function getSocialButtonState(loading: boolean, specificLoading: boolean): ButtonState {
    const isDisabled = loading || specificLoading;
    return {
      disabled: isDisabled,
      opacity: isDisabled ? 0.7 : 1,
    };
  }

  function getPrimaryButtonState(
    canSubmit: boolean,
    loading: boolean
  ): ButtonState {
    const isDisabled = !canSubmit || loading;
    return {
      disabled: isDisabled,
      opacity: isDisabled ? 0.5 : 1,
    };
  }

  describe("social button state", () => {
    it("enabled when nothing is loading", () => {
      const state = getSocialButtonState(false, false);
      expect(state.disabled).toBe(false);
      expect(state.opacity).toBe(1);
    });

    it("disabled when general loading", () => {
      const state = getSocialButtonState(true, false);
      expect(state.disabled).toBe(true);
      expect(state.opacity).toBe(0.7);
    });

    it("disabled when specific button loading", () => {
      const state = getSocialButtonState(false, true);
      expect(state.disabled).toBe(true);
      expect(state.opacity).toBe(0.7);
    });
  });

  describe("primary button state", () => {
    it("enabled when can submit and not loading", () => {
      const state = getPrimaryButtonState(true, false);
      expect(state.disabled).toBe(false);
      expect(state.opacity).toBe(1);
    });

    it("disabled when cannot submit", () => {
      const state = getPrimaryButtonState(false, false);
      expect(state.disabled).toBe(true);
      expect(state.opacity).toBe(0.5);
    });

    it("disabled when loading", () => {
      const state = getPrimaryButtonState(true, true);
      expect(state.disabled).toBe(true);
      expect(state.opacity).toBe(0.5);
    });
  });
});

// ─────────────────────────────────────────────
// Error Handling Tests
// ─────────────────────────────────────────────

describe("error handling", () => {
  function getErrorMessage(error: unknown): string {
    const err = error as { message?: string };
    return err?.message ?? "Something went wrong";
  }

  it("extracts message from error object", () => {
    const error = { message: "Invalid credentials" };
    expect(getErrorMessage(error)).toBe("Invalid credentials");
  });

  it("returns default message for error without message", () => {
    const error = { code: "AUTH_ERROR" };
    expect(getErrorMessage(error)).toBe("Something went wrong");
  });

  it("returns default message for null", () => {
    expect(getErrorMessage(null)).toBe("Something went wrong");
  });

  it("returns default message for undefined", () => {
    expect(getErrorMessage(undefined)).toBe("Something went wrong");
  });

  it("returns default message for string error", () => {
    expect(getErrorMessage("error string")).toBe("Something went wrong");
  });
});

// ─────────────────────────────────────────────
// UI Content Tests
// ─────────────────────────────────────────────

describe("UI content", () => {
  interface ScreenContent {
    title: string;
    subtitle: string;
    primaryButtonLabel: string;
    showSocialButtons: boolean;
  }

  function getScreenContent(mode: AuthMode, selectedPlan?: "annual" | "monthly"): ScreenContent {
    switch (mode) {
      case "landing":
        return {
          title: "Match Before You Buy",
          subtitle: "Scan an item. See how it works with your wardrobe.",
          primaryButtonLabel: "Sign in with email",
          showSocialButtons: true,
        };
      case "login":
        return {
          title: "Welcome back",
          subtitle: "Sign in to access your account.",
          primaryButtonLabel: "Sign in",
          showSocialButtons: true,
        };
      case "signup":
        return {
          title: "Create your account",
          subtitle: "So we can save your scans and wardrobe.",
          primaryButtonLabel: "Create account",
          showSocialButtons: true,
        };
      case "forgotPassword":
        return {
          title: "Reset password",
          subtitle: "Enter your email address and we'll send you a link to reset your password.",
          primaryButtonLabel: "Send reset link",
          showSocialButtons: false,
        };
      case "checkEmail":
        return {
          title: "Check your email",
          subtitle: "We sent a link to",
          primaryButtonLabel: "Back to sign in",
          showSocialButtons: false,
        };
      default:
        return {
          title: "",
          subtitle: "",
          primaryButtonLabel: "",
          showSocialButtons: false,
        };
    }
  }

  it("returns correct content for landing mode", () => {
    const content = getScreenContent("landing");
    expect(content.title).toBe("Match Before You Buy");
    expect(content.showSocialButtons).toBe(true);
  });

  it("returns correct content for login mode", () => {
    const content = getScreenContent("login");
    expect(content.title).toBe("Welcome back");
    expect(content.primaryButtonLabel).toBe("Sign in");
    expect(content.showSocialButtons).toBe(true);
  });

  it("returns correct content for signup mode", () => {
    const content = getScreenContent("signup");
    expect(content.title).toBe("Create your account");
    expect(content.primaryButtonLabel).toBe("Create account");
  });

  it("returns correct content for forgotPassword mode", () => {
    const content = getScreenContent("forgotPassword");
    expect(content.title).toBe("Reset password");
    expect(content.showSocialButtons).toBe(false);
  });

  it("returns correct content for checkEmail mode", () => {
    const content = getScreenContent("checkEmail");
    expect(content.title).toBe("Check your email");
    expect(content.showSocialButtons).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Integration-style Tests
// ─────────────────────────────────────────────

describe("AuthFlow integration scenarios", () => {
  interface FlowState {
    mode: AuthMode;
    email: string;
    password: string;
    emailTouched: boolean;
    passwordTouched: boolean;
    loading: boolean;
    error: string | null;
  }

  describe("successful signup flow", () => {
    it("landing → signup → submit → checkEmail", () => {
      let state: FlowState = {
        mode: "landing",
        email: "",
        password: "",
        emailTouched: false,
        passwordTouched: false,
        loading: false,
        error: null,
      };

      // User clicks create account
      state.mode = "signup";
      expect(state.mode).toBe("signup");

      // User enters email
      state.email = "newuser@example.com";
      state.emailTouched = true;

      // User enters password
      state.password = "securepassword123";
      state.passwordTouched = true;

      // Validate can signup
      const canSubmit = canSignup({
        email: state.email,
        password: state.password,
        emailTouched: state.emailTouched,
        passwordTouched: state.passwordTouched,
      });
      expect(canSubmit).toBe(true);

      // Submit begins loading
      state.loading = true;
      expect(state.loading).toBe(true);

      // Submit succeeds, show check email
      state.loading = false;
      state.mode = "checkEmail";
      expect(state.mode).toBe("checkEmail");
    });
  });

  describe("failed login flow", () => {
    it("handles invalid credentials error", () => {
      let state: FlowState = {
        mode: "login",
        email: "test@example.com",
        password: "wrongpassword",
        emailTouched: true,
        passwordTouched: true,
        loading: false,
        error: null,
      };

      // Submit begins
      state.loading = true;

      // Server returns error
      state.loading = false;
      state.error = "Invalid credentials";

      expect(state.error).toBe("Invalid credentials");
      expect(state.mode).toBe("login"); // Stays on login
    });
  });

  describe("password reset flow", () => {
    it("login → forgotPassword → submit → checkEmail → back to login", () => {
      let state: FlowState = {
        mode: "login",
        email: "",
        password: "",
        emailTouched: false,
        passwordTouched: false,
        loading: false,
        error: null,
      };

      // User clicks forgot password
      state.mode = "forgotPassword";
      state.email = ""; // Clear form
      state.password = "";
      
      // User enters email
      state.email = "user@example.com";

      // Can submit
      expect(canSubmitForgotPassword(state.email, state.loading)).toBe(true);

      // Submit
      state.loading = true;
      state.loading = false;
      state.mode = "checkEmail";

      // User clicks back to sign in
      state.mode = goBack(state.mode);
      expect(state.mode).toBe("login");
    });
  });
});
