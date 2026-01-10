# LifePath Planner Implementation Roadmap

This roadmap outlines the complete delivery plan for LifePath Planner, from the initial MVP through its evolution into a comprehensive financial planning platform. The document is organized into four parts: completed MVP work, current in-progress items, platform expansion phases, and supporting information.

> **Important:** This roadmap was restructured in January 2026 based on the [Competitive Audit](competitive_audit.md), [Differentiation Analysis](differentiation_analysis.md), and [Current State Reality Assessment](current_state_reality_assessment.md). Phase priorities have been reordered to address critical gaps first.

---

## Strategic Vision

LifePath Planner is evolving from a budget optimization tool into a **comprehensive financial planning platform** that provides unique value beyond ChatGPT and other LLM-based tools.

### The Problem We Solve

Most features of the current MVP can be replicated by a knowledgeable user with ChatGPT (see `docs/differentiation_analysis.md`). To justify a standalone product, LifePath must offer capabilities that **ChatGPT fundamentally cannot provide**:

1. **Persistent state** — Track budgets over time
2. **Complex modeling** — Multi-year projections ChatGPT cannot reliably compute
3. **Goal tracking** — Monitor progress toward objectives
4. **Scenario analysis** — Compare multiple future paths
5. **Real account integration** — Connect to actual financial accounts for real-time data

### Platform Goals

Transform LifePath Planner into a platform that:

1. **Maintains user profiles and history** for tracking progress over time (highest priority for retention)
2. **Delivers professional, accessible UI/UX** that meets industry best practices
3. **Integrates financial calculators** (mortgage, retirement, debt payoff, savings, net worth, tax, investment) directly into planning workflows
4. **Provides long-term planning** with accurate retirement paths for users in their 20s through retirement
5. **Connects to real financial accounts** via Plaid or similar platforms for real-time data
6. **Offers personalized, actionable guidance** tailored to unique financial situations
7. **Operates as a globally accessible web platform** with user authentication

---

## Current Status

### MVP Core Complete

- **Phases 0-4 Complete**: Foundation, ingestion, clarification, deterministic engine, and optimization engine are all implemented and functional.
- **Vercel Migration Complete**: The application has been migrated from a multi-service Python architecture to a **unified Vercel serverless architecture**.
- **AI Integration Complete**: OpenAI integration for clarification questions, budget normalization, and suggestions is fully implemented and operational.
- Deterministic clarification UI schema, persistence, retry logic, telemetry, and rate limiting landed (see `docs/archive/pre_integration_prompts.md` for the execution history).
- LLM adapter boundary and operational guardrails are documented in `docs/llm_adapter.md` and `docs/operations.md`.
- Deterministic pipeline snapshots (`tests/test_deterministic_pipeline.py`) provide regression coverage.
- The legacy Streamlit UI has been removed; Next.js (`services/ui-web`) is the canonical client going forward.
- Repository structure has been cleaned up: `sys.path` manipulation removed, proper package imports via `conftest.py` files, and `pyproject.toml` configuration for IDE support.
- **Test coverage significantly expanded** (January 2025) — High-priority test coverage completed for all core business logic modules: `heuristics.py`, `generate_suggestions.py`, `format_detection.py`, `query_analyzer.py`, and `adaptive_questioning.py`. All modules now have ≥80% line coverage. See Phase 7 for remaining gaps.
- **CI/CD pipeline implemented** (December 2024) — GitHub Actions workflow with linting (ruff, pyright, ESLint, Prettier), Python 3.11+ test matrix, and deterministic pipeline validation. See `docs/development.md` for local commands and `.github/workflows/ci.yml` for the workflow definition.
- **Technical debt cleanup** (December 2024) — API gateway now validates answers before upstream calls; binding-style field IDs implemented; AI-related TODOs documented as future work. See Phase 6 for details.

### Known Issues Requiring Immediate Attention

The [Current State Reality Assessment](current_state_reality_assessment.md) identified critical gaps between documented features and actual functionality. These are addressed in **Phase 8.5** before proceeding to platform expansion.

| Issue | Priority | Status |
|-------|----------|--------|
| Financial frameworks not surfaced to users | P0 | Scheduled for Phase 8.5 |
| Duplicate clarification questions for similar categories | P0 | Scheduled for Phase 8.5 |
| Impact estimates often $0 or arbitrary | P1 | Scheduled for Phase 8.5 |
| Silent AI/deterministic fallback | P1 | Scheduled for Phase 8.5 |
| Limited deterministic fallback question set | P1 | Scheduled for Phase 8.5 |

---

# Part I: MVP Complete (Phases 0–8)

This section documents the completed MVP phases for historical reference.

---

## Phase 0 — Foundation (Week 1) ✓ Complete

- [x] Finalize product scope, schemas, and specifications (`PRD.md`, `budget_schema.md`, `ai_questioning_spec.md`, `ui_components_spec.md`).
- [x] Establish repository structure, service boundaries, and development environments.
- [x] Set up CI, linting, and shared testing utilities.

