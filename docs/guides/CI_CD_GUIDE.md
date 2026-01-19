# CI/CD Setup Guide

## Overview

You have **3 GitHub Actions workflows** that automatically run tests, build your app, and deploy it. This guide explains what each workflow does, when it runs, and how to use it.

---

## 🎯 Quick Summary

| Workflow | Purpose | When It Runs | Duration |
|----------|---------|--------------|----------|
| **Test Suite** | Run all tests (Jest, TypeScript, ESLint, Maestro) | Every push/PR to `main` or `develop` | ~10-15 min |
| **Build** | Build iOS app locally on GitHub | Push to `main` or tags `v*` | ~30-60 min |
| **EAS Build** | Build iOS/Android apps in the cloud | Push to `main` or tags `v*` | ~15-30 min |

---

## 📋 Workflow 1: Test Suite (`test.yml`)

### What It Does

Runs **4 types of checks** in parallel:

1. **Jest Unit Tests** (Ubuntu)
   - Tests your business logic (confidence engine, matching, scoring)
   - Generates code coverage reports
   - Fastest tests (~1-2 minutes)

2. **TypeScript Check** (Ubuntu)
   - Verifies all TypeScript code compiles without errors
   - Catches type errors before runtime
   - Fast (~30 seconds)

3. **ESLint** (Ubuntu)
   - Checks code style and catches common bugs
   - Ensures consistent code formatting
   - Fast (~30 seconds)

4. **Maestro E2E Tests** (macOS)
   - Runs end-to-end tests on iOS simulator
   - Tests complete user flows (scan → results → wardrobe)
   - Slower (~10-15 minutes) - only runs on `main` branch or PRs

### When It Runs

- ✅ **Every push** to `main` or `develop` branches
- ✅ **Every pull request** to `main` or `develop`
- ⚠️ Maestro tests only run on PRs or `main` branch (not on `develop`)

### How to Use

**Automatic:** Just push your code!
```bash
git add .
git commit -m "Your changes"
git push origin main
```

The workflow will automatically:
1. Checkout your code
2. Install dependencies
3. Run all tests
4. Show results in GitHub Actions tab

**Manual Trigger:** You can also trigger it manually:
1. Go to GitHub → Actions tab
2. Select "Test Suite" workflow
3. Click "Run workflow" → Choose branch → Run

### View Results

1. Go to: `https://github.com/nhoinets2/vibecode-app/actions`
2. Click on the latest workflow run
3. Expand each job to see results:
   - ✅ Green checkmark = Passed
   - ❌ Red X = Failed (click to see error details)

### What If Tests Fail?

