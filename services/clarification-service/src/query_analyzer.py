"""
Query analyzer module for extracting intent, goals, concerns, and timeframe from user queries.

This module provides both deterministic keyword-based analysis and LLM-powered analysis
for understanding what the user wants help with from their budget.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

# Intent categories that drive question generation and suggestion prioritization
QueryIntent = Literal[
    "debt_payoff",
    "savings",
    "spending_optimization",
    "investment",
    "retirement",
    "emergency_fund",
    "major_purchase",
    "debt_vs_savings",
    "general_advice",
]

# Timeframe categories
Timeframe = Literal["immediate", "short_term", "medium_term", "long_term", "unspecified"]


@dataclass
class QueryAnalysis:
    """Structured representation of a user's query analysis."""

    raw_query: str
    primary_intent: QueryIntent
    secondary_intents: list[QueryIntent] = field(default_factory=list)
    mentioned_goals: list[str] = field(default_factory=list)
    mentioned_concerns: list[str] = field(default_factory=list)
    timeframe: Timeframe = "unspecified"
    confidence: float = 0.0  # 0.0 to 1.0

    # Flags for what profile questions might be relevant
    needs_risk_tolerance: bool = False
    needs_financial_philosophy: bool = False
    needs_goal_clarification: bool = False
    needs_timeline_clarification: bool = False


# Keyword patterns for intent detection
INTENT_KEYWORDS: dict[QueryIntent, set[str]] = {
    "debt_payoff": {
        "debt",
        "loan",
        "credit card",
        "pay off",
        "payoff",
        "interest rate",
        "balance",
        "owe",
        "owing",
        "paying down",
        "debt free",
        "minimum payment",
        "student loan",
        "car loan",
        "mortgage",
        "personal loan",
        "credit",
    },
    "savings": {
        "save",
        "saving",
        "savings",
        "emergency fund",
        "nest egg",
        "put away",
        "set aside",
        "rainy day",
        "savings account",
        "high yield",
        "hysa",
    },
    "spending_optimization": {
        "spending",
        "spend",
        "cut back",
        "reduce",
        "trim",
        "budget",
        "too much",
        "overspending",
        "expenses",
        "cut costs",
        "waste",
        "where am i spending",
        "spending habits",
        "track spending",
    },
    "investment": {
        "invest",
        "investing",
        "investment",
        "stocks",
        "bonds",
        "etf",
        "index fund",
        "brokerage",
        "portfolio",
        "returns",
        "growth",
        "compound",
        "market",
        "401k",
        "ira",
        "roth",
    },
    "retirement": {
        "retirement",
        "retire",
        "retiring",
        "pension",
        "social security",
        "fire",
        "financial independence",
        "early retirement",
        "401k",
        "ira",
        "roth ira",
        "traditional ira",
        "retirement account",
    },
    "emergency_fund": {
        "emergency fund",
        "emergency savings",
        "rainy day fund",
        "3 months",
        "6 months",
        "cushion",
        "safety net",
        "unexpected expenses",
    },
    "major_purchase": {
        "house",
        "home",
        "down payment",
        "car",
        "vehicle",
        "wedding",
        "vacation",
        "travel",
        "education",
        "tuition",
        "buy",
        "purchase",
        "afford",
        "save for",
        "saving for",
    },
    "debt_vs_savings": {
        "debt or save",
        "save or pay",
        "pay off or save",
        "debt vs savings",
        "should i pay",
        "should i save",
        "prioritize",
    },
    "general_advice": {
        "help",
        "advice",
        "tips",
        "suggestions",
        "recommend",
        "what should i",
        "how should i",
        "best way",
        "optimize",
        "improve",
    },
}

# Keywords that suggest specific concerns
CONCERN_KEYWORDS: dict[str, set[str]] = {
    "job_security": {
        "job security",
        "layoff",
        "laid off",
        "unemployment",
        "job loss",
        "stable job",
        "unstable income",
        "variable income",
        "freelance",
        "contract work",
        "gig economy",
    },
    "debt_burden": {
        "debt burden",
        "overwhelmed",
        "drowning in debt",
        "can't keep up",
        "high interest",
        "multiple debts",
        "debt stress",
        "collection",
    },
    "retirement_readiness": {
        "behind on retirement",
        "not saving enough",
        "catch up",
        "will i have enough",
        "retirement ready",
        "retire on time",
    },
    "healthcare_costs": {
        "healthcare",
        "medical",
        "health insurance",
        "hsa",
        "deductible",
        "medical bills",
        "health costs",
    },
    "family_obligations": {
        "kids",
        "children",
        "college fund",
        "529",
        "childcare",
        "family",
        "parents",
        "elder care",
        "support",
    },
}

