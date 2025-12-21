# Vercel Environment Variables

This document lists all required environment variables for the Vercel deployment (excluding API keys).

## Required Environment Variables

### Primary (Required)

| Variable Name | Required | Description | Example |
|--------------|----------|-------------|---------|
| `NEXT_PUBLIC_LIFEPATH_API_BASE_URL` | **Yes** | Full URL of your API Gateway endpoint | `https://your-api-gateway.railway.app` or `https://api.yourdomain.com` |

## Optional Environment Variables (Fallbacks)

The application will check these environment variables in order if `NEXT_PUBLIC_LIFEPATH_API_BASE_URL` is not set:

| Variable Name | Priority | Description |
|--------------|----------|-------------|
| `LIFEPATH_API_BASE_URL` | 2nd | Alternative API base URL (without NEXT_PUBLIC prefix) |
| `NEXT_PUBLIC_API_BASE_URL` | 3rd | Generic API base URL |
| `API_BASE_URL` | 4th | Generic API base URL (without NEXT_PUBLIC prefix) |
| `NEXT_PUBLIC_GATEWAY_BASE_URL` | 5th | Gateway-specific base URL |
| `GATEWAY_BASE_URL` | 6th | Gateway-specific base URL (without NEXT_PUBLIC prefix) |

### Multiple API Endpoints (Optional)

If you want to provide multiple candidate API endpoints for the app to try:

| Variable Name | Description | Format |
|--------------|-------------|--------|
| `NEXT_PUBLIC_LIFEPATH_API_BASE_CANDIDATES` | Comma-separated list of API endpoints | `https://api1.example.com,https://api2.example.com` |
| `LIFEPATH_API_BASE_CANDIDATES` | Same as above (without NEXT_PUBLIC prefix) | `https://api1.example.com,https://api2.example.com` |
| `NEXT_PUBLIC_API_BASE_CANDIDATES` | Generic candidate list | `https://api1.example.com,https://api2.example.com` |
| `API_BASE_CANDIDATES` | Generic candidate list (without NEXT_PUBLIC prefix) | `https://api1.example.com,https://api2.example.com` |

## Notes

1. **NEXT_PUBLIC_ prefix**: Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. Only use this prefix for variables that are safe to expose publicly.

2. **Default Behavior**: If no environment variables are set, the app will default to trying these localhost endpoints:
   - `http://localhost:8000`
   - `http://127.0.0.1:8000`
   - `http://localhost:8080`
   - `http://127.0.0.1:8080`

3. **URL Format**: 
   - URLs should include the protocol (`http://` or `https://`)
   - Do not include a trailing slash
   - Example: `https://api-gateway.example.com` ✅
   - Example: `https://api-gateway.example.com/` ❌

## Minimum Configuration

For a basic Vercel deployment, you only need to set:

```
NEXT_PUBLIC_LIFEPATH_API_BASE_URL=https://your-api-gateway-url.com
```

Replace `https://your-api-gateway-url.com` with your actual API Gateway deployment URL.

