# Goal Tracking & Progress Monitoring System Architecture

> **Status: Future Planning** — This system has NOT been implemented.
> This document describes a proposed feature for future development.

## Overview

The Goal Tracking System enables users to set specific financial objectives and monitor progress over time. This is a critical differentiator from ChatGPT, which cannot maintain persistent state or track progress across sessions.

---

## 1. Value Proposition

### What Users Can Do

- **Set specific goals** - "Save $20,000 for a down payment by December 2026"
- **Track progress** - See monthly progress toward each goal
- **Get alerts** - Know when they're off-track before it's too late
- **Celebrate milestones** - Acknowledge achievements along the way
- **Adjust strategies** - Modify approach based on actual progress

### Why ChatGPT Can't Do This

1. **No memory** - Can't remember goals between sessions
2. **No tracking** - Can't monitor progress over time
3. **No comparisons** - Can't compare planned vs actual
4. **No alerts** - Can't proactively notify users

---

## 2. Goal Types

### 2.1 Supported Goal Categories

```python
class GoalType(Enum):
    """Types of financial goals users can create."""
    
    # Savings goals
    EMERGENCY_FUND = "emergency_fund"          # Build emergency reserves
    SAVINGS_TARGET = "savings_target"          # Save for specific amount
    DOWN_PAYMENT = "down_payment"              # House down payment
    MAJOR_PURCHASE = "major_purchase"          # Car, vacation, etc.
    
    # Debt goals
    DEBT_PAYOFF = "debt_payoff"                # Pay off specific debt
    DEBT_FREE = "debt_free"                    # Become completely debt-free
    
    # Investment goals
    INVESTMENT_TARGET = "investment_target"    # Reach portfolio value
    RETIREMENT_SAVINGS = "retirement_savings"  # Retirement account target
    
    # Lifestyle goals
    SAVINGS_RATE = "savings_rate"              # Achieve target savings rate
    EXPENSE_REDUCTION = "expense_reduction"    # Reduce category spending
    NET_WORTH_TARGET = "net_worth_target"      # Reach net worth milestone
    
    # Custom
    CUSTOM = "custom"                          # User-defined goal
```

### 2.2 Goal Configuration

```python
@dataclass
class FinancialGoal:
    """A user's financial objective with tracking configuration."""
    
    id: str
    user_id: str
    
    # Basic information
    name: str
    description: Optional[str]
    goal_type: GoalType
    
    # Target definition
    target_value: float
    target_date: Optional[date]
    
    # Current state
    current_value: float
    started_at: date
    
    # For debt goals
    linked_debt_id: Optional[str]
    original_debt_balance: Optional[float]
    
    # For recurring goals (e.g., savings rate)
    is_recurring: bool = False
    recurrence_period: Optional[str] = None  # "monthly", "quarterly", "yearly"
    
    # Tracking configuration
    tracking_frequency: TrackingFrequency = TrackingFrequency.MONTHLY
    reminder_enabled: bool = True
    reminder_day: int = 1  # Day of month for reminders
    
    # Status
    status: GoalStatus = GoalStatus.ACTIVE
    completed_at: Optional[datetime] = None
    
    # Metadata
    created_at: datetime
    updated_at: datetime

class TrackingFrequency(Enum):
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"

class GoalStatus(Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ABANDONED = "abandoned"
```

---

## 3. Progress Tracking

### 3.1 Progress Entry Model

```python
@dataclass
class GoalProgress:
    """A point-in-time progress record for a goal."""
    
    id: str
    goal_id: str
    
    # Period this entry represents
    period_date: date  # Start of period (e.g., first of month)
    
    # Progress values
    value_at_period: float  # Current value at this point
    contribution_amount: float  # Amount added this period
    
    # Calculated metrics
    progress_percent: float  # 0.0 to 1.0
    on_track: bool
    
    # For debt goals, interest/principal breakdown
    principal_paid: Optional[float]
    interest_paid: Optional[float]
    
    # Source tracking
    source: ProgressSource  # How was this recorded?
    snapshot_id: Optional[str]  # Link to budget snapshot if auto-tracked
    
    # Metadata
    recorded_at: datetime
    notes: Optional[str]

class ProgressSource(Enum):
    MANUAL = "manual"              # User entered manually
    BUDGET_SYNC = "budget_sync"    # Extracted from budget snapshot
    CALCULATED = "calculated"      # Inferred from other data
```

