#!/usr/bin/env bash
# Quick script to check OpenAI configuration

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Checking OpenAI configuration..."
echo ""

# Check .env file
if [[ -f "$ROOT_DIR/.env" ]]; then
    echo "✓ .env file exists"
    source "$ROOT_DIR/.env"
else
    echo "✗ .env file not found"
    exit 1
fi

# Check required variables
MISSING=0

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
    echo "✗ OPENAI_API_KEY not set"
    MISSING=1
else
    echo "✓ OPENAI_API_KEY is set (${#OPENAI_API_KEY} chars)"
fi

if [[ -z "${OPENAI_MODEL:-}" ]]; then
    echo "✗ OPENAI_MODEL not set"
    MISSING=1
else
    echo "✓ OPENAI_MODEL is set: $OPENAI_MODEL"
fi

if [[ -z "${OPENAI_API_BASE:-}" ]]; then
    echo "✗ OPENAI_API_BASE not set"
    MISSING=1
else
    echo "✓ OPENAI_API_BASE is set: $OPENAI_API_BASE"
fi

echo ""
if [[ $MISSING -eq 0 ]]; then
    echo "✓ All OpenAI configuration is present"
    echo ""
    echo "Testing OpenAI connection..."
    python3 << 'EOF'
import os
import sys
from openai import OpenAI

api_key = os.getenv("OPENAI_API_KEY")
model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
api_base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")

if not api_key:
    print("✗ OPENAI_API_KEY not set")
    sys.exit(1)

try:
    client = OpenAI(api_key=api_key, base_url=api_base, timeout=5.0)
    # Simple test call
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": "Say 'test'"}],
        max_tokens=5,
    )
    print(f"✓ OpenAI API connection successful")
    print(f"  Model: {model}")
    print(f"  Response: {response.choices[0].message.content}")
except Exception as e:
    print(f"✗ OpenAI API connection failed: {e}")
    sys.exit(1)
EOF
else
    echo "✗ Missing required OpenAI configuration"
    exit 1
fi

