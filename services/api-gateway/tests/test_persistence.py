from __future__ import annotations

from pathlib import Path
from typing import Dict
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from persistence.models import AuditEvent, Base
from persistence.repository import BudgetSessionRepository, SessionStage


def test_budget_session_survives_new_engine(tmp_path: Path) -> None:
    """Budget session data persists even after a new engine/session is created."""
    db_path = tmp_path / "gateway.db"
    url = f"sqlite:///{db_path}"

    engine_one = create_engine(
        url,
        connect_args={"check_same_thread": False},
        future=True,
    )
    Base.metadata.create_all(bind=engine_one)
    SessionOne = sessionmaker(bind=engine_one, expire_on_commit=False, future=True)

    with SessionOne() as session:
        repo = BudgetSessionRepository(session)
        repo.create_session("session-1", {"lines": [{"amount": 10}]})

    engine_one.dispose()

    engine_two = create_engine(
        url,
        connect_args={"check_same_thread": False},
        future=True,
    )
    SessionTwo = sessionmaker(bind=engine_two, expire_on_commit=False, future=True)

    with SessionTwo() as session:
        repo = BudgetSessionRepository(session)
        restored = repo.get_session("session-1")

    assert restored is not None
    assert restored.draft == {"lines": [{"amount": 10}]}
    assert restored.stage == SessionStage.DRAFT.value
    engine_two.dispose()


def test_audit_events_record_stage_transitions(tmp_path: Path) -> None:
    db_path = tmp_path / "audit.db"
    url = f"sqlite:///{db_path}"
    engine = create_engine(
        url,
        connect_args={"check_same_thread": False},
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False, future=True)

    answers: Dict[str, str] = {"q1": "yes"}
    with factory() as session:
        repo = BudgetSessionRepository(session)
        created = repo.create_session(
            "audit-session",
            {"lines": []},
            source_ip="127.0.0.1",
        )
        repo.update_partial(
            created,
            {"partial": True},
            source_ip="127.0.0.1",
            details={"question_count": 2},
        )
        repo.update_final(
            created,
            {"final": True},
            source_ip="127.0.0.1",
            details={"answer_count": len(answers)},
        )

        events = (
            session.query(AuditEvent)
            .filter(AuditEvent.session_id == created.id)
            .order_by(AuditEvent.id)
            .all()
        )

    assert [event.action for event in events] == [
        "upload_budget",
        "clarification_questions",
        "submit_answers",
    ]
    assert events[0].source_ip == "127.0.0.1"
    assert events[0].to_stage == SessionStage.DRAFT.value
    assert events[1].details == {"question_count": 2}
    assert events[2].details == {"answer_count": len(answers)}
    engine.dispose()

