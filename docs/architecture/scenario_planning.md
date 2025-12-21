# Scenario Planning System Architecture

## Overview

The Scenario Planning System enables "What If" analysis, allowing users to model alternative financial futures and compare outcomes. This is a key differentiator from ChatGPT, which cannot maintain multiple model states or perform structured comparisons.

---

## 1. Value Proposition

### What Users Can Do

- **"What if I get a 10% raise?"** - Model income changes
- **"What if I move to a cheaper apartment?"** - Model expense changes
- **"What if I pay off debt vs invest?"** - Compare strategies
- **"What if I have a baby in 2 years?"** - Model life events
- **"What if I retire at 60 vs 65?"** - Compare retirement ages

### Why ChatGPT Can't Do This

1. **No persistent state** - Can't maintain multiple budget versions
2. **No structured comparison** - Can't show side-by-side projections
3. **Unreliable math** - Complex multi-variable calculations error-prone
4. **No interdependency modeling** - Changes to one variable don't cascade correctly

---

## 2. Core Concepts

### 2.1 Scenario Definition

```python
@dataclass
class Scenario:
    """A hypothetical version of the user's financial future."""
    
    id: str
    name: str
    description: str
    
    # Base: the starting budget model
    base_budget_id: str  # Reference to BudgetSnapshot or current session
    
    # Modifications to apply
    modifications: List[ScenarioModification]
    
    # Computed projection
    projection: Optional[ProjectionResult] = None
    
    # Metadata
    created_at: datetime
    is_baseline: bool = False  # One scenario is the "current path"
```

### 2.2 Scenario Modifications

```python
@dataclass
class ScenarioModification:
    """A single change applied to the base budget."""
    
    modification_type: ModificationType
    target: str  # What is being modified
    change: ModificationChange
    effective_date: Optional[date] = None  # When change takes effect
    description: Optional[str] = None

class ModificationType(Enum):
    """Types of modifications that can be applied."""
    
    # Income modifications
    INCOME_CHANGE = "income_change"          # Change income amount
    INCOME_ADD = "income_add"                # Add new income source
    INCOME_REMOVE = "income_remove"          # Remove income source
    
    # Expense modifications
    EXPENSE_CHANGE = "expense_change"        # Change expense amount
    EXPENSE_ADD = "expense_add"              # Add new expense
    EXPENSE_REMOVE = "expense_remove"        # Remove expense
    EXPENSE_RECLASSIFY = "expense_reclassify"  # Essential <-> Flexible
    
    # Debt modifications
    DEBT_PAYOFF = "debt_payoff"              # Accelerate payoff
    DEBT_ADD = "debt_add"                    # New debt (mortgage, loan)
    DEBT_REFINANCE = "debt_refinance"        # Change rate/terms
    
    # Asset modifications
    ASSET_ADD = "asset_add"                  # New asset
    ASSET_CHANGE = "asset_change"            # Value change
    
    # Life events
    LIFE_EVENT = "life_event"                # Major life change

@dataclass
class ModificationChange:
    """How the modification changes the target."""
    
    change_type: ChangeType  # absolute, percentage, replace
    value: Any  # The new value or change amount
    
class ChangeType(Enum):
    ABSOLUTE = "absolute"      # Add/subtract fixed amount
    PERCENTAGE = "percentage"  # Change by percentage
    REPLACE = "replace"        # Replace with new value
```

### 2.3 Scenario Set

```python
@dataclass
class ScenarioSet:
    """A collection of scenarios for comparison."""
    
    id: str
    user_id: str
    name: str
    description: str
    
    # The scenarios in this set
    scenarios: List[Scenario]
    
    # Which scenario is the baseline (current path)
    baseline_scenario_id: str
    
    # Comparison settings
    comparison_metrics: List[str]  # Which metrics to compare
    projection_years: int = 10
    
    # Metadata
    created_at: datetime
    updated_at: datetime
```

---

## 3. Common Scenario Templates

Pre-built templates for common "what if" questions.