**Deliverables**

- [x] Documented architecture diagram and service readmes.
- [x] Initial CI pipeline with lint and test stages (`.github/workflows/ci.yml`).

---

## Phase 1 — File Ingestion and Interpretation (Weeks 2–3) ✓ Complete

- [x] Implement CSV/XLSX upload endpoint in the API gateway.
- [x] Build parsers for categorical budgets and ledger-style budgets in the ingestion service.
- [x] Produce draft structured budget models aligned with `budget_schema.md`.
- [x] Handle error states for unsupported formats.

**Milestones**

- [x] Upload API returns parsed model preview.
- [x] Unit tests for parser coverage on representative files.

---

## Phase 2 — Clarification Layer and Dynamic UI (Weeks 3–4) ✓ Complete

- [x] Implement question generation logic in the clarification service using the AI questioning specification.
- [x] Output UI component descriptors defined in `ui_components_spec.md`.
- [x] Build frontend dynamic form renderer to display 4–7 questions per round.
- [x] Persist clarified responses and merge them into the draft model.

**Milestones**

- [x] End-to-end flow from upload → questions → revised model in staging environment.
- [x] Frontend/UI QA sign-off on dynamic components.

---

## Phase 3 — Deterministic Budget Engine (Week 5) ✓ Complete

- [x] Implement deterministic computations (totals, surplus, category shares) in the optimization service.
- [x] Generate structured summaries for display and for the optimization engine.
- [x] Validate calculations against sample budgets.

**Milestones**

- [x] API endpoint returning summary metrics for clarified budgets.
- [x] Regression tests comparing expected totals against fixture data.

---

## Phase 4 — Optimization Engine and Suggestions (Weeks 6–7) ✓ Complete

- [x] Implement heuristic-based suggestion generator per MVP requirements.
- [x] Ensure suggestions reference clarification inputs (debt priorities, essentials).
- [x] Return 3–6 actionable recommendations with impact estimates.

**Milestones**

- [x] Optimization API returns structured suggestions for demo scenarios.
- [x] Internal review of suggestion quality and tone.

---

## Phase 4.6 — Inline Editing on Summary Screen (Week 7.5) ✓ Complete

**Goal**: Allow users to edit their inputs directly from the summary/suggestions screen without restarting the flow.

**Rationale**: Users previously had to restart the entire flow to make any changes. This created friction and discouraged experimentation with different scenarios.

**Features**:
- [x] Edit budget line items (income, expenses, debts) inline with expandable sections
- [x] Modify clarification answers and preferences without restarting
- [x] Update user query and refresh suggestions
- [x] Dirty state tracking with "Refresh Suggestions" button
- [x] PATCH endpoint for budget updates

**Implementation**:
- `services/ui-web/src/app/api/budget/[budgetId]/route.ts` — New PATCH endpoint for inline updates
- `services/ui-web/src/components/EditableBudgetSection.tsx` — Expandable budget editor component
- `services/ui-web/src/components/EditableQuerySection.tsx` — Query edit component
- `services/ui-web/src/hooks/useBudgetSession.tsx` — Added update mutations and dirty state tracking
- `services/ui-web/src/app/(app)/summarize/page.tsx` — Integrated editors with refresh button

**Milestones**

- [x] Users can edit income, expenses, and debt amounts inline.
- [x] Users can toggle essential/flexible status for expenses.
- [x] Users can change optimization preferences.
- [x] Users can edit their query and refresh suggestions.
- [x] Dirty state indicator shows when changes need refresh.

---

## Phase 5 — Integration, QA, and Launch Prep (Weeks 8–9) ✓ Mostly Complete

- [x] Conduct integration tests across services (upload → clarification → summary → suggestions).
- [x] Harden error handling, logging, and observability.
- [ ] Prepare launch collateral: onboarding walkthrough, support docs, and demo script.
- [x] Keep `docs/operations.md` updated with telemetry toggles, rate limits, and logging guardrails.

**Milestones**

- [x] Beta candidate build deployed to staging.
- [ ] User acceptance testing feedback incorporated.

---

## Phase 6 — Clarification Service Enhancements ✓ Mostly Complete

### Binding-Style Answer Format
**Status:** ✅ Complete (December 2024)
**Tests:** Passing in `test_normalization.py`, `test_apply_answers_endpoint.py`

Support for dot-path field IDs in answer payloads (e.g., `income.income-1.metadata.net_or_gross`, `expenses.rent.essential`). This allows flexible answer mapping from AI-generated questions.

**Implementation:**
- `parse_binding_style_field_id()` in `normalization.py` parses dot-path field IDs
- `_apply_binding_style_field()` maps parsed bindings to appropriate model fields
- Validation in `main.py` via `_validate_binding_style_field()`
- Fixture: `tests/fixtures/ai_answers_payload.json`

