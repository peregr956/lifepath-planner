from __future__ import annotations

from typing import Dict

from .budget_model import Summary, UnifiedBudgetModel


def compute_summary_for_model(model: UnifiedBudgetModel) -> Summary:
    """
    Compute total income, total expenses, and surplus for a unified budget model.

    The calculation is deterministic and does not mutate the provided model.
    """
    total_income = float(sum(income.monthly_amount for income in model.income))
    total_expenses = float(sum(expense.monthly_amount for expense in model.expenses))
    surplus = total_income - total_expenses

    return Summary(
        total_income=total_income,
        total_expenses=total_expenses,
        surplus=surplus,
    )


def compute_category_shares(model: UnifiedBudgetModel) -> Dict[str, float]:
    """
    Compute the fractional share of each expense category relative to total expenses.

    Returns a mapping from category name to a float between 0 and 1 inclusive. If there
    are no expenses (or the total is zero), an empty dictionary is returned.
    """
    total_expenses = float(sum(expense.monthly_amount for expense in model.expenses))
    if total_expenses == 0:
        return {}

    category_totals: Dict[str, float] = {}
    for expense in model.expenses:
        category_totals[expense.category] = category_totals.get(expense.category, 0.0) + expense.monthly_amount

    return {
        category: amount / total_expenses
        for category, amount in category_totals.items()
    }


def attach_summary_to_model(model: UnifiedBudgetModel) -> UnifiedBudgetModel:
    """
    Attach deterministic summary metrics to the provided model and return it.

    This function mutates the model's summary fields but otherwise keeps the model
    structure untouched. Category shares are computed for downstream consumers.
    """
    summary = compute_summary_for_model(model)
    category_shares = compute_category_shares(model)

    model.summary.total_income = summary.total_income
    model.summary.total_expenses = summary.total_expenses
    model.summary.surplus = summary.surplus

    if hasattr(model.summary, "category_shares"):
        setattr(model.summary, "category_shares", category_shares)

    return model
