"""Tests for adaptive_questioning.py - adaptive question flow and profile question generation."""

import pytest
from adaptive_questioning import (
    FIELD_FINANCIAL_PHILOSOPHY,
    FIELD_GOAL_TIMELINE,
    FIELD_RISK_TOLERANCE,
    AdaptiveQuestionConfig,
    generate_adaptive_profile_questions,
    get_query_context_for_prompts,
)
from budget_model import Expense, Income, Preferences, Summary, UnifiedBudgetModel
from question_generator import QuestionSpec


def make_model() -> UnifiedBudgetModel:
    """Create a minimal UnifiedBudgetModel for testing."""
    return UnifiedBudgetModel(
        income=[
            Income(
                id="income-1",
                name="Salary",
                monthly_amount=5000.0,
                type="earned",
                stability="stable",
            )
        ],
        expenses=[
            Expense(
                id="expense-1",
                category="Housing",
                monthly_amount=1500.0,
                essential=True,
            )
        ],
        debts=[],
        preferences=Preferences(
            optimization_focus="balanced",
            protect_essentials=True,
            max_desired_change_per_category=0.1,
        ),
        summary=Summary(total_income=5000.0, total_expenses=1500.0, surplus=3500.0),
    )


# =============================================================================
# Tests for generate_adaptive_profile_questions - basic functionality
# =============================================================================


class TestGenerateAdaptiveProfileQuestionsBasic:
    """Tests for basic generate_adaptive_profile_questions functionality."""

    def test_returns_list_of_question_specs(self):
        """Should return a list of QuestionSpec instances."""
        model = make_model()
        result = generate_adaptive_profile_questions(model, "How do I save more?")

        assert isinstance(result, list)
        for item in result:
            assert isinstance(item, QuestionSpec)

    def test_no_user_query_returns_default_questions(self):
        """No user query should return default profile questions."""
        model = make_model()
        result = generate_adaptive_profile_questions(model, None)

        assert len(result) >= 1
        # Default question should be about financial philosophy
        question_ids = [q.question_id for q in result]
        assert "question_financial_philosophy" in question_ids

    def test_empty_user_query_returns_default_questions(self):
        """Empty user query should return default profile questions."""
        model = make_model()
        result = generate_adaptive_profile_questions(model, "")

        assert len(result) >= 1
        question_ids = [q.question_id for q in result]
        assert "question_financial_philosophy" in question_ids


# =============================================================================
# Tests for generate_adaptive_profile_questions - max questions limit
# =============================================================================


class TestMaxQuestionsLimit:
    """Tests for max profile questions limit."""

    def test_respects_max_profile_questions_default(self):
        """Should respect default max_profile_questions of 3."""
        model = make_model()
        # Query that triggers all question types
        result = generate_adaptive_profile_questions(model, "How should I invest for retirement?")

        assert len(result) <= 3

    def test_respects_custom_max_profile_questions(self):
        """Should respect custom max_profile_questions configuration."""
        model = make_model()
        config = AdaptiveQuestionConfig(max_profile_questions=1)
        result = generate_adaptive_profile_questions(model, "How should I invest?", config=config)

        assert len(result) <= 1

    def test_max_zero_returns_empty_list(self):
        """max_profile_questions of 0 should return empty list."""
        model = make_model()
        config = AdaptiveQuestionConfig(max_profile_questions=0)
        result = generate_adaptive_profile_questions(model, "How should I invest?", config=config)

        assert result == []


# =============================================================================
# Tests for generate_adaptive_profile_questions - existing profile
# =============================================================================


class TestExistingProfile:
    """Tests for skipping questions when profile data already exists."""

    def test_skips_philosophy_when_already_answered(self):
        """Should skip philosophy question when already in existing profile."""
        model = make_model()
        existing_profile = {"financial_philosophy": "r_personalfinance"}
        result = generate_adaptive_profile_questions(model, "How do I pay off debt?", existing_profile=existing_profile)

        question_ids = [q.question_id for q in result]
        assert "question_financial_philosophy" not in question_ids

    def test_skips_risk_tolerance_when_already_answered(self):
        """Should skip risk tolerance question when already in existing profile."""
        model = make_model()
        existing_profile = {"risk_tolerance": "moderate"}
        result = generate_adaptive_profile_questions(model, "Should I invest?", existing_profile=existing_profile)

        question_ids = [q.question_id for q in result]
        assert "question_risk_tolerance" not in question_ids

    def test_skips_timeline_when_already_answered(self):
        """Should skip timeline question when already in existing profile."""
        model = make_model()
        existing_profile = {"goal_timeline": "medium_term"}
        result = generate_adaptive_profile_questions(model, "I want to save money", existing_profile=existing_profile)

        question_ids = [q.question_id for q in result]
        assert "question_goal_timeline" not in question_ids

    def test_all_answered_returns_empty_list(self):
        """All profile fields answered should return empty list for non-triggering query."""
        model = make_model()
        existing_profile = {
            "financial_philosophy": "neutral",
            "risk_tolerance": "moderate",
            "goal_timeline": "short_term",
        }
        # Query that normally triggers no specific questions
        result = generate_adaptive_profile_questions(
            model, "How is my budget looking?", existing_profile=existing_profile
        )

        # Should have no profile questions since all are answered
        assert len(result) == 0


