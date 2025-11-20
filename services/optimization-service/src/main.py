"""
Optimization Service summarizes unified household budgets and emits deterministic
suggestions that downstream products can display or refine with AI.
"""

from typing import Dict, List, Optional
import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing_extensions import Literal

from .budget_model import (
    Debt,
    Expense,
    Income,
    Preferences,
    RateChange,
    Summary,
    UnifiedBudgetModel,
)
from .compute_summary import compute_category_shares, compute_summary_for_model
from .suggestion_provider import SuggestionProviderRequest, build_suggestion_provider

app = FastAPI(title="Optimization Service")
logger = logging.getLogger(__name__)


class RateChangeModel(BaseModel):
    date: str
    new_rate: float


class IncomeModel(BaseModel):
    id: str
    name: str
    monthly_amount: float
    type: Literal["earned", "passive", "transfer"]
    stability: Literal["stable", "variable", "seasonal"]


class ExpenseModel(BaseModel):
    id: str
    category: str
    monthly_amount: float
    essential: bool
    notes: Optional[str] = None


class DebtModel(BaseModel):
    id: str
    name: str
    balance: float
    interest_rate: float
    min_payment: float
    priority: Literal["high", "medium", "low"]
    approximate: bool
    rate_changes: Optional[List[RateChangeModel]] = None


class PreferencesModel(BaseModel):
    optimization_focus: Literal["debt", "savings", "balanced"]
    protect_essentials: bool
    max_desired_change_per_category: float


class SummaryModel(BaseModel):
    total_income: float
    total_expenses: float
    surplus: float


class SuggestionModel(BaseModel):
    id: str
    title: str
    description: str
    expected_monthly_impact: float
    rationale: str
    tradeoffs: str


class UnifiedBudgetModelPayload(BaseModel):
    income: List[IncomeModel]
    expenses: List[ExpenseModel]
    debts: List[DebtModel]
    preferences: PreferencesModel
    summary: SummaryModel

    def to_dataclass(self) -> UnifiedBudgetModel:
        """Convert validated payload into the internal dataclass representation."""
        debts: List[Debt] = []
        for debt in self.debts:
            rate_changes = (
                [RateChange(**rate_change.model_dump()) for rate_change in debt.rate_changes]
                if debt.rate_changes
                else None
            )
            debts.append(
                Debt(
                    id=debt.id,
                    name=debt.name,
                    balance=debt.balance,
                    interest_rate=debt.interest_rate,
                    min_payment=debt.min_payment,
                    priority=debt.priority,
                    approximate=debt.approximate,
                    rate_changes=rate_changes,
                )
            )

        return UnifiedBudgetModel(
            income=[Income(**income.model_dump()) for income in self.income],
            expenses=[Expense(**expense.model_dump()) for expense in self.expenses],
            debts=debts,
            preferences=Preferences(**self.preferences.model_dump()),
            summary=Summary(**self.summary.model_dump()),
        )


class SummarizeResponseModel(BaseModel):
    summary: SummaryModel
    category_shares: Dict[str, float]


class SummarizeAndOptimizeResponseModel(BaseModel):
    summary: SummaryModel
    category_shares: Dict[str, float]
    suggestions: List[SuggestionModel]


def _build_suggestions(model: UnifiedBudgetModel, summary: Summary) -> List[SuggestionModel]:
    """
    Invoke the configured suggestion provider and convert its output into Pydantic models.
    """

    provider_name = os.getenv("SUGGESTION_PROVIDER", "deterministic")
    try:
        provider = build_suggestion_provider(provider_name)
    except ValueError as exc:
        logger.error("Unsupported suggestion provider '%s'", provider_name)
        raise HTTPException(
            status_code=500,
            detail=f"Unsupported suggestion provider '{provider_name}'",
        ) from exc

    request = SuggestionProviderRequest(model=model, summary=summary)
    response = provider.generate(request)

    return [
        SuggestionModel(
            id=item.id,
            title=item.title,
            description=item.description,
            expected_monthly_impact=item.expected_monthly_impact,
            rationale=item.rationale,
            tradeoffs=item.tradeoffs,
        )
        for item in response.suggestions
    ]


@app.get("/health")
def health_check() -> dict:
    """
    Report Optimization Service readiness; expects no payload.
    Returns a static status document for load balancers and uptime checks.
    """
    return {"status": "ok", "service": "optimization-service"}


@app.post("/summarize", response_model=SummarizeResponseModel)
def summarize_budget(payload: UnifiedBudgetModelPayload) -> SummarizeResponseModel:
    """
    Compute deterministic totals and category share fractions without suggestions.
    Expects a `UnifiedBudgetModelPayload` that represents a fully clarified household budget.
    Returns a `SummarizeResponseModel` containing income/expense/surplus totals plus category share ratios.
    """
    model = payload.to_dataclass()
    summary = compute_summary_for_model(model)
    category_shares = compute_category_shares(model)

    return SummarizeResponseModel(
        summary=SummaryModel(
            total_income=summary.total_income,
            total_expenses=summary.total_expenses,
            surplus=summary.surplus,
        ),
        category_shares=category_shares,
    )


@app.post("/summarize-and-optimize", response_model=SummarizeAndOptimizeResponseModel)
def summarize_and_optimize(payload: UnifiedBudgetModelPayload) -> SummarizeAndOptimizeResponseModel:
    """
    Summarize the provided budget and emit rule-based optimization suggestions.
    Expects a `UnifiedBudgetModelPayload` with normalized incomes, expenses, debts, preferences, and summary.
    Returns a `SummarizeAndOptimizeResponseModel` with totals, category shares, and suggestion cards.
    """
    model = payload.to_dataclass()
    if not model.income and not model.expenses:
        return JSONResponse(status_code=400, content={"error": "empty_model"})
    summary = compute_summary_for_model(model)
    category_shares = compute_category_shares(model)
    suggestion_models = _build_suggestions(model, summary)

    summary_model = SummaryModel(
        total_income=summary.total_income,
        total_expenses=summary.total_expenses,
        surplus=summary.surplus,
    )

    return SummarizeAndOptimizeResponseModel(
        summary=summary_model,
        category_shares=category_shares,
        suggestions=suggestion_models,
    )
