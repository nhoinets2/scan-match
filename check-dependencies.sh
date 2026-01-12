#!/bin/bash
# Quick script to check if dependencies are installed

echo "🔍 Checking dependencies..."
echo ""

# Check if node_modules exists
if [ -d "node_modules" ]; then
    echo "✅ node_modules folder exists"
    
    # Check size
    SIZE=$(du -sh node_modules 2>/dev/null | awk '{print $1}')
    echo "📦 Size: $SIZE"
    
    # Check key packages
    echo ""
    echo "Checking key packages:"
    
    if [ -d "node_modules/expo" ]; then
        echo "  ✅ expo"
    else
        echo "  ❌ expo (missing!)"
    fi
    
    if [ -d "node_modules/react" ]; then
        echo "  ✅ react"
    else
        echo "  ❌ react (missing!)"
    fi
    
    if [ -d "node_modules/react-native" ]; then
        echo "  ✅ react-native"
    else
        echo "  ❌ react-native (missing!)"
    fi
    
    # Count installed packages
    COUNT=$(ls -1 node_modules 2>/dev/null | wc -l | tr -d ' ')
    echo ""
    echo "📊 Total packages: $COUNT"
    
else
    echo "❌ node_modules folder NOT found"
    echo "   Run: npm install"
fi

