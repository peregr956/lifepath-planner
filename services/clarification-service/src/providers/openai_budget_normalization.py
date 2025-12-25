"""
OpenAI-powered budget normalization provider.

This module implements AI-driven budget normalization that analyzes raw budget data
and correctly classifies amounts as income (positive) or expenses (negative) regardless
of the original format. This handles budgets that use all positive numbers, separate
income/expense columns, or any other non-standard format.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from models.raw_budget import DraftBudgetModel, RawBudgetLine
from openai import APIError, APITimeoutError, OpenAI
from shared.observability.privacy import hash_payload

logger = logging.getLogger(__name__)

# JSON schema for OpenAI function calling to ensure structured outputs
NORMALIZATION_SCHEMA = {
    "type": "object",
    "properties": {
        "lines": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "source_row_index": {
                        "type": "integer",
                        "description": "Original row index from the input, must match exactly.",
                    },
                    "amount": {
                        "type": "number",
                        "description": "Normalized amount: positive for income, negative for expenses/debt payments.",
                    },
                    "category_label": {
                        "type": "string",
                        "description": "Category or label for this line item.",
                    },
                    "description": {
                        "type": ["string", "null"],
                        "description": "Optional description or memo for this line.",
                    },
                    "line_type": {
                        "type": "string",
                        "enum": ["income", "expense", "debt_payment", "savings", "transfer"],
                        "description": "Classification of this line item.",
                    },
                },
                "required": ["source_row_index", "amount", "category_label", "line_type"],
            },
            "description": "Normalized budget lines with correctly signed amounts.",
        },
        "detected_income_count": {
            "type": "integer",
            "description": "Number of income items detected.",
        },
        "detected_expense_count": {
            "type": "integer",
            "description": "Number of expense items detected.",
        },
        "detected_debt_count": {
            "type": "integer",
            "description": "Number of debt payment items detected.",
        },
        "normalization_notes": {
            "type": "string",
            "description": "Brief explanation of normalization decisions made.",
        },
    },
    "required": [
        "lines",
        "detected_income_count",
        "detected_expense_count",
        "detected_debt_count",
        "normalization_notes",
    ],
}

SYSTEM_PROMPT = """You are a financial data analyst that normalizes budget data into a standard format.

## Your Task

Analyze raw budget data and normalize amounts to a consistent format:
- **INCOME** (money coming in) = **POSITIVE** numbers
- **EXPENSES** (money going out) = **NEGATIVE** numbers
- **DEBT PAYMENTS** = **NEGATIVE** numbers (outflows)
- **SAVINGS/INVESTMENTS** = **NEGATIVE** numbers (outflows from spending budget)
- **TRANSFERS** = Depends on direction (positive = money in, negative = money out)

## Examples

**Example 1: All positive input (common format)**
Input:
- Salary: 5000
- Rent: 1800
- Groceries: 450

Normalized:
- Salary: +5000 (income)
- Rent: -1800 (expense)
- Groceries: -450 (expense)

**Example 2: Already signed correctly**
Input:
- Salary: 5000
- Rent: -1800
- Groceries: -450

Normalized: Keep as-is, amounts are already correct.

**Example 3: Mixed with debt and savings**
Input:
- Paycheck: 4200
- 401k: 400
- Student Loan Payment: 250
- Credit Card: 150
- Emergency Fund: 300

Normalized:
- Paycheck: +4200 (income)
- 401k: -400 (savings)
- Student Loan Payment: -250 (debt_payment)
- Credit Card: -150 (debt_payment)
- Emergency Fund: -300 (savings)

## Classification Guidelines

**INCOME indicators:** salary, wages, paycheck, income, deposit, revenue, bonus, refund, side income, freelance, interest earned

**EXPENSE indicators:** rent, mortgage, groceries, utilities, bills, insurance, gas, food, dining, phone, internet, entertainment, subscriptions, personal, clothing, health, gym

**DEBT indicators:** loan payment, credit card, student loan, car payment, debt, personal loan, auto payment