Supported formats:
- `expenses.<expense_id>.essential` → expense essential flag
- `preferences.optimization_focus` → preference update
- `income.<income_id>.stability` → income stability
- `income.<income_id>.metadata.<key>` → income metadata
- `debts.<debt_id>.<attribute>` → debt fields (balance, interest_rate, min_payment, priority, approximate)
- `debts.<debt_id>.rate_changes.0.date/new_rate` → debt rate change

### API Gateway Answer Validation
**Status:** ✅ Complete (December 2024)
**Tests:** Passing in `test_gateway_submit_answers.py`, `test_gateway_smoke.py`

The API gateway now validates answers **before** making upstream calls to the clarification service:
- Import `validate_answers` from `answer_validation.py`
- Returns 400 with structured error details (`error: "invalid_answers"`, `issues: [...]`)
- Prevents unnecessary network calls for invalid payloads
- Enhanced logging for validation failures

### AI-Based Model Enrichment
**Status:** Documented as future work
**Tests:** Skipped in `test_normalization.py` (2 tests)

Currently `draft_to_initial_unified()` uses sign-based rules only:
- All income defaults to `type="earned"`, `stability="stable"`
- All expenses default to `essential=None`
- No automatic debt detection

The following AI-based enrichment features are documented as future work in `normalization.py`:
- [ ] AI-based income classification (passive vs earned vs transfer)
- [ ] AI-based essential expense detection (housing, utilities → essential)
- [ ] AI-based debt detection from expense patterns (e.g., "Student Loan Payment" → Debt entry)
- [ ] AI-based income stability inference from historical patterns

See the documentation block at the top of `services/clarification-service/src/normalization.py` for full details.

---

## Phase 7 — Test Coverage Expansion ✓ High Priority Complete

The following modules have been identified as lacking dedicated test coverage. Addressing these will improve reliability and regression safety.

### High Priority (Core Business Logic) ✅ Complete

| Module | Service | Description | Status |
|--------|---------|-------------|--------|
| `heuristics.py` | optimization-service | Financial rules that drive suggestions (debt ratios, savings targets, emergency fund thresholds) | ✅ Complete (December 2024) — Tests in `services/optimization-service/tests/test_heuristics.py` |
| `generate_suggestions.py` | optimization-service | Core suggestion generation and ranking logic | ✅ Complete (December 2024) — Tests in `services/optimization-service/tests/test_generate_suggestions.py` |
| `format_detection.py` | budget-ingestion-service | Ledger vs categorical budget detection heuristics | ✅ Complete (December 2024) — Tests in `services/budget-ingestion-service/tests/test_format_detection.py` |
| `query_analyzer.py` | clarification-service | User query intent analysis for personalization | ✅ Complete (December 2024) — Tests in `services/clarification-service/tests/test_query_analyzer.py` |
| `adaptive_questioning.py` | clarification-service | Adaptive question flow and follow-up logic | ✅ Complete (December 2024) — Tests in `services/clarification-service/tests/test_adaptive_questioning.py` |

### Medium Priority (Stability & Reliability)

| Module | Service | Description |
|--------|---------|-------------|
| `provider_settings.py` | shared | Provider configuration loading and validation |
| `observability/privacy.py` | shared | `hash_payload` and `redact_fields` privacy utilities |
| ~~`answer_validation.py`~~ | ~~api-gateway~~ | ✅ Now integrated into `/submit-answers` endpoint (December 2024) |
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

- ✅ Each high-priority module has ≥80% line coverage (completed December 2024).
- Medium-priority modules have at least happy-path and primary error-case tests.
- Integration test suite can run against local Docker Compose stack.

---

## Phase 8 — Post-MVP Enhancements (Ongoing)

- Collect user feedback and prioritize:
  - Multi-year projections.
  - Real estate modeling.
  - FIRE planning modules.
  - Expanded UI components and conditional logic.
- Instrument usage analytics to inform roadmap.

**Milestones**

- Post-launch backlog groomed with user insights.
- Quarterly roadmap update reflecting adoption metrics.

---

# Part II: Current Work

This section tracks in-progress items from MVP phases that are not yet complete.

## Remaining MVP Tasks

| Phase | Task | Status |
|-------|------|--------|
| Phase 5 | Prepare launch collateral: onboarding walkthrough, support docs, and demo script | Pending |
| Phase 5 | User acceptance testing feedback incorporated | Pending |
| Phase 6 | AI-based model enrichment features | Documented as future work |
| Phase 7 | Medium-priority test coverage | Pending |
| Phase 7 | Lower-priority test coverage | Pending |
| Phase 7 | Integration & E2E test gaps | Pending |

## Priority: Phase 8.5 (MVP Quality Fixes)

**Before proceeding to platform expansion**, the following critical issues from the [Current State Reality Assessment](current_state_reality_assessment.md) must be addressed. These are blocking issues for any marketing or public launch.

---

# Part III: Platform Expansion (Phases 8.5–20)

