from __future__ import annotations

"""
Generate a deterministic UI schema describing the fields we can confidently
render before AI-driven personalization fills in richer context.
"""

from typing import Any, Dict, List, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    from budget_model import UnifiedBudgetModel


def build_initial_ui_schema(model: "UnifiedBudgetModel") -> Dict[str, Any]:
    """
    Compose a lightweight UI schema with the information we have on hand. The
    schema is intentionally conservative so that the questioning layer can
    augment it later.
    """

    return {
        "sections": [
            _income_section(model.income),
            _expense_section(model.expenses),
        ],
        "summary": {
            "total_income": model.summary.total_income,
            "total_expenses": model.summary.total_expenses,
            "surplus": model.summary.surplus,
        },
        "meta": {
            "version": "initial-normalization",
            "notes": "TODO(ai-ui): Personalize component types and validation dynamically.",
        },
    }


def _income_section(incomes) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = [
        {
            "id": income.id,
            "label": income.name,
            "monthly_amount": income.monthly_amount,
            "type": income.type,
            "stability": income.stability,
        }
        for income in incomes
    ]
    return {
        "id": "income",
        "title": "Income",
        "description": "Confirm your income sources and whether they are stable or variable.",
        "rows": rows,
    }


def _expense_section(expenses) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = [
        {
            "id": expense.id,
            "category": expense.category,
            "monthly_amount": expense.monthly_amount,
            "essential": expense.essential,
            "notes": expense.notes,
        }
        for expense in expenses
    ]
    return {
        "id": "expenses",
        "title": "Expenses",
        "description": "Mark which expenses are essential and add any missing details.",
        "rows": rows,
    }

