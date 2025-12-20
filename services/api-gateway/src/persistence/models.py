"""SQLAlchemy models for persisted budget sessions and audit events."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


class BudgetSession(Base):
    """Durable representation of a budget planning workflow."""

    __tablename__ = "budget_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    stage: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)

    draft: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    partial: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    final: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    # User's initial query/question that drives personalized guidance
    user_query: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)

    # User profile data collected through adaptive questioning
    user_profile: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    audit_events: Mapped[List["AuditEvent"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="AuditEvent.id",
    )


class AuditEvent(Base):
    """Tracks important mutations for future troubleshooting."""

    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("budget_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    source_ip: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    from_stage: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    to_stage: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    details: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    session: Mapped["BudgetSession"] = relationship(back_populates="audit_events")

