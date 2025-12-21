from __future__ import annotations

"""Deterministic UI schema builder for the clarification service."""

from collections.abc import Sequence
from typing import TYPE_CHECKING, Any

from normalization import ESSENTIAL_PREFIX, PRIMARY_INCOME_FLAG_METADATA_KEY

if TYPE_CHECKING:  # pragma: no cover
    from budget_model import Expense, Income, Preferences, Summary, UnifiedBudgetModel

SCHEMA_ID = "clarification_initial"
SCHEMA_VERSION = "clarify-ui-v1"

OPTIMIZATION_FOCUS_OPTIONS: Sequence[str] = ("debt", "savings", "balanced")
PRIMARY_INCOME_TYPE_OPTIONS: Sequence[str] = ("net", "gross")
PRIMARY_INCOME_STABILITY_OPTIONS: Sequence[str] = ("stable", "variable")

_UNSET = object()


def build_number_input(
    field_id: str,
    label: str,
    min_value: float | None = None,
    max_value: float | None = None,
    unit: str | None = None,
    step: float | None = None,
    *,
    binding: str | None = None,
    default: Any = _UNSET,
) -> dict[str, Any]:
    """
    Build a descriptor for a numeric input UI component following the spec in
    docs/ui_components_spec.md.
    """

    constraints: dict[str, Any] = {}
    if min_value is not None:
        constraints["minimum"] = min_value
    if max_value is not None:
        constraints["maximum"] = max_value
    if unit is not None:
        constraints["unit"] = unit
    if step is not None:
        constraints["step"] = step
    if default is not _UNSET:
        constraints["default"] = default

    component: dict[str, Any] = {
        "field_id": field_id,
        "component": "number_input",
        "label": label,
    }
    if constraints:
        component["constraints"] = constraints
    if binding:
        component["binding"] = binding
    return component


def build_dropdown(
    field_id: str,
    label: str,
    options: list[str],
    *,
    binding: str | None = None,
    default: Any = _UNSET,
) -> dict[str, Any]:
    """
    Build a descriptor for a dropdown UI component.
    """

    component: dict[str, Any] = {
        "field_id": field_id,
        "component": "dropdown",
        "label": label,
        "options": list(options),
    }
    constraints: dict[str, Any] = {}
    if default is not _UNSET:
        constraints["default"] = default
    if constraints:
        component["constraints"] = constraints
    if binding:
        component["binding"] = binding
    return component


def build_toggle(
    field_id: str,
    label: str,
    *,
    binding: str | None = None,
    default: Any = _UNSET,
) -> dict[str, Any]:
    """
    Build a descriptor for a toggle UI component.
    """

    component: dict[str, Any] = {
        "field_id": field_id,
        "component": "toggle",
        "label": label,
    }
    constraints: dict[str, Any] = {}
    if default is not _UNSET:
        constraints["default"] = default
    if constraints:
        component["constraints"] = constraints
    if binding:
        component["binding"] = binding
    return component


def build_initial_ui_schema(model: UnifiedBudgetModel) -> dict[str, Any]:
    """
    Generate structured UI sections aligned with docs/ui_components_spec.md so
    the frontend can render clarification steps deterministically.
    """

    return {
        "schema_id": SCHEMA_ID,
        "sections": [
            _build_income_section(model.income),
            _build_expenses_section(model.expenses),
            _build_preferences_section(model.preferences),
        ],
        "summary": _build_global_summary(model.summary),
        "meta": {
            "version": SCHEMA_VERSION,
            "notes": "Deterministic scaffolding for clarification.",
        },
    }


def _build_income_section(incomes: Sequence[Income]) -> dict[str, Any]:
    primary_income = _select_primary_income(incomes)
    description = "Review your current income sources and clarify the primary one."
    components: list[dict[str, Any]] = []

    if primary_income:
        net_gross_binding = f"income.{primary_income.id}.metadata.{PRIMARY_INCOME_FLAG_METADATA_KEY}"
        income_type_default = _extract_primary_income_type(primary_income)
        components.append(
            build_dropdown(
                field_id="primary_income_type",
                label="Is your primary income net (after tax) or gross?",
                options=list(PRIMARY_INCOME_TYPE_OPTIONS),
                binding=net_gross_binding,
                default=income_type_default if income_type_default is not None else _UNSET,
            )
        )
        components.append(
            build_dropdown(
                field_id="primary_income_stability",
                label="Is your primary income generally stable or variable?",
                options=list(PRIMARY_INCOME_STABILITY_OPTIONS),
                binding=f"income.{primary_income.id}.stability",
                default=primary_income.stability,
            )
        )

    return {
        "section_id": "income",
        "title": "Income snapshot",
        "description": description,
        "summary": _summarize_income(incomes, primary_income),
        "components": components,
    }


