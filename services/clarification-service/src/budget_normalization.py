"""
Budget normalization module.

This module provides AI-powered budget normalization that analyzes raw budget data
and correctly classifies amounts as income (positive) or expenses (negative) before
the deterministic engine processes it.

The normalization happens before draft_to_initial_unified() is called, ensuring
that any budget format can be processed reliably.
"""

from __future__ import annotations

import logging
from typing import Any

from models.raw_budget import DraftBudgetModel
from providers.openai_budget_normalization import (
    DeterministicBudgetNormalizationProvider,
    NormalizationProviderRequest,
    OpenAIBudgetNormalizationProvider,
)

logger = logging.getLogger(__name__)

__all__ = [
    "normalize_draft_budget_with_ai",
    "create_normalization_provider",
    "NormalizationResult",
]


class NormalizationResult:
    """Result of budget normalization including metadata about the process."""

    def __init__(
        self,
        draft: DraftBudgetModel,
        provider_used: str,
        income_count: int = 0,
        expense_count: int = 0,
        debt_count: int = 0,
        notes: str = "",
        success: bool = True,
    ):
        self.draft = draft
        self.provider_used = provider_used
        self.income_count = income_count
        self.expense_count = expense_count
        self.debt_count = debt_count
        self.notes = notes
        self.success = success


def create_normalization_provider(settings: Any | None = None) -> Any:
    """
    Create the appropriate normalization provider based on settings.

    Args:
        settings: ProviderSettings object with provider configuration.

    Returns:
        A normalization provider instance (OpenAI or Deterministic).
    """
    if settings is None:
        logger.info({"event": "create_normalization_provider", "provider": "deterministic", "reason": "no_settings"})
        return DeterministicBudgetNormalizationProvider()

    provider_name = getattr(settings, "provider_name", "deterministic")

    if provider_name == "openai":
        if settings.openai is None:
            logger.warning(
                {
                    "event": "create_normalization_provider",
                    "provider": "deterministic",
                    "reason": "openai_not_configured",
                }
            )
            return DeterministicBudgetNormalizationProvider()

        logger.info({"event": "create_normalization_provider", "provider": "openai"})
        return OpenAIBudgetNormalizationProvider(settings)

    logger.info({"event": "create_normalization_provider", "provider": "deterministic"})
    return DeterministicBudgetNormalizationProvider()


def normalize_draft_budget_with_ai(
    draft: DraftBudgetModel,
    settings: Any | None = None,
    context: dict[str, Any] | None = None,
) -> NormalizationResult:
    """
    Normalize a draft budget using AI to correctly classify income vs expenses.

    This function analyzes the raw budget data and returns a normalized version
    where amounts are correctly signed:
    - Income: positive amounts
    - Expenses: negative amounts
    - Debt payments: negative amounts

    Args:
        draft: The raw DraftBudgetModel from the ingestion service.
        settings: Optional ProviderSettings for AI provider configuration.
        context: Optional context dict with additional metadata.

    Returns:
        NormalizationResult containing the normalized draft and metadata.

    Note:
        If AI normalization fails, falls back to deterministic behavior
        (passthrough - amounts unchanged) to ensure the pipeline continues.
    """
    if not draft.lines:
        logger.info({"event": "normalize_draft_budget", "status": "skip", "reason": "empty_budget"})
        return NormalizationResult(
            draft=draft,
            provider_used="none",
            notes="Empty budget - no normalization needed",
            success=True,
        )

    provider = create_normalization_provider(settings)
    request = NormalizationProviderRequest(draft, context or {})

    try:
        response = provider.normalize(request)

        result = NormalizationResult(
            draft=response.normalized_draft,
            provider_used=provider.name,
            income_count=response.income_count,
            expense_count=response.expense_count,
            debt_count=response.debt_count,
            notes=response.notes,
            success=True,
        )

        # Validate normalization results and log any warnings
        validation_warnings = validate_normalization_result(result)

        logger.info(
            {
                "event": "normalize_draft_budget",
                "status": "success",
                "provider": provider.name,
                "income_count": response.income_count,
                "expense_count": response.expense_count,
                "debt_count": response.debt_count,
                "validation_warnings": len(validation_warnings),
            }
        )

        return result

    except Exception as exc:
        logger.error(
            {
                "event": "normalize_draft_budget",
                "status": "error",
                "provider": provider.name,
                "error_type": type(exc).__name__,
                "error_message": str(exc),
            }
        )

        # Fallback to deterministic provider
        fallback = DeterministicBudgetNormalizationProvider()
        fallback_response = fallback.normalize(request)

        return NormalizationResult(
            draft=fallback_response.normalized_draft,
            provider_used=f"{provider.name}_fallback_to_deterministic",
            income_count=fallback_response.income_count,
            expense_count=fallback_response.expense_count,
            debt_count=fallback_response.debt_count,
            notes=f"AI normalization failed ({type(exc).__name__}), using deterministic fallback",
            success=False,
        )


