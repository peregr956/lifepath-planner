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
  - Defaults to `deterministic` (existing heuristics wrapped in the new provider
    adapter).
  - Set to `mock` to replay the canned fixture stored in
    `tests/fixtures/mock_suggestions_provider.json`.
- `SUGGESTION_PROVIDER_FIXTURE` (optional) overrides the mock fixture path.

Additional provider guidance and the JSON contract live in
`docs/llm_adapter.md`.
