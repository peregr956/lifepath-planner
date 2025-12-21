from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

# Financial philosophy options
FinancialPhilosophy = Literal["r_personalfinance", "money_guy", "neutral", "custom"]

# Risk tolerance levels
RiskTolerance = Literal["conservative", "moderate", "aggressive"]

# Goal timeline options
GoalTimeline = Literal["immediate", "short_term", "medium_term", "long_term"]


@dataclass
class UserProfile:
    """
    Minimal, contextual user profile data collected through adaptive questioning.

    All fields are optional - only collect what's needed to answer the user's query.
    """

    # User's initial query/question that drives personalized guidance
    user_query: str | None = None

    # Financial philosophy (collected when relevant)
    financial_philosophy: FinancialPhilosophy | None = None
    philosophy_notes: str | None = None  # If custom, brief description

    # Risk sentiment (collected when relevant)
    risk_tolerance: RiskTolerance | None = None
    risk_concerns: list[str] | None = None  # Specific concerns about risk

    # Contextual goals (only if user query mentions goals)
    primary_goal: str | None = None  # Extracted from or clarified based on user query
    goal_timeline: GoalTimeline | None = None

    # Contextual concerns (only if user query indicates concerns)
    financial_concerns: list[str] | None = None  # e.g., ["job_security", "debt_burden"]

    # Life context (only when relevant to query)
    life_stage_context: str | None = None  # Free-form or structured if needed


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
    notes: str | None = None


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
    rate_changes: list[RateChange] | None = None


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
    income: list[Income]
    expenses: list[Expense]
    debts: list[Debt]
    preferences: Preferences
    summary: Summary
    user_profile: UserProfile | None = None
