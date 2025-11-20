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


def test_cors_headers_allow_frontend_origin(client: TestClient) -> None:
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"


@pytest.mark.skip(
    reason="TODO(ai-integration): replace with ingestion integration test when services run together. "
    "Tracked in docs/AI_integration_readiness.md#integration-test-coverage."
)
def test_upload_budget_placeholder() -> None:
    """Placeholder until ingestion service is exercised via AI orchestrated run."""
    # TODO(ai-integration): exercise /upload-budget once ingestion service is part of end-to-end smoke tests.
    # Tracked in docs/AI_integration_readiness.md#integration-test-coverage.
    pass


@pytest.mark.skip(
    reason="TODO(ai-integration): replace with clarification integration test when services run together. "
    "Tracked in docs/AI_integration_readiness.md#integration-test-coverage."
)
def test_clarification_questions_placeholder() -> None:
    """Placeholder until clarification service is exercised via AI orchestrated run."""
    # TODO(ai-integration): exercise /clarification-questions once clarification service runs in CI.
    # Tracked in docs/AI_integration_readiness.md#integration-test-coverage.
    pass


@pytest.mark.skip(
    reason="TODO(ai-integration): replace with clarification answers integration test when services run together. "
    "Tracked in docs/AI_integration_readiness.md#integration-test-coverage."
)
def test_submit_answers_placeholder() -> None:
    """Placeholder until AI-assisted answer submission is wired in test harness."""
    # TODO(ai-integration): exercise /submit-answers once clarification + budgets flow is automated.
    # Tracked in docs/AI_integration_readiness.md#integration-test-coverage.
    pass


@pytest.mark.skip(
    reason="TODO(ai-integration): replace with optimization integration test when services run together. "
    "Tracked in docs/AI_integration_readiness.md#integration-test-coverage."
)
def test_summary_and_suggestions_placeholder() -> None:
    """Placeholder until optimization service is exercised via AI orchestrated run."""
    # TODO(ai-integration): exercise /summary-and-suggestions once optimization service joins gateway smoke tests.
    # Tracked in docs/AI_integration_readiness.md#integration-test-coverage.
    pass