# =============================================================================
# Tests for generate_adaptive_profile_questions - query-driven questions
# =============================================================================


class TestQueryDrivenQuestions:
    """Tests for query-driven question generation."""

    def test_investment_query_triggers_risk_tolerance(self):
        """Investment query should trigger risk tolerance question."""
        model = make_model()
        result = generate_adaptive_profile_questions(model, "Should I invest in index funds?")

        question_ids = [q.question_id for q in result]
        assert "question_risk_tolerance" in question_ids

    def test_debt_query_triggers_philosophy(self):
        """Debt query should trigger financial philosophy question."""
        model = make_model()
        result = generate_adaptive_profile_questions(model, "How should I pay off my debt?")

        question_ids = [q.question_id for q in result]
        assert "question_financial_philosophy" in question_ids

    def test_savings_query_triggers_timeline(self):
        """Savings query without timeframe should trigger timeline question."""
        model = make_model()
        result = generate_adaptive_profile_questions(model, "I want to save more money")

        question_ids = [q.question_id for q in result]
        assert "question_goal_timeline" in question_ids

    def test_savings_with_timeframe_skips_timeline(self):
        """Savings query with timeframe should not trigger timeline question."""
        model = make_model()
        result = generate_adaptive_profile_questions(model, "I want to save money this year")

        question_ids = [q.question_id for q in result]
        assert "question_goal_timeline" not in question_ids


# =============================================================================
# Tests for question customization
# =============================================================================


class TestQuestionCustomization:
    """Tests for question prompt customization based on intent."""

    def test_philosophy_question_customized_for_debt_payoff(self):
        """Philosophy question should be customized for debt payoff intent."""
        model = make_model()
        result = generate_adaptive_profile_questions(model, "How do I pay off my credit card debt?")

        philosophy_questions = [q for q in result if q.question_id == "question_financial_philosophy"]
        assert len(philosophy_questions) == 1
        assert "debt payoff" in philosophy_questions[0].prompt.lower()

    def test_philosophy_question_customized_for_retirement(self):
        """Philosophy question should be customized for retirement intent."""
        model = make_model()
        result = generate_adaptive_profile_questions(model, "Am I on track for retirement?")

        philosophy_questions = [q for q in result if q.question_id == "question_financial_philosophy"]
        assert len(philosophy_questions) == 1
        assert "retirement" in philosophy_questions[0].prompt.lower()

    def test_risk_question_customized_for_investment(self):
        """Risk tolerance question should be customized for investment intent."""
        model = make_model()
        result = generate_adaptive_profile_questions(model, "Should I invest in stocks?")

        risk_questions = [q for q in result if q.question_id == "question_risk_tolerance"]
        assert len(risk_questions) == 1
        assert "invest" in risk_questions[0].prompt.lower()

    def test_timeline_question_includes_goal_context(self):
        """Timeline question should include goal context when goals are mentioned."""
        model = make_model()
        result = generate_adaptive_profile_questions(model, "I want to save for a house")

        timeline_questions = [q for q in result if q.question_id == "question_goal_timeline"]
        assert len(timeline_questions) == 1
        assert "house" in timeline_questions[0].prompt.lower() or "timeline" in timeline_questions[0].prompt.lower()


# =============================================================================
# Tests for AdaptiveQuestionConfig
# =============================================================================


class TestAdaptiveQuestionConfig:
    """Tests for AdaptiveQuestionConfig class."""

    def test_default_config_values(self):
        """Default config should have expected values."""
        config = AdaptiveQuestionConfig()

        assert config.max_profile_questions == 3
        assert "investment" in config.include_risk_for_intents
        assert "debt_payoff" in config.include_philosophy_for_intents
        assert "savings" in config.include_timeline_for_intents

    def test_custom_intent_sets(self):
        """Custom intent sets should override defaults."""
        custom_philosophy = {"custom_intent"}
        custom_risk = {"another_intent"}
        config = AdaptiveQuestionConfig(
            include_philosophy_for_intents=custom_philosophy,
            include_risk_for_intents=custom_risk,
        )

        assert config.include_philosophy_for_intents == custom_philosophy
        assert config.include_risk_for_intents == custom_risk

    def test_post_init_sets_defaults_for_none(self):
        """__post_init__ should set defaults when None is provided."""
        config = AdaptiveQuestionConfig(
            include_philosophy_for_intents=None,
            include_risk_for_intents=None,
            include_timeline_for_intents=None,
        )

        # Should have default values set by __post_init__
        assert config.include_philosophy_for_intents is not None
        assert config.include_risk_for_intents is not None
        assert config.include_timeline_for_intents is not None


# =============================================================================
# Tests for get_query_context_for_prompts
# =============================================================================


