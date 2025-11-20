from __future__ import annotations

"""
Deterministic normalization utilities that convert a draft budget into the
baseline UnifiedBudgetModel the clarification service can reason about before
invoking any AI-driven refinement.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Set, Tuple
import re
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
    Debt,
    Expense,
    Income,
    Preferences,
    RateChange,
    Summary,
    UnifiedBudgetModel,
)

__all__ = ["draft_to_initial_unified", "apply_answers_to_model", "parse_debt_field_id"]

ESSENTIAL_PREFIX = "essential_"
VALID_OPTIMIZATION_FOCUS = {"debt", "savings", "balanced"}
PRIMARY_INCOME_TYPE_FLAGS = {"net", "gross"}
PRIMARY_INCOME_STABILITY_VALUES = {"stable", "variable", "seasonal"}
PRIMARY_INCOME_FLAG_METADATA_KEY = "net_or_gross"
TRUE_STRINGS = {"true", "1", "yes", "y", "essential", "needed"}
FALSE_STRINGS = {"false", "0", "no", "n", "nonessential", "flexible"}
LEGACY_SIMPLE_FIELD_IDS = {
    "optimization_focus",
    "primary_income_type",
    "primary_income_stability",
}
DEBT_FIELD_SUFFIXES: Tuple[Tuple[str, str], ...] = (
    ("_rate_change_new_rate", "rate_change_new_rate"),
    ("_rate_change_date", "rate_change_date"),
    ("_interest_rate", "interest_rate"),
    ("_min_payment", "min_payment"),
    ("_balance", "balance"),
    ("_priority", "priority"),
    ("_approximate", "approximate"),
)
VALID_DEBT_PRIORITIES = {"high", "medium", "low"}
PASSIVE_INCOME_KEYWORDS = {"dividend", "interest", "rental", "royalty", "yield"}
TRANSFER_INCOME_KEYWORDS = {"transfer", "gift", "refund", "reimbursement", "stipend"}
VARIABLE_INCOME_KEYWORDS = {"freelance", "contract", "gig", "bonus", "commission", "tips"}
SEASONAL_INCOME_KEYWORDS = {"seasonal", "holiday", "tax refund"}
ESSENTIAL_EXPENSE_KEYWORDS = {
    "rent",
    "mortgage",
    "housing",
    "utilities",
    "insurance",
    "childcare",
    "health",
    "grocery",
    "groceries",
    "transportation",
    "car payment",
    "auto",
}
FLEXIBLE_EXPENSE_KEYWORDS = {
    "dining",
    "restaurant",
    "subscription",
    "streaming",
    "travel",
    "vacation",
    "shopping",
    "entertainment",
    "hobby",
}
DEBT_KEYWORDS = {
    "loan",
    "credit",
    "mortgage",
    "heloc",
    "card",
    "auto",
    "car payment",
    "student",
    "line of credit",
}
PREFERENCE_FIELD_ALIASES = {
    "protect_essentials": "protect_essentials",
    "max_desired_change_per_category": "max_desired_change_per_category",
    "optimization_focus": "optimization_focus",
}
SLUG_PATTERN = re.compile(r"[^a-z0-9]+")
LEGACY_FIELD_BINDINGS = {
    "optimization_focus": ("preferences", None, ("optimization_focus",)),
    "primary_income_type": ("income", "primary", ("metadata", PRIMARY_INCOME_FLAG_METADATA_KEY)),
    "primary_income_stability": ("income", "primary", ("stability",)),
}


def draft_to_initial_unified(draft: DraftBudgetModel) -> UnifiedBudgetModel:
    """
    Convert a DraftBudgetModel into a deterministic first-pass UnifiedBudgetModel.

    Args:
        draft: Ingested structure where positive line amounts represent income and negatives expenses.
    Returns:
        UnifiedBudgetModel with stub incomes, expenses, empty debts, default preferences, and a computed summary.
    Assumptions:
        Uses only sign-based rules (no AI); debt detection, essential flags, and rich metadata are left unset for later stages.
    """

    incomes: List[Income] = []
    expenses: List[Expense] = []

    income_index = 0
    expense_index = 0

    for line in draft.lines:
        if line.amount > 0:
            income_index += 1
            incomes.append(_raw_line_to_income(line, income_index))
            continue

        if line.amount < 0:
            expense_index += 1
            expenses.append(_raw_line_to_expense(line, expense_index))

    summary = _build_summary(incomes, expenses)
    detected_debts = _detect_debt_candidates(draft)

    unified = UnifiedBudgetModel(
        income=incomes,
        expenses=expenses,
        debts=detected_debts,
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
        type=_infer_income_type(line),
        stability=_infer_income_stability(line),
    )


def _raw_line_to_expense(line: RawBudgetLine, ordinal: int) -> Expense:
    """
    Map a RawBudgetLine with a negative amount into a deterministic Expense stub.
    """
    return Expense(
        id=_deterministic_id("expense", line, ordinal),
        category=_resolve_label(line, fallback_prefix="Expense"),
        monthly_amount=abs(line.amount),
        essential=_infer_expense_essentiality(line),
        notes=line.description,
    )


def _infer_income_type(line: RawBudgetLine) -> str:
    label = _normalize_text_for_matching(line.category_label or line.description or "")
    metadata_blob = _normalize_text_for_matching(" ".join(str(value) for value in (line.metadata or {}).values()))
    if _contains_keyword(label, PASSIVE_INCOME_KEYWORDS) or _contains_keyword(metadata_blob, PASSIVE_INCOME_KEYWORDS):
        return "passive"
    if _contains_keyword(label, TRANSFER_INCOME_KEYWORDS) or _contains_keyword(metadata_blob, TRANSFER_INCOME_KEYWORDS):
        return "transfer"
    return "earned"


def _infer_income_stability(line: RawBudgetLine) -> str:
    label = _normalize_text_for_matching(line.category_label or line.description or "")
    metadata_blob = _normalize_text_for_matching(" ".join(str(value) for value in (line.metadata or {}).values()))
    if _contains_keyword(label, SEASONAL_INCOME_KEYWORDS) or _contains_keyword(metadata_blob, SEASONAL_INCOME_KEYWORDS):
        return "seasonal"
    if _contains_keyword(label, VARIABLE_INCOME_KEYWORDS) or _contains_keyword(metadata_blob, VARIABLE_INCOME_KEYWORDS):
        return "variable"
    return "stable"


def _infer_expense_essentiality(line: RawBudgetLine) -> bool | None:
    label = _normalize_text_for_matching(line.category_label or line.description or "")
    metadata_blob = _normalize_text_for_matching(" ".join(str(value) for value in (line.metadata or {}).values()))
    if _contains_keyword(label, ESSENTIAL_EXPENSE_KEYWORDS) or _contains_keyword(metadata_blob, ESSENTIAL_EXPENSE_KEYWORDS):
        return True
    if _contains_keyword(label, FLEXIBLE_EXPENSE_KEYWORDS) or _contains_keyword(metadata_blob, FLEXIBLE_EXPENSE_KEYWORDS):
        return False
    return None


def _detect_debt_candidates(draft: DraftBudgetModel) -> List[Debt]:
    detected: Dict[str, Debt] = {}
    for ordinal, line in enumerate(draft.lines, start=1):
        if line.amount >= 0:
            continue
        if not _looks_like_debt(line):
            continue
        debt_id = _deduce_debt_id(line, ordinal)
        if debt_id in detected:
            continue
        detected[debt_id] = Debt(
            id=debt_id,
            name=_derive_debt_name(line, debt_id),
            balance=0.0,
            interest_rate=0.0,
            min_payment=abs(line.amount),
            priority="medium",
            approximate=True,
            rate_changes=None,
        )
    return list(detected.values())


def _looks_like_debt(line: RawBudgetLine) -> bool:
    label = _normalize_text_for_matching(line.category_label or "")
    description = _normalize_text_for_matching(line.description or "")
    metadata_blob = _normalize_text_for_matching(" ".join(str(value) for value in (line.metadata or {}).values()))
    return any(
        _contains_keyword(blob, DEBT_KEYWORDS)
        for blob in (label, description, metadata_blob)
    )


def _deduce_debt_id(line: RawBudgetLine, ordinal: int) -> str:
    if line.metadata and "id" in line.metadata:
        candidate = str(line.metadata["id"])
    elif line.category_label:
        candidate = line.category_label
    elif line.description:
        candidate = line.description
    else:
        candidate = f"debt_line_{ordinal}"
    slug = _slugify(candidate)
    return slug or f"debt_line_{ordinal}"


def _derive_debt_name(line: RawBudgetLine, fallback_id: str) -> str:
    label = (line.category_label or line.description or "").strip()
    if label:
        return label
    return _humanize_debt_name(fallback_id)


def _contains_keyword(blob: str, keywords: Set[str]) -> bool:
    if not blob:
        return False
    return any(keyword in blob for keyword in keywords)


def _normalize_text_for_matching(text: str) -> str:
    return text.strip().lower()


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
    Apply structured clarification answers to the unified model in place.

    Args:
        model: UnifiedBudgetModel that will be mutated with clarified essentials, preferences, and debt metadata.
        answers: Mapping of field_id strings to user-provided values collected via clarification questions.
    Returns:
        The same UnifiedBudgetModel instance after supported fields are updated.
    Assumptions:
        Recognizes only known field_id prefixes/patterns: expense essentials, optimization focus, primary income clarifications,
        and debt suffixes such as `_balance`, `_interest_rate`, `_min_payment`, `_priority`, `_approximate`,
        `_rate_change_date`, and `_rate_change_new_rate`. Skips unknown keys and is a no-op when answers is empty.
    """

    if not answers:
        return model

    expense_lookup: Dict[str, Expense] = {expense.id: expense for expense in model.expenses if getattr(expense, "id", None)}
    primary_income = model.income[0] if model.income else None
    debt_lookup: Dict[str, Debt] = {debt.id: debt for debt in model.debts if getattr(debt, "id", None)}
    pending_rate_changes: Dict[str, Dict[str, Any]] = {}

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

        debt_target = parse_debt_field_id(field_id)
        if debt_target:
            debt_id, attribute = debt_target
            debt = _ensure_debt_entry(model, debt_lookup, debt_id)
            _apply_debt_field(debt, attribute, raw_value, pending_rate_changes)
            continue

        # TODO(answer-mapping): Support additional field_ids as the question catalog grows.
        # Tracked in docs/AI_integration_readiness.md#ai-answer-application.

    _finalize_rate_changes(debt_lookup, pending_rate_changes)
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


