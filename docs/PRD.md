# LifePath Planner Product Requirements Document (PRD v2.0)

## 1. Product Overview

**Working Name:** LifePath Planner  
**Type:** Comprehensive AI-assisted financial planning platform

### Product Vision

LifePath Planner is a **comprehensive financial planning platform** that combines deterministic financial calculations with AI-powered interpretation to provide personalized, actionable financial guidance. The platform covers monthly budgeting, debt payoff, retirement planning (including FIRE), tax optimization, and long-term projections.

### Architecture: Hybrid Deterministic + AI

The platform uses a **hybrid architecture** inspired by the Goldleaf spreadsheet model:

1. **Deterministic Calculation Engine**: Core financial math (compound interest, amortization, tax brackets) is computed by code, ensuring accuracy and consistency
2. **AI Interpretation Layer**: AI reads the deterministic outputs to provide personalized recommendations, answer natural language queries, and explain complex financial concepts

This approach ensures calculations are always correct while leveraging AI's strength in personalization and explanation.

### Entry Points

Users can access the financial planner through **two entry points**:

1. **Upload Existing Budget**: Upload a CSV or XLSX file containing an existing budget
2. **Build from Scratch**: Use a guided wizard to create a comprehensive financial profile

Both paths normalize the user's financial data into a unified model that feeds the full financial planner.

### Core Loop

**Path A: Upload Existing Budget**
1. User uploads a CSV or XLSX monthly budget file
2. AI interprets the file and builds a candidate budget model
3. AI asks 4 to 7 targeted questions using generated UI components
4. The deterministic layer computes summary metrics
5. The optimization layer returns realistic, rational suggestions

**Path B: Build from Scratch**
1. User enters financial data through a guided wizard (Income → Expenses → Debts → Savings → Review)
2. Wizard captures comprehensive Goldleaf-style inputs (personal profile, employment, accounts, debts, investment assumptions, taxes, real estate)
3. Data is normalized into the unified budget model
4. The deterministic layer computes summary metrics
5. The optimization layer returns realistic, rational suggestions

### Platform Scope

The platform encompasses:

- **Monthly Budgeting**: Income, expenses, surplus tracking
- **Debt Management**: Payoff strategies (avalanche, snowball), interest optimization
- **Retirement Planning**: FIRE calculations, SMILE withdrawal strategy, Social Security optimization
- **Tax Optimization**: Federal and state tax estimation, 401k contribution optimization
- **Investment Projections**: Compound growth, glide path allocation
- **Net Worth Tracking**: Asset and liability tracking, milestone projections
- **Real Estate Modeling**: Rental property cash flow, reserves
- **Financial Health Score**: Composite metric for overall financial wellness

---

## 2. Target User and Problem

### Target Users

**Primary**: People who want comprehensive financial planning guidance, including:
- Those who already track budgets in custom spreadsheets and want help making better decisions
- Those who want to start budgeting but don't have an existing system
- Those planning for retirement (especially FIRE-focused individuals)
- Those seeking to optimize debt payoff, savings, or tax strategies

**Secondary**: Financial planners and advisors seeking tools to assist client planning.

### Problems

- Budget tools cannot ingest idiosyncratic spreadsheets
- Tools rarely understand context such as interest rates, essentials versus flexible spending, and user priorities
- Recommendations tend to be generic or unrealistic
- Comprehensive planning (retirement, taxes, real estate) typically requires expensive software or financial advisors
- Most tools require users to start from scratch rather than building on existing data

### Promise

**For users with existing budgets**: Upload your budget in the format you already use. The system will understand it, ask what it needs, and give you thoughtful suggestions.

**For users starting fresh**: Build a comprehensive financial profile through a guided wizard. The system will capture everything needed for long-term planning—retirement, taxes, debt, savings—and provide personalized recommendations.

---

## 3. In Scope and Out of Scope

### In Scope (Current Platform)

**Entry Points**:
- CSV or XLSX upload for existing budgets (single or multi-sheet)
- Budget Builder wizard for creating budgets from scratch
- Guided wizard capturing comprehensive Goldleaf-style inputs

**Budget & Financial Data**:
- AI interpretation of sheet structure and categories
- AI clarifying questions to gather critical missing information
- Dynamic UI question components (number inputs, dropdowns, toggles, sliders)
- Deterministic budget model (income, expenses, surplus, category shares)
- Debt tracking with interest rates, balances, minimum payments
- Account balances (401k, Roth IRA, TSP, brokerage, HSA, emergency fund)
- Personal profile (age, retirement age, life expectancy, financial philosophy)

**Calculations & Projections**:
- Budget calculations (totals, category shares, savings rate)
- Tax estimation (federal and state brackets, FICA, effective rate)
- Debt payoff projections (avalanche, snowball strategies)
- Investment growth with contribution escalation
- Retirement readiness calculations

