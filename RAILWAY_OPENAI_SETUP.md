# Railway OpenAI Configuration - REQUIRED

## Problem
If your app is working but using deterministic (non-AI) responses instead of OpenAI, the backend services on Railway are missing the required environment variables.

## Solution: Set Environment Variables in Railway

### Step 1: Access Railway Dashboard
1. Go to [railway.app](https://railway.app)
2. Navigate to your project: **lifepath-planner-production**
3. Click on your service (the one running the API Gateway)

### Step 2: Add Required Environment Variables

**IMPORTANT**: In Railway, you can set variables at two levels:
- **Service-level**: Variables specific to one service (recommended)
- **Project-level**: Variables shared across all services (must be explicitly shared)

**For this setup, set variables at the SERVICE level** (not project level) to ensure they're available:

1. Go to **Variables** tab in your service
2. Add the following variables:

#### Required for OpenAI to Work:

| Variable Name | Value | Description |
|--------------|-------|-------------|
| `CLARIFICATION_PROVIDER` | `openai` | Enables AI-powered clarification questions |
| `SUGGESTION_PROVIDER` | `openai` | Enables AI-powered budget suggestions |
| `OPENAI_API_KEY` | `sk-...` | Your OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model to use (or `gpt-4o` for better quality) |
| `OPENAI_API_BASE` | `https://api.openai.com/v1` | OpenAI API endpoint |

#### Optional (with defaults):

| Variable Name | Default | Description |
|--------------|---------|-------------|
| `CLARIFICATION_PROVIDER_TIMEOUT_SECONDS` | `10.0` | Timeout for clarification requests |
| `SUGGESTION_PROVIDER_TIMEOUT_SECONDS` | `60.0` | Timeout for suggestion requests |
| `CLARIFICATION_PROVIDER_TEMPERATURE` | `0.2` | Randomness for clarification questions |
| `SUGGESTION_PROVIDER_TEMPERATURE` | `0.3` | Randomness for suggestions |

### Step 3: Verify Configuration

After setting the variables:

1. **Redeploy the service** (Railway may auto-redeploy, or you can trigger a manual redeploy)
2. Check the service logs to see:
   - `Initialized clarification provider: openai`
   - `Initialized suggestion provider: openai`
3. Test the app - you should now see AI-generated responses instead of deterministic ones

### Step 4: Verify Configuration

#### Option A: Check Railway Logs

After redeployment, check the Railway logs. You should see messages like:

```
Initialized clarification provider: openai (set CLARIFICATION_PROVIDER=openai to use OpenAI)
Initialized suggestion provider: openai
```

If you see `deterministic` instead of `openai`, the environment variables are not set correctly.

#### Option B: Check API Response

The API returns provider metadata in responses. You can verify by:

1. Making a request to `/summary-and-suggestions?budget_id=<your_budget_id>`
2. Check the `provider_metadata` field in the response:
   ```json
   {
     "provider_metadata": {
       "clarification_provider": "openai",
       "suggestion_provider": "openai",
       "ai_enabled": true
     }
   }
   ```

If you see `"deterministic"` instead of `"openai"`, the environment variables are not set correctly.

## Troubleshooting

### Still seeing deterministic responses?

1. **Verify variables are set at SERVICE level** (not just project level):
   - Go to your service → Variables tab
   - Make sure each variable is listed in the service's Variables section
   - If variables are only at project level, Railway may not share them automatically
   - **Solution**: Set variables directly in the service's Variables tab

2. **Check variable names**: Make sure they're exactly:
   - `CLARIFICATION_PROVIDER` (not `CLARIFICATION_PROVIDER_NAME`)
   - `SUGGESTION_PROVIDER` (not `SUGGESTION_PROVIDER_NAME`)

3. **Check variable values**: 
   - Must be exactly `openai` (lowercase, no quotes, no spaces)
   - Not `"openai"` or `OpenAI` or `OPENAI` or ` openai ` (no leading/trailing spaces)
   - Verify by clicking on each variable in Railway to see its exact value

4. **Redeploy**: Railway may need a redeploy to pick up new environment variables:
   - Go to Deployments tab
   - Click "Redeploy" on the latest deployment
   - Wait for deployment to complete

5. **Check logs for errors**: Look for messages like:
   - `Failed to load clarification provider settings`
   - `OpenAI client not configured`
   - `Initialized clarification provider: deterministic` (this means variables aren't set)

6. **Run diagnostic script** (if you have Railway CLI access):
   ```bash
   railway run python scripts/check_railway_env.py
   ```

### Missing OpenAI credentials?

If you don't have OpenAI API credentials:
1. Sign up at [platform.openai.com](https://platform.openai.com)
2. Create an API key in the API Keys section
3. Add credits to your account (required for API usage)

## Quick Reference

**Minimum required variables for OpenAI:**
```
CLARIFICATION_PROVIDER=openai
SUGGESTION_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_BASE=https://api.openai.com/v1
```

**To disable OpenAI and use deterministic:**
```
CLARIFICATION_PROVIDER=deterministic
SUGGESTION_PROVIDER=deterministic
```
(Or simply remove/leave unset - deterministic is the default)

