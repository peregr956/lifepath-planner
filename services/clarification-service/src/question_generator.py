from __future__ import annotations

"""Placeholder question generation module for clarification service."""

from typing import List, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    from budget_model import UnifiedBudgetModel


def generate_clarification_questions(model: "UnifiedBudgetModel") -> List[str]:
    """
    Temporary stub that will be replaced with deterministic + AI-driven
    question selection once the normalization backbone is finalized.
    """

    # TODO(ai-questioning): Implement question generation using deterministic heuristics + AI refinements.
    return []
