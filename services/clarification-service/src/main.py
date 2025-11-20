"""
Clarification Service transforms raw budget drafts into unified models, follow-up
questions, and UI schemas so humans and downstream systems can resolve missing data.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Set
import logging
import os
import sys

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing_extensions import Literal

# Temporary path wiring so this service can import shared dataclasses until the
# repo is packaged as a proper workspace.
SERVICE_SRC = Path(__file__).resolve().parent
SERVICE_SRC_STR = str(SERVICE_SRC)
if SERVICE_SRC_STR not in sys.path:
    sys.path.append(SERVICE_SRC_STR)

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

from normalization import (
    ESSENTIAL_PREFIX,
    SUPPORTED_SIMPLE_FIELD_IDS,
    apply_answers_to_model,
    draft_to_initial_unified,
    parse_debt_field_id,
)
from question_generator import QuestionSpec
from ui_schema_builder import build_initial_ui_schema
from clarification_provider import ClarificationProviderRequest, build_clarification_provider

app = FastAPI(title="Clarification Service")
logger = logging.getLogger(__name__)


class RawBudgetLinePayload(BaseModel):
    source_row_index: int
    date: Optional[date] = None
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


class QuestionSpecModel(BaseModel):
    question_id: str
    prompt: str
    components: List[Dict[str, Any]]

    @classmethod
    def from_dataclass(cls, spec: QuestionSpec) -> "QuestionSpecModel":
        return cls(
            question_id=spec.question_id,
            prompt=spec.prompt,
            components=[component.copy() for component in spec.components],
        )


class NormalizationResponseModel(BaseModel):
    unified_model: UnifiedBudgetResponseModel
    clarification_questions: List[QuestionSpecModel] = Field(default_factory=list)
    ui_schema: Dict[str, Any]


class ClarifyResponseModel(BaseModel):
    needs_clarification: bool
    questions: List[QuestionSpecModel] = Field(default_factory=list)
    partial_model: UnifiedBudgetResponseModel


class ApplyAnswersPayload(BaseModel):
    partial_model: UnifiedBudgetResponseModel
    answers: Dict[str, Any] = Field(default_factory=dict)


class ApplyAnswersResponseModel(BaseModel):
    updated_model: UnifiedBudgetResponseModel
    ready_for_summary: bool


def _build_clarification_questions(unified_model: UnifiedBudgetModel) -> List[QuestionSpec]:
    """
    Invoke the configured clarification provider and return its question list.
    """

    provider_name = os.getenv("CLARIFICATION_PROVIDER", "deterministic")
    try:
        provider = build_clarification_provider(provider_name)
    except ValueError as exc:
        logger.error("Unsupported clarification provider '%s'", provider_name)
        raise HTTPException(
            status_code=500,
            detail=f"Unsupported clarification provider '{provider_name}'",
        ) from exc

    request = ClarificationProviderRequest(model=unified_model)
    response = provider.generate(request)
    return response.questions


@app.get("/health")
def health_check() -> dict:
    """
    Report Clarification Service availability; expects no payload.
    Returns static metadata so monitors and orchestrators can verify uptime.
    """
    return {"status": "ok", "service": "clarification-service"}


@app.post(
    "/normalize",
    response_model=NormalizationResponseModel,
    response_model_exclude_none=True,
)
def normalize_budget(payload: DraftBudgetPayload) -> NormalizationResponseModel:
    """
    Normalize an ingested draft budget and attach heuristic follow-ups plus UI scaffolding.
    Expects a `DraftBudgetPayload` produced by the ingestion pipeline.
    Returns a `NormalizationResponseModel` containing the unified model, clarification questions, and UI schema.
    """

    draft_model = payload.to_dataclass()
    unified_model = draft_to_initial_unified(draft_model)
    questions = _build_clarification_questions(unified_model)
    question_models = _serialize_question_specs(questions)
    ui_schema = build_initial_ui_schema(unified_model)

    return NormalizationResponseModel(
        unified_model=UnifiedBudgetResponseModel.from_dataclass(unified_model),
        clarification_questions=question_models,
        ui_schema=ui_schema,
    )


@app.post(
    "/clarify",
    response_model=ClarifyResponseModel,
    response_model_exclude_none=True,
)
def clarify_budget(payload: DraftBudgetPayload) -> ClarifyResponseModel:
    """
    Generate deterministic clarification questions and return the partial unified model for the UI.
    Expects a `DraftBudgetPayload` with the latest ingestion output.
    Returns a `ClarifyResponseModel` including the needs_clarification flag, question specs, and partial model.
    """

    draft_model = payload.to_dataclass()
    if not draft_model.lines:
        return JSONResponse(status_code=400, content={"error": "empty_budget"})
    unified_model = draft_to_initial_unified(draft_model)
    questions = _build_clarification_questions(unified_model)
    question_models = _serialize_question_specs(questions)

    return ClarifyResponseModel(
        needs_clarification=bool(question_models),
        questions=question_models,
        partial_model=UnifiedBudgetResponseModel.from_dataclass(unified_model),
    )


@app.post(
    "/apply-answers",
    response_model=ApplyAnswersResponseModel,
    response_model_exclude_none=True,
)
def apply_answers(payload: ApplyAnswersPayload) -> ApplyAnswersResponseModel | JSONResponse:
    """
    Apply user-provided answers to the partial unified model and gauge readiness for summarization.
    Expects an `ApplyAnswersPayload` containing the serialized partial model and answers map.
    Returns an `ApplyAnswersResponseModel` with the updated model and a readiness flag.
    """

    # TODO(ai-answer-application):
    #   * Identify real debts within expense lines automatically.
    #   * Generate more sophisticated field_id → model mappings.
    unified_model = payload.partial_model.to_dataclass()
    validation_errors = _validate_answer_field_ids(unified_model, payload.answers)
    if validation_errors:
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_field_ids",
                "invalid_fields": validation_errors,
            },
        )
    updated_model = apply_answers_to_model(unified_model, payload.answers)
    return ApplyAnswersResponseModel(
        updated_model=UnifiedBudgetResponseModel.from_dataclass(updated_model),
        ready_for_summary=True,
    )


def _serialize_question_specs(question_specs: Sequence[QuestionSpec]) -> List[QuestionSpecModel]:
    """
    Convert internal QuestionSpec dataclasses into response models that FastAPI
    can serialize.
    """

    return [QuestionSpecModel.from_dataclass(spec) for spec in question_specs]


def _validate_answer_field_ids(model: UnifiedBudgetModel, answers: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Ensure every incoming field_id maps to a known expense, preference, income, or debt binding.
    Returns a list of error descriptors when unsupported IDs are encountered.
    """

    if not answers:
        return []

    expense_ids = _collect_ids(model.expenses)
    debt_ids = _collect_ids(model.debts)
    invalid_entries: List[Dict[str, str]] = []

    for raw_field_id in answers.keys():
        if not isinstance(raw_field_id, str):
            invalid_entries.append(
                {
                    "field_id": str(raw_field_id),
                    "reason": "not_a_string",
                    "detail": "Field ids must be non-empty strings.",
                }
            )
            continue

        field_id = raw_field_id.strip()
        if not field_id:
            invalid_entries.append(
                {
                    "field_id": raw_field_id,
                    "reason": "empty_field_id",
                    "detail": "Field ids must be non-empty strings.",
                }
            )
            continue

        if field_id.startswith(ESSENTIAL_PREFIX):
            expense_id = field_id[len(ESSENTIAL_PREFIX) :]
            if expense_id and expense_id in expense_ids:
                continue
            invalid_entries.append(
                {
                    "field_id": field_id,
                    "reason": "unknown_expense",
                    "detail": f"Expense '{expense_id or '<missing>'}' is not present in the partial model.",
                }
            )
            continue

        if field_id in SUPPORTED_SIMPLE_FIELD_IDS:
            continue

        debt_target = parse_debt_field_id(field_id)
        if debt_target:
            debt_id, attribute = debt_target
            if debt_id in debt_ids:
                continue
            invalid_entries.append(
                {
                    "field_id": field_id,
                    "reason": "unknown_debt",
                    "detail": f"Debt '{debt_id}' is not present in the partial model for '{attribute}'.",
                }
            )
            continue

        invalid_entries.append(
            {
                "field_id": field_id,
                "reason": "unsupported_field_id",
                "detail": "No known mapping exists for this field_id.",
            }
        )

    return invalid_entries


def _collect_ids(entries: Sequence[Any]) -> Set[str]:
    collected: Set[str] = set()
    for entry in entries:
        entry_id = getattr(entry, "id", None)
        if entry_id:
            collected.add(entry_id)
    return collected
