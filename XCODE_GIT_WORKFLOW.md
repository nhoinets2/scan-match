# Xcode Git Integration Workflow

## Overview

Connect Xcode directly to your Git repository to pull updates without manually downloading and rebuilding everything.

## Setup: Connect Xcode to Git Repository

### Step 1: Add Repository to Xcode

1. **Open Xcode**
2. **Source Control → Clone...** (or `⌘⇧O` then type "Clone")
3. **Enter your repository URL:**
   ```
   https://git.vibecodeapp.com/019b2408-3ded-75d8-8438-74406e9503f5.git
   ```
4. **Choose location** (e.g., `~/Projects/`)
5. **Click Clone**

### Step 2: Open the Project

After cloning:
1. Navigate to the cloned folder
2. Run `npm install --legacy-peer-deps` (one-time setup)
3. Run `npm run prebuild:ios` (one-time setup)
4. Open `ios/vibecode.xcworkspace` in Xcode

## Daily Workflow: Getting Updates

### Option 1: Pull Updates in Xcode (Recommended)

1. **In Xcode, go to:** Source Control → Pull... (or `⌘⇧X`)
2. **Review changes** in the Source Control navigator
3. **Pull latest changes**

**When to rebuild:**
- ✅ **No rebuild needed** if only JavaScript/TypeScript files changed
- ✅ **Rebuild needed** if:
  - `package.json` changed (run `npm install --legacy-peer-deps`)
  - Native dependencies changed (run `npm run prebuild:ios`)
  - `app.json` changed (run `npm run prebuild:ios`)

### Option 2: Pull from Terminal (Alternative)

```bash
# In your project directory
git pull origin main

# If package.json changed
npm install --legacy-peer-deps

# If native dependencies changed
npm run prebuild:ios

# Then rebuild in Xcode
```

## Smart Rebuild Detection

### Quick Check: Do I Need to Rebuild?

**Check what changed:**
```bash
git diff HEAD~1 package.json app.json
```

**No rebuild needed if:**
- Only `src/` files changed
- Only test files changed
- Only documentation changed

**Rebuild needed if:**
- `package.json` changed → `npm install --legacy-peer-deps`
- `app.json` changed → `npm run prebuild:ios`
- Native modules added/removed → `npm run prebuild:ios`
- `ios/` folder was deleted → `npm run prebuild:ios`

## Xcode Source Control Features

### View Changes
- **Source Control Navigator** (`⌘2`) - See all changes
- **File Inspector** - See file history
- **Compare Editor** - See diffs side-by-side

### Commit Changes
- **Source Control → Commit...** (`⌘⌥C`)
- Review changes before committing
- Write commit message

### Branch Management
- **Source Control → Branches...** - Switch branches
- Create feature branches
- Merge branches

## Optimized Workflow

### Typical Update Flow (Most Common)

```bash
# 1. Pull updates in Xcode
Source Control → Pull... (⌘⇧X)

# 2. Check if rebuild needed
# (Look at what files changed)

# 3. If only JS/TS changed:
# Just rebuild in Xcode (⌘R)
# Metro will reload automatically

# 4. If native changes:
npm install --legacy-peer-deps  # If package.json changed
npm run prebuild:ios            # If native deps changed
# Then rebuild in Xcode
```

### Fast Update Script

Create a helper script:

```bash
#!/bin/bash
# scripts/update-and-build.sh

echo "📥 Pulling latest changes..."
git pull origin main

echo "🔍 Checking for dependency changes..."
if git diff HEAD~1 --name-only | grep -q "package.json"; then
  echo "📦 Installing dependencies..."
  npm install --legacy-peer-deps
fi

if git diff HEAD~1 --name-only | grep -qE "(app.json|package.json)"; then
  echo "🔨 Rebuilding native code..."
  npm run prebuild:ios
fi

echo "✅ Ready! Open Xcode and build (⌘R)"
```

Then just run:
```bash
./scripts/update-and-build.sh
```

## Troubleshooting

### Issue: Xcode can't authenticate

**Solution:** Add SSH key or use HTTPS with credentials
- **SSH:** Add your SSH key to `~/.ssh/`
- **HTTPS:** Xcode will prompt for credentials

### Issue: Pull conflicts

**Solution:**
1. **Source Control → Discard Changes...** (if you have local changes)
2. Or **Source Control → Resolve Conflicts...** to merge

### Issue: Xcode shows "No Source Control"

**Solution:**
1. **File → Add Files to "vibecode"...**
2. Or ensure `.git` folder exists in project root

### Issue: Prebuild fails after pull

**Solution:**
```bash
# Clean and retry
rm -rf ios android
npm run prebuild:ios
```

### Issue: Xcode shows uncommitted changes but Git status is clean

**Symptom:** Xcode shows files (like `package-lock.json`) as uncommitted, but `git status` shows nothing.

**This is an Xcode Git cache issue.** Try these solutions in order:

#### Solution 1: Refresh Xcode's Git Status

**Method A: Via Source Control Menu**
1. **Source Control → Refresh Status** (if available in your Xcode version)

**Method B: Force Refresh via Terminal**
1. Close Xcode
2. In Terminal, run:
   ```bash
   cd /path/to/your/project
   git status
   ```
3. If Git shows clean, reopen Xcode
4. The status should refresh automatically when Xcode reopens

**Method C: Re-open the Project**
1. Close the project in Xcode
2. Reopen `ios/vibecode.xcworkspace`
3. Xcode will re-scan Git status on open

#### Solution 2: Force Refresh from Terminal
```bash
# In your project directory
git add -A
git reset HEAD
git status  # Should show clean
```
Then close and reopen Xcode (Solution 1, Method C).

#### Solution 3: Clear Xcode's Derived Data
1. **Xcode → Settings → Locations**
2. Click the arrow next to **Derived Data** path
3. Delete the folder for your project
4. Restart Xcode

#### Solution 4: Re-index the File (Last Resort)
```bash
# In your project directory
# Remove the file from Git's index and re-add it
git rm --cached package-lock.json
git add package-lock.json
git status  # Should show clean
```
Then close and reopen Xcode (Solution 1, Method C).

#### Solution 5: Use Terminal for Pulls (Recommended)
If Xcode continues to show false warnings:
- **Pull from Terminal instead:**
  ```bash
  git pull origin main
  ```
- Close and reopen Xcode to refresh status
- **The warning is cosmetic** - your repository is actually clean
- You can safely ignore the warning and continue working

## Benefits

✅ **Faster updates** - Pull directly in Xcode  
✅ **See changes** - Visual diff in Xcode  
✅ **No manual download** - Everything in one place  
✅ **Version control** - Track all changes  
✅ **Branch support** - Test different versions  

## Quick Reference

| Action | Xcode Shortcut | When to Use |
|--------|---------------|-------------|
| Pull updates | `⌘⇧X` | Get latest code |
| View changes | `⌘2` (Source Control) | See what changed |
| Commit | `⌘⌥C` | Save your changes |
| Discard changes | Right-click → Discard | Undo local changes |
| Rebuild | `⌘R` | After pulling updates |

---

## Next Steps

1. **Clone repository in Xcode** (one-time)
2. **Set up project** (`npm install`, `npm run prebuild:ios`)
3. **Use Source Control → Pull** for daily updates
4. **Only rebuild when needed** (check what changed)