**SAVINGS indicators:** 401k, retirement, savings, investment, IRA, HSA, emergency fund, brokerage, Roth

## Important

1. **Always preserve source_row_index** - this is essential for traceability
2. **Look at semantic meaning** - "Salary of 5000" is income even if the file uses all positives
3. **When in doubt**, use the category label to guide classification
4. **Provide normalization notes** explaining your decisions

Return the normalized data in the exact schema specified."""

USER_PROMPT_TEMPLATE = """Please normalize this budget data so income is positive and expenses are negative.

## Format Information
- Detected format: {detected_format}
- Notes: {format_notes}

## Data Analysis
- Total lines: {line_count}
- Positive amounts: {positive_count}
- Negative amounts: {negative_count}
- Zero amounts: {zero_count}

{format_guidance}

## Budget Lines
{lines_section}

---

Normalize each line:
1. Classify as income, expense, debt_payment, savings, or transfer
2. Set the amount sign correctly (income positive, others negative)
3. Preserve the exact source_row_index
4. Provide brief notes explaining your classification decisions"""


def _format_lines_section(lines: list[RawBudgetLine]) -> str:
    """Format budget lines for the AI prompt."""
    if not lines:
        return "No lines detected."

    formatted = []
    for line in lines:
        date_str = line.date.isoformat() if line.date else "N/A"
        desc = line.description or "N/A"
        metadata_str = ", ".join(f"{k}={v}" for k, v in line.metadata.items()) if line.metadata else "N/A"

        formatted.append(
            f"- Row {line.source_row_index}: "
            f"category='{line.category_label}', "
            f"amount={line.amount}, "
            f"description='{desc}', "
            f"date={date_str}, "
            f"metadata={{{metadata_str}}}"
        )

    return "\n".join(formatted)


def _build_user_prompt(draft: DraftBudgetModel) -> str:
    """Build the user prompt from draft budget data."""
    positive_count = sum(1 for line in draft.lines if line.amount > 0)
    negative_count = sum(1 for line in draft.lines if line.amount < 0)
    zero_count = sum(1 for line in draft.lines if line.amount == 0)
    
    # Provide format-specific guidance
    if negative_count == 0 and positive_count > 0:
        format_guidance = """**Important:** All amounts are positive. This likely means expenses need to be negated based on category labels. Look at each category and determine if it's income or expense."""
    elif negative_count > 0 and positive_count > 0:
        format_guidance = """**Note:** Budget has mixed positive and negative amounts. Check if the signs are already correct (income positive, expenses negative) or if adjustments are needed."""
    else:
        format_guidance = """**Note:** Review each line carefully and classify based on category labels."""

    return USER_PROMPT_TEMPLATE.format(
        detected_format=draft.detected_format,
        format_notes=draft.notes or "None",
        line_count=len(draft.lines),
        lines_section=_format_lines_section(draft.lines),
        positive_count=positive_count,
        negative_count=negative_count,
        zero_count=zero_count,
        format_guidance=format_guidance,
    )


class NormalizationProviderRequest:
    """Request object for budget normalization."""

    def __init__(self, draft: DraftBudgetModel, context: dict[str, Any] | None = None):
        self.draft = draft
        self.context = context or {}


class NormalizationProviderResponse:
    """Response object from budget normalization."""

    def __init__(
        self,
        normalized_draft: DraftBudgetModel,
        income_count: int = 0,
        expense_count: int = 0,
        debt_count: int = 0,
        notes: str = "",
    ):
        self.normalized_draft = normalized_draft
        self.income_count = income_count
        self.expense_count = expense_count
        self.debt_count = debt_count
        self.notes = notes


