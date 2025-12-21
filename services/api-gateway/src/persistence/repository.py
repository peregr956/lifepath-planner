"""Budget session data access helpers."""

from __future__ import annotations

from enum import Enum
from typing import Any

from sqlalchemy.orm import Session

from persistence.models import AuditEvent, BudgetSession


class SessionStage(str, Enum):
    """Enumerates the major checkpoints in the budgeting flow."""

    DRAFT = "draft"
    PARTIAL = "partial"
    FINAL = "final"


class BudgetSessionRepository:
    """Thin repository that encapsulates persistence operations."""

    def __init__(self, db: Session):
        self._db = db

    def create_session(
        self,
        session_id: str,
        draft_payload: dict[str, Any],
        *,
        source_ip: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> BudgetSession:
        record = BudgetSession(
            id=session_id,
            stage=SessionStage.DRAFT.value,
            draft=draft_payload,
        )
        self._db.add(record)
        self._record_event(
            action="upload_budget",
            session=record,
            source_ip=source_ip,
            from_stage=None,
            to_stage=SessionStage.DRAFT.value,
            details=details,
        )
        self._db.commit()
        self._db.refresh(record)
        return record

    def get_session(self, session_id: str) -> BudgetSession | None:
        return self._db.get(BudgetSession, session_id)

    def update_partial(
        self,
        session: BudgetSession,
        partial_model: dict[str, Any] | None,
        *,
        source_ip: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> BudgetSession:
        previous_stage = session.stage
        session.partial = partial_model
        session.stage = SessionStage.PARTIAL.value
        self._db.add(session)
        self._record_event(
            action="clarification_questions",
            session=session,
            source_ip=source_ip,
            from_stage=previous_stage,
            to_stage=session.stage,
            details=details,
        )
        self._db.commit()
        self._db.refresh(session)
        return session

    def update_final(
        self,
        session: BudgetSession,
        final_model: dict[str, Any] | None,
        *,
        source_ip: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> BudgetSession:
        previous_stage = session.stage
        session.final = final_model
        session.stage = SessionStage.FINAL.value
        self._db.add(session)
        self._record_event(
            action="submit_answers",
            session=session,
            source_ip=source_ip,
            from_stage=previous_stage,
            to_stage=session.stage,
            details=details,
        )
        self._db.commit()
        self._db.refresh(session)
        return session

    def store_user_query(
        self,
        session: BudgetSession,
        query: str,
        *,
        source_ip: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> BudgetSession:
        """Store the user's initial question/query for personalized guidance."""
        session.user_query = query
        self._db.add(session)
        self._record_event(
            action="user_query_submitted",
            session=session,
            source_ip=source_ip,
            from_stage=session.stage,
            to_stage=session.stage,
            details={"query_length": len(query), **(details or {})},
        )
        self._db.commit()
        self._db.refresh(session)
        return session

    def store_user_profile(
        self,
        session: BudgetSession,
        profile_data: dict[str, Any],
        *,
        source_ip: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> BudgetSession:
        """Store user profile data collected through adaptive questioning."""
        # Merge with existing profile if any
        existing_profile = session.user_profile or {}
        merged_profile = {**existing_profile, **profile_data}
        session.user_profile = merged_profile
        self._db.add(session)
        self._record_event(
            action="user_profile_updated",
            session=session,
            source_ip=source_ip,
            from_stage=session.stage,
            to_stage=session.stage,
            details={"profile_fields": list(profile_data.keys()), **(details or {})},
        )
        self._db.commit()
        self._db.refresh(session)
        return session

    def get_user_context(self, session: BudgetSession) -> dict[str, Any]:
        """Retrieve user query and profile data for use in question/suggestion generation."""
        return {
            "user_query": session.user_query,
            "user_profile": session.user_profile or {},
        }

    def _record_event(
        self,
        *,
        action: str,
        session: BudgetSession,
        source_ip: str | None,
        from_stage: str | None,
        to_stage: str | None,
        details: dict[str, Any] | None,
    ) -> None:
        event = AuditEvent(
            session_id=session.id,
            action=action,
            source_ip=source_ip,
            from_stage=from_stage,
            to_stage=to_stage,
            details=details,
        )
        self._db.add(event)
