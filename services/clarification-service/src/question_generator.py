from __future__ import annotations

"""
Lightweight heuristics that highlight the most obvious clarification questions
before the AI reasoning layer applies more nuanced logic.
"""

from typing import List, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    from budget_model import UnifiedBudgetModel


def generate_clarification_questions(model: "UnifiedBudgetModel") -> List[str]:
    """
    Generate deterministic clarification prompts based on obvious gaps in the
    normalized budget. This acts as the seed set for the future AI layer.
    """

    questions: List[str] = []

    for expense in model.expenses:
        if expense.essential is None:
            questions.append(
                f"Is the '{expense.category}' expense essential every month, or could it be adjusted if needed?"
            )

    if not model.income:
        questions.append(
            "We did not detect any income entries. Can you share your primary income sources and their monthly amounts?"
        )

    if not model.expenses:
        questions.append(
            "We did not detect any expenses. Could you outline your recurring bills and key spending categories?"
        )

    if model.summary.surplus < 0:
        questions.append(
            "Your expenses exceed your income. Are there irregular costs, debts, or missing income sources we should capture?"
        )

    # TODO(ai-questioning): Replace heuristic prompts with LLM-generated follow-ups once context is richer.
    return questions