This section outlines the phases that will transform LifePath Planner from an MVP into a comprehensive financial planning platform.

> **Note:** Phase order was restructured in January 2026 based on competitive analysis. User retention features (accounts, history) now take priority over utility features (calculators). See the [Competitive Audit](competitive_audit.md) for rationale.

---

## Phase 8.5 — MVP Quality Fixes (Weeks 10–11) ⬅️ START HERE

**Goal**: Fix critical bugs and missing functionality identified in the [Current State Reality Assessment](current_state_reality_assessment.md). Must complete before any marketing or public launch.

**Rationale**: The reality assessment found that several advertised features don't work as claimed. These fixes ensure honest marketing and good user experience.

### P0 Fixes (Must Fix) ✅ Complete

| Issue | Description | Status |
|-------|-------------|--------|
| **Question deduplication** | Similar categories generate duplicate questions | ✅ Semantic deduplication implemented in `ai.ts` |
| **Financial framework UI** | `FinancialPhilosophy` type never surfaced to users | ✅ Added to deterministic questions with expanded options |

### P1 Fixes (Should Fix Soon) ✅ Complete

| Issue | Description | Status |
|-------|-------------|--------|
| **Emergency fund $0 impact** | Always showed `expected_monthly_impact: 0` | ✅ Context-aware calculation based on optimization_focus |
| **Arbitrary 10% reduction** | Hardcoded 10% reduction | ✅ Dynamic calculation based on surplus ratio |
| **AI/deterministic indicator** | Users didn't know which mode was used | ✅ Mode badge added to SuggestionsList |
| **Limited deterministic questions** | Only 3 question types in fallback | ✅ Expanded to 7 question types |

**Implementation Summary (January 2026):**

- **Question Deduplication**: Added `deduplicateQuestions()` and `extractSemanticConcept()` functions
  - Groups questions by semantic concept (essential, debt, philosophy, risk, goals)
  - Merges components from duplicate questions into a single question
  
- **Financial Philosophy**: Expanded `FinancialPhilosophy` type with 7 options:
  - r/personalfinance, Money Guy Show, Dave Ramsey, Bogleheads, FIRE, neutral, custom
  - Added philosophy selector to deterministic questions
  - Display selected philosophy badge in SuggestionsList
  
- **Impact Calculations**: Context-aware suggestions based on user priorities
  - Emergency fund: 50% of surplus for savings focus, 25% for balanced, 10% for debt focus
  - Flexible spending: 5-25% reduction based on surplus ratio (not hardcoded 10%)
  
- **AI Priority**: Added retry logic with exponential backoff
  - `withRetry()` wrapper attempts AI calls up to 3 times
  - Only falls back to deterministic after all retries fail
  - `usedDeterministic` flag passed through to UI

- **Mode Indicator**: Clear badge showing analysis type
  - "AI-Powered" badge when AI succeeds
  - "Basic Analysis" badge when deterministic fallback used

**Files Modified:**
- `services/ui-web/src/lib/ai.ts` — Core fixes
- `services/ui-web/src/types/budget.ts` — Type expansions
- `services/ui-web/src/components/SuggestionsList.tsx` — Mode/philosophy badges
- `services/ui-web/src/utils/apiClient.tsx` — usedDeterministic handling
- `services/ui-web/src/app/api/summary-and-suggestions/route.ts` — Flag passing

**Deliverables**:
- [x] No duplicate questions for similar categories
- [x] Financial framework selectable with expanded options
- [x] All impact estimates are non-zero and context-aware
- [x] Clear indicator of AI vs deterministic mode
- [x] Expanded deterministic question set (7 types)

**Success Criteria**:
- Upload a budget with similar categories → deduplicated questions
- Financial philosophy selector available with 7 options
- Impact values calculated based on user's priorities
- Clear mode indicator badge visible

---

## Phase 9 — User Accounts & Authentication (Weeks 12–15)

**Goal**: Enable user accounts, authentication, and profile management to support persistent data and multi-session planning.

**Rationale** (from Competitive Audit): *"Without persistence, LifePath is a demo, not a product."* Every competitor has user accounts. This is the #1 retention-critical feature.

**Features**:
- User registration and authentication (email/password + OAuth options)
- User profiles with financial preferences and settings
- Session management and security
- Data privacy and compliance (GDPR, financial data protection)

**Implementation**:
- Use Vercel-compatible auth solution (NextAuth.js, Clerk, or Auth0)
- Add User and UserProfile models to Vercel Postgres
- Implement user registration/login endpoints as Next.js API routes
- Add user profile management
- Update UI with login/signup flows
- Add data encryption for sensitive financial information

**Files to Create/Modify**:
- `services/ui-web/src/app/api/auth/` — Authentication API routes
- `services/ui-web/src/lib/auth.ts` — Auth configuration and helpers
- `services/ui-web/src/lib/db.ts` — Extend with User, UserProfile models
- `services/ui-web/src/app/(app)/auth/` — Login/signup pages
- `services/ui-web/src/components/auth/` — Auth components
- `docs/security.md` — Security and privacy documentation

