from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional
import sys

from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing_extensions import Literal

# Temporary path wiring so this service can import shared dataclasses until the
# repo is packaged as a proper workspace.
SERVICE_SRC = Path(__file__).resolve().parent
SERVICES_ROOT = SERVICE_SRC.parents[1]
OTHER_SERVICE_PATHS = (
    SERVICES_ROOT / "budget-ingestion-service" / "src",
    SERVICES_ROOT / "optimization-service" / "src",
)
for path in OTHER_SERVICE_PATHS:
    path_str = str(path)
    if path.exists() and path_str not in sys.path:
        sys.path.append(path_str)

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

from normalization import draft_to_initial_unified
from question_generator import generate_clarification_questions
from ui_schema_builder import build_initial_ui_schema

app = FastAPI(title="Clarification Service")

# Generates targeted follow-up questions and UI schemas to fill gaps in the budget model (per PRD).


class RawBudgetLinePayload(BaseModel):
    source_row_index: int
    date: Optional[date]
    category_label: str
    description: Optional[str]
    amount: float
    metadata: Dict[str, Any] = Field(default_factory=dict)

    def to_dataclass(self) -> RawBudgetLine:
        return RawBudgetLine(
            source_row_index=self.source_row_index,
            date=self.date,
            category_label=self.category_label,
            description=self.description,
            amount=self.amount,
            metadata=dict(self.metadata),
        )


class DraftBudgetPayload(BaseModel):
    lines: List[RawBudgetLinePayload] = Field(default_factory=list)
    detected_format: Literal["categorical", "ledger", "unknown"] = "unknown"
    notes: Optional[str] = None

    def to_dataclass(self) -> DraftBudgetModel:
        return DraftBudgetModel(
            lines=[line.to_dataclass() for line in self.lines],
            detected_format=self.detected_format,
            notes=self.notes,
        )


class IncomeModel(BaseModel):
    id: str
    name: str
    monthly_amount: float
    type: Literal["earned", "passive", "transfer"]
    stability: Literal["stable", "variable", "seasonal"]

    @classmethod
    def from_dataclass(cls, income: Income) -> "IncomeModel":
        return cls(
            id=income.id,
            name=income.name,
            monthly_amount=income.monthly_amount,
            type=income.type,
            stability=income.stability,
        )

    def to_dataclass(self) -> Income:
        return Income(
            id=self.id,
            name=self.name,
            monthly_amount=self.monthly_amount,
            type=self.type,
            stability=self.stability,
        )


class ExpenseModel(BaseModel):
    id: str
    category: str
    monthly_amount: float
    essential: Optional[bool] = None
    notes: Optional[str] = None

    @classmethod
    def from_dataclass(cls, expense: Expense) -> "ExpenseModel":
        return cls(
            id=expense.id,
            category=expense.category,
            monthly_amount=expense.monthly_amount,
            essential=expense.essential,
            notes=expense.notes,
        )

    def to_dataclass(self) -> Expense:
        return Expense(
            id=self.id,
            category=self.category,
            monthly_amount=self.monthly_amount,
            essential=self.essential,  # type: ignore[arg-type]
            notes=self.notes,
        )


class RateChangeModel(BaseModel):
    date: str
    new_rate: float

    @classmethod
    def from_dataclass(cls, change: RateChange) -> "RateChangeModel":
        return cls(date=change.date, new_rate=change.new_rate)

    def to_dataclass(self) -> RateChange:
        return RateChange(date=self.date, new_rate=self.new_rate)


class DebtModel(BaseModel):
    id: str
    name: str
    balance: float
    interest_rate: float
    min_payment: float
    priority: Literal["high", "medium", "low"]
    approximate: bool
    rate_changes: Optional[List[RateChangeModel]] = None

    @classmethod
    def from_dataclass(cls, debt: Debt) -> "DebtModel":
        rate_changes = None
        if debt.rate_changes:
            rate_changes = [RateChangeModel.from_dataclass(change) for change in debt.rate_changes]
        return cls(
            id=debt.id,
            name=debt.name,
            balance=debt.balance,
            interest_rate=debt.interest_rate,
            min_payment=debt.min_payment,
            priority=debt.priority,
            approximate=debt.approximate,
            rate_changes=rate_changes,
        )

    def to_dataclass(self) -> Debt:
        rate_changes = None
        if self.rate_changes:
            rate_changes = [change.to_dataclass() for change in self.rate_changes]
        return Debt(
            id=self.id,
            name=self.name,
            balance=self.balance,
            interest_rate=self.interest_rate,
            min_payment=self.min_payment,
            priority=self.priority,
            approximate=self.approximate,
            rate_changes=rate_changes,
        )


