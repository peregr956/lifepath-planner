# Budget and Debt JSON Schema

This document describes the structured JSON models used throughout LifePath Planner.

## Schema Overview

The platform uses two primary schema families:

1. **UnifiedBudgetModel**: The core budget model used for AI interpretation and optimization
2. **GoldleafInputs**: Comprehensive financial inputs for the Budget Builder wizard, inspired by the Goldleaf spreadsheet

Both schemas normalize to a common format for the deterministic calculation layer.

---

## UnifiedBudgetModel

This model is produced after:

1. File upload and AI interpretation, OR
2. Budget Builder wizard completion
3. AI clarification questions
4. User responses through dynamic UI components

The deterministic layer and optimization engine depend on this unified model.

---

## Budget Normalization Pipeline

Before the unified model is created, uploaded budgets go through a two-stage normalization process:

### Stage 1: AI-Powered Normalization

When a budget file is uploaded, ChatGPT analyzes the raw data to correctly classify amounts:

- **Income** is normalized to **positive** values
- **Expenses** are normalized to **negative** values
- **Debt payments** are normalized to **negative** values
- **Savings contributions** are normalized to **negative** values (outflows)

This handles any budget format, including:
- Budgets where all amounts are positive (AI uses category labels to determine type)
- Ledger formats with separate debit/credit columns
- Mixed formats with inconsistent sign conventions

The AI analyzes category labels, descriptions, and metadata to make classification decisions. For example, "Salary: 5000" becomes +5000 (income), while "Rent: 1800" becomes -1800 (expense).

### Stage 2: Deterministic Normalization

After AI normalization, the deterministic engine converts the draft budget into the structured `UnifiedBudgetModel`:

- Positive amounts become `Income` entries
- Negative amounts become `Expense` entries
- Summary totals are computed
- Default preferences are applied

### Fallback Behavior

If AI normalization is unavailable or fails, the system falls back to deterministic behavior where amounts are passed through unchanged. This preserves backward compatibility with budgets that already use correct sign conventions.

---

## Root Structure

The finalized budget model contains the following top-level fields:

- `income`: list of income objects.
- `expenses`: list of expense objects.
- `debts`: list of debt objects.
- `preferences`: user preferences used by the optimization engine.
- `summary`: computed totals (added by the deterministic engine).

Example structure:

- `income`: [...]
- `expenses`: [...]
- `debts`: [...]
- `preferences`: {...}
- `summary`:
  - `total_income`: number
  - `total_expenses`: number
  - `surplus`: number

---

## Income Objects

Each income entry has the following fields:

- `id` (string): internal identifier.
- `name` (string): user-facing label.
- `monthly_amount` (number): required.
- `type` (string): `earned`, `passive`, or `transfer`.
- `stability` (string): `stable`, `variable`, or `seasonal`.

Example income entry:

- `id`: `primary_salary`
- `name`: `Salary`
- `monthly_amount`: `7200`
- `type`: `earned`
- `stability`: `stable`

---

## Expense Objects

Each expense entry has:

- `id` (string): internal identifier.
- `category` (string): standardized category label.
- `monthly_amount` (number): required.
- `essential` (boolean): whether the user marked it essential.
- `notes` (string, optional): additional information.

Example:

- `id`: `housing`
- `category`: `Housing`
- `monthly_amount`: `1950`
- `essential`: `true`
- `notes`: `Rent`

Another example:

- `id`: `subscriptions`
- `category`: `Subscriptions`
- `monthly_amount`: `112`
- `essential`: `false`

---

## Debt Objects

Debts appear if the AI detects a debt-like payment or the user confirms one.

Fields:

- `id` (string): internal identifier.
- `name` (string): label (for example, "Personal Loan").
- `balance` (number): current or approximate balance.
- `interest_rate` (number): percentage.
- `min_payment` (number): required minimum monthly payment.
- `rate_changes` (list of objects, optional) with:
  - `date` (`YYYY-MM-DD`).
  - `new_rate` (percentage).
