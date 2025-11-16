from __future__ import annotations

"""
Deterministic normalization utilities that convert a draft budget into the
baseline UnifiedBudgetModel the clarification service can reason about before
invoking any AI-driven refinement.
"""

from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence
import sys

# Ensure we can import shared dataclasses from sibling services without having
# to package everything just yet. Once the repo is structured as an installable
# workspace, these sys.path manipulations can be revisited.
SERVICE_SRC = Path(__file__).resolve().parent
SERVICES_ROOT = SERVICE_SRC.parents[1]
OTHER_SERVICE_PATHS: Sequence[Path] = (
    SERVICES_ROOT / "budget-ingestion-service" / "src",
    SERVICES_ROOT / "optimization-service" / "src",
)

for candidate in OTHER_SERVICE_PATHS:
    candidate_str = str(candidate)
    if candidate.exists() and candidate_str not in sys.path:
        sys.path.append(candidate_str)

from models.raw_budget import DraftBudgetModel, RawBudgetLine  # noqa: E402
from budget_model import (  # noqa: E402
    Expense,
    Income,
    Preferences,
    Summary,
    UnifiedBudgetModel,
)

__all__ = ["draft_to_initial_unified", "apply_answers_to_model"]

ESSENTIAL_PREFIX = "essential_"
VALID_OPTIMIZATION_FOCUS = {"debt", "savings", "balanced"}
PRIMARY_INCOME_TYPE_FLAGS = {"net", "gross"}
PRIMARY_INCOME_STABILITY_VALUES = {"stable", "variable", "seasonal"}
PRIMARY_INCOME_FLAG_METADATA_KEY = "net_or_gross"
TRUE_STRINGS = {"true", "1", "yes", "y", "essential", "needed"}
FALSE_STRINGS = {"false", "0", "no", "n", "nonessential", "flexible"}


def draft_to_initial_unified(draft: DraftBudgetModel) -> UnifiedBudgetModel:
    """
    Convert a DraftBudgetModel into a first-pass UnifiedBudgetModel that follows
    deterministic rules only. This provides a stable structure for downstream
    AI-powered clarification stages to refine.
    """

    incomes: List[Income] = []
    expenses: List[Expense] = []

    income_index = 0
    expense_index = 0

    for line in draft.lines:
        if line.amount > 0:
            income_index += 1
            incomes.append(_raw_line_to_income(line, income_index))
            # TODO(ai-income-classification): Detect passive vs transfer income.
            continue

        if line.amount < 0:
            expense_index += 1
            expenses.append(_raw_line_to_expense(line, expense_index))
            # TODO(ai-essentiality): Predict essential vs discretionary spending.
            # TODO(ai-debt-detection): Identify loan/credit payments that should become debts.

    summary = _build_summary(incomes, expenses)

    unified = UnifiedBudgetModel(
        income=incomes,
        expenses=expenses,
        debts=[],  # TODO(ai-debt-detection): Populate from loan-like draft lines or metadata.
        preferences=_default_preferences(),
        summary=summary,
    )

    return unified


def _raw_line_to_income(line: RawBudgetLine, ordinal: int) -> Income:
    """
    Map a RawBudgetLine with a positive amount into a deterministic Income stub.
    """
    return Income(
        id=_deterministic_id("income", line, ordinal),
        name=_resolve_label(line, fallback_prefix="Income"),
        monthly_amount=line.amount,
        type="earned",  # TODO(ai-income-classification): Revisit via classifier.
        stability="stable",  # TODO(ai-income-stability): Infer from historical cadence.
    )


def _raw_line_to_expense(line: RawBudgetLine, ordinal: int) -> Expense:
    """
    Map a RawBudgetLine with a negative amount into a deterministic Expense stub.
    """
    return Expense(
        id=_deterministic_id("expense", line, ordinal),
        category=_resolve_label(line, fallback_prefix="Expense"),
        monthly_amount=abs(line.amount),
        essential=None,  # type: ignore[arg-type]  # TODO(ai-essentiality): determine boolean.
        notes=line.description,
    )


def _build_summary(incomes: Iterable[Income], expenses: Iterable[Expense]) -> Summary:
    total_income = sum(income.monthly_amount for income in incomes)
    total_expenses = sum(expense.monthly_amount for expense in expenses)
    return Summary(
        total_income=total_income,
        total_expenses=total_expenses,
        surplus=total_income - total_expenses,
    )