class OpenAIBudgetNormalizationProvider:
    """
    ChatGPT-backed provider that normalizes budget data.

    Uses function calling to ensure structured outputs that correctly classify
    budget line items as income or expenses regardless of the input format.
    Falls back to pass-through (no changes) on errors.
    """

    name = "openai"

    def __init__(self, settings: Any | None = None):
        self._settings = settings
        if settings and settings.openai:
            self._client = OpenAI(
                api_key=settings.openai.api_key,
                base_url=settings.openai.api_base,
                timeout=settings.timeout_seconds,
            )
            self._model = settings.openai.model
            self._temperature = settings.temperature
            self._max_tokens = settings.max_output_tokens
        else:
            self._client = None
            self._model = None
            self._temperature = 0.3  # Slightly higher for better classification decisions
            self._max_tokens = 4096  # Increased for larger budgets

    def normalize(self, request: NormalizationProviderRequest) -> NormalizationProviderResponse:
        """
        Normalize the draft budget using ChatGPT.

        Args:
            request: NormalizationProviderRequest containing the draft budget.

        Returns:
            NormalizationProviderResponse with the normalized draft budget.
        """
        if not self._client:
            raise RuntimeError("OpenAI client not configured. Check OPENAI_API_KEY, OPENAI_MODEL, OPENAI_API_BASE.")

        user_prompt = _build_user_prompt(request.draft)
        prompt_hash = hash_payload({"system": SYSTEM_PROMPT, "user": user_prompt})

        logger.info(
            {
                "event": "openai_normalization_request",
                "provider": self.name,
                "model": self._model,
                "prompt_hash": prompt_hash,
                "line_count": len(request.draft.lines),
            }
        )

        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                tools=[
                    {
                        "type": "function",
                        "function": {
                            "name": "normalize_budget",
                            "description": "Normalize budget data with correctly signed amounts.",
                            "parameters": NORMALIZATION_SCHEMA,
                        },
                    }
                ],
                tool_choice={"type": "function", "function": {"name": "normalize_budget"}},
                temperature=self._temperature,
                max_tokens=self._max_tokens,
            )

            tool_calls = response.choices[0].message.tool_calls
            if not tool_calls:
                logger.warning({"event": "openai_no_tool_calls", "provider": self.name})
                return self._passthrough_response(request.draft)

            arguments = tool_calls[0].function.arguments
            parsed = json.loads(arguments)
            normalized = self._parse_response(parsed, request.draft)

            response_hash = hash_payload(parsed)
            logger.info(
                {
                    "event": "openai_normalization_response",
                    "provider": self.name,
                    "income_count": normalized.income_count,
                    "expense_count": normalized.expense_count,
                    "debt_count": normalized.debt_count,
                    "response_hash": response_hash,
                }
            )

            return normalized

        except (APIError, APITimeoutError) as exc:
            logger.error(
                {
                    "event": "openai_normalization_error",
                    "provider": self.name,
                    "error_type": type(exc).__name__,
                    "error_message": str(exc),
                }
            )
            return self._passthrough_response(request.draft)

        except json.JSONDecodeError as exc:
            logger.error(
                {
                    "event": "openai_json_parse_error",
                    "provider": self.name,
                    "error_message": str(exc),
                }
            )
            return self._passthrough_response(request.draft)

    def _parse_response(
        self, parsed: dict[str, Any], original_draft: DraftBudgetModel
    ) -> NormalizationProviderResponse:
        """Convert OpenAI response into a normalized DraftBudgetModel."""
        raw_lines = parsed.get("lines", [])

        # Build a lookup from source_row_index to original line for metadata preservation
        original_lookup: dict[int, RawBudgetLine] = {line.source_row_index: line for line in original_draft.lines}

        normalized_lines: list[RawBudgetLine] = []

        for item in raw_lines:
            source_row_index = item.get("source_row_index")
            if source_row_index is None:
                continue

            # Get original line for metadata preservation
            original_line = original_lookup.get(source_row_index)
            if original_line is None:
                logger.warning(
                    {
                        "event": "openai_unknown_row_index",
                        "provider": self.name,
                        "source_row_index": source_row_index,
                    }
                )
                continue

            # Create normalized line preserving original metadata
            normalized_line = RawBudgetLine(
                source_row_index=source_row_index,
                date=original_line.date,
                category_label=item.get("category_label", original_line.category_label),
                description=item.get("description") or original_line.description,
                amount=float(item.get("amount", original_line.amount)),
                metadata={
                    **original_line.metadata,
                    "ai_line_type": item.get("line_type", "unknown"),
                    "original_amount": original_line.amount,
                },
            )
            normalized_lines.append(normalized_line)

        # Create normalized draft budget
        normalized_draft = DraftBudgetModel(
            lines=normalized_lines,
            detected_format=original_draft.detected_format,
            notes=parsed.get("normalization_notes", original_draft.notes),
            format_hints={
                **(original_draft.format_hints or {}),
                "ai_normalized": True,
                "ai_income_count": parsed.get("detected_income_count", 0),
                "ai_expense_count": parsed.get("detected_expense_count", 0),
                "ai_debt_count": parsed.get("detected_debt_count", 0),
            },
        )

        return NormalizationProviderResponse(
            normalized_draft=normalized_draft,
            income_count=parsed.get("detected_income_count", 0),
            expense_count=parsed.get("detected_expense_count", 0),
            debt_count=parsed.get("detected_debt_count", 0),
            notes=parsed.get("normalization_notes", ""),
        )

    def _passthrough_response(self, draft: DraftBudgetModel) -> NormalizationProviderResponse:
        """Return the original draft unchanged when normalization fails."""
        logger.info({"event": "openai_normalization_passthrough", "provider": self.name})

        # Count based on sign
        income_count = sum(1 for line in draft.lines if line.amount > 0)
        expense_count = sum(1 for line in draft.lines if line.amount < 0)

        return NormalizationProviderResponse(
            normalized_draft=draft,
            income_count=income_count,
            expense_count=expense_count,
            debt_count=0,
            notes="Passthrough - original data unchanged",
        )


