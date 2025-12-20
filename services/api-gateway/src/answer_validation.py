from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Tuple

ESSENTIAL_FIELD_PREFIX = "essential_"
VALID_OPTIMIZATION_FOCUS = {"debt", "savings", "balanced"}
PRIMARY_INCOME_STABILITY_VALUES = {"stable", "variable", "seasonal"}
PRIMARY_INCOME_TYPE_FLAGS = {"net", "gross"}
INCOME_TYPE_VALUES = {"earned", "passive", "transfer"}
VALID_DEBT_PRIORITIES = {"high", "medium", "low"}
PREFERENCE_FIELD_IDS = {
    "optimization_focus",
    "protect_essentials",
    "max_desired_change_per_category",
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
DEBT_ATTRIBUTE_PATHS = {
    "balance": ("balance",),
    "interest_rate": ("interest_rate",),
    "min_payment": ("min_payment",),
    "priority": ("priority",),
    "approximate": ("approximate",),
    "rate_change_date": ("rate_changes", "0", "date"),
    "rate_change_new_rate": ("rate_changes", "0", "new_rate"),
}
LEGACY_FIELD_BINDINGS = {
    "optimization_focus": ("preferences", None, ("optimization_focus",)),
    "primary_income_type": ("income", "primary", ("metadata", "net_or_gross")),
    "primary_income_stability": ("income", "primary", ("stability",)),
}


@dataclass(frozen=True)
class FieldBinding:
    kind: str
    target_id: str | None
    path: Tuple[str, ...]
    raw: str


@dataclass
class AnswerValidationContext:
    expenses: Dict[str, Dict[str, Any]]
    expense_aliases: Dict[str, Dict[str, Any]]
    debts: Dict[str, Dict[str, Any]]
    debt_aliases: Dict[str, Dict[str, Any]]
    incomes: Dict[str, Dict[str, Any]]
    income_aliases: Dict[str, Dict[str, Any]]
    primary_income_id: str | None

    @classmethod
    def from_partial(cls, partial: Dict[str, Any]) -> "AnswerValidationContext":
        expenses = _build_lookup(partial.get("expenses"))
        debts = _build_lookup(partial.get("debts"))
        incomes = _build_lookup(partial.get("income"))
        return cls(
            expenses=expenses,
            expense_aliases=_build_alias_lookup(expenses.values(), ("id",), ("category",)),
            debts=debts,
            debt_aliases=_build_alias_lookup(debts.values(), ("id",), ("name",)),
            incomes=incomes,
            income_aliases=_build_alias_lookup(incomes.values(), ("id",), ("name",)),
            primary_income_id=_select_primary_income_id(incomes.values()),
        )

    def resolve_expense(self, identifier: str | None) -> Dict[str, Any] | None:
        if not identifier:
            return None
        if identifier in self.expenses:
            return self.expenses[identifier]
        return self.expense_aliases.get(_slugify(identifier))

    def resolve_income(self, identifier: str | None) -> Dict[str, Any] | None:
        if not identifier and self.primary_income_id:
            return self.incomes.get(self.primary_income_id)
        if identifier in self.incomes:
            return self.incomes[identifier]
        slug = _slugify(identifier or "")
        if slug in {"primary", "primary_income"} and self.primary_income_id:
            return self.incomes.get(self.primary_income_id)
        return self.income_aliases.get(slug)

    def resolve_debt(self, identifier: str | None) -> Tuple[Dict[str, Any] | None, Dict[str, Any] | None, str | None]:
        if not identifier:
            return None, None, None
        if identifier in self.debts:
            return self.debts[identifier], None, identifier
        slug = _slugify(identifier)
        debt_entry = self.debt_aliases.get(slug)
        if debt_entry:
            return debt_entry, None, debt_entry["id"]
        expense_entry = self.expense_aliases.get(slug)
        if expense_entry:
            normalized = slug or expense_entry.get("id")
            return None, expense_entry, normalized
        return None, None, slug or identifier


def validate_answers(partial_model: Dict[str, Any], answers: Dict[str, Any]) -> List[Dict[str, str]]:
    if not answers:
        return []

    context = AnswerValidationContext.from_partial(partial_model or {})
    invalid: List[Dict[str, str]] = []

    for raw_field_id, raw_value in answers.items():
        if not isinstance(raw_field_id, str):
            invalid.append(
                {
                    "field_id": str(raw_field_id),
                    "reason": "not_a_string",
                    "detail": "Field ids must be non-empty strings.",
                }
            )
            continue

        field_id = raw_field_id.strip()
        if not field_id:
            invalid.append(
                {
                    "field_id": raw_field_id,
                    "reason": "empty_field_id",
                    "detail": "Field ids must be non-empty strings.",
                }
            )
            continue

        binding = _interpret_binding(field_id)
        if binding is None:
            invalid.append(
                {
                    "field_id": field_id,
                    "reason": "unsupported_field_id",
                    "detail": "No known mapping exists for this field_id.",
                }
            )
            continue

        target_error = _validate_binding_target(binding, context)
        if target_error:
            invalid.append(target_error)
            continue

        type_error = _validate_value_type(binding, raw_value)
        if type_error:
            invalid.append(type_error)
            continue

    return invalid


def _build_lookup(entries: Iterable[Dict[str, Any]] | None) -> Dict[str, Dict[str, Any]]:
    lookup: Dict[str, Dict[str, Any]] = {}
    if not entries:
        return lookup
    for entry in entries:
        entry_id = entry.get("id")
        if entry_id:
            lookup[str(entry_id)] = entry
    return lookup


def _build_alias_lookup(entries: Iterable[Dict[str, Any]], *fields: Tuple[str, ...]) -> Dict[str, Dict[str, Any]]:
    alias_map: Dict[str, Dict[str, Any]] = {}
    for entry in entries:
        for field_tuple in fields:
            for field_name in field_tuple:
                value = entry.get(field_name)
                if not value:
                    continue
                slug = _slugify(str(value))
                if slug and slug not in alias_map:
                    alias_map[slug] = entry
    return alias_map


def _select_primary_income_id(incomes: Iterable[Dict[str, Any]]) -> str | None:
    best_id: str | None = None
    best_amount = -1.0
    for entry in incomes:
        entry_id = entry.get("id")
        if not entry_id:
            continue
        try:
            amount = float(entry.get("monthly_amount", 0.0))
        except (TypeError, ValueError):
            amount = 0.0
        if amount > best_amount:
            best_amount = amount
            best_id = str(entry_id)
    return best_id


def _interpret_binding(field_id: str) -> FieldBinding | None:
    if field_id in LEGACY_FIELD_BINDINGS:
        collection, target_id, path = LEGACY_FIELD_BINDINGS[field_id]
        return _binding_from_collection(collection, target_id, path, field_id)

    if field_id.startswith(ESSENTIAL_FIELD_PREFIX):
        expense_id = field_id[len(ESSENTIAL_FIELD_PREFIX) :]
        return FieldBinding(kind="expense_essential", target_id=expense_id, path=(), raw=field_id)

    legacy_debt = _parse_debt_suffix(field_id)
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


def _parse_debt_suffix(field_id: str) -> Tuple[str, str] | None:
    for suffix, attribute in DEBT_FIELD_SUFFIXES:
        if not field_id.endswith(suffix):
            continue
        debt_id = field_id[: -len(suffix)]
        if debt_id:
            return debt_id, attribute
    return None


def _validate_binding_target(binding: FieldBinding, context: AnswerValidationContext) -> Dict[str, str] | None:
    if binding.kind == "expense_essential":
        if context.resolve_expense(binding.target_id):
            return None
        return {
            "field_id": binding.raw,
            "reason": "unknown_expense",
            "detail": f"Expense '{binding.target_id or '<missing>'}' is not present in the partial model.",
        }

    if binding.kind == "preferences":
        if binding.path and binding.path[0] in PREFERENCE_FIELD_IDS:
            return None
        return {
            "field_id": binding.raw,
            "reason": "unsupported_preference",
            "detail": "Preference updates must target known preference fields.",
        }

    if binding.kind == "income":
        income = context.resolve_income(binding.target_id)
        if income and _is_supported_income_path(binding.path):
            return None
        return {
            "field_id": binding.raw,
            "reason": "unknown_income",
            "detail": f"Income '{binding.target_id or '<missing>'}' is not available for updates.",
        }

    if binding.kind == "debt":
        debt_entry, expense_entry, _ = context.resolve_debt(binding.target_id)
        attribute = _map_debt_path_to_attribute(binding.path)
        if attribute and (debt_entry or expense_entry):
            return None
        return {
            "field_id": binding.raw,
            "reason": "unknown_debt",
            "detail": f"Debt '{binding.target_id or '<missing>'}' is not present in the partial model.",
        }

    return {
        "field_id": binding.raw,
        "reason": "unsupported_field_id",
        "detail": "No known mapping exists for this field_id.",
    }


def _validate_value_type(binding: FieldBinding, value: Any) -> Dict[str, str] | None:
    if binding.kind == "expense_essential":
        if isinstance(value, bool):
            return None
        return _type_error(binding.raw, "boolean")

    if binding.kind == "preferences" and binding.path:
        field = binding.path[0]
        if field == "optimization_focus":
            if isinstance(value, str) and value.strip().lower() in VALID_OPTIMIZATION_FOCUS:
                return None
            return _type_error(binding.raw, "one of debt/savings/balanced")
        if field == "protect_essentials":
            if isinstance(value, bool):
                return None
            return _type_error(binding.raw, "boolean")
        if field == "max_desired_change_per_category":
            if isinstance(value, (int, float)):
                return None
            return _type_error(binding.raw, "number")

    if binding.kind == "income" and binding.path:
        head = binding.path[0]
        if head == "metadata":
            if isinstance(value, str) and value.strip():
                return None
            return _type_error(binding.raw, "string")
        if head == "stability":
            if isinstance(value, str) and value.strip().lower() in PRIMARY_INCOME_STABILITY_VALUES:
                return None
            return _type_error(binding.raw, "stability string")
        if head == "type":
            if isinstance(value, str) and value.strip().lower() in INCOME_TYPE_VALUES:
                return None
            return _type_error(binding.raw, "income type string")

    if binding.kind == "debt":
        attribute = _map_debt_path_to_attribute(binding.path)
        if attribute in {"balance", "interest_rate", "min_payment", "rate_change_new_rate"}:
            if isinstance(value, (int, float)):
                return None
            return _type_error(binding.raw, "number")
        if attribute == "priority":
            if isinstance(value, str) and value.strip().lower() in VALID_DEBT_PRIORITIES:
                return None
            return _type_error(binding.raw, "priority string")
        if attribute == "approximate":
            if isinstance(value, bool):
                return None
            return _type_error(binding.raw, "boolean")
        if attribute == "rate_change_date":
            if isinstance(value, str) and value.strip():
                return None
            return _type_error(binding.raw, "date string")
        if attribute is None:
            return {
                "field_id": binding.raw,
                "reason": "unsupported_debt_field",
                "detail": "Debt field is not currently supported.",
            }
        return None

    return None


def _is_supported_income_path(path: Tuple[str, ...]) -> bool:
    if not path:
        return False
    head = path[0]
    if head in {"stability", "type"}:
        return True
    if head == "metadata" and len(path) >= 2:
        return True
    return False


def _map_debt_path_to_attribute(path: Tuple[str, ...]) -> str | None:
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


def _type_error(field_id: str, expected: str) -> Dict[str, str]:
    return {
        "field_id": field_id,
        "reason": "invalid_type",
        "detail": f"Field must be provided as {expected}.",
    }


def _slugify(value: str) -> str:
    normalized = value.strip().lower()
    return "".join(ch if ch.isalnum() else "_" for ch in normalized).strip("_")


