# Fresh Setup Guide - From Scratch

## Complete Setup Steps (Do These in Order)

### Step 1: Clone the Repository

**✅ Use Terminal (Recommended - Xcode cloning often has SSL issues)**

```bash
# Navigate to where you want the project
cd ~/Projects  # or wherever you keep projects

# Clone the repository
git clone https://git.vibecodeapp.com/019b2408-3ded-75d8-8438-74406e9503f5.git

# Enter the project folder
cd 019b2408-3ded-75d8-8438-74406e9503f5
```

**Note:** If you get SSL errors in Xcode's clone dialog, use Terminal instead (it's more reliable).

### Step 2: Install Dependencies

```bash
# Make sure you're in the project folder
cd ~/Projects/019b2408-3ded-75d8-8438-74406e9503f5

# Install all dependencies
npm install --legacy-peer-deps
```

**What this does:** Downloads all the packages your project needs (React Native, Expo, etc.)

### Step 3: Generate iOS Project

```bash
# Still in the project folder, run:
npm run prebuild:ios
```

**What this does:** 
- Creates the `ios/` folder with Xcode project files
- Configures native iOS settings from `app.json`
- Installs CocoaPods dependencies

**Note:** This may take a few minutes the first time.

### Step 4: Open in Xcode

```bash
# Open the workspace (NOT the .xcodeproj file)
open ios/vibecode.xcworkspace
```

**Important:** Always open `.xcworkspace`, never `.xcodeproj`!

### Step 5: Build and Run

**IMPORTANT: Start Metro FIRST, then build in Xcode!**

1. **Start Metro Bundler (in Terminal - do this FIRST):**
   ```bash
   cd ~/Projects/019b2408-3ded-75d8-8438-74406e9503f5
   npm start
   ```
   Keep this terminal running - you should see:
   ```
   Metro waiting on exp://...
   ```
   **Don't close this terminal!**

2. **In Xcode:**
   - Select a simulator from the device dropdown (e.g., "iPhone 17 Pro")
   - Press `⌘R` or click the Play button
   - Wait for the build to complete (2-5 minutes first time)

3. **The app should launch and connect to Metro automatically!**

---

## Quick Reference: Commands in Order

```bash
# 1. Clone (if using Terminal)
git clone https://git.vibecodeapp.com/019b2408-3ded-75d8-8438-74406e9503f5.git
cd 019b2408-3ded-75d8-8438-74406e9503f5

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Generate iOS project
npm run prebuild:ios

# 4. Open in Xcode
open ios/vibecode.xcworkspace

# 5. In Xcode: Select simulator → Press ⌘R

# 6. In separate Terminal: Start Metro
npm start
```

---

## Troubleshooting

### Issue: "Command not found: npm"
**Solution:** Install Node.js from https://nodejs.org/ (LTS version)

### Issue: "Cannot find module '../lightningcss.darwin-arm64.node'"
**This happens when the lightningcss native binary wasn't built correctly.**
**Solution (try in order):**

**Option 1: Force rebuild native modules**
```bash
# Remove node_modules
rm -rf node_modules

# Clear npm cache
npm cache clean --force

# Reinstall with rebuild
npm install --legacy-peer-deps --force
```

**Option 2: Rebuild just lightningcss**
```bash
# Remove lightningcss specifically
rm -rf node_modules/lightningcss

# Reinstall it
npm install lightningcss --legacy-peer-deps --force
```

**Option 3: Full clean reinstall**
```bash
# Remove everything
rm -rf node_modules
rm -f package-lock.json bun.lock

# Clear cache
npm cache clean --force

# Fresh install
npm install --legacy-peer-deps
```

### Issue: Prebuild fails
**Solution:** 
```bash
# Clean and retry
rm -rf ios android
npm run prebuild:ios
```

### Issue: CocoaPods errors
**Solution:**
```bash
# Install/update CocoaPods
sudo gem install cocoapods

# Then retry prebuild
npm run prebuild:ios
```

