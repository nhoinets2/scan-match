#!/bin/bash
# Helper script to run Maestro tests on a specific iOS device
# Usage: ./scripts/test-maestro-device.sh [device-name]
# Example: ./scripts/test-maestro-device.sh "iPhone 15 Pro"

set -e

# Get device name from argument or use default
DEVICE_NAME="${1:-iPhone 16 Pro}"

echo "🧪 Maestro Test Runner for Device: $DEVICE_NAME"
echo ""

# Navigate to project root
cd "$(dirname "$0")/.."

# Step 1: List available devices
echo "📱 Available iOS Simulators:"
xcrun simctl list devices available | grep "iPhone" | head -10
echo ""

# Step 2: Find device UUID
echo "🔍 Looking for device: $DEVICE_NAME"
DEVICE_UUID=$(xcrun simctl list devices available | grep "$DEVICE_NAME" | head -1 | grep -o '[A-F0-9-]\{36\}' | head -1)

if [ -z "$DEVICE_UUID" ]; then
  echo "❌ Device '$DEVICE_NAME' not found!"
  echo ""
  echo "Available devices:"
  xcrun simctl list devices available | grep "iPhone"
  echo ""
  echo "Usage: $0 \"Device Name\""
  exit 1
fi

echo "✅ Found device UUID: $DEVICE_UUID"
echo ""

# Step 3: Boot simulator
echo "🚀 Booting simulator..."
xcrun simctl boot "$DEVICE_UUID" 2>/dev/null || echo "Simulator already booted"
xcrun simctl bootstatus "$DEVICE_UUID" || sleep 5
echo "✅ Simulator ready"
echo ""

# Step 4: Check if app is built
APP_PATH="ios/build/Build/Products/Debug-iphonesimulator/vibecode.app"
if [ ! -d "$APP_PATH" ]; then
  echo "⚠️  App not built yet. Building now..."
  echo ""
  echo "Building for $DEVICE_NAME..."
  cd ios
  xcodebuild build \
    -workspace vibecode.xcworkspace \
    -scheme vibecode \
    -configuration Debug \
    -sdk iphonesimulator \
    -destination "platform=iOS Simulator,name=$DEVICE_NAME,OS=latest" \
    -derivedDataPath build \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGNING_ALLOWED=NO
  cd ..
  echo "✅ Build complete"
  echo ""
fi

# Step 5: Install app
echo "📦 Installing app on simulator..."
xcrun simctl install "$DEVICE_UUID" "$APP_PATH"
echo "✅ App installed"
echo ""

# Step 6: Check if Maestro is installed
if ! command -v maestro &> /dev/null; then
  echo "⚠️  Maestro not found. Installing..."
  curl -Ls "https://get.maestro.mobile.dev" | bash
  export PATH="$PATH:$HOME/.maestro/bin"
fi

# Step 7: Run Maestro tests
echo "🧪 Running Maestro tests on $DEVICE_NAME..."
echo ""

if [ -d "maestro-tests" ]; then
  maestro test maestro-tests/ --device-id "$DEVICE_UUID"
else
  echo "❌ maestro-tests/ directory not found!"
  echo "Create test files in maestro-tests/ directory"
  exit 1
fi

echo ""
echo "✅ Tests complete!"

