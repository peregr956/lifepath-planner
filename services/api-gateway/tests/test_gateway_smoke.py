import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


ROOT_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from main import app  # noqa: E402


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


def test_health_route_reports_api_gateway(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("service") == "api-gateway"
    assert payload.get("status") == "ok"


@pytest.mark.skip(reason="TODO(ai-integration): replace with ingestion integration test when services run together.")
def test_upload_budget_placeholder() -> None:
    """Placeholder until ingestion service is exercised via AI orchestrated run."""
    # TODO(ai-integration): exercise /upload-budget once ingestion service is part of end-to-end smoke tests.
    pass


@pytest.mark.skip(reason="TODO(ai-integration): replace with clarification integration test when services run together.")
def test_clarification_questions_placeholder() -> None:
    """Placeholder until clarification service is exercised via AI orchestrated run."""
    # TODO(ai-integration): exercise /clarification-questions once clarification service runs in CI.
    pass


@pytest.mark.skip(reason="TODO(ai-integration): replace with clarification answers integration test when services run together.")
def test_submit_answers_placeholder() -> None:
    """Placeholder until AI-assisted answer submission is wired in test harness."""
    # TODO(ai-integration): exercise /submit-answers once clarification + budgets flow is automated.
    pass


@pytest.mark.skip(reason="TODO(ai-integration): replace with optimization integration test when services run together.")
def test_summary_and_suggestions_placeholder() -> None:
    """Placeholder until optimization service is exercised via AI orchestrated run."""
    # TODO(ai-integration): exercise /summary-and-suggestions once optimization service joins gateway smoke tests.
    pass