def parse_debt_field_id(field_id: str) -> Tuple[str, str] | None:
    """
    Attempt to split a field_id into (debt_id, attribute) when it matches a known
    debt mapping suffix such as `_balance` or `_interest_rate`.
    """

    for suffix, attribute in DEBT_FIELD_SUFFIXES:
        if not field_id.endswith(suffix):
            continue
        debt_id = field_id[: -len(suffix)]
        if debt_id:
            return debt_id, attribute
    return None


def _ensure_debt_entry(
    model: UnifiedBudgetModel,
    debt_lookup: Dict[str, Debt],
    debt_id: str,
) -> Debt:
    debt = debt_lookup.get(debt_id)
    if debt:
        return debt

    debt = Debt(
        id=debt_id,
        name=_humanize_debt_name(debt_id),
        balance=0.0,
        interest_rate=0.0,
        min_payment=0.0,
        priority="medium",
        approximate=True,
        rate_changes=None,
    )
    model.debts.append(debt)
    debt_lookup[debt_id] = debt
    return debt


def _humanize_debt_name(debt_id: str) -> str:
    cleaned = debt_id.replace("_", " ").strip()
    if not cleaned:
        return "Debt"
    return cleaned.title()


def _apply_debt_field(
    debt: Debt,
    attribute: str,
    raw_value: Any,
    pending_rate_changes: Dict[str, Dict[str, Any]],
) -> None:
    if attribute == "balance":
        numeric = _coerce_to_number(raw_value)
        if numeric is not None:
            debt.balance = numeric
        return

    if attribute == "interest_rate":
        numeric = _coerce_to_number(raw_value)
        if numeric is not None:
            debt.interest_rate = numeric
        return

    if attribute == "min_payment":
        numeric = _coerce_to_number(raw_value)
        if numeric is not None:
            debt.min_payment = numeric
        return

    if attribute == "priority":
        normalized = _normalize_string(raw_value)
        if normalized in VALID_DEBT_PRIORITIES:
            debt.priority = normalized  # type: ignore[assignment]
        return

    if attribute == "approximate":
        bool_value = _coerce_to_bool(raw_value)
        if bool_value is not None:
            debt.approximate = bool_value
        return

    if attribute == "rate_change_date":
        date_value = _coerce_to_date_string(raw_value)
        if date_value:
            pending_rate_changes.setdefault(debt.id, {})["date"] = date_value
        return

    if attribute == "rate_change_new_rate":
        numeric = _coerce_to_number(raw_value)
        if numeric is not None:
            pending_rate_changes.setdefault(debt.id, {})["new_rate"] = numeric
        return


def _finalize_rate_changes(debt_lookup: Dict[str, Debt], pending_rate_changes: Dict[str, Dict[str, Any]]) -> None:
    for debt_id, fragment in pending_rate_changes.items():
        if not fragment:
            continue
        date = fragment.get("date")
        new_rate = fragment.get("new_rate")
        if not date or new_rate is None:
            continue

        debt = debt_lookup.get(debt_id)
        if debt is None:
            continue

        rate_change = RateChange(date=date, new_rate=new_rate)
        debt.rate_changes = [rate_change]


def _coerce_to_number(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    normalized = _normalize_string(value)
    if normalized is None:
        return None
    try:
        return float(normalized)
    except ValueError:
        return None


def _coerce_to_date_string(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        candidate = value.strip()
        return candidate or None
    candidate = str(value).strip()
    return candidate or None

