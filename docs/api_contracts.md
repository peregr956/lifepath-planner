# API Contracts (MVP Draft)

This document describes the HTTP JSON contracts between the frontend (`ui-web`), the API gateway, and the backend services:

- `budget-ingestion-service`
- `clarification-service`
- `optimization-service`

For the MVP, contracts are intentionally simple and focused on a single budget “session” at a time. All examples assume JSON over HTTP, with the API gateway as the only entrypoint used by the frontend.

---

## 1. POST `/upload-budget`

**Purpose:** Accept a user’s budget file (CSV or XLSX), pass it to the ingestion service, and return a budget identifier plus basic metadata.

- **Method:** `POST`
- **Path:** `/upload-budget`
- **Content type:** `multipart/form-data`
- **Fields:**
  - `file`: CSV or XLSX budget file

**Response — success**

- **Status:** `200`
- **Body fields:**
  - `budget_id` (string): unique identifier for this uploaded budget.
  - `status` (string): e.g., `"parsed"`.
  - `detected_format` (string): e.g., `"categorical"` or `"ledger"`.
  - `summary_preview` (object, optional):
    - `detected_income_lines` (number)
    - `detected_expense_lines` (number)

**Example**

```json
{
  "budget_id": "bud_12345",
  "status": "parsed",
  "detected_format": "categorical",
  "summary_preview": {
    "detected_income_lines": 1,
    "detected_expense_lines": 18
  }
}
```

**Response — error**

- **Status:** `400` or `415`
- **Body fields:**
  - `error` (string): short description.
  - `details` (string, optional): additional info.

---

## 2. GET `/clarification-questions`

**Purpose:** Ask the clarification service what additional information is needed for a given budget and return both questions and UI component descriptors.

- **Method:** `GET`
- **Path:** `/clarification-questions`
- **Query parameters:**
  - `budget_id` (string): identifier from `/upload-budget`.

**Response — success**

- **Status:** `200`
- **Body fields:**
  - `budget_id` (string)
  - `questions` (list of question objects)
  - `provider_metadata` (object, optional): indicates which provider generated the questions
    - `clarification_provider` (string): `deterministic`, `mock`, or `openai`
    - `suggestion_provider` (string): `deterministic`, `mock`, or `openai`
    - `ai_enabled` (boolean): `true` if either provider is `openai`

Each question object includes:

- `question_id` (string)
- `prompt` (string): text of the question.
- `components` (list): UI component descriptors as per `ui_components_spec.md`.

**Example question**

```json
{
  "question_id": "q_debt_personal_loan",
  "prompt": "What is the balance and interest rate on your personal loan?",
  "components": [
    {
      "field_id": "personal_loan_balance",
      "component": "number_input",
      "label": "Personal loan balance",
      "min": 0,
      "unit": "USD"
    },
    {
      "field_id": "personal_loan_interest_rate",
      "component": "number_input",
      "label": "Personal loan interest rate",
      "min": 0,
      "max": 50,
      "unit": "%"
    }
  ]
}
```

**Response — no questions needed**

- **Status:** `200`
- **Body:**
  - `budget_id`
  - `questions`: empty list

This indicates that ingestion/interpretation already produced a sufficiently complete model.

**Response — error**

- **Status:** `400` or `404`
- **Body:**
  - `error` (string)
  - `details` (optional)

---

## 3. POST `/submit-answers`

**Purpose:** Receive user answers to clarification questions, pass them to the clarification and optimization services, and store or update the normalized budget model.

- **Method:** `POST`
- **Path:** `/submit-answers`
- **Content type:** `application/json`
- **Body fields:**
  - `budget_id` (string)
  - `answers` (object mapping `field_id`s to values)

**Example request**

```json
{
  "budget_id": "bud_12345",
  "answers": {
    "personal_loan_balance": 7400,
    "personal_loan_interest_rate": 10.2,
    "personal_loan_min_payment": 310,
    "personal_loan_priority": "high",
    "salary_type": "net",
    "salary_stability": "stable",
    "groceries_essential": true,
    "optimization_focus": "balanced"
  }
}
```

**Response — success**

- **Status:** `200`
- **Body fields:**
  - `budget_id` (string)
  - `status` (string): e.g., `"clarified"` or `"ready_for_summary"`
  - `normalized_budget_preview` (object, optional): high-level confirmation such as total income and expenses.

**Response — error**

- **Status:** `400`
- **Body:**
  - `error` (string)
  - `details` (optional)

---

## 4. GET `/summary-and-suggestions`

**Purpose:** Compute and return the deterministic summary plus optimization suggestions for a given budget.

