# Lifepath Planner

Multi-stage budgeting assistant powered by AI. Upload your budget, answer clarification questions,
and receive personalized financial suggestions.

## Architecture

LifePath Planner uses a **fully serverless architecture on Vercel**:

- **Frontend**: Next.js React application
- **Backend**: Vercel Serverless Functions (Next.js API Routes)
- **AI**: OpenAI GPT-4o-mini for intelligent questions and suggestions
- **Storage**: Vercel Postgres (optional) or in-memory

```
┌────────────────────────────────────────────────────────────────┐
│                      Vercel Platform                            │
│                                                                  │
│  Next.js Application                                             │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐ │
│  │   Frontend      │───▶│     API Routes (Serverless)          │ │
│  │   /upload       │    │     /api/upload-budget               │ │
│  │   /clarify      │    │     /api/clarification-questions     │ │
│  │   /summarize    │    │     /api/summary-and-suggestions     │ │
│  └─────────────────┘    └─────────────────────────────────────┘ │
│                                      │                           │
│                          ┌───────────▼───────────┐              │
│                          │      OpenAI API       │              │
│                          └───────────────────────┘              │
└────────────────────────────────────────────────────────────────┘
```

**Benefits:**
- ✅ No CORS issues (same-origin API)
- ✅ Single deployment
- ✅ Auto-scaling
- ✅ Zero server management

## Quick Start

### Local Development

```bash
cd services/ui-web
npm install
npm run dev
```

Visit http://localhost:3000

### With AI Features

```bash
export OPENAI_API_KEY=sk-your-api-key
cd services/ui-web
npm run dev
```

## Deployment to Vercel

1. Connect your GitHub repo to Vercel
2. Set Root Directory to `services/ui-web`
3. Add environment variables:
   - `OPENAI_API_KEY` - Your OpenAI API key (for AI features)
   - `POSTGRES_URL` - Vercel Postgres URL (optional, for persistence)
4. Deploy!

For detailed instructions, see [docs/vercel-deployment.md](docs/vercel-deployment.md).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Optional | OpenAI API key for AI-powered features |
| `OPENAI_MODEL` | Optional | Model to use (defaults to `gpt-4o-mini`) |
| `POSTGRES_URL` | Optional | Vercel Postgres for persistent storage |

Without `OPENAI_API_KEY`, the app uses deterministic (rule-based) suggestions.

## API Endpoints

All API endpoints are served from the same origin at `/api/*`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/upload-budget` | POST | Upload budget file (CSV/XLSX) |
| `/api/user-query` | POST | Submit user's question |
| `/api/clarification-questions` | GET | Get clarification questions |
| `/api/submit-answers` | POST | Submit answers |
| `/api/summary-and-suggestions` | GET | Get summary and suggestions |
| `/api/diagnostics/env` | GET | Environment diagnostics |

## Project Structure

```
services/ui-web/
├── src/
│   ├── app/
│   │   ├── api/           # Serverless API routes
│   │   │   ├── upload-budget/
│   │   │   ├── clarification-questions/
│   │   │   ├── submit-answers/
│   │   │   ├── summary-and-suggestions/
│   │   │   └── ...
│   │   ├── (app)/         # Frontend pages
│   │   │   ├── upload/
│   │   │   ├── clarify/
│   │   │   └── summarize/
│   │   └── layout.tsx
│   ├── lib/               # Backend utilities
│   │   ├── db.ts          # Database operations
│   │   ├── parsers.ts     # CSV/XLSX parsing
│   │   ├── ai.ts          # OpenAI integration
│   │   └── ...
│   ├── components/        # React components
│   └── utils/             # Shared utilities
├── package.json
└── vercel.json
```

## Documentation

- [Deployment Guide](docs/vercel-deployment.md) — Complete Vercel deployment instructions
- [Development Guide](docs/development.md) — Local development setup
- [API Contracts](docs/api_contracts.md) — API documentation
- [Budget Schema](docs/budget_schema.md) — Budget data format
- [Architecture](docs/architecture/README.md) — System architecture overview

## Troubleshooting

### Check Configuration

Visit `/diagnostics` in your deployed app or check `/api/diagnostics/env` directly.

### Common Issues

**AI features not working:**
- Verify `OPENAI_API_KEY` is set in Vercel environment variables
- Check the diagnostics page for configuration status

**Data not persisting:**
- Set up Vercel Postgres and add `POSTGRES_URL`
- Without Postgres, data is stored in memory (lost on cold starts)

**Build errors:**
- Ensure Root Directory is set to `services/ui-web`
- Check Node.js version (requires 20+)

## Tests

```bash
cd services/ui-web
npm run test           # Unit tests
npm run type-check     # TypeScript check
npm run lint           # ESLint
npm run test:e2e       # End-to-end tests
```

## Legacy Services

The Python microservices under `services/api-gateway`, `services/budget-ingestion-service`,
`services/clarification-service`, and `services/optimization-service` are kept for reference
but are no longer used in production. All functionality has been migrated to the Vercel
serverless architecture.
