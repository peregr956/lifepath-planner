# Vercel Deployment Debugging Guide

This document helps diagnose issues with the Vercel deployment not working properly.

## Common Issues and Solutions

### 1. Environment Variable Configuration

**Problem**: The app defaults to `localhost` endpoints instead of your production API.

**Check**:
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Verify `NEXT_PUBLIC_LIFEPATH_API_BASE_URL` is set to your API Gateway URL
3. Ensure the value includes the protocol: `https://your-api-gateway.railway.app` (not just the domain)
4. **Important**: After adding/changing environment variables, you MUST redeploy for changes to take effect

**Why**: Next.js embeds `NEXT_PUBLIC_*` environment variables at build time. If the variable wasn't set during the build, it won't be available in the deployed app.

**Solution**:
- Set the environment variable in Vercel
- Trigger a new deployment (or push a new commit)
- The variable will be embedded in the build

### 2. CORS (Cross-Origin Resource Sharing) Errors

**Problem**: Browser console shows CORS errors when trying to make API requests.

**Symptoms**:
- Browser console shows: `Access to fetch at '...' from origin '...' has been blocked by CORS policy`
- Network tab shows OPTIONS requests failing with CORS errors
- API requests fail with network errors

**Check Backend Configuration**:
1. On your API Gateway (Railway/Render/etc.), set the `GATEWAY_CORS_ORIGINS` environment variable
2. Include your Vercel deployment URL: `https://your-app.vercel.app`
3. You can include multiple origins separated by commas: `https://app1.vercel.app,https://app2.vercel.app`
4. **Important**: Restart the API Gateway service after changing CORS settings

**Example**:
```bash
GATEWAY_CORS_ORIGINS=https://your-app.vercel.app,https://your-app-git-main.vercel.app
```

**Why**: Browsers enforce CORS policies. The backend must explicitly allow requests from your frontend's origin.

### 3. Environment Variable Not Available at Build Time

**Problem**: Variable is set in Vercel but still not working.

**Check**:
1. Verify the variable is set for the correct environment (Production, Preview, Development)
2. Check if the variable name is exactly `NEXT_PUBLIC_LIFEPATH_API_BASE_URL` (case-sensitive)
3. Ensure there are no extra spaces or quotes in the value
4. Check the build logs in Vercel to see if the variable is being used

**Solution**:
- Set the variable for all environments (Production, Preview, Development)
- Redeploy after setting the variable
- Check the browser console in development mode - it will log the resolved API base URL

### 4. Network/Connectivity Issues

**Problem**: API requests timeout or fail to connect.

**Check**:
1. Verify the API Gateway URL is correct and accessible
2. Test the API Gateway health endpoint: `curl https://your-api-gateway.railway.app/health`
3. Check if the API Gateway is running and healthy
4. Verify there are no firewall rules blocking requests

**Solution**:
- Test the API Gateway directly with curl or Postman
- Check API Gateway logs for errors
- Verify all backend services are running

## Debugging Steps

### Step 1: Check Browser Console

1. Open your Vercel deployment in a browser
2. Open Developer Tools (F12)
3. Go to Console tab
4. Look for `[API Client]` log messages - these show:
   - What API base URL is being used
   - What environment variables are available
   - Request/response details

### Step 2: Check Network Tab

1. Open Developer Tools → Network tab
2. Try to upload a file or make an API request
3. Look for failed requests
4. Check:
   - Request URL (is it pointing to the right API?)
   - Status code (404, 500, CORS error?)
   - Response headers (CORS headers present?)

### Step 3: Verify Environment Variables

In the browser console (development mode), you'll see logs like:
```
[API Client] Initial API base candidates: [...]
[API Client] Active API base: https://...
[API Client] Environment variables check: {...}
```

This shows what the app is actually using.

### Step 4: Test API Gateway Directly

```bash
# Test health endpoint
curl https://your-api-gateway.railway.app/health

# Should return: {"status": "ok", "service": "api-gateway"}
```

### Step 5: Check CORS Configuration

Test CORS with curl:
```bash
curl -H "Origin: https://your-app.vercel.app" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS \
     https://your-api-gateway.railway.app/health

# Should return CORS headers including:
# access-control-allow-origin: https://your-app.vercel.app
```

## Developer Panel

In development mode, you can use the Developer Panel (Ctrl+Shift+D) to:
- See the current API base URL
- Switch between different API endpoints
- Add custom API endpoints
- View session information

## Quick Checklist

- [ ] `NEXT_PUBLIC_LIFEPATH_API_BASE_URL` is set in Vercel
- [ ] Environment variable is set for the correct environment (Production/Preview)
- [ ] Variable value includes `https://` protocol
- [ ] Variable value has no trailing slash
- [ ] Redeployed after setting/changing the variable
- [ ] `GATEWAY_CORS_ORIGINS` is set on the backend
- [ ] CORS includes your Vercel URL
- [ ] API Gateway is running and accessible
- [ ] Health endpoint returns `{"status": "ok"}`
- [ ] Browser console shows correct API base URL
- [ ] Network tab shows requests going to the right URL

## Still Not Working?

1. **Check the browser console** - Look for `[API Client]` logs and error messages
2. **Check the network tab** - See what requests are being made and their responses
3. **Verify both frontend and backend configurations** - Both need to be correct
4. **Test the API Gateway directly** - Use curl to verify it's working
5. **Check CORS headers** - Use the curl command above to test CORS

## Common Error Messages

### "Unable to reach the API gateway at http://localhost:8000"
- **Cause**: Environment variable not set or not available at build time
- **Fix**: Set `NEXT_PUBLIC_LIFEPATH_API_BASE_URL` in Vercel and redeploy

### "CORS policy: No 'Access-Control-Allow-Origin' header"
- **Cause**: Backend CORS not configured for your Vercel origin
- **Fix**: Set `GATEWAY_CORS_ORIGINS` on the backend to include your Vercel URL

### "Request timed out"
- **Cause**: API Gateway not responding or network issues
- **Fix**: Check API Gateway health and logs

### "502 Bad Gateway" or "503 Service Unavailable"
- **Cause**: API Gateway or upstream services are down
- **Fix**: Check backend service logs and health

