from typing import Dict, List, Optional

from fastapi import FastAPI
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

app = FastAPI(title="Optimization Service")


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


@app.get("/health")
def health_check() -> dict:
    """Basic health check."""
    return {"status": "ok", "service": "optimization-service"}


@app.post("/summarize", response_model=SummarizeResponseModel)
def summarize_budget(payload: UnifiedBudgetModelPayload) -> SummarizeResponseModel:
    """
    Deterministically summarize the provided budget without optimization suggestions.

    The endpoint returns total income, expenses, surplus, and category share fractions.
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
