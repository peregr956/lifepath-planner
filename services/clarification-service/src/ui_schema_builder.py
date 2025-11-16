from __future__ import annotations

"""Placeholder UI schema builder for the clarification service."""

from typing import Any, Dict, TYPE_CHECKING, List, Optional

if TYPE_CHECKING:  # pragma: no cover
    from budget_model import UnifiedBudgetModel


def build_number_input(
    field_id: str,
    label: str,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    unit: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build a descriptor for a numeric input UI component following the spec in
    docs/ui_components_spec.md.
    """

    constraints: Dict[str, Any] = {}
    if min_value is not None:
        constraints["minimum"] = min_value
    if max_value is not None:
        constraints["maximum"] = max_value
    if unit is not None:
        constraints["unit"] = unit

    component: Dict[str, Any] = {
        "field_id": field_id,
        "component": "number_input",
        "label": label,
    }
    if constraints:
        component["constraints"] = constraints
    return component


def build_dropdown(field_id: str, label: str, options: List[str]) -> Dict[str, Any]:
    """
    Build a descriptor for a dropdown UI component.
    """

    return {
        "field_id": field_id,
        "component": "dropdown",
        "label": label,
        "options": list(options),
    }


def build_toggle(field_id: str, label: str) -> Dict[str, Any]:
    """
    Build a descriptor for a toggle UI component.
    """

    return {
        "field_id": field_id,
        "component": "toggle",
        "label": label,
    }


def build_initial_ui_schema(model: "UnifiedBudgetModel") -> Dict[str, Any]:
    """
    Temporary stub that will output a minimal schema until the deterministic UI
    scaffolding + AI personalization logic is ready.
    """

    # TODO(ai-ui-schema): Build structured UI sections for income/expenses/preferences.
    return {
        "sections": [],
        "summary": {
            "total_income": model.summary.total_income,
            "total_expenses": model.summary.total_expenses,
            "surplus": model.summary.surplus,
        },
        "meta": {"version": "placeholder", "notes": "UI schema generation to be implemented."},
    }