```python
SCENARIO_TEMPLATES = {
    "income_raise": {
        "name": "Salary Increase",
        "description": "Model the impact of a raise",
        "parameters": [
            {"name": "raise_percentage", "type": "float", "default": 0.10},
            {"name": "effective_date", "type": "date", "default": "next_year"},
        ],
        "modifications": [
            {
                "type": ModificationType.INCOME_CHANGE,
                "target": "primary_income",
                "change": {"type": ChangeType.PERCENTAGE, "value": "{raise_percentage}"},
            }
        ],
    },
    
    "housing_change": {
        "name": "Move to New Housing",
        "description": "Model moving to cheaper/more expensive housing",
        "parameters": [
            {"name": "new_housing_cost", "type": "float"},
            {"name": "move_date", "type": "date"},
            {"name": "moving_expense", "type": "float", "default": 5000},
        ],
        "modifications": [
            {
                "type": ModificationType.EXPENSE_CHANGE,
                "target": "housing",
                "change": {"type": ChangeType.REPLACE, "value": "{new_housing_cost}"},
            },
            {
                "type": ModificationType.EXPENSE_ADD,
                "target": "moving",
                "change": {"type": ChangeType.ABSOLUTE, "value": "{moving_expense}"},
                "effective_date": "{move_date}",
            },
        ],
    },
    
    "debt_vs_invest": {
        "name": "Pay Off Debt vs Invest",
        "description": "Compare paying extra on debt vs investing surplus",
        "creates_comparison": True,  # Creates two scenarios
        "parameters": [
            {"name": "monthly_surplus", "type": "float"},
            {"name": "investment_return", "type": "float", "default": 0.07},
        ],
        "scenarios": [
            {
                "name": "Extra Debt Payments",
                "modifications": [
                    {
                        "type": ModificationType.DEBT_PAYOFF,
                        "target": "highest_rate_debt",
                        "change": {"type": ChangeType.ABSOLUTE, "value": "{monthly_surplus}"},
                    }
                ],
            },
            {
                "name": "Invest Instead",
                "modifications": [
                    {
                        "type": ModificationType.ASSET_ADD,
                        "target": "investment",
                        "change": {
                            "type": ChangeType.ABSOLUTE,
                            "value": {
                                "monthly_contribution": "{monthly_surplus}",
                                "annual_return": "{investment_return}",
                            },
                        },
                    }
                ],
            },
        ],
    },
    
    "new_child": {
        "name": "Having a Child",
        "description": "Model the financial impact of a new baby",
        "parameters": [
            {"name": "child_due_date", "type": "date"},
            {"name": "childcare_monthly", "type": "float", "default": 1500},
            {"name": "health_insurance_increase", "type": "float", "default": 200},
            {"name": "other_child_expenses", "type": "float", "default": 500},
        ],
        "modifications": [
            {
                "type": ModificationType.EXPENSE_ADD,
                "target": "childcare",
                "change": {"type": ChangeType.ABSOLUTE, "value": "{childcare_monthly}"},
                "effective_date": "{child_due_date}",
            },
            {
                "type": ModificationType.EXPENSE_CHANGE,
                "target": "health_insurance",
                "change": {"type": ChangeType.ABSOLUTE, "value": "{health_insurance_increase}"},
            },
            {
                "type": ModificationType.EXPENSE_ADD,
                "target": "baby_supplies",
                "change": {"type": ChangeType.ABSOLUTE, "value": "{other_child_expenses}"},
            },
        ],
    },
    
    "retirement_timing": {
        "name": "Retirement Age Comparison",
        "description": "Compare retiring at different ages",
        "creates_comparison": True,
        "parameters": [
            {"name": "early_age", "type": "int", "default": 60},
            {"name": "normal_age", "type": "int", "default": 65},
            {"name": "late_age", "type": "int", "default": 67},
        ],
        "scenarios": [
            {"name": "Retire at {early_age}", "retirement_age": "{early_age}"},
            {"name": "Retire at {normal_age}", "retirement_age": "{normal_age}"},
            {"name": "Retire at {late_age}", "retirement_age": "{late_age}"},
        ],
    },
}
```

---

## 4. Scenario Engine

### 4.1 Scenario Application

