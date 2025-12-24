#!/bin/bash
# Vercel AI Gateway Configuration Script
#
# Usage:
#   ./scripts/setup-vercel-ai-gateway.sh
#
# Environment variables required:
#   VERCEL_TOKEN - Vercel API token
#   VERCEL_PROJECT_ID - Vercel project ID
#
# Optional:
#   VERCEL_AI_GATEWAY_URL - Custom AI Gateway URL (default: https://gateway.ai.vercel.sh/v1)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default AI Gateway URL
GATEWAY_URL="${VERCEL_AI_GATEWAY_URL:-https://gateway.ai.vercel.sh/v1}"

# Check required environment variables
if [[ -z "${VERCEL_TOKEN:-}" ]]; then
    echo "❌ Error: VERCEL_TOKEN environment variable is required"
    echo ""
    echo "Get your token from: https://vercel.com/account/tokens"
    echo ""
    echo "Usage:"
    echo "  export VERCEL_TOKEN=your-token-here"
    echo "  export VERCEL_PROJECT_ID=your-project-id"
    echo "  ./scripts/setup-vercel-ai-gateway.sh"
    exit 1
fi

if [[ -z "${VERCEL_PROJECT_ID:-}" ]]; then
    echo "❌ Error: VERCEL_PROJECT_ID environment variable is required"
    echo ""
    echo "Find your project ID in Vercel Dashboard → Project Settings → General"
    echo ""
    echo "Usage:"
    echo "  export VERCEL_TOKEN=your-token-here"
    echo "  export VERCEL_PROJECT_ID=your-project-id"
    echo "  ./scripts/setup-vercel-ai-gateway.sh"
    exit 1
fi

echo "🚀 Vercel AI Gateway Configuration"
echo "==================================="
echo ""
echo "Project ID: ${VERCEL_PROJECT_ID}"
echo "Gateway URL: ${GATEWAY_URL}"
echo ""

# Verify project exists
echo "🔍 Verifying project..."
PROJECT_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}")

HTTP_CODE=$(echo "$PROJECT_RESPONSE" | tail -n1)
PROJECT_BODY=$(echo "$PROJECT_RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" != "200" ]]; then
    echo "❌ Failed to verify project: HTTP $HTTP_CODE"
    echo "$PROJECT_BODY"
    exit 1
fi

PROJECT_NAME=$(echo "$PROJECT_BODY" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "✅ Found project: ${PROJECT_NAME}"
echo ""

# Function to set environment variable
set_env_var() {
    local KEY=$1
    local VALUE=$2
    local TYPE=${3:-plain}
    
    echo "  Setting ${KEY}..."
    
    # First try to delete existing variable (ignore errors)
    curl -s -X DELETE \
        -H "Authorization: Bearer ${VERCEL_TOKEN}" \
        -H "Content-Type: application/json" \
        "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env/${KEY}" > /dev/null 2>&1 || true
    
    # Create new variable
    local RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Authorization: Bearer ${VERCEL_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{
            \"key\": \"${KEY}\",
            \"value\": \"${VALUE}\",
            \"type\": \"${TYPE}\",
            \"target\": [\"production\", \"preview\", \"development\"]
        }" \
        "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    if [[ "$HTTP_CODE" == "200" ]] || [[ "$HTTP_CODE" == "201" ]]; then
        echo "  ✅ ${KEY} configured"
    else
        echo "  ⚠️  Warning: Failed to set ${KEY} (HTTP ${HTTP_CODE})"
        echo "$RESPONSE" | sed '$d'
    fi
}

echo "🔧 Configuring environment variables..."
echo ""

# Set AI Gateway configuration
set_env_var "OPENAI_API_BASE" "${GATEWAY_URL}"
set_env_var "VERCEL_AI_GATEWAY_ENABLED" "true"
set_env_var "OPENAI_MODEL" "gpt-4o-mini"

echo ""
echo "✅ AI Gateway configuration complete!"
echo ""
echo "📝 Next steps:"
echo "  1. Make sure OPENAI_API_KEY is set in your Vercel project"
echo "  2. Redeploy your application to apply the changes"
echo "  3. Visit /api/diagnostics/env to verify configuration"
echo ""
echo "To set OPENAI_API_KEY:"
echo "  Go to Vercel Dashboard → Project Settings → Environment Variables"
echo "  Add OPENAI_API_KEY with your OpenAI API key"

