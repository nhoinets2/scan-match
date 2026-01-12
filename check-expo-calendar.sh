#!/bin/bash

# Script to check for expo-calendar dependencies
# Run this from your project root directory

echo "🔍 Checking for expo-calendar dependencies..."
echo ""

# Check package.json
echo "1. Checking package.json..."
if grep -q "expo-calendar" package.json 2>/dev/null; then
    echo "   ❌ FOUND: expo-calendar in package.json"
    grep "expo-calendar" package.json
else
    echo "   ✅ NOT FOUND: expo-calendar not in package.json"
fi
echo ""

# Check node_modules
echo "2. Checking node_modules..."
if [ -d "node_modules/expo-calendar" ]; then
    echo "   ❌ FOUND: node_modules/expo-calendar directory exists"
    echo "   Run: rm -rf node_modules/expo-calendar"
else
    echo "   ✅ NOT FOUND: expo-calendar not in node_modules"
fi
echo ""

# Check lock files
echo "3. Checking lock files..."
if [ -f "package-lock.json" ] && grep -q "expo-calendar" package-lock.json 2>/dev/null; then
    echo "   ⚠️  FOUND: expo-calendar in package-lock.json"
    echo "   This is OK if it's just a leftover entry, but you can regenerate with: npm install"
else
    echo "   ✅ NOT FOUND: expo-calendar not in package-lock.json"
fi

if [ -f "bun.lock" ] && grep -q "expo-calendar" bun.lock 2>/dev/null; then
    echo "   ⚠️  FOUND: expo-calendar in bun.lock"
    echo "   This is OK if it's just a leftover entry, but you can regenerate with: bun install"
else
    echo "   ✅ NOT FOUND: expo-calendar not in bun.lock"
fi
echo ""

# Check iOS project files
echo "4. Checking iOS project files..."
if [ -d "ios" ]; then
    if grep -r "expo-calendar" ios/ 2>/dev/null | grep -v ".git" | head -5; then
        echo "   ❌ FOUND: expo-calendar references in iOS project"
        echo "   Run: npm run prebuild:ios to regenerate"
    else
        echo "   ✅ NOT FOUND: expo-calendar not in iOS project"
    fi
    
    # Check Podfile specifically
    if [ -f "ios/Podfile" ] && grep -q "expo-calendar" ios/Podfile 2>/dev/null; then
        echo "   ❌ FOUND: expo-calendar in Podfile"
    else
        echo "   ✅ NOT FOUND: expo-calendar not in Podfile"
    fi
    
    # Check Info.plist for calendar permissions
    if [ -f "ios/vibecode/Info.plist" ] && grep -q "NSCalendarsUsageDescription\|NSRemindersUsageDescription" ios/vibecode/Info.plist 2>/dev/null; then
        echo "   ⚠️  FOUND: Calendar permissions in Info.plist"
        echo "   These should be removed if you're not using expo-calendar"
    else
        echo "   ✅ NOT FOUND: No calendar permissions in Info.plist"
    fi
else
    echo "   ⚠️  iOS folder doesn't exist (run npm run prebuild:ios first)"
fi
echo ""

# Check app.json
echo "5. Checking app.json..."
if [ -f "app.json" ] && grep -q "NSCalendarsUsageDescription\|NSRemindersUsageDescription" app.json 2>/dev/null; then
    echo "   ⚠️  FOUND: Calendar permissions in app.json"
    echo "   These should be removed if you're not using expo-calendar"
else
    echo "   ✅ NOT FOUND: No calendar permissions in app.json"
fi
echo ""

# Check for imports in source code
echo "6. Checking source code for expo-calendar imports..."
if find src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) -exec grep -l "expo-calendar\|from ['\"]expo-calendar" {} \; 2>/dev/null | head -5; then
    echo "   ❌ FOUND: expo-calendar imports in source code"
    echo "   Remove these imports"
else
    echo "   ✅ NOT FOUND: No expo-calendar imports in source code"
fi
echo ""

echo "✅ Check complete!"
echo ""
echo "If you found any issues, here's how to fix them:"
echo "  1. Remove from node_modules: rm -rf node_modules/expo-calendar"
echo "  2. Regenerate lock files: npm install --legacy-peer-deps"
echo "  3. Regenerate iOS project: npm run prebuild:ios"
echo "  4. Remove calendar permissions from app.json if not needed"

