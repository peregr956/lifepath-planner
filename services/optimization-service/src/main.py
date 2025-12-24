"""
Optimization Service summarizes unified household budgets and emits deterministic
suggestions that downstream products can display or refine with AI.
"""

import logging
from typing import Any, Literal

from budget_model import (
    Debt,
    Expense,
    Income,
    Preferences,
    RateChange,
    Summary,
    UnifiedBudgetModel,
)
from compute_summary import compute_category_shares, compute_summary_for_model
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from shared.provider_settings import ProviderSettings, ProviderSettingsError, load_provider_settings
from suggestion_provider import SuggestionProviderRequest, build_suggestion_provider

app = FastAPI(title="Optimization Service")
logger = logging.getLogger(__name__)


def _load_suggestion_provider_settings() -> ProviderSettings:
    return load_provider_settings(
        provider_env="SUGGESTION_PROVIDER",
        timeout_env="SUGGESTION_PROVIDER_TIMEOUT_SECONDS",
        temperature_env="SUGGESTION_PROVIDER_TEMPERATURE",
        max_tokens_env="SUGGESTION_PROVIDER_MAX_TOKENS",
        default_timeout=60.0,  # Increased default for OpenAI suggestion generation
        default_temperature=0.7,  # Higher for more creative, personalized responses
        default_max_tokens=4096,  # Increased for analysis + detailed suggestions
    )


try:
    SUGGESTION_PROVIDER_SETTINGS = _load_suggestion_provider_settings()
except ProviderSettingsError as exc:
    logger.error("Failed to load suggestion provider settings: %s", exc)
    raise


def _initialize_suggestion_provider():
    provider_name = SUGGESTION_PROVIDER_SETTINGS.provider_name
    try:
        return build_suggestion_provider(provider_name, settings=SUGGESTION_PROVIDER_SETTINGS)
    except ValueError as exc:
        logger.error("Unsupported suggestion provider '%s'", provider_name)
        raise RuntimeError(f"Unsupported suggestion provider '{provider_name}'") from exc


SUGGESTION_PROVIDER = _initialize_suggestion_provider()


def reload_suggestion_provider_for_tests() -> None:
    """
    Refresh suggestion provider wiring after tests mutate environment variables.
    """

    global SUGGESTION_PROVIDER_SETTINGS
    global SUGGESTION_PROVIDER

    SUGGESTION_PROVIDER_SETTINGS = _load_suggestion_provider_settings()
    SUGGESTION_PROVIDER = _initialize_suggestion_provider()


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
    essential: bool | None = None
    notes: str | None = None


class DebtModel(BaseModel):
    id: str
    name: str
    balance: float
    interest_rate: float
    min_payment: float
    priority: Literal["high", "medium", "low"]
    approximate: bool
    rate_changes: list[RateChangeModel] | None = None


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


class UserProfileModel(BaseModel):
    user_query: str | None = None
    financial_philosophy: Literal["r_personalfinance", "money_guy", "neutral", "custom"] | None = None
    philosophy_notes: str | None = None
    risk_tolerance: Literal["conservative", "moderate", "aggressive"] | None = None
    risk_concerns: list[str] | None = None
    primary_goal: str | None = None
    goal_timeline: Literal["immediate", "short_term", "medium_term", "long_term"] | None = None
    financial_concerns: list[str] | None = None
    life_stage_context: str | None = None


class UnifiedBudgetModelPayload(BaseModel):
    income: list[IncomeModel]
    expenses: list[ExpenseModel]
    debts: list[DebtModel]
    preferences: PreferencesModel
    summary: SummaryModel
    # User query and profile for personalized suggestions
    user_query: str | None = None
    user_profile: dict[str, Any] | None = None

    def to_dataclass(self) -> UnifiedBudgetModel:
        """Convert validated payload into the internal dataclass representation."""
        debts: list[Debt] = []
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

        expenses = []
        for expense in self.expenses:
            # Default essential to False if not provided
            essential_value = expense.essential if expense.essential is not None else False
            expenses.append(
                Expense(
                    id=expense.id,
                    category=expense.category,
                    monthly_amount=expense.monthly_amount,
                    essential=essential_value,
                    notes=expense.notes,
                )
            )

        return UnifiedBudgetModel(
            income=[Income(**income.model_dump()) for income in self.income],
            expenses=expenses,
            debts=debts,
            preferences=Preferences(**self.preferences.model_dump()),
            summary=Summary(**self.summary.model_dump()),
        )


class SummarizeResponseModel(BaseModel):
    summary: SummaryModel
    category_shares: dict[str, float]


class SummarizeAndOptimizeResponseModel(BaseModel):
    summary: SummaryModel
    category_shares: dict[str, float]
    suggestions: list[SuggestionModel]


def _provider_call_context(settings: ProviderSettings) -> dict[str, Any]:
    context: dict[str, Any] = {
        "provider_name": settings.provider_name,
        "timeout_seconds": settings.timeout_seconds,
        "temperature": settings.temperature,
        "max_output_tokens": settings.max_output_tokens,
    }
    if settings.openai:
        context["openai"] = {
            "model": settings.openai.model,
            "api_base": settings.openai.api_base,
        }
    return context


def _build_suggestions(
    model: UnifiedBudgetModel,
    summary: Summary,
    user_query: str | None = None,
    user_profile: dict[str, Any] | None = None,
) -> list[SuggestionModel]:
    """
    Invoke the configured suggestion provider and convert its output into Pydantic models.

    Passes user_query and user_profile for personalized suggestion generation.
    """

    request_context = _provider_call_context(SUGGESTION_PROVIDER_SETTINGS)

    # Add user query and profile to context for personalized suggestions
    if user_query:
        request_context["user_query"] = user_query
    if user_profile:
        request_context["user_profile"] = user_profile

    request = SuggestionProviderRequest(model=model, summary=summary, context=request_context)
    try:
        response = SUGGESTION_PROVIDER.generate(request)
    except NotImplementedError as exc:
        logger.error("Suggestion provider '%s' is not ready: %s", SUGGESTION_PROVIDER_SETTINGS.provider_name, exc)
        raise HTTPException(status_code=501, detail=str(exc)) from exc

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
    Summarize the provided budget and emit personalized optimization suggestions.
    Expects a `UnifiedBudgetModelPayload` with normalized incomes, expenses, debts, preferences, and summary.
    Optionally includes user_query and user_profile for personalized suggestions.
    Returns a `SummarizeAndOptimizeResponseModel` with totals, category shares, and suggestion cards.
    """
    model = payload.to_dataclass()
    if not model.income and not model.expenses:
        return JSONResponse(status_code=400, content={"error": "empty_model"})
    summary = compute_summary_for_model(model)
    category_shares = compute_category_shares(model)

    # Pass user query and profile for personalized suggestions
    suggestion_models = _build_suggestions(
        model,
        summary,
        user_query=payload.user_query,
        user_profile=payload.user_profile,
    )

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
