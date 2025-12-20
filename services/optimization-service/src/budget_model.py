from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from typing_extensions import Literal


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
    user_query: Optional[str] = None
    
    # Financial philosophy (collected when relevant)
    financial_philosophy: Optional[FinancialPhilosophy] = None
    philosophy_notes: Optional[str] = None  # If custom, brief description
    
    # Risk sentiment (collected when relevant)
    risk_tolerance: Optional[RiskTolerance] = None
    risk_concerns: Optional[List[str]] = None  # Specific concerns about risk
    
    # Contextual goals (only if user query mentions goals)
    primary_goal: Optional[str] = None  # Extracted from or clarified based on user query
    goal_timeline: Optional[GoalTimeline] = None
    
    # Contextual concerns (only if user query indicates concerns)
    financial_concerns: Optional[List[str]] = None  # e.g., ["job_security", "debt_burden"]
    
    # Life context (only when relevant to query)
    life_stage_context: Optional[str] = None  # Free-form or structured if needed


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
    user_profile: Optional[UserProfile] = None
