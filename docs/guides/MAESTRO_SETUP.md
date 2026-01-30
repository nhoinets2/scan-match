# Maestro Testing Setup

## Issue
When running `EXPO_USE_NPM=1 npx expo run:ios`, you encounter:
```
TypeError: Cannot read properties of undefined (reading 'push')
```

This is a known bug in Expo CLI 0.24.21's logging system.

## Quick Answer: What to Repeat?

**One-time setup (do once):**
- ✅ Install dependencies (Step 1)
- ✅ Prebuild iOS project (Step 2)
- ✅ Create `maestro-tests/` folder (Step 4)

**Repeat when you get updates:**
- 🔄 Install dependencies (if `package.json` changed)
- 🔄 Prebuild (if native dependencies changed or `ios/` folder was deleted)
- 🔄 Build & run in Xcode (every time you want to test)

**Every test run:**
- 🔄 Build app in Xcode (if not already running)
- 🔄 Run Maestro tests

## Complete Setup Guide

### Initial Setup (One-Time)

### Step 1: Install Dependencies

Navigate to your project directory and install dependencies:

```bash
cd /path/to/your/project
npm install --legacy-peer-deps
```

**Note:** The `--legacy-peer-deps` flag is required due to peer dependency conflicts in React Navigation packages. This is safe and common in React Native projects.

**Verify installation:**
```bash
# Quick check
ls node_modules

# Or use the helper script
./check-dependencies.sh
```

Expected output:
- ✅ node_modules folder exists (1.2GB+)
- ✅ Key packages installed (expo, react, react-native)
- 📊 900+ packages installed

### Step 2: Prebuild iOS Project

Generate the native iOS project files:

```bash
npm run prebuild:ios
```

This will:
- Create the `ios/` folder
- Generate `ios/vibecode.xcworkspace`
- Install CocoaPods dependencies
- Set up native iOS code

**Expected output:**
```
✔ Created native directory
✔ Updated package.json
✔ Finished prebuild
✔ Installed CocoaPods
```

### Step 3: Open Xcode and Build

**Option A: Use Helper Script (Easiest)**
```bash
npm run ios:maestro
```
This automatically runs prebuild (if needed) and opens Xcode.

**Option B: Open Manually**
```bash
open ios/vibecode.xcworkspace
```

**In Xcode:**
1. Wait for indexing to complete (progress bar at top)
2. Select a simulator from the device dropdown (top toolbar)
   - Choose an iPhone simulator (e.g., "iPhone 15 Pro")
3. Build and run:
   - Click the **Play** button (▶️) or press `⌘R`
   - Wait for build to complete (2-5 minutes first time)
   - App will launch in simulator

**Note:** Metro bundler may start automatically, or you may need to run `npm start` in a separate terminal.

### Step 4: Create Maestro Tests Folder (One-Time)

Create the tests directory in your project:

```bash
mkdir maestro-tests
```

**Project structure:**
```
GoodTogether/
├── src/
├── ios/
├── node_modules/
├── package.json
├── maestro-tests/          ← Your tests go here
│   └── (test files)
└── ...
```

**Note:** This is a one-time setup. The folder persists in your project.

### Step 5: Create Your First Test (One-Time)

Create a test file:

```bash
nano maestro-tests/example.yaml
```

Paste this basic test:
```yaml
appId: com.snaptomatch.app
---
- launchApp
- assertVisible: "Your app element"
```

