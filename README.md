# Lifepath Planner

Multi-stage budgeting assistant composed of a Next.js UI plus three FastAPI microservices
connected through an API gateway. Each service can be run independently so teams can
iterate on ingestion, clarification, or optimization logic without blocking one another.

## Prerequisites

- Python 3.11 (or newer) with `pip`
- Node.js 20+ with `npm`
- Recommended: create a virtual environment (`python -m venv .venv && source .venv/bin/activate`)

Install shared Python tooling:

```bash
pip install -r requirements-dev.txt
```

Install the web dependencies:

```bash
cd services/ui-web
npm install
```

## Running the stack locally

### One-command dev environment

From the repo root:

```bash
npm install          # installs the small Node wrapper + concurrently
npm run dev          # installs Python deps (unless SKIP_PIP_INSTALL=1) and starts every service
```

`npm run dev` calls `scripts/dev.sh`, which:

- installs/updates the shared Python dependencies (skip with `SKIP_PIP_INSTALL=1 npm run dev`)
- clears ports `8000-8003` if another process has them open
- launches the API gateway plus ingestion, clarification, optimization, and the Next.js UI via `concurrently`
- stops every process when you hit `Ctrl+C`, so the stack shuts down cleanly

### Manual commands (advanced)

If you prefer to run each service yourself, use the commands below. The ports line up with
the defaults baked into the gateway (`services/api-gateway/src/main.py`).

| Service | Port | Command |
| --- | --- | --- |
| Next.js UI | 3000 | `cd services/ui-web && npm run dev` |
| API Gateway | 8000 | `cd services/api-gateway && uvicorn src.main:app --reload --port 8000` |
| Budget Ingestion | 8001 | `cd services/budget-ingestion-service && uvicorn src.main:app --reload --port 8001` |
| Clarification | 8002 | `cd services/clarification-service && uvicorn src.main:app --reload --port 8002` |
| Optimization | 8003 | `cd services/optimization-service && uvicorn src.main:app --reload --port 8003` |

Once the services are online, visit http://localhost:3000, upload a budget export, and step
through clarifications and summarization. The UI reads/writes through the gateway so you
only need to update the base URL in one place if you change ports.

## Troubleshooting

- **`Address already in use` when starting uvicorn** – another process already owns that
  port. Identify and stop it via `lsof -i tcp:<PORT>` (e.g. `lsof -i tcp:8000`) before
  restarting.
- **`upstream_service_unavailable: Budget ingestion service is unavailable`** – the gateway
  could not reach the ingestion service on port 8001. Make sure the ingestion server is
  running and reachable before uploading a file.
- **Need to reset API base in the UI** – use the API base switcher (top-right in the UI) or
  set `NEXT_PUBLIC_LIFEPATH_API_BASE_URL` to the gateway URL.

## Tests

Each service has a focused test suite under `services/<name>/tests`.

```bash
pytest services/api-gateway/tests
pytest services/budget-ingestion-service/tests
pytest services/clarification-service/tests
pytest services/optimization-service/tests
```