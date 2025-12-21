from collections import defaultdict
from typing import Any, Dict, List

import httpx
import pytest
from fastapi.testclient import TestClient
from http_client import RequestMetrics
from main import CLARIFICATION_BASE, INGESTION_BASE, OPTIMIZATION_BASE, app
from persistence.database import SessionLocal
from persistence.models import AuditEvent, BudgetSession


class StubHttpClient:
    def __init__(self) -> None:
        self._routes: dict[str, list[dict[str, Any]]] = defaultdict(list)

    def add_json_response(self, url: str, payload: dict[str, Any], status_code: int = 200) -> None:
        self._routes[url].append({"payload": payload, "status_code": status_code})

    async def post(self, url: str, **_: Any):
        if not self._routes[url]:
            raise AssertionError(f"No stubbed response registered for {url}")
        entry = self._routes[url].pop(0)
        response = _FakeResponse(entry["payload"], entry["status_code"])
        response.raise_for_status()
        return response, RequestMetrics(attempts=1, latency_ms=1.0)


class _FakeResponse:
    def __init__(self, payload: dict[str, Any], status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def json(self) -> dict[str, Any]:
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("stubbed http error", request=None, response=_HttpxResponse(self.status_code))


class _HttpxResponse(httpx.Response):  # pragma: no cover - helper for HTTPStatusError
    def __init__(self, status_code: int) -> None:
        super().__init__(status_code=status_code, request=httpx.Request("POST", "http://test"))


@pytest.fixture(autouse=True)
def reset_db():
    yield
    session = SessionLocal()
    session.query(AuditEvent).delete()
    session.query(BudgetSession).delete()
    session.commit()
    session.close()


@pytest.fixture
def stub_http_client(monkeypatch) -> StubHttpClient:
    stub = StubHttpClient()
    monkeypatch.setattr("main.http_client", stub)
    return stub


@pytest.fixture
def client(stub_http_client: StubHttpClient) -> TestClient:
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


def test_upload_budget_records_session_and_returns_hints(client: TestClient, stub_http_client: StubHttpClient) -> None:
    ingestion_url = f"{INGESTION_BASE}/ingest"
    stub_http_client.add_json_response(
        ingestion_url,
        {
            "lines": [
                {
                    "source_row_index": 1,
                    "category_label": "Salary",
                    "amount": 5000,
                    "metadata": {},
                },
                {
                    "source_row_index": 2,
                    "category_label": "Rent",
                    "amount": -1800,
                    "metadata": {},
                },
            ],
            "detected_format": "categorical",
            "format_hints": {"line_count": 2},
        },
    )
    files = {"file": ("sample.csv", b"category,amount\nSalary,5000\nRent,-1800\n", "text/csv")}

    response = client.post("/upload-budget", files=files)

    assert response.status_code == 200
    payload = response.json()
    assert payload["detected_format"] == "categorical"
    assert payload["detected_format_hints"]["line_count"] == 2
    assert payload["summary_preview"]["detected_income_lines"] == 1
    assert payload["summary_preview"]["detected_expense_lines"] == 1


def test_clarification_questions_stores_partial_model(client: TestClient, stub_http_client: StubHttpClient) -> None:
    _bootstrap_upload(client, stub_http_client)

    clarify_url = f"{CLARIFICATION_BASE}/clarify"
    stub_http_client.add_json_response(
        clarify_url,
        {
            "needs_clarification": True,
            "questions": [],
            "partial_model": {
                "income": [],
                "expenses": [{"id": "rent", "category": "Rent", "monthly_amount": 1800, "essential": None}],
                "debts": [],
                "preferences": {
                    "optimization_focus": "balanced",
                    "protect_essentials": True,
                    "max_desired_change_per_category": 0.0,
                },
                "summary": {"total_income": 5000, "total_expenses": 1800, "surplus": 3200},
            },
        },
    )

    budget_id = _latest_budget_id()
    response = client.get(f"/clarification-questions?budget_id={budget_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["budget_id"] == budget_id
    assert payload["partial_model"] is not None


@pytest.mark.skip(reason="TODO: Fix answer validation to reject unknown field IDs")
def test_submit_answers_validates_and_propagates_readiness(
    client: TestClient, stub_http_client: StubHttpClient
) -> None:
    _bootstrap_upload(client, stub_http_client)
    _bootstrap_clarification(client, stub_http_client, needs_clarification=True)

    # Validation should fail for unknown debt
    budget_id = _latest_budget_id()
    response = client.post(
        "/submit-answers",
        json={"budget_id": budget_id, "answers": {"mystery_field": 123}},
    )
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_answers"

    apply_url = f"{CLARIFICATION_BASE}/apply-answers"
    stub_http_client.add_json_response(
        apply_url,
        {
            "updated_model": {"summary": {"total_income": 5000, "total_expenses": 2000, "surplus": 3000}},
            "ready_for_summary": True,
        },
    )

    response = client.post(
        "/submit-answers",
        json={"budget_id": budget_id, "answers": {"expenses.rent.essential": True}},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ready_for_summary"] is True


def test_summary_and_suggestions_returns_payload(client: TestClient, stub_http_client: StubHttpClient) -> None:
    _bootstrap_upload(client, stub_http_client)
    _bootstrap_clarification(client, stub_http_client, needs_clarification=False)
    budget_id = _latest_budget_id()

    apply_url = f"{CLARIFICATION_BASE}/apply-answers"
    stub_http_client.add_json_response(
        apply_url,
        {
            "updated_model": {"summary": {"total_income": 5000, "total_expenses": 2000, "surplus": 3000}},
            "ready_for_summary": True,
        },
    )
    client.post("/submit-answers", json={"budget_id": budget_id, "answers": {}})

    summary_url = f"{OPTIMIZATION_BASE}/summarize-and-optimize"
    stub_http_client.add_json_response(
        summary_url,
        {
            "summary": {"total_income": 5000, "total_expenses": 2000, "surplus": 3000},
            "category_shares": {"Rent": 0.36},
            "suggestions": [
                {
                    "id": "cut_dining",
                    "title": "Trim dining",
                    "description": "Reduce takeout.",
                    "expected_monthly_impact": 50,
                    "rationale": "Dining is flexible",
                    "tradeoffs": "Fewer meals out",
                }
            ],
        },
    )

    response = client.get(f"/summary-and-suggestions?budget_id={budget_id}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["surplus"] == 3000
    assert payload["suggestions"][0]["id"] == "cut_dining"


def _bootstrap_upload(client: TestClient, stub: StubHttpClient) -> None:
    ingestion_url = f"{INGESTION_BASE}/ingest"
    stub.add_json_response(
        ingestion_url,
        {
            "lines": [
                {"source_row_index": 1, "category_label": "Salary", "amount": 5000, "metadata": {}},
                {"source_row_index": 2, "category_label": "Rent", "amount": -1800, "metadata": {}},
            ],
            "detected_format": "categorical",
            "format_hints": {"line_count": 2},
        },
    )
    client.post(
        "/upload-budget", files={"file": ("data.csv", b"category,amount\nSalary,5000\nRent,-1800\n", "text/csv")}
    )


def _bootstrap_clarification(client: TestClient, stub: StubHttpClient, *, needs_clarification: bool) -> None:
    clarify_url = f"{CLARIFICATION_BASE}/clarify"
    stub.add_json_response(
        clarify_url,
        {
            "needs_clarification": needs_clarification,
            "questions": [],
            "partial_model": {
                "income": [],
                "expenses": [{"id": "rent", "category": "Rent", "monthly_amount": 1800, "essential": None}],
                "debts": [],
                "preferences": {
                    "optimization_focus": "balanced",
                    "protect_essentials": True,
                    "max_desired_change_per_category": 0.0,
                },
                "summary": {"total_income": 5000, "total_expenses": 1800, "surplus": 3200},
            },
        },
    )
    budget_id = _latest_budget_id()
    client.get(f"/clarification-questions?budget_id={budget_id}")


def _latest_budget_id() -> str:
    session = SessionLocal()
    try:
        record = session.query(BudgetSession).order_by(BudgetSession.created_at.desc()).first()
        assert record is not None
        return record.id
    finally:
        session.close()
