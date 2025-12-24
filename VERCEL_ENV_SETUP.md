# Vercel Environment Variable Setup - REQUIRED

## Critical: NEXT_PUBLIC_LIFEPATH_API_BASE_URL

**This variable MUST be set in Vercel BEFORE triggering a build for the production deployment to work.**

> **Key Point**: `NEXT_PUBLIC_*` variables are embedded into the JavaScript bundle at **build time**, not runtime. If the variable isn't set when Vercel builds the app, it won't be available in the deployed application.

### Steps to Set:

1. Go to: https://vercel.com/kyles-projects-2b8a342b/lifepath-planner/settings/environment-variables

2. Click "Create new" or find existing `NEXT_PUBLIC_LIFEPATH_API_BASE_URL`

3. Set the following:
   - **Key**: `NEXT_PUBLIC_LIFEPATH_API_BASE_URL`
   - **Value**: `https://lifepath-planner-production.up.railway.app`
   - **Environments**: Select the correct environment(s):
     - **Production** - Required for the live site
     - **Preview** - Recommended for PR preview deployments
     - **Development** - Optional, for local development with Vercel CLI
   - **Sensitive**: Leave disabled (this is a public URL)

4. **CRITICAL**: After saving, you MUST trigger a **new deployment**:
   - Go to Deployments page
   - Click "Redeploy" on the latest deployment (use "Redeploy with existing Build Cache" for faster deploys, or without cache if issues persist), OR
   - Push a new commit to trigger automatic deployment

   > Simply saving the environment variable is NOT enough. The variable is only embedded during the build process, so a new build must run after setting the variable.

### Why This is Required:

- Next.js embeds `NEXT_PUBLIC_*` variables at **build time** only
- The variables are replaced with their literal values during compilation
- If the variable isn't set when Vercel builds the app, it won't be in the bundle
- The app will fall back to `http://localhost:8000` which won't work in production
- Runtime environment variables (without `NEXT_PUBLIC_` prefix) are only available server-side

### Common Mistakes:

1. **Setting the variable after deployment**: The variable must exist BEFORE the build runs
2. **Not triggering a new deployment**: Changes to environment variables require a rebuild
3. **Setting for wrong environment**: Ensure "Production" is selected for the live site
4. **Typos in variable name**: Must be exactly `NEXT_PUBLIC_LIFEPATH_API_BASE_URL`

### Verification:

After deployment, visit the diagnostics page at `/diagnostics` to verify:
- `NEXT_PUBLIC_LIFEPATH_API_BASE_URL` should show your Railway URL
- If it shows "(not set)", the variable was not available at build time

You can also check the browser console for:
- `[API Client] Environment variable check:` - should show the Railway URL
- If you see `WARNING: Falling back to localhost:8000 in production!`, the variable wasn't set correctly

### Current Railway API URL:
`https://lifepath-planner-production.up.railway.app`

### Troubleshooting Checklist:

- [ ] Environment variable is set in Vercel dashboard
- [ ] Variable name is exactly `NEXT_PUBLIC_LIFEPATH_API_BASE_URL`
- [ ] Value is the full URL including `https://`
- [ ] "Production" environment is selected
- [ ] A new deployment was triggered AFTER setting the variable
- [ ] Deployment completed successfully (check build logs)

