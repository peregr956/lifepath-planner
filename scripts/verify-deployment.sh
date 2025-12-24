#!/bin/bash
# Verify Vercel Deployment Configuration
# This script helps verify that the Vercel deployment and API are working correctly

set -e

echo "=========================================="
echo "  Vercel Deployment Verification"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default Vercel URL or from argument
VERCEL_URL="${1:-https://lifepath-planner.vercel.app}"

echo "1. Testing Vercel API Health..."
echo "   App URL: $VERCEL_URL"
echo "   API Health: $VERCEL_URL/api/health"

if curl -s -f "$VERCEL_URL/api/health" > /dev/null; then
    echo -e "   ${GREEN}✓ API is accessible and healthy${NC}"
    HEALTH_RESPONSE=$(curl -s "$VERCEL_URL/api/health")
    echo "   Response: $HEALTH_RESPONSE"
else
    echo -e "   ${RED}✗ API is not accessible at $VERCEL_URL/api/health${NC}"
    echo "   Check if the deployment is successful and API routes are working."
    # Don't exit here, continue with checklist
fi

echo ""
echo "2. Environment Variable Checklist:"
echo ""
echo "   ${YELLOW}Vercel Configuration:${NC}"
echo "   - Go to: https://vercel.com/dashboard"
echo "   - Select your project"
echo "   - Go to: Settings → Environment Variables"
echo "   - Verify the following are set (if using AI features):"
echo "     - OPENAI_API_KEY"
echo "     - POSTGRES_URL (optional, for persistent storage)"
echo ""
echo "   ${YELLOW}Same-Origin API:${NC}"
echo "   - This deployment uses same-origin API routes (/api/*)."
echo "   - NEXT_PUBLIC_LIFEPATH_API_BASE_URL is NOT required."
echo "   - CORS configuration is NOT required for the same-origin API."
echo ""

echo "3. Next Steps:"
echo "   - Visit your Vercel app at $VERCEL_URL"
echo "   - Navigate to /diagnostics to see runtime configuration"
echo "   - Check Vercel logs in the dashboard for any runtime errors"
echo ""

echo "=========================================="
echo "  Verification Complete"
echo "=========================================="
