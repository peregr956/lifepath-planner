# Railway Environment Variables Troubleshooting

## Problem: Service Falls Back to Deterministic Provider

If your logs show `"provider": "deterministic"` even though you've set the environment variables in Railway, this guide will help you diagnose and fix the issue.

## Quick Diagnosis

### Option 1: Use the Diagnostic Endpoint

After deploying, check:
```
curl https://lifepath-planner-production.up.railway.app/diagnostics/env
```

This will show:
- Which environment variables are set
- Which ones are missing
- The current provider configuration
- Any issues found

### Option 2: Check Railway Logs

Look for these messages in your Railway service logs:

**✅ Correct (OpenAI enabled):**
```
Initialized clarification provider: openai (set CLARIFICATION_PROVIDER=openai to use OpenAI)
Initialized suggestion provider: openai
```

**❌ Incorrect (Deterministic fallback):**
```
Initialized clarification provider: deterministic
```

## Common Issues and Solutions

### Issue 1: Variables Set at Project Level, Not Service Level

**Symptom**: Variables are visible in Railway project settings but service still uses deterministic.

**Solution**: 
1. Go to your **service** (not project) → Variables tab
2. Add variables directly in the service's Variables section
3. Railway project-level variables may not automatically share to services
4. Redeploy the service after adding variables

### Issue 2: Variable Value Has Extra Spaces or Wrong Case

**Symptom**: Variable is set but provider still shows as deterministic.

**Solution**:
- `CLARIFICATION_PROVIDER` must be exactly `openai` (lowercase, no quotes, no spaces)
- Check the variable value in Railway by clicking on it
- Common mistakes:
  - `"openai"` (with quotes) ❌
  - `OpenAI` (uppercase) ❌
  - ` openai ` (with spaces) ❌
  - `openai` (correct) ✅

### Issue 3: Service Not Redeployed After Setting Variables

**Symptom**: Variables are set correctly but service still uses old configuration.

**Solution**:
1. Go to Railway → Deployments tab
2. Click "Redeploy" on the latest deployment
3. Wait for deployment to complete
4. Check logs again for provider initialization messages

### Issue 4: Missing Required OpenAI Variables

**Symptom**: `CLARIFICATION_PROVIDER=openai` is set but service still falls back.

**Solution**: When `CLARIFICATION_PROVIDER=openai` is set, these are also required:
- `OPENAI_API_KEY` (must be a valid API key starting with `sk-`)
- `OPENAI_MODEL` (e.g., `gpt-4o-mini`)
- `OPENAI_API_BASE` (e.g., `https://api.openai.com/v1`)

If any of these are missing, the service will fall back to deterministic.

## Step-by-Step Fix

1. **Verify Service-Level Variables**:
   - Go to Railway → Your Project → Your Service
   - Click "Variables" tab
   - Verify these are set at the **service level** (not just project level):
     - `CLARIFICATION_PROVIDER=openai`
     - `SUGGESTION_PROVIDER=openai`
     - `OPENAI_API_KEY=sk-...`
     - `OPENAI_MODEL=gpt-4o-mini`
     - `OPENAI_API_BASE=https://api.openai.com/v1`

2. **Check Variable Values**:
   - Click on each variable to see its exact value
   - Ensure no extra spaces, quotes, or wrong case

3. **Redeploy**:
   - Go to Deployments tab
   - Click "Redeploy"
   - Wait for completion

4. **Verify**:
   - Check logs for: `Initialized clarification provider: openai`
   - Or use: `curl https://your-service.railway.app/diagnostics/env`

## Testing Locally

To test if your configuration works:

```bash
# Set variables
export CLARIFICATION_PROVIDER=openai
export SUGGESTION_PROVIDER=openai
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini
export OPENAI_API_BASE=https://api.openai.com/v1

# Run the diagnostic script
python scripts/check_railway_env.py

# Start services
npm run dev
```

## Still Having Issues?

1. Check Railway service logs for error messages
2. Use the diagnostic endpoint: `/diagnostics/env`
3. Verify all variables are set at the **service level** (not project level)
4. Ensure variable values are exactly correct (no spaces, lowercase for providers)
5. Redeploy after making changes

