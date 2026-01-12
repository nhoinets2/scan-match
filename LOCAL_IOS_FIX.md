# Fix iOS Simulator Issues Locally

## Current Issue: Calendar Permission Error

If you see this error when running the app:
```
ExpoCalendar.MissingCalendarPListValueException error 1.
```

This means the native iOS project doesn't have the calendar permissions in `Info.plist`.

## Quick Fix Steps

### Step 1: Verify app.json Has Permissions

Check that `app.json` has the calendar permissions:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSCalendarsUsageDescription": "This app needs access to your calendar...",
        "NSRemindersUsageDescription": "This app needs access to your reminders..."
      }
    }
  }
}
```

If missing, add them (they should already be there from previous fixes).

### Step 2: Regenerate iOS Project

In Terminal (on your Mac):

```bash
# Navigate to your project
cd /path/to/your/project

# Regenerate the iOS project with updated permissions
npm run prebuild:ios
```

This will regenerate the `ios/` folder with the permissions from `app.json`.

### Step 3: Clean Build in Xcode

1. **Open Xcode:**
   ```bash
   open ios/vibecode.xcworkspace
   ```

2. **Clean Build Folder:**
   - Product → Clean Build Folder (or press `⌘⇧K`)
   - Wait for it to complete

3. **Delete App from Simulator (if already installed):**
   - In Simulator: Long-press app icon → Delete
   - Or: Simulator → Device → Erase All Content and Settings

### Step 4: Rebuild and Run

1. **Select Simulator:**
   - In Xcode toolbar, select an iPhone simulator (e.g., "iPhone 17 Pro")

2. **Build and Run:**
   - Press `⌘R` or click the Play button
   - Wait for build to complete (2-5 minutes first time)

3. **Start Metro Bundler (if not auto-started):**
   - In a separate Terminal:
     ```bash
     npm start
     ```
   - Keep this running

### Step 5: Verify It Works

- App should launch without calendar error
- Metro bundler should connect automatically
- You should see your app running in the simulator

## Metro Connection Issues

If you see connection errors like:
```
Could not connect to the server (error code: -1004)
Connection refused on ports 8082, 19000, 19002
```

**This means Metro bundler isn't running or isn't on the expected port.**

### Fix Metro Connection

1. **Stop any existing Metro processes:**
   ```bash
   # Find and kill any running Metro/node processes
   lsof -ti:8081 | xargs kill -9 2>/dev/null || true
   lsof -ti:19000 | xargs kill -9 2>/dev/null || true
   lsof -ti:19001 | xargs kill -9 2>/dev/null || true
   lsof -ti:19002 | xargs kill -9 2>/dev/null || true
   ```

2. **Start Metro fresh:**
   ```bash
   # In a clean Terminal window
   cd /path/to/your/project
   npm start -- --reset-cache
   ```

3. **Wait for Metro to start:**
   - You should see: `Metro waiting on exp://...`
   - Note the port number (usually 8081)

4. **In Xcode, reload the app:**
   - Press `⌘R` in Xcode, OR
   - Shake simulator → Reload, OR
   - Press `r` in Metro terminal

### If Metro Still Won't Connect

**Option 1: Use Xcode's built-in Metro**
- When you build from Xcode (`⌘R`), it may start Metro automatically
- Check Xcode's console for Metro logs
- If Metro starts in Xcode, you don't need a separate Terminal

**Option 2: Check port conflicts**
```bash
# Check what's using port 8081
lsof -i :8081

# If something else is using it, kill it or use a different port
```

## If It Still Fails

### Check Info.plist Has Permissions

```bash
# In Terminal, check if permissions are in Info.plist
cat ios/vibecode/Info.plist | grep -A 1 "NSCalendarsUsageDescription"
```

You should see:
```xml
<key>NSCalendarsUsageDescription</key>
<string>This app needs access to your calendar...</string>
```

If not found, the prebuild didn't work. Try:
```bash
# Delete ios folder and regenerate
rm -rf ios
npm run prebuild:ios
```

### Clear Xcode Derived Data

1. **Xcode → Settings → Locations**
2. Click arrow next to **Derived Data** path
3. Delete folder for your project
4. Restart Xcode
5. Rebuild

### Check Metro Connection

If app launches but Metro doesn't connect:

1. **Make sure Metro is running:**
   ```bash
   npm start
   ```

2. **In Metro terminal, press `r` to reload**

3. **Or shake simulator:** Device → Shake → Reload

## Complete Workflow Summary

```bash
# Terminal 1: Start Metro (keep running)
npm start

# Terminal 2: Regenerate iOS project (if needed)
npm run prebuild:ios

# Xcode: Clean and rebuild
# 1. Open ios/vibecode.xcworkspace
# 2. Product → Clean Build Folder (⌘⇧K)
# 3. Select simulator
# 4. Build and Run (⌘R)
```

## Common Issues

### Issue: "Could not connect to the server" (Metro)

**Solution:** Start Metro bundler:
```bash
npm start
```

### Issue: Calendar error persists after prebuild

**This is a cached build issue. Do a COMPLETE clean:**

1. **Delete the app from simulator:**
   - Long-press app icon → Delete
   - Or: Simulator → Device → Erase All Content and Settings

2. **Delete iOS folder and regenerate:**
   ```bash
   rm -rf ios
   npm run prebuild:ios
   ```

3. **Clear Xcode Derived Data:**
   - Xcode → Settings → Locations
   - Click arrow next to Derived Data
   - Delete your project's folder
   - Close Xcode

4. **Clean build in Xcode:**
   - Reopen Xcode
   - Product → Clean Build Folder (`⌘⇧K`)
   - Wait for completion

5. **Rebuild:**
   - Select simulator
   - Build and Run (`⌘R`)

6. **Start Metro (if not auto-started):**
   ```bash
   npm start -- --reset-cache
   ```

### Issue: Build takes forever

**Solution:** 
- First build takes 2-5 minutes (normal)
- Subsequent builds are faster (30 seconds - 2 minutes)
- Make sure you're building for Simulator, not Device

### Issue: App crashes immediately

**Solution:**
1. Check Metro is running
2. Check console logs in Xcode
3. Try deleting app from simulator and rebuilding

## Next Steps After Fix

Once the app runs successfully:

1. ✅ **Test basic functionality** - Can you navigate the app?
2. ✅ **Test Maestro locally** - Run your Maestro tests
3. ✅ **Continue development** - You're all set!

---

## Quick Reference

| Issue | Solution |
|-------|----------|
| Calendar error | Run `npm run prebuild:ios`, clean build in Xcode |
| Metro not connecting | Run `npm start` in Terminal |
| Build fails | Clean build folder (⌘⇧K), delete app from simulator |
| App crashes | Check Metro is running, check Xcode console |

