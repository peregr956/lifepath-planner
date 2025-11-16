# API Contracts (MVP Placeholder)

Detailed API contracts will be finalized after the clarification, deterministic, and optimization layers stabilize. This document reserves the structure and headings for the following endpoints:

---

## 1. Upload and Parse Budget

- **Method:** `POST /api/v1/budgets/upload`
- **Purpose:** Accept CSV/XLSX file, detect format, and return draft structured model.
- **Request/Response:** _To be defined._

---

## 2. Clarification Questions

- **Method:** `POST /api/v1/budgets/{budget_id}/clarify`
- **Purpose:** Trigger AI clarification, returning 4–7 question descriptors.
- **Request/Response:** _To be defined._

---

## 3. Submit Clarification Answers

- **Method:** `POST /api/v1/budgets/{budget_id}/clarify/responses`
- **Purpose:** Persist structured answers and update the unified budget model.
- **Request/Response:** _To be defined._

---

## 4. Budget Summary

- **Method:** `GET /api/v1/budgets/{budget_id}/summary`
- **Purpose:** Return deterministic totals (income, expenses, surplus, category shares).
- **Request/Response:** _To be defined._

---

## 5. Optimization Suggestions

- **Method:** `GET /api/v1/budgets/{budget_id}/suggestions`
- **Purpose:** Return 3–6 actionable recommendations with impacts and tradeoffs.
- **Request/Response:** _To be defined._

---

## 6. Health and Metadata

- **Method:** `GET /api/v1/health`
- **Purpose:** Provide service health, versions, and build metadata.
- **Request/Response:** _To be defined._

---

Further details (payload schemas, error codes, authentication) will be added once service integrations are implemented. This placeholder ensures consistent structure for future documentation passes.