class DeterministicBudgetNormalizationProvider:
    """
    Deterministic fallback provider with keyword-based heuristic normalization.

    This provider uses keyword matching to classify budget lines as income or expenses
    when AI normalization is not available. For all-positive budgets, this correctly
    identifies expenses by their category labels (e.g., "Rent", "Groceries").

    CRITICAL: For all-positive budgets, unknown categories default to EXPENSES
    (not income) since most budget lines are expenses.
    """

    name = "deterministic"

    # Keywords that indicate income
    # NOTE: Avoid short patterns like "pay" that match unintended words (e.g., "car payment", "copay")
    INCOME_KEYWORDS = frozenset([
        "salary", "wages", "income", "paycheck", "earnings",
        "freelance", "bonus", "commission", "dividend", "interest earned",
        "rental income", "pension", "social security", "disability",
        "refund", "revenue", "side gig", "side hustle",
    ])

    # Keywords that indicate expenses
    EXPENSE_KEYWORDS = frozenset([
        "rent", "mortgage", "housing", "utilities", "electric", "gas",
        "water", "insurance", "health", "medical", "groceries", "food",
        "transportation", "car payment", "childcare", "education",
        "subscription", "entertainment", "dining", "shopping", "travel",
        "phone", "internet", "cable", "gym", "personal", "clothing",
        "pet", "household", "maintenance", "repair",
    ])

    # Keywords that indicate debt payments
    DEBT_KEYWORDS = frozenset([
        "credit card", "loan", "student loan", "car loan", "personal loan",
        "line of credit", "finance", "debt", "auto payment",
    ])

    # Keywords that indicate savings (treated as expense outflow)
    SAVINGS_KEYWORDS = frozenset([
        "401k", "retirement", "savings", "investment", "ira", "hsa",
        "emergency fund", "brokerage", "roth",
    ])

    def _classify_category(self, category: str) -> str:
        """
        Classify a category label as income, expense, debt_payment, or savings.

        Returns one of: 'income', 'expense', 'debt_payment', 'savings', 'unknown'
        """
        lower = category.lower().strip()

        # Check income first (most specific)
        for keyword in self.INCOME_KEYWORDS:
            if keyword in lower:
                return "income"

        # Check debt (before general expense check)
        for keyword in self.DEBT_KEYWORDS:
            if keyword in lower:
                return "debt_payment"

        # Check savings
        for keyword in self.SAVINGS_KEYWORDS:
            if keyword in lower:
                return "savings"

        # Check expenses
        for keyword in self.EXPENSE_KEYWORDS:
            if keyword in lower:
                return "expense"

        return "unknown"

    def normalize(self, request: NormalizationProviderRequest) -> NormalizationProviderResponse:
        """
        Normalize budget using keyword-based heuristics.

        For all-positive budgets, this uses keyword matching to classify lines.
        Unknown positive amounts default to EXPENSES (not income) since most
        budget lines are expenses.
        """
        draft = request.draft

        # Check if this is an all-positive budget that needs heuristic normalization
        positive_count = sum(1 for line in draft.lines if line.amount > 0)
        negative_count = sum(1 for line in draft.lines if line.amount < 0)
        all_positive = negative_count == 0 and positive_count > 0

        if all_positive:
            # Apply keyword-based normalization for all-positive budgets
            return self._normalize_all_positive(draft)
        else:
            # Budget already has signs - pass through
            return self._passthrough(draft, positive_count, negative_count)

    def _normalize_all_positive(self, draft: DraftBudgetModel) -> NormalizationProviderResponse:
        """
        Normalize an all-positive budget using keyword-based heuristics.

        CRITICAL: Unknown categories default to EXPENSES (not income).
        """
        normalized_lines: list[RawBudgetLine] = []
        income_count = 0
        expense_count = 0
        debt_count = 0

        for line in draft.lines:
            category = line.category_label or ""
            line_type = self._classify_category(category)

            # Determine the correct sign for the amount
            if line_type == "income":
                # Income stays positive
                normalized_amount = abs(line.amount)
                income_count += 1
            else:
                # Everything else (expense, debt, savings, unknown) becomes negative
                normalized_amount = -abs(line.amount)
                if line_type == "debt_payment":
                    debt_count += 1
                else:
                    expense_count += 1

            # Create normalized line with metadata
            normalized_line = RawBudgetLine(
                source_row_index=line.source_row_index,
                date=line.date,
                category_label=line.category_label,
                description=line.description,
                amount=normalized_amount,
                metadata={
                    **line.metadata,
                    "ai_line_type": line_type if line_type != "unknown" else "expense",
                    "original_amount": line.amount,
                    "heuristic_classification": True,
                },
            )
            normalized_lines.append(normalized_line)

        # Create normalized draft
        normalized_draft = DraftBudgetModel(
            lines=normalized_lines,
            detected_format=draft.detected_format,
            notes=draft.notes,
            format_hints={
                **(draft.format_hints or {}),
                "heuristic_normalized": True,
                "original_all_positive": True,
            },
        )

        logger.info(
            {
                "event": "heuristic_normalization",
                "provider": self.name,
                "line_count": len(draft.lines),
                "income_count": income_count,
                "expense_count": expense_count,
                "debt_count": debt_count,
                "note": "All-positive budget normalized using keyword heuristics",
            }
        )

        return NormalizationProviderResponse(
            normalized_draft=normalized_draft,
            income_count=income_count,
            expense_count=expense_count,
            debt_count=debt_count,
            notes="Heuristic normalization for all-positive budget - unknown categories treated as expenses",
        )

    def _passthrough(self, draft: DraftBudgetModel, income_count: int, expense_count: int) -> NormalizationProviderResponse:
        """Pass through budget with existing signs."""
        logger.info(
            {
                "event": "deterministic_passthrough",
                "provider": self.name,
                "line_count": len(draft.lines),
                "income_count": income_count,
                "expense_count": expense_count,
            }
        )

        return NormalizationProviderResponse(
            normalized_draft=draft,
            income_count=income_count,
            expense_count=expense_count,
            debt_count=0,
            notes="Deterministic passthrough - budget already has correct signs",
        )
