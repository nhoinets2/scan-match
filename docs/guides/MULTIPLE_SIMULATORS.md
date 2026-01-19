# Running on Multiple iOS Simulators

## Yes! One Metro Can Serve Multiple Simulators

You can run your app on **multiple iOS simulators simultaneously** using a **single Metro bundler instance**.

## How It Works

- ✅ **One Metro instance** serves all connected devices
- ✅ Each simulator connects independently to Metro
- ✅ Code changes hot-reload on all connected simulators
- ✅ Efficient - no need for multiple Metro instances

## Setup Steps

### Step 1: Start Metro (Once)

```bash
cd ~/Projects/019b2408-3ded-75d8-8438-74406e9503f5
npm start
```

Keep this **one Metro instance** running.

### Step 2: Launch Multiple Simulators

**Option A: Via Xcode**
1. Open Xcode
2. Build and run on first simulator (⌘R)
3. Change simulator in device dropdown
4. Build and run again (⌘R)
5. Repeat for more simulators

**Option B: Via Terminal**
```bash
# List available simulators
xcrun simctl list devices available

# Boot multiple simulators
xcrun simctl boot "iPhone 15 Pro"
xcrun simctl boot "iPhone 16 Pro"
xcrun simctl boot "iPad Pro (12.9-inch)"

# Then build in Xcode for each
```

**Option C: Via Simulator App**
1. Simulator → File → New Simulator
2. Create additional simulators
3. Build and run from Xcode on each

### Step 3: Connect Apps to Metro

Each simulator will:
- Connect to the same Metro instance automatically
- Show connection logs in Metro terminal
- Hot-reload when you make code changes

## Example Workflow

```bash
# Terminal 1: Start Metro (once)
npm start

# Terminal 2: Boot simulators
xcrun simctl boot "iPhone 15 Pro"
xcrun simctl boot "iPhone 16 Pro"

# Xcode: Build and run on each simulator
# Both will connect to the same Metro!
```

## Metro Terminal Output

You'll see connections from multiple devices:

```
› Metro waiting on exp://192.168.1.168:8081
› Reloading apps
  - iPhone 15 Pro (connected)
  - iPhone 16 Pro (connected)
```

## Benefits

✅ **Test on different screen sizes** simultaneously  
✅ **Compare behavior** across devices  
✅ **Efficient** - one Metro serves all  
✅ **Hot reload works** on all connected devices  

## Limitations

- All simulators must be on the same network (for physical devices)
- Metro performance may slow slightly with many connections (usually fine for 2-5 devices)
- Each simulator needs the app built separately (but connects to same Metro)

## Troubleshooting

### Simulator won't connect to Metro

1. **Check Metro is running:**
   ```bash
   lsof -i :8081
   ```

2. **Restart Metro:**
   ```bash
   # Kill Metro
   lsof -ti:8081 | xargs kill -9
   
   # Restart
   npm start
   ```

3. **Reload app in simulator:**
   - Shake device → Reload
   - Or press `r` in Metro terminal

### Multiple Metro instances running

If you accidentally started multiple Metro instances:

```bash
# Kill all Metro processes
lsof -ti:8081 | xargs kill -9
lsof -ti:19000 | xargs kill -9
lsof -ti:19001 | xargs kill -9
lsof -ti:19002 | xargs kill -9

# Start fresh
npm start
```

## Best Practices

1. **One Metro instance** for all simulators
2. **Build in Xcode** for each simulator you want to test
3. **Keep Metro running** while testing
4. **Use different simulators** to test different screen sizes

## Example: Testing on iPhone and iPad

```bash
# Terminal: Start Metro
npm start

# Terminal: Boot both
xcrun simctl boot "iPhone 15 Pro"
xcrun simctl boot "iPad Pro (12.9-inch)"

# Xcode: 
# 1. Select "iPhone 15 Pro" → Build (⌘R)
# 2. Select "iPad Pro" → Build (⌘R)
# Both connect to same Metro!
```

---

**Summary:** One Metro = Multiple Simulators ✅

