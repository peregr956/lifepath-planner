#!/bin/bash
# Test Vercel Postgres Persistence across cold starts
# Usage: ./scripts/test-persistence.sh [VERCEL_URL]

set -e

echo "=========================================="
echo "  Vercel Persistence Audit"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

VERCEL_URL="${1:-https://lifepath-planner.vercel.app}"
FIXTURE_PATH="services/budget-ingestion-service/tests/fixtures/household_sample.csv"

if [ ! -f "$FIXTURE_PATH" ]; then
    # Fallback to local path if run from scripts dir
    if [ -f "../$FIXTURE_PATH" ]; then
        FIXTURE_PATH="../$FIXTURE_PATH"
    else
        echo -e "   ${RED}✗ Fixture not found at $FIXTURE_PATH${NC}"
        exit 1
    fi
fi

# 1. Create a session
echo "1. Creating a test session by uploading a budget..."
UPLOAD_RESPONSE=$(curl -s -X POST -F "file=@$FIXTURE_PATH" "$VERCEL_URL/api/upload-budget")
BUDGET_ID=$(echo "$UPLOAD_RESPONSE" | grep -o '"budget_id":"[^"]*' | cut -d'"' -f4)

if [ -z "$BUDGET_ID" ]; then
    echo -e "   ${RED}✗ Failed to create session${NC}"
    echo "   Response: $UPLOAD_RESPONSE"
    exit 1
fi

echo -e "   ${GREEN}✓ Session created: $BUDGET_ID${NC}"

# 2. Wait to simulate time between requests
echo ""
echo "2. Waiting 5 seconds..."
sleep 5

# 3. Retrieve session
echo ""
echo "3. Retrieving session from clarification-questions endpoint..."
GET_RESPONSE=$(curl -s "$VERCEL_URL/api/clarification-questions?budget_id=$BUDGET_ID")

if echo "$GET_RESPONSE" | grep -q "$BUDGET_ID"; then
    echo -e "   ${GREEN}✓ Session persisted and retrieved successfully${NC}"
    
    if echo "$GET_RESPONSE" | grep -q '"partial_model"'; then
        echo -e "   ${GREEN}✓ Partial model generated and persisted${NC}"
    else
        echo -e "   ${YELLOW}⚠ Partial model not found in response${NC}"
    fi
else
    echo -e "   ${RED}✗ Session LOST or not found${NC}"
    echo "   Response: $GET_RESPONSE"
    exit 1
fi

# 4. Update session
echo ""
echo "4. Testing session update (user query)..."
QUERY_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d "{\"budget_id\":\"$BUDGET_ID\",\"query\":\"How can I save for a house?\"}" "$VERCEL_URL/api/user-query")

if echo "$QUERY_RESPONSE" | grep -q '"status":"success"'; then
    echo -e "   ${GREEN}✓ User query updated in session${NC}"
    
    # Verify the query was actually stored
    VERIFY_RESPONSE=$(curl -s "$VERCEL_URL/api/clarification-questions?budget_id=$BUDGET_ID")
    if echo "$VERIFY_RESPONSE" | grep -q "How can I save for a house?"; then
        echo -e "   ${GREEN}✓ Session update verified in Postgres${NC}"
    else
        echo -e "   ${RED}✗ Session update NOT verified in Postgres${NC}"
    fi
else
    echo -e "   ${RED}✗ User query update failed${NC}"
    echo "   Response: $QUERY_RESPONSE"
fi

echo ""
echo "5. Infrastructure Checklist for Cold Starts:"
echo "   - View Vercel Runtime Logs in the dashboard"
echo "   - Look for: '[DB] Initializing database connection...'"
echo "   - If this log appears multiple times for the same session ID, it means cold starts are occurring but Postgres is successfully persisting the state."

echo ""
echo "=========================================="
echo "  Persistence Audit Complete"
echo "=========================================="