**Deliverables**:
- User registration and login
- Secure session management
- User profile storage
- Privacy-compliant data handling

---

## Phase 10 — Budget History & Trends (Weeks 16–19)

**Goal**: Enable users to track budgets over time, view trends, and compare periods.

**Rationale**: Direct dependency on Phase 9. Together with accounts, this is the minimum viable persistent experience that differentiates from ChatGPT.

**Features**:
- Budget snapshots (monthly/quarterly saves)
- Historical budget comparison
- Spending trend analysis
- Category growth/decline tracking
- Visualizations (charts, graphs)

**Implementation**:
- Extend persistence layer with BudgetSnapshot model (see `docs/architecture/persistence_layer.md`)
- Add snapshot creation on budget completion
- Build trend analysis service
- Create history dashboard UI
- Add comparison tools (this month vs last month, year-over-year)

**Files to Create/Modify**:
- `services/ui-web/src/lib/db.ts` — Add BudgetSnapshot model
- `services/ui-web/src/app/api/snapshots/` — Snapshot API routes
- `services/ui-web/src/lib/trendAnalysis.ts` — Trend calculations
- `services/ui-web/src/app/(app)/history/` — History dashboard
- `services/ui-web/src/components/history/` — History components

**Deliverables**:
- Users can save and view budget history
- Trend analysis and visualizations
- Period comparison tools

---

## Phase 11 — UI/UX Polish & Accessibility (Weeks 20–23)

**Goal**: Improve the UI to be professional, accessible, and easy to use. This is a focused polish phase, not a full redesign.

**Rationale**: Originally scheduled as Phase 16 (weeks 45-50), this was moved earlier because every subsequent feature benefits from a polished foundation. Scope is reduced to essentials; full design system deferred.

**Features (Essentials Only)**:
- **Accessibility**: WCAG 2.1 AA compliance, keyboard navigation, screen reader support
- **Responsive Design**: Mobile and tablet optimization
- **Loading States**: Skeleton screens, progress indicators
- **Error Handling**: Clear error messages, recovery paths
- **Basic Onboarding**: Simple guided tour for new users

**Deferred to Future Phase**:
- Full design system with custom components
- Advanced animations and micro-interactions
- Custom charting library
- Complete rebrand/visual overhaul

**Implementation**:
- Audit current UI for accessibility issues
- Add ARIA labels, keyboard navigation, focus management
- Implement responsive breakpoints
- Add skeleton loading states
- Create error boundaries
- Build simple onboarding flow (3-5 steps)

**Files to Create/Modify**:
- `services/ui-web/src/components/ui/` — Update with accessibility
- `services/ui-web/src/app/(app)/onboarding/` — Onboarding flow
- `services/ui-web/src/components/Skeleton.tsx` — Loading skeletons
- `services/ui-web/src/components/ErrorBoundary.tsx` — Error handling
- `docs/accessibility.md` — Accessibility guidelines

**Deliverables**:
- WCAG 2.1 AA compliance
- Responsive design for mobile/tablet
- Loading states throughout
- Error handling with recovery
- Basic onboarding flow

---

## Phase 12 — Financial Calculators (Weeks 24–28)

**Goal**: Implement core financial calculators that users can access independently and integrate into planning workflows.

**Rationale**: Originally Phase 9, moved after retention features. Calculators are valuable but not retention-critical. Users won't return just for calculators they can find elsewhere.

**Calculators to Implement**:
- **Debt Payoff Calculator**: Avalanche vs snowball strategies, payoff timelines, interest calculations
- **Savings Growth Calculator**: Compound interest with contributions, goal timelines
- **Retirement Calculator**: Retirement readiness, required savings, withdrawal strategies
- **Mortgage Calculator**: Payment calculations, amortization schedules, refinancing analysis
- **Net Worth Calculator**: Asset/debt tracking, growth projections
- **Investment Return Calculator**: Portfolio growth, ROI analysis
- **Tax Calculator**: Basic tax estimation, bracket analysis

**Implementation**:
- Build calculators as client-side TypeScript modules (no separate service needed)
- Each calculator: standalone page + reusable component
- Reuse formulas from `docs/architecture/projection_service.md` where applicable
- UI: Calculator library page + embedded calculator widgets

**Files to Create/Modify**:
- `services/ui-web/src/lib/calculators/` — Calculator logic modules
- `services/ui-web/src/app/(app)/calculators/` — Calculator UI pages
- `services/ui-web/src/components/calculators/` — Reusable calculator components
- `docs/calculators.md` — Calculator specifications and formulas (already exists)

**Deliverables**:
- 7+ financial calculators accessible via web UI
- Reusable calculator components
- Integration points for use in planning workflows

---

## Phase 13 — Goal Tracking & Progress Monitoring (Weeks 29–34)

**Goal**: Enable users to set financial goals and track progress over time with automated updates.

