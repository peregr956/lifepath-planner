# Vercel Environment Variable Setup - REQUIRED

## Critical: NEXT_PUBLIC_LIFEPATH_API_BASE_URL

**This variable MUST be set in Vercel for the production deployment to work.**

### Steps to Set:

1. Go to: https://vercel.com/kyles-projects-2b8a342b/lifepath-planner/settings/environment-variables

2. Click "Create new" or find existing `NEXT_PUBLIC_LIFEPATH_API_BASE_URL`

3. Set the following:
   - **Key**: `NEXT_PUBLIC_LIFEPATH_API_BASE_URL`
   - **Value**: `https://lifepath-planner-production.up.railway.app`
   - **Environments**: Select "All Environments" (or at minimum: Production, Preview, Development)
   - **Sensitive**: Leave disabled (this is a public URL)

4. **IMPORTANT**: After saving, you MUST trigger a new deployment:
   - Go to Deployments page
   - Click "Redeploy" on the latest deployment, OR
   - Push a new commit to trigger automatic deployment

### Why This is Required:

- Next.js embeds `NEXT_PUBLIC_*` variables at **build time**
- If the variable isn't set when Vercel builds the app, it won't be in the bundle
- The app will fall back to `http://localhost:8000` which won't work in production

### Verification:

After deployment, check the browser console for:
- `[API Client] Environment variable check:` - should show the Railway URL
- If you see `WARNING: Falling back to localhost:8000 in production!`, the variable wasn't set correctly

### Current Railway API URL:
`https://lifepath-planner-production.up.railway.app`

