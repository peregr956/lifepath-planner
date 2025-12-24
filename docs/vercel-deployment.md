# Vercel Deployment Guide

This guide explains how to deploy LifePath Planner to Vercel with serverless API routes.

## Architecture Overview

LifePath Planner uses a fully serverless architecture on Vercel:

```
┌────────────────────────────────────────────────────────────────────┐
│                         Vercel Platform                             │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                     Next.js Application                        │ │
│  │                                                                 │ │
│  │  ┌─────────────────┐    ┌──────────────────────────────────┐  │ │
│  │  │   Frontend      │    │    API Routes (Serverless)        │  │ │
│  │  │   (React)       │───▶│    /api/upload-budget             │  │ │
│  │  │                 │    │    /api/clarification-questions   │  │ │
│  │  │   Pages:        │    │    /api/submit-answers            │  │ │
│  │  │   - /upload     │    │    /api/summary-and-suggestions   │  │ │
│  │  │   - /clarify    │    │    /api/health                    │  │ │
│  │  │   - /summarize  │    │    /api/diagnostics/env           │  │ │
│  │  └─────────────────┘    └──────────────────────────────────┘  │ │
│  │                                   │                            │ │
│  └───────────────────────────────────┼────────────────────────────┘ │
│                                      │                              │
│  ┌───────────────────────────────────▼────────────────────────────┐ │
│  │                  External Services                              │ │
│  │                                                                  │ │
│  │  ┌─────────────────┐    ┌──────────────────────────────────┐   │ │
│  │  │ Vercel Postgres │    │          OpenAI API               │   │ │
│  │  │ (Optional)      │    │   (Clarification & Suggestions)   │   │ │
│  │  └─────────────────┘    └──────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

## Benefits of This Architecture

1. **No CORS Issues**: All API calls are same-origin (frontend and backend on same domain)
2. **Simplified Deployment**: Single deployment, no need to manage multiple services
3. **Auto-Scaling**: Vercel handles scaling automatically
4. **Cost Efficient**: Pay only for what you use (no idle servers)
5. **Fast Cold Starts**: Optimized for serverless execution

## Prerequisites

1. A Vercel account (https://vercel.com)
2. The LifePath Planner repository connected to Vercel
3. (Optional) OpenAI API key for AI-powered features
4. (Optional) Vercel Postgres for persistent storage

## Deployment Steps

### 1. Connect Repository

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Set the Root Directory to `services/ui-web`

### 2. Configure Environment Variables

In your Vercel project settings, add these environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Optional | Your OpenAI API key for AI features |
| `OPENAI_MODEL` | Optional | OpenAI model (defaults to `gpt-4o-mini`) |
| `OPENAI_API_BASE` | Optional | OpenAI API base URL (defaults to `https://api.openai.com/v1`) |
| `POSTGRES_URL` | Optional | Vercel Postgres connection string for persistent storage |

**Note**: If `OPENAI_API_KEY` is not set, the app falls back to deterministic (rule-based) suggestions.

> **IMPORTANT: Do NOT set `NEXT_PUBLIC_LIFEPATH_API_BASE_URL`**
>
> This variable should NOT be set for Vercel deployments. The app automatically uses same-origin API routes (`/api/*`) which eliminates CORS issues and simplifies deployment.
>
> If you previously deployed to Railway or another external backend, make sure to **delete** `NEXT_PUBLIC_LIFEPATH_API_BASE_URL` from your Vercel environment variables. Since `NEXT_PUBLIC_*` variables are embedded at build time, any old external URL will be baked into the client bundle and cause API calls to fail.

### 3. Set Up Vercel Postgres (Optional)

For persistent storage across function invocations:

1. In Vercel Dashboard, go to your project
2. Click "Storage" → "Create Database" → "Postgres"
3. Follow the prompts to create a database
4. The `POSTGRES_URL` environment variable will be automatically added

Without Postgres, the app uses in-memory storage (data is lost on function cold starts).

### 4. Deploy

Push to your main branch, and Vercel will automatically deploy.

## Environment Variable Configuration

### For AI Features

```bash
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4o-mini  # or gpt-4, gpt-4-turbo, etc.
```

### For Persistent Storage

```bash
POSTGRES_URL=postgres://username:password@host:5432/database?sslmode=require
```

## API Endpoints

All API endpoints are available at `/api/*`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/diagnostics/env` | GET | Environment diagnostics |
| `/api/upload-budget` | POST | Upload budget file (CSV/XLSX) |
| `/api/user-query` | POST | Submit user's question |
| `/api/clarification-questions` | GET | Get clarification questions |
| `/api/submit-answers` | POST | Submit answers to questions |
| `/api/summary-and-suggestions` | GET | Get summary and suggestions |

## Troubleshooting

### Check Configuration

Visit `/diagnostics` in your deployed app to see:
- Current API configuration
- Environment variable status
- Provider status (OpenAI vs deterministic)

Or check the API endpoint directly:
```bash
curl https://your-app.vercel.app/api/diagnostics/env
```

### Common Issues

**API calls failing with "Unable to reach the API server" or pointing to wrong URL (e.g., Railway):**

This is typically caused by having `NEXT_PUBLIC_LIFEPATH_API_BASE_URL` set to an external URL in your Vercel environment variables.

To fix:
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Find `NEXT_PUBLIC_LIFEPATH_API_BASE_URL`
3. **Delete it** (recommended) or set it to `/api`
4. **Redeploy your application** (required because `NEXT_PUBLIC_*` variables are embedded at build time)

The app defaults to using same-origin API routes (`/api/*`) which is the correct configuration for Vercel deployments. Setting this variable to an external URL will override that behavior and cause API calls to fail.

**AI features not working:**
- Verify `OPENAI_API_KEY` is set in Vercel environment variables
- Check `/api/diagnostics/env` to see if the key is detected

**Data not persisting:**
- Set up Vercel Postgres and add `POSTGRES_URL`
- Without Postgres, data is stored in memory and lost on cold starts

**Build failures:**
- Check that the root directory is set to `services/ui-web`
- Ensure all dependencies are listed in `package.json`

## Local Development

To run locally:

```bash
cd services/ui-web
npm install
npm run dev
```

The app will be available at `http://localhost:3000`.

For local development with AI features:
```bash
export OPENAI_API_KEY=sk-your-api-key
npm run dev
```

