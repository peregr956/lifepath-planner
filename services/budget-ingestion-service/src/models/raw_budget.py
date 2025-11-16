from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Dict, List, Literal, Optional


@dataclass(slots=True)
class RawBudgetLine:
    """Represents a single row extracted from a user-provided budget source."""

    source_row_index: int
    date: Optional[date]
    category_label: str
    description: Optional[str]
    amount: float
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class DraftBudgetModel:
    """Container for parsed-but-not-yet-normalized budget data."""

    lines: List[RawBudgetLine] = field(default_factory=list)
    detected_format: Literal["categorical", "ledger", "unknown"] = "unknown"
    notes: Optional[str] = None
