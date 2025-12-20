# Lifepath Planner

Multi-stage budgeting assistant composed of a Next.js UI plus three FastAPI microservices
connected through an API gateway. Each service can be run independently so teams can
iterate on ingestion, clarification, or optimization logic without blocking one another.

The previously experimental Streamlit UI has been removed; the Next.js interface under
`services/ui-web` is now the single supported surface.

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

## Environment configuration & secrets

Copy `.env.example` (or recreate it with the snippet below if your tooling hides dotfiles) to `.env` before starting any service so the FastAPI providers and Next.js UI can read the ChatGPT credentials:

1. `cp .env.example .env`
2. Use the 1Password CLI to inject real values without pasting them into your shell history:
   - `op read "op://LifePath/LLM/OpenAI Dev/api_key" | pbcopy`
   - `op inject -i .env -o .env --force` (resolves any `{{OP://...}}` placeholders if you choose to keep them in your local file)
3. Keep `.env` untracked—`.gitignore` already blocks it—and reference the same variables in any per-service `uvicorn` or `npm` command (`OPENAI_*` is automatically sourced by `scripts/dev.sh`).

| Variable | Notes |
| --- | --- |
| `OPENAI_API_KEY` | Required to call ChatGPT from the API gateway and future LLM adapters. |
| `OPENAI_MODEL` | Default model slug (e.g., `gpt-4o-mini`). Override per-environment to control spending. |
| `OPENAI_API_BASE` | Base URL for the OpenAI-compatible endpoint. Use the official API, Azure OpenAI, or another proxy. |

For GitHub Actions, store the same variables as repository or environment secrets via `gh secret set OPENAI_API_KEY --body "$(op read ...)"`. Deployment pipelines should export the secrets before invoking tests or builds so that LLM-dependent steps never hard-code keys. Additional rotation, syncing, and guardrail steps are captured in `docs/operations.md`.

```
# .env.example
OPENAI_API_KEY=replace-with-op-secret
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_BASE=https://api.openai.com/v1
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

## Documentation

- `docs/roadmap.md` — phased delivery plan plus post-MVP targets.
- `docs/pre_integration_prompts.md` — historical record of the seven pre-integration workstreams and prompts.
- `docs/AI_integration_readiness.md` — snapshot of remaining blockers before enabling ChatGPT.
- `docs/llm_adapter.md` — contracts for swapping in future ChatGPT-powered providers.
- `docs/operations.md` — telemetry, rate limiting, and guardrail runbooks.
- `docs/api_contracts.md`, `docs/budget_schema.md`, `docs/ui_components_spec.md` — canonical API and UI schemas.

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

### Deterministic pipeline tests

To exercise the ingestion → clarification → optimization pipeline with fixture data (no UI required), run:

```bash
pytest tests/test_deterministic_pipeline.py
```

The test compares current responses to JSON snapshots stored in `tests/snapshots`. If intentional contract changes require new baselines, regenerate them with:

```bash
UPDATE_SNAPSHOTS=1 pytest tests/test_deterministic_pipeline.py
```

Review and commit the updated snapshot files afterward so future runs stay deterministic.

### Real-world validation with OpenAI

To validate the prototype with real ChatGPT/OpenAI API calls:

1. **Ensure OpenAI credentials are configured** in `.env` (see [Environment configuration](#environment-configuration--secrets))

2. **Start services with OpenAI providers enabled**:
   ```bash
   CLARIFICATION_PROVIDER=openai SUGGESTION_PROVIDER=openai npm run dev
   ```

3. **Run validation** using one of these methods:
   
   **Option A: Automated script (recommended)**
   ```bash
   # Python script (requires httpx)
   python scripts/validate_real_world.py sample_budget.csv
   
   # Or bash script (requires jq and curl)
   ./scripts/validate_real_world.sh sample_budget.csv
   ```
   
   **Option B: Manual UI testing**
   - Open http://localhost:3000
   - Upload a budget file and step through the full flow
   - Review questions, answers, and suggestions for quality
   
   **Option C: API testing**
   - Use the API Gateway endpoints directly (see `docs/api_contracts.md`)
   - Test with `curl` or your preferred HTTP client

4. **Review the validation guide** for detailed checklists and troubleshooting:
   ```bash
   cat docs/real_world_validation.md
   ```

The validation scripts test the full pipeline: upload → clarification questions → answer submission → summary and suggestions. They generate JSON reports with timing, errors, and full response payloads for analysis.