# AI Integration Readiness

> **Status: Complete** — All integration items below have been implemented.
> This document now serves as a historical record of the ChatGPT integration work.
> For operational guidance, see `docs/operations.md` and `docs/real_world_validation.md`.

This document summarizes the current state of the ChatGPT integration, the guardrails in
place, and operational guidance for running with AI providers enabled.

## Current State

- **Deterministic pipeline** – `tests/test_deterministic_pipeline.py` snapshots the upload →
  clarification → summary loop so provider changes can be diffed safely.
- **Persistence + auditing** – The API gateway persists sessions plus audit trails via
  SQLAlchemy (`services/api-gateway/persistence`). Restarts no longer drop context.
- **Observability + guardrails** – OpenTelemetry tracing, rate limiting, and prompt/response
  hashing are documented in `docs/operations.md`. Every service emits structured logs with
  `request_id` correlation.
- **Provider abstraction** – `docs/llm_adapter.md` defines the Clarification/Suggestion provider
  contract. Deterministic, mock, and OpenAI implementations are all available.
- **UI alignment** – The Next.js UI (`services/ui-web`) is the single supported surface; the
  deprecated Streamlit app was removed to avoid skew between clients.

## ChatGPT Integration Status

### openai-clarification-provider

✅ `services/clarification-service/src/providers/openai_clarification.py` implements the
`ClarificationQuestionProvider` protocol using ChatGPT function calling. Features:
- Prompt construction from `UnifiedBudgetModel` gaps and user framework preference
- Structured outputs via OpenAI function calling with `QuestionSpec` JSON schema
- Automatic fallback to `DeterministicClarificationProvider` on API errors/timeouts
- Privacy-safe logging (prompt/response hashes via `observability/privacy.py`)
- Mocked tests in `services/clarification-service/tests/test_openai_clarification_provider.py`

### openai-suggestion-provider

✅ `services/optimization-service/src/providers/openai_suggestions.py` implements the
`SuggestionProvider` protocol using ChatGPT function calling. Features:
- Prompt includes clarified budget model, computed summary, and financial framework
- Structured outputs via function calling with `Suggestion` JSON schema
- Validation/sanitization of response fields (caps string lengths, validates impact values)
- Automatic fallback to `DeterministicSuggestionProvider` on errors
- Telemetry logging with hashed payloads
- Mocked tests in `services/optimization-service/tests/test_openai_suggestion_provider.py`

### openai-budget-normalization-provider

✅ `services/clarification-service/src/providers/openai_budget_normalization.py` implements
AI-powered budget normalization using ChatGPT function calling. Features:
- Analyzes raw budget data and classifies amounts as income/expense/debt
- Normalizes amounts: income → positive, expenses/debt → negative
- Handles any budget format (all positive, ledger, mixed conventions)
- Preserves original metadata and row indices for traceability
- Automatic fallback to `DeterministicBudgetNormalizationProvider` on errors
- Adds `ai_line_type` and `original_amount` metadata to normalized lines
- Configuration via `BUDGET_NORMALIZATION_PROVIDER` and related env vars

The normalization step runs before `draft_to_initial_unified()` in both `/normalize` and `/clarify` endpoints, ensuring the deterministic engine receives correctly-signed amounts regardless of the original format.

### secret-management

✅ Documented in `README.md` and `docs/operations.md`:
- `.env.example` shipped with placeholder values for `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_API_BASE`
- 1Password CLI workflow for local development
- GitHub Actions secret sync instructions
- Key rotation policy and guardrails

### provider-configuration

✅ All services honor environment-driven provider selection:
- `CLARIFICATION_PROVIDER=openai` / `SUGGESTION_PROVIDER=openai` / `BUDGET_NORMALIZATION_PROVIDER=openai` enables ChatGPT
- Fail-fast startup when OpenAI env vars are missing
- Tuning via `*_TIMEOUT_SECONDS`, `*_TEMPERATURE`, `*_MAX_TOKENS` env vars
- Budget normalization defaults to `openai` when configured, with deterministic fallback
- Documented in service READMEs and `docs/llm_adapter.md`

### gateway-provider-metadata

✅ API gateway includes `provider_metadata` in clarification and summary responses:
- `clarification_provider` / `suggestion_provider` (deterministic, mock, or openai)
- `ai_enabled` boolean flag
- UI displays "AI-generated via ChatGPT" badge and disclaimer when enabled

### ui-ai-disclaimers

✅ `SuggestionsList` component shows:
- "ChatGPT" badge when `suggestionProvider === 'openai'`
- Yellow disclaimer box explaining educational-only nature and limitations
- Clear statement that AI does not access bank accounts or make transactions

## Outstanding Work

### ai-answer-validation

✅ `services/api-gateway/src/answer_validation.py` now mirrors the clarification-service binding logic. `/submit-answers` rejects unknown field IDs, enforces scalar types, and records structured errors before any upstream call.

### ready-for-summary-contract

✅ The gateway propagates `ready_for_summary` through its response and stores the flag alongside audit metadata. `services/ui-web` consumes the flag in `ClarifyPage`, gating the summary step until the clarification service signals readiness.

### ai-answer-application

⚠️ **Partially complete** — Basic answer application works for simple field IDs (`essential_<expense_id>`, `optimization_focus`, `primary_income_type`, `<debt_id>_balance`, etc.). However, the following are **not yet implemented**:
- Binding-style/dot-path field IDs (e.g., `income.income-1.metadata.net_or_gross`)
- Automatic promotion of debt-like expenses to the debts array

Tests for binding-style payloads are currently skipped pending implementation:
- `test_apply_answers_handles_binding_style_payloads` in `test_normalization.py`
- `test_apply_answers_accepts_binding_style_fields` in `test_apply_answers_endpoint.py`

### model-enrichment-backlog

⚠️ **Partially complete** — The deterministic `draft_to_initial_unified()` function provides basic normalization:
- Positive amounts → Income (type="earned", stability="stable" as defaults)
- Negative amounts → Expenses (with `essential=None` for later clarification)

The following enrichment features are **not yet implemented** (marked with TODO comments in `normalization.py`):
- AI-based income classification (passive vs transfer income)
- AI-based essential expense detection (currently always `None`)
- AI-based debt detection from loan-like expense patterns (e.g., "Student Loan" → Debt)

Tests for these features are currently skipped pending implementation:
- `test_draft_to_initial_unified_splits_income_and_expenses` (expects `essential=True` auto-detection)
- `test_draft_to_initial_unified_detects_debt_candidates` (expects debt detection from category labels)

### ingestion-ledger-detection

✅ CSV/XLSX parsers emit `format_hints` describing ledger heuristics (debit/credit columns, cadence, line count). The ingestion response surfaces these hints to the UI and documentation now reflects the additional contract.

### integration-test-coverage

✅ `services/api-gateway/tests/test_gateway_smoke.py` uses a stubbed `ResilientHttpClient` to exercise `/upload-budget`, `/clarification-questions`, `/submit-answers`, and `/summary-and-suggestions` end-to-end without real services.

