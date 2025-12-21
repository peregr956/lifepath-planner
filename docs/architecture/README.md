# LifePath Planner Architecture Documentation

## Overview

This directory contains the architecture designs for LifePath Planner's differentiation features. These designs address the core question: **What value does LifePath Planner provide that users can't get by uploading their budget directly to ChatGPT?**

---

## The Differentiation Problem

### Current State

The MVP is essentially a structured wrapper around ChatGPT with:
- Better UX (forms instead of chat)
- Reliable deterministic math
- Pre-configured financial frameworks

**The problem:** Most current features can be replicated by a knowledgeable user prompting ChatGPT directly.

### The Solution

To justify a standalone product, LifePath must offer capabilities that **ChatGPT fundamentally cannot provide**:

1. **Persistent State** - Track budgets over time (ChatGPT has no memory)
2. **Complex Modeling** - Multi-year projections (ChatGPT math is unreliable)
3. **Goal Tracking** - Monitor progress toward objectives (requires persistence)
4. **Scenario Analysis** - Compare multiple futures (requires structured modeling)

---

## Architecture Documents

### Foundation

| Document | Purpose |
|----------|---------|
| [differentiation_analysis.md](../differentiation_analysis.md) | Analysis of current capabilities vs ChatGPT |

### Differentiation Features

| Document | Key Value | Status |
|----------|-----------|--------|
| [persistence_layer.md](persistence_layer.md) | Budget history & trend analysis | Designed |
| [projection_service.md](projection_service.md) | Multi-year financial projections | Designed |
| [scenario_planning.md](scenario_planning.md) | "What if" analysis & comparison | Designed |
| [goal_tracking.md](goal_tracking.md) | Goal setting & progress monitoring | Designed |

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                        Next.js UI (Port 3000)                         │ │
│  │  • Budget Upload    • Goal Dashboard    • Scenario Builder           │ │
│  │  • Clarification    • Progress Tracker  • Projection Views           │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                            API Gateway (Port 8000)                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐              │
│  │ Budget Routes  │  │ User Routes    │  │ Goal Routes    │              │
│  └────────────────┘  └────────────────┘  └────────────────┘              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐              │
│  │ Scenario Routes│  │ Snapshot Routes│  │ Alert Routes   │              │
│  └────────────────┘  └────────────────┘  └────────────────┘              │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                       Persistence Layer                               │ │
│  │  • Users    • BudgetSessions    • BudgetSnapshots                   │ │
│  │  • Goals    • GoalProgress      • Scenarios                         │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
          │                    │                    │                    │
          ▼                    ▼                    ▼                    ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│    Ingestion    │ │  Clarification  │ │  Optimization   │ │   Projection    │
│   (Port 8001)   │ │   (Port 8002)   │ │   (Port 8003)   │ │   (Port 8004)   │
│                 │ │                 │ │                 │ │                 │
│ • CSV Parser    │ │ • Question Gen  │ │ • Suggestions   │ │ • Debt Payoff   │
│ • XLSX Parser   │ │ • Normalization │ │ • Heuristics    │ │ • Savings       │
│ • Format Detect │ │ • OpenAI Prov.  │ │ • OpenAI Prov.  │ │ • Net Worth     │
│                 │ │                 │ │                 │ │ • Retirement    │
│                 │ │                 │ │                 │ │ • Scenarios     │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

**Goal:** Enable user accounts and budget history tracking.

| Task | Effort | Files |
|------|--------|-------|
| Add User model | 2 days | `persistence/models.py` |
| Add BudgetSnapshot model | 2 days | `persistence/models.py` |
| Create user auth (JWT) | 3 days | `auth/` (new) |
| Add snapshot repository | 2 days | `persistence/snapshot_repository.py` |
| Create user/snapshot endpoints | 3 days | `routes/users.py`, `routes/snapshots.py` |
| Add trend analysis | 3 days | `persistence/trend_analysis.py` |
| UI: Budget history view | 3 days | `ui-web/src/components/` |

**Deliverables:**
- Users can create accounts
- Budgets are saved as monthly snapshots
- Users can view spending trends over time

### Phase 2: Goal Tracking (Weeks 5-8)

**Goal:** Enable users to set and track financial goals.

| Task | Effort | Files |
|------|--------|-------|
| Add FinancialGoal model | 2 days | `persistence/models.py` |
| Add GoalProgress model | 1 day | `persistence/models.py` |
| Create goal repository | 2 days | `persistence/goal_repository.py` |
| Implement progress calculator | 3 days | `services/goal_service.py` |
| Create goal endpoints | 2 days | `routes/goals.py` |
| Implement alert system | 3 days | `services/alert_service.py` |
| UI: Goal dashboard | 4 days | `ui-web/src/components/` |
| UI: Goal creation wizard | 3 days | `ui-web/src/components/` |

