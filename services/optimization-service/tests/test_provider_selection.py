import json
import sys
from pathlib import Path
from typing import Any, Dict

import pytest
from fastapi.testclient import TestClient

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.append(str(SERVICE_ROOT))

from src.main import app, reload_suggestion_provider_for_tests  # noqa: E402


client = TestClient(app)


def _model_payload() -> Dict[str, Any]:
    return {
        "income": [
            {
                "id": "income_primary",
                "name": "Salary",
                "monthly_amount": 7000.0,
                "type": "earned",
                "stability": "stable",
            }
        ],
        "expenses": [
            {
                "id": "expense_housing",
                "category": "Housing",
                "monthly_amount": 2000.0,
                "essential": True,
                "notes": "Rent",
            },
            {
                "id": "expense_groceries",
                "category": "Groceries",
                "monthly_amount": 800.0,
                "essential": False,
                "notes": None,
            },
        ],
        "debts": [
            {
                "id": "credit_card",
                "name": "Credit Card",
                "balance": 4000.0,
                "interest_rate": 22.5,
                "min_payment": 150.0,
                "priority": "high",
                "approximate": False,
                "rate_changes": None,
            }
        ],
        "preferences": {
            "optimization_focus": "balanced",
            "protect_essentials": True,
            "max_desired_change_per_category": 0.1,
        },
        "summary": {"total_income": 7000.0, "total_expenses": 2800.0, "surplus": 4200.0},
    }


def _load_mock_suggestions() -> Dict[str, Any]:
    fixture_path = SERVICE_ROOT / "tests" / "fixtures" / "mock_suggestions_provider.json"
    return json.loads(fixture_path.read_text())


def test_summarize_and_optimize_uses_deterministic_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUGGESTION_PROVIDER", "deterministic")
    reload_suggestion_provider_for_tests()
    response = client.post("/summarize-and-optimize", json=_model_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["suggestions"], "deterministic provider should emit suggestions"
    assert body["suggestions"][0]["id"] != "mock-suggestion-1"


def test_summarize_and_optimize_uses_mock_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUGGESTION_PROVIDER", "mock")
    reload_suggestion_provider_for_tests()
    response = client.post("/summarize-and-optimize", json=_model_payload())

    assert response.status_code == 200
    body = response.json()
    mock_payload = _load_mock_suggestions()
    assert body["suggestions"] == mock_payload["suggestions"]

