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

__all__ = [
    "draft_to_initial_unified",
    "apply_answers_to_model",
    "parse_debt_field_id",
    "build_answer_binding_context",
    "interpret_field_binding",
    "map_debt_binding_to_attribute",
    "is_supported_income_binding",
]

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
DEBT_ATTRIBUTE_PATHS = {
    "balance": ("balance",),
    "interest_rate": ("interest_rate",),
    "min_payment": ("min_payment",),
    "priority": ("priority",),
    "approximate": ("approximate",),
    "rate_change_date": ("rate_changes", "0", "date"),
    "rate_change_new_rate": ("rate_changes", "0", "new_rate"),
}
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


@dataclass(frozen=True)
class FieldBinding:
    kind: str
    target_id: str | None
    path: Tuple[str, ...]
    raw: str


@dataclass
class AnswerBindingContext:
    expenses: Dict[str, Expense]
    expense_aliases: Dict[str, Expense]
    debts: Dict[str, Debt]
    debt_aliases: Dict[str, Debt]
    incomes: Dict[str, Income]
    income_aliases: Dict[str, Income]
    primary_income_id: str | None

    @classmethod
    def from_model(cls, model: UnifiedBudgetModel) -> "AnswerBindingContext":
        expenses = {expense.id: expense for expense in model.expenses if getattr(expense, "id", None)}
        debts = {debt.id: debt for debt in model.debts if getattr(debt, "id", None)}
        incomes = {income.id: income for income in model.income if getattr(income, "id", None)}
        return cls(
            expenses=expenses,
            expense_aliases=_build_alias_lookup(expenses.values(), lambda entry: entry.id, lambda entry: entry.category),
            debts=debts,
            debt_aliases=_build_alias_lookup(debts.values(), lambda entry: entry.id, lambda entry: entry.name),
            incomes=incomes,
            income_aliases=_build_alias_lookup(incomes.values(), lambda entry: entry.id, lambda entry: entry.name),
            primary_income_id=_select_primary_income_id(incomes.values()),
        )

    def resolve_expense(self, identifier: str | None) -> Expense | None:
        if not identifier:
            return None
        if identifier in self.expenses:
            return self.expenses[identifier]
        return self.expense_aliases.get(_slugify(identifier))

    def resolve_income(self, identifier: str | None) -> Income | None:
        if not identifier and self.primary_income_id:
            return self.incomes.get(self.primary_income_id)
        if identifier in self.incomes:
            return self.incomes[identifier]
        slug = _slugify(identifier or "")
        if slug in {"primary", "primary_income"} and self.primary_income_id:
            return self.incomes.get(self.primary_income_id)
        return self.income_aliases.get(slug)

    def resolve_debt(self, identifier: str | None) -> Tuple[Debt | None, Expense | None, str | None]:
        if not identifier:
            return None, None, None
        if identifier in self.debts:
            return self.debts[identifier], None, identifier
        slug = _slugify(identifier)
        debt_entry = self.debt_aliases.get(slug)
        if debt_entry:
            return debt_entry, None, debt_entry.id
        expense_entry = self.expense_aliases.get(slug)
        if expense_entry:
            normalized_id = slug or expense_entry.id
            return None, expense_entry, normalized_id
        return None, None, slug or identifier


def _build_alias_lookup(entries: Iterable[Any], *value_getters) -> Dict[str, Any]:
    lookup: Dict[str, Any] = {}
    for entry in entries:
        for getter in value_getters:
            value = getter(entry) if callable(getter) else getattr(entry, getter, None)
            if not value:
                continue
            slug = _slugify(str(value))
            if slug and slug not in lookup:
                lookup[slug] = entry
    return lookup


def _select_primary_income_id(incomes: Iterable[Income]) -> str | None:
    best_id: str | None = None
    best_amount = -1.0
    for income in incomes:
        try:
            amount = float(income.monthly_amount)
        except (TypeError, ValueError):
            amount = 0.0
        if amount > best_amount and getattr(income, "id", None):
            best_amount = amount
            best_id = income.id
    return best_id


def _parse_binding_path(field_id: str) -> Tuple[str, str | None, Tuple[str, ...]] | None:
    parts = [segment.strip() for segment in field_id.split(".") if segment.strip()]
    if len(parts) < 2:
        return None
    collection = parts[0]
    if collection == "preferences":
        if len(parts) < 2:
            return None
        return collection, None, tuple(parts[1:])
    if len(parts) < 3:
        return None
    target_id = parts[1]
    path = tuple(parts[2:])
    if not target_id or not path:
        return None
    if collection in {"income", "expenses", "debts"}:
        return collection, target_id, path
    return None


def _binding_from_collection(collection: str, target_id: str | None, path: Tuple[str, ...], raw: str) -> FieldBinding | None:
    if collection == "preferences":
        return FieldBinding(kind="preferences", target_id=None, path=path, raw=raw)
    if collection == "expenses" and path == ("essential",):
        return FieldBinding(kind="expense_essential", target_id=target_id, path=(), raw=raw)
    if collection == "income":
        return FieldBinding(kind="income", target_id=target_id, path=path, raw=raw)
    if collection == "debts":
        return FieldBinding(kind="debt", target_id=target_id, path=path, raw=raw)
    return None