### 3.2 Progress Calculator

```python
class ProgressCalculator:
    """Computes goal progress metrics."""
    
    def calculate_progress(self, goal: FinancialGoal) -> GoalProgressSummary:
        """Calculate current progress toward goal."""
        
        progress_percent = self._calculate_percent(goal)
        on_track = self._is_on_track(goal)
        
        return GoalProgressSummary(
            goal_id=goal.id,
            current_value=goal.current_value,
            target_value=goal.target_value,
            progress_percent=progress_percent,
            on_track=on_track,
            
            # Time analysis
            days_elapsed=self._days_since_start(goal),
            days_remaining=self._days_until_target(goal),
            
            # Required pace
            required_monthly_contribution=self._required_monthly(goal),
            current_monthly_pace=self._current_pace(goal),
            
            # Projections
            projected_completion_date=self._project_completion(goal),
            projected_final_value=self._project_final_value(goal),
        )
    
    def _is_on_track(self, goal: FinancialGoal) -> bool:
        """Determine if goal is on track for target date."""
        if not goal.target_date:
            return True  # No deadline = always on track
        
        expected_progress = self._expected_progress_by_now(goal)
        actual_progress = goal.current_value / goal.target_value
        
        # Allow 10% buffer before marking off-track
        return actual_progress >= expected_progress * 0.9
    
    def _required_monthly(self, goal: FinancialGoal) -> float:
        """Calculate required monthly contribution to meet deadline."""
        if not goal.target_date:
            return 0.0
        
        remaining = goal.target_value - goal.current_value
        months_left = self._months_until_target(goal)
        
        if months_left <= 0:
            return remaining  # Need it all now
        
        return remaining / months_left
    
    def _project_completion(self, goal: FinancialGoal) -> Optional[date]:
        """Project when goal will be reached at current pace."""
        pace = self._current_pace(goal)
        if pace <= 0:
            return None  # Never at current pace
        
        remaining = goal.target_value - goal.current_value
        months_needed = math.ceil(remaining / pace)
        
        return date.today() + timedelta(days=months_needed * 30)

@dataclass
class GoalProgressSummary:
    """Comprehensive progress summary for a goal."""
    
    goal_id: str
    current_value: float
    target_value: float
    progress_percent: float
    on_track: bool
    
    # Time
    days_elapsed: int
    days_remaining: Optional[int]
    
    # Pace
    required_monthly_contribution: float
    current_monthly_pace: float
    
    # Projections
    projected_completion_date: Optional[date]
    projected_final_value: Optional[float]  # Value at target date
```

---

## 4. Alert System

### 4.1 Alert Types

```python
class AlertType(Enum):
    """Types of goal-related alerts."""
    
    # Progress alerts
    OFF_TRACK = "off_track"                    # Falling behind schedule
    BACK_ON_TRACK = "back_on_track"            # Recovered from off-track
    SIGNIFICANT_PROGRESS = "significant_progress"  # Major milestone reached
    
    # Milestone alerts
    MILESTONE_25 = "milestone_25"              # 25% complete
    MILESTONE_50 = "milestone_50"              # Halfway there
    MILESTONE_75 = "milestone_75"              # 75% complete
    GOAL_COMPLETED = "goal_completed"          # 100% achieved!
    
    # Deadline alerts
    DEADLINE_APPROACHING = "deadline_approaching"  # 30 days until target
    DEADLINE_IMMINENT = "deadline_imminent"        # 7 days until target
    DEADLINE_MISSED = "deadline_missed"            # Target date passed
    
    # Action alerts
    UPDATE_REMINDER = "update_reminder"        # Time to log progress
    SUGGESTED_ADJUSTMENT = "suggested_adjustment"  # Recommended change
```

