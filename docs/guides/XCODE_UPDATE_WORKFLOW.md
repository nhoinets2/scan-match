# Xcode Update Workflow

## Quick Answer

Yes! Once Xcode finishes processing, you can pull updates directly from Xcode.

## Getting Updates Workflow

### Step 1: Pull Updates in Xcode

**Option A: Menu (Recommended)**
- **Source Control → Pull...** (or press `⌘⇧X`)

**Option B: Source Control Navigator**
- Click the Source Control icon in the left sidebar (`⌘2`)
- Right-click the project → **Pull...**

**Option C: Toolbar**
- If the Source Control toolbar button is visible, click it → **Pull**

### Step 2: Check What Changed

After pulling, Xcode shows:
- ✅ Which files changed
- ✅ What the changes are (diffs)

### Step 3: Rebuild If Needed

**If only JavaScript/TypeScript files changed:**
- Just rebuild: `⌘R` (Play button)
- Metro will reload automatically

**If `package.json` or `app.json` changed:**
- Run in Terminal: `npm install --legacy-peer-deps` (if package.json changed)
- Run in Terminal: `npm run prebuild:ios` (if native dependencies changed)
- Then rebuild in Xcode: `⌘R`

## Quick Reference Table

| What Changed | Action |
|--------------|--------|
| Only code files (`src/`) | Pull → Rebuild (`⌘R`) |
| `package.json` | Pull → `npm install --legacy-peer-deps` → Rebuild |
| `app.json` or native deps | Pull → `npm run prebuild:ios` → Rebuild |

## Typical Workflow

### Most Common Case (Code Changes Only)

1. **Pull updates:** Source Control → Pull... (`⌘⇧X`)
2. **Rebuild:** Click Play button or press `⌘R`
3. **Done!** Metro reloads automatically

### When Dependencies Change

1. **Pull updates:** Source Control → Pull... (`⌘⇧X`)
2. **Check what changed:** Look at the file list
3. **If `package.json` changed:**
   ```bash
   npm install --legacy-peer-deps
   ```
4. **If `app.json` or native modules changed:**
   ```bash
   npm run prebuild:ios
   ```
5. **Rebuild in Xcode:** `⌘R`

## Summary

✅ **Pull updates:** Source Control → Pull... (`⌘⇧X`)  
✅ **Most of the time:** Just rebuild (`⌘R`)  
✅ **Only rebuild native code** when dependencies change  

## Tips

- **Pull regularly** - Before testing, always pull latest changes
- **Check diffs** - Xcode shows what changed, review before rebuilding
- **Fast workflow** - Most updates are just code changes, so just pull and rebuild
- **Native changes are rare** - Only need `prebuild` when adding/removing native modules

## Troubleshooting

### Issue: Pull shows "Already up to date"
- Your local copy is current
- No updates available

### Issue: Pull conflicts
- Someone else changed the same files
- Use Xcode's conflict resolution: **Source Control → Resolve Conflicts...**

### Issue: Build fails after pull
- Check if dependencies changed
- Run `npm install --legacy-peer-deps` if needed
- Run `npm run prebuild:ios` if native code changed

