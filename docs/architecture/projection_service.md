# Multi-Year Projection Service Architecture

> **Status: Future Planning** — This service has NOT been implemented.
> This document describes a proposed feature for future development.

## Overview

The Projection Service provides deterministic financial modeling capabilities that differentiate LifePath Planner from ChatGPT. It computes reliable multi-year projections for net worth, debt payoff, savings growth, and retirement readiness using mathematical formulas rather than LLM inference.

---

## 1. Service Purpose

### Why This Differentiates From ChatGPT

ChatGPT struggles with:
- Compound interest calculations over many periods
- Complex debt amortization schedules
- Investment growth with variable contributions
- Multi-variable optimization (debt vs savings)
- Consistent numerical precision

The Projection Service provides:
- **Deterministic calculations** - Same inputs always produce same outputs
- **Financial accuracy** - Uses standard formulas (compound interest, amortization)
- **Scenario comparison** - Run multiple projections and compare
- **Goal feasibility** - Calculate if goals are achievable
- **Actionable insights** - Show exactly what changes impact outcomes

---

## 2. Service Architecture

### 2.1 Service Location

```
services/projection-service/
├── README.md
├── src/
│   ├── __init__.py
│   ├── main.py                    # FastAPI application
│   ├── models/
│   │   ├── __init__.py
│   │   ├── projection_request.py  # Input models
│   │   ├── projection_result.py   # Output models
│   │   └── financial_events.py    # Life events modeling
│   ├── engines/
│   │   ├── __init__.py
│   │   ├── debt_payoff.py         # Debt amortization
│   │   ├── savings_growth.py      # Compound growth
│   │   ├── net_worth.py           # Net worth trajectory
│   │   ├── retirement.py          # Retirement readiness
│   │   └── combined.py            # Multi-goal optimization
│   └── utils/
│       ├── __init__.py
│       ├── financial_math.py      # Core formulas
│       └── date_utils.py          # Period calculations
└── tests/
    ├── __init__.py
    ├── test_debt_payoff.py
    ├── test_savings_growth.py
    ├── test_net_worth.py
    └── fixtures/
```

### 2.2 Port Allocation

| Service | Port | Description |
|---------|------|-------------|
| Projection Service | 8004 | Multi-year financial projections |

---

## 3. Core Calculation Engines

### 3.1 Debt Payoff Engine

Calculates debt elimination timelines with various strategies.

```python
@dataclass
class DebtPayoffRequest:
    """Input for debt payoff projection."""
    debts: List[DebtInfo]
    monthly_surplus: float  # Available for extra payments
    strategy: PayoffStrategy  # avalanche, snowball, custom
    start_date: date

@dataclass
class DebtInfo:
    """Individual debt details."""
    id: str
    name: str
    balance: float
    interest_rate: float  # Annual APR as decimal (0.05 = 5%)
    min_payment: float
    priority: Optional[int] = None  # For custom strategy

@dataclass
class DebtPayoffResult:
    """Output of debt payoff projection."""
    total_months_to_payoff: int
    payoff_date: date
    total_interest_paid: float
    total_principal_paid: float
    monthly_schedule: List[MonthlyPayment]
    debt_free_date: date
    
    # Per-debt breakdown
    per_debt_timeline: Dict[str, DebtTimeline]

class PayoffStrategy(Enum):
    AVALANCHE = "avalanche"      # Highest interest first
    SNOWBALL = "snowball"        # Smallest balance first
    CUSTOM = "custom"            # User-defined priority
```

**Key Formulas:**

```python
def calculate_amortization_payment(
    principal: float,
    annual_rate: float,
    months: int,
) -> float:
    """Calculate fixed payment for loan amortization."""
    if annual_rate == 0:
        return principal / months
    monthly_rate = annual_rate / 12
    return principal * (monthly_rate * (1 + monthly_rate)**months) / ((1 + monthly_rate)**months - 1)

def calculate_payoff_months(
    balance: float,
    annual_rate: float,
    monthly_payment: float,
) -> int:
    """Calculate months to pay off debt with given payment."""
    if annual_rate == 0:
        return math.ceil(balance / monthly_payment)
    monthly_rate = annual_rate / 12
    if monthly_payment <= balance * monthly_rate:
        return float('inf')  # Never pays off
    return math.ceil(
        -math.log(1 - (balance * monthly_rate / monthly_payment)) / 
        math.log(1 + monthly_rate)
    )

def calculate_total_interest(
    balance: float,
    annual_rate: float,
    monthly_payment: float,
    months: int,
) -> float:
    """Calculate total interest paid over loan lifetime."""
    total_paid = monthly_payment * months
    return total_paid - balance
```

### 3.2 Savings Growth Engine

Projects savings/investment growth with contributions.

