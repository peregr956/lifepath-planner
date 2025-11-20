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

- Location: `services/api-gateway/src/main.py` (`/submit-answers` handler).
- Implement structural validation for `answers` payloads (types, allowed field IDs) before proxying
  to clarification service.
- Enrich error reporting/logging so upstream failures surface actionable context to clients.

### ready-for-summary-contract

- Location: `services/api-gateway/src/main.py`.
- Clarification service already returns `ready_for_summary`; expose that flag to the UI by expanding
  the gateway response once the contract is finalized.

### ai-answer-application

- Locations: `services/clarification-service/src/main.py`, `src/normalization.py`,
  `tests/test_normalization.py`.
- Expand `_validate_answer_field_ids`/`apply_answers_to_model` with richer mappings (nested debt
  metadata, future AI-specific field IDs) and add fixtures that cover AI-provided answer shapes.
- Introduce automatic debt extraction from expense lines so the clarification step can promote
  loan-like entries before the LLM runs.

### model-enrichment-backlog

- Locations: `services/clarification-service/src/normalization.py`, `tests/test_normalization.py`.
- Add heuristics or AI hooks for:
  - Income classification (earned vs passive vs transfer).
  - Income stability inference from historical cadence.
  - Essential vs flexible expense prediction.
  - Debt detection during ingestion/normalization (promoting recurring payments to debt objects).
- When implemented, update the associated tests and remove the deterministic placeholders.

### ingestion-ledger-detection

- Locations: `services/budget-ingestion-service/src/parsers/csv_parser.py` and
  `src/parsers/xlsx_parser.py`.
- Detect whether uploads are ledger-style vs categorical and emit that signal upstream so the
  clarification provider can tailor questions appropriately.

### integration-test-coverage

- Location: `services/api-gateway/tests/test_gateway_smoke.py`.
- Replace the skipped placeholder tests with real gateway-to-service integration tests (or mocked
  HTTPX calls) so `/upload-budget`, `/clarification-questions`, `/submit-answers`, and
  `/summary-and-suggestions` are exercised in CI.
- These tests should run against either the deterministic providers or the mock fixtures described
  in `docs/llm_adapter.md`.

