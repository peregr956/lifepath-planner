from __future__ import annotations

from typing import List

from .budget_model import Debt, Expense, UnifiedBudgetModel

_PRIORITY_LEVELS = {"low": 0, "medium": 1, "high": 2}


def _priority_from_rate(interest_rate: float | None) -> str:
    """Map an interest rate to a debt priority bucket."""
    if interest_rate is None:
        return "medium"
    if interest_rate > 8.0:
        return "high"
    if interest_rate >= 5.0:
        return "medium"
    return "low"


def classify_debt_priority(debt: Debt) -> str:
    """
    Determine the actionable priority for a debt.

    The function respects an existing debt priority unless it sharply conflicts with
    interest-rate heuristics (for example, a very high rate marked as "low").
    """
    rate_priority = _priority_from_rate(getattr(debt, "interest_rate", None))
    declared_priority = getattr(debt, "priority", None)

    if declared_priority:
        declared_priority = declared_priority.lower()
        if declared_priority in _PRIORITY_LEVELS:
            rate_level = _PRIORITY_LEVELS[rate_priority]
            declared_level = _PRIORITY_LEVELS[declared_priority]
            # Only override when the declared priority is two steps away.
            if abs(rate_level - declared_level) < 2:
                return declared_priority

    return rate_priority


def find_flexible_expenses(model: UnifiedBudgetModel) -> List[Expense]:
    """
    Return expenses flagged as non-essential (flexible) in the model.
    """
    return [expense for expense in model.expenses if not expense.essential]


def compute_total_flexible_spend(model: UnifiedBudgetModel) -> float:
    """
    Sum the monthly spend for all non-essential (flexible) expenses.
    """
    return float(sum(expense.monthly_amount for expense in find_flexible_expenses(model)))
