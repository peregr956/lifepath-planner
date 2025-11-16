# AI Clarification and Questioning Specification (MVP)

The AI clarification layer fills in critical information that is not present in the uploaded budget file. Its responsibilities are:

1. Identify missing but essential details.
2. Ask 4 to 7 concise clarification questions.
3. Produce structured values for the unified budget model defined in `budget_schema.md`.

The clarification layer enables advisor-quality reasoning by ensuring the optimization engine has correct inputs.

---

## 1. Question Domains

### A. Debt

Triggered when the AI detects recurring payments labeled in a way that resembles debt, for example “Loan,” “Credit Card,” “Auto Payment,” “Personal Loan,” or similar.

The AI must ask for:

- Interest rate (percentage).
- Current balance (may be approximate).
- Minimum monthly payment.
- Future rate changes, if any.
- User priority for this debt (`high`, `medium`, or `low`).

**Example questions**

- “I see a recurring payment for a personal loan. What is the approximate remaining balance?”
- “What is the current interest rate on this loan?”
- “Does this loan have a scheduled rate change?”
- “Is paying this debt off a high, medium, or low priority for you?”

**UI components**

- Number input for rate and balance.
- Number input for minimum payment.
- Date selection or date input for rate change.
- Dropdown for priority.

### B. Income

Triggered when the system detects at least one income source but lacks clarity about how predictable it is or whether the values are net or gross.

The AI must ask for:

- Whether the income amount is net (after tax) or gross.
- Whether the income is stable month to month.
- Whether any known income changes are expected soon.

**Example questions**

- “Is this salary amount net (after taxes) or gross?”
- “Does this income stay roughly consistent every month?”
- “Do you expect any changes to your income over the next year?”

**UI components**

- Dropdown for net or gross.
- Dropdown for stable or variable.
- Optional number input for expected change.

### C. Essentials vs Flexible Spending

Purpose: Identify which spending categories must be protected during optimization and which may be adjusted.

The AI must ask the user to mark categories such as housing, utilities, groceries, and necessary transportation as “essential” or “flexible.”

**UI components**

- Toggle for each category (essential vs flexible).

User responses update each expense object’s `essential` field.

### D. Optimization Focus

Purpose: Understand what the user wants the system to prioritize.

The AI must ask:

> “Which should the system prioritize?”

Options:

- Paying down debt faster.
- Increasing retirement or long-term savings.
- A balanced approach between both.

**UI components**

- Dropdown or single-choice selection.

This updates the `preferences.optimization_focus` value.

---

## 2. Question Count and Flow

- The AI asks no more than 7 questions in the initial round.
- Questions must be contextual to the actual uploaded budget.
- Skip entire categories if unnecessary (e.g., no debt lines detected).
- Ask fewer questions when the spreadsheet provides unusually complete data.
- Allow approximate answers and use an `approximate` flag when needed.
- All questions must map to UI components defined in `ui_components_spec.md`.

---

## 3. Expected Output of Clarification Layer

After questions are answered, the AI must return all data in a structured model consistent with the unified JSON schema.

The output includes:

- Fully specified income entries.
- Fully specified expenses with essential flags.
- Debt objects with rates, balances, payment info, and priority.
- Preferences object with optimization focus and protection rules.

This final unified model is then passed directly to:

- The deterministic engine for summary calculation.
- The optimization engine for generating recommendations.

---

## 4. Design Intent

The clarification layer is strictly responsible for collecting missing values and confirming assumptions. It:

- Does not perform math.
- Does not compute optimizations.
- Does not reformat or create new categories.

Its sole job is to ensure that the deterministic and optimization layers operate on high-quality structured data.