def _build_expenses_section(expenses: Sequence[Expense]) -> dict[str, Any]:
    description = "Classify spending categories as essential or flexible."
    pending_classifications = [expense for expense in expenses if getattr(expense, "essential", None) is None]

    components = [
        build_toggle(
            field_id=f"{ESSENTIAL_PREFIX}{expense.id}",
            label=f"Mark {expense.category} as essential",
            binding=f"expenses.{expense.id}.essential",
        )
        for expense in pending_classifications
    ]

    summary_entries = [
        {
            "id": expense.id,
            "label": expense.category,
            "monthly_amount": expense.monthly_amount,
            "formatted_monthly_amount": _format_currency(expense.monthly_amount),
            "essential": expense.essential,
        }
        for expense in expenses
    ]

    summary: dict[str, Any] = {
        "entries": summary_entries,
        "pending_classifications": len(pending_classifications),
    }
    if pending_classifications:
        pending_amount = sum(expense.monthly_amount for expense in pending_classifications)
        summary["pending_amount"] = {
            "raw": pending_amount,
            "formatted": _format_currency(pending_amount),
        }

    return {
        "section_id": "expenses",
        "title": "Expenses overview",
        "description": description,
        "summary": summary,
        "components": components,
    }


def _build_preferences_section(preferences: Preferences) -> dict[str, Any]:
    description = "Pick the focus that best fits your current plan."
    components = [
        build_dropdown(
            field_id="optimization_focus",
            label="Select the priority that fits best",
            options=list(OPTIMIZATION_FOCUS_OPTIONS),
            binding="preferences.optimization_focus",
            default=preferences.optimization_focus
            if preferences.optimization_focus in OPTIMIZATION_FOCUS_OPTIONS
            else _UNSET,
        )
    ]

    summary = {
        "current_focus": preferences.optimization_focus,
        "protect_essentials": preferences.protect_essentials,
        "max_desired_change_per_category": {
            "raw": preferences.max_desired_change_per_category,
            "formatted": _format_percentage(preferences.max_desired_change_per_category),
        },
    }

    return {
        "section_id": "preferences",
        "title": "Preferences",
        "description": description,
        "summary": summary,
        "components": components,
    }


def _build_global_summary(summary: Summary) -> dict[str, Any]:
    return {
        "total_income": _format_value(summary.total_income),
        "total_expenses": _format_value(summary.total_expenses),
        "surplus": _format_value(summary.surplus),
    }


def _format_value(value: float) -> dict[str, Any]:
    return {"raw": value, "formatted": _format_currency(value)}


def _summarize_income(incomes: Sequence[Income], primary_income: Income | None) -> dict[str, Any]:
    entries = [
        {
            "id": income.id,
            "label": income.name,
            "monthly_amount": income.monthly_amount,
            "formatted_monthly_amount": _format_currency(income.monthly_amount),
            "stability": income.stability,
        }
        for income in incomes
    ]

    summary: dict[str, Any] = {
        "entries": entries,
        "income_count": len(entries),
    }
    if primary_income:
        summary["primary_income_id"] = primary_income.id
        summary["primary_income_monthly_amount"] = _format_value(primary_income.monthly_amount)
    return summary


def _select_primary_income(incomes: Sequence[Income]) -> Income | None:
    if not incomes:
        return None
    return max(incomes, key=lambda entry: entry.monthly_amount)


def _extract_primary_income_type(income: Income) -> str | None:
    metadata = getattr(income, "metadata", None)
    if not isinstance(metadata, dict):
        return None
    value = metadata.get(PRIMARY_INCOME_FLAG_METADATA_KEY)
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if normalized in PRIMARY_INCOME_TYPE_OPTIONS:
        return normalized
    return None


def _format_currency(amount: float) -> str:
    sign = "-" if amount < 0 else ""
    absolute_value = abs(amount)
    return f"{sign}${absolute_value:,.2f}"


def _format_percentage(value: float) -> str:
    percentage = value * 100
    if percentage.is_integer():
        return f"{int(percentage)}%"
    return f"{percentage:.1f}%"
