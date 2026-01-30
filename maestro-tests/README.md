# Maestro E2E Tests

This directory contains Maestro UI tests for the Scan & Match app.

## Test Coverage

| Test File | Flow Covered | Prerequisites |
|-----------|--------------|---------------|
| `auth-login.yaml` | Login screen, form elements, forgot password | Logged out |
| `auth-signup.yaml` | Signup screen, form validation | Logged out |
| `home-screen.yaml` | Home screen elements, hero card, navigation to scan | Logged in |
| `navigation-tabs.yaml` | Tab bar navigation (Home, Scan, Wardrobe, Saved) | Logged in |
| `scan-flow.yaml` | Camera screen, scan UI, tips | Logged in |
| `wardrobe-management.yaml` | Wardrobe viewing, category filtering | Logged in |
| `add-wardrobe-item.yaml` | Add item camera flow | Logged in |
| `account-settings.yaml` | Account screen, settings options | Logged in |
| `subscription-flow.yaml` | Paywall, plan selection, pricing | Logged in |
| `onboarding-flow.yaml` | New user onboarding steps | Fresh user |
| `example.yaml` | Basic login screen check | Any state |
| `login-basic.yaml` | Login screen verification | Any state |

## Running Tests

### Prerequisites
1. App must be built and installed in the simulator
2. Metro bundler should be running (`npm start`)
3. Maestro CLI must be installed (`brew install maestro`)

### Run All Tests
```bash
maestro test maestro-tests/
```

### Run Specific Test
```bash
maestro test maestro-tests/scan-flow.yaml
```

### Run Tests by Category

**Authentication tests (requires logged out state):**
```bash
maestro test maestro-tests/auth-login.yaml
maestro test maestro-tests/auth-signup.yaml
```

**Main app tests (requires logged in state):**
```bash
maestro test maestro-tests/home-screen.yaml
maestro test maestro-tests/navigation-tabs.yaml
maestro test maestro-tests/scan-flow.yaml
maestro test maestro-tests/wardrobe-management.yaml
maestro test maestro-tests/account-settings.yaml
```

### Run Without Launching App
If app is already running:
```bash
maestro test maestro-tests/ --no-launch
```

## Test Organization

### Authentication Flow
- `auth-login.yaml` - Tests login form, forgot password, social login options
- `auth-signup.yaml` - Tests signup form, validation, terms links

### Core Features
- `home-screen.yaml` - Tests home screen hero card, sections, navigation
- `scan-flow.yaml` - Tests in-store scan camera screen
- `wardrobe-management.yaml` - Tests wardrobe grid, category filters
- `add-wardrobe-item.yaml` - Tests add item flow

### Navigation
- `navigation-tabs.yaml` - Tests all tab bar navigation

### Account & Subscription
- `account-settings.yaml` - Tests account screen and settings
- `subscription-flow.yaml` - Tests paywall and subscription UI

### Onboarding
- `onboarding-flow.yaml` - Tests new user onboarding

## Creating New Tests

1. Create a new `.yaml` file in this directory
2. Start with:
   ```yaml
   appId: com.snaptomatch.app
   ---
   - launchApp
   - waitForAnimationToEnd
   ```
3. Add test steps using Maestro commands
4. Use `optional: true` for elements that may not always appear
5. Add screenshots with `takeScreenshot` for debugging

## Common Maestro Commands

```yaml
# Wait for animations
- waitForAnimationToEnd

# Assert element visible
- assertVisible:
    text: "Button Text"
    optional: true

# Tap on element
- tapOn:
    text: "Button"
- tapOn:
    point: "50%,50%"  # Percentage of screen

# Input text
- inputText: "test@example.com"

# Scroll
- scroll:
    direction: DOWN
- scrollUntilVisible:
    element:
      text: "Target"
    direction: DOWN

# Screenshots
- takeScreenshot: "screenshot-name.png"

# Navigation
- back
```

## App Bundle ID

The app bundle identifier is: `com.snaptomatch.app`

Make sure this matches your `app.json` configuration.

## Debugging

Screenshots are saved to `~/.maestro/tests/` after each run.

To see detailed logs:
```bash
maestro test maestro-tests/scan-flow.yaml --debug
```

## Notes

- Tests use `optional: true` extensively because UI may vary based on user state
- Tab bar navigation uses screen percentages since custom tab bar may not have testIDs
- Some tests require specific user state (logged in/out, subscription status)
- Camera tests cannot fully test photo capture (requires device interaction)