- `priority` (string): `high`, `medium`, or `low`.
- `approximate` (boolean): true if balance or rate is estimated.

Example debt object:

- `id`: `personal_loan`
- `name`: `Personal Loan`
- `balance`: `7400`
- `interest_rate`: `10.2`
- `min_payment`: `310`
- `rate_changes`:
  - `date`: `2027-06-01`
  - `new_rate`: `14.0`
- `priority`: `high`
- `approximate`: `false`

---

## Preferences Object

User preferences captured during clarification:

- `optimization_focus`: `debt`, `savings`, or `balanced`.
- `protect_essentials`: boolean.
- `max_desired_change_per_category`: number (fractional limit).

Example:

- `optimization_focus`: `balanced`
- `protect_essentials`: `true`
- `max_desired_change_per_category`: `0.25`

---

## Summary Object

Produced by the deterministic engine after clarification is complete.

Fields:

- `total_income` (number)
- `total_expenses` (number)
- `surplus` (number)

Example:

- `total_income`: `7200`
- `total_expenses`: `6660`
- `surplus`: `540`

---

## Usage Notes

- All values are modeled as monthly amounts in the MVP.
- Optional fields may be omitted if not relevant.
- The GoldleafInputs schema supports annualized modeling and complex event types.

---

## GoldleafInputs Schema (Budget Builder)

The Budget Builder wizard captures comprehensive financial data using the `GoldleafInputs` schema, inspired by the Goldleaf spreadsheet's "Inputs" sheet. This schema serves as a "single source of truth" for all financial calculations.

### PersonalProfile

User's personal and retirement planning profile.

- `dateOfBirth` (string): ISO date format (e.g., "1994-06-29")
- `targetRetirementAge` (number): Planned retirement age (e.g., 62)
- `lifeExpectancy` (number): Planning horizon (e.g., 95)
- `ssClaimingAge` (number): Social Security claiming age (62, 67, or 70)
- `spendingLevel` (string): "Low", "Medium", or "High"
- `withdrawalStrategy` (string): "Constant", "SMILE", or "Variable"
- `smilePhaseMultipliers` (object): SMILE retirement spending multipliers
  - `goGo` (number): Ages 62-75 multiplier (e.g., 1.2)
  - `slowGo` (number): Ages 75-85 multiplier (e.g., 1.0)
  - `noGo` (number): Ages 85+ multiplier (e.g., 1.2 for healthcare)

### EmploymentIncome

Employment-related income and contributions.

- `annualSalary` (number): Gross annual salary
- `401kContributionPercent` (number): Employee 401k contribution as decimal (e.g., 0.06)
- `employerMatchPercent` (number): Employer match percentage as decimal
- `tspContributionPercent` (number): TSP contribution for federal employees
- `tspMatchPercent` (number): TSP employer match
- `annualRothIRA` (number): Annual Roth IRA contribution
- `annual401k` (number): Annual 401k contribution amount
- `monthlyBrokerage` (number): Monthly taxable brokerage contribution

### AccountBalances

Current account balances across investment vehicles.

- `401k` (number): 401k balance
- `rothIRA` (number): Roth IRA balance
- `tsp` (number): TSP balance (federal employees)
- `brokerageTaxable` (number): Taxable brokerage account balance
- `hsa` (number): Health Savings Account balance
- `emergencyFund` (number): Emergency fund balance
- `rentalPropertyReserves` (number): Rental property reserves

### DebtAccount

Individual debt details.

- `id` (string): Unique identifier
- `name` (string): Debt name (e.g., "Navy Fed Personal Loan")
- `balance` (number): Current balance
- `interestRate` (number): Annual interest rate as decimal (e.g., 0.089)
- `minPayment` (number): Minimum monthly payment
- `debtType` (string): "personal_loan", "student_loan", "credit_card", "mortgage", "auto_loan", "other"

