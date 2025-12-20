# LLM Adapter Boundary

Step 6 introduces a thin adapter between the deterministic heuristics that
already ship with the product and future LLM-based implementations. The goal is
to keep question/suggestion generation swappable by configuration instead of
requiring bespoke code paths for each model.

Each service now exposes a provider interface with a JSON-friendly
request/response contract plus environment variables that pick which provider to
instantiate on startup.

## Clarification Provider Contract

- **Request (`ClarificationProviderRequest`)**
  - `model` — unified budget model that still contains gaps (expenses with
    `essential=None`, unknown optimization focus, etc.).
  - `max_questions` — limit enforced by the service (defaults to 5).
  - `context` — optional metadata bag (locale, UI surface, experiment flags).
- **Response (`ClarificationProviderResponse`)**
  - `questions` — ordered array of `QuestionSpec` objects (same shape used by the
    existing `/clarify` and `/normalize` endpoints).

Example response payload:

```
{
  "questions": [
    {
      "question_id": "question_essential_expenses",
      "prompt": "Which of these categories are essential for your basic needs?",
      "components": [
        {
          "component": "toggle",
          "field_id": "essential_expense-draft-1-1",
          "label": "Mark Housing as essential",
          "binding": "expenses.expense-draft-1-1.essential"
        }
      ]
    }
  ]
}
```

## Suggestion Provider Contract

- **Request (`SuggestionProviderRequest`)**
  - `model` — clarified `UnifiedBudgetModel`.
  - `summary` — pre-computed `Summary` derived from the same model instance.
  - `context` — optional metadata (audience, marketing experiments, etc.).
- **Response (`SuggestionProviderResponse`)**
  - `suggestions` — ordered list of `Suggestion` dataclasses (ID, title,
    description, expected impact, rationale, tradeoffs).

Example response payload:

```
{
  "suggestions": [
    {
      "id": "debt-credit_card",
      "title": "Redirect surplus toward Credit Card",
      "description": "Apply roughly $200 of this month's surplus as an extra payment.",
      "expected_monthly_impact": 200.0,
      "rationale": "High interest rate makes this debt costly.",
      "tradeoffs": "Reduces cash available for other short-term goals."
    }
  ]
}
```

## Provider Selection and Configuration

| Service                  | Provider env var            | Fixture override env var                 | Defaults                           |
| ------------------------ | --------------------------- | ---------------------------------------- | ----------------------------------- |
| Clarification Service    | `CLARIFICATION_PROVIDER`    | `CLARIFICATION_PROVIDER_FIXTURE`         | `deterministic`, fixture in `tests` |
| Optimization Service     | `SUGGESTION_PROVIDER`       | `SUGGESTION_PROVIDER_FIXTURE`            | `deterministic`, fixture in `tests` |

Set the provider env var to `deterministic` (current heuristics), `mock`
(fixture-backed responses), or `openai` (ChatGPT-powered generation).
Additional provider names can be registered by extending the factory functions
inside each `*_provider.py` module.

When using the `mock` provider, the fixture env var can optionally point to a
custom JSON document that adheres to the response schema above. If unset, the
services fall back to the canned fixtures checked into `services/*/tests/fixtures`.

Both services also support the shared tuning knobs
`*_PROVIDER_TIMEOUT_SECONDS`, `*_PROVIDER_TEMPERATURE`, and
`*_PROVIDER_MAX_TOKENS` (defaults: 10 seconds, 0.2 temperature, 512 tokens).

Invalid provider names cause the API to emit a `500` response that explains which
value was unsupported. Selecting `openai` requires the global env vars
`OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_API_BASE`; services fail fast
if any of those are missing.

## OpenAI Provider Implementation

### Clarification Provider (`openai`)

Located at `services/clarification-service/src/providers/openai_clarification.py`:

- **Prompt design**: System prompt establishes the assistant's role as a financial planning helper. User prompt includes the full budget model summary, income/expense/debt breakdowns, and the user's chosen financial framework (r/personalfinance, Money Guy, or neutral).
- **Structured outputs**: Uses OpenAI function calling with a JSON schema matching `QuestionSpec` to ensure machine-readable responses.
- **Validation**: Parses responses and validates required fields (`question_id`, `prompt`, `components` with `component`, `field_id`, `label`, `binding`). Skips malformed questions gracefully.
- **Fallback**: On any OpenAI error (timeout, rate limit, invalid JSON), automatically falls back to `DeterministicClarificationProvider`.
- **Logging**: Hashes prompts and responses via `observability/privacy.py`; never logs raw budget data.

### Suggestion Provider (`openai`)

Located at `services/optimization-service/src/providers/openai_suggestions.py`:

- **Prompt design**: System prompt positions the assistant as a personal finance advisor. User prompt includes the clarified budget model, computed summary, debt profile, and the user's optimization focus and financial framework.
- **Structured outputs**: Uses OpenAI function calling with a JSON schema matching `Suggestion` to ensure structured, actionable recommendations.
- **Validation**: Validates all required fields, sanitizes string lengths (title: 100 chars, description/rationale/tradeoffs: 500 chars), and coerces impact values to floats.
- **Fallback**: On any OpenAI error, automatically falls back to `DeterministicSuggestionProvider`.
- **Logging**: Hashes all payloads before logging; logs provider name, question/suggestion counts, and response hashes.

### Financial Framework Support

Both providers accept a `framework` key in the request context:

| Framework | Description |
| --- | --- |
| `r_personalfinance` | Follows the subreddit flowchart: emergency fund → employer match → high-interest debt → tax-advantaged accounts |
| `money_guy` | Follows the Money Guy Show Financial Order of Operations with granular step sequencing |
| `neutral` | General best practices without framework-specific ordering |

The framework influences both the questions asked and the priority ordering of suggestions.

## Implementing a New Provider

1. Implement the corresponding Protocol (`ClarificationQuestionProvider` or
   `SuggestionProvider`) by creating a class with a descriptive `name` and a
   `generate(request)` method.
2. Register the provider in `build_clarification_provider` or
   `build_suggestion_provider`.
3. Document any extra configuration in the relevant service README.
4. Add integration tests that set the provider env var and validate the response
   payload.
5. (Optional) provide a mock fixture so the new provider can be exercised without
   the real backend model.

