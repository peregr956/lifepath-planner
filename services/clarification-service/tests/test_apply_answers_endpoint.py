import json
import sys
from pathlib import Path
from typing import Any, Dict

from fastapi.testclient import TestClient

SERVICE_ROOT = Path(__file__).resolve().parents[1]
SERVICE_SRC = SERVICE_ROOT / "src"
INGESTION_SRC = SERVICE_ROOT.parent / "budget-ingestion-service" / "src"
OPTIMIZATION_SRC = SERVICE_ROOT.parent / "optimization-service" / "src"
FIXTURES_DIR = SERVICE_ROOT / "tests" / "fixtures"

for candidate in (SERVICE_SRC, INGESTION_SRC, OPTIMIZATION_SRC):
    candidate_str = str(candidate)
    if candidate.exists() and candidate_str not in sys.path:
        sys.path.append(candidate_str)

from main import (  # noqa: E402
    ApplyAnswersResponseModel,
    UnifiedBudgetResponseModel,
    app,
)
from budget_model import (  # noqa: E402
    Debt,
    Expense,
    Income,
    Preferences,
    Summary,
    UnifiedBudgetModel,
)


client = TestClient(app)


def _load_fixture(name: str) -> dict:
    path = FIXTURES_DIR / name
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _build_partial_model_payload() -> Dict[str, Any]:
    income = Income(
        id="income_1",
        name="Salary",
        monthly_amount=6000.0,
        type="earned",
        stability="stable",
    )
    expense = Expense(
        id="housing",
        category="Housing",
        monthly_amount=2100.0,
        essential=False,
        notes=None,
    )
    debt = Debt(
        id="personal_loan",
        name="Personal Loan",
        balance=5000.0,
        interest_rate=11.25,
        min_payment=200.0,
        priority="medium",
        approximate=True,
        rate_changes=None,
    )
    preferences = Preferences(
        optimization_focus="balanced",
        protect_essentials=True,
        max_desired_change_per_category=0.1,
    )
    summary = Summary(total_income=6000.0, total_expenses=2100.0, surplus=3900.0)

    unified = UnifiedBudgetModel(
        income=[income],
        expenses=[expense],
        debts=[debt],
        preferences=preferences,
        summary=summary,
    )
    return UnifiedBudgetResponseModel.from_dataclass(unified).model_dump()


def test_apply_answers_rejects_unknown_field_id():
    payload = {
        "partial_model": _build_partial_model_payload(),
        "answers": {"mystery_field": "value"},
    }

    response = client.post("/apply-answers", json=payload)

    assert response.status_code == 400
    body = response.json()
    assert body["error"] == "invalid_field_ids"
    assert body["invalid_fields"][0]["field_id"] == "mystery_field"


def test_apply_answers_rejects_unknown_debt_reference():
    payload = {
        "partial_model": _build_partial_model_payload(),
        "answers": {"otherloan_balance": 900},
    }

    response = client.post("/apply-answers", json=payload)

    assert response.status_code == 400
    body = response.json()
    assert body["error"] == "invalid_field_ids"
    assert body["invalid_fields"][0]["reason"] == "unknown_debt"


def test_apply_answers_accepts_valid_field_ids():
    payload = {
        "partial_model": _build_partial_model_payload(),
        "answers": {
            "optimization_focus": "savings",
            "essential_housing": True,
            "personal_loan_balance": 7100,
        },
    }

    response = client.post("/apply-answers", json=payload)

    assert response.status_code == 200
    body = ApplyAnswersResponseModel(**response.json())
    assert body.ready_for_summary is True
    assert body.updated_model.summary.total_income == 6000.0


def test_apply_answers_accepts_binding_style_fields():
    fixture = _load_fixture("ai_answers_payload.json")
    payload = {
        "partial_model": fixture["partial_model"],
        "answers": fixture["answers"],
    }

    response = client.post("/apply-answers", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["ready_for_summary"] is True
    debts = data["updated_model"]["debts"]
    assert debts and debts[0]["id"] == "student_loan"

