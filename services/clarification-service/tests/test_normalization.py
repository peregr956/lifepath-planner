import json
from pathlib import Path

import pytest

from normalization import apply_answers_to_model, draft_to_initial_unified
from models.raw_budget import DraftBudgetModel, RawBudgetLine
from budget_model import Debt, Expense, Income, Preferences, RateChange, Summary, UnifiedBudgetModel

SERVICE_ROOT = Path(__file__).resolve().parents[1]
FIXTURES_DIR = SERVICE_ROOT / "tests" / "fixtures"


def _load_fixture(name: str) -> dict:
    path = FIXTURES_DIR / name
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _model_from_payload(payload: dict) -> UnifiedBudgetModel:
    incomes = [Income(**entry) for entry in payload.get("income", [])]
    expenses = [Expense(**entry) for entry in payload.get("expenses", [])]
    debts = [Debt(**entry) for entry in payload.get("debts", [])]
    preferences = Preferences(**payload["preferences"])
    summary = Summary(**payload["summary"])
    return UnifiedBudgetModel(
        income=incomes,
        expenses=expenses,
        debts=debts,
        preferences=preferences,
        summary=summary,
    )


def test_draft_to_initial_unified_splits_income_and_expenses():
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
    assert unified.income[0].type == "earned"
    assert unified.income[0].stability == "stable"
    assert len(unified.expenses) == 1
    assert unified.expenses[0].monthly_amount == pytest.approx(1800.0)
    assert unified.expenses[0].essential is True
    assert unified.debts == []


def test_draft_to_initial_unified_detects_debt_candidates():
    salary = RawBudgetLine(
        source_row_index=1,
        date=None,
        category_label="Freelance",
        description="Gig income",
        amount=3200.0,
        metadata={},
    )
    student_loan_payment = RawBudgetLine(
        source_row_index=2,
        date=None,
        category_label="Student Loan",
        description="Monthly payment",
        amount=-450.0,
        metadata={},
    )
    draft = DraftBudgetModel(lines=[salary, student_loan_payment])

    unified = draft_to_initial_unified(draft)

    assert len(unified.debts) == 1
    detected_debt = unified.debts[0]
    assert detected_debt.id.startswith("student_loan")
    assert detected_debt.min_payment == pytest.approx(450.0)
    assert detected_debt.priority == "medium"


def test_apply_answers_to_model_sets_essential_flags_and_preferences():
    # TODO(ai-integration): Cover AI-provided answer formats once available.
    # Tracked in docs/AI_integration_readiness.md#ai-answer-application.
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


def test_apply_answers_to_model_handles_income_and_debt_fields():
    income = Income(
        id="income_1",
        name="Primary Salary",
        monthly_amount=8000.0,
        type="earned",
        stability="stable",
    )
    preferences = Preferences(
        optimization_focus="balanced",
        protect_essentials=True,
        max_desired_change_per_category=0.05,
    )
    summary = Summary(total_income=8000.0, total_expenses=0.0, surplus=8000.0)
    personal_loan = Debt(
        id="personal_loan",
        name="Personal Loan",
        balance=4000.0,
        interest_rate=12.5,
        min_payment=150.0,
        priority="medium",
        approximate=True,
        rate_changes=None,
    )
    model = UnifiedBudgetModel(
        income=[income],
        expenses=[],
        debts=[personal_loan],
        preferences=preferences,
        summary=summary,
    )

    answers = {
        "primary_income_type": "net",
        "primary_income_stability": "variable",
        "personal_loan_balance": 7200,
        "personal_loan_interest_rate": 9.75,
        "personal_loan_min_payment": 275,
        "personal_loan_priority": "high",
        "personal_loan_approximate": False,
        "personal_loan_rate_change_date": "2025-06-01",
        "personal_loan_rate_change_new_rate": 14.25,
    }

    updated = apply_answers_to_model(model, answers)

    metadata = getattr(updated.income[0], "metadata", {})
    assert metadata.get("net_or_gross") == "net"
    assert updated.income[0].stability == "variable"

    debt_entry = updated.debts[0]
    assert debt_entry.balance == pytest.approx(7200.0)
    assert debt_entry.interest_rate == pytest.approx(9.75)
    assert debt_entry.min_payment == pytest.approx(275.0)
    assert debt_entry.priority == "high"
    assert debt_entry.approximate is False
    assert debt_entry.rate_changes == [RateChange(date="2025-06-01", new_rate=14.25)]


def test_apply_answers_handles_binding_style_payloads():
    payload = _load_fixture("ai_answers_payload.json")
    partial_model = _model_from_payload(payload["partial_model"])

    updated = apply_answers_to_model(partial_model, payload["answers"])

    metadata = getattr(updated.income[0], "metadata", {})
    assert metadata.get("net_or_gross") == "net"
    assert updated.income[0].stability == "variable"
    assert updated.preferences.optimization_focus == "debt"
    assert len(updated.debts) == 1
    debt_entry = updated.debts[0]
    assert debt_entry.id == "student_loan"
    assert debt_entry.balance == pytest.approx(12000.0)
    assert debt_entry.min_payment == pytest.approx(350.0)
    assert debt_entry.rate_changes == [RateChange(date="2026-01-01", new_rate=7.25)]
