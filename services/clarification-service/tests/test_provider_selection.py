import json
import os
import sys
from pathlib import Path
from typing import Any, Dict

import pytest
from fastapi.testclient import TestClient

SERVICE_ROOT = Path(__file__).resolve().parents[1]
SERVICE_SRC = SERVICE_ROOT / "src"
INGESTION_SRC = SERVICE_ROOT.parent / "budget-ingestion-service" / "src"
OPTIMIZATION_SRC = SERVICE_ROOT.parent / "optimization-service" / "src"

for candidate in (SERVICE_SRC, INGESTION_SRC, OPTIMIZATION_SRC):
    candidate_str = str(candidate)
    if candidate.exists() and candidate_str not in sys.path:
        sys.path.append(candidate_str)

from main import app, reload_clarification_provider_for_tests  # noqa: E402


client = TestClient(app)


def _draft_payload() -> Dict[str, Any]:
    return {
        "lines": [
            {
                "source_row_index": 1,
                "date": None,
                "category_label": "Salary",
                "description": "Monthly pay",
                "amount": 6000.0,
                "metadata": {},
            },
            {
                "source_row_index": 2,
                "date": None,
                "category_label": "Rent",
                "description": "Apartment rent",
                "amount": -1800.0,
                "metadata": {},
            },
        ],
        "detected_format": "categorical",
        "notes": None,
    }


def _load_mock_questions() -> Dict[str, Any]:
    fixture_path = SERVICE_ROOT / "tests" / "fixtures" / "mock_clarification_provider.json"
    return json.loads(fixture_path.read_text())


def test_clarify_uses_deterministic_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLARIFICATION_PROVIDER", "deterministic")
    reload_clarification_provider_for_tests()
    response = client.post("/clarify", json=_draft_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["questions"], "deterministic provider should emit default questions"
    assert body["questions"][0]["question_id"] != "mock_clarification_question"


def test_clarify_uses_mock_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLARIFICATION_PROVIDER", "mock")
    reload_clarification_provider_for_tests()
    response = client.post("/clarify", json=_draft_payload())

    assert response.status_code == 200
    body = response.json()
    mock_payload = _load_mock_questions()
    assert body["questions"] == mock_payload["questions"]

