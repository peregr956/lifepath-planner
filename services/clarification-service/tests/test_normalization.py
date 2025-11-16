import sys
from pathlib import Path

import pytest


SERVICE_ROOT = Path(__file__).resolve().parents[1]
SERVICE_SRC = SERVICE_ROOT / "src"
INGESTION_SRC = SERVICE_ROOT.parent / "budget-ingestion-service" / "src"
OPTIMIZATION_SRC = SERVICE_ROOT.parent / "optimization-service" / "src"

for candidate in (SERVICE_SRC, INGESTION_SRC, OPTIMIZATION_SRC):
    candidate_str = str(candidate)
    if candidate.exists() and candidate_str not in sys.path:
        sys.path.append(candidate_str)

from normalization import apply_answers_to_model, draft_to_initial_unified
from models.raw_budget import DraftBudgetModel, RawBudgetLine
from budget_model import Expense, Income, Preferences, Summary, UnifiedBudgetModel


def test_draft_to_initial_unified_splits_income_and_expenses():
    # TODO(ai-integration): Expand once AI-driven debt/essentiality detection is available.
    positive_line = RawBudgetLine(
        source_row_index=1,
        date=None,
        category_label="Salary",
        description="Monthly paycheck",
        amount=5200.0,
        metadata={},
    )
    negative_line = RawBudgetLine(
        source_row_index=2,
        date=None,
        category_label="Housing",
        description="Rent payment",
        amount=-1800.0,
        metadata={},
    )
    draft = DraftBudgetModel(lines=[positive_line, negative_line])

    unified = draft_to_initial_unified(draft)

    assert len(unified.income) == 1
    assert unified.income[0].monthly_amount == pytest.approx(5200.0)
    assert len(unified.expenses) == 1
    assert unified.expenses[0].monthly_amount == pytest.approx(1800.0)
    assert unified.debts == []


def test_apply_answers_to_model_sets_essential_flags_and_preferences():
    # TODO(ai-integration): Cover AI-provided answer formats once available.
    income = Income(
        id="income-1",
        name="Salary",
        monthly_amount=6000.0,
        type="earned",
        stability="stable",
    )
    housing = Expense(
        id="housing",
        category="Housing",
        monthly_amount=2000.0,
        essential=False,
        notes=None,
    )
    dining = Expense(
        id="dining",
        category="Dining",
        monthly_amount=600.0,
        essential=False,
        notes=None,
    )
    preferences = Preferences(
        optimization_focus="balanced",
        protect_essentials=True,
        max_desired_change_per_category=0.05,
    )
    summary = Summary(total_income=6000.0, total_expenses=2600.0, surplus=3400.0)
    model = UnifiedBudgetModel(
        income=[income],
        expenses=[housing, dining],
        debts=[],
        preferences=preferences,
        summary=summary,
    )

    answers = {
        "essential_housing": True,
        "essential_dining": False,
        "optimization_focus": "debt",
    }

    updated = apply_answers_to_model(model, answers)

    assert updated.expenses[0].essential is True
    assert updated.expenses[1].essential is False
    assert updated.preferences.optimization_focus == "debt"
