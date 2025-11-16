from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from typing_extensions import Literal


@dataclass
class Income:
    id: str
    name: str
    monthly_amount: float
    type: Literal["earned", "passive", "transfer"]
    stability: Literal["stable", "variable", "seasonal"]


@dataclass
class Expense:
    id: str
    category: str
    monthly_amount: float
    essential: bool
    notes: Optional[str] = None


@dataclass
class RateChange:
    date: str
    new_rate: float


@dataclass
class Debt:
    id: str
    name: str
    balance: float
    interest_rate: float
    min_payment: float
    priority: Literal["high", "medium", "low"]
    approximate: bool
    rate_changes: Optional[List[RateChange]] = None


@dataclass
class Preferences:
    optimization_focus: Literal["debt", "savings", "balanced"]
    protect_essentials: bool
    max_desired_change_per_category: float


@dataclass
class Summary:
    total_income: float
    total_expenses: float
    surplus: float


@dataclass
class UnifiedBudgetModel:
    income: List[Income]
    expenses: List[Expense]
    debts: List[Debt]
    preferences: Preferences
    summary: Summary