**Features**:
- Goal creation from templates (emergency fund, debt payoff, savings targets, etc.)
- Automatic progress tracking from budget snapshots
- Goal dashboard with progress visualization
- Alerts for off-track goals and milestones
- Integration with projections to show goal feasibility

**Implementation**:
- Implement goal tracking system (see `docs/architecture/goal_tracking.md`)
- Add FinancialGoal and GoalProgress models
- Create goal repository and progress calculator
- Build goal dashboard UI
- Implement alert system
- Connect goals to budget snapshots for auto-tracking

**Files to Create/Modify**:
- `services/ui-web/src/lib/db.ts` — Add goal models
- `services/ui-web/src/app/api/goals/` — Goal API routes
- `services/ui-web/src/lib/goalService.ts` — Goal logic
- `services/ui-web/src/app/(app)/goals/` — Goal dashboard
- `services/ui-web/src/components/goals/` — Goal components

**Deliverables**:
- Users can create and track financial goals
- Automatic progress updates from budgets
- Goal dashboard with alerts
- Goal templates for common objectives

---

## Phase 14 — Long-Term Projections (Weeks 35–42)

**Goal**: Implement comprehensive multi-year financial projections that provide planning scenarios.

**Rationale**: Originally Phase 12. Moved after Goals because projections are most valuable when connected to user goals and history.

**Features**:
- **Retirement Projections**: Full retirement readiness analysis for users in their 20s through retirement age
- **Debt Payoff Projections**: Long-term debt elimination with strategy comparison
- **Savings Growth Projections**: Investment and savings growth over decades
- **Net Worth Trajectory**: Complete net worth projections with life events
- **Life Event Modeling**: Job changes, home purchases, marriage, children, etc.

**Implementation**:
- Build projection engines as client-side TypeScript (leverage calculator modules)
- Integrate calculator engines into projection workflows
- Add life event modeling (see `docs/architecture/projection_service.md` for LifeEvent types)
- Create projection API endpoints for saving/loading projections
- Build projection UI with interactive charts
- Connect projections to user's actual budget data and goals

**Files to Create/Modify**:
- `services/ui-web/src/lib/projections/` — Projection engines
- `services/ui-web/src/app/api/projections/` — Projection API routes
- `services/ui-web/src/app/(app)/projections/` — Projection views
- `services/ui-web/src/components/projections/` — Projection components

**Deliverables**:
- Retirement readiness calculator with full projections
- Debt payoff timelines with strategy comparison
- Net worth trajectory over 30+ years
- Life event impact modeling

---

## Phase 15 — Scenario Planning & "What If" Analysis (Weeks 43–46)

**Goal**: Enable users to model different financial futures and compare outcomes.

**Features**:
- Create "what if" scenarios (job change, home purchase, debt payoff strategy, etc.)
- Side-by-side scenario comparison
- Impact analysis on goals and projections
- Scenario templates for common questions
- Save and revisit scenarios

**Implementation**:
- Implement scenario planning (see `docs/architecture/scenario_planning.md`)
- Add Scenario and ScenarioSet models
- Create scenario engine that applies modifications to projections
- Build scenario comparison UI
- Integrate with projections and goals

**Files to Create/Modify**:
- `services/ui-web/src/lib/db.ts` — Add scenario models
- `services/ui-web/src/lib/scenarioEngine.ts` — Scenario logic
- `services/ui-web/src/app/api/scenarios/` — Scenario API routes
- `services/ui-web/src/app/(app)/scenarios/` — Scenario builder
- `services/ui-web/src/components/scenarios/` — Scenario components

**Deliverables**:
- Scenario creation and comparison tools
- Impact analysis on goals and projections
- Template library for common scenarios

---

## Phases 16–18 — Platform Expansion (Weeks 47–60)

These phases consolidate advanced features that build on the core platform.

### Phase 16 — Calculator & Workflow Integration (Weeks 47–50)

**Goal**: Seamlessly integrate calculators into planning workflows.

**Features**:
- Contextual calculator access (calculators appear when relevant)
- Calculator results feed into projections
- Guided planning wizards (retirement planning, home buying, debt payoff)
- Calculator-powered recommendations in suggestions
- Export/share calculations

**Files to Create/Modify**:
- `services/ui-web/src/lib/planningWorkflow.ts` — Workflow orchestration
- `services/ui-web/src/app/(app)/planning/` — Planning workflow pages
- `services/ui-web/src/components/workflows/` — Workflow components

---

### Phase 17 — Account Integration (Weeks 51–56)

**Goal**: Integrate with financial account aggregation (Plaid or similar) for real-time data.

**Features**:
- Connect bank accounts, credit cards, investment accounts via Plaid Link
- Automatic transaction import and categorization
- Real-time balance updates
- Analyze actual spending vs budget
- Update budgets from actual transactions
- Track goal progress from real account data

