from __future__ import annotations

"""Deterministic question generation module for clarification service."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from normalization import ESSENTIAL_PREFIX, PRIMARY_INCOME_FLAG_METADATA_KEY
from ui_schema_builder import (
    OPTIMIZATION_FOCUS_OPTIONS,
    PRIMARY_INCOME_STABILITY_OPTIONS,
    PRIMARY_INCOME_TYPE_OPTIONS,
    build_dropdown,
    build_toggle,
)

if TYPE_CHECKING:  # pragma: no cover
    from budget_model import Expense, Income, UnifiedBudgetModel


MAX_QUESTIONS = 5


@dataclass
class QuestionSpec:
    """Structured descriptor for a single clarification question."""

    question_id: str
    prompt: str
    components: list[dict[str, Any]]


def generate_clarification_questions(model: UnifiedBudgetModel) -> list[QuestionSpec]:
    """
    Generate a first-pass deterministic set of clarification questions based on
    missing or uncertain portions of the UnifiedBudgetModel.
    """

    questions: list[QuestionSpec] = []

    essentials_question = _build_essential_expense_question(model.expenses)
    if essentials_question:
        questions.append(essentials_question)
    if len(questions) >= MAX_QUESTIONS:
        return questions[:MAX_QUESTIONS]

    optimization_focus_question = _build_optimization_focus_question(model)
    if optimization_focus_question:
        questions.append(optimization_focus_question)
    if len(questions) >= MAX_QUESTIONS:
        return questions[:MAX_QUESTIONS]

    income_question = _build_income_clarification_question(model.income)
    if income_question:
        questions.append(income_question)

    return questions[:MAX_QUESTIONS]


def _build_essential_expense_question(expenses: Sequence[Expense]) -> QuestionSpec | None:
    """
    Create a question prompting the user to classify expenses as essential when
    the unified model still has unknown essential flags (None).
    """

    missing_flags = [expense for expense in expenses if getattr(expense, "essential", None) is None]
    if not missing_flags:
        return None

    components = [
        build_toggle(
            field_id=f"{ESSENTIAL_PREFIX}{expense.id}",
            label=f"Mark {expense.category} as essential",
            binding=f"expenses.{expense.id}.essential",
        )
        for expense in missing_flags
    ]

    return QuestionSpec(
        question_id="question_essential_expenses",
        prompt="Which of these categories are essential for your basic needs?",
        components=components,
    )


def _build_optimization_focus_question(model: UnifiedBudgetModel) -> QuestionSpec | None:
    """
    Ask for optimization focus when it is missing, empty, or outside the allowed
    focus options.
    """

    existing_focus = getattr(model.preferences, "optimization_focus", "").strip()
    if existing_focus in OPTIMIZATION_FOCUS_OPTIONS:
        return None

    component = build_dropdown(
        field_id="optimization_focus",
        label="Select the priority that fits best",
        options=list(OPTIMIZATION_FOCUS_OPTIONS),
        binding="preferences.optimization_focus",
    )

    return QuestionSpec(
        question_id="question_optimization_focus",
        prompt="For now, what would you like to prioritize?",
        components=[component],
    )


def _build_income_clarification_question(income_entries: Sequence[Income]) -> QuestionSpec | None:
    """
    Request clarification on the primary income's nature (net vs gross) and
    stability when values still rely on deterministic defaults.
    """

    if not income_entries:
        return None

    primary_income = max(income_entries, key=lambda entry: entry.monthly_amount)
    assumed_type = primary_income.type == "earned"
    assumed_stability = primary_income.stability == "stable"

    if not (assumed_type or assumed_stability):
        return None

    net_binding = f"income.{primary_income.id}.metadata.{PRIMARY_INCOME_FLAG_METADATA_KEY}"
    stability_binding = f"income.{primary_income.id}.stability"

    components = [
        build_dropdown(
            field_id="primary_income_type",
            label="Is your primary income net (after tax) or gross?",
            options=list(PRIMARY_INCOME_TYPE_OPTIONS),
            binding=net_binding,
        ),
        build_dropdown(
            field_id="primary_income_stability",
            label="Is your primary income generally stable or variable?",
            options=list(PRIMARY_INCOME_STABILITY_OPTIONS),
            binding=stability_binding,
            default=primary_income.stability,
        ),
    ]

    return QuestionSpec(
        question_id="question_primary_income_details",
        prompt="Is your primary income net (after tax) or gross, and is it generally stable?",
        components=components,
    )
