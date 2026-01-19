# Testing Strategy

## Overview

This document outlines the comprehensive testing strategy for the SnapToMatch application. The strategy uses a four-tier approach to ensure quality across different layers of the application.

## Testing Pyramid

```
                    /\
                   /  \
                  /Appium\     5% - Real device critical flows
                 /--------\
                /          \
               /   Loki     \    5% - Visual regression
              /--------------\
             /                \
            /    Maestro       \   20% - E2E user flows
           /--------------------\
          /                      \
         /      Jest              \  70% - Unit tests
        /--------------------------\
```

## Four-Tier Testing Strategy

### 1. Jest Unit Tests (70% of tests)

**Purpose:** Cover business logic deterministically, fastest feedback, least flaky

**What to Test:**
- ✅ Confidence engine logic (outfit evaluation, scoring, tier calculation)
- ✅ Matching engine algorithms
- ✅ Style family matching
- ✅ Results UI policy logic
- ✅ Combo assembler
- ✅ Signal processing (color, formality, style)
- ✅ Gates system (hard fails, soft caps)
- ✅ Utility functions and helpers
- ✅ Edge cases and matrix combinations

**Current Coverage:**
- `src/lib/confidence-engine/__tests__/` - Core engine tests
- `src/lib/__tests__/` - Business logic tests

**Example Test Structure:**
```typescript
// src/lib/confidence-engine/__tests__/outfit-evaluation.test.ts
describe('Outfit Evaluation', () => {
  it('should return HIGH when 1 HIGH pair exists', () => {
    // Test HIGH tier logic
  });
  
  it('should return MEDIUM when 1 HIGH + 1 LOW', () => {
    // Test tier aggregation
  });
});
```

**Best Practices:**
- Test all tier combinations (HIGH/MEDIUM/LOW matrices)
- Test edge cases (empty wardrobe, no matches, etc.)
- Keep tests fast (< 1 second per test)
- Use deterministic fixtures
- Mock external dependencies (API calls, file system)

**Run Tests:**
```bash
npm test
npm test -- --watch
npm test -- --coverage
```

---

### 2. Maestro E2E Tests (20% of tests)

**Purpose:** User-visible checks using deep-link fixtures, fast to write, good CI story in Expo/EAS

**What to Test:**
- ✅ Complete user flows (scan → process → results)
- ✅ Results screen states (HIGH/MEDIUM/LOW verdicts)
- ✅ Wardrobe management flows
- ✅ Navigation between screens
- ✅ UI state transitions
- ✅ Deep-link scenarios
- ✅ User interactions (taps, swipes, scrolls)

**Why Maestro:**
- YAML-based, fast to write
- Deep-link fixtures can set up complex test states
- Good CI/CD integration with Expo/EAS
- Handles async operations well
- Cross-platform (iOS/Android)

**Test Structure:**
```
maestro-tests/
├── flows/
│   ├── scan-item-flow.yaml
│   ├── results-high-state.yaml
│   ├── results-medium-state.yaml
│   ├── results-low-state.yaml
│   └── wardrobe-management.yaml
├── fixtures/
│   ├── high-match-state.yaml
│   ├── medium-match-state.yaml
│   └── empty-wardrobe-state.yaml
└── smoke/
    └── critical-paths.yaml
```

**Example Test:**
```yaml
# maestro-tests/flows/results-high-state.yaml
appId: com.anonymous.vibecode
---
# Launch with deep-link fixture
- launchApp: "vibecode://results?fixture=high-match&wardrobeCount=10"
- assertVisible: "Looks like a good match"
- assertVisible: "Matches in your wardrobe"
- tapOn: "View all matches"
- assertVisible: ".*matches found"
```

**Deep-Link Fixtures:**
```yaml
# Use deep-links to set up test states
- launchApp: "vibecode://results?scannedItem=top&wardrobeCount=5&state=high"
- launchApp: "vibecode://wardrobe?items=10&categories=top,bottom,shoes"
```

**Best Practices:**
- Use deep-link fixtures to set up complex states
- Test happy paths and critical user journeys
- Keep tests focused (one flow per file)
- Use descriptive assertions
- Test state transitions, not just static screens