### 4.2 Alert Configuration

```python
@dataclass
class AlertConfiguration:
    """User preferences for goal alerts."""
    
    user_id: str
    
    # Which alerts to send
    enabled_alerts: Set[AlertType] = field(default_factory=lambda: {
        AlertType.OFF_TRACK,
        AlertType.MILESTONE_50,
        AlertType.GOAL_COMPLETED,
        AlertType.DEADLINE_APPROACHING,
        AlertType.UPDATE_REMINDER,
    })
    
    # Delivery preferences
    email_enabled: bool = True
    push_enabled: bool = False
    in_app_enabled: bool = True
    
    # Timing
    quiet_hours_start: Optional[time] = time(22, 0)
    quiet_hours_end: Optional[time] = time(8, 0)
    
    # Frequency limits
    max_alerts_per_day: int = 5
    min_hours_between_alerts: int = 4
```

### 4.3 Alert Generator

```python
class GoalAlertGenerator:
    """Generates alerts based on goal progress."""
    
    def check_goal(
        self,
        goal: FinancialGoal,
        progress: GoalProgressSummary,
        previous_progress: Optional[GoalProgressSummary],
    ) -> List[GoalAlert]:
        """Check if any alerts should be triggered for a goal."""
        
        alerts = []
        
        # Check on-track status change
        if previous_progress and previous_progress.on_track and not progress.on_track:
            alerts.append(self._create_alert(
                goal, AlertType.OFF_TRACK,
                f"You're falling behind on '{goal.name}'. "
                f"You need ${progress.required_monthly_contribution:,.0f}/month "
                f"to catch up."
            ))
        
        # Check milestones
        for milestone, threshold in [
            (AlertType.MILESTONE_25, 0.25),
            (AlertType.MILESTONE_50, 0.50),
            (AlertType.MILESTONE_75, 0.75),
        ]:
            if (previous_progress and 
                previous_progress.progress_percent < threshold <= progress.progress_percent):
                alerts.append(self._create_alert(
                    goal, milestone,
                    f"Congratulations! You're {int(threshold * 100)}% of the way "
                    f"to '{goal.name}'!"
                ))
        
        # Check completion
        if progress.progress_percent >= 1.0:
            alerts.append(self._create_alert(
                goal, AlertType.GOAL_COMPLETED,
                f"🎉 You did it! You've achieved your goal: {goal.name}!"
            ))
        
        # Check deadline approaching
        if progress.days_remaining and 0 < progress.days_remaining <= 30:
            alerts.append(self._create_alert(
                goal, AlertType.DEADLINE_APPROACHING,
                f"Only {progress.days_remaining} days left to reach '{goal.name}'. "
                f"You need ${progress.required_monthly_contribution:,.0f} to finish on time."
            ))
        
        return alerts

@dataclass
class GoalAlert:
    """An alert to be delivered to the user."""
    
    id: str
    goal_id: str
    user_id: str
    alert_type: AlertType
    title: str
    message: str
    action_url: Optional[str]
    created_at: datetime
    delivered_at: Optional[datetime]
    read_at: Optional[datetime]
```

---

## 5. Goal Templates

### 5.1 Pre-built Goal Templates

