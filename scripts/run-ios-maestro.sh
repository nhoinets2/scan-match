#!/bin/bash
# Script to run iOS build for Maestro testing, bypassing Expo CLI logging bug
# This script builds the iOS app directly using Xcode

set -e

echo "Building iOS app for Maestro testing..."

# Navigate to project root
cd "$(dirname "$0")/.."

# Prebuild native code if needed
if [ ! -d "ios" ]; then
  echo "Running prebuild..."
  EXPO_USE_NPM=1 npx expo prebuild --platform ios
fi

# Build using Xcode directly
cd ios

# Clean build folder
xcodebuild clean -workspace vibecode.xcworkspace -scheme vibecode -configuration Debug

# Build the app
xcodebuild build \
  -workspace vibecode.xcworkspace \
  -scheme vibecode \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath build

echo "Build complete! You can now run Maestro tests."
echo "To run the app in simulator:"
echo "  xcrun simctl boot <device-id>"
echo "  xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/vibecode.app"
echo "  xcrun simctl launch booted com.vibecode.app"

