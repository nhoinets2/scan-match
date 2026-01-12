# Remote (Cursor/Vibecode) → Local (Xcode) Workflow

## Understanding the Setup

You have **two environments**:

1. **Remote Environment (Cursor/Vibecode via SSH)**
   - Where you write code
   - Connected to Git repository
   - Changes are committed and pushed here

2. **Local Environment (Your Laptop with Xcode)**
   - Where you test and run Maestro
   - Pulls updates from Git
   - Builds and runs the app

## Complete Workflow

### Step 1: Make Changes (Remote - Cursor/Vibecode)

You work in Cursor/Vibecode (SSH session):
- Edit code
- Test logic
- Make changes

### Step 2: Commit & Push (Remote - Cursor/Vibecode)

When you're ready to test:

```bash
# In Cursor/Vibecode terminal
git add .
git commit -m "Your changes"
git push origin main
```

**This updates the Git repository** with your changes.

### Step 3: Pull Updates (Local - Your Laptop)

On your laptop, in Xcode:

1. **Source Control → Pull...** (`⌘⇧X`)
   - This downloads the changes you just pushed
   - Xcode shows what files changed

2. **Check if rebuild needed:**
   - Only code changes? → Just rebuild (`⌘R`)
   - `package.json` or `app.json` changed? → Run `npm install` or `prebuild` first

3. **Build and test:**
   - Build in Xcode (`⌘R`)
   - Run Maestro tests

## Visual Flow

```
┌─────────────────────────────────┐
│  Remote (Cursor/Vibecode)      │
│  ────────────────────────────   │
│  1. Edit code                    │
│  2. git commit                   │
│  3. git push → Git Repo          │
└──────────────┬──────────────────┘
               │
               │ Git Push
               ▼
        ┌──────────────┐
        │  Git Repo    │
        │  (Cloud)     │
        └──────┬───────┘
               │
               │ Git Pull
               ▼
┌─────────────────────────────────┐
│  Local (Your Laptop/Xcode)     │
│  ────────────────────────────   │
│  1. Source Control → Pull       │
│  2. Rebuild if needed           │
│  3. Test with Maestro           │
└─────────────────────────────────┘
```

## Typical Workflow Example

### Scenario: You fix a bug in results screen

**In Cursor/Vibecode (Remote):**
```bash
# 1. Edit src/app/results.tsx
# 2. Test the logic
# 3. Commit and push
git add src/app/results.tsx
git commit -m "Fix results screen bug"
git push origin main
```

**On Your Laptop (Local):**
```bash
# 1. Open Xcode
# 2. Pull updates
Source Control → Pull... (⌘⇧X)

# 3. Rebuild (only code changed, no native changes)
⌘R

# 4. Run Maestro tests
maestro test maestro-tests/
```

## When to Push vs When to Pull

### Push (Remote - Cursor/Vibecode)
- ✅ After making code changes
- ✅ After fixing bugs
- ✅ After adding features
- ✅ When ready to test

### Pull (Local - Xcode)
- ✅ Before testing
- ✅ Before running Maestro
- ✅ When you want latest code
- ✅ Daily/regular sync

## Important Notes

### Git is the Bridge

The **Git repository** is what connects your two environments:

- **Remote (Cursor)** → Pushes changes → **Git Repo**
- **Git Repo** → Pulls changes → **Local (Xcode)**

### You Don't Need to Manually Download

Instead of:
- ❌ Downloading project zip
- ❌ Unpacking
- ❌ Copying files
- ❌ Rebuilding

You just:
- ✅ Pull in Xcode (`⌘⇧X`)
- ✅ Rebuild if needed (`⌘R`)
- ✅ Test

## Quick Commands Reference

### Remote (Cursor/Vibecode)
```bash
# Check status
git status

# Commit changes
git add .
git commit -m "Description"
git push origin main
```

### Local (Your Laptop)
```bash
# Pull updates (or use Xcode UI)
git pull origin main

# Or in Xcode:
# Source Control → Pull... (⌘⇧X)
```

## Workflow Tips

### 1. Commit Often
- Push small changes frequently
- Makes it easier to test incrementally
- Easier to debug if something breaks

### 2. Pull Before Testing
- Always pull latest before testing
- Ensures you're testing the latest code
- Avoids confusion about what version you're testing

### 3. Use Branches (Optional)
- Create feature branches for big changes
- Test on branch before merging
- Keeps main branch stable

### 4. Check What Changed
- Xcode shows file diffs after pull
- Review changes before rebuilding
- Understand what you're testing

## Troubleshooting

### Issue: Changes not showing in Xcode

**Check:**
1. Did you push from remote? (`git push`)
2. Did you pull in Xcode? (`⌘⇧X`)
3. Check Git status: `git status` in Xcode terminal

### Issue: Conflicts

**Solution:**
- Usually happens if you edited same file in both places
- Use Xcode's conflict resolution: **Source Control → Resolve Conflicts...**
- Or discard local changes if remote is correct

### Issue: Xcode shows "No changes"

**Check:**
- Did you actually commit and push from remote?
- Check remote: `git log origin/main`
- Verify push succeeded

## Summary

**The key insight:** Git is the bridge between your two environments.

1. **You code** in Cursor/Vibecode (remote)
2. **You push** to Git (updates the repo)
3. **You pull** in Xcode (gets the updates)
4. **You test** on your laptop

No manual downloading needed - Git handles the sync automatically!