# Keywords that suggest timeframes
TIMEFRAME_KEYWORDS: dict[Timeframe, set[str]] = {
    "immediate": {
        "now",
        "right now",
        "immediately",
        "this month",
        "today",
        "urgent",
        "asap",
        "quickly",
    },
    "short_term": {
        "soon",
        "this year",
        "next year",
        "1 year",
        "one year",
        "12 months",
        "6 months",
        "few months",
    },
    "medium_term": {
        "2 years",
        "3 years",
        "5 years",
        "couple years",
        "few years",
        "in a few years",
        "next few years",
    },
    "long_term": {
        "10 years",
        "20 years",
        "long term",
        "eventually",
        "someday",
        "retirement",
        "when i retire",
        "down the road",
        "future",
    },
}

# Goal extraction patterns
GOAL_PATTERNS = [
    r"save (?:for |up for )?(?:\$?[\d,]+k?\s+)?(?:for )?(.+?)(?:\?|$|\.)",
    r"buy (?:a )?(.+?)(?:\?|$|\.)",
    r"pay (?:off|down) (?:my )?(.+?)(?:\?|$|\.)",
    r"afford (?:a |an )?(.+?)(?:\?|$|\.)",
    r"saving for (?:a |an )?(.+?)(?:\?|$|\.)",
]


def analyze_query(query: str) -> QueryAnalysis:
    """
    Analyze a user's natural language query to extract intent, goals, and concerns.

    Args:
        query: The user's raw query string.

    Returns:
        QueryAnalysis with structured information about the query.
    """
    if not query or not query.strip():
        return QueryAnalysis(
            raw_query=query or "",
            primary_intent="general_advice",
            confidence=0.0,
        )

    query_lower = query.lower().strip()

    # Detect intents
    intent_scores: dict[QueryIntent, int] = {}
    for intent, keywords in INTENT_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in query_lower)
        if score > 0:
            intent_scores[intent] = score

    # Determine primary and secondary intents
    sorted_intents = sorted(intent_scores.items(), key=lambda x: x[1], reverse=True)

    if sorted_intents:
        primary_intent = sorted_intents[0][0]
        secondary_intents = [intent for intent, _ in sorted_intents[1:3]]
        max_score = sorted_intents[0][1]
        confidence = min(1.0, max_score / 3.0)  # Normalize to 0-1
    else:
        primary_intent = "general_advice"
        secondary_intents = []
        confidence = 0.2

    # Detect concerns
    mentioned_concerns: list[str] = []
    for concern, keywords in CONCERN_KEYWORDS.items():
        if any(kw in query_lower for kw in keywords):
            mentioned_concerns.append(concern)

    # Detect timeframe
    timeframe: Timeframe = "unspecified"
    for tf, keywords in TIMEFRAME_KEYWORDS.items():
        if any(kw in query_lower for kw in keywords):
            timeframe = tf
            break

    # Extract mentioned goals
    mentioned_goals: list[str] = []
    for pattern in GOAL_PATTERNS:
        matches = re.findall(pattern, query_lower)
        mentioned_goals.extend(match.strip() for match in matches if match.strip())

    # Determine which profile questions are needed based on intent
    needs_risk_tolerance = primary_intent in {
        "investment",
        "savings",
        "retirement",
        "debt_vs_savings",
    } or any(intent in secondary_intents for intent in ["investment", "retirement"])

    needs_financial_philosophy = (
        primary_intent
        in {
            "debt_vs_savings",
            "debt_payoff",
            "savings",
            "retirement",
        }
        or len(secondary_intents) > 0
    )

    needs_goal_clarification = primary_intent in {"major_purchase", "savings"} and not mentioned_goals

    needs_timeline_clarification = timeframe == "unspecified" and primary_intent in {
        "savings",
        "major_purchase",
        "debt_payoff",
        "retirement",
    }

    return QueryAnalysis(
        raw_query=query,
        primary_intent=primary_intent,
        secondary_intents=secondary_intents,
        mentioned_goals=mentioned_goals,
        mentioned_concerns=mentioned_concerns,
        timeframe=timeframe,
        confidence=confidence,
        needs_risk_tolerance=needs_risk_tolerance,
        needs_financial_philosophy=needs_financial_philosophy,
        needs_goal_clarification=needs_goal_clarification,
        needs_timeline_clarification=needs_timeline_clarification,
    )


def get_intent_description(intent: QueryIntent) -> str:
    """Get a human-readable description of an intent."""
    descriptions = {
        "debt_payoff": "paying off debt",
        "savings": "building savings",
        "spending_optimization": "optimizing spending",
        "investment": "investing and growing wealth",
        "retirement": "retirement planning",
        "emergency_fund": "building an emergency fund",
        "major_purchase": "saving for a major purchase",
        "debt_vs_savings": "balancing debt payoff and savings",
        "general_advice": "general financial guidance",
    }
    return descriptions.get(intent, "financial planning")