**AI-Powered Features**:
- Personalized optimization suggestions
- Natural language query answering
- Financial philosophy-aware recommendations
- Contextual clarification questions

**User Accounts**:
- User registration and authentication
- Profile persistence and history
- Session management

### In Scope (Future Phases)

See `roadmap.md` for detailed phase planning:
- Multi-year projections and net worth trajectory (Phase 14)
- FIRE modeling with SMILE withdrawal strategy (Phase 12/14)
- Financial Command Center dashboard (Phase 14)
- Real estate rental property modeling (Phase 12)
- Scenario planning and "what if" analysis (Phase 15)
- Bank account integration via Plaid (Phase 17)
- Goal tracking with progress monitoring (Phase 13)

### Out of Scope

- Multi-user/household planning (single user focus)
- Native mobile application (web-responsive only)
- Professional financial advisor tools
- Direct trading or account management
- Insurance product recommendations
- Estate planning

---

## 4. Core User Flows

### Flow A: Upload Existing Budget

1. **Choose Entry Point**  
   User arrives at the entry page and selects "Upload Your Existing Budget"

2. **Upload Budget File**  
   User uploads CSV or XLSX (single or multi-sheet)
   - Supported formats:
     - Rows represent categories and columns represent amounts
     - Rows represent transactions in a ledger
     - Multi-sheet workbooks (e.g., separate sheets for income, expenses)

3. **AI Interpretation**  
   - Detects format
   - Extracts income, expenses, possible debt payments, and totals
   - Uses description column (not just category) for meaningful labels
   - Builds a candidate structured budget model

4. **Foundational Questions**  
   - Gathers high-level context: financial philosophy, risk tolerance, primary goal
   - Optional but encouraged for better recommendations

5. **AI Clarification**  
   - Identifies missing critical data (debt rates, balances, essential vs flexible)
   - Asks 4 to 7 short, targeted questions
   - Questions rendered as dynamic UI components

6. **Deterministic Computation**  
   - Computes totals, category shares, surplus
   - Calculates debt metrics, savings rate

7. **Optimization Suggestions**  
   - AI uses budget model, debt info, user priorities, and industry heuristics
   - Produces 3 to 6 realistic suggestions with reasoning and impact estimates

### Flow B: Build from Scratch

1. **Choose Entry Point**  
   User arrives at the entry page and selects "Build Your Budget From Scratch"

2. **Budget Builder Wizard**  
   Multi-step wizard captures comprehensive financial data:

   **Step 1: Income**
   - Employment income (salary, 401k contribution, employer match)
   - Additional income sources (rental, investments, side income)
   - Income type and stability

   **Step 2: Expenses**
   - Expense categories with amounts
   - Essential vs flexible designation
   - Notes and descriptions

   **Step 3: Debts**
   - Debt accounts with balances, interest rates, minimum payments
   - Debt type (personal loan, student loan, credit card, mortgage)
   - Priority and payoff strategy

   **Step 4: Savings & Goals**
   - Account balances (401k, Roth IRA, TSP, brokerage, HSA, emergency fund)
   - Contribution targets
   - Savings goals

   **Step 5: Review**
   - Summary of all inputs
   - Financial snapshot preview
   - Confirmation before submission

3. **Normalization**  
   - Builder data normalized to UnifiedBudgetModel
   - FinancialAnalysis computed for AI consumption

4. **Foundational Questions** (optional)
   - Additional context gathering if not captured in wizard

5. **Deterministic Computation**  
   - Same calculations as Flow A

6. **Optimization Suggestions**  
   - Same AI-powered suggestions as Flow A

### Shared: Summary & Recommendations

Both flows converge on the Summary page:

1. **Answer Card**: Direct answer to user's question
2. **Profile Context Bar**: Shows foundational context used
3. **Suggestions Section**: Prioritized recommendations with assumptions
4. **Budget Snapshot**: Key metrics visualization
5. **Projected Impact**: Before/after comparison
6. **Next Actions**: Context-aware links to calculators, profile editing, follow-ups

---

## 5. Functional Requirements

### 5.1 File Upload and Parsing

**Requirements**

- Accept CSV and XLSX (single sheet).
- Detect budget format: categorical versus ledger.
- Extract income streams, expense categories and totals, possible debt payments.
- Handle negative versus positive amounts with clarification if needed.

**Success criteria**

- Correct total income and total expenses after import for tested files.
- Clear errors when format assumptions fail.

### 5.2 AI Interpretation Layer

**Responsibilities**

- Interpret tabular data into a candidate structured model.
- Map columns to roles such as date, category, amount.
- Group transactions into monthly totals if needed.
- Identify potential debts and savings categories.
- Flag missing information for the clarification layer.

**Output**

- Draft JSON budget model as defined in `budget_schema.md`.

### 5.3 AI Clarification and Inquiry

The system must ask clarifying questions when critical information is missing.

**Question domains**

