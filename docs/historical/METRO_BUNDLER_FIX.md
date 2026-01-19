# Metro Bundler Connection Fix

## Issue

When running the app in Xcode simulator, you get:
```
Could not connect to the server.
NSErrorFailingURLStringKey=http://localhost:19002/status
```

## Solution

Metro bundler needs to be running separately. The app tries to connect to Metro at `localhost:19002` to load the JavaScript bundle.

### Option 1: Start Metro Before Building (Recommended)

1. **In a separate terminal, start Metro:**
   ```bash
   npm start
   # OR
   npx expo start
   ```

2. **Keep Metro running** (don't close the terminal)

3. **Then build and run in Xcode** (⌘R)

4. **The app will connect to Metro automatically**

### Option 2: Use Development Build

If you're using Expo Dev Client:

1. **Start Metro:**
   ```bash
   npm start
   ```

2. **Build in Xcode** - Metro will be detected automatically

### Option 3: Configure Metro Port

If port 19002 is already in use:

```bash
# Start Metro on a different port
npx expo start --port 8081
```

## Quick Fix Workflow

```bash
# Terminal 1: Start Metro
npm start

# Terminal 2: Build in Xcode
# (Just press ⌘R in Xcode)
```

## For CI/CD Testing

When testing with Maestro, you don't need Metro running because:
- Maestro tests the built app
- The app should work without Metro for basic UI tests
- Metro is only needed for development/hot reload

## Troubleshooting

### Metro won't start
```bash
# Clear cache and restart
npx expo start --clear
```

### Port already in use
```bash
# Kill process on port 19002
lsof -ti:19002 | xargs kill -9

# Or use different port
npx expo start --port 8081
```

### App still can't connect
1. Check Metro is running (you should see "Metro waiting on...")
2. Check firewall isn't blocking localhost
3. Try restarting Metro: `npm start -- --reset-cache`

