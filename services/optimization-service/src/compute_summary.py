from __future__ import annotations

from typing import Dict

from .budget_model import Summary, UnifiedBudgetModel


def compute_summary_for_model(model: UnifiedBudgetModel) -> Summary:
    """
    Calculate aggregate income, expenses, and surplus for a unified budget model.

    Args:
        model: UnifiedBudgetModel whose income and expense entries already use monthly amounts.
    Returns:
        Summary capturing the deterministic totals so downstream services can reuse the numbers.
    Assumptions:
        Function is pure and does not mutate `model`; income values should be positive and expense magnitudes non-negative.
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
    Derive each expense category's share of the household's total expenses.

    Args:
        model: UnifiedBudgetModel whose expenses contain non-negative monthly_amount values.
    Returns:
        Dict mapping category labels to ratios that sum to 1 when total_expenses > 0; empty dict when totals are zero.
    Assumptions:
        Only expenses influence shares, and the caller tolerates floating-point ratios between 0 and 1 inclusive.
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
    Populate the model's summary fields (and optional category shares) in place.

    Args:
        model: UnifiedBudgetModel that already contains summary and expense collections.
    Returns:
        The same model instance after its Summary totals mirror recomputed values.
    Assumptions:
        Mutates the provided model; expects `model.summary` to exist and optionally support a `category_shares` attribute.
    """
    summary = compute_summary_for_model(model)
    category_shares = compute_category_shares(model)

    model.summary.total_income = summary.total_income
    model.summary.total_expenses = summary.total_expenses
    model.summary.surplus = summary.surplus

    if hasattr(model.summary, "category_shares"):
        setattr(model.summary, "category_shares", category_shares)

    return model