- **Jest/TypeScript/ESLint:** Workflow continues (won't block) but shows warnings
- **Maestro:** Workflow continues (won't block) but shows warnings
- All failures are logged with details - click the failed job to see the error

---

## 🏗️ Workflow 2: Build (`build.yml`)

### What It Does

Builds your **iOS app** directly on GitHub's macOS runner:

1. **Installs dependencies** (npm + CocoaPods)
2. **Prebuilds iOS project** (generates native iOS code)
3. **Builds iOS app** using Xcode
4. **Uploads build artifact** (`.app` file) that you can download

### When It Runs

- ✅ **Push to `main` branch**
- ✅ **Tags starting with `v*`** (e.g., `v1.0.0`)
- ✅ **Manual trigger** (workflow_dispatch)

### How to Use

**Automatic:** Push to main:
```bash
git push origin main
```

**Manual Trigger:**
1. Go to GitHub → Actions → "Build" workflow
2. Click "Run workflow" → Choose branch → Run

**Create a Release Build:**
```bash
git tag v1.0.0
git push origin v1.0.0
```

### Download Build Artifact

1. Go to the workflow run
2. Scroll to bottom → "Artifacts" section
3. Click "ios-build" to download
4. The `.app` file can be installed on simulators or devices

### Build Configuration

- **Platform:** iOS Simulator
- **Configuration:** Release
- **Device:** iPhone 15 (simulator)
- **Timeout:** 60 minutes
- **Artifact Retention:** 7 days

---

## ☁️ Workflow 3: EAS Build (`eas-build.yml`)

### What It Does

Builds your app using **Expo Application Services (EAS)** in the cloud:

1. **Builds iOS app** (for App Store or TestFlight)
2. **Builds Android app** (for Google Play or internal testing)
3. Uses Expo's cloud infrastructure (faster than local builds)

### When It Runs

- ✅ **Push to `main` branch**
- ✅ **Tags starting with `v*`** (e.g., `v1.0.0`)
- ✅ **Manual trigger** (workflow_dispatch)

### Prerequisites

You need to set up:
1. **Expo account** (free): https://expo.dev
2. **EAS CLI configured:** `npx eas build:configure`
3. **GitHub Secret:** `EXPO_TOKEN` (your Expo access token)

### How to Use

**Automatic:** Push to main:
```bash
git push origin main
```

**Manual Trigger:**
1. Go to GitHub → Actions → "EAS Build" workflow
2. Click "Run workflow" → Choose branch → Run

### View Builds

1. Go to: https://expo.dev/accounts/[your-account]/builds
2. See all builds (iOS and Android)
3. Download `.ipa` (iOS) or `.apk` (Android) files
4. Install on devices or submit to app stores

### Build Profiles

Currently uses `preview` profile (defined in `eas.json`):
- **iOS:** Development build (can install on devices)
- **Android:** Development build (can install on devices)

You can create other profiles:
- `production` - For App Store/Play Store
- `development` - For development testing

---

## 🔄 How Workflows Work Together

```
┌─────────────────────────────────────────┐
│  You push code to main branch           │
└──────────────┬──────────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │  Test Suite          │  ← Runs first (fast feedback)
    │  - Jest               │
    │  - TypeScript         │
    │  - ESLint             │
    │  - Maestro            │
    └──────────┬────────────┘
               │
               ▼
    ┌──────────────────────┐
    │  Build (iOS)         │  ← Runs in parallel
    │  - Local build        │
    └──────────┬────────────┘
               │
               ▼
    ┌──────────────────────┐
    │  EAS Build           │  ← Runs in parallel
    │  - iOS (cloud)       │
    │  - Android (cloud)   │
    └──────────────────────┘
```

**Note:** All workflows run in parallel, so you get fast feedback from tests while builds happen in the background.

---

## 📊 Workflow Status Badges

You can add badges to your README to show workflow status:

```markdown
![Tests](https://github.com/nhoinets2/vibecode-app/workflows/Test%20Suite/badge.svg)
![Build](https://github.com/nhoinets2/vibecode-app/workflows/Build/badge.svg)
![EAS Build](https://github.com/nhoinets2/vibecode-app/workflows/EAS%20Build/badge.svg)
```

---

## 🛠️ Common Tasks

### Run Tests Locally

```bash
# All Jest tests
npm test

# Watch mode
npm test -- --watch

# With coverage
npm test -- --coverage

# TypeScript check
npm run typecheck

# ESLint
npm run lint
```

### Run Maestro Tests Locally

```bash
# Make sure app is running in simulator first
npm start

# In another terminal
maestro test maestro-tests/
```

### Check Workflow Status

```bash
# View recent commits
git log --oneline -5

# Check if workflows are running
# Go to: https://github.com/nhoinets2/vibecode-app/actions
```

### Re-run Failed Workflow

1. Go to GitHub Actions tab
2. Click on the failed workflow run
3. Click "Re-run all jobs" or "Re-run failed jobs"

---

## 🐛 Troubleshooting

### Tests Fail Locally But Pass in CI

- **Check Node version:** CI uses Node 22, make sure you're using the same
- **Clear cache:** `npm cache clean --force && rm -rf node_modules && npm install`
- **Check dependencies:** Make sure `package-lock.json` is committed

### Build Fails with "lightningcss" Error

This is fixed! The workflow now:
1. Clears npm cache
2. Reinstalls dependencies
3. Verifies native binaries are present

If it still fails, check the workflow logs for the exact error.

### Maestro Tests Fail

- **Check simulator:** Make sure iPhone 16 Pro is available
- **Check app build:** Make sure the app built successfully
- **Check Maestro version:** CI installs latest, make sure yours matches

### Prebuild Fails (All Workflows)

**Common Issue: Expo Account Billing Errors**

If you see billing errors during `npm run prebuild:ios`:

```
The job was not started because recent account payments have failed 
or your spending limit needs to be increased.
```

**This affects ALL workflows** because they all need to run `expo prebuild` to generate native code.

**Solutions:**

1. **Fix Billing (Required):**
   - Go to [Expo Dashboard Billing](https://expo.dev/accounts/[your-account]/settings/billing)
   - Update payment method
   - Increase spending limit if needed
   - **Note:** `expo prebuild` shouldn't require billing, but Expo CLI may check account status

2. **Workaround (Temporary):**
   - The workflows will now skip build steps if prebuild fails
   - Jest/TypeScript/ESLint tests will still run (they don't need prebuild)
   - Fix billing to enable iOS builds

**Why This Happens:**
- Expo CLI may check account status during `expo prebuild`
- If account has billing issues, Expo CLI may block operations
- This is a known issue with Expo's account verification

### EAS Build Fails

**Common Issue: Billing/Payment Errors**

If you see:
```
The job was not started because recent account payments have failed 
or your spending limit needs to be increased.
```

**This is a billing issue, not a code problem.** Solutions:

1. **Fix Billing (Recommended):**
   - Go to [Expo Dashboard](https://expo.dev/accounts/[your-account]/settings/billing)
   - Update payment method or increase spending limit
   - EAS builds will resume automatically

2. **Skip EAS Builds (Temporary):**
   - EAS builds are **optional** - your app will still work
   - Other workflows (Test Suite, Build) will continue to run
   - You can use the local Build workflow instead
   - Remove or comment out the EAS workflow if you don't need it

3. **Make EAS Build Optional:**
   - The workflow already has `continue-on-error: true`
   - It will show as failed but won't block other workflows
   - You can ignore the failure until billing is fixed

**Note:** EAS builds are useful for production releases but not required for development. The local Build workflow works fine for testing.

- **Check EXPO_TOKEN:** Make sure it's set in GitHub Secrets
- **Check eas.json:** Make sure it exists and is valid
- **Check Expo account:** Make sure you have build credits

---

## 📚 Related Documentation

- **`TESTING_STRATEGY.md`** - Detailed testing approach (Jest, Maestro, Loki, Appium)
- **`MAESTRO_SETUP.md`** - How to set up and run Maestro tests locally
- **`CI_CD_QUICK_START.md`** - Initial setup instructions
- **GitHub Actions Docs:** https://docs.github.com/en/actions

---

## 🎯 Best Practices

1. **Always run tests locally** before pushing
2. **Check workflow status** after pushing
3. **Fix failing tests** before merging PRs
4. **Use tags** for releases (`v1.0.0`, `v1.1.0`, etc.)
5. **Monitor build artifacts** - download and test them
6. **Keep workflows fast** - don't add slow steps unnecessarily

---

## 💡 Tips

- **Fast feedback:** Jest/TypeScript/ESLint run in parallel and finish quickly
- **Save time:** EAS Build is faster than local builds for production
- **Test locally first:** Catch issues before pushing to save CI time
- **Use manual triggers:** Test workflows without pushing code
- **Check logs:** Always check workflow logs for detailed error messages

---

## ❓ Questions?

- Check workflow logs in GitHub Actions tab
- Review `TESTING_STRATEGY.md` for testing details
- Check `CI_CD_QUICK_START.md` for setup help
- Review individual workflow files in `.github/workflows/`