class TestGetQueryContextForPrompts:
    """Tests for get_query_context_for_prompts function."""

    def test_returns_dict_for_valid_query(self):
        """Should return a dictionary for valid query."""
        result = get_query_context_for_prompts("How do I save money?")

        assert isinstance(result, dict)

    def test_has_query_true_for_valid_query(self):
        """has_query should be True for valid query."""
        result = get_query_context_for_prompts("How do I save money?")

        assert result["has_query"] is True

    def test_has_query_false_for_empty_query(self):
        """has_query should be False for empty query."""
        result = get_query_context_for_prompts("")

        assert result["has_query"] is False

    def test_has_query_false_for_none_query(self):
        """has_query should be False for None query."""
        result = get_query_context_for_prompts(None)

        assert result["has_query"] is False

    def test_includes_primary_intent(self):
        """Should include primary intent in context."""
        result = get_query_context_for_prompts("How do I pay off debt?")

        assert "primary_intent" in result
        assert result["primary_intent"] == "debt_payoff"

    def test_includes_intent_description(self):
        """Should include intent description in context."""
        result = get_query_context_for_prompts("How do I save money?")

        assert "intent_description" in result
        assert isinstance(result["intent_description"], str)
        assert len(result["intent_description"]) > 0

    def test_includes_secondary_intents(self):
        """Should include secondary intents in context."""
        result = get_query_context_for_prompts("I want to save and invest my money")

        assert "secondary_intents" in result
        assert isinstance(result["secondary_intents"], list)

    def test_includes_mentioned_goals(self):
        """Should include mentioned goals in context."""
        result = get_query_context_for_prompts("I want to save for a house")

        assert "mentioned_goals" in result
        assert isinstance(result["mentioned_goals"], list)

    def test_includes_mentioned_concerns(self):
        """Should include mentioned concerns in context."""
        result = get_query_context_for_prompts("I'm worried about layoffs and job security")

        assert "mentioned_concerns" in result
        assert isinstance(result["mentioned_concerns"], list)
        assert "job_security" in result["mentioned_concerns"]

    def test_includes_timeframe(self):
        """Should include timeframe in context."""
        result = get_query_context_for_prompts("I need help right now")

        assert "timeframe" in result
        assert result["timeframe"] == "immediate"

    def test_includes_confidence(self):
        """Should include confidence score in context."""
        result = get_query_context_for_prompts("How do I budget?")

        assert "confidence" in result
        assert isinstance(result["confidence"], float)
        assert 0.0 <= result["confidence"] <= 1.0

    def test_includes_needs_flags(self):
        """Should include needs_* flags in context."""
        result = get_query_context_for_prompts("Should I invest?")

        assert "needs_risk_tolerance" in result
        assert "needs_financial_philosophy" in result

    def test_includes_raw_query_for_valid_query(self):
        """Should include raw_query for valid query."""
        query = "How do I save money?"
        result = get_query_context_for_prompts(query)

        assert result["raw_query"] == query

    def test_no_raw_query_for_empty_query(self):
        """Should not include raw_query for empty query."""
        result = get_query_context_for_prompts("")

        assert "raw_query" not in result

    def test_default_values_for_no_query(self):
        """No query should return default values."""
        result = get_query_context_for_prompts(None)

        assert result["has_query"] is False
        assert result["primary_intent"] == "general_advice"
        assert result["intent_description"] == "general financial guidance"


# =============================================================================
# Tests for question component structure
# =============================================================================


class TestQuestionComponentStructure:
    """Tests for question component structure."""

    def test_philosophy_question_has_dropdown_component(self):
        """Philosophy question should have a dropdown component."""
        model = make_model()
        result = generate_adaptive_profile_questions(model, "How do I manage my debt?")

        philosophy_questions = [q for q in result if q.question_id == "question_financial_philosophy"]
        assert len(philosophy_questions) == 1
        assert len(philosophy_questions[0].components) == 1
        assert philosophy_questions[0].components[0]["component"] == "dropdown"
        assert philosophy_questions[0].components[0]["field_id"] == FIELD_FINANCIAL_PHILOSOPHY

    def test_risk_question_has_dropdown_component(self):
        """Risk tolerance question should have a dropdown component."""
        model = make_model()
        result = generate_adaptive_profile_questions(model, "Should I invest?")

        risk_questions = [q for q in result if q.question_id == "question_risk_tolerance"]
        assert len(risk_questions) == 1
        assert len(risk_questions[0].components) == 1
        assert risk_questions[0].components[0]["component"] == "dropdown"
        assert risk_questions[0].components[0]["field_id"] == FIELD_RISK_TOLERANCE

    def test_timeline_question_has_dropdown_component(self):
        """Timeline question should have a dropdown component."""
        model = make_model()
        result = generate_adaptive_profile_questions(model, "I want to save money")

        timeline_questions = [q for q in result if q.question_id == "question_goal_timeline"]
        assert len(timeline_questions) == 1
        assert len(timeline_questions[0].components) == 1
        assert timeline_questions[0].components[0]["component"] == "dropdown"
        assert timeline_questions[0].components[0]["field_id"] == FIELD_GOAL_TIMELINE

    def test_components_have_binding(self):
        """Question components should have binding field."""
        model = make_model()
        result = generate_adaptive_profile_questions(model, "How do I manage debt?")

        for question in result:
            for component in question.components:
                assert "binding" in component
                assert component["binding"].startswith("user_profile.")