**Important:** Make sure `appId` matches your bundle identifier (check `app.json` or Xcode's "Signing & Capabilities" tab). Current bundle ID is `com.snaptomatch.app`.

### Step 6: Run Maestro Tests (Repeat Every Time)

Once your app is built and running in the simulator:

```bash
# From project root - run all tests
maestro test maestro-tests/

# Run a specific test file
maestro test maestro-tests/example.yaml

# Run with app already running (skip launch)
maestro test maestro-tests/ --no-launch
```

## Regular Workflow (After Initial Setup)

When you get a new version of the app (e.g., after `git pull`):

### 1. Check if Dependencies Changed
```bash
# If package.json was updated, reinstall dependencies
npm install --legacy-peer-deps
```

### 2. Check if Native Code Changed
```bash
# If ios/ folder was deleted or native dependencies changed
npm run prebuild:ios
```

**When to prebuild:**
- ✅ `ios/` folder is missing
- ✅ `package.json` dependencies changed (especially native modules)
- ✅ You see errors about missing native modules
- ❌ Not needed if only JavaScript/TypeScript code changed

### 3. Build and Run in Xcode
```bash
# Open Xcode
open ios/vibecode.xcworkspace
# OR
npm run ios:maestro
```

Then in Xcode:
- Select simulator
- Click Run (▶️) or press `⌘R`

### 4. Run Tests
```bash
maestro test maestro-tests/
```

## Typical Workflow Examples

### Scenario 1: Only Code Changes (Most Common)
```bash
git pull                    # Get latest code
# Skip npm install (no package.json changes)
# Skip prebuild (no native changes)
open ios/vibecode.xcworkspace  # Build & run in Xcode
maestro test maestro-tests/     # Run tests
```

### Scenario 2: Dependencies Updated
```bash
git pull
npm install --legacy-peer-deps  # Reinstall if package.json changed
npm run prebuild:ios            # Rebuild native code
open ios/vibecode.xcworkspace
maestro test maestro-tests/
```

### Scenario 3: Fresh Clone
```bash
git clone <repo>
cd <project>
npm install --legacy-peer-deps  # Initial install
npm run prebuild:ios            # Initial prebuild
mkdir maestro-tests              # Create tests folder (one-time)
open ios/vibecode.xcworkspace
maestro test maestro-tests/
```

## Alternative Solutions

### Solution 1: Build via Command Line (for CI/CD)

```bash
npm run build:ios
```

This builds the app via xcodebuild, bypassing Expo CLI.

### Solution 2: Try Updating Expo CLI (May Break Compatibility)

⚠️ **Warning**: This might not be compatible with Expo SDK 53

```bash
npm install -D @expo/cli@latest
```

Then try:
```bash
EXPO_USE_NPM=1 npx expo run:ios
```

## Troubleshooting

### Dependency Installation Issues

**Error: ERESOLVE unable to resolve dependency tree**
```bash
# Use --legacy-peer-deps flag
npm install --legacy-peer-deps
```

**Error: Permission denied**
- Don't use `sudo` with npm
- Fix npm permissions: `npm config set prefix ~/.npm-global`
- Or use a Node version manager (nvm)

**Check if dependencies are installed:**
```bash
# Quick check
ls node_modules

# Detailed check
./check-dependencies.sh
```

### Prebuild Issues

**If prebuild fails:**
```bash
# Clean and retry
rm -rf ios android
npm run prebuild:ios
```

**If CocoaPods fails:**
```bash
cd ios
pod install
cd ..
```

### Xcode Build Issues

**If Xcode build fails:**
1. Open Xcode workspace: `open ios/vibecode.xcworkspace`
2. Clean build folder: **Product → Clean Build Folder** (⇧⌘K)
3. Delete derived data: `rm -rf ~/Library/Developer/Xcode/DerivedData`
4. Try building again

**If simulator won't launch:**
```bash
# List available simulators
xcrun simctl list devices

# Boot a specific simulator
xcrun simctl boot "iPhone 15 Pro"
```

### Metro Bundler Issues

**If Metro bundler won't start:**
```bash
# Clear Metro cache
npx expo start --clear

# Or start Metro separately
npm start
```

**If Metro can't find modules:**
```bash
# Clear all caches
rm -rf node_modules
npm install --legacy-peer-deps
npm start -- --reset-cache
```

### Maestro Test Issues

**Error: App not found**
- Make sure app is built and installed in simulator
- Verify `appId` in test file matches bundle identifier
- Check that simulator is running (not just Xcode)

**Error: Can't launch app**
- Ensure app is built: Run from Xcode first
- Check app ID: Look in `app.json` or Xcode's "Signing & Capabilities"
- Try: `maestro test . --no-launch` (if app is already running)

**Finding your app ID:**
- Check `app.json` for `scheme` or bundle identifier
- Or in Xcode: Project → Signing & Capabilities → Bundle Identifier

## Quick Reference Commands

```bash
# Setup (one-time)
npm install --legacy-peer-deps
npm run prebuild:ios

# Build & Run
npm run ios:maestro          # Opens Xcode automatically
# OR
open ios/vibecode.xcworkspace  # Then use Xcode UI

# Testing
maestro test maestro-tests/
maestro test maestro-tests/example.yaml
maestro test maestro-tests/ --no-launch
```

## Alternative: Use EAS Build (Cloud)

If local builds continue to have issues, consider using EAS Build:

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure
eas build:configure

# Build for iOS simulator
eas build --platform ios --profile development
```

Then download and install the build, and run Maestro tests.

## Test Organization

### Option 1: Tests in Project (Recommended)
```
project/
├── maestro-tests/
│   ├── login.yaml
│   ├── onboarding.yaml
│   └── ...
```
**Pros:** Easy to version control, everything in one place  
**Run:** `maestro test maestro-tests/`

### Option 2: Tests in Separate Directory
```
~/Documents/
├── maestro-tests/
│   └── ...
```
**Pros:** Keeps tests isolated  
**Run:** `maestro test ~/Documents/maestro-tests/`

Both options work fine. Choose based on your workflow preferences.

