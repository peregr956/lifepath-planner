# Budget History & Persistence Layer Architecture

## Overview

This document describes the persistence layer architecture for LifePath Planner, including both implemented features and future extensions for budget history tracking, trend analysis, and user accounts.

> **See Also**: [Phase 9.1: AI-Account Context Integration](phase_9.1_account_context_integration.md) for the layered context model that extends account profiles with confidence metadata and continuous enrichment.

---

## Part 1: Implemented Features

> **Status:** These models are implemented and in production use.

### BudgetSession Model

Located in `services/api-gateway/src/persistence/models.py`:

```python
class BudgetSession(Base):
    id: str                     # UUID
    stage: str                  # draft, partial, final
    draft: Dict                 # Raw parsed budget
    partial: Dict               # After clarification
    final: Dict                 # After answers applied
    user_query: str             # User's initial question
    user_profile: Dict          # Risk tolerance, philosophy
    created_at: datetime
    updated_at: datetime

class AuditEvent(Base):
    id: int
    session_id: str
    action: str
    source_ip: str
    from_stage: str
    to_stage: str
    details: Dict
    created_at: datetime
```

See `services/api-gateway/README.md` for usage documentation.

---

## Part 2: Future Planning

> **Status:** The following sections describe proposed extensions that have NOT been implemented.
> These designs enable differentiation from ChatGPT by providing persistent state across sessions.

### Current Limitations (To Be Addressed)

1. **No user identity** - Sessions are anonymous, no way to link multiple budgets to one user
2. **No budget history** - Each session is isolated, no tracking over time
3. **No snapshots** - Can't see how budget changed month to month
4. **No goals** - No way to set or track financial objectives

---

## 2. Proposed Schema Extensions

### 2.1 User Model

```python
class User(Base):
    """User account for multi-session budget tracking."""
    
    __tablename__ = "users"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # Authentication (initially simple, can extend to OAuth)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # User preferences that persist across sessions
    default_framework: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    default_optimization_focus: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    budget_snapshots: Mapped[List["BudgetSnapshot"]] = relationship(back_populates="user")
    goals: Mapped[List["FinancialGoal"]] = relationship(back_populates="user")
```

### 2.2 Budget Snapshot Model

```python
class BudgetSnapshot(Base):
    """Point-in-time capture of a user's budget for historical tracking."""
    
    __tablename__ = "budget_snapshots"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    
    # Period this snapshot represents
    period_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_month: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-12
    
    # The full budget model at this point in time
    budget_model: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    
    # Computed summary at snapshot time (for quick queries)
    total_income: Mapped[float] = mapped_column(nullable=False)
    total_expenses: Mapped[float] = mapped_column(nullable=False)
    surplus: Mapped[float] = mapped_column(nullable=False)
    
    # Category breakdown for trend analysis
    category_totals: Mapped[Dict[str, float]] = mapped_column(JSON, nullable=False)
    
    # Source information
    source_session_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user: Mapped["User"] = relationship(back_populates="budget_snapshots")
    
    # Unique constraint: one snapshot per user per month
    __table_args__ = (
        UniqueConstraint("user_id", "period_year", "period_month", name="unique_user_period"),
    )
```

### 2.3 Financial Goal Model

```python
class FinancialGoal(Base):
    """User-defined financial objective with progress tracking."""
    
    __tablename__ = "financial_goals"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    
    # Goal definition
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    goal_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # Types: savings_target, debt_payoff, emergency_fund, retirement, custom
    
    # Target values
    target_amount: Mapped[float] = mapped_column(nullable=False)
    current_amount: Mapped[float] = mapped_column(default=0.0, nullable=False)
    target_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # For debt payoff goals
    linked_debt_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    
    # Status tracking
    status: Mapped[str] = mapped_column(String(32), default="active")
    # Statuses: active, paused, completed, abandoned
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), onupdate=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    user: Mapped["User"] = relationship(back_populates="goals")
    progress_entries: Mapped[List["GoalProgress"]] = relationship(back_populates="goal")
```

### 2.4 Goal Progress Model

