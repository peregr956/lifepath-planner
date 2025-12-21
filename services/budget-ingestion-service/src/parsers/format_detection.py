from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from statistics import median
from typing import Any

from models.raw_budget import RawBudgetLine


@dataclass
class HeaderSignals:
    has_debit_column: bool = False
    has_credit_column: bool = False
    has_balance_column: bool = False


def detect_format(lines: list[RawBudgetLine], header_signals: HeaderSignals) -> tuple[str, dict[str, Any]]:
    """
    Determine whether uploaded rows resemble a ledger or categorical budget.

    Returns a tuple of (detected_format, hints) where hints describe the heuristics observed.
    """

    hints: dict[str, Any] = {
        "has_debit_column": header_signals.has_debit_column,
        "has_credit_column": header_signals.has_credit_column,
        "has_balance_column": header_signals.has_balance_column,
        "line_count": len(lines),
        "has_dense_dates": _has_dense_date_cadence(lines),
        "has_positive_and_negative": _has_positive_and_negative(lines),
    }

    score = 0
    if header_signals.has_debit_column or header_signals.has_credit_column:
        score += 2
    if header_signals.has_balance_column:
        score += 1
    if hints["has_dense_dates"]:
        score += 1
    if hints["has_positive_and_negative"] and len(lines) >= 20:
        score += 1
    if len(lines) >= 40:
        score += 1

    detected_format = "ledger" if score >= 2 else "categorical"
    hints["detection_score"] = score
    hints["detected_format"] = detected_format
    return detected_format, hints


def _has_positive_and_negative(lines: Iterable[RawBudgetLine]) -> bool:
    has_positive = False
    has_negative = False
    for line in lines:
        if line.amount > 0:
            has_positive = True
        elif line.amount < 0:
            has_negative = True
        if has_positive and has_negative:
            return True
    return False


def _has_dense_date_cadence(lines: Iterable[RawBudgetLine]) -> bool:
    dates = sorted({line.date for line in lines if line.date})
    if len(dates) < 6:
        return False
    differences = []
    for idx in range(1, len(dates)):
        delta = (dates[idx] - dates[idx - 1]).days
        if delta > 0:
            differences.append(delta)
    if not differences:
        return False
    typical_gap = median(differences)
    return typical_gap <= 7