1. Debt:
   - Interest rates.
   - Balances.
   - Minimum payments.
   - Future rate changes.
   - Whether the user prefers to prioritize debt payoff.
2. Income:
   - Net or gross.
   - Stability versus variability.
3. Essentials versus flexible:
   - Which categories are non negotiable.
   - Which categories can be adjusted.
4. Optimization orientation:
   - Prioritize debt.
   - Prioritize retirement savings.
   - Balanced approach.

**Constraints**

- 4 to 7 questions in the initial pass.
- Questions must be contextual and concise.
- User can respond with approximate values if needed.

**Output**

- Completed budget and debt model with user preferences.
- Details are defined in `ai_questioning_spec.md`.

### 5.4 Dynamic UI Components

The AI layer must output a small schema for each question that describes:

- Field type such as `number_input`, `dropdown`, `toggle`, `slider`.
- Label text.
- Optional constraints such as min, max, units.
- Optional options list for dropdowns.
- Binding location in the final JSON model.

**Example descriptor**

```json
{
  "field_id": "personal_loan_rate",
  "component": "number_input",
  "label": "Interest rate for your personal loan",
  "min": 0,
  "max": 50,
  "unit": "%"
}
```

The frontend uses this schema to render the form dynamically.

### 5.5 Deterministic Budget Engine

**Input**

- Final structured JSON model that contains income, expenses, debts, and preferences.

**Responsibilities**

- Compute:
  - Total monthly income.
  - Total monthly expenses.
  - Monthly surplus or deficit.
  - Category shares as percentages.
- Identify:
  - Largest categories.
  - Debt service share of income.

**Output**

- Summary used by the optimization engine and the summary UI.

### 5.6 Optimization Engine

**Responsibilities**

- Use industry heuristics and user preferences to generate rational suggestions.

**Heuristics include**

- High interest debt (above 8–10%) is usually prioritized.
- Very low rate debt (below 2–3%) is usually not accelerated.
- Essentials such as housing, utilities, baseline groceries, and necessary transport are protected.
- Suggestions should prefer:
  - Small, sustainable changes in flexible categories.
  - Reallocation of overlapping or low value expenses.
  - Improved structure such as caps on variable categories.

**Output**

- 3 to 6 suggestions, each with:
  - Plain language description.
  - Expected monthly impact.
  - Tradeoff explanation.
  - Any assumptions used.

---

## 6. Non Functional Requirements

- Transparent: user can see income, expenses, and assumptions clearly.
- Inspectable: underlying JSON model can be viewed.
- Simple: minimal steps between upload and recommendations.
- Extensible: architecture must support later additions such as multi year projections, real estate modules, FIRE modules, and more event or goal types.

---

## 7. Platform Evolution

### Current Implementation (Phases 0–9.6)

The following features have been implemented:

- Two entry points: Upload existing budget OR Build from scratch
- Budget Builder wizard with Goldleaf-style comprehensive inputs
- AI-powered budget interpretation and clarification
- Deterministic budget and tax calculations
- User accounts and authentication
- Session context integration
- Summary page with decision-support design
- Financial philosophy and foundational questions

### Upcoming Features (See Roadmap)

The following features are planned in `roadmap.md`:

| Feature | Phase | Description |
|---------|-------|-------------|
| Budget History & Trends | 10 | Track budgets over time, compare periods |
| UI/UX Polish | 11 | Accessibility, responsive design, onboarding |
| Financial Calculators | 12 | FIRE, SMILE retirement, debt payoff, mortgage, net worth |
| Goal Tracking | 13 | Set and track financial goals with progress monitoring |
| Financial Command Center | 14 | Multi-year projections, annual budgets, health score dashboard |
| Scenario Planning | 15 | "What if" analysis, side-by-side comparison |
| Workflow Integration | 16 | Calculators embedded in planning workflows |
| Bank Account Integration | 17 | Plaid integration for real-time account data |
| Advanced Planning | 18 | Tax-loss harvesting, portfolio analysis, cash flow forecasting |

### Architecture Considerations

The platform is designed for extensibility:

- **Goldleaf Input Model**: Comprehensive input types (`GoldleafInputs`) capture all data needed for advanced planning
- **Calculator Modules**: Deterministic calculators in `src/lib/calculators/` can be extended independently
- **Projection Engines**: Future projection features build on calculator foundations
- **AI Interpretation**: AI reads deterministic outputs, not raw data, ensuring calculation accuracy
- **Unified Budget Model**: All inputs normalize to `UnifiedBudgetModel` for consistent processing

### Out of Scope (Design Decisions)

The following are intentionally out of scope:

- **Multi-user household planning**: Focus on single-user simplicity
- **Native mobile apps**: Web-responsive design prioritized
- **Direct trading/brokerage**: Recommendation-only, no execution
- **Insurance products**: Outside core financial planning focus
- **Estate planning**: Specialized domain requiring legal expertise