```python
class GoalProgress(Base):
    """Monthly progress entries for goal tracking."""
    
    __tablename__ = "goal_progress"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    goal_id: Mapped[str] = mapped_column(String(36), ForeignKey("financial_goals.id"), nullable=False)
    
    # Period
    period_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_month: Mapped[int] = mapped_column(Integer, nullable=False)
    
    # Progress at this point
    amount_at_period: Mapped[float] = mapped_column(nullable=False)
    contribution_this_period: Mapped[float] = mapped_column(default=0.0, nullable=False)
    
    # Linked to budget snapshot
    snapshot_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    goal: Mapped["FinancialGoal"] = relationship(back_populates="progress_entries")
```

---

## 3. Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌─────────┐         ┌──────────────────┐        ┌──────────────────┐      │
│  │  User   │ 1─────* │ BudgetSnapshot   │        │  BudgetSession   │      │
│  └────┬────┘         └──────────────────┘        └──────────────────┘      │
│       │                      │                           │                  │
│       │ 1                    │ *                         │ 1                │
│       │                      ▼                           ▼                  │
│       │              ┌───────────────┐           ┌─────────────────┐       │
│       │              │ GoalProgress  │           │  AuditEvent     │       │
│       │              └───────────────┘           └─────────────────┘       │
│       │ *                    ▲                                              │
│       ▼                      │ *                                            │
│  ┌──────────────────┐       │                                              │
│  │ FinancialGoal    │ 1─────┘                                              │
│  └──────────────────┘                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Repository Extensions

### 4.1 BudgetSnapshotRepository

```python
class BudgetSnapshotRepository:
    """Data access for budget history operations."""
    
    def __init__(self, db: Session):
        self._db = db
    
    def create_snapshot(
        self,
        user_id: str,
        period_year: int,
        period_month: int,
        budget_model: Dict[str, Any],
        summary: Summary,
        category_totals: Dict[str, float],
        source_session_id: Optional[str] = None,
    ) -> BudgetSnapshot:
        """Create or update a budget snapshot for the given period."""
        ...
    
    def get_snapshots_for_user(
        self,
        user_id: str,
        start_year: Optional[int] = None,
        start_month: Optional[int] = None,
        limit: int = 24,
    ) -> List[BudgetSnapshot]:
        """Retrieve budget history for a user, newest first."""
        ...
    
    def get_snapshot_for_period(
        self,
        user_id: str,
        year: int,
        month: int,
    ) -> Optional[BudgetSnapshot]:
        """Get a specific month's budget snapshot."""
        ...
    
    def compute_trends(
        self,
        user_id: str,
        num_months: int = 12,
    ) -> Dict[str, Any]:
        """Calculate spending trends over the specified period."""
        # Returns: category_changes, income_trend, expense_trend, savings_rate_trend
        ...
    
    def detect_anomalies(
        self,
        user_id: str,
        current_snapshot: BudgetSnapshot,
    ) -> List[Dict[str, Any]]:
        """Identify unusual spending patterns compared to history."""
        ...
```

### 4.2 GoalRepository

```python
class GoalRepository:
    """Data access for financial goals."""
    
    def __init__(self, db: Session):
        self._db = db
    
    def create_goal(
        self,
        user_id: str,
        name: str,
        goal_type: str,
        target_amount: float,
        target_date: Optional[datetime] = None,
        current_amount: float = 0.0,
    ) -> FinancialGoal:
        """Create a new financial goal."""
        ...
    
    def get_user_goals(
        self,
        user_id: str,
        status: Optional[str] = "active",
    ) -> List[FinancialGoal]:
        """Get all goals for a user, optionally filtered by status."""
        ...
    
    def record_progress(
        self,
        goal_id: str,
        period_year: int,
        period_month: int,
        amount_at_period: float,
        contribution: float,
        snapshot_id: Optional[str] = None,
    ) -> GoalProgress:
        """Record monthly progress for a goal."""
        ...
    
    def calculate_goal_trajectory(
        self,
        goal: FinancialGoal,
        monthly_contribution: float,
    ) -> Dict[str, Any]:
        """Project when goal will be reached at current pace."""
        # Returns: projected_completion_date, on_track, months_remaining
        ...
    
    def update_goal_from_snapshot(
        self,
        goal: FinancialGoal,
        snapshot: BudgetSnapshot,
    ) -> GoalProgress:
        """Update goal progress based on a new budget snapshot."""
        ...
```

