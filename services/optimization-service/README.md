# Optimization Service

The optimization service exposes FastAPI endpoints that summarize a unified
budget and emit deterministic suggestions. Step 6 introduced the provider
boundary so suggestion generation can be swapped via configuration instead of
code changes.

## Running tests

```bash
cd services/optimization-service && pytest tests
```

## Provider configuration

- `SUGGESTION_PROVIDER` selects the implementation used by
  `/summarize-and-optimize`.
  - `deterministic` (default) wraps the heuristic engine.
  - `mock` replays `tests/fixtures/mock_suggestions_provider.json`.
  - `openai` reserves the future LLM adapter slot. Requests currently return
    `501` until the adapter lands, but enabling it now validates environment
    wiring.
- `SUGGESTION_PROVIDER_TIMEOUT_SECONDS` (default: `10`) controls outbound
  timeout budgets.
- `SUGGESTION_PROVIDER_TEMPERATURE` (default: `0.2`) tunes stochastic providers.
- `SUGGESTION_PROVIDER_MAX_TOKENS` (default: `512`) caps completion size.
- `SUGGESTION_PROVIDER_FIXTURE` (optional) overrides the mock fixture path.
- When `SUGGESTION_PROVIDER=openai`, the service fails fast unless the shared
  OpenAI env vars are set: `OPENAI_API_KEY`, `OPENAI_MODEL`, and
  `OPENAI_API_BASE`.

Additional provider guidance and the JSON contract live in
`docs/llm_adapter.md`.
