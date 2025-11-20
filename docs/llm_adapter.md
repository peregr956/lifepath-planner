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

Set the provider env var to `deterministic` (current heuristics) or `mock`
(fixture-backed responses). Additional provider names can be registered by
extending the factory functions inside each `*_provider.py` module.

When using the `mock` provider, the fixture env var can optionally point to a
custom JSON document that adheres to the response schema above. If unset, the
services fall back to the canned fixtures checked into `services/*/tests/fixtures`.

Invalid provider names cause the API to emit a `500` response that explains which
value was unsupported.

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

