# API Contracts (MVP Draft)

This document describes the HTTP JSON contracts for the **Vercel serverless API**.

For the MVP, contracts are intentionally simple and focused on a single budget “session” at a time. All examples assume JSON over HTTP, with the same-origin API routes (`/api/*`) as the entrypoint used by the frontend.

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

## 5. Implementation Notes

The Vercel serverless architecture combines the functionality of several previously separate services into a single Next.js application:

- **Ingestion:** File parsing and format detection.
- **Clarification:** AI-powered question generation and normalization.
- **Optimization:** Deterministic summaries and AI suggestions.

All these capabilities are exposed through the public `/api/*` routes.

---

## 6. Assumptions and Simplifications for MVP

- Authentication and user accounts are out of scope. A simple `budget_id` is sufficient to identify a budget session.
- All amounts are modeled as monthly values in the MVP.
- All APIs use JSON responses for non-file data.
- Error handling should be explicit and descriptive but not overly complex.
- The same-origin `/api/*` routes are the only public endpoints.

## 7. Provider Configuration Settings

The Vercel serverless functions support selecting and tuning AI providers through environment variables.

Supported provider values are `deterministic` and `openai`. Selecting `openai` requires the Vercel environment variables `OPENAI_API_KEY`, `OPENAI_MODEL` (optional), and `OPENAI_API_BASE` (optional).

Budget normalization gracefully falls back to deterministic (passthrough) if OpenAI is not configured, ensuring the pipeline continues to work with budgets that already use correct sign conventions.