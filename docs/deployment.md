# Deployment Guide

This guide covers deploying LifePath Planner to production with the frontend on Vercel and backend services on Railway (or similar platforms).

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────────────────────────────────┐
│                 │     │              Backend (Railway)               │
│   Frontend      │     │  ┌─────────────────────────────────────────┐│
│   (Vercel)      │────▶│  │           API Gateway (8000)           ││
│                 │     │  │         + PostgreSQL Database           ││
│   Next.js 15    │     │  └───────────────────┬─────────────────────┘│
│                 │     │                      │                      │
└─────────────────┘     │  ┌───────────────────┼───────────────────┐  │
                        │  │                   │                   │  │
                        │  ▼                   ▼                   ▼  │
                        │ ┌────────┐    ┌────────────┐    ┌─────────┐ │
                        │ │Ingest  │    │Clarify     │    │Optimize │ │
                        │ │ (8001) │    │  (8002)    │    │ (8003)  │ │
                        │ └────────┘    └────────────┘    └─────────┘ │
                        └─────────────────────────────────────────────┘
```

## Prerequisites

1. **Vercel Account** - Sign up at [vercel.com](https://vercel.com)
2. **Railway Account** - Sign up at [railway.app](https://railway.app) (or use Render/Fly.io)
3. **GitHub Repository** - For automatic deployments
4. **OpenAI API Key** - For AI-powered features

---

## Frontend Deployment (Vercel)

### Step 1: Connect to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Configure the project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `services/ui-web`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`

### Step 2: Configure Environment Variables

In the Vercel dashboard, add the following environment variable:

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_LIFEPATH_API_BASE_URL` | Production API Gateway URL | `https://your-gateway.railway.app` |

### Step 3: Deploy

Click "Deploy" and Vercel will:
- Install dependencies
- Run `npm run build`
- Deploy to a `.vercel.app` domain

### Custom Domain (Optional)

1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS as directed

---

## Backend Deployment (Railway)

### Option A: Combined Backend (Recommended for MVP)

The simplest deployment approach runs all Python services together from the repo root.

#### Step 1: Create a New Project

