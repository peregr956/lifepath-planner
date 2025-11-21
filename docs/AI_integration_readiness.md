# AI Integration Readiness

This document summarizes the current state of the deterministic stack, the guardrails now
in place, and the remaining backlog items that must be addressed (or explicitly deferred)
before wiring ChatGPT into the flow.

## Current State

- **Deterministic pipeline** – `tests/test_deterministic_pipeline.py` snapshots the upload →
  clarification → summary loop so provider changes can be diffed safely.
- **Persistence + auditing** – The API gateway persists sessions plus audit trails via
  SQLAlchemy (`services/api-gateway/persistence`). Restarts no longer drop context.
- **Observability + guardrails** – OpenTelemetry tracing, rate limiting, and prompt/response
  hashing are documented in `docs/operations.md`. Every service emits structured logs with
  `request_id` correlation.
- **Provider abstraction** – `docs/llm_adapter.md` defines the Clarification/Suggestion provider
  contract. Deterministic + mock implementations ship today; future LLM-backed providers plug in
  via environment variables.
- **UI alignment** – The Next.js UI (`services/ui-web`) is the single supported surface; the
  deprecated Streamlit app was removed to avoid skew between clients.

## Outstanding Work

### ai-answer-validation

✅ `services/api-gateway/src/answer_validation.py` now mirrors the clarification-service binding logic. `/submit-answers` rejects unknown field IDs, enforces scalar types, and records structured errors before any upstream call.

### ready-for-summary-contract

✅ The gateway propagates `ready_for_summary` through its response and stores the flag alongside audit metadata. `services/ui-web` consumes the flag in `ClarifyPage`, gating the summary step until the clarification service signals readiness.

### ai-answer-application

✅ Clarification service binding logic supports dot-path field IDs, nested debt metadata, and automatic promotion of debt-like expenses. Tests load fixtures in `tests/fixtures/ai_answers_payload.json` to ensure AI-formatted payloads round-trip.

### model-enrichment-backlog

✅ `normalization.py` now infers income type/stability, flags essential expenses, and detects debts based on heuristics. The new logic is covered by expanded `test_normalization.py` cases.

### ingestion-ledger-detection

✅ CSV/XLSX parsers emit `format_hints` describing ledger heuristics (debit/credit columns, cadence, line count). The ingestion response surfaces these hints to the UI and documentation now reflects the additional contract.

### integration-test-coverage

✅ `services/api-gateway/tests/test_gateway_smoke.py` uses a stubbed `ResilientHttpClient` to exercise `/upload-budget`, `/clarification-questions`, `/submit-answers`, and `/summary-and-suggestions` end-to-end without real services.