def validate_normalization_result(result: NormalizationResult) -> list[str]:
    """
    Validate that normalization results make financial sense.

    Checks for suspicious patterns that might indicate classification errors:
    - Expense-like categories classified as income (positive amounts)
    - All amounts classified as income (unlikely for a real budget)
    - Extremely high or low surplus ratios

    Args:
        result: The NormalizationResult to validate.

    Returns:
        List of warning messages for any suspicious patterns found.
    """
    warnings: list[str] = []
    draft = result.draft

    if not draft.lines:
        return warnings

    # Common expense category keywords that should NOT be classified as income
    expense_keywords = {
        "rent", "mortgage", "groceries", "utilities", "electric", "gas",
        "water", "insurance", "food", "transportation", "phone", "internet",
        "subscription", "entertainment", "dining", "shopping", "gym",
    }

    # Check for expense-like categories with positive amounts (classified as income)
    suspicious_income: list[str] = []
    for line in draft.lines:
        if line.amount > 0:  # Classified as income
            category_lower = (line.category_label or "").lower()
            for keyword in expense_keywords:
                if keyword in category_lower:
                    suspicious_income.append(f"{line.category_label}: ${line.amount}")
                    break

    if suspicious_income:
        warnings.append(
            f"WARNING: Expense-like categories classified as income: {', '.join(suspicious_income[:3])}"
            + (f" (and {len(suspicious_income) - 3} more)" if len(suspicious_income) > 3 else "")
        )

    # Check if all amounts are positive (suspicious for a real budget)
    positive_count = sum(1 for line in draft.lines if line.amount > 0)
    negative_count = sum(1 for line in draft.lines if line.amount < 0)

    if positive_count > 2 and negative_count == 0:
        warnings.append(
            f"WARNING: All {positive_count} amounts are positive. "
            "This may indicate classification errors - expenses should be negative."
        )

    # Check surplus ratio (if we can compute it)
    total_income = sum(line.amount for line in draft.lines if line.amount > 0)
    total_expenses = sum(abs(line.amount) for line in draft.lines if line.amount < 0)

    if total_income > 0 and total_expenses > 0:
        surplus = total_income - total_expenses
        surplus_ratio = surplus / total_income

        if surplus_ratio > 0.7:
            warnings.append(
                f"WARNING: Very high surplus ratio ({surplus_ratio:.0%}). "
                "Some expenses may be incorrectly classified as income."
            )
        elif surplus_ratio < -0.5:
            warnings.append(
                f"WARNING: Large deficit ({surplus_ratio:.0%} of income). "
                "Some income may be incorrectly classified as expenses."
            )

    # Log warnings for observability
    if warnings:
        logger.warning(
            {
                "event": "normalization_validation_warnings",
                "provider": result.provider_used,
                "warning_count": len(warnings),
                "warnings": warnings,
            }
        )

    return warnings


def should_normalize_with_ai(draft: DraftBudgetModel) -> bool:
    """
    Determine if AI normalization should be applied to this budget.

    AI normalization is recommended when:
    - All amounts are positive (likely needs expense negation)
    - No clear sign pattern is detected
    - The format hints suggest ambiguous data

    Args:
        draft: The raw DraftBudgetModel to analyze.

    Returns:
        True if AI normalization is recommended, False otherwise.
    """
    if not draft.lines:
        return False

    positive_count = sum(1 for line in draft.lines if line.amount > 0)
    negative_count = sum(1 for line in draft.lines if line.amount < 0)

    # If all amounts are positive and we have multiple lines, likely needs normalization
    if negative_count == 0 and positive_count > 1:
        logger.info(
            {
                "event": "should_normalize_with_ai",
                "recommendation": True,
                "reason": "all_positive_amounts",
                "positive_count": positive_count,
            }
        )
        return True

    # If we have a mix but very few negatives, might need normalization
    if negative_count > 0 and positive_count > 0:
        # This looks like a properly signed budget
        logger.info(
            {
                "event": "should_normalize_with_ai",
                "recommendation": True,  # Still normalize to ensure accuracy
                "reason": "mixed_signs_verify",
                "positive_count": positive_count,
                "negative_count": negative_count,
            }
        )
        return True

    logger.info(
        {
            "event": "should_normalize_with_ai",
            "recommendation": False,
            "reason": "signs_look_correct",
            "positive_count": positive_count,
            "negative_count": negative_count,
        }
    )
    return False
