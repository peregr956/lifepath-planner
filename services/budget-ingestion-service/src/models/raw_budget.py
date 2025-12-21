from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal


@dataclass(slots=True)
class RawBudgetLine:
    """Represents a single row extracted from a user-provided budget source."""

    source_row_index: int
    date: date | None
    category_label: str
    description: str | None
    amount: float
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class DraftBudgetModel:
    """Container for parsed-but-not-yet-normalized budget data."""

    lines: list[RawBudgetLine] = field(default_factory=list)
    detected_format: Literal["categorical", "ledger", "unknown"] = "unknown"
    notes: str | None = None
    format_hints: dict[str, Any] | None = None
