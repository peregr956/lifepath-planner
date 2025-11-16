# Budget and Debt JSON Schema (MVP)

This document describes the structured JSON model produced after:

1. File upload and AI interpretation.
2. AI clarification questions.
3. User responses through dynamic UI components.

The deterministic layer and optimization engine depend on this unified model.

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
- Future versions may include irregular income, annualized modeling, and complex event types.