```python
GOAL_TEMPLATES = {
    "emergency_fund_3_months": {
        "name": "3-Month Emergency Fund",
        "goal_type": GoalType.EMERGENCY_FUND,
        "description": "Build 3 months of essential expenses as an emergency cushion.",
        "calculation": lambda budget: budget.monthly_expenses * 3,
        "suggested_timeline_months": 12,
        "tips": [
            "Start with a smaller goal ($1,000) if 3 months feels overwhelming",
            "Keep in a high-yield savings account for easy access",
            "Don't touch it except for true emergencies",
        ],
    },
    
    "emergency_fund_6_months": {
        "name": "6-Month Emergency Fund",
        "goal_type": GoalType.EMERGENCY_FUND,
        "description": "Build 6 months of expenses for comprehensive security.",
        "calculation": lambda budget: budget.monthly_expenses * 6,
        "suggested_timeline_months": 24,
    },
    
    "debt_free": {
        "name": "Become Debt-Free",
        "goal_type": GoalType.DEBT_FREE,
        "description": "Pay off all consumer debt.",
        "calculation": lambda budget: sum(d.balance for d in budget.debts),
        "auto_link_debts": True,
        "tips": [
            "Consider using the avalanche (highest rate first) or snowball (smallest balance first) method",
            "Celebrate each debt you pay off",
        ],
    },
    
    "house_down_payment": {
        "name": "House Down Payment",
        "goal_type": GoalType.DOWN_PAYMENT,
        "description": "Save for a 20% down payment on a home.",
        "parameters": [
            {"name": "home_price", "label": "Target home price", "type": "currency"},
            {"name": "down_payment_percent", "label": "Down payment %", "type": "percent", "default": 20},
        ],
        "calculation": lambda params: params["home_price"] * (params["down_payment_percent"] / 100),
    },
    
    "retirement_target": {
        "name": "Retirement Savings Target",
        "goal_type": GoalType.RETIREMENT_SAVINGS,
        "description": "Reach your retirement savings goal.",
        "parameters": [
            {"name": "retirement_age", "label": "Retirement age", "type": "number", "default": 65},
            {"name": "current_age", "label": "Current age", "type": "number"},
            {"name": "target_income", "label": "Desired annual retirement income", "type": "currency"},
        ],
        "calculation": lambda params: params["target_income"] * 25,  # 4% rule approximation
    },
    
    "savings_rate_target": {
        "name": "Target Savings Rate",
        "goal_type": GoalType.SAVINGS_RATE,
        "description": "Achieve a consistent monthly savings rate.",
        "is_recurring": True,
        "recurrence_period": "monthly",
        "parameters": [
            {"name": "target_rate", "label": "Target savings rate", "type": "percent", "default": 20},
        ],
        "calculation": lambda budget, params: budget.total_income * (params["target_rate"] / 100),
    },
}
```

### 5.2 Template Instantiation

```python
class GoalTemplateService:
    """Creates goals from templates."""
    
    def create_from_template(
        self,
        template_id: str,
        user_id: str,
        budget: UnifiedBudgetModel,
        parameters: Dict[str, Any],
        target_date: Optional[date] = None,
    ) -> FinancialGoal:
        """Create a goal from a template."""
        
        template = GOAL_TEMPLATES[template_id]
        
        # Calculate target value
        if "calculation" in template:
            if "parameters" in template:
                target_value = template["calculation"](parameters)
            else:
                target_value = template["calculation"](budget)
        else:
            target_value = parameters.get("target_value", 0)
        
        # Calculate target date if not provided
        if not target_date and "suggested_timeline_months" in template:
            target_date = date.today() + timedelta(days=template["suggested_timeline_months"] * 30)
        
        goal = FinancialGoal(
            id=generate_uuid(),
            user_id=user_id,
            name=template["name"],
            description=template.get("description"),
            goal_type=template["goal_type"],
            target_value=target_value,
            target_date=target_date,
            current_value=0.0,
            started_at=date.today(),
            is_recurring=template.get("is_recurring", False),
            recurrence_period=template.get("recurrence_period"),
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        
        # Auto-link debts if applicable
        if template.get("auto_link_debts"):
            # Link to all debts for debt-free goal
            pass
        
        return goal
```

---

## 6. Integration with Budget Snapshots

### 6.1 Automatic Progress Updates