1. Go to [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository

#### Step 2: Configure the Service

1. Railway will auto-detect Python
2. Go to **Settings** → **Build & Deploy**:
   - **Root Directory**: Leave empty (deploy from repo root)
   - **Build Command**: `pip install -r requirements-dev.txt`
   - **Start Command**: `./scripts/start-production.sh`

#### Step 3: Add PostgreSQL

1. Click "New" → "Database" → "PostgreSQL"
2. Railway will provision a database and provide a connection URL
3. The `DATABASE_URL` variable is automatically available

#### Step 4: Configure Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `GATEWAY_DB_URL` | PostgreSQL connection URL | `${{Postgres.DATABASE_URL}}` (Railway variable reference) |
| `GATEWAY_CORS_ORIGINS` | Allowed origins (comma-separated) | `https://your-app.vercel.app` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `OPENAI_MODEL` | Model name | `gpt-4o-mini` |
| `CLARIFICATION_PROVIDER` | Provider for clarification | `openai` or `deterministic` |
| `SUGGESTION_PROVIDER` | Provider for suggestions | `openai` or `deterministic` |
| `PORT` | Port for API Gateway | `8000` (Railway sets this automatically) |

#### Step 5: Generate Domain

1. Go to **Settings** → **Networking** → **Generate Domain**
2. Copy the generated URL (e.g., `https://your-app.railway.app`)
3. Update Vercel's `NEXT_PUBLIC_LIFEPATH_API_BASE_URL` with this URL

---

### Option B: Separate Services (Advanced)

For larger scale deployments, you can run each service separately:

#### Create 4 Services

| Service | Root Directory | Start Command | Port |
|---------|----------------|---------------|------|
| api-gateway | `services/api-gateway` | See nixpacks.toml | 8000 |
| ingestion | `services/budget-ingestion-service` | See nixpacks.toml | 8001 |
| clarification | `services/clarification-service` | See nixpacks.toml | 8002 |
| optimization | `services/optimization-service` | See nixpacks.toml | 8003 |

Configure internal service URLs:

| Variable | Value |
|----------|-------|
| `INGESTION_BASE` | `http://ingestion.railway.internal:8001` |
| `CLARIFICATION_BASE` | `http://clarification.railway.internal:8002` |
| `OPTIMIZATION_BASE` | `http://optimization.railway.internal:8003` |

---

### Option B: Render

Similar to Railway, but with `render.yaml` configuration:

```yaml
# render.yaml (place in repository root)
services:
  - type: web
    name: lifepath-api-gateway
    runtime: python
    rootDir: services/api-gateway
    buildCommand: pip install -r ../../requirements-dev.txt
    startCommand: uvicorn src.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: GATEWAY_DB_URL
        fromDatabase:
          name: lifepath-db
          property: connectionString
      - key: GATEWAY_CORS_ORIGINS
        sync: false
      - key: OPENAI_API_KEY
        sync: false

  - type: web
    name: lifepath-ingestion
    runtime: python
    rootDir: services/budget-ingestion-service
    buildCommand: pip install -r ../../requirements-dev.txt
    startCommand: uvicorn src.main:app --host 0.0.0.0 --port $PORT

  - type: web
    name: lifepath-clarification
    runtime: python
    rootDir: services/clarification-service
    buildCommand: pip install -r ../../requirements-dev.txt
    startCommand: uvicorn src.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: OPENAI_API_KEY
        sync: false

  - type: web
    name: lifepath-optimization
    runtime: python
    rootDir: services/optimization-service
    buildCommand: pip install -r ../../requirements-dev.txt
    startCommand: uvicorn src.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: OPENAI_API_KEY
        sync: false

databases:
  - name: lifepath-db
    plan: free
```

---

## Environment Variables Reference

### Frontend (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_LIFEPATH_API_BASE_URL` | Yes | URL of the API Gateway |

### Backend (API Gateway)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GATEWAY_DB_URL` | Yes* | SQLite file | Database connection URL |
| `GATEWAY_CORS_ORIGINS` | Yes | localhost only | Comma-separated allowed origins |
| `INGESTION_BASE` | No | `http://localhost:8001` | Ingestion service URL |
| `CLARIFICATION_BASE` | No | `http://localhost:8002` | Clarification service URL |
| `OPTIMIZATION_BASE` | No | `http://localhost:8003` | Optimization service URL |
| `OPENAI_API_KEY` | For AI | - | OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model name |
| `CLARIFICATION_PROVIDER` | No | `deterministic` | `openai` or `deterministic` |
| `SUGGESTION_PROVIDER` | No | `deterministic` | `openai` or `deterministic` |
| `GATEWAY_RATE_LIMIT_PER_MIN` | No | `60` | Rate limit per minute |
| `GATEWAY_RATE_LIMIT_BURST` | No | `20` | Burst limit |

*Required for production; SQLite is not suitable for multi-instance deployments.

---

## Post-Deployment Checklist

- [ ] Frontend deployed and accessible
- [ ] All 4 backend services running and healthy
- [ ] Database connected and tables created
- [ ] CORS configured to allow frontend origin
- [ ] Frontend can reach backend API
- [ ] Full flow works: upload → clarify → summarize
- [ ] Rate limiting working as expected

### Health Check URLs

Test each service:

```bash
# API Gateway
curl https://your-gateway.railway.app/health

# Response should be:
# {"status": "ok", "service": "api-gateway"}
```

### Testing the Full Flow

1. Open your Vercel deployment URL
2. Upload a sample budget CSV
3. Answer clarification questions
4. Review summary and suggestions

---

## Troubleshooting

### CORS Errors

If you see CORS errors in the browser console:

1. Check `GATEWAY_CORS_ORIGINS` includes your Vercel URL
2. Ensure the URL matches exactly (including `https://`)
3. Restart the API Gateway service after changing env vars

### Database Connection Errors

1. Verify `GATEWAY_DB_URL` is correct
2. Check the database is running and accessible
3. Ensure the connection string includes the correct port

### Service Communication Errors

If the API Gateway can't reach other services:

1. Check internal service URLs are correct
2. For Railway, use `.railway.internal` domains for internal communication
3. Verify all services are deployed and running

### OpenAI API Errors

1. Verify `OPENAI_API_KEY` is set correctly
2. Check API key has sufficient credits
3. Ensure `OPENAI_MODEL` is a valid model name

---

## Scaling Considerations

### Database

- Start with the free PostgreSQL tier
- Monitor connection usage
- Upgrade plan as traffic grows

### Services

- Railway and Render support horizontal scaling
- Enable auto-scaling based on traffic

### Rate Limiting

- Adjust `GATEWAY_RATE_LIMIT_PER_MIN` based on expected traffic
- Consider adding Redis for distributed rate limiting in high-traffic scenarios

---

## Security Checklist

- [ ] All secrets stored as environment variables, not in code
- [ ] CORS restricted to specific origins (not `*` in production)
- [ ] Database uses strong password
- [ ] HTTPS enabled on all services
- [ ] Rate limiting configured
- [ ] No sensitive data logged

