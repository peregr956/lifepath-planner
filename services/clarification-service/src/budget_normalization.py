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

        logger.info(
            {
                "event": "normalize_draft_budget",
                "status": "success",
                "provider": provider.name,
                "income_count": response.income_count,
                "expense_count": response.expense_count,
                "debt_count": response.debt_count,
            }
        )

        return NormalizationResult(
            draft=response.normalized_draft,
            provider_used=provider.name,
            income_count=response.income_count,
            expense_count=response.expense_count,
            debt_count=response.debt_count,
            notes=response.notes,
            success=True,
        )

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
