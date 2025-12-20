# Clarification Service

The clarification service normalizes draft budgets, emits follow-up questions, and merges the user’s structured answers back into the unified budget model that downstream services consume.

## `/apply-answers` contract

Endpoint: `POST /apply-answers`

Payload:

- `partial_model`: serialized `UnifiedBudgetModel` returned by `/clarify`.
- `answers`: map whose keys are clarification `field_id`s and values are the corresponding responses.

Response:

- `updated_model`: refreshed unified model after applying the answers.
- `ready_for_summary`: boolean flag indicating the model can move to summarization.

### Accepted `field_id`s

The service validates every `field_id` before mutating the model. Requests that include unsupported IDs receive `400` responses with the shape:

```json
{
  "error": "invalid_field_ids",
  "invalid_fields": [
    {
      "field_id": "mystery_field",
      "reason": "unsupported_field_id",
      "detail": "No known mapping exists for this field_id."
    }
  ]
}
```

Supported keys:

- `essential_{expense_id}` — toggles the `essential` flag for a known expense entry.
- `optimization_focus` — must be one of `debt`, `savings`, or `balanced`.
- `primary_income_type` — stores whether the highest income is `net` or `gross`.
- `primary_income_stability` — accepts `stable`, `variable`, or `seasonal`.
- Debt bindings follow `"{debt_id}_{attribute}"` where `{attribute}` is one of:
  - `balance`
  - `interest_rate`
  - `min_payment`
  - `priority` (`high`, `medium`, or `low`)
  - `approximate` (boolean)
  - `rate_change_date`
  - `rate_change_new_rate`

Debt bindings require a matching debt entry in the partial model. When both `rate_change_date` and `rate_change_new_rate` are supplied, the service records a pending rate change on that debt.

### Tests

Run the clarification service suite, which now includes regression tests for `/apply-answers` validation plus debt/income mappings, with:

```bash
cd services/clarification-service && pytest tests
```

## Provider configuration

- `CLARIFICATION_PROVIDER` controls which implementation generates questions.
  - `deterministic` (default) wraps the existing heuristics.
  - `mock` replays `tests/fixtures/mock_clarification_provider.json`.
  - `openai` reserves the slot for the upcoming LLM adapter. The API currently
    returns `501` until the Stage 3 provider lands, but the environment variable
    plumbing is in place so deployments can validate configuration early.
- `CLARIFICATION_PROVIDER_TIMEOUT_SECONDS` (default: `10`) tunes outbound
  request timeouts for external providers.
- `CLARIFICATION_PROVIDER_TEMPERATURE` (default: `0.2`) controls generation
  randomness for providers that support it.
- `CLARIFICATION_PROVIDER_MAX_TOKENS` (default: `512`) caps LLM responses to
  guard against runaway completions.
- `CLARIFICATION_PROVIDER_FIXTURE` (optional) overrides the mock fixture path.
- When `CLARIFICATION_PROVIDER=openai`, the service now fails fast unless the
  shared OpenAI env vars are present:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - `OPENAI_API_BASE`

See `docs/llm_adapter.md` for the full provider contract and extension
guidelines.