def _interpret_binding(field_id: str) -> FieldBinding | None:
    if field_id in LEGACY_FIELD_BINDINGS:
        collection, target_id, path = LEGACY_FIELD_BINDINGS[field_id]
        return _binding_from_collection(collection, target_id, path, field_id)

    if field_id.startswith(ESSENTIAL_PREFIX):
        expense_id = field_id[len(ESSENTIAL_PREFIX) :]
        return FieldBinding(kind="expense_essential", target_id=expense_id, path=(), raw=field_id)

    legacy_debt = parse_debt_field_id(field_id)
    if legacy_debt:
        debt_id, attribute = legacy_debt
        path = DEBT_ATTRIBUTE_PATHS.get(attribute)
        if path:
            return FieldBinding(kind="debt", target_id=debt_id, path=path, raw=field_id)

    binding = _parse_binding_path(field_id)
    if not binding:
        return None
    collection, target_id, path = binding
    return _binding_from_collection(collection, target_id, path, field_id)


def build_answer_binding_context(model: UnifiedBudgetModel) -> AnswerBindingContext:
    return AnswerBindingContext.from_model(model)


def interpret_field_binding(field_id: str) -> FieldBinding | None:
    return _interpret_binding(field_id)


def is_supported_income_binding(path: Tuple[str, ...]) -> bool:
    if not path:
        return False
    head = path[0]
    if head in {"stability", "type"}:
        return True
    if head == "metadata" and len(path) >= 2:
        return True
    return False


def map_debt_binding_to_attribute(path: Tuple[str, ...]) -> str | None:
    if not path:
        return None
    if len(path) == 1 and path[0] in {"balance", "interest_rate", "min_payment", "priority", "approximate"}:
        return path[0]
    if path[0] == "rate_changes" and len(path) >= 3:
        if path[2] == "date":
            return "rate_change_date"
        if path[2] == "new_rate":
            return "rate_change_new_rate"
    return None


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

    context = build_answer_binding_context(model)
    expense_lookup = context.expenses
    debt_lookup: Dict[str, Debt] = dict(context.debts)
    pending_rate_changes: Dict[str, Dict[str, Any]] = {}

    for field_id, raw_value in answers.items():
        if not isinstance(field_id, str):
            continue
        normalized_field_id = field_id.strip()
        if not normalized_field_id:
            continue

        binding = interpret_field_binding(normalized_field_id)
        if binding is None:
            continue

        if binding.kind == "expense_essential":
            expense = context.resolve_expense(binding.target_id)
            if expense:
                _apply_essential_flag(expense_lookup, expense.id, raw_value)
            continue

        if binding.kind == "preferences":
            _apply_preference_field(model.preferences, binding.path, raw_value)
            continue

        if binding.kind == "income":
            income = context.resolve_income(binding.target_id)
            if income and is_supported_income_binding(binding.path):
                _apply_income_binding(income, binding.path, raw_value)
            continue

        if binding.kind == "debt":
            debt_entry, expense_entry, normalized_id = context.resolve_debt(binding.target_id)
            if not normalized_id:
                continue
            debt = _ensure_debt_entry(model, debt_lookup, normalized_id, expense_entry)
            attribute = map_debt_binding_to_attribute(binding.path)
            if attribute:
                _apply_debt_field(debt, attribute, raw_value, pending_rate_changes)
            continue

    _finalize_rate_changes(debt_lookup, pending_rate_changes)
    return model


def _apply_essential_flag(expense_lookup: Dict[str, Expense], expense_id: str, raw_value: Any) -> None:
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


def _apply_preference_field(preferences: Preferences, path: Tuple[str, ...], raw_value: Any) -> None:
    if not path:
        return
    key = path[0]
    if key == "optimization_focus":
        _apply_optimization_focus(preferences, raw_value)
        return
    if key == "protect_essentials":
        bool_value = _coerce_to_bool(raw_value)
        if bool_value is not None:
            preferences.protect_essentials = bool_value
        return
    if key == "max_desired_change_per_category":
        numeric = _coerce_to_number(raw_value)
        if numeric is not None:
            preferences.max_desired_change_per_category = numeric
        return


def _apply_primary_income_type(primary_income: Income | None, raw_value: Any) -> None:
    if primary_income is None:
        return

    normalized = _normalize_string(raw_value)
    if normalized not in PRIMARY_INCOME_TYPE_FLAGS:
        return

    metadata = _ensure_metadata_dict(primary_income)
    metadata[PRIMARY_INCOME_FLAG_METADATA_KEY] = normalized


def _apply_primary_income_stability(primary_income: Income | None, raw_value: Any) -> None:
    if primary_income is None:
        return

    normalized = _normalize_string(raw_value)
    if normalized in PRIMARY_INCOME_STABILITY_VALUES:
        primary_income.stability = normalized  # type: ignore[assignment]


def _apply_income_binding(income: Income, path: Tuple[str, ...], raw_value: Any) -> None:
    if not path:
        return
    head = path[0]
    if head == "metadata" and len(path) >= 2:
        if path[1] == PRIMARY_INCOME_FLAG_METADATA_KEY:
            _apply_primary_income_type(income, raw_value)
        return
    if head == "stability":
        _apply_primary_income_stability(income, raw_value)
        return
    if head == "type":
        normalized = _normalize_string(raw_value)
        if normalized in {"earned", "passive", "transfer"}:
            income.type = normalized  # type: ignore[assignment]


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
    source_expense: Expense | None = None,
) -> Debt:
    debt = debt_lookup.get(debt_id)
    if debt:
        return debt

    inferred_name = None
    inferred_payment = 0.0
    if source_expense is not None:
        inferred_name = source_expense.category or source_expense.id
        inferred_payment = abs(getattr(source_expense, "monthly_amount", 0.0) or 0.0)

    debt = Debt(
        id=debt_id,
        name=inferred_name or _humanize_debt_name(debt_id),
        balance=0.0,
        interest_rate=0.0,
        min_payment=inferred_payment,
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


def _slugify(value: str) -> str:
    normalized = value.strip().lower()
    if not normalized:
        return ""
    slug = SLUG_PATTERN.sub("_", normalized)
    return slug.strip("_")


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

