# Maestro Testing: Development vs Production Builds

## Current Setup: Development Build

You're currently using a **development build** (built with `expo-dev-client`). This affects how you run Maestro tests.

## Two Build Types Comparison

### Development Build (What You Have Now)

**Characteristics:**
- JavaScript code is served dynamically from Metro bundler
- Requires Metro to be running (`npm start`)
- Code changes reflect immediately (hot reload)
- Faster iteration during development
- Uses `expo-dev-client` package

**Maestro Testing Workflow:**
```bash
# Terminal 1: Start Metro (REQUIRED)
npm start

# Terminal 2: Run Maestro tests
maestro test maestro-tests/
```

**Pros:**
- ✅ Fast iteration - test code changes immediately
- ✅ No rebuild needed for JavaScript changes
- ✅ Can test latest code without rebuilding app

**Cons:**
- ❌ Must keep Metro running during tests
- ❌ More complex setup (2 terminals)
- ❌ Not representative of production app behavior

---

### Production/Standalone Build

**Characteristics:**
- JavaScript is bundled into the app binary
- No Metro needed
- Self-contained app (like App Store version)
- Slower to rebuild (need full rebuild for each change)
- More like real user experience

**How to Build:**
```bash
# Option 1: Local production build
npx expo run:ios --configuration Release

# Option 2: EAS Build (cloud)
eas build --platform ios --profile production
```

**Maestro Testing Workflow:**
```bash
# No Metro needed! Just run tests
maestro test maestro-tests/
```

**Pros:**
- ✅ Simpler - no Metro needed
- ✅ Tests real production app behavior
- ✅ Better for CI/CD pipelines
- ✅ More reliable (no network dependency)

**Cons:**
- ❌ Must rebuild app for each code change
- ❌ Slower iteration cycle
- ❌ Takes longer to test changes

---

## When to Use Each

### Use Development Build When:
- ✅ Actively developing and testing code changes
- ✅ Need to test latest code quickly
- ✅ Iterating on features
- ✅ Local development and testing

**Example workflow:**
```bash
# Make code change
# Metro auto-reloads
# Run Maestro test immediately
maestro test maestro-tests/
```

### Use Production Build When:
- ✅ Running CI/CD automated tests
- ✅ Testing final app behavior before release
- ✅ Need consistent, reproducible test environment
- ✅ Testing performance or production-specific behavior

**Example workflow:**
```bash
# Build production app
eas build --platform ios --profile production

# Install on simulator
# Run tests (no Metro needed)
maestro test maestro-tests/
```

---

## Hybrid Approach (Recommended)

Use **both** depending on the situation:

### Daily Development
- Use **development build** with Metro
- Fast iteration and testing

### Before Committing/CI
- Build **production build**
- Run full test suite
- Verify production behavior

---

## Switching Between Builds

### Current: Development Build
```bash
# What you're doing now
npm start                    # Metro required
maestro test maestro-tests/   # Run tests
```

### Switch to Production Build
```bash
# Build production version
npx expo run:ios --configuration Release

# Or use EAS
eas build --platform ios --profile production

# Then run tests (no Metro needed)
maestro test maestro-tests/
```

---

## CI/CD Considerations

For automated testing in CI/CD, **production builds are preferred** because:
- No Metro dependency
- More reliable
- Faster test execution (no Metro startup)
- Represents real app behavior

**Example CI workflow:**
```yaml
# .github/workflows/test.yml
- name: Build production app
  run: eas build --platform ios --profile production

- name: Install on simulator
  run: xcrun simctl install ...

- name: Run Maestro tests
  run: maestro test maestro-tests/
  # No Metro needed!
```

---

## Summary

| Aspect | Development Build | Production Build |
|--------|------------------|------------------|
| Metro Required | ✅ Yes | ❌ No |
| Rebuild for Changes | ❌ No (hot reload) | ✅ Yes |
| Test Speed | Fast iteration | Slower (rebuild needed) |
| Production-like | ❌ No | ✅ Yes |
| CI/CD Friendly | ⚠️ More complex | ✅ Better |
| Best For | Development | Final testing/CI |

**Your current setup (development build) is perfect for active development!**