**Implementation**:
- Research and select account aggregation provider (Plaid recommended)
- Implement OAuth flow for account connection
- Create account data models and storage
- Build transaction import and categorization
- Integrate account data into budget analysis
- Implement security and compliance measures

**Files to Create/Modify**:
- `services/ui-web/src/lib/plaid.ts` — Plaid integration
- `services/ui-web/src/app/api/accounts/` — Account API routes
- `services/ui-web/src/app/(app)/accounts/` — Account management UI
- `docs/account_integration.md` — Integration documentation (exists)
- `docs/security.md` — Update with account security measures

---

### Phase 18 — Advanced Planning Features (Weeks 57–60)

**Goal**: Advanced planning capabilities leveraging real account data.

**Features**:
- AI-powered suggestions based on real account data
- Spending pattern detection and insights
- Cash flow forecasting from historical patterns
- Basic tax optimization suggestions
- Portfolio analysis and recommendations
- Insurance needs analysis

**Files to Create/Modify**:
- `services/ui-web/src/lib/patternDetection.ts` — Spending patterns
- `services/ui-web/src/lib/cashFlowForecast.ts` — Cash flow forecasting
- `services/ui-web/src/lib/calculators/taxPlanning.ts` — Tax planning
- `docs/advanced_planning.md` — Advanced features documentation

---

## Phase 19 — Production Hardening (Weeks 61–64)

**Goal**: Harden the platform for production scale with proper monitoring, security, and compliance.

**Rationale**: Rewritten to reflect actual Vercel-based architecture. Original phase referenced AWS/GCP which is not the current architecture.

**Features**:
- **Vercel Production Configuration**: Environment optimization, edge functions, caching
- **Vercel Postgres Production**: Production database with proper backups and connection pooling
- **Monitoring & Observability**: Vercel Analytics, Sentry error tracking, custom metrics
- **Security Hardening**: Rate limiting, input validation, CORS configuration
- **Performance Optimization**: Edge caching, image optimization, bundle analysis
- **Compliance**: GDPR compliance, data retention policies, audit logging

**Implementation**:
- Configure Vercel project for production (environment variables, domains)
- Set up Vercel Postgres with connection pooling
- Integrate Sentry for error tracking
- Add Vercel Analytics for performance monitoring
- Implement rate limiting on API routes
- Security audit and hardening
- Document compliance measures

**Files to Create/Modify**:
- `services/ui-web/vercel.json` — Update production configuration
- `services/ui-web/src/lib/monitoring.ts` — Monitoring utilities
- `services/ui-web/src/middleware.ts` — Rate limiting, security headers
- `.github/workflows/deploy.yml` — Production deployment pipeline
- `docs/deployment.md` — Deployment documentation
- `docs/operations.md` — Update with production operations
- `docs/compliance.md` — Compliance documentation

**Deliverables**:
- Production-ready Vercel configuration
- Monitoring and error tracking
- Security hardening
- Compliance documentation
- CI/CD pipeline for production deploys

---

## Phase 20 — Marketing & Differentiation (Weeks 65–68)

**Goal**: Add features that differentiate LifePath from competitors and prepare for user acquisition.

**Features**:
- **Comparison Content**: Clear "Why LifePath vs ChatGPT" messaging
- **Value Demonstration**: Interactive demos, case studies
- **Freemium Model**: Free tier with clear upgrade paths
- **Export & Integration**: PDF reports, CSV exports, API access
- **Progressive Web App**: PWA for mobile experience

**Implementation**:
- Create comparison content and features
- Build freemium tier system (Stripe integration)
- Add export functionality
- Create API documentation for third-party integrations
- Implement PWA features
- Add marketing pages

**Files to Create/Modify**:
- `services/ui-web/src/app/(marketing)/comparison/` — Comparison pages
- `services/ui-web/src/app/api/export/` — Export endpoints
- `services/ui-web/src/app/api/subscription/` — Subscription management
- `docs/api_documentation.md` — Public API documentation
- Update `docs/differentiation_analysis.md` — Updated positioning

**Deliverables**:
- Clear differentiation messaging
- Freemium tier system
- Export and integration capabilities
- PWA for mobile
- Marketing materials

---

# Part IV: Supporting Information

## Phase Timeline Summary

| Phase | Name | Weeks | Duration | Key Deliverable |
|-------|------|-------|----------|-----------------|
| 8.5 | MVP Quality Fixes | 10–11 | 2 weeks | Fix critical bugs before launch |
| 9 | User Accounts | 12–15 | 4 weeks | User retention capability |
| 10 | Budget History | 16–19 | 4 weeks | Persistent value |
| 11 | UI/UX Polish | 20–23 | 4 weeks | Professional experience |
| 12 | Calculators | 24–28 | 5 weeks | Utility features |
| 13 | Goal Tracking | 29–34 | 6 weeks | Engagement driver |
| 14 | Projections | 35–42 | 8 weeks | Long-term planning |
| 15 | Scenarios | 43–46 | 4 weeks | "What if" analysis |
| 16 | Workflow Integration | 47–50 | 4 weeks | Connected experience |
| 17 | Account Integration | 51–56 | 6 weeks | Real-time data |
| 18 | Advanced Planning | 57–60 | 4 weeks | Premium features |
| 19 | Production Hardening | 61–64 | 4 weeks | Scale & security |
| 20 | Marketing | 65–68 | 4 weeks | Growth preparation |