### Issue: Metro won't connect (Error -1004)
**Symptoms:** App launches but shows "Could not connect to the server" error, even though Metro is running

**Diagnosis Steps:**
1. **Check if Metro is actually running:**
   ```bash
   # Check what's using port 8081
   lsof -i :8081
   
   # Check Metro output - what port does it say it's on?
   # Look for: "Metro waiting on exp://..."
   ```

2. **Check if Metro is on the expected port:**
   - Metro usually runs on port 8081
   - The error shows it's trying port 19002
   - This might be a port mismatch

**Solution:**
1. **Kill ALL Metro/node processes and restart:**
   ```bash
   # Kill any existing Metro processes
   lsof -ti:8081 | xargs kill -9 2>/dev/null || true
   lsof -ti:19000 | xargs kill -9 2>/dev/null || true
   lsof -ti:19001 | xargs kill -9 2>/dev/null || true
   lsof -ti:19002 | xargs kill -9 2>/dev/null || true
   
   # Also kill any node processes that might be Metro
   pkill -f "expo start" || true
   pkill -f "metro" || true
   
   # Start Metro fresh
   npm start -- --reset-cache
   ```

2. **Verify Metro started correctly:**
   - Look for: `Metro waiting on exp://192.168.x.x:8081`
   - Note the IP address and port

3. **In the simulator, reload the app:**
   - Shake device → Reload, OR
   - Press `r` in Metro terminal, OR
   - Press `⌘R` in Xcode again

4. **If still not working, try manual connection:**
   - In the app, tap "Enter URL manually"
   - Enter: `http://localhost:8081` (or the IP/port Metro shows)

**Note:** Sometimes Metro needs to be restarted after the app builds. Always check Metro terminal for connection logs!

---

## What Each Folder Does

- `src/` - Your app code (TypeScript/React Native)
- `ios/` - Generated iOS native project (don't edit manually)
- `android/` - Generated Android native project (don't edit manually)
- `node_modules/` - Installed dependencies (don't commit)
- `app.json` - Expo configuration (edit this to change native settings)

---

## Next Steps After Setup

Once everything is working:
1. ✅ Test the app runs in simulator
2. ✅ Make code changes in `src/`
3. ✅ See changes hot-reload automatically
4. ✅ Continue development!

---

## After Pulling Changes from Git

### When You DON'T Need to Rebuild

**JavaScript/TypeScript changes only** (most common):
```bash
# Pull changes
git pull

# That's it! Metro will hot-reload automatically
# Just keep Metro running (npm start)
```

**What triggers hot-reload:**
- ✅ Changes in `src/` folder (React components, TypeScript files)
- ✅ Changes in configuration files (if not native)
- ✅ Maestro test files (YAML files)

**No Xcode rebuild needed!** Metro handles it automatically.

### When You DO Need to Rebuild

**Native code changes:**
```bash
# Pull changes
git pull

# Check what changed
git diff HEAD~1 package.json app.json

# If package.json or app.json changed:
npm install --legacy-peer-deps  # If dependencies changed
npm run prebuild:ios            # Regenerate iOS project
open ios/vibecode.xcworkspace  # Rebuild in Xcode (⌘R)
```

**What requires rebuild:**
- ❌ `package.json` changed (new dependencies)
- ❌ `app.json` changed (native config)
- ❌ Native modules added/removed
- ❌ `ios/` folder was deleted

---

## Quick Decision Guide

**After `git pull`, ask yourself:**

1. **Did only `src/` files change?**
   → ✅ No rebuild needed, Metro auto-reloads

2. **Did `package.json` or `app.json` change?**
   → ❌ Rebuild needed: `npm install` + `npm run prebuild:ios` + Xcode rebuild

3. **Did native code change?**
   → ❌ Rebuild needed

4. **Only test files changed?**
   → ✅ No rebuild needed

