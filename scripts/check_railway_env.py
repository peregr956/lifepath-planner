#!/usr/bin/env python3
"""
Diagnostic script to check Railway environment variables for OpenAI configuration.

This script helps verify that all required environment variables are set correctly
in Railway. Run this in a Railway shell or check the output in Railway logs.
"""

import os
import sys
from typing import Any

REQUIRED_VARS = {
    "CLARIFICATION_PROVIDER": "openai",
    "SUGGESTION_PROVIDER": "openai",
    "OPENAI_API_KEY": "sk-...",
    "OPENAI_MODEL": "gpt-4o-mini",
    "OPENAI_API_BASE": "https://api.openai.com/v1",
}

OPTIONAL_VARS = {
    "CLARIFICATION_PROVIDER_TIMEOUT_SECONDS": "10.0",
    "SUGGESTION_PROVIDER_TIMEOUT_SECONDS": "60.0",
    "CLARIFICATION_PROVIDER_TEMPERATURE": "0.2",
    "SUGGESTION_PROVIDER_TEMPERATURE": "0.3",
}


def check_env_var(key: str, expected_value: str | None = None) -> dict[str, Any]:
    """Check if an environment variable is set and optionally matches expected value."""
    value = os.getenv(key)
    is_set = value is not None and value.strip() != ""
    
    result = {
        "key": key,
        "is_set": is_set,
        "value": value if is_set else None,
        "is_redacted": False,
    }
    
    if is_set:
        # Redact sensitive values
        if "KEY" in key.upper() or "SECRET" in key.upper() or "PASSWORD" in key.upper():
            result["value"] = f"{value[:7]}...{value[-4:]}" if len(value) > 11 else "***REDACTED***"
            result["is_redacted"] = True
        
        # Check if value matches expected (case-insensitive for provider vars)
        if expected_value:
            if key in ("CLARIFICATION_PROVIDER", "SUGGESTION_PROVIDER"):
                matches = value.strip().lower() == expected_value.lower()
            else:
                matches = value.strip() == expected_value
            result["matches_expected"] = matches
            result["expected"] = expected_value
        else:
            result["matches_expected"] = None
            result["expected"] = None
    else:
        result["matches_expected"] = False
        result["expected"] = expected_value
    
    return result


def main() -> int:
    """Check Railway environment variables and report status."""
    print("=" * 70)
    print("Railway Environment Variable Diagnostic")
    print("=" * 70)
    print()
    
    # Check required variables
    print("REQUIRED VARIABLES:")
    print("-" * 70)
    required_issues = []
    
    for key, expected in REQUIRED_VARS.items():
        result = check_env_var(key, expected if key in ("CLARIFICATION_PROVIDER", "SUGGESTION_PROVIDER") else None)
        status = "✓" if result["is_set"] else "✗"
        
        if result["is_set"]:
            if key in ("CLARIFICATION_PROVIDER", "SUGGESTION_PROVIDER"):
                if result.get("matches_expected"):
                    print(f"{status} {key:45} = {result['value']}")
                else:
                    print(f"{status} {key:45} = {result['value']} (expected: {expected})")
                    required_issues.append(f"{key} is set to '{result['value']}' but should be '{expected}'")
            else:
                print(f"{status} {key:45} = {result['value']}")
        else:
            print(f"{status} {key:45} = NOT SET")
            required_issues.append(f"{key} is not set")
    
    print()
    
    # Check optional variables
    print("OPTIONAL VARIABLES:")
    print("-" * 70)
    for key, default in OPTIONAL_VARS.items():
        result = check_env_var(key)
        status = "✓" if result["is_set"] else "○"
        if result["is_set"]:
            print(f"{status} {key:45} = {result['value']}")
        else:
            print(f"{status} {key:45} = NOT SET (default: {default})")
    
    print()
    print("=" * 70)
    
    # Summary
    if required_issues:
        print("❌ ISSUES FOUND:")
        for issue in required_issues:
            print(f"   - {issue}")
        print()
        print("HOW TO FIX:")
        print("1. Go to Railway Dashboard → Your Project → Your Service")
        print("2. Click on 'Variables' tab")
        print("3. Add or update the variables listed above")
        print("4. For CLARIFICATION_PROVIDER and SUGGESTION_PROVIDER, set value to exactly 'openai' (lowercase)")
        print("5. Redeploy the service after making changes")
        print()
        print("NOTE: If variables are set at the project level, make sure they are")
        print("      shared to the service. Railway project-level variables need to")
        print("      be explicitly shared to services.")
        return 1
    else:
        print("✓ All required variables are set correctly!")
        print()
        print("If you're still seeing 'deterministic' provider in logs:")
        print("1. Make sure the service has been redeployed after setting variables")
        print("2. Check the clarification service logs for initialization messages")
        print("3. Look for: 'Initialized clarification provider: openai'")
        return 0


if __name__ == "__main__":
    sys.exit(main())