def _default_preferences() -> Preferences:
    """
    Create a neutral Preferences instance to indicate no specific optimization
    priorities have been collected yet.
    """

    return Preferences(
        optimization_focus="balanced",
        protect_essentials=True,
        max_desired_change_per_category=0.0,
    )


def _resolve_label(line: RawBudgetLine, fallback_prefix: str) -> str:
    label = (line.category_label or "").strip()
    if label:
        return label

    description = (line.description or "").strip()
    if description:
        return description

    return f"{fallback_prefix} line {line.source_row_index}"


def _deterministic_id(kind: str, line: RawBudgetLine, ordinal: int) -> str:
    """
    Produce a reproducible identifier that ties back to the original row number.
    """

    metadata_id = str(line.metadata.get("id", "")).strip() if line.metadata else ""
    if metadata_id:
        return f"{kind}-{metadata_id}"
    return f"{kind}-draft-{line.source_row_index}-{ordinal}"


def apply_answers_to_model(model: UnifiedBudgetModel, answers: Dict[str, Any]) -> UnifiedBudgetModel:
    """
    Apply structured clarification answers back onto the UnifiedBudgetModel.

    The function mutates the provided model in-place and also returns it so callers
    can use whichever style they prefer.
    """

    if not answers:
        return model

    expense_lookup: Dict[str, Expense] = {expense.id: expense for expense in model.expenses if expense.id}
    primary_income = model.income[0] if model.income else None

    for field_id, raw_value in answers.items():
        if not isinstance(field_id, str):
            continue

        if field_id.startswith(ESSENTIAL_PREFIX):
            _apply_essential_flag(expense_lookup, field_id, raw_value)
            continue

        if field_id == "optimization_focus":
            _apply_optimization_focus(model.preferences, raw_value)
            continue

        if field_id == "primary_income_type":
            _apply_primary_income_type(primary_income, raw_value)
            continue

        if field_id == "primary_income_stability":
            _apply_primary_income_stability(primary_income, raw_value)
            continue

        # TODO(answer-mapping): Support additional field_ids as the question catalog grows.

    return model


def _apply_essential_flag(expense_lookup: Dict[str, Expense], field_id: str, raw_value: Any) -> None:
    expense_id = field_id[len(ESSENTIAL_PREFIX) :]
    if not expense_id:
        return

    expense = expense_lookup.get(expense_id)
    if expense is None:
        return

    essential_value = _coerce_to_bool(raw_value)
    if essential_value is None:
        return

    expense.essential = essential_value


def _apply_optimization_focus(preferences: Preferences, raw_value: Any) -> None:
    normalized = _normalize_string(raw_value)
    if normalized in VALID_OPTIMIZATION_FOCUS:
        preferences.optimization_focus = normalized  # type: ignore[assignment]


def _apply_primary_income_type(primary_income: Income | None, raw_value: Any) -> None:
    if primary_income is None:
        return

    normalized = _normalize_string(raw_value)
    if normalized not in PRIMARY_INCOME_TYPE_FLAGS:
        return

    # Primary income entries default to "earned" today. We retain that category but
    # persist the user's clarification for downstream logic once the schema grows.
    primary_income.type = "earned"
    metadata = _ensure_metadata_dict(primary_income)
    metadata[PRIMARY_INCOME_FLAG_METADATA_KEY] = normalized


def _apply_primary_income_stability(primary_income: Income | None, raw_value: Any) -> None:
    if primary_income is None:
        return

    normalized = _normalize_string(raw_value)
    if normalized in PRIMARY_INCOME_STABILITY_VALUES:
        primary_income.stability = normalized  # type: ignore[assignment]


def _coerce_to_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value

    if isinstance(value, (int, float)):
        if value == 1:
            return True
        if value == 0:
            return False

    normalized = _normalize_string(value)
    if normalized in TRUE_STRINGS:
        return True
    if normalized in FALSE_STRINGS:
        return False

    return None


def _normalize_string(value: Any) -> str | None:
    if value is None:
        return None

    if isinstance(value, str):
        normalized = value.strip().lower()
        return normalized or None

    normalized = str(value).strip().lower()
    return normalized or None


def _ensure_metadata_dict(entry: Income) -> Dict[str, Any]:
    metadata = getattr(entry, "metadata", None)
    if metadata is None:
        metadata = {}
    elif not isinstance(metadata, dict):
        metadata = dict(metadata)
    setattr(entry, "metadata", metadata)
    return metadata

