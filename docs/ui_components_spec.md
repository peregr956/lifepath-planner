# Dynamic UI Components Specification (MVP)

The clarification step requires structured user input. To avoid open-ended text fields and ensure consistent data quality, the AI layer outputs a small, well-defined schema describing UI components.

These components are rendered dynamically by the frontend and are used to collect clarification answers that populate the unified budget model.

The specification below defines all UI component types for the MVP.

---

## 1. Component Types (MVP)

The system supports four UI component types:

1. **`number_input`**  
   Used for dollar amounts, interest rates, balances, minimum payments, expected income changes, and similar numerical values. Accepts numeric constraints such as minimum, maximum, step size, and units.

2. **`dropdown`**  
   Used for discrete choices such as:
   - Net or gross income.
   - Stable or variable income confidence.
   - Debt priority (`high`, `medium`, `low`).
   - Optimization focus (`debt`, `savings`, `balanced`).

3. **`toggle`**  
   Used for boolean categories such as marking an expense category as essential or flexible.

4. **`slider`**  
   Used for ranges or uncertainty, for example when a user can give a rough estimate of a balance or expected change.

These four types cover all needs for the MVP and can be expanded later.

---

## 2. Component Descriptor Structure

Each question emitted by the clarification service must include a component descriptor.

A descriptor contains:

- `field_id`: Unique key representing where the value belongs in the final budget model. Examples: `personal_loan_balance`, `groceries_essential_flag`.
- `component`: One of the four component types: `number_input`, `dropdown`, `toggle`, or `slider`.
- `label`: A short user-facing prompt.
- `constraints` (optional): May include:
  - `minimum`
  - `maximum`
  - `unit` (%, USD, etc.)
  - `step` size
  - `default` value
- `options` (for dropdowns only): A list of allowed strings such as `net`, `gross`, `stable`, `variable`, `high`, `medium`, `low`.
- `binding` (optional): Field path in the budget model where the value should be stored. The backend may also infer binding based on `field_id`.

All component descriptors must be simple, explicit, and self-contained so the frontend can render them without guesswork.

---

## 3. Composite Questions

Sometimes a single user-facing question requires multiple fields. For example:

> “What is the balance and interest rate of your personal loan?”

The clarification service should emit multiple component descriptors, one for each required field:

- `personal_loan_balance` → `number_input`
- `personal_loan_interest_rate` → `number_input`

The frontend displays these as grouped inputs under a single question prompt.

---

## 4. Binding to the Unified Budget Model

Each UI component’s `field_id` maps to one attribute in the final structured budget model.

Examples:

- `personal_loan_balance` → `debts.personal_loan.balance`
- `groceries_essential` → `expenses.groceries.essential`
- `optimization_focus` → `preferences.optimization_focus`

The backend should maintain a mapping table or derive the correct assignment from naming conventions. The UI does not need to understand the full model — it only needs to collect structured values.

---

## 5. Constraints and Rules

- All fields must include a label.
- Component types must be strictly enforced.
- No open-ended text inputs except optional notes fields (which are not used in the MVP).
- Components must be minimal, readable, and free of nested structures.
- The AI layer must never require frontend logic to guess or infer meaning.
- The system must be capable of rendering 4 to 7 such components per clarification round.

These constraints ensure consistency and keep the frontend implementation simple.

---

## 6. Future Extensions (Post MVP)

Future versions may support:

- Multi-field custom components.
- Multi-select dropdowns.
- Conditional fields (appearing based on previous answers).
- Rich explanations or tooltips.
- Validation rules enforced on the frontend.

These are intentionally excluded from the MVP to minimize scope and complexity.