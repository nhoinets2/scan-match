#!/bin/bash
# Simple workaround: Use Expo prebuild + Xcode directly
# This avoids the Expo CLI logging bug

set -e

cd "$(dirname "$0")/.."

echo "Step 1: Prebuilding native code..."
EXPO_USE_NPM=1 npx expo prebuild --platform ios --clean

echo "Step 2: Opening Xcode workspace..."
echo "Please build and run from Xcode, or use:"
echo "  cd ios && xcodebuild -workspace vibecode.xcworkspace -scheme vibecode -sdk iphonesimulator"

open ios/vibecode.xcworkspace

