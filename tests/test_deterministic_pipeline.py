"""End-to-end deterministic pipeline test for ingestion → clarification → optimization."""
from __future__ import annotations

import dataclasses
import importlib.util
import json
import os
import sys
import types
from pathlib import Path
from typing import Dict, Sequence

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SERVICES_ROOT = REPO_ROOT / "services"
INGESTION_SRC = SERVICES_ROOT / "budget-ingestion-service" / "src"
CLARIFICATION_SRC = SERVICES_ROOT / "clarification-service" / "src"
OPTIMIZATION_SRC = SERVICES_ROOT / "optimization-service" / "src"

for path in (CLARIFICATION_SRC, OPTIMIZATION_SRC):
    if str(path) not in sys.path:
        sys.path.append(str(path))


def _ensure_package(name: str, path: Path | None = None) -> None:
    if name not in sys.modules:
        pkg = types.ModuleType(name)
        if path is not None:
            pkg.__path__ = [str(path)]  # type: ignore[attr-defined]
        else:
            pkg.__path__ = []  # type: ignore[attr-defined]
        sys.modules[name] = pkg


def _load_service_module(root: Path, module_name: str, relative_path: str):
    full_path = root / relative_path
    spec = importlib.util.spec_from_file_location(module_name, full_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load module {module_name} from {full_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


_ensure_package("budget_ingestion", INGESTION_SRC)
_ensure_package("budget_ingestion.models", INGESTION_SRC / "models")
_ensure_package("budget_ingestion.parsers", INGESTION_SRC / "parsers")

_load_service_module(INGESTION_SRC, "budget_ingestion.models.raw_budget", "models/raw_budget.py")
csv_parser_module = _load_service_module(INGESTION_SRC, "budget_ingestion.parsers.csv_parser", "parsers/csv_parser.py")
parse_csv_to_draft_model = csv_parser_module.parse_csv_to_draft_model

_ensure_package("optimization_service", OPTIMIZATION_SRC)
budget_model_module = _load_service_module(OPTIMIZATION_SRC, "optimization_service.budget_model", "budget_model.py")
_load_service_module(OPTIMIZATION_SRC, "optimization_service.heuristics", "heuristics.py")
compute_summary_module = _load_service_module(
    OPTIMIZATION_SRC,
    "optimization_service.compute_summary",
    "compute_summary.py",
)
generate_suggestions_module = _load_service_module(
    OPTIMIZATION_SRC,
    "optimization_service.generate_suggestions",
    "generate_suggestions.py",
)

from normalization import (  # type: ignore  # noqa: E402
    ESSENTIAL_PREFIX,
    apply_answers_to_model,
    draft_to_initial_unified,
)
from question_generator import QuestionSpec, generate_clarification_questions  # type: ignore  # noqa: E402
from ui_schema_builder import build_initial_ui_schema  # type: ignore  # noqa: E402

compute_category_shares = compute_summary_module.compute_category_shares  # type: ignore[attr-defined]
compute_summary_for_model = compute_summary_module.compute_summary_for_model  # type: ignore[attr-defined]
Suggestion = generate_suggestions_module.Suggestion  # type: ignore[attr-defined]
generate_suggestions = generate_suggestions_module.generate_suggestions  # type: ignore[attr-defined]
Expense = budget_model_module.Expense  # type: ignore[attr-defined]
UnifiedBudgetModel = budget_model_module.UnifiedBudgetModel  # type: ignore[attr-defined]

FIXTURE_CSV = (
    SERVICES_ROOT
    / "budget-ingestion-service"
    / "tests"
    / "fixtures"
    / "household_sample.csv"
)
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


def _serialize_model(model: UnifiedBudgetModel) -> Dict[str, object]:
    return dataclasses.asdict(model)


def _serialize_question(question: QuestionSpec) -> Dict[str, object]:
    return {
        "question_id": question.question_id,
        "prompt": question.prompt,
        "components": question.components,
    }


def _serialize_suggestion(suggestion: Suggestion) -> Dict[str, object]:
    return dataclasses.asdict(suggestion)


def _build_answers(model: UnifiedBudgetModel, questions: Sequence[QuestionSpec]) -> Dict[str, object]:
    expense_lookup = {expense.id: expense for expense in model.expenses}
    answers: Dict[str, object] = {}

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


def _resolve_essential_value(expenses: Dict[str, Expense], expense_id: str) -> bool:
    expense = expenses.get(expense_id)
    if not expense:
        return DEFAULT_ESSENTIAL_FLAG
    return ESSENTIAL_CATEGORY_MAP.get(expense.category, DEFAULT_ESSENTIAL_FLAG)


def _assert_matches_snapshot(name: str, payload: Dict[str, object]) -> None:
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