```python
@dataclass
class SavingsGrowthRequest:
    """Input for savings projection."""
    current_balance: float
    monthly_contribution: float
    annual_return: float  # Expected return as decimal
    projection_years: int
    contribution_increase: float = 0.0  # Annual increase rate
    inflation_rate: float = 0.03  # For real-value calculations

@dataclass
class SavingsGrowthResult:
    """Output of savings projection."""
    final_balance: float
    final_balance_inflation_adjusted: float
    total_contributions: float
    total_growth: float
    yearly_snapshots: List[YearlySnapshot]
    
    # Goal-related
    target_amount: Optional[float]
    target_reached_month: Optional[int]

@dataclass
class YearlySnapshot:
    """End-of-year state."""
    year: int
    balance: float
    contributions_ytd: float
    growth_ytd: float
    balance_inflation_adjusted: float
```

**Key Formulas:**

```python
def future_value_with_contributions(
    present_value: float,
    monthly_contribution: float,
    annual_rate: float,
    months: int,
) -> float:
    """
    Calculate future value with regular contributions.
    FV = PV(1+r)^n + PMT × ((1+r)^n - 1) / r
    """
    monthly_rate = annual_rate / 12
    if monthly_rate == 0:
        return present_value + (monthly_contribution * months)
    
    compound_factor = (1 + monthly_rate) ** months
    annuity_factor = (compound_factor - 1) / monthly_rate
    
    return (present_value * compound_factor) + (monthly_contribution * annuity_factor)

def months_to_reach_target(
    current_balance: float,
    monthly_contribution: float,
    annual_rate: float,
    target: float,
) -> int:
    """Calculate months needed to reach savings target."""
    monthly_rate = annual_rate / 12
    if monthly_rate == 0:
        return math.ceil((target - current_balance) / monthly_contribution)
    
    # Solve: target = PV(1+r)^n + PMT×((1+r)^n - 1)/r
    # Iterative approach for precision
    months = 0
    balance = current_balance
    while balance < target and months < 600:  # Cap at 50 years
        balance = balance * (1 + monthly_rate) + monthly_contribution
        months += 1
    return months
```

### 3.3 Net Worth Projection Engine

Combines assets, debts, income, and expenses for comprehensive view.

```python
@dataclass
class NetWorthRequest:
    """Input for net worth projection."""
    # Current state
    current_assets: List[Asset]
    current_debts: List[DebtInfo]
    monthly_income: float
    monthly_expenses: float
    
    # Growth assumptions
    asset_growth_rates: Dict[str, float]  # By asset type
    income_growth_rate: float = 0.03
    expense_growth_rate: float = 0.02
    
    # Projection parameters
    projection_years: int = 10
    
    # Life events
    planned_events: List[LifeEvent] = None

@dataclass
class Asset:
    """Individual asset."""
    id: str
    name: str
    value: float
    asset_type: AssetType  # cash, investment, real_estate, retirement
    annual_contribution: float = 0.0

class AssetType(Enum):
    CASH = "cash"
    INVESTMENT = "investment"
    REAL_ESTATE = "real_estate"
    RETIREMENT = "retirement"
    OTHER = "other"

@dataclass
class NetWorthResult:
    """Output of net worth projection."""
    # Trajectory
    yearly_net_worth: List[YearlyNetWorth]
    final_net_worth: float
    
    # Breakdown
    final_assets: float
    final_debts: float
    
    # Milestones
    debt_free_year: Optional[int]
    millionaire_year: Optional[int]
    
    # Insights
    average_annual_growth: float
    savings_rate_trajectory: List[float]
```

### 3.4 Retirement Readiness Engine

Calculates if user is on track for retirement.

```python
@dataclass
class RetirementRequest:
    """Input for retirement projection."""
    current_age: int
    retirement_age: int = 65
    life_expectancy: int = 90
    
    # Current state
    current_retirement_savings: float
    current_monthly_contribution: float
    
    # Assumptions
    pre_retirement_return: float = 0.07
    post_retirement_return: float = 0.04
    inflation_rate: float = 0.03
    
    # Desired retirement
    desired_annual_income: float  # In today's dollars
    social_security_annual: float = 0.0
    pension_annual: float = 0.0
    
    # Contribution changes
    annual_contribution_increase: float = 0.02

@dataclass
class RetirementResult:
    """Output of retirement projection."""
    # Can they retire as planned?
    on_track: bool
    confidence_level: float  # 0-1 based on assumptions
    
    # Projections
    projected_savings_at_retirement: float
    sustainable_annual_withdrawal: float  # 4% rule adjusted
    
    # Gap analysis
    annual_income_gap: float  # Positive = surplus, negative = shortfall
    additional_monthly_savings_needed: float
    
    # Alternatives
    delayed_retirement_age: Optional[int]  # Age if they need to wait
    reduced_lifestyle_amount: Optional[float]  # Income they can sustain
    
    # Trajectory
    yearly_projections: List[RetirementYearSnapshot]
```

