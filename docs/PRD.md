# LifePath Planner MVP Product Requirements Document (PRD v1.0)

## 1. Product Overview

**Working Name:** LifePath Planner  
**Type:** AI assisted budgeting and optimization tool

### MVP Objective

Enable users to upload a personal monthly budget file and receive:

- A clean, structured representation of their budget
- Clarifying questions to fill in missing financial details
- Rational optimization suggestions for improving savings, debt payoff, or contributions

**Core loop:**

1. User uploads a CSV or XLSX monthly budget file.
2. AI interprets the file and builds a candidate budget model.
3. AI asks 4 to 7 targeted questions using generated UI components.
4. The deterministic layer computes summary metrics.
5. The optimization layer returns realistic, rational suggestions.

The MVP focuses on monthly budgeting and optimization. Multi year projection and FIRE modeling can be added later.

---

## 2. Target User and Problem

### Target users

People who already track budgets, often in custom spreadsheets, and want help making better decisions without rebuilding their budget inside a rigid app.

### Problems

- Budget tools cannot ingest idiosyncratic spreadsheets.
- Tools rarely understand context such as interest rates, essentials versus flexible spending, and user priorities.
- Recommendations tend to be generic or unrealistic.

### Promise

Upload your budget in the format you already use. The system will understand it, ask what it needs, and give you thoughtful suggestions.

---

## 3. In Scope and Out of Scope

### In scope (MVP)

- CSV or XLSX upload for a single monthly budget sheet.
- AI interpretation of sheet structure and categories.
- AI clarifying questions to gather critical missing information.
- Dynamic UI question components such as number inputs, dropdowns, toggles, and sliders.
- Deterministic budget model:
  - Income, expenses, surplus.
  - Category shares.
- Optimization engine that produces rational suggestions.

### Out of scope (MVP)

- Multi year projections.
- Real estate modeling.
- FIRE modeling.
- Detailed tax modeling.
- Direct bank connections.
- Multi user planning.
- Mobile application.

---

## 4. Core User Flow

1. **Upload budget file**  
   User uploads CSV or XLSX (single sheet).
   - Supported formats:
     - Rows represent categories and columns represent amounts.
     - Rows represent transactions in a ledger.

2. **AI interpretation**  
   - Detects format.
   - Extracts income, expenses, possible debt payments, and totals.
   - Builds a candidate structured budget model.

3. **AI clarification**  
   - Identifies missing critical data such as debt interest rates, balances, minimum payments, net versus gross income, essentials versus flexible categories, and user priorities.
   - Asks 4 to 7 short, targeted questions.

4. **Dynamic UI generation**  
   - Questions are rendered as specific UI controls:
     - Number inputs for rates, balances, amounts.
     - Dropdowns for yes/no and type selections.
     - Toggles for essential versus flexible.
     - Sliders for ranges or uncertainty.
   - No open ended text boxes unless unavoidable.

5. **Deterministic computation**  
   - Uses the finalized JSON model to compute:
     - Total income, total expenses, surplus.
     - Category shares and key categories.

6. **Optimization suggestions**  
   - AI uses:
     - Budget model.
     - Debt rates and balances.
     - User priorities and category flags.
     - Simple industry heuristics such as high rate debt first and protection of essentials.
   - Produces 3 to 6 realistic suggestions with reasoning.

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

## 7. Future Extensions (Post MVP)

Not implemented in MVP but considered in design:

- Multi year cash flow and net worth projections.
- Real estate and rental property modeling.
- FIRE plan modeling and withdrawal strategies.
- Scenario planning such as job changes, moves, new debts, home purchases.
- Bank API integrations.
- Multi user household modeling.