```python
class GoalBudgetIntegration:
    """Syncs goal progress with budget snapshots."""
    
    def __init__(
        self,
        goal_repo: GoalRepository,
        snapshot_repo: BudgetSnapshotRepository,
    ):
        self._goals = goal_repo
        self._snapshots = snapshot_repo
    
    def update_goals_from_snapshot(
        self,
        user_id: str,
        snapshot: BudgetSnapshot,
    ) -> List[GoalProgress]:
        """Update goal progress based on new budget snapshot."""
        
        goals = self._goals.get_user_goals(user_id, status=GoalStatus.ACTIVE)
        progress_entries = []
        
        for goal in goals:
            progress = self._calculate_progress_from_snapshot(goal, snapshot)
            if progress:
                self._goals.record_progress(progress)
                progress_entries.append(progress)
        
        return progress_entries
    
    def _calculate_progress_from_snapshot(
        self,
        goal: FinancialGoal,
        snapshot: BudgetSnapshot,
    ) -> Optional[GoalProgress]:
        """Calculate goal progress from budget snapshot."""
        
        match goal.goal_type:
            case GoalType.SAVINGS_RATE:
                # Calculate actual savings rate from snapshot
                savings_rate = snapshot.surplus / snapshot.total_income
                value = savings_rate * 100
                contribution = 0  # Rate doesn't accumulate
                
            case GoalType.EMERGENCY_FUND | GoalType.SAVINGS_TARGET:
                # Look for savings category in snapshot
                value = snapshot.category_totals.get("savings", 0)
                # Calculate contribution from last month
                previous = self._snapshots.get_previous_snapshot(snapshot)
                if previous:
                    contribution = value - previous.category_totals.get("savings", 0)
                else:
                    contribution = value
                    
            case GoalType.DEBT_PAYOFF:
                # Find linked debt in snapshot
                if goal.linked_debt_id:
                    debt = self._find_debt_in_snapshot(goal.linked_debt_id, snapshot)
                    if debt:
                        # Progress = original balance - current balance
                        value = goal.original_debt_balance - debt["balance"]
                        previous = self._snapshots.get_previous_snapshot(snapshot)
                        if previous:
                            prev_debt = self._find_debt_in_snapshot(goal.linked_debt_id, previous)
                            if prev_debt:
                                contribution = prev_debt["balance"] - debt["balance"]
                            else:
                                contribution = 0
                        else:
                            contribution = value
                    else:
                        # Debt no longer in budget = paid off!
                        value = goal.target_value
                        contribution = goal.target_value - goal.current_value
            
            case _:
                return None
        
        return GoalProgress(
            id=generate_uuid(),
            goal_id=goal.id,
            period_date=date(snapshot.period_year, snapshot.period_month, 1),
            value_at_period=value,
            contribution_amount=contribution,
            progress_percent=value / goal.target_value,
            on_track=self._is_on_track(goal, value),
            source=ProgressSource.BUDGET_SYNC,
            snapshot_id=snapshot.id,
            recorded_at=datetime.now(),
        )
```

---

## 7. API Endpoints

### 7.1 Goal Management

```
# Goals CRUD
POST   /goals                           # Create new goal
GET    /goals                           # List user's goals
GET    /goals/:id                       # Get goal details
PATCH  /goals/:id                       # Update goal
DELETE /goals/:id                       # Delete goal

# Goal status
POST   /goals/:id/pause                 # Pause goal tracking
POST   /goals/:id/resume                # Resume goal tracking
POST   /goals/:id/complete              # Mark goal complete
POST   /goals/:id/abandon               # Abandon goal
```

### 7.2 Progress Tracking

```
# Progress entries
POST   /goals/:id/progress              # Record progress update
GET    /goals/:id/progress              # Get progress history
GET    /goals/:id/progress/summary      # Get current progress summary

# Bulk operations
POST   /goals/sync-from-budget          # Update all goals from latest budget
GET    /goals/dashboard                 # Get all goals with current progress
```

### 7.3 Templates