**Key Formulas:**

```python
def calculate_sustainable_withdrawal(
    portfolio_value: float,
    years_in_retirement: int,
    annual_return: float = 0.04,
    inflation_rate: float = 0.03,
) -> float:
    """
    Calculate sustainable annual withdrawal using modified 4% rule.
    Adjusts for expected retirement length and returns.
    """
    real_return = (1 + annual_return) / (1 + inflation_rate) - 1
    if real_return <= 0:
        return portfolio_value / years_in_retirement
    
    # Present value of annuity formula
    withdrawal_rate = real_return / (1 - (1 + real_return) ** -years_in_retirement)
    return portfolio_value * withdrawal_rate

def calculate_required_savings(
    desired_annual_income: float,
    years_in_retirement: int,
    annual_return: float = 0.04,
    inflation_rate: float = 0.03,
) -> float:
    """Calculate nest egg needed to sustain desired income."""
    real_return = (1 + annual_return) / (1 + inflation_rate) - 1
    if real_return <= 0:
        return desired_annual_income * years_in_retirement
    
    # Future value of annuity formula
    return desired_annual_income * (1 - (1 + real_return) ** -years_in_retirement) / real_return
```

---

## 4. Life Events Modeling

Support for major financial events that impact projections.

```python
@dataclass
class LifeEvent:
    """A significant financial event."""
    event_type: LifeEventType
    date: date
    details: Dict[str, Any]

class LifeEventType(Enum):
    JOB_CHANGE = "job_change"          # {"new_income": float}
    HOME_PURCHASE = "home_purchase"     # {"price": float, "down_payment": float, "mortgage_rate": float}
    HOME_SALE = "home_sale"             # {"sale_price": float}
    MARRIAGE = "marriage"               # {"spouse_income": float, "spouse_debts": List[DebtInfo]}
    CHILD = "child"                     # {"additional_monthly_expense": float}
    COLLEGE = "college"                 # {"annual_cost": float, "years": int}
    INHERITANCE = "inheritance"         # {"amount": float}
    MAJOR_EXPENSE = "major_expense"     # {"amount": float, "category": str}
    RETIREMENT_START = "retirement_start"

def apply_life_event(
    projection_state: ProjectionState,
    event: LifeEvent,
) -> ProjectionState:
    """Modify projection state based on life event."""
    match event.event_type:
        case LifeEventType.JOB_CHANGE:
            projection_state.monthly_income = event.details["new_income"]
        case LifeEventType.HOME_PURCHASE:
            # Add mortgage to debts, add home to assets
            ...
        case LifeEventType.CHILD:
            projection_state.monthly_expenses += event.details["additional_monthly_expense"]
        # ... etc
    return projection_state
```

---

## 5. API Endpoints

### 5.1 Projection Endpoints

```
POST /projections/debt-payoff
    Body: DebtPayoffRequest
    Returns: DebtPayoffResult

POST /projections/savings-growth
    Body: SavingsGrowthRequest
    Returns: SavingsGrowthResult

POST /projections/net-worth
    Body: NetWorthRequest
    Returns: NetWorthResult

POST /projections/retirement
    Body: RetirementRequest
    Returns: RetirementResult

POST /projections/combined
    Body: CombinedProjectionRequest
    Returns: CombinedProjectionResult
```

### 5.2 Request/Response Examples

**Debt Payoff Example:**

```json
// Request
{
  "debts": [
    {
      "id": "credit-card",
      "name": "Chase Visa",
      "balance": 8500,
      "interest_rate": 0.219,
      "min_payment": 170
    },
    {
      "id": "car-loan",
      "name": "Auto Loan",
      "balance": 12000,
      "interest_rate": 0.055,
      "min_payment": 280
    }
  ],
  "monthly_surplus": 400,
  "strategy": "avalanche",
  "start_date": "2024-02-01"
}

// Response
{
  "total_months_to_payoff": 28,
  "payoff_date": "2026-05-01",
  "total_interest_paid": 2847.32,
  "total_principal_paid": 20500,
  "debt_free_date": "2026-05-01",
  "per_debt_timeline": {
    "credit-card": {
      "payoff_month": 16,
      "payoff_date": "2025-05-01",
      "total_interest": 1923.45
    },
    "car-loan": {
      "payoff_month": 28,
      "payoff_date": "2026-05-01",
      "total_interest": 923.87
    }
  }
}
```

---

## 6. Integration Points

### 6.1 With API Gateway

```python
# In services/api-gateway/src/http_client.py

async def get_debt_projection(
    debts: List[Dict],
    monthly_surplus: float,
    strategy: str = "avalanche",
) -> Dict[str, Any]:
    """Request debt payoff projection from projection service."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PROJECTION_SERVICE_URL}/projections/debt-payoff",
            json={
                "debts": debts,
                "monthly_surplus": monthly_surplus,
                "strategy": strategy,
                "start_date": date.today().isoformat(),
            },
        )
        return response.json()
```