**Run Tests:**
```bash
# Run all tests
maestro test maestro-tests/

# Run specific flow
maestro test maestro-tests/flows/scan-item-flow.yaml

# Run with app already running
maestro test maestro-tests/ --no-launch
```

---

### 3. Loki Visual Regression (5% of tests)

**Purpose:** Cheap pixel confidence for key UI components

**What to Test:**
- ✅ VerdictCard (all 4 states: great/okay/risky/context_needed)
- ✅ HelpfulAdditionCard
- ✅ WardrobeItemCard
- ✅ Results screen layouts
- ✅ GuidanceSection components
- ✅ OutfitIdeasSection
- ✅ Critical UI states and variations

**Why Loki:**
- Fast visual regression detection
- Pixel-level confidence
- Catches unintended visual changes
- Important for fashion/style app where visual consistency matters
- Cheap to run (compared to manual visual QA)

**Components to Test:**
```typescript
// Key components for visual regression
- VerdictCard (4 states × multiple scenarios)
- HelpfulAdditionCard (different categories)
- WardrobeItemCard (different sizes)
- Results screen (HIGH/MEDIUM/LOW states)
- Empty states
- Loading states
```

**Example Test:**
```typescript
// loki-tests/VerdictCard.stories.tsx
export const GreatState = () => (
  <VerdictCard state="great" explanation="This matches your style perfectly" />
);

export const OkayState = () => (
  <VerdictCard state="okay" explanation="Could work with the right pieces" />
);

export const RiskyState = () => (
  <VerdictCard state="risky" explanation="Might feel tricky to style" />
);

export const ContextNeededState = () => (
  <VerdictCard state="context_needed" explanation="We need a bit more context" />
);
```

**Best Practices:**
- Test critical UI components only (not everything)
- Test all state variations
- Use consistent test data
- Keep visual tests fast
- Review diffs carefully (some changes are intentional)

**Run Tests:**
```bash
# Generate visual snapshots
npm run loki:test

# Update snapshots
npm run loki:update

# Review changes
npm run loki:approve
```

---

### 4. Appium Real Device Tests (5% of tests)

**Purpose:** Must-work-on-real-devices flows (auth/purchases/permissions)

**What to Test:**
- ✅ Camera functionality (scanning items)
- ✅ Photo library access
- ✅ Authentication flows (Apple Sign In, Google OAuth)
- ✅ In-app purchases
- ✅ Permission dialogs
- ✅ Device-specific features

**Why Appium:**
- Only way to test real device features
- Camera requires actual hardware
- Auth flows need real OAuth redirects
- IAP requires real device testing
- Permission dialogs behave differently on real devices

**Critical Flows:**
```yaml
# appium-tests/critical-flows/
- camera-scan-flow.yaml
- photo-library-access.yaml
- apple-sign-in.yaml
- google-oauth.yaml
- in-app-purchase.yaml
- permissions-flow.yaml
```

**Example Test:**
```yaml
# appium-tests/camera-scan-flow.yaml
---
- launchApp
- tapOn: "Scan Item"
- assertVisible: "Camera permission"
- tapOn: "Allow"
- assertVisible: "Camera view"
- tapOn: "Capture"
- assertVisible: "Processing"
- waitForVisible: "Results"
```