### InvestmentAssumptions

Assumptions for investment projections.

- `expectedStockReturn` (number): Expected annual stock return as decimal (e.g., 0.075)
- `expectedBondReturn` (number): Expected annual bond return as decimal (e.g., 0.045)
- `inflationRate` (number): Expected inflation rate (e.g., 0.025)
- `annualWageGrowth` (number): Expected annual wage growth (e.g., 0.03)
- `currentStockAllocation` (number): Current stock allocation as decimal (e.g., 0.98)
- `retirementStockAllocation` (number): Target stock allocation at retirement (e.g., 0.40)
- `swrBrokerageFloor` (number): Safe withdrawal rate floor (e.g., 0.04)

### TaxInputs

Tax-related inputs for calculations.

- `standardDeduction` (number): Standard deduction amount (e.g., 16100 for 2026 single)
- `ssWageCap` (number): Social Security wage cap (e.g., 176100 for 2026)
- `taxCredits` (number): Expected tax credits
- `w4AdditionalDeduction` (number): W-4 additional withholding deduction
- `filingStatus` (string): "single", "married_filing_jointly", "married_filing_separately", "head_of_household"

### RentalProperty

Rental property details (for real estate investors).

- `purchasePrice` (number): Original purchase price
- `landValue` (number): Land value (for depreciation)
- `mortgageBalance` (number): Current mortgage balance
- `monthlyGrossRent` (number): Monthly gross rental income
- `monthlyPIPayment` (number): Monthly principal & interest payment
- `propertyMgmtPercent` (number): Property management fee as decimal
- `monthlyPropertyTax` (number): Monthly property tax
- `monthlyInsurance` (number): Monthly insurance premium
- `monthlyRepairsReserve` (number): Monthly repairs/maintenance reserve
- `monthlyUtilitiesOwner` (number): Monthly utilities paid by owner
- `vacancyReservePercent` (number): Vacancy reserve as decimal (e.g., 0.05)

### ReservesGoals

Savings reserves and targets.

- `insuranceDeductible` (number): Insurance deductible reserve target
- `majorRepairReserve` (number): Major repair reserve target
- `brokerageTargetMonthly` (number): Monthly brokerage contribution target
- `rothIRAMaxAnnual` (number): Annual Roth IRA max contribution
- `projectionYears` (number): Years to project forward

### RetirementExpensesSS

Retirement-specific expenses and income.

- `healthcarePreMedicare` (number): Annual healthcare before Medicare (age 65)
- `healthcarePostMedicare` (number): Annual healthcare after Medicare
- `estSocialSecurity` (number): Estimated annual Social Security benefit

### Complete GoldleafInputs

The full input structure:

```typescript
type GoldleafInputs = {
  personalProfile: PersonalProfile;
  employmentIncome: EmploymentIncome;
  accountBalances: AccountBalances;
  debts: DebtAccount[];
  investmentAssumptions: InvestmentAssumptions;
  taxInputs: TaxInputs;
  rentalProperty?: RentalProperty;
  reservesGoals: ReservesGoals;
  retirementExpensesSS: RetirementExpensesSS;
  // Additional budget items
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
};
```

---

## FinancialAnalysis (AI Consumption)

The deterministic layer produces a `FinancialAnalysis` object for AI interpretation:

```typescript
type FinancialAnalysis = {
  budgetSummary: BudgetSummary;
  taxAnalysis: TaxCalculationResult;
  debtMetrics: DebtMetrics;
  retirementReadiness?: RetirementReadiness;
  financialHealthScore?: number;
};
```

This ensures AI reads pre-computed values rather than performing calculations itself.

---

## Normalization

Both `UnifiedBudgetModel` (from file upload) and `GoldleafInputs` (from Budget Builder) normalize to a common format using the `normalizePlannerInputsToUnifiedBudgetModel()` function in `src/lib/plannerNormalization.ts`.

This ensures consistent processing regardless of entry point.