```python
class ScenarioEngine:
    """Applies scenario modifications and generates projections."""
    
    def __init__(self, projection_service: ProjectionService):
        self._projection = projection_service
    
    def apply_scenario(
        self,
        base_budget: UnifiedBudgetModel,
        scenario: Scenario,
    ) -> ModifiedBudgetModel:
        """
        Apply scenario modifications to create a modified budget.
        
        Returns a new budget model with modifications applied.
        Does not mutate the original.
        """
        modified = deepcopy(base_budget)
        
        for mod in sorted(scenario.modifications, key=lambda m: m.effective_date or date.min):
            modified = self._apply_modification(modified, mod)
        
        return modified
    
    def _apply_modification(
        self,
        budget: UnifiedBudgetModel,
        mod: ScenarioModification,
    ) -> UnifiedBudgetModel:
        """Apply a single modification to the budget."""
        
        match mod.modification_type:
            case ModificationType.INCOME_CHANGE:
                return self._modify_income(budget, mod)
            case ModificationType.EXPENSE_CHANGE:
                return self._modify_expense(budget, mod)
            case ModificationType.DEBT_ADD:
                return self._add_debt(budget, mod)
            case ModificationType.DEBT_PAYOFF:
                return self._accelerate_debt(budget, mod)
            case ModificationType.LIFE_EVENT:
                return self._apply_life_event(budget, mod)
            # ... other modification types
        
        return budget
    
    def project_scenario(
        self,
        scenario: Scenario,
        base_budget: UnifiedBudgetModel,
        years: int = 10,
    ) -> ScenarioProjection:
        """Generate full projection for a scenario."""
        
        modified_budget = self.apply_scenario(base_budget, scenario)
        
        # Generate projections using projection service
        projections = {
            "net_worth": self._projection.project_net_worth(modified_budget, years),
            "debt_payoff": self._projection.project_debt_payoff(modified_budget),
            "savings": self._projection.project_savings(modified_budget, years),
        }
        
        return ScenarioProjection(
            scenario_id=scenario.id,
            modified_budget=modified_budget,
            projections=projections,
            computed_at=datetime.now(),
        )
```

### 4.2 Scenario Comparison

```python
@dataclass
class ScenarioComparison:
    """Side-by-side comparison of multiple scenarios."""
    
    scenarios: List[ScenarioProjection]
    baseline_id: str
    
    # Comparison metrics
    net_worth_comparison: NetWorthComparison
    debt_payoff_comparison: DebtPayoffComparison
    savings_comparison: SavingsComparison
    
    # Summary insights
    insights: List[ComparisonInsight]
    recommendation: Optional[str]

@dataclass
class NetWorthComparison:
    """Compare net worth trajectories across scenarios."""
    
    # Final values
    final_values: Dict[str, float]  # scenario_id -> final net worth
    
    # Difference from baseline
    differences_from_baseline: Dict[str, float]
    
    # Year-by-year comparison
    yearly_comparison: List[Dict[str, float]]  # year -> {scenario_id: value}
    
    # Best/worst
    best_scenario_id: str
    worst_scenario_id: str
    
    # Crossover points (when scenarios become better/worse than baseline)
    crossover_points: Dict[str, Optional[int]]  # scenario_id -> year

@dataclass
class ComparisonInsight:
    """A key takeaway from scenario comparison."""
    
    insight_type: str  # "warning", "opportunity", "tradeoff", "recommendation"
    title: str
    description: str
    affected_scenarios: List[str]
    metric: str
    impact_amount: Optional[float]

class ScenarioComparer:
    """Generates comparisons between scenarios."""
    
    def compare(
        self,
        projections: List[ScenarioProjection],
        baseline_id: str,
    ) -> ScenarioComparison:
        """Compare multiple scenario projections."""
        
        baseline = next(p for p in projections if p.scenario_id == baseline_id)
        
        return ScenarioComparison(
            scenarios=projections,
            baseline_id=baseline_id,
            net_worth_comparison=self._compare_net_worth(projections, baseline),
            debt_payoff_comparison=self._compare_debt_payoff(projections, baseline),
            savings_comparison=self._compare_savings(projections, baseline),
            insights=self._generate_insights(projections, baseline),
            recommendation=self._generate_recommendation(projections, baseline),
        )
    
    def _generate_insights(
        self,
        projections: List[ScenarioProjection],
        baseline: ScenarioProjection,
    ) -> List[ComparisonInsight]:
        """Generate key insights from comparison."""
        
        insights = []
        
        # Check for significant net worth differences
        for proj in projections:
            if proj.scenario_id == baseline.scenario_id:
                continue
            
            diff = proj.final_net_worth - baseline.final_net_worth
            if abs(diff) > baseline.final_net_worth * 0.1:  # >10% difference
                insights.append(ComparisonInsight(
                    insight_type="opportunity" if diff > 0 else "warning",
                    title=f"Significant impact on net worth",
                    description=f"This scenario results in ${abs(diff):,.0f} "
                               f"{'more' if diff > 0 else 'less'} net worth after 10 years.",
                    affected_scenarios=[proj.scenario_id],
                    metric="net_worth",
                    impact_amount=diff,
                ))
        
        # Check for debt payoff timing
        # Check for retirement readiness impact
        # ... etc
        
        return insights
```

