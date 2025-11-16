from __future__ import annotations

"""Placeholder UI schema builder for the clarification service."""

from typing import Any, Dict, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    from budget_model import UnifiedBudgetModel


def build_initial_ui_schema(model: "UnifiedBudgetModel") -> Dict[str, Any]:
    """
    Temporary stub that will output a minimal schema until the deterministic UI
    scaffolding + AI personalization logic is ready.
    """

    # TODO(ai-ui-schema): Build structured UI sections for income/expenses/preferences.
    return {
        "sections": [],
        "summary": {
            "total_income": model.summary.total_income,
            "total_expenses": model.summary.total_expenses,
            "surplus": model.summary.surplus,
        },
        "meta": {"version": "placeholder", "notes": "UI schema generation to be implemented."},
    }

