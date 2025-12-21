"""End-to-end deterministic pipeline test for ingestion → clarification → optimization."""

from __future__ import annotations

import dataclasses
import json
import os
from collections.abc import Sequence
from pathlib import Path
from typing import Dict

import pytest
from budget_model import Expense, UnifiedBudgetModel
from compute_summary import compute_category_shares, compute_summary_for_model
from generate_suggestions import Suggestion, generate_suggestions

# Imports using proper package paths configured via pyproject.toml
from models.raw_budget import DraftBudgetModel, RawBudgetLine
from normalization import ESSENTIAL_PREFIX, apply_answers_to_model, draft_to_initial_unified
from parsers.csv_parser import parse_csv_to_draft_model
from question_generator import QuestionSpec, generate_clarification_questions
from ui_schema_builder import build_initial_ui_schema

REPO_ROOT = Path(__file__).resolve().parents[1]
SERVICES_ROOT = REPO_ROOT / "services"
FIXTURE_CSV = SERVICES_ROOT / "budget-ingestion-service" / "tests" / "fixtures" / "household_sample.csv"
SNAPSHOT_DIR = Path(__file__).parent / "snapshots"
SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

# Categories we consider essential (True) vs flexible (False) for snapshot answers.
ESSENTIAL_CATEGORY_MAP = {
    "Rent": True,
    "Groceries": True,
    "Utilities": True,
    "Student Loan": True,
    "Transportation": True,
}
DEFAULT_ESSENTIAL_FLAG = False


@pytest.mark.integration
def test_deterministic_pipeline_matches_snapshots() -> None:
    draft_model = parse_csv_to_draft_model(FIXTURE_CSV.read_bytes())
    partial_model = draft_to_initial_unified(draft_model)

    questions = generate_clarification_questions(partial_model)
    ui_schema = build_initial_ui_schema(partial_model)

    clarification_payload = {
        "needs_clarification": bool(questions),
        "question_count": len(questions),
        "questions": [_serialize_question(question) for question in questions],
        "ui_schema": ui_schema,
        "partial_model": _serialize_model(partial_model),
    }
    _assert_matches_snapshot("clarify", clarification_payload)

    answers = _build_answers(partial_model, questions)
    updated_model = apply_answers_to_model(partial_model, answers)
    summary = compute_summary_for_model(updated_model)
    category_shares = compute_category_shares(updated_model)
    suggestions = generate_suggestions(updated_model, summary)

    optimization_payload = {
        "summary": dataclasses.asdict(summary),
        "category_shares": category_shares,
        "suggestions": [_serialize_suggestion(suggestion) for suggestion in suggestions],
    }
    _assert_matches_snapshot("summary", optimization_payload)

    assert suggestions, "Expected deterministic suggestions for flexible spending"
    assert summary.total_income > summary.total_expenses
    assert pytest.approx(summary.total_income - summary.total_expenses) == summary.surplus


def _serialize_model(model: UnifiedBudgetModel) -> dict[str, object]:
    return dataclasses.asdict(model)


def _serialize_question(question: QuestionSpec) -> dict[str, object]:
    return {
        "question_id": question.question_id,
        "prompt": question.prompt,
        "components": question.components,
    }


def _serialize_suggestion(suggestion: Suggestion) -> dict[str, object]:
    return dataclasses.asdict(suggestion)


def _build_answers(model: UnifiedBudgetModel, questions: Sequence[QuestionSpec]) -> dict[str, object]:
    expense_lookup = {expense.id: expense for expense in model.expenses}
    answers: dict[str, object] = {}

    for question in questions:
        for component in question.components:
            field_id = component.get("field_id")
            if not isinstance(field_id, str):
                continue

            if field_id.startswith(ESSENTIAL_PREFIX):
                expense_id = field_id[len(ESSENTIAL_PREFIX) :]
                answers[field_id] = _resolve_essential_value(expense_lookup, expense_id)
                continue

            if field_id == "optimization_focus":
                answers[field_id] = "savings"
                continue

            if field_id == "primary_income_type":
                answers[field_id] = "net"
                continue

            if field_id == "primary_income_stability":
                answers[field_id] = "stable"
                continue

    return answers


def _resolve_essential_value(expenses: dict[str, Expense], expense_id: str) -> bool:
    expense = expenses.get(expense_id)
    if not expense:
        return DEFAULT_ESSENTIAL_FLAG
    return ESSENTIAL_CATEGORY_MAP.get(expense.category, DEFAULT_ESSENTIAL_FLAG)


def _assert_matches_snapshot(name: str, payload: dict[str, object]) -> None:
    normalized = _normalize_for_json(payload)
    snapshot_path = SNAPSHOT_DIR / f"{name}_snapshot.json"
    update_flag = os.getenv("UPDATE_SNAPSHOTS") == "1"

    if update_flag:
        snapshot_path.write_text(json.dumps(normalized, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        expected = normalized
    else:
        if not snapshot_path.exists():
            raise AssertionError(f"Snapshot {snapshot_path.name} is missing. Run with UPDATE_SNAPSHOTS=1 to create it.")
        expected = json.loads(snapshot_path.read_text(encoding="utf-8"))

    assert normalized == expected


def _normalize_for_json(value):  # type: ignore[override]
    if dataclasses.is_dataclass(value):
        return _normalize_for_json(dataclasses.asdict(value))

    if isinstance(value, dict):
        return {key: _normalize_for_json(value[key]) for key in sorted(value)}

    if isinstance(value, list):
        return [_normalize_for_json(item) for item in value]

    if isinstance(value, float):
        return round(value, 4)

    if isinstance(value, (str, int, bool)) or value is None:
        return value

    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        return [_normalize_for_json(item) for item in value]

    raise TypeError(f"Unsupported type for snapshot serialization: {type(value)!r}")
