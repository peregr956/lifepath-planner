from typing import Any, Dict

from budget_model import Expense, Income, Preferences, Summary, UnifiedBudgetModel
from ui_schema_builder import build_initial_ui_schema


def test_build_initial_ui_schema_emits_structured_sections() -> None:
    primary_income = Income(
        id="income_primary",
        name="Salary",
        monthly_amount=6500.0,
        type="earned",
        stability="stable",
    )
    setattr(primary_income, "metadata", {"net_or_gross": "net"})
    secondary_income = Income(
        id="income_bonus",
        name="Freelance",
        monthly_amount=1200.0,
        type="earned",
        stability="variable",
    )

    housing = Expense(
        id="housing",
        category="Housing",
        monthly_amount=2100.0,
        essential=False,
        notes=None,
    )
    housing.essential = None  # type: ignore[assignment]
    groceries = Expense(
        id="groceries",
        category="Groceries",
        monthly_amount=600.0,
        essential=True,
        notes=None,
    )

    preferences = Preferences(
        optimization_focus="balanced",
        protect_essentials=True,
        max_desired_change_per_category=0.05,
    )
    summary = Summary(total_income=7700.0, total_expenses=2700.0, surplus=5000.0)
    model = UnifiedBudgetModel(
        income=[primary_income, secondary_income],
        expenses=[housing, groceries],
        debts=[],
        preferences=preferences,
        summary=summary,
    )

    schema = build_initial_ui_schema(model)

    expected_schema: Dict[str, Any] = {
        "schema_id": "clarification_initial",
        "sections": [
            {
                "section_id": "income",
                "title": "Income snapshot",
                "description": "Review your current income sources and clarify the primary one.",
                "summary": {
                    "entries": [
                        {
                            "id": "income_primary",
                            "label": "Salary",
                            "monthly_amount": 6500.0,
                            "formatted_monthly_amount": "$6,500.00",
                            "stability": "stable",
                        },
                        {
                            "id": "income_bonus",
                            "label": "Freelance",
                            "monthly_amount": 1200.0,
                            "formatted_monthly_amount": "$1,200.00",
                            "stability": "variable",
                        },
                    ],
                    "income_count": 2,
                    "primary_income_id": "income_primary",
                    "primary_income_monthly_amount": {
                        "raw": 6500.0,
                        "formatted": "$6,500.00",
                    },
                },
                "components": [
                    {
                        "field_id": "primary_income_type",
                        "component": "dropdown",
                        "label": "Is your primary income net (after tax) or gross?",
                        "options": ["net", "gross"],
                        "constraints": {"default": "net"},
                        "binding": "income.income_primary.metadata.net_or_gross",
                    },
                    {
                        "field_id": "primary_income_stability",
                        "component": "dropdown",
                        "label": "Is your primary income generally stable or variable?",
                        "options": ["stable", "variable"],
                        "constraints": {"default": "stable"},
                        "binding": "income.income_primary.stability",
                    },
                ],
            },
            {
                "section_id": "expenses",
                "title": "Expenses overview",
                "description": "Classify spending categories as essential or flexible.",
                "summary": {
                    "entries": [
                        {
                            "id": "housing",
                            "label": "Housing",
                            "monthly_amount": 2100.0,
                            "formatted_monthly_amount": "$2,100.00",
                            "essential": None,
                        },
                        {
                            "id": "groceries",
                            "label": "Groceries",
                            "monthly_amount": 600.0,
                            "formatted_monthly_amount": "$600.00",
                            "essential": True,
                        },
                    ],
                    "pending_classifications": 1,
                    "pending_amount": {"raw": 2100.0, "formatted": "$2,100.00"},
                },
                "components": [
                    {
                        "field_id": "essential_housing",
                        "component": "toggle",
                        "label": "Mark Housing as essential",
                        "binding": "expenses.housing.essential",
                    }
                ],
            },
            {
                "section_id": "preferences",
                "title": "Preferences",
                "description": "Pick the focus that best fits your current plan.",
                "summary": {
                    "current_focus": "balanced",
                    "protect_essentials": True,
                    "max_desired_change_per_category": {"raw": 0.05, "formatted": "5%"},
                },
                "components": [
                    {
                        "field_id": "optimization_focus",
                        "component": "dropdown",
                        "label": "Select the priority that fits best",
                        "options": ["debt", "savings", "balanced"],
                        "constraints": {"default": "balanced"},
                        "binding": "preferences.optimization_focus",
                    }
                ],
            },
        ],
        "summary": {
            "total_income": {"raw": 7700.0, "formatted": "$7,700.00"},
            "total_expenses": {"raw": 2700.0, "formatted": "$2,700.00"},
            "surplus": {"raw": 5000.0, "formatted": "$5,000.00"},
        },
        "meta": {
            "version": "clarify-ui-v1",
            "notes": "Deterministic scaffolding for clarification.",
        },
    }

    assert schema == expected_schema


def test_build_initial_ui_schema_handles_empty_model() -> None:
    preferences = Preferences(
        optimization_focus="balanced",
        protect_essentials=True,
        max_desired_change_per_category=0.0,
    )
    summary = Summary(total_income=0.0, total_expenses=0.0, surplus=0.0)
    model = UnifiedBudgetModel(income=[], expenses=[], debts=[], preferences=preferences, summary=summary)

    schema = build_initial_ui_schema(model)

    assert schema["schema_id"] == "clarification_initial"
    assert schema["summary"] == {
        "total_income": {"raw": 0.0, "formatted": "$0.00"},
        "total_expenses": {"raw": 0.0, "formatted": "$0.00"},
        "surplus": {"raw": 0.0, "formatted": "$0.00"},
    }
    assert len(schema["sections"]) == 3
    assert schema["sections"][0]["components"] == []
    assert schema["sections"][1]["components"] == []
    assert schema["sections"][2]["components"][0]["field_id"] == "optimization_focus"

