#!/bin/bash
# Verify Vercel and Railway Deployment Configuration
# This script helps verify that environment variables are correctly set

set -e

echo "=========================================="
echo "  Deployment Configuration Verification"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Railway API Gateway URL (from vercel.env)
RAILWAY_URL="https://lifepath-planner-production.up.railway.app"

echo "1. Testing Railway API Gateway..."
echo "   URL: $RAILWAY_URL"
if curl -s -f "$RAILWAY_URL/health" > /dev/null; then
    echo -e "   ${GREEN}✓ API Gateway is accessible${NC}"
    HEALTH_RESPONSE=$(curl -s "$RAILWAY_URL/health")
    echo "   Response: $HEALTH_RESPONSE"
else
    echo -e "   ${RED}✗ API Gateway is not accessible${NC}"
    exit 1
fi

echo ""
echo "2. Testing CORS Configuration..."
# Test with a sample origin
TEST_ORIGIN="https://test.vercel.app"
CORS_HEADERS=$(curl -s -I -H "Origin: $TEST_ORIGIN" \
    -H "Access-Control-Request-Method: GET" \
    -X OPTIONS \
    "$RAILWAY_URL/health" 2>&1 | grep -i "access-control-allow-origin" || echo "")

if [ -n "$CORS_HEADERS" ]; then
    echo -e "   ${GREEN}✓ CORS headers found${NC}"
    echo "   $CORS_HEADERS"
else
    echo -e "   ${YELLOW}⚠ CORS headers not found (may need GATEWAY_CORS_ORIGINS configured)${NC}"
fi

echo ""
echo "3. Environment Variable Checklist:"
echo ""
echo "   ${YELLOW}Vercel Configuration:${NC}"
echo "   - Go to: https://vercel.com/dashboard"
echo "   - Select your project"
echo "   - Go to: Settings → Environment Variables"
echo "   - Verify NEXT_PUBLIC_LIFEPATH_API_BASE_URL is set to:"
echo "     $RAILWAY_URL"
echo ""
echo "   ${YELLOW}Railway Configuration:${NC}"
echo "   - Go to: https://railway.app/dashboard"
echo "   - Select your API Gateway service"
echo "   - Go to: Variables"
echo "   - Verify GATEWAY_CORS_ORIGINS includes your Vercel URL(s)"
echo "   - Example: https://your-app.vercel.app,https://your-app-git-main.vercel.app"
echo ""

echo "4. Next Steps:"
echo "   - If environment variables are set, trigger a new Vercel deployment"
echo "   - Visit your Vercel app at /diagnostics to see runtime configuration"
echo "   - Check browser console for [API Client] logs"
echo ""

echo "=========================================="
echo "  Verification Complete"
echo "=========================================="

