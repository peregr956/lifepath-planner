# Legacy Service Deprecation Checklist

This checklist is used to verify that all functionality from the legacy Python microservices has been successfully migrated to the unified Vercel serverless architecture (`services/ui-web`) before decommissioning the Python services.

## Service Migration Status

| Service | Status | Migrated To |
|---------|--------|-------------|
| `api-gateway` | ✅ Migrated | `services/ui-web/src/app/api` |
| `budget-ingestion-service` | ✅ Migrated | `services/ui-web/src/lib/parsers.ts` |
| `clarification-service` | ✅ Migrated | `services/ui-web/src/lib/normalization.ts`, `ai.ts`, `aiEnrichment.ts` |
| `optimization-service` | ✅ Migrated | `services/ui-web/src/lib/ai.ts` |
| `shared` | ✅ Migrated | `services/ui-web/src/lib/providerSettings.ts`, `privacy.ts` |

---

## Detailed Verification

### 1. API Gateway & Routing
- [x] **Upload Budget**: `POST /api/upload-budget` replaces legacy ingestion flow.
- [x] **Clarification Questions**: `GET /api/clarification-questions` replaces clarification service endpoint.
- [x] **Submit Answers**: `POST /api/submit-answers` replaces answer application logic.
- [x] **Summary & Suggestions**: `GET /api/summary-and-suggestions` replaces optimization service.
- [x] **Health Checks**: `/api/health` implemented.
- [x] **Diagnostics**: `/api/diagnostics/env` provides visibility into serverless config.
- [x] **Answer Validation**: `normalization.ts` and `ai.ts` validate field IDs as `answer_validation.py` did.

### 2. Budget Ingestion
- [x] **CSV Parsing**: `parsers.ts` implements logic from `csv_parser.py`.
- [x] **XLSX Parsing**: `parsers.ts` implements logic from `xlsx_parser.py`.
- [x] **Format Detection**: `parsers.ts` implements ledger vs categorical detection from `format_detection.py`.
- [x] **Raw Models**: TypeScript interfaces in `parsers.ts` match `raw_budget.py`.

### 3. Clarification & Normalization
- [x] **Deterministic Normalization**: `normalization.ts` matches logic from `normalization.py`.
- [x] **Binding-Style Field IDs**: `normalization.ts` supports dot-path field IDs.
- [x] **AI Question Generation**: `ai.ts` implements logic from `question_generator.py` and `openai_clarification.py`.
- [x] **UI Schema Building**: `ClarificationForm.tsx` and `ai.ts` handle dynamic UI schema from `ui_schema_builder.py`.

### 4. AI Enrichment (Phase 6)
- [x] **Income Classification**: `aiEnrichment.ts` detects earned vs passive vs transfer.
- [x] **Essential Expense Detection**: `aiEnrichment.ts` predicts essentiality.
- [x] **Debt Detection**: `aiEnrichment.ts` extracts debts from expense patterns.
- [x] **Income Stability**: `aiEnrichment.ts` infers stability.

### 5. Optimization & Suggestions
- [x] **Summary Computation**: `budgetModel.ts` and `normalization.ts` compute totals/surplus as `compute_summary.py` did.
- [x] **Heuristic Suggestions**: `ai.ts` (deterministic fallback) implements basic rules from `heuristics.py`.
- [x] **AI Suggestions**: `ai.ts` implements logic from `openai_suggestions.py`.

### 6. Persistence & Audit
- [x] **Session Storage**: `db.ts` and Vercel Postgres replace SQLAlchemy/SQLite `persistence/`.
- [x] **Audit Logging**: `recordAuditEvent` in `db.ts` replaces `AuditEvent` models.
- [x] **Cold Start Persistence**: Verified via `scripts/test-persistence.sh`.

### 7. Shared Utilities
- [x] **Provider Settings**: `providerSettings.ts` ports logic from `provider_settings.py`.
- [x] **Privacy/Hashing**: `privacy.ts` ports logic from `privacy.py`.
- [ ] **Telemetry**: Determined unnecessary for serverless; Vercel provides built-in observability.

---

## Final Sign-off

- [ ] Functional tests pass on Vercel deployment.
- [ ] E2E tests (`services/ui-web/e2e`) pass.
- [ ] AI features verified in production.
- [ ] Postgres data persistence verified.

Once all items are checked, proceed to `docs/legacy-service-removal-plan.md`.