---

## Success Metrics

| Phase | Key Metrics |
|-------|-------------|
| Phase 8.5 (Quality) | Zero duplicate questions, all impacts non-zero, mode indicator visible |
| Phase 9 (Accounts) | User registration rate, return user rate |
| Phase 10 (History) | Users saving budgets, history view engagement |
| Phase 11 (UI/UX) | Accessibility score, mobile usage, error rate reduction |
| Phase 12 (Calculators) | Calculator usage rate |
| Phase 13 (Goals) | Goal creation rate, goal completion rate |
| Phase 14 (Projections) | Projection usage, retirement planning completion |
| Phase 15 (Scenarios) | Scenario creation, comparison usage |
| Phase 16 (Integration) | Workflow completion rate |
| Phase 17 (Accounts) | Account connection rate, transaction import success |
| Phase 18 (Advanced) | Feature adoption, recommendation effectiveness |
| Phase 19 (Production) | Uptime, response time, error rate |
| Phase 20 (Marketing) | User acquisition, conversion to paid, retention |

---

## Dependencies & Prerequisites

```
Phase 8.5 → Required before any public marketing
    ↓
Phase 9 (Accounts) → Required for all persistence features
    ↓
Phase 10 (History) → Required for goal tracking
    ↓
Phase 11 (UI/UX) → Benefits all subsequent phases
    ↓
Phase 12 (Calculators) → Used by projections
    ↓
Phase 13 (Goals) → Enhanced by projections
    ↓
Phase 14 (Projections) → Used by scenarios
    ↓
Phase 15 (Scenarios)
    ↓
Phases 16-18 (Platform Expansion)
    ↓
Phase 19 (Production) → Required for scale
    ↓
Phase 20 (Marketing) → Requires stable product
```

---

## Technical Considerations

### Architecture

The system uses a **unified Vercel serverless architecture**:
- **Frontend**: Next.js App Router
- **API**: Next.js API Routes (serverless functions)
- **Database**: Vercel Postgres
- **AI**: OpenAI API (via Vercel AI SDK)
- **CDN**: Vercel Edge Network

No additional services or containers are needed for Phases 8.5–15. The architecture is sufficient for the core platform.

### Data Model Expansion

New entities to add progressively:
- **Phase 9**: User, UserProfile, Session
- **Phase 10**: BudgetSnapshot
- **Phase 13**: FinancialGoal, GoalProgress
- **Phase 15**: Scenario, ScenarioSet
- **Phase 17**: Account, Transaction

### Security & Compliance

- **Financial Data**: Encryption at rest (Vercel Postgres) and in transit (TLS)
- **Authentication**: NextAuth.js or Clerk with secure session management
- **Compliance**: GDPR, CCPA, financial data regulations
- **Audit Logs**: Track all financial data access

---

## Risk Mitigation

| Risk | Mitigation Strategy |
|------|---------------------|
| Phase 8.5 scope creep | Timebox to 2 weeks; defer non-critical fixes |
| Auth complexity | Use managed auth (Clerk/Auth0) vs building custom |
| Account Integration Complexity | Start with Plaid only; add others later |
| Regulatory Compliance | Consult with legal/compliance experts in Phase 17 |
| User Adoption | Focus on clear value proposition and onboarding |

---

## Related Documentation

- [`docs/current_state_reality_assessment.md`](current_state_reality_assessment.md) — Feature gap analysis driving Phase 8.5
- [`docs/competitive_audit.md`](competitive_audit.md) — Competitive landscape driving phase prioritization
- [`docs/differentiation_analysis.md`](differentiation_analysis.md) — ChatGPT comparison
- [`docs/calculators.md`](calculators.md) — Calculator specifications
- [`docs/architecture/projection_service.md`](architecture/projection_service.md) — Projection engine design
- [`docs/architecture/goal_tracking.md`](architecture/goal_tracking.md) — Goal system design
- [`docs/architecture/scenario_planning.md`](architecture/scenario_planning.md) — Scenario planning design
- [`docs/account_integration.md`](account_integration.md) — Account aggregation strategy

---

## Next Steps

1. **Begin Phase 8.5** — Fix P0 issues (question deduplication, financial frameworks)
2. **Select auth provider** — Evaluate Clerk, Auth0, NextAuth.js for Phase 9
3. **Create detailed tickets** — Break Phase 8.5 and 9 into specific tasks
4. **Set up project tracking** — Use project management tool for phase tracking
5. **Regular roadmap reviews** — Update quarterly based on user feedback and market changes