**Best Practices:**
- Test only critical device-dependent flows
- Use real devices (not just simulators)
- Test on multiple device types (iPhone, Android)
- Keep tests minimal (they're slow)
- Focus on features that can't be tested otherwise

**Run Tests:**
```bash
# Run on connected device
appium --port 4723
npm run appium:test

# Run specific flow
npm run appium:test -- camera-scan-flow
```

---

## Test Distribution Recommendations

### By Test Type

| Tool | Percentage | Count Estimate | Purpose |
|------|-----------|----------------|---------|
| Jest | 70% | ~200-300 tests | Business logic, fast feedback |
| Maestro | 20% | ~20-30 flows | User journeys, E2E |
| Loki | 5% | ~30-50 snapshots | Visual regression |
| Appium | 5% | ~5-10 flows | Real device critical paths |

### By Feature Area

| Feature | Jest | Maestro | Loki | Appium |
|---------|------|---------|------|--------|
| Confidence Engine | ✅ High | ❌ | ❌ | ❌ |
| Matching Engine | ✅ High | ❌ | ❌ | ❌ |
| Results Screen Logic | ✅ High | ✅ Medium | ✅ High | ❌ |
| UI Components | ✅ Low | ✅ Medium | ✅ High | ❌ |
| User Flows | ❌ | ✅ High | ❌ | ❌ |
| Camera/Scanning | ❌ | ✅ Medium | ❌ | ✅ High |
| Authentication | ✅ Low | ✅ Medium | ❌ | ✅ High |
| Purchases | ❌ | ❌ | ❌ | ✅ High |
| Permissions | ❌ | ❌ | ❌ | ✅ High |

---

## CI/CD Integration

### GitHub Actions / EAS Build

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  jest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install --legacy-peer-deps
      - run: npm test -- --coverage

  maestro:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install --legacy-peer-deps
      - run: npm run prebuild:ios
      - run: maestro test maestro-tests/

  loki:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install --legacy-peer-deps
      - run: npm run loki:test

  appium:
    runs-on: macos-latest
    needs: [jest, maestro]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - run: npm install --legacy-peer-deps
      - run: npm run appium:test
```

---

## Test Data & Fixtures

### Jest Fixtures
```typescript
// src/lib/__tests__/fixtures/
- wardrobe-items.fixture.ts
- scanned-items.fixture.ts
- confidence-engine.fixture.ts
```

### Maestro Deep-Link Fixtures
```yaml
# Deep-link format
vibecode://results?fixture=high-match&wardrobeCount=10
vibecode://wardrobe?items=5&categories=top,bottom
vibecode://scan?mode=camera
```

### Loki Test Data
```typescript
// Consistent test data for visual tests
const testWardrobeItem = {
  imageUri: "https://example.com/test-image.jpg",
  category: "top",
  brand: "Test Brand"
};
```

---

## Best Practices Summary

### Jest
- ✅ Test business logic thoroughly
- ✅ Use deterministic fixtures
- ✅ Keep tests fast
- ✅ Mock external dependencies
- ✅ Test edge cases

### Maestro
- ✅ Use deep-link fixtures for state setup
- ✅ Test complete user flows
- ✅ Keep tests focused (one flow per file)
- ✅ Use descriptive assertions
- ✅ Test critical paths

### Loki
- ✅ Test critical UI components only
- ✅ Test all state variations
- ✅ Use consistent test data
- ✅ Review visual diffs carefully
- ✅ Keep visual tests fast

### Appium
- ✅ Test only device-dependent features
- ✅ Use real devices
- ✅ Keep tests minimal (they're slow)
- ✅ Focus on critical paths
- ✅ Test on multiple device types

---

## Maintenance & Updates

### When to Add Tests

**Jest:**
- New business logic functions
- Changes to confidence engine
- New utility functions
- Bug fixes (regression tests)

**Maestro:**
- New user flows
- New screens
- Critical path changes
- Deep-link scenarios

**Loki:**
- New UI components
- Visual design changes
- State variations
- Critical screens

**Appium:**
- New device-dependent features
- Camera/photo changes
- Auth flow changes
- Permission changes

### Test Review Process

1. **Jest:** Review coverage reports, aim for >80% on business logic
2. **Maestro:** Review test results, update fixtures as needed
3. **Loki:** Review visual diffs, approve intentional changes
4. **Appium:** Review on real devices, update as device features change

---

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Maestro Documentation](https://maestro.mobile.dev/)
- [Loki Documentation](https://loki.js.org/)
- [Appium Documentation](https://appium.io/)
- [Expo Deep Linking](https://docs.expo.dev/guides/linking/)
- [EAS Build](https://docs.expo.dev/build/introduction/)

---

## Questions?

For questions about the testing strategy, see:
- `MAESTRO_SETUP.md` - Maestro setup and usage
- `COMPREHENSIVE_SYSTEM_DOCUMENTATION.md` - System architecture
- Test files in `src/lib/**/__tests__/` - Example Jest tests

