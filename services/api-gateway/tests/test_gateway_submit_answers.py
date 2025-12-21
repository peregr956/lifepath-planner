from __future__ import annotations

import copy
from pathlib import Path
from typing import Dict

import httpx
import pytest
from fastapi.testclient import TestClient
from http_client import RequestMetrics
from main import app
from persistence.database import get_session
from persistence.models import Base
from persistence.repository import BudgetSessionRepository
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BASE_PARTIAL_MODEL: dict[str, object] = {
    "income": [
        {
            "id": "income-draft-1-1",
            "name": "Salary",
            "monthly_amount": 5000,
            "type": "earned",
            "stability": "stable",
        }
    ],
    "expenses": [
        {
            "id": "expense-draft-1-1",
            "category": "Housing",
            "monthly_amount": 1800,
            "essential": True,
        }
    ],
    "debts": [
        {
            "id": "debt-1",
            "name": "Credit Card",
            "balance": 2000,
            "interest_rate": 19.99,
            "min_payment": 75,
            "priority": "medium",
            "approximate": False,
            "rate_changes": [],
        }
    ],
    "preferences": {
        "optimization_focus": "balanced",
        "protect_essentials": True,
        "max_desired_change_per_category": 0,
    },
    "summary": {
        "total_income": 5000,
        "total_expenses": 1800,
        "surplus": 3200,
    },
}


@pytest.fixture
def session_factory(tmp_path: Path):
    db_path = tmp_path / "gateway_test.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False, future=True)
    try:
        yield factory
    finally:
        engine.dispose()


@pytest.fixture
def client(session_factory):
    def override_get_session():
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_session, None)


def _seed_budget_session(session_factory) -> str:
    session = session_factory()
    try:
        repo = BudgetSessionRepository(session)
        record = repo.create_session(
            "test-budget",
            {"lines": []},
        )
        repo.update_partial(record, copy.deepcopy(BASE_PARTIAL_MODEL))
        return record.id
    finally:
        session.close()


def test_submit_answers_validation_success_proxies_upstream(client: TestClient, session_factory, monkeypatch) -> None:
    captured_calls = []

    async def fake_post(url: str, *, json: dict[str, object], request_id: str, **kwargs):
        captured_calls.append({"url": url, "json": json, "request_id": request_id})
        return (
            httpx.Response(200, json={"updated_model": {"summary": {}}, "ready_for_summary": True}),
            RequestMetrics(attempts=1, latency_ms=12.5),
        )

    monkeypatch.setattr(
        "main.http_client.post",
        fake_post,
    )

    budget_id = _seed_budget_session(session_factory)
    answers = {
        "essential_expense-draft-1-1": True,
        "optimization_focus": "savings",
        "primary_income_type": "net",
        "debt-1_balance": 1500,
    }

    response = client.post(
        "/submit-answers",
        json={"budget_id": budget_id, "answers": answers},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {"budget_id": budget_id, "status": "ready_for_summary", "ready_for_summary": True}
    assert len(captured_calls) == 1
    forwarded = captured_calls[0]
    assert forwarded["url"].endswith("/apply-answers")
    assert forwarded["json"]["answers"] == answers


def test_submit_answers_ready_flag_false_updates_status(client: TestClient, session_factory, monkeypatch) -> None:
    async def fake_post(url: str, *, json: dict[str, object], request_id: str, **kwargs):
        return (
            httpx.Response(200, json={"updated_model": {"summary": {}}, "ready_for_summary": False}),
            RequestMetrics(attempts=1, latency_ms=8.4),
        )

    monkeypatch.setattr(
        "main.http_client.post",
        fake_post,
    )

    budget_id = _seed_budget_session(session_factory)
    answers = {
        "essential_expense-draft-1-1": True,
    }

    response = client.post(
        "/submit-answers",
        json={"budget_id": budget_id, "answers": answers},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {"budget_id": budget_id, "status": "clarified", "ready_for_summary": False}


def test_submit_answers_validation_failure_returns_400(client: TestClient, session_factory, monkeypatch) -> None:
    async def fail_post(*args, **kwargs):
        raise AssertionError("Upstream call should not run when validation fails.")

    monkeypatch.setattr("main.http_client.post", fail_post)

    budget_id = _seed_budget_session(session_factory)
    answers = {
        "essential_expense-draft-1-1": "maybe",
        "mystery_field": "value",
    }

    response = client.post(
        "/submit-answers",
        json={"budget_id": budget_id, "answers": answers},
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["error"] == "invalid_answers"
    assert "issues" in payload
    reasons = {issue["reason"] for issue in payload["issues"]}
    assert "invalid_boolean" in reasons
    assert "unsupported_field_id" in reasons