---

## 5. API Endpoints

### 5.1 User Endpoints

```
POST   /users                      # Create account
POST   /users/login                # Authenticate
GET    /users/me                   # Get current user profile
PATCH  /users/me                   # Update preferences
```

### 5.2 Budget History Endpoints

```
POST   /budgets/snapshots          # Save current budget as snapshot
GET    /budgets/snapshots          # List user's budget history
GET    /budgets/snapshots/:id      # Get specific snapshot
GET    /budgets/trends             # Get spending trend analysis
GET    /budgets/anomalies          # Get detected anomalies
GET    /budgets/compare            # Compare two periods side-by-side
```

### 5.3 Goal Endpoints

```
POST   /goals                      # Create new goal
GET    /goals                      # List user's goals
GET    /goals/:id                  # Get goal details with progress
PATCH  /goals/:id                  # Update goal
DELETE /goals/:id                  # Remove goal
POST   /goals/:id/progress         # Record manual progress update
GET    /goals/:id/trajectory       # Get projected completion
```

---

## 6. Trend Analysis Implementation

### 6.1 Category Trend Calculation

```python
def compute_category_trends(
    snapshots: List[BudgetSnapshot],
    num_months: int = 6,
) -> Dict[str, CategoryTrend]:
    """
    Calculate spending trends for each category.
    
    Returns dict mapping category -> {
        "average": float,
        "trend": "increasing" | "decreasing" | "stable",
        "change_percent": float,  # Change from first to last period
        "volatility": float,      # Standard deviation
        "values": List[float],    # Monthly values
    }
    """
    ...
```

### 6.2 Anomaly Detection

```python
def detect_spending_anomalies(
    current: BudgetSnapshot,
    history: List[BudgetSnapshot],
    threshold_stddev: float = 2.0,
) -> List[SpendingAnomaly]:
    """
    Identify categories with unusual spending.
    
    Returns list of anomalies with:
    - category: str
    - current_amount: float
    - historical_average: float
    - deviation: float (in std devs)
    - severity: "warning" | "alert"
    """
    ...
```

---

## 7. Migration Strategy

### Phase 1: Add New Tables (Non-Breaking)

1. Create User, BudgetSnapshot, FinancialGoal, GoalProgress tables
2. Add optional `user_id` foreign key to BudgetSession
3. Existing sessions continue to work without user accounts

### Phase 2: Add API Endpoints

1. Implement user registration/login
2. Add snapshot saving endpoint
3. Add goal CRUD endpoints
4. Deploy trend analysis endpoints

### Phase 3: UI Integration

1. Add user account UI
2. Add budget history view
3. Add goal tracking dashboard
4. Add trend visualizations

---

## 8. Security Considerations

### Authentication

- Start with email/password for MVP
- Add OAuth (Google, Apple) for convenience
- Use JWT tokens for API authentication

### Authorization

- Users can only access their own snapshots and goals
- Session ownership enforced at repository level
- Admin endpoints for support operations

### Data Privacy

- Encrypt sensitive financial data at rest
- PII handling per docs/operations.md
- Data retention policy (configurable per user)

---

## 9. File Locations

New files to create:

```
services/api-gateway/src/persistence/
├── models.py           # Extend with new models
├── user_repository.py  # New: User operations
├── snapshot_repository.py  # New: Budget history
├── goal_repository.py  # New: Goal tracking
└── trend_analysis.py   # New: Trend calculations

services/api-gateway/src/routes/
├── users.py           # New: User endpoints
├── snapshots.py       # New: History endpoints
└── goals.py           # New: Goal endpoints

services/api-gateway/src/auth/
├── __init__.py        # New: Auth module
├── jwt.py             # New: Token handling
└── password.py        # New: Hashing
```

---

## 10. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Snapshot creation rate | 50% of sessions | Track via audit events |
| Returning users | 40% monthly return rate | Users with 2+ snapshots |
| Goal creation | 30% of users set goals | Goals per active user |
| Trend engagement | 20% view trends | API call frequency |

