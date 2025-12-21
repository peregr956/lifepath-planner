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

Your task is to analyze raw budget data and normalize the amounts so that:
- INCOME (money coming in) = POSITIVE numbers
- EXPENSES (money going out) = NEGATIVE numbers
- DEBT PAYMENTS = NEGATIVE numbers (they are outflows)
- SAVINGS CONTRIBUTIONS = NEGATIVE numbers (they are outflows from spending budget)
- TRANSFERS = Can be positive or negative depending on direction

CRITICAL RULES:
1. Preserve the original source_row_index for each line - this is essential for traceability
2. Analyze the category labels and descriptions to determine if each item is income or expense
3. Common INCOME indicators: salary, wages, paycheck, income, deposit, revenue, bonus, refund
4. Common EXPENSE indicators: rent, mortgage, groceries, utilities, bills, payment, subscription, insurance
5. Common DEBT indicators: loan payment, credit card, student loan, car payment, debt
6. Common SAVINGS indicators: 401k, retirement, savings, investment, IRA, HSA
7. If amounts are already correctly signed (income positive, expenses negative), keep them as-is
8. If all amounts are positive but the budget has expenses, negate the expense amounts
9. Use the category_label and description to make classification decisions

IMPORTANT: Look at the semantic meaning of each line. A "Salary" of 5000 should be +5000.
A "Rent" of 1800 should be -1800 even if the input shows it as positive.

Return the normalized data in the exact schema specified."""

USER_PROMPT_TEMPLATE = """Analyze and normalize this budget data:

## Detected Format
{detected_format}

## Format Notes
{format_notes}

## Budget Lines ({line_count} items)
{lines_section}

## Raw Data Summary
- Lines with positive amounts: {positive_count}
- Lines with negative amounts: {negative_count}
- Lines with zero amounts: {zero_count}

Normalize all amounts so income is positive and expenses/debt are negative.
Preserve the exact source_row_index for each line."""


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

    return USER_PROMPT_TEMPLATE.format(
        detected_format=draft.detected_format,
        format_notes=draft.notes or "None",
        line_count=len(draft.lines),
        lines_section=_format_lines_section(draft.lines),
        positive_count=positive_count,
        negative_count=negative_count,
        zero_count=zero_count,
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
            self._temperature = 0.1  # Low temperature for consistent normalization
            self._max_tokens = 2048  # Larger to handle full budget data

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
    Deterministic fallback provider that preserves original amounts.

    This provider does not modify the budget data - it passes through the
    original amounts unchanged. Use this when AI normalization is not available
    or not desired.
    """

    name = "deterministic"

    def normalize(self, request: NormalizationProviderRequest) -> NormalizationProviderResponse:
        """Pass through the draft budget unchanged."""
        draft = request.draft

        income_count = sum(1 for line in draft.lines if line.amount > 0)
        expense_count = sum(1 for line in draft.lines if line.amount < 0)

        logger.info(
            {
                "event": "deterministic_normalization",
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
            notes="Deterministic passthrough - amounts unchanged",
        )