class PreferencesModel(BaseModel):
    optimization_focus: Literal["debt", "savings", "balanced"]
    protect_essentials: bool
    max_desired_change_per_category: float

    @classmethod
    def from_dataclass(cls, preferences: Preferences) -> "PreferencesModel":
        return cls(
            optimization_focus=preferences.optimization_focus,
            protect_essentials=preferences.protect_essentials,
            max_desired_change_per_category=preferences.max_desired_change_per_category,
        )

    def to_dataclass(self) -> Preferences:
        return Preferences(
            optimization_focus=self.optimization_focus,
            protect_essentials=self.protect_essentials,
            max_desired_change_per_category=self.max_desired_change_per_category,
        )


class SummaryModel(BaseModel):
    total_income: float
    total_expenses: float
    surplus: float

    @classmethod
    def from_dataclass(cls, summary: Summary) -> "SummaryModel":
        return cls(
            total_income=summary.total_income,
            total_expenses=summary.total_expenses,
            surplus=summary.surplus,
        )

    def to_dataclass(self) -> Summary:
        return Summary(
            total_income=self.total_income,
            total_expenses=self.total_expenses,
            surplus=self.surplus,
        )


class UnifiedBudgetResponseModel(BaseModel):
    income: List[IncomeModel]
    expenses: List[ExpenseModel]
    debts: List[DebtModel]
    preferences: PreferencesModel
    summary: SummaryModel

    @classmethod
    def from_dataclass(cls, model: UnifiedBudgetModel) -> "UnifiedBudgetResponseModel":
        return cls(
            income=[IncomeModel.from_dataclass(income) for income in model.income],
            expenses=[ExpenseModel.from_dataclass(expense) for expense in model.expenses],
            debts=[DebtModel.from_dataclass(debt) for debt in model.debts],
            preferences=PreferencesModel.from_dataclass(model.preferences),
            summary=SummaryModel.from_dataclass(model.summary),
        )

    def to_dataclass(self) -> UnifiedBudgetModel:
        return UnifiedBudgetModel(
            income=[income.to_dataclass() for income in self.income],
            expenses=[expense.to_dataclass() for expense in self.expenses],
            debts=[debt.to_dataclass() for debt in self.debts],
            preferences=self.preferences.to_dataclass(),
            summary=self.summary.to_dataclass(),
        )


class NormalizationResponseModel(BaseModel):
    unified_model: UnifiedBudgetResponseModel
    clarification_questions: List[str]
    ui_schema: Dict[str, Any]


class ClarifyResponseModel(BaseModel):
    needs_clarification: bool
    questions: List[str]
    partial_model: UnifiedBudgetResponseModel


class ApplyAnswersPayload(BaseModel):
    partial_model: UnifiedBudgetResponseModel
    answers: Dict[str, Any] = Field(default_factory=dict)


class ApplyAnswersResponseModel(BaseModel):
    partial_model: UnifiedBudgetResponseModel


@app.get("/health")
def health_check() -> dict:
    """Basic health check."""
    return {"status": "ok", "service": "clarification-service"}


@app.post(
    "/normalize",
    response_model=NormalizationResponseModel,
    response_model_exclude_none=True,
)
def normalize_budget(payload: DraftBudgetPayload) -> NormalizationResponseModel:
    """
    Convert a draft budget into the baseline UnifiedBudgetModel structure and
    attach heuristic questions + UI scaffolding. Later stages will replace the
    heuristics with AI-driven logic.
    """

    draft_model = payload.to_dataclass()
    unified_model = draft_to_initial_unified(draft_model)
    questions = generate_clarification_questions(unified_model)
    ui_schema = build_initial_ui_schema(unified_model)

    return NormalizationResponseModel(
        unified_model=UnifiedBudgetResponseModel.from_dataclass(unified_model),
        clarification_questions=questions,
        ui_schema=ui_schema,
    )


@app.post(
    "/clarify",
    response_model=ClarifyResponseModel,
    response_model_exclude_none=True,
)
def clarify_budget(payload: DraftBudgetPayload) -> ClarifyResponseModel:
    """
    Produce a placeholder clarification response with the deterministic partial
    model. Follow-up AI logic will eventually populate real questions.
    """

    draft_model = payload.to_dataclass()
    unified_model = draft_to_initial_unified(draft_model)

    return ClarifyResponseModel(
        needs_clarification=True,
        questions=[],  # TODO(ai-questioning): Populate deterministic or LLM-driven questions.
        partial_model=UnifiedBudgetResponseModel.from_dataclass(unified_model),
    )


@app.post(
    "/apply-answers",
    response_model=ApplyAnswersResponseModel,
    response_model_exclude_none=True,
)
def apply_answers(payload: ApplyAnswersPayload) -> ApplyAnswersResponseModel:
    """
    Apply user-provided answers to the partial model. Placeholder implementation
    returns the model unchanged until transformation rules are defined.
    """

    # TODO(ai-answer-application): Merge answers into the UnifiedBudgetModel (e.g., mark essentials, add debts).
    return ApplyAnswersResponseModel(partial_model=payload.partial_model)