- **Method:** `GET`
- **Path:** `/summary-and-suggestions`
- **Query parameters:**
  - `budget_id` (string)

**Response — success**

- **Status:** `200`
- **Body fields:**
  - `budget_id` (string)
  - `summary` (object)
  - `suggestions` (list)
  - `provider_metadata` (object, optional): indicates which provider generated the suggestions
    - `clarification_provider` (string): `deterministic`, `mock`, or `openai`
    - `suggestion_provider` (string): `deterministic`, `mock`, or `openai`
    - `ai_enabled` (boolean): `true` if either provider is `openai`

Summary object shape:

- `total_income` (number)
- `total_expenses` (number)
- `surplus` (number)
- `category_shares` (object mapping category to percentage, optional)

**Example summary**

```json
{
  "summary": {
    "total_income": 7200,
    "total_expenses": 6660,
    "surplus": 540,
    "category_shares": {
      "Housing": 0.27,
      "Groceries": 0.08,
      "Transportation": 0.06
    }
  }
}
```

Suggestions list — each suggestion contains:

- `id` (string)
- `title` (string) — short label
- `description` (string) — explanation
- `expected_monthly_impact` (number; positive means more free cash)
- `rationale` (string) — why this makes sense
- `tradeoffs` (string) — what the user gives up or changes

**Example suggestion**

```json
{
  "id": "reduce_subscriptions",
  "title": "Trim overlapping subscriptions",
  "description": "You currently spend about 112 dollars per month on subscriptions. Canceling or downgrading a few could free 30 to 50 dollars per month.",
  "expected_monthly_impact": 40,
  "rationale": "Subscriptions are flexible and relatively low-impact to reduce.",
  "tradeoffs": "You may lose access to some services or content."
}
```

**Response — error**

- **Status:** `400` or `404`
- **Body:**
  - `error` (string)
  - `details` (optional)

---

## 5. Internal Service Contracts (High-Level)

The API gateway will call internal services over HTTP or an internal interface. At MVP, these can mirror the gateway contracts, but with some simplifications.

### A. `budget-ingestion-service`

- **Endpoint:** e.g., `POST /ingest`
- **Input:** file data or pre-parsed tabular representation.
- **Output:**
  - Draft budget model (income, expenses, possible debts).
  - Detected format.
  - Any ambiguity flags.

### B. `clarification-service`

- **Endpoint:** e.g., `POST /clarify`
- **Input:** draft or partially completed budget model.
- **Output:** questions list + component descriptors.

Optional second endpoint:

- **Endpoint:** `POST /apply-answers`
- **Input:** budget model + answers.
- **Output:** updated unified budget model.

### C. `optimization-service`

- **Endpoint:** `POST /summarize-and-optimize`
- **Input:** unified budget model.
- **Output:** summary object + suggestions array.

Internal contracts can evolve, but they should remain consistent with:

- The unified budget model in `budget_schema.md`.
- The UI component specification in `ui_components_spec.md`.

---

## 6. Assumptions and Simplifications for MVP

- Authentication and user accounts are out of scope. A simple `budget_id` is sufficient to identify a budget session.
- All amounts are modeled as monthly values in the MVP.
- All APIs use JSON responses for non-file data.
- Error handling should be explicit and descriptive but not overly complex.
- The gateway is the only public API. Direct calls to underlying services are internal.

## 7. Provider Configuration Settings

Clarification and optimization now ship the same knobs for selecting and tuning AI providers. Each service reads the provider choice plus timeout, temperature, and token limits on startup so misconfiguration is caught before the first request.

| Service               | Provider env var           | Timeout env var                                | Temperature env var                               | Max token env var                                 |
| --------------------- | -------------------------- | ---------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| Clarification Service | `CLARIFICATION_PROVIDER`   | `CLARIFICATION_PROVIDER_TIMEOUT_SECONDS`       | `CLARIFICATION_PROVIDER_TEMPERATURE`              | `CLARIFICATION_PROVIDER_MAX_TOKENS`              |
| Optimization Service  | `SUGGESTION_PROVIDER`      | `SUGGESTION_PROVIDER_TIMEOUT_SECONDS`          | `SUGGESTION_PROVIDER_TEMPERATURE`                 | `SUGGESTION_PROVIDER_MAX_TOKENS`                 |

Defaults:

- Provider: `deterministic`
- Timeout: `10` seconds
- Temperature: `0.2`
- Max output tokens: `512`

Supported provider values are `deterministic`, `mock`, and `openai`. Selecting `openai` reserves the upcoming LLM adapter slot and now requires the shared environment variables `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_API_BASE`. Both services terminate during startup if any of those values are missing so deployments can catch misconfigurations early.