---

## 5. Persistence Model

### 5.1 Database Schema Extensions

```python
class ScenarioSet(Base):
    """Persisted scenario set for a user."""
    
    __tablename__ = "scenario_sets"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # Reference to base budget
    base_snapshot_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    
    # Configuration
    projection_years: Mapped[int] = mapped_column(Integer, default=10)
    comparison_metrics: Mapped[List[str]] = mapped_column(JSON, default=list)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    scenarios: Mapped[List["SavedScenario"]] = relationship(back_populates="scenario_set")
    user: Mapped["User"] = relationship()


class SavedScenario(Base):
    """Individual scenario within a set."""
    
    __tablename__ = "saved_scenarios"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    scenario_set_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scenario_sets.id"), nullable=False
    )
    
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # Is this the baseline scenario?
    is_baseline: Mapped[bool] = mapped_column(default=False)
    
    # Modifications (JSON-serialized)
    modifications: Mapped[List[Dict]] = mapped_column(JSON, default=list)
    
    # Cached projection results
    projection_cache: Mapped[Optional[Dict]] = mapped_column(JSON, nullable=True)
    projection_cached_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    scenario_set: Mapped["ScenarioSet"] = relationship(back_populates="scenarios")
```

---

## 6. API Endpoints

### 6.1 Scenario Set Management

```
# Scenario Sets
POST   /scenarios/sets                    # Create new scenario set
GET    /scenarios/sets                    # List user's scenario sets
GET    /scenarios/sets/:id                # Get scenario set with scenarios
DELETE /scenarios/sets/:id                # Delete scenario set

# Individual Scenarios
POST   /scenarios/sets/:id/scenarios      # Add scenario to set
GET    /scenarios/sets/:id/scenarios/:sid # Get scenario details
PATCH  /scenarios/sets/:id/scenarios/:sid # Update scenario
DELETE /scenarios/sets/:id/scenarios/:sid # Remove scenario from set

# Projections
POST   /scenarios/sets/:id/project        # Project all scenarios in set
GET    /scenarios/sets/:id/compare        # Get comparison of all scenarios

# Templates
GET    /scenarios/templates               # List available templates
POST   /scenarios/from-template           # Create scenario from template
```

### 6.2 Quick "What If" API

For single question analysis without creating a full scenario set:

```
POST /scenarios/quick-compare
Body: {
    "question": "What if I get a 10% raise?",
    "budget_id": "...",
    "modifications": [...],
    "compare_to_baseline": true,
    "projection_years": 10
}

Response: {
    "baseline": {...},
    "modified": {...},
    "comparison": {
        "net_worth_difference": 45000,
        "debt_payoff_months_saved": 8,
        "insights": [...]
    }
}
```

---

## 7. UI Components

### 7.1 Scenario Builder

```typescript
interface ScenarioBuilderProps {
  baseBudget: UnifiedBudgetModel;
  onSave: (scenario: Scenario) => void;
}

// Components needed:
// - ModificationSelector: Choose what to modify
// - ModificationEditor: Configure the modification
// - TimelinePreview: Show when modifications take effect
// - ImpactPreview: Quick preview of modification impact
```

### 7.2 Comparison View

```typescript
interface ComparisonViewProps {
  scenarios: ScenarioProjection[];
  baseline: ScenarioProjection;
  metrics: string[];
}

// Components needed:
// - SideBySideTable: Compare key metrics
// - TrajectoryChart: Overlay multiple net worth paths
// - InsightCards: Display key takeaways
// - RecommendationBanner: Suggested best path
```

### 7.3 Template Gallery

