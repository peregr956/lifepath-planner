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


class RateChangeModel(BaseModel):
    date: str
    new_rate: float

    @classmethod
    def from_dataclass(cls, change: RateChange) -> "RateChangeModel":
        return cls(date=change.date, new_rate=change.new_rate)


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


class NormalizationResponseModel(BaseModel):
    unified_model: UnifiedBudgetResponseModel
    clarification_questions: List[str]
    ui_schema: Dict[str, Any]


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
