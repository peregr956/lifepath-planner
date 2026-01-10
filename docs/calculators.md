# Financial Calculators Specification

This document specifies the financial calculators to be implemented in Phase 9 of the LifePath Planner platform expansion. Each calculator is designed to be both standalone (accessible via the calculator library) and integratable into planning workflows.

---

## Overview

### Calculator Categories

| Category | Calculators | Primary Use Case |
|----------|-------------|------------------|
| Debt Management | Debt Payoff, Mortgage | Eliminating debt, home buying |
| Savings & Growth | Savings Growth, Investment Return | Building wealth, compound growth |
| Retirement | Retirement Readiness | Long-term planning |
| Net Worth | Net Worth Tracker | Overall financial health |
| Tax | Tax Estimator | Tax planning and optimization |

### Design Principles

1. **Deterministic**: All calculations use standard financial formulas — no LLM inference
2. **Accurate**: Use precise decimal arithmetic for financial calculations
3. **Transparent**: Show calculation steps and assumptions to users
4. **Integratable**: Each calculator exposes API endpoints and can be embedded in workflows
5. **Accessible**: All calculators meet WCAG 2.1 AA accessibility standards

---

## 1. Debt Payoff Calculator

### Purpose

Calculate debt payoff timelines and compare different payoff strategies (avalanche vs snowball vs custom).

### Inputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `debts` | Array | Yes | List of debts to analyze |
| `debts[].name` | string | Yes | Debt name (e.g., "Chase Visa") |
| `debts[].balance` | number | Yes | Current balance |
| `debts[].interest_rate` | number | Yes | Annual interest rate (as decimal, e.g., 0.199 for 19.9%) |
| `debts[].min_payment` | number | Yes | Minimum monthly payment |
| `debts[].priority` | number | No | Custom priority (for custom strategy) |
| `monthly_surplus` | number | Yes | Extra money available for debt payments |
| `strategy` | enum | Yes | `avalanche`, `snowball`, or `custom` |
| `start_date` | date | No | Start date for calculations (defaults to today) |

### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `total_months_to_payoff` | number | Months until all debts are paid |
| `payoff_date` | date | Date when debt-free |
| `total_interest_paid` | number | Total interest across all debts |
| `total_principal_paid` | number | Total principal paid |
| `per_debt_timeline` | object | Per-debt breakdown |
| `per_debt_timeline[].payoff_month` | number | Month this debt is paid off |
| `per_debt_timeline[].payoff_date` | date | Date this debt is paid off |
| `per_debt_timeline[].total_interest` | number | Interest paid on this debt |
| `monthly_schedule` | array | Month-by-month payment schedule |

### Formulas

#### Months to Payoff (Single Debt)

```
If rate = 0:
    months = balance / payment

Otherwise:
    monthly_rate = annual_rate / 12
    months = ceil(-log(1 - (balance × monthly_rate / payment)) / log(1 + monthly_rate))
```

#### Total Interest Paid

```
total_interest = (monthly_payment × months) - principal
```

#### Strategy Definitions

- **Avalanche**: Pay debts in order of highest interest rate first
- **Snowball**: Pay debts in order of smallest balance first
- **Custom**: Pay debts in user-defined priority order

### API Endpoint

```
POST /calculators/debt-payoff
Content-Type: application/json

{
  "debts": [
    {
      "name": "Credit Card",
      "balance": 8500,
      "interest_rate": 0.219,
      "min_payment": 170
    },
    {
      "name": "Car Loan",
      "balance": 12000,
      "interest_rate": 0.055,
      "min_payment": 280
    }
  ],
  "monthly_surplus": 400,
  "strategy": "avalanche"
}
```

### UI Components

- Debt entry form (add/edit/remove debts)
- Strategy selector (avalanche, snowball, custom)
- Monthly surplus slider
- Results display:
  - Payoff timeline chart
  - Per-debt progress bars
  - Interest savings comparison between strategies
  - Month-by-month payment schedule table

---

## 2. Savings Growth Calculator

### Purpose

Project savings growth over time with regular contributions and compound interest.

### Inputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `current_balance` | number | Yes | Starting balance |
| `monthly_contribution` | number | Yes | Monthly contribution amount |
| `annual_return` | number | Yes | Expected annual return (as decimal) |
| `projection_years` | number | Yes | Number of years to project |
| `contribution_increase` | number | No | Annual contribution increase rate (default 0) |
| `inflation_rate` | number | No | Inflation rate for real-value calculation (default 0.03) |
| `target_amount` | number | No | Optional goal amount |

### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `final_balance` | number | Balance at end of projection |
| `final_balance_inflation_adjusted` | number | Real value adjusted for inflation |
| `total_contributions` | number | Sum of all contributions |
| `total_growth` | number | Interest/returns earned |
| `yearly_snapshots` | array | Year-by-year breakdown |
| `target_reached_month` | number | Month when target is reached (if set) |
| `target_reached_date` | date | Date when target is reached (if set) |

### Formulas

#### Future Value with Contributions

```
monthly_rate = annual_rate / 12

If monthly_rate = 0:
    FV = present_value + (monthly_contribution × months)

Otherwise:
    compound_factor = (1 + monthly_rate)^months
    annuity_factor = (compound_factor - 1) / monthly_rate
    FV = (present_value × compound_factor) + (monthly_contribution × annuity_factor)
```

#### Months to Target

```
Iterative calculation:
    balance = current_balance
    months = 0
    while balance < target and months < 600:
        balance = balance × (1 + monthly_rate) + monthly_contribution
        months += 1
    return months
```

#### Inflation Adjustment

```
real_value = nominal_value / (1 + inflation_rate)^years
```

### API Endpoint

```
POST /calculators/savings-growth
Content-Type: application/json

{
  "current_balance": 10000,
  "monthly_contribution": 500,
  "annual_return": 0.07,
  "projection_years": 10,
  "target_amount": 100000
}
```

### UI Components

- Input form with sliders for key values
- Interactive chart showing growth over time
- Contribution vs growth breakdown (pie chart)
- Goal progress indicator (if target set)
- Year-by-year table with toggleable details
- "What if" quick adjustments (change contribution, rate)

---

## 3. Retirement Calculator

### Purpose

Determine retirement readiness, required savings, and sustainable withdrawal rates.

### Inputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `current_age` | number | Yes | User's current age |
| `retirement_age` | number | Yes | Planned retirement age (default 65) |
| `life_expectancy` | number | No | Expected lifespan (default 90) |
| `current_retirement_savings` | number | Yes | Current retirement account balance |
| `current_monthly_contribution` | number | Yes | Monthly retirement contributions |
| `pre_retirement_return` | number | No | Expected return before retirement (default 0.07) |
| `post_retirement_return` | number | No | Expected return during retirement (default 0.04) |
| `inflation_rate` | number | No | Expected inflation (default 0.03) |
| `desired_annual_income` | number | Yes | Desired annual income in retirement (today's dollars) |
| `social_security_annual` | number | No | Expected Social Security income (default 0) |
| `pension_annual` | number | No | Expected pension income (default 0) |
| `annual_contribution_increase` | number | No | Annual increase in contributions (default 0.02) |

### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `on_track` | boolean | Whether user is on track for retirement |
| `confidence_level` | number | Confidence level (0-1) based on assumptions |
| `projected_savings_at_retirement` | number | Projected retirement balance |
| `sustainable_annual_withdrawal` | number | Safe annual withdrawal amount |
| `annual_income_gap` | number | Gap between desired and projected income |
| `additional_monthly_savings_needed` | number | Extra savings needed to close gap |
| `delayed_retirement_age` | number | Alternative retirement age if underfunded |
| `reduced_lifestyle_amount` | number | Sustainable income at current savings rate |
| `yearly_projections` | array | Year-by-year projection through retirement |

### Formulas

#### Sustainable Withdrawal (Modified 4% Rule)

```
real_return = (1 + annual_return) / (1 + inflation_rate) - 1

If real_return <= 0:
    withdrawal = portfolio_value / years_in_retirement

Otherwise:
    withdrawal_rate = real_return / (1 - (1 + real_return)^(-years_in_retirement))
    withdrawal = portfolio_value × withdrawal_rate
```

#### Required Nest Egg

```
real_return = (1 + annual_return) / (1 + inflation_rate) - 1

If real_return <= 0:
    required = desired_annual_income × years_in_retirement

Otherwise:
    required = desired_annual_income × (1 - (1 + real_return)^(-years_in_retirement)) / real_return
```

#### Years to Retirement

```
years_to_retirement = retirement_age - current_age
months_to_retirement = years_to_retirement × 12
```

### API Endpoint

```
POST /calculators/retirement
Content-Type: application/json

{
  "current_age": 30,
  "retirement_age": 65,
  "current_retirement_savings": 50000,
  "current_monthly_contribution": 500,
  "desired_annual_income": 60000,
  "social_security_annual": 18000
}
```

### UI Components

- Age and timeline inputs
- Current savings and contribution inputs
- Desired retirement lifestyle inputs
- Retirement readiness gauge/meter
- Projected savings growth chart
- Income sources breakdown (withdrawals, SS, pension)
- Gap analysis with recommendations
- "What if" scenarios (delay retirement, increase savings)

---

## 4. Mortgage Calculator

### Purpose

Calculate mortgage payments, amortization schedules, and analyze refinancing options.

### Inputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `home_price` | number | Yes* | Purchase price of home |
| `down_payment` | number | Yes* | Down payment amount |
| `loan_amount` | number | Yes* | Principal loan amount (alternative to price/down) |
| `interest_rate` | number | Yes | Annual interest rate |
| `loan_term_years` | number | Yes | Loan term in years (15, 20, 30) |
| `property_tax_annual` | number | No | Annual property taxes |
| `home_insurance_annual` | number | No | Annual home insurance |
| `pmi_rate` | number | No | PMI rate (if down payment < 20%) |
| `hoa_monthly` | number | No | Monthly HOA fees |
| `extra_monthly_payment` | number | No | Extra principal payment per month |

*Either `loan_amount` OR `home_price` + `down_payment` required

### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `monthly_principal_interest` | number | P&I payment |
| `monthly_taxes` | number | Monthly property tax |
| `monthly_insurance` | number | Monthly insurance |
| `monthly_pmi` | number | Monthly PMI (if applicable) |
| `monthly_hoa` | number | Monthly HOA |
| `total_monthly_payment` | number | Total monthly payment |
| `total_interest_paid` | number | Total interest over loan life |
| `total_cost` | number | Total of all payments |
| `payoff_date` | date | Loan payoff date |
| `amortization_schedule` | array | Month-by-month breakdown |
| `equity_schedule` | array | Equity buildup over time |

### Formulas

#### Monthly Payment (P&I)

```
monthly_rate = annual_rate / 12
n = loan_term_years × 12

If monthly_rate = 0:
    payment = principal / n

Otherwise:
    payment = principal × (monthly_rate × (1 + monthly_rate)^n) / ((1 + monthly_rate)^n - 1)
```

#### Amortization (Per Month)

```
interest_payment = remaining_balance × monthly_rate
principal_payment = monthly_payment - interest_payment
new_balance = remaining_balance - principal_payment
```

#### PMI Calculation

```
If down_payment_percent < 20%:
    pmi_monthly = (loan_amount × pmi_rate) / 12
    # PMI drops off when equity reaches 20%
```

### API Endpoint

```
POST /calculators/mortgage
Content-Type: application/json

{
  "home_price": 400000,
  "down_payment": 80000,
  "interest_rate": 0.0699,
  "loan_term_years": 30,
  "property_tax_annual": 4800,
  "home_insurance_annual": 1200
}
```

### UI Components

- Purchase price and down payment inputs
- Interest rate and term selector
- Additional costs (taxes, insurance, HOA)
- Payment breakdown (pie chart)
- Amortization chart (principal vs interest over time)
- Full amortization schedule table
- Refinance comparison tool
- Extra payment impact calculator

---

## 5. Net Worth Calculator

### Purpose

Track total assets and liabilities to calculate net worth and project growth.

### Inputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `assets` | array | Yes | List of assets |
| `assets[].name` | string | Yes | Asset name |
| `assets[].value` | number | Yes | Current value |
| `assets[].type` | enum | Yes | `cash`, `investment`, `real_estate`, `retirement`, `other` |
| `assets[].annual_growth_rate` | number | No | Expected annual appreciation |
| `assets[].annual_contribution` | number | No | Annual additions to this asset |
| `liabilities` | array | Yes | List of liabilities |
| `liabilities[].name` | string | Yes | Liability name |
| `liabilities[].balance` | number | Yes | Current balance |
| `liabilities[].interest_rate` | number | No | Interest rate |
| `liabilities[].monthly_payment` | number | No | Monthly payment |
| `projection_years` | number | No | Years to project (default 10) |

### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `total_assets` | number | Sum of all assets |
| `total_liabilities` | number | Sum of all liabilities |
| `net_worth` | number | Assets minus liabilities |
| `assets_by_type` | object | Breakdown by asset type |
| `liabilities_by_type` | object | Breakdown by liability type |
| `liquid_net_worth` | number | Net worth excluding illiquid assets |
| `projected_net_worth` | array | Year-by-year projection |
| `millionaire_date` | date | Projected date to reach $1M (if applicable) |

### Formulas

#### Net Worth

```
net_worth = sum(assets) - sum(liabilities)
```

#### Liquid Net Worth

```
liquid_net_worth = sum(cash + investments) - sum(short_term_liabilities)
```

#### Projected Growth (Per Asset)

```
future_value = current_value × (1 + growth_rate)^years + annual_contribution × ((1 + growth_rate)^years - 1) / growth_rate
```

### API Endpoint

```
POST /calculators/net-worth
Content-Type: application/json

{
  "assets": [
    { "name": "Checking", "value": 5000, "type": "cash" },
    { "name": "401k", "value": 85000, "type": "retirement", "annual_growth_rate": 0.07, "annual_contribution": 12000 },
    { "name": "Home", "value": 350000, "type": "real_estate", "annual_growth_rate": 0.03 }
  ],
  "liabilities": [
    { "name": "Mortgage", "balance": 280000, "interest_rate": 0.065, "monthly_payment": 1800 },
    { "name": "Car Loan", "balance": 15000, "interest_rate": 0.05, "monthly_payment": 350 }
  ],
  "projection_years": 10
}
```

### UI Components

- Asset entry form (categorized)
- Liability entry form
- Net worth summary card
- Asset allocation pie chart
- Net worth over time chart
- Projection slider (adjust years)
- Milestone tracker (100k, 500k, 1M milestones)

---

## 6. Investment Return Calculator

### Purpose

Calculate investment returns, compare strategies, and analyze portfolio performance.

### Inputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `initial_investment` | number | Yes | Starting investment amount |
| `monthly_contribution` | number | No | Monthly additions (default 0) |
| `annual_return` | number | Yes | Expected annual return |
| `investment_years` | number | Yes | Investment time horizon |
| `expense_ratio` | number | No | Fund expense ratio (default 0) |
| `dividend_yield` | number | No | Annual dividend yield (default 0) |
| `dividend_reinvest` | boolean | No | Reinvest dividends (default true) |
| `tax_rate` | number | No | Capital gains tax rate (default 0) |
| `inflation_rate` | number | No | For real-return calculation (default 0.03) |

### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `final_value` | number | Portfolio value at end |
| `final_value_after_tax` | number | Value after capital gains |
| `final_value_real` | number | Inflation-adjusted value |
| `total_contributions` | number | Sum of all contributions |
| `total_return` | number | Total investment return |
| `total_return_percent` | number | Return as percentage |
| `annualized_return` | number | CAGR |
| `total_dividends` | number | Cumulative dividends |
| `total_fees` | number | Cumulative expense ratio fees |
| `yearly_breakdown` | array | Year-by-year performance |

### Formulas

#### Compound Annual Growth Rate (CAGR)

```
CAGR = (final_value / initial_investment)^(1/years) - 1
```

#### Net Return (After Fees)

```
net_annual_return = gross_return - expense_ratio
```

#### After-Tax Value

```
capital_gains = final_value - total_contributions
tax_owed = capital_gains × tax_rate
after_tax_value = final_value - tax_owed
```

#### Dividend Growth

```
annual_dividends = portfolio_value × dividend_yield
If reinvest:
    portfolio_value += annual_dividends
```

### API Endpoint

```
POST /calculators/investment-return
Content-Type: application/json

{
  "initial_investment": 10000,
  "monthly_contribution": 500,
  "annual_return": 0.08,
  "investment_years": 20,
  "expense_ratio": 0.001,
  "dividend_yield": 0.02,
  "dividend_reinvest": true
}
```

### UI Components

- Investment inputs form
- Return rate selector with presets (conservative, moderate, aggressive)
- Growth chart with contribution overlay
- Return breakdown (contributions vs growth vs dividends)
- Fee impact visualization
- Tax impact calculator
- Compare different scenarios side-by-side

---

## 7. Tax Estimator Calculator

### Purpose

Estimate federal income tax liability and effective tax rate.

### Inputs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `filing_status` | enum | Yes | `single`, `married_filing_jointly`, `married_filing_separately`, `head_of_household` |
| `gross_income` | number | Yes | Total gross income |
| `w2_income` | number | No | W-2 wages |
| `self_employment_income` | number | No | Self-employment income |
| `investment_income` | number | No | Investment/capital gains income |
| `other_income` | number | No | Other taxable income |
| `pre_tax_deductions` | object | No | Pre-tax deductions |
| `pre_tax_deductions.retirement_401k` | number | No | 401k contributions |
| `pre_tax_deductions.hsa` | number | No | HSA contributions |
| `pre_tax_deductions.traditional_ira` | number | No | Traditional IRA contributions |
| `itemized_deductions` | object | No | Itemized deductions |
| `itemized_deductions.mortgage_interest` | number | No | Mortgage interest |
| `itemized_deductions.property_taxes` | number | No | Property taxes (capped at $10k) |
| `itemized_deductions.state_local_taxes` | number | No | State/local taxes (capped at $10k SALT) |
| `itemized_deductions.charitable` | number | No | Charitable contributions |
| `tax_credits` | object | No | Tax credits |
| `tax_credits.child_tax_credit` | number | No | Number of qualifying children |
| `tax_credits.earned_income_credit` | boolean | No | Eligible for EITC |
| `withholdings` | number | No | Tax already withheld |
| `tax_year` | number | No | Tax year (default current year) |

### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `adjusted_gross_income` | number | AGI after pre-tax deductions |
| `taxable_income` | number | Income after deductions |
| `standard_deduction` | number | Standard deduction amount |
| `itemized_deduction_total` | number | Total itemized deductions |
| `deduction_used` | string | `standard` or `itemized` |
| `federal_tax` | number | Federal income tax liability |
| `self_employment_tax` | number | SE tax (if applicable) |
| `total_tax` | number | Total tax liability |
| `effective_tax_rate` | number | Total tax / gross income |
| `marginal_tax_rate` | number | Tax bracket rate |
| `tax_credits_applied` | number | Total credits applied |
| `tax_owed_or_refund` | number | Amount owed or refund |
| `bracket_breakdown` | array | Tax by bracket |

### Formulas

#### Taxable Income

```
agi = gross_income - pre_tax_deductions
deduction = max(standard_deduction, itemized_deductions)
taxable_income = max(0, agi - deduction)
```

#### Federal Tax (Progressive Brackets)

```
// 2024 Brackets (Single)
brackets = [
    (11600, 0.10),
    (47150, 0.12),
    (100525, 0.22),
    (191950, 0.24),
    (243725, 0.32),
    (609350, 0.35),
    (Infinity, 0.37)
]

tax = 0
remaining = taxable_income
prev_bracket = 0
for (threshold, rate) in brackets:
    bracket_income = min(remaining, threshold - prev_bracket)
    tax += bracket_income × rate
    remaining -= bracket_income
    prev_bracket = threshold
    if remaining <= 0: break
```

#### Self-Employment Tax

```
se_taxable = self_employment_income × 0.9235
se_tax = se_taxable × 0.153  // 12.4% SS + 2.9% Medicare
```

### API Endpoint

```
POST /calculators/tax-estimator
Content-Type: application/json

{
  "filing_status": "married_filing_jointly",
  "gross_income": 150000,
  "w2_income": 140000,
  "investment_income": 10000,
  "pre_tax_deductions": {
    "retirement_401k": 23000,
    "hsa": 7750
  },
  "itemized_deductions": {
    "mortgage_interest": 12000,
    "property_taxes": 8000,
    "charitable": 5000
  },
  "tax_credits": {
    "child_tax_credit": 2
  },
  "withholdings": 25000
}
```

### UI Components

- Filing status selector
- Income breakdown by type
- Pre-tax deductions entry
- Itemized vs standard deduction comparison
- Tax credits entry
- Results summary:
  - Effective tax rate gauge
  - Bracket visualization
  - Refund/owed indicator
  - Tax breakdown by category
- Withholding optimizer

---

## Service Architecture

### Calculator Service Structure

```
services/calculator-service/
├── README.md
├── pyproject.toml
├── src/
│   ├── __init__.py
│   ├── main.py                     # FastAPI application (Port 8005)
│   ├── calculators/
│   │   ├── __init__.py
│   │   ├── debt_payoff.py          # Debt payoff calculator
│   │   ├── savings_growth.py       # Savings growth calculator
│   │   ├── retirement.py           # Retirement calculator
│   │   ├── mortgage.py             # Mortgage calculator
│   │   ├── net_worth.py            # Net worth calculator
│   │   ├── investment_return.py    # Investment return calculator
│   │   └── tax_estimator.py        # Tax estimator calculator
│   ├── models/
│   │   ├── __init__.py
│   │   ├── requests.py             # Input models (Pydantic)
│   │   └── responses.py            # Output models
│   └── utils/
│       ├── __init__.py
│       ├── financial_math.py       # Core financial formulas
│       └── tax_tables.py           # Tax brackets and rates
└── tests/
    ├── __init__.py
    ├── conftest.py
    ├── test_debt_payoff.py
    ├── test_savings_growth.py
    ├── test_retirement.py
    ├── test_mortgage.py
    ├── test_net_worth.py
    ├── test_investment_return.py
    └── test_tax_estimator.py
```

### API Endpoints Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/calculators/debt-payoff` | POST | Debt payoff calculation |
| `/calculators/savings-growth` | POST | Savings growth projection |
| `/calculators/retirement` | POST | Retirement readiness analysis |
| `/calculators/mortgage` | POST | Mortgage payment calculation |
| `/calculators/net-worth` | POST | Net worth calculation |
| `/calculators/investment-return` | POST | Investment return projection |
| `/calculators/tax-estimator` | POST | Tax liability estimation |

### Shared Formulas Module

The `utils/financial_math.py` module provides reusable financial calculations:

```python
# Core functions to implement
def calculate_compound_interest(principal, rate, periods, contribution=0)
def calculate_amortization_payment(principal, rate, periods)
def calculate_future_value(present_value, rate, periods, payments=0)
def calculate_present_value(future_value, rate, periods)
def calculate_loan_payoff_months(balance, rate, payment)
def calculate_total_interest(principal, rate, payment, periods)
def inflation_adjust(nominal_value, inflation_rate, years)
```

---

## Integration Points

### With Budget Analysis (Phase 9)

Calculators can receive data from the unified budget model:
- Debt payoff calculator receives debts from budget
- Retirement calculator receives income and savings from budget
- Net worth calculator receives assets/liabilities from budget

### With Projections Service (Phase 12)

Calculator engines are reused in the projection service:
- Debt payoff engine → debt projection component
- Savings growth engine → savings projection component
- Retirement engine → retirement readiness projection

### With Goal Tracking (Phase 13)

Calculators inform goal feasibility:
- Retirement calculator → retirement goal progress
- Savings calculator → savings goal timeline
- Debt payoff calculator → debt-free goal timeline

### With Planning Workflows (Phase 15)

Calculators embedded in guided workflows:
- Retirement planning wizard uses retirement calculator
- Home buying workflow uses mortgage calculator
- Debt elimination plan uses debt payoff calculator

---

## Testing Strategy

### Unit Tests

Each calculator module has dedicated tests covering:
- Basic calculations with known outputs
- Edge cases (zero values, extreme rates, etc.)
- Input validation
- Formula accuracy against known financial results

### Integration Tests

- End-to-end API testing
- Calculator result consistency
- Performance under load

### Validation Against External Sources

Compare calculator outputs against:
- Bank/financial institution calculators
- IRS tax worksheets
- Academic financial formulas

---

## Future Enhancements

### Phase 9 (Initial Release)
- Basic calculators with core functionality
- Standalone calculator library page
- Simple API endpoints

### Post-Phase 9 Enhancements
- Monte Carlo simulations for investment projections
- Tax-loss harvesting calculator
- Social Security optimization
- College savings (529) calculator
- Life insurance needs calculator
- Lease vs buy calculator
- FIRE calculator (financial independence)
- Roth conversion optimizer