```
GET    /goals/templates                 # List available templates
GET    /goals/templates/:id             # Get template details
POST   /goals/from-template             # Create goal from template
```

### 7.4 Alerts

```
GET    /alerts                          # Get user's alerts
PATCH  /alerts/:id/read                 # Mark alert as read
PATCH  /alerts/preferences              # Update alert preferences
```

---

## 8. UI Components

### 8.1 Goal Dashboard

```typescript
interface GoalDashboardProps {
  goals: FinancialGoal[];
  progressSummaries: GoalProgressSummary[];
}

// Components:
// - GoalCard: Single goal with progress bar
// - GoalList: Filterable/sortable list of goals
// - ProgressChart: Visual progress over time
// - AlertBanner: Show active alerts
```

### 8.2 Goal Creation Wizard

```typescript
interface GoalWizardProps {
  budget: UnifiedBudgetModel;
  templates: GoalTemplate[];
  onSave: (goal: FinancialGoal) => void;
}

// Steps:
// 1. Choose template or custom
// 2. Configure goal details
// 3. Set target amount and date
// 4. Configure reminders
// 5. Review and create
```

### 8.3 Progress Tracker

```typescript
interface ProgressTrackerProps {
  goal: FinancialGoal;
  progressHistory: GoalProgress[];
}

// Components:
// - ProgressRing: Circular progress indicator
// - TrendChart: Progress over time
// - MilestoneList: Achieved milestones
// - ProjectionBanner: "On track to complete by..."
```

---

## 9. Database Schema

```python
# See persistence_layer.md for FinancialGoal and GoalProgress models

class GoalAlert(Base):
    """Persisted goal alerts."""
    
    __tablename__ = "goal_alerts"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    goal_id: Mapped[str] = mapped_column(String(36), ForeignKey("financial_goals.id"))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    
    alert_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    action_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class AlertPreference(Base):
    """User's alert preferences."""
    
    __tablename__ = "alert_preferences"
    
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), primary_key=True)
    
    enabled_alerts: Mapped[List[str]] = mapped_column(JSON, default=list)
    email_enabled: Mapped[bool] = mapped_column(default=True)
    push_enabled: Mapped[bool] = mapped_column(default=False)
    in_app_enabled: Mapped[bool] = mapped_column(default=True)
    
    quiet_hours_start: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    quiet_hours_end: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    
    max_alerts_per_day: Mapped[int] = mapped_column(Integer, default=5)
```

---

## 10. Example User Flows

### 10.1 Creating an Emergency Fund Goal

```
1. User clicks "Create Goal"
2. Selects "Emergency Fund" template
3. System shows: "Based on your monthly expenses ($4,500), we recommend a 3-month emergency fund of $13,500"
4. User adjusts to 6-month target: $27,000
5. User sets target date: 24 months from now
6. System calculates: "You'll need to save $1,125/month"
7. Goal created with automatic progress tracking
```

### 10.2 Tracking Progress

```
1. User uploads new monthly budget
2. System creates budget snapshot
3. Goal integration service runs:
   - Calculates savings for the month
   - Records progress entry
   - Checks if on-track
4. User sees updated progress on dashboard
5. If behind, alert is generated: "You're $300 behind on your emergency fund goal"
```

### 10.3 Reaching a Milestone

```
1. Budget sync records new progress
2. Progress crosses 50% threshold
3. Alert generated: "🎉 You're halfway to your emergency fund!"
4. Milestone badge added to goal card
5. Optional: share achievement (future feature)
```

---

## 11. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Goal creation rate | 40% of users create 1+ goals | Goals per active user |
| Progress logging | 70% log monthly progress | Entries per goal per month |
| On-track rate | 60% of goals stay on track | Goals meeting milestones |
| Completion rate | 50% of goals completed | Completed / total goals |
| Re-engagement | 80% return when alerted | Alert -> session rate |
| Template usage | 70% start from templates | Template-based goals |

