# Clarification Service

The clarification service normalizes draft budgets, emits follow-up questions, and merges the user's structured answers back into the unified budget model that downstream services consume.

## AI Budget Normalization

The service performs two-stage normalization on uploaded budgets:

1. **AI Normalization** - ChatGPT analyzes the raw budget data and correctly classifies amounts as income (positive) or expenses (negative), regardless of the original format.
2. **Deterministic Normalization** - Converts the normalized draft into the structured `UnifiedBudgetModel`.

This allows the system to handle any budget format:
- Budgets with all positive numbers (e.g., expense amounts shown as positive values)
- Ledger-style formats with separate debit/credit columns
- Mixed formats where income and expenses use different sign conventions
- Any non-standard format that users might upload

### How it works

When a budget is uploaded, the AI provider:
1. Analyzes the category labels and descriptions to determine if each line is income, expense, debt payment, savings, or transfer
2. Normalizes amounts so income is positive and expenses/debt are negative
3. Preserves all original metadata and row indices for traceability
4. Falls back to deterministic (passthrough) behavior if AI is unavailable

### Normalization metadata

After AI normalization, each budget line includes metadata:
- `ai_line_type`: The classification assigned by AI (`income`, `expense`, `debt_payment`, `savings`, `transfer`)
- `original_amount`: The original amount before normalization

The `format_hints` on the draft budget includes:
- `ai_normalized`: Boolean indicating AI normalization was applied
- `ai_income_count`, `ai_expense_count`, `ai_debt_count`: Counts of each type detected

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

### Clarification Provider

- `CLARIFICATION_PROVIDER` controls which implementation generates questions.
  - `deterministic` (default) wraps the existing heuristics.
  - `mock` replays `tests/fixtures/mock_clarification_provider.json`.
  - `openai` uses ChatGPT to generate context-aware questions.
- `CLARIFICATION_PROVIDER_TIMEOUT_SECONDS` (default: `10`) tunes outbound
  request timeouts for external providers.
- `CLARIFICATION_PROVIDER_TEMPERATURE` (default: `0.2`) controls generation
  randomness for providers that support it.
- `CLARIFICATION_PROVIDER_MAX_TOKENS` (default: `512`) caps LLM responses to
  guard against runaway completions.
- `CLARIFICATION_PROVIDER_FIXTURE` (optional) overrides the mock fixture path.

### Budget Normalization Provider

- `BUDGET_NORMALIZATION_PROVIDER` controls which implementation normalizes budget amounts.
  - `openai` (default when OpenAI is configured) uses ChatGPT to analyze and normalize amounts.
  - `deterministic` passes through amounts unchanged (fallback behavior).
- `BUDGET_NORMALIZATION_TIMEOUT` (default: `30`) timeout in seconds for normalization requests.
- `BUDGET_NORMALIZATION_TEMPERATURE` (default: `0.1`) low temperature for consistent normalization.
- `BUDGET_NORMALIZATION_MAX_TOKENS` (default: `2048`) larger limit to handle full budget data.

### Shared OpenAI Configuration

When either provider is set to `openai`, the following environment variables must be set:
- `OPENAI_API_KEY` - Your OpenAI API key
- `OPENAI_MODEL` - Model to use (e.g., `gpt-4`, `gpt-3.5-turbo`)
- `OPENAI_API_BASE` - API base URL (e.g., `https://api.openai.com/v1`)

If OpenAI is not configured, both providers fall back to deterministic behavior.

See `docs/llm_adapter.md` for the full provider contract and extension
guidelines.
