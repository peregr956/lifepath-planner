#!/bin/bash
#
# Build Validation Script
# Tests that the Next.js production build succeeds.
# 
# Usage: ./scripts/test-build.sh
# Exit codes:
#   0 - Build succeeded
#   1 - Build failed
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "============================================"
echo "  Build Validation Test"
echo "============================================"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "⚠️  node_modules not found. Installing dependencies..."
  npm install
fi

# Clean previous build
if [ -d ".next" ]; then
  echo "🧹 Cleaning previous build..."
  rm -rf .next
fi

# Run the build
echo "🔨 Running production build..."
npm run build

# Verify build output
if [ ! -d ".next" ]; then
  echo "❌ Build failed: .next directory not created"
  exit 1
fi

# Check for required build artifacts
if [ ! -d ".next/static" ]; then
  echo "❌ Build failed: .next/static directory not created"
  exit 1
fi

if [ ! -f ".next/BUILD_ID" ]; then
  echo "❌ Build failed: BUILD_ID not generated"
  exit 1
fi

echo ""
echo "============================================"
echo "  ✅ Build Validation Passed"
echo "============================================"
echo ""
echo "Build artifacts:"
echo "  - .next directory created"
echo "  - Static assets generated"
echo "  - BUILD_ID: $(cat .next/BUILD_ID)"
echo ""

exit 0

