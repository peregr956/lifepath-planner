import sys
from pathlib import Path

import pytest


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.append(str(SERVICE_ROOT))

from src.budget_model import Expense, Income, Preferences, Summary, UnifiedBudgetModel
from src.compute_summary import (
    attach_summary_to_model,
    compute_category_shares,
    compute_summary_for_model,
)


def make_income(id_suffix: str, amount: float, name: str = "Income") -> Income:
    return Income(
        id=f"income-{id_suffix}",
        name=name,
        monthly_amount=amount,
        type="earned",
        stability="stable",
    )


def make_expense(id_suffix: str, category: str, amount: float, essential: bool = True) -> Expense:
    return Expense(
        id=f"expense-{id_suffix}",
        category=category,
        monthly_amount=amount,
        essential=essential,
    )


def make_model(incomes, expenses, summary=None) -> UnifiedBudgetModel:
    return UnifiedBudgetModel(
        income=incomes,
        expenses=expenses,
        debts=[],
        preferences=Preferences(
            optimization_focus="balanced",
            protect_essentials=True,
            max_desired_change_per_category=0.1,
        ),
        summary=summary or Summary(total_income=0.0, total_expenses=0.0, surplus=0.0),
    )


def test_compute_summary_positive_surplus():
    model = make_model(
        incomes=[make_income("salary", 4000.0)],
        expenses=[make_expense("rent", "housing", 2500.0)],
    )

    summary = compute_summary_for_model(model)

    assert summary.total_income == pytest.approx(4000.0)
    assert summary.total_expenses == pytest.approx(2500.0)
    assert summary.surplus == pytest.approx(1500.0)


def test_compute_summary_negative_surplus_with_zero_income():
    model = make_model(
        incomes=[],
        expenses=[make_expense("groceries", "food", 600.0)],
    )

    summary = compute_summary_for_model(model)

    assert summary.total_income == pytest.approx(0.0)
    assert summary.total_expenses == pytest.approx(600.0)
    assert summary.surplus == pytest.approx(-600.0)


def test_compute_summary_multiple_income_streams():
    model = make_model(
        incomes=[
            make_income("job1", 2000.0, name="Job 1"),
            make_income("job2", 500.0, name="Job 2"),
            make_income("side", 150.0, name="Side Hustle"),
        ],
        expenses=[],
    )

    summary = compute_summary_for_model(model)

    assert summary.total_income == pytest.approx(2650.0)
    assert summary.total_expenses == pytest.approx(0.0)
    assert summary.surplus == pytest.approx(2650.0)


def test_compute_category_shares_multiple_expenses():
    expenses = [
        make_expense("rent1", "housing", 1000.0),
        make_expense("groceries", "food", 500.0),
        make_expense("rent2", "housing", 500.0),
    ]
    model = make_model(
        incomes=[make_income("salary", 4000.0)],
        expenses=expenses,
    )

    shares = compute_category_shares(model)

    assert shares["housing"] == pytest.approx(1500.0 / 2000.0)
    assert shares["food"] == pytest.approx(500.0 / 2000.0)


def test_compute_category_shares_zero_total_expenses_returns_empty():
    model = make_model(
        incomes=[make_income("salary", 3000.0)],
        expenses=[],
    )

    shares = compute_category_shares(model)

    assert shares == {}


def test_attach_summary_to_model_populates_summary_fields():
    initial_summary = Summary(total_income=0.0, total_expenses=0.0, surplus=0.0)
    model = make_model(
        incomes=[make_income("primary", 3200.0)],
        expenses=[
            make_expense("rent", "housing", 1800.0),
            make_expense("utilities", "bills", 200.0),
        ],
        summary=initial_summary,
    )

    updated_model = attach_summary_to_model(model)

    assert updated_model is model
    assert model.summary is initial_summary
    assert model.summary.total_income == pytest.approx(3200.0)
    assert model.summary.total_expenses == pytest.approx(2000.0)
    assert model.summary.surplus == pytest.approx(1200.0)
