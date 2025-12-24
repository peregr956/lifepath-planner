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

# Function to test an endpoint
test_endpoint() {
    local endpoint=$1
    local method=${2:-GET}
    local description=$3
    local data=$4
    
    echo -n "   Testing $description ($endpoint)... "
    
    local start_time=$(date +%s%3N)
    local response
    local status_code
    
    if [ "$method" == "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$data" "$VERCEL_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" "$VERCEL_URL$endpoint")
    fi
    
    status_code=$(echo "$response" | tail -n1)
    content=$(echo "$response" | sed '$d')
    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))
    
    if [ "$status_code" -ge 200 ] && [ "$status_code" -lt 300 ]; then
        echo -e "${GREEN}✓ Success${NC} (${duration}ms)"
        return 0
    else
        echo -e "${RED}✗ Failed${NC} (Status: $status_code, ${duration}ms)"
        echo "      Response: $content"
        return 1
    fi
}

echo "1. Testing Core API Endpoints..."
test_endpoint "/api/health" "GET" "Health Check"
test_endpoint "/api/diagnostics/env" "GET" "Environment Diagnostics"

echo ""
echo "2. Smoke Testing Functional API Endpoints (Basic Validation)..."
# These might return 400 if called without proper data/session, which is fine for a existence check
test_endpoint "/api/upload-budget" "POST" "Upload Budget" "{}"
test_endpoint "/api/clarification-questions" "GET" "Clarification Questions"
test_endpoint "/api/summary-and-suggestions" "GET" "Summary and Suggestions"

echo ""
echo "3. Environment Variable & Infrastructure Check..."
DIAGNOSTICS=$(curl -s "$VERCEL_URL/api/diagnostics/env")

if [ -z "$DIAGNOSTICS" ]; then
    echo -e "   ${RED}✗ Could not retrieve diagnostics from $VERCEL_URL/api/diagnostics/env${NC}"
else
    # Check OpenAI
    if echo "$DIAGNOSTICS" | grep -q "\"OPENAI_API_KEY\":{\"key\":\"OPENAI_API_KEY\",\"is_set\":true"; then
        echo -e "   ${GREEN}✓ OPENAI_API_KEY is configured${NC}"
    else
        echo -e "   ${YELLOW}⚠ OPENAI_API_KEY is NOT configured (AI features disabled)${NC}"
    fi

    # Check Postgres
    if echo "$DIAGNOSTICS" | grep -q "\"POSTGRES_URL\":{\"key\":\"POSTGRES_URL\",\"is_set\":true"; then
        echo -e "   ${GREEN}✓ POSTGRES_URL is configured${NC}"
    else
        echo -e "   ${YELLOW}⚠ POSTGRES_URL is NOT configured (using in-memory storage)${NC}"
    fi
    
    # Check overall status
    if echo "$DIAGNOSTICS" | grep -q "\"status\":\"ok\""; then
        echo -e "   ${GREEN}✓ Environment status is OK${NC}"
    else
        echo -e "   ${YELLOW}⚠ Environment has issues or warnings${NC}"
    fi
fi

echo ""
echo "4. Deployment Checklist:"
echo "   - Vercel Dashboard: https://vercel.com/dashboard"
echo "   - Root Directory: services/ui-web"
echo "   - Node.js Version: 20+"
echo "   - Logs: Check Vercel Function logs for any runtime exceptions"

echo ""
echo "=========================================="
echo "  Verification Complete"
echo "=========================================="