```typescript
interface TemplateGalleryProps {
  onSelectTemplate: (template: ScenarioTemplate) => void;
}

// Common templates:
// - "Income Changes" (raise, job loss, side income)
// - "Housing Decisions" (move, buy, rent)
// - "Family Changes" (marriage, children, divorce)
// - "Debt Strategies" (pay off vs invest, refinance)
// - "Retirement Planning" (timing, contributions)
```

---

## 8. Integration with Existing Services

### 8.1 API Gateway Integration

```python
# services/api-gateway/src/routes/scenarios.py

from fastapi import APIRouter, Depends
from services.scenarios import ScenarioService

router = APIRouter(prefix="/scenarios", tags=["scenarios"])

@router.post("/sets/{set_id}/project")
async def project_scenario_set(
    set_id: str,
    projection_service: ProjectionService = Depends(get_projection_service),
    scenario_service: ScenarioService = Depends(get_scenario_service),
) -> ScenarioComparison:
    """Project all scenarios in a set and return comparison."""
    scenario_set = await scenario_service.get_set(set_id)
    projections = []
    
    for scenario in scenario_set.scenarios:
        projection = await projection_service.project_scenario(
            scenario,
            scenario_set.base_budget,
            scenario_set.projection_years,
        )
        projections.append(projection)
    
    return scenario_service.compare(projections, scenario_set.baseline_scenario_id)
```

### 8.2 Projection Service Integration

The Scenario Planning System uses the Projection Service for all calculations:

```python
# Scenario engine delegates to projection service
class ScenarioEngine:
    def __init__(self, projection_service: ProjectionService):
        self._projection = projection_service
    
    def project_scenario(self, scenario: Scenario, budget: UnifiedBudgetModel):
        modified_budget = self.apply_scenario(budget, scenario)
        return self._projection.project_combined(modified_budget)
```

---

## 9. Example Use Cases

### 9.1 "Should I pay off debt or invest?"

```python
# User has $500/month surplus, $10k credit card debt at 18%

scenarios = [
    Scenario(
        name="Pay off debt first",
        modifications=[
            ScenarioModification(
                modification_type=ModificationType.DEBT_PAYOFF,
                target="credit_card",
                change=ModificationChange(ChangeType.ABSOLUTE, 500),
            ),
        ],
    ),
    Scenario(
        name="Invest instead",
        modifications=[
            ScenarioModification(
                modification_type=ModificationType.ASSET_ADD,
                target="investment_account",
                change=ModificationChange(ChangeType.REPLACE, {
                    "monthly_contribution": 500,
                    "annual_return": 0.07,
                }),
            ),
        ],
    ),
    Scenario(
        name="Split 50/50",
        modifications=[
            ScenarioModification(
                modification_type=ModificationType.DEBT_PAYOFF,
                target="credit_card",
                change=ModificationChange(ChangeType.ABSOLUTE, 250),
            ),
            ScenarioModification(
                modification_type=ModificationType.ASSET_ADD,
                target="investment_account",
                change=ModificationChange(ChangeType.REPLACE, {
                    "monthly_contribution": 250,
                    "annual_return": 0.07,
                }),
            ),
        ],
    ),
]

# Comparison shows:
# - "Pay off debt first" has best net worth at year 3
# - "Invest instead" has best net worth at year 10
# - Insight: "At 18% interest, paying off debt is guaranteed 18% return"
```

### 9.2 "What if we have a baby?"

```python
# From template
scenario = create_from_template(
    "new_child",
    parameters={
        "child_due_date": date(2025, 6, 1),
        "childcare_monthly": 2000,
        "health_insurance_increase": 300,
        "other_child_expenses": 600,
    },
)

# Comparison shows:
# - Monthly surplus drops from $800 to -$100 (deficit)
# - Emergency fund will be depleted in 8 months
# - Debt payoff delayed by 2 years
# - Insight: "Consider building emergency fund before baby arrives"
```

---

## 10. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Scenario creation rate | 30% of users create scenarios | Scenarios per user |
| Template usage | 50% start from templates | Template-based vs custom |
| Comparison engagement | 80% view comparisons | Comparison views per scenario set |
| Insight action rate | 20% act on insights | Track if users implement suggested changes |
| Return engagement | 40% revisit scenarios | Scenario views over time |