**Deliverables:**
- Users can create goals from templates
- Progress automatically tracked from budgets
- Alerts when off-track or hitting milestones

### Phase 3: Projections (Weeks 9-12)

**Goal:** Add reliable multi-year financial projections.

| Task | Effort | Files |
|------|--------|-------|
| Create projection service scaffold | 1 day | `services/projection-service/` |
| Implement debt payoff engine | 3 days | `projection-service/src/engines/` |
| Implement savings growth engine | 2 days | `projection-service/src/engines/` |
| Implement net worth engine | 3 days | `projection-service/src/engines/` |
| Implement retirement engine | 3 days | `projection-service/src/engines/` |
| Create projection API | 2 days | `projection-service/src/main.py` |
| Integrate with gateway | 2 days | `api-gateway/src/http_client.py` |
| UI: Projection views | 4 days | `ui-web/src/components/` |

**Deliverables:**
- Debt payoff timelines with strategy comparison
- Savings growth projections
- Net worth trajectory
- Retirement readiness analysis

### Phase 4: Scenario Planning (Weeks 13-16)

**Goal:** Enable "what if" analysis and comparison.

| Task | Effort | Files |
|------|--------|-------|
| Add Scenario models | 2 days | `persistence/models.py` |
| Create scenario engine | 4 days | `services/scenario_engine.py` |
| Implement modification applier | 3 days | `services/scenario_engine.py` |
| Create scenario comparison | 3 days | `services/scenario_comparison.py` |
| Create scenario endpoints | 2 days | `routes/scenarios.py` |
| Implement templates | 2 days | `services/scenario_templates.py` |
| UI: Scenario builder | 4 days | `ui-web/src/components/` |
| UI: Comparison view | 4 days | `ui-web/src/components/` |

**Deliverables:**
- Users can create "what if" scenarios
- Side-by-side comparison of outcomes
- Template library for common questions
- Actionable insights from comparisons

---

## Data Model Summary

### New Entities

```
User
├── id: str (UUID)
├── email: str
├── display_name: str?
├── default_framework: str?
└── relationships:
    ├── budget_snapshots: List[BudgetSnapshot]
    ├── goals: List[FinancialGoal]
    └── scenario_sets: List[ScenarioSet]

BudgetSnapshot
├── id: str (UUID)
├── user_id: str (FK)
├── period_year: int
├── period_month: int
├── budget_model: JSON
├── total_income: float
├── total_expenses: float
├── surplus: float
└── category_totals: JSON

FinancialGoal
├── id: str (UUID)
├── user_id: str (FK)
├── name: str
├── goal_type: enum
├── target_value: float
├── target_date: date?
├── current_value: float
├── status: enum
└── relationships:
    └── progress_entries: List[GoalProgress]

GoalProgress
├── id: str
├── goal_id: str (FK)
├── period_date: date
├── value_at_period: float
├── contribution_amount: float
├── progress_percent: float
└── on_track: bool

ScenarioSet
├── id: str (UUID)
├── user_id: str (FK)
├── name: str
├── base_snapshot_id: str?
└── relationships:
    └── scenarios: List[SavedScenario]

SavedScenario
├── id: str (UUID)
├── scenario_set_id: str (FK)
├── name: str
├── is_baseline: bool
├── modifications: JSON
└── projection_cache: JSON?
```

---

## Success Metrics

| Feature | Metric | Target |
|---------|--------|--------|
| Budget History | Users save 2+ snapshots | 50% of users |
| Goal Tracking | Users create 1+ goals | 40% of users |
| Projections | Users run 1+ projections | 35% of users |
| Scenarios | Users create 1+ scenarios | 25% of users |
| Retention | Monthly return rate | 40% |
| Differentiation | Users cite unique features | 60% in surveys |

---

## Technical Decisions

### Why Separate Services?

Each differentiation feature is designed as a logical module that could become a separate service:
- **Projection Service** - Compute-intensive, benefits from isolation
- **Goal Service** - Complex state management, own data access patterns
- **Scenario Engine** - Combines projection + comparison logic

For MVP, these can be implemented within the API Gateway and extracted later if needed.

### Why Deterministic Calculations?

LLMs (including ChatGPT) are unreliable for:
- Compound interest over many periods
- Amortization schedules
- Multi-variable optimization
- Consistent numerical precision

All projection, goal, and scenario calculations use deterministic formulas to ensure reliability.

### Why User Accounts?

Persistence requires user identity. Without accounts:
- Can't track budgets over time
- Can't set and monitor goals
- Can't save and compare scenarios
- No engagement loop beyond single session

---

## Next Steps

1. **Review this architecture** with stakeholders
2. **Prioritize Phase 1** for immediate implementation
3. **Create detailed tickets** for each task
4. **Set up database migrations** for new models
5. **Design authentication flow** (email/password vs OAuth)

