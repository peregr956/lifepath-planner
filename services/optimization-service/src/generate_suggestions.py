from __future__ import annotations

from dataclasses import dataclass
from typing import List

from .budget_model import Summary, UnifiedBudgetModel
from .heuristics import (
    classify_debt_priority,
    compute_total_flexible_spend,
    find_flexible_expenses,
)


@dataclass
class Suggestion:
    id: str
    title: str
    description: str
    expected_monthly_impact: float
    rationale: str
    tradeoffs: str


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(value, maximum))


def generate_suggestions(model: UnifiedBudgetModel, summary: Summary) -> List[Suggestion]:
    """
    Produce a short list of rational, rule-based optimization suggestions.
    """
    suggestions: List[Suggestion] = []
    surplus = summary.surplus
    flexible_expenses = find_flexible_expenses(model)
    total_flexible_spend = compute_total_flexible_spend(model)
    preferences = model.preferences

    high_priority_debts = [
        debt for debt in model.debts if classify_debt_priority(debt) == "high"
    ]

    if high_priority_debts and surplus > 25:
        target_debt = max(high_priority_debts, key=lambda debt: debt.interest_rate)
        recommended_extra = min(surplus * 0.5, target_debt.min_payment)
        recommended_extra = _clamp(recommended_extra, 25.0, surplus)

        suggestions.append(
            Suggestion(
                id=f"debt-{target_debt.id}",
                title=f"Redirect surplus toward {target_debt.name}",
                description=(
                    f"Apply roughly ${recommended_extra:,.0f} of this month's surplus as an "
                    f"extra payment on {target_debt.name}."
                ),
                expected_monthly_impact=round(recommended_extra, 2),
                rationale=(
                    "This loan carries a high interest rate and accelerating payments shortens "
                    "the payoff timeline while lowering total interest."
                ),
                tradeoffs=(
                    "Reduces cash available for other goals this month and assumes the surplus "
                    "remains consistent."
                ),
            )
        )

    if total_flexible_spend >= 150 and flexible_expenses:
        flexible_expenses = sorted(
            flexible_expenses, key=lambda expense: expense.monthly_amount, reverse=True
        )
        max_change_fraction = preferences.max_desired_change_per_category
        reduction_fraction = _clamp(max_change_fraction, 0.05, 0.1)
        suggested_categories = flexible_expenses[: min(3, len(flexible_expenses))]

        for expense in suggested_categories:
            reduction_amount = round(expense.monthly_amount * reduction_fraction, 2)
            if reduction_amount < 10:
                continue

            suggestions.append(
                Suggestion(
                    id=f"flex-{expense.id}",
                    title=f"Dial back {expense.category}",
                    description=(
                        f"Trim {expense.category} by about {int(reduction_fraction * 100)}% "
                        f"(${reduction_amount:,.0f}) through small adjustments such as caps or "
                        "fewer discretionary purchases."
                    ),
                    expected_monthly_impact=reduction_amount,
                    rationale=(
                        f"{expense.category} is marked as flexible and currently costs "
                        f"${expense.monthly_amount:,.0f} monthly, so a modest reduction can free "
                        "up cash without touching essentials."
                    ),
                    tradeoffs=(
                        "Requires minor habit changes and could reduce enjoyment tied to this "
                        "category if cuts are too aggressive."
                    ),
                )
            )

    if not high_priority_debts and surplus > 0:
        surplus_threshold = max(summary.total_income * 0.1, 300.0)
        if surplus >= surplus_threshold:
            allocation = round(min(surplus * 0.4, surplus - 50), 2)
            if allocation > 25:
                focus = preferences.optimization_focus
                target_account = (
                    "high-yield savings" if focus != "savings" else "retirement contributions"
                )
                suggestions.append(
                    Suggestion(
                        id="surplus-savings",
                        title=f"Automate extra {target_account}",
                        description=(
                            f"Schedule an automatic ${allocation:,.0f} transfer each month into "
                            f"{target_account} while the surplus remains strong."
                        ),
                        expected_monthly_impact=allocation,
                        rationale=(
                            "Directing excess cash into long-term savings builds resilience and "
                            "keeps idle money working toward goals."
                        ),
                        tradeoffs=(
                            "Monthly cash cushion will shrink, so monitor variability in income or "
                            "unexpected expenses."
                        ),
                    )
                )

    return suggestions
