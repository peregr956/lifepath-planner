# LifePath Planner Implementation Roadmap (MVP)

This roadmap outlines the phased delivery plan for the LifePath Planner MVP, ensuring that ingestion, clarification, computation, and optimization layers are delivered in a coordinated sequence.

---

## Current Status (Pre-AI Integration Complete)

- Deterministic clarification UI schema, persistence, retry logic, telemetry, and rate limiting landed (see `docs/archive/pre_integration_prompts.md` for the execution history).
- LLM adapter boundary and operational guardrails are documented in `docs/llm_adapter.md` and `docs/operations.md`.
- Deterministic pipeline snapshots (`tests/test_deterministic_pipeline.py`) provide regression coverage before ChatGPT integration.
- The legacy Streamlit UI has been removed; Next.js (`services/ui-web`) is the canonical client going forward.
- Repository structure has been cleaned up: `sys.path` manipulation removed, proper package imports via `conftest.py` files, and `pyproject.toml` configuration for IDE support.
- Test coverage audit completed (December 2024) — gaps documented in Phase 6 below.
- **CI/CD pipeline implemented** (December 2024) — GitHub Actions workflow with linting (ruff, pyright, ESLint, Prettier), Python 3.11+ test matrix, and deterministic pipeline validation. See `docs/development.md` for local commands and `.github/workflows/ci.yml` for the workflow definition.

The remaining work before wiring ChatGPT is limited to the forthcoming AI integration epic.

---

## Phase 0 — Foundation (Week 1) ✓ Complete

- [x] Finalize product scope, schemas, and specifications (`PRD.md`, `budget_schema.md`, `ai_questioning_spec.md`, `ui_components_spec.md`).
- [x] Establish repository structure, service boundaries, and development environments.
- [x] Set up CI, linting, and shared testing utilities.

**Deliverables**

- [x] Documented architecture diagram and service readmes.
- [x] Initial CI pipeline with lint and test stages (`.github/workflows/ci.yml`).

---

## Phase 1 — File Ingestion and Interpretation (Weeks 2–3)

- Implement CSV/XLSX upload endpoint in the API gateway.
- Build parsers for categorical budgets and ledger-style budgets in the ingestion service.
- Produce draft structured budget models aligned with `budget_schema.md`.
- Handle error states for unsupported formats.

**Milestones**

- Upload API returns parsed model preview.
- Unit tests for parser coverage on representative files.

---

## Phase 2 — Clarification Layer and Dynamic UI (Weeks 3–4)

- Implement question generation logic in the clarification service using the AI questioning specification.
- Output UI component descriptors defined in `ui_components_spec.md`.
- Build frontend dynamic form renderer to display 4–7 questions per round.
- Persist clarified responses and merge them into the draft model.

**Milestones**

- End-to-end flow from upload → questions → revised model in staging environment.
- Frontend/UI QA sign-off on dynamic components.

---

## Phase 3 — Deterministic Budget Engine (Week 5)

- Implement deterministic computations (totals, surplus, category shares) in the optimization service.
- Generate structured summaries for display and for the optimization engine.
- Validate calculations against sample budgets.

**Milestones**

- API endpoint returning summary metrics for clarified budgets.
- Regression tests comparing expected totals against fixture data.

---

## Phase 4 — Optimization Engine and Suggestions (Weeks 6–7)

- Implement heuristic-based suggestion generator per MVP requirements.
- Ensure suggestions reference clarification inputs (debt priorities, essentials).
- Return 3–6 actionable recommendations with impact estimates.

**Milestones**

- Optimization API returns structured suggestions for demo scenarios.
- Internal review of suggestion quality and tone.

---

## Phase 5 — Integration, QA, and Launch Prep (Weeks 8–9)

- Conduct integration tests across services (upload → clarification → summary → suggestions).
- Harden error handling, logging, and observability.
- Prepare launch collateral: onboarding walkthrough, support docs, and demo script.
- Keep `docs/operations.md` updated with telemetry toggles, rate limits, and logging guardrails.

**Milestones**

- Beta candidate build deployed to staging.
- User acceptance testing feedback incorporated.

---

## Phase 6 — Test Coverage Expansion

The following modules have been identified as lacking dedicated test coverage. Addressing these will improve reliability and regression safety.

### High Priority (Core Business Logic)

| Module | Service | Description |
|--------|---------|-------------|
| `heuristics.py` | optimization-service | Financial rules that drive suggestions (debt ratios, savings targets, emergency fund thresholds) |
| `generate_suggestions.py` | optimization-service | Core suggestion generation and ranking logic |
| `format_detection.py` | budget-ingestion-service | Ledger vs categorical budget detection heuristics |
| `query_analyzer.py` | clarification-service | User query intent analysis for personalization |
| `adaptive_questioning.py` | clarification-service | Adaptive question flow and follow-up logic |

### Medium Priority (Stability & Reliability)

| Module | Service | Description |
|--------|---------|-------------|
| `provider_settings.py` | shared | Provider configuration loading and validation |
| `observability/privacy.py` | shared | `hash_payload` and `redact_fields` privacy utilities |
| `answer_validation.py` | api-gateway | Input validation for answer field IDs |
| `budget_normalization.py` | clarification-service | AI-enhanced normalization orchestration |

### Lower Priority (Infrastructure & Endpoints)

| Module | Service | Description |
|--------|---------|-------------|
| `main.py` endpoints | budget-ingestion-service | `/health` and `/ingest` endpoint smoke tests |
| `main.py` endpoints | optimization-service | `/health`, `/summarize`, `/optimize` endpoint tests |
| `observability/telemetry.py` | shared | OpenTelemetry setup and request context binding |
| `routes/budget.py` | api-gateway | Budget routing module |

### Integration & E2E Gaps

| Coverage Type | Status | Description |
|---------------|--------|-------------|
| Multi-service HTTP tests | Missing | Tests that call between running services via HTTP |
| Error propagation tests | Missing | Verify error handling across service boundaries |
| Rate limiting integration | Partial | End-to-end rate limit behavior validation |

**Acceptance Criteria**

- Each high-priority module has ≥80% line coverage.
- Medium-priority modules have at least happy-path and primary error-case tests.
- Integration test suite can run against local Docker Compose stack.

---

## Phase 7 — Post-MVP Enhancements (Ongoing)

- Collect user feedback and prioritize:
  - Multi-year projections.
  - Real estate modeling.
  - FIRE planning modules.
  - Expanded UI components and conditional logic.
- Instrument usage analytics to inform roadmap.

**Milestones**

- Post-launch backlog groomed with user insights.
- Quarterly roadmap update reflecting adoption metrics.