### 6.2 With Budget Model

```python
def create_projection_from_budget(
    model: UnifiedBudgetModel,
    projection_type: str,
    **kwargs,
) -> ProjectionResult:
    """Convert unified budget model to projection request."""
    if projection_type == "debt_payoff":
        return DebtPayoffRequest(
            debts=[
                DebtInfo(
                    id=debt.id,
                    name=debt.name,
                    balance=debt.balance,
                    interest_rate=debt.interest_rate / 100,
                    min_payment=debt.min_payment,
                )
                for debt in model.debts
            ],
            monthly_surplus=model.summary.surplus,
            **kwargs,
        )
    # ... other projection types
```

---

## 7. Error Handling

```python
class ProjectionError(Exception):
    """Base exception for projection errors."""
    pass

class InvalidInputError(ProjectionError):
    """Input validation failed."""
    pass

class InfeasibleProjectionError(ProjectionError):
    """Projection cannot be computed (e.g., payment < interest)."""
    pass

# Example validation
def validate_debt_payoff_request(request: DebtPayoffRequest) -> None:
    for debt in request.debts:
        monthly_interest = debt.balance * (debt.interest_rate / 12)
        if debt.min_payment <= monthly_interest:
            raise InfeasibleProjectionError(
                f"Minimum payment for {debt.name} (${debt.min_payment:.2f}) "
                f"is less than monthly interest (${monthly_interest:.2f}). "
                "Debt will never be paid off."
            )
```

---

## 8. Testing Strategy

### Unit Tests

```python
def test_compound_interest_calculation():
    """Verify compound interest formula accuracy."""
    result = future_value_with_contributions(
        present_value=10000,
        monthly_contribution=500,
        annual_rate=0.07,
        months=120,  # 10 years
    )
    # Expected: $106,657.78
    assert abs(result - 106657.78) < 0.01

def test_debt_payoff_avalanche():
    """Verify avalanche strategy pays highest rate first."""
    request = DebtPayoffRequest(
        debts=[
            DebtInfo("low", "Low Rate", 5000, 0.05, 100),
            DebtInfo("high", "High Rate", 3000, 0.20, 60),
        ],
        monthly_surplus=200,
        strategy=PayoffStrategy.AVALANCHE,
        start_date=date(2024, 1, 1),
    )
    result = calculate_debt_payoff(request)
    
    # High rate debt should be paid first
    assert result.per_debt_timeline["high"].payoff_month < \
           result.per_debt_timeline["low"].payoff_month
```

### Integration Tests

```python
async def test_projection_endpoint():
    """Test full projection request/response cycle."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/projections/savings-growth",
            json={
                "current_balance": 10000,
                "monthly_contribution": 500,
                "annual_return": 0.07,
                "projection_years": 10,
            },
        )
        assert response.status_code == 200
        result = response.json()
        assert result["final_balance"] > 80000
```

---

## 9. Performance Considerations

### Computation Limits

```python
MAX_PROJECTION_MONTHS = 600  # 50 years
MAX_DEBTS = 20
MAX_ASSETS = 50
MAX_LIFE_EVENTS = 100

def validate_projection_bounds(request: ProjectionRequest) -> None:
    if request.projection_years * 12 > MAX_PROJECTION_MONTHS:
        raise InvalidInputError(f"Projection limited to {MAX_PROJECTION_MONTHS // 12} years")
```

### Caching

```python
# Cache projection results for identical inputs
from functools import lru_cache

@lru_cache(maxsize=1000)
def cached_debt_payoff(request_hash: str) -> DebtPayoffResult:
    """Cache projection results for repeated queries."""
    ...
```

---

## 10. Future Enhancements

### Monte Carlo Simulations

Add probabilistic projections for investment returns:

```python
def monte_carlo_projection(
    request: SavingsGrowthRequest,
    simulations: int = 1000,
    return_std_dev: float = 0.15,
) -> MonteCarloResult:
    """
    Run multiple simulations with variable returns.
    Returns percentile outcomes (10th, 50th, 90th).
    """
    ...
```

### Tax-Aware Projections

```python
@dataclass
class TaxAwareRequest:
    """Include tax implications in projections."""
    marginal_tax_rate: float
    capital_gains_rate: float
    account_types: Dict[str, AccountType]  # traditional, roth, taxable
```

### Inflation Scenarios

```python
def project_with_inflation_scenarios(
    base_request: ProjectionRequest,
    inflation_scenarios: List[float],  # e.g., [0.02, 0.03, 0.05]
) -> Dict[str, ProjectionResult]:
    """Run projection under different inflation assumptions."""
    ...
```

