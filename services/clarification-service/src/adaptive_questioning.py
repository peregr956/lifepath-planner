"""
Adaptive questioning module that determines which profile questions are needed
based on the user's query and budget analysis.

This module implements the core logic for query-driven personalization:
- Analyze what the user is asking about
- Determine which profile questions are relevant
- Generate only the questions needed to answer the user's specific query
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from query_analyzer import QueryAnalysis, QueryIntent, analyze_query
from ui_schema_builder import build_dropdown

if TYPE_CHECKING:
    from budget_model import UnifiedBudgetModel

from question_generator import QuestionSpec

# Profile question field IDs
FIELD_FINANCIAL_PHILOSOPHY = "financial_philosophy"
FIELD_RISK_TOLERANCE = "risk_tolerance"
FIELD_PRIMARY_GOAL = "primary_goal"
FIELD_GOAL_TIMELINE = "goal_timeline"

# Options for profile questions
FINANCIAL_PHILOSOPHY_OPTIONS = [
    "r_personalfinance",  # r/personalfinance flowchart approach
    "money_guy",  # Money Guy Show financial order of operations
    "neutral",  # Balanced approach without specific framework
]

RISK_TOLERANCE_OPTIONS = [
    "conservative",  # Prefer safety and stability
    "moderate",  # Balanced risk and reward
    "aggressive",  # Willing to take more risk for higher returns
]

GOAL_TIMELINE_OPTIONS = [
    "immediate",  # Within the next few months
    "short_term",  # Within the next 1-2 years
    "medium_term",  # 2-5 years
    "long_term",  # 5+ years
]


@dataclass
class AdaptiveQuestionConfig:
    """Configuration for adaptive question generation."""

    max_profile_questions: int = 3
    include_philosophy_for_intents: set[QueryIntent] = None
    include_risk_for_intents: set[QueryIntent] = None
    include_timeline_for_intents: set[QueryIntent] = None

    def __post_init__(self):
        if self.include_philosophy_for_intents is None:
            self.include_philosophy_for_intents = {
                "debt_vs_savings",
                "debt_payoff",
                "savings",
                "retirement",
                "investment",
                "general_advice",
            }
        if self.include_risk_for_intents is None:
            self.include_risk_for_intents = {
                "investment",
                "savings",
                "retirement",
                "debt_vs_savings",
            }
        if self.include_timeline_for_intents is None:
            self.include_timeline_for_intents = {
                "savings",
                "major_purchase",
                "debt_payoff",
                "retirement",
            }


def generate_adaptive_profile_questions(
    model: UnifiedBudgetModel,
    user_query: str | None,
    existing_profile: dict[str, Any] | None = None,
    config: AdaptiveQuestionConfig | None = None,
) -> list[QuestionSpec]:
    """
    Generate profile questions based on user query and budget analysis.

    Only generates questions that are relevant to answering the user's query.
    Skips questions for data that's already in the existing profile.

    Args:
        model: The unified budget model with current data.
        user_query: The user's question/query.
        existing_profile: Profile data already collected from the user.
        config: Configuration for adaptive questioning.

    Returns:
        List of profile-related QuestionSpec objects.
    """
    if config is None:
        config = AdaptiveQuestionConfig()

    if not user_query:
        # No user query - return minimal default questions
        return _generate_default_profile_questions(existing_profile, config)

    # Analyze the user's query
    analysis = analyze_query(user_query)

    # Determine which profile questions are needed
    questions: list[QuestionSpec] = []
    existing = existing_profile or {}

    # Financial philosophy question
    if _should_ask_philosophy(analysis, existing, config):
        questions.append(_build_philosophy_question(analysis))

    # Risk tolerance question
    if _should_ask_risk_tolerance(analysis, existing, config):
        questions.append(_build_risk_tolerance_question(analysis))

    # Goal timeline question (if user mentioned a goal but no timeline)
    if _should_ask_timeline(analysis, existing, config):
        questions.append(_build_timeline_question(analysis))

    # Limit to max profile questions
    return questions[: config.max_profile_questions]


def _should_ask_philosophy(
    analysis: QueryAnalysis,
    existing: dict[str, Any],
    config: AdaptiveQuestionConfig,
) -> bool:
    """Determine if we should ask about financial philosophy."""
    # Skip if already answered
    if existing.get("financial_philosophy"):
        return False

    # Ask if query analysis indicates it's needed
    if analysis.needs_financial_philosophy:
        return True

    # Ask if primary intent matches configured intents
    return analysis.primary_intent in config.include_philosophy_for_intents


def _should_ask_risk_tolerance(
    analysis: QueryAnalysis,
    existing: dict[str, Any],
    config: AdaptiveQuestionConfig,
) -> bool:
    """Determine if we should ask about risk tolerance."""
    # Skip if already answered
    if existing.get("risk_tolerance"):
        return False

    # Ask if query analysis indicates it's needed
    if analysis.needs_risk_tolerance:
        return True

    # Ask if primary intent matches configured intents
    return analysis.primary_intent in config.include_risk_for_intents


def _should_ask_timeline(
    analysis: QueryAnalysis,
    existing: dict[str, Any],
    config: AdaptiveQuestionConfig,
) -> bool:
    """Determine if we should ask about goal timeline."""
    # Skip if already answered or extracted from query
    if existing.get("goal_timeline") or analysis.timeframe != "unspecified":
        return False

    # Ask if query analysis indicates it's needed
    if analysis.needs_timeline_clarification:
        return True

    # Ask if primary intent matches configured intents
    return analysis.primary_intent in config.include_timeline_for_intents


def _build_philosophy_question(analysis: QueryAnalysis) -> QuestionSpec:
    """Build the financial philosophy question."""
    # Customize prompt based on query intent
    if analysis.primary_intent == "debt_vs_savings":
        prompt = "Different financial approaches prioritize debt vs savings differently. Which philosophy resonates with you?"
    elif analysis.primary_intent == "debt_payoff":
        prompt = "To give you relevant debt payoff guidance, which financial approach do you prefer?"
    elif analysis.primary_intent == "retirement":
        prompt = "Different retirement strategies have different priorities. Which approach fits your style?"
    else:
        prompt = "Which financial philosophy best describes your approach?"

    component = build_dropdown(
        field_id=FIELD_FINANCIAL_PHILOSOPHY,
        label="Select a financial approach",
        options=[
            "r_personalfinance - Follow the Reddit flowchart (emergency fund → match → debt → invest)",
            "money_guy - Money Guy Financial Order of Operations",
            "neutral - Balanced approach based on your specific situation",
        ],
        binding="user_profile.financial_philosophy",
    )

    return QuestionSpec(
        question_id="question_financial_philosophy",
        prompt=prompt,
        components=[component],
    )


def _build_risk_tolerance_question(analysis: QueryAnalysis) -> QuestionSpec:
    """Build the risk tolerance question."""
    # Customize prompt based on query intent
    if analysis.primary_intent == "investment":
        prompt = "When it comes to investing, how much risk are you comfortable with?"
    elif analysis.primary_intent == "retirement":
        prompt = "For retirement planning, what's your risk tolerance?"
    else:
        prompt = "How would you describe your financial risk tolerance?"

    component = build_dropdown(
        field_id=FIELD_RISK_TOLERANCE,
        label="Select your risk tolerance",
        options=[
            "conservative - I prefer safety and stability, even if returns are lower",
            "moderate - I'm okay with some ups and downs for better long-term results",
            "aggressive - I'm willing to take more risk for potentially higher returns",
        ],
        binding="user_profile.risk_tolerance",
    )

    return QuestionSpec(
        question_id="question_risk_tolerance",
        prompt=prompt,
        components=[component],
    )


def _build_timeline_question(analysis: QueryAnalysis) -> QuestionSpec:
    """Build the goal timeline question."""
    # Try to reference the goal if mentioned
    goal_context = ""
    if analysis.mentioned_goals:
        goal = analysis.mentioned_goals[0]
        goal_context = f" for {goal}"

    prompt = f"What's your timeline{goal_context}?"

    component = build_dropdown(
        field_id=FIELD_GOAL_TIMELINE,
        label="Select a timeframe",
        options=[
            "immediate - Within the next few months",
            "short_term - Within the next 1-2 years",
            "medium_term - 2-5 years from now",
            "long_term - 5+ years from now",
        ],
        binding="user_profile.goal_timeline",
    )

    return QuestionSpec(
        question_id="question_goal_timeline",
        prompt=prompt,
        components=[component],
    )


def _generate_default_profile_questions(
    existing: dict[str, Any] | None,
    config: AdaptiveQuestionConfig,
) -> list[QuestionSpec]:
    """Generate minimal default profile questions when no user query is provided."""
    existing = existing or {}
    questions: list[QuestionSpec] = []

    # Only ask philosophy if not already answered
    if not existing.get("financial_philosophy"):
        questions.append(
            QuestionSpec(
                question_id="question_financial_philosophy",
                prompt="Which financial philosophy best describes your approach?",
                components=[
                    build_dropdown(
                        field_id=FIELD_FINANCIAL_PHILOSOPHY,
                        label="Select a financial approach",
                        options=FINANCIAL_PHILOSOPHY_OPTIONS,
                        binding="user_profile.financial_philosophy",
                    )
                ],
            )
        )

    return questions[: config.max_profile_questions]


def get_query_context_for_prompts(user_query: str | None) -> dict[str, Any]:
    """
    Extract context from user query for use in AI prompts.

    Returns a dictionary with query analysis that can be included in
    prompts to the OpenAI clarification and suggestion providers.
    """
    if not user_query:
        return {
            "has_query": False,
            "primary_intent": "general_advice",
            "intent_description": "general financial guidance",
        }

    analysis = analyze_query(user_query)

    from query_analyzer import get_intent_description

    return {
        "has_query": True,
        "raw_query": user_query,
        "primary_intent": analysis.primary_intent,
        "intent_description": get_intent_description(analysis.primary_intent),
        "secondary_intents": analysis.secondary_intents,
        "mentioned_goals": analysis.mentioned_goals,
        "mentioned_concerns": analysis.mentioned_concerns,
        "timeframe": analysis.timeframe,
        "confidence": analysis.confidence,
        "needs_risk_tolerance": analysis.needs_risk_tolerance,
        "needs_financial_philosophy": analysis.needs_financial_philosophy,
    }
