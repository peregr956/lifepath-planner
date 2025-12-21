"""Tests for query_analyzer.py - user query intent analysis and extraction."""

import pytest
from query_analyzer import QueryAnalysis, analyze_query, get_intent_description

# =============================================================================
# Tests for analyze_query - basic functionality
# =============================================================================


class TestAnalyzeQueryBasic:
    """Tests for basic analyze_query functionality."""

    def test_returns_query_analysis_instance(self):
        """Should return a QueryAnalysis instance."""
        result = analyze_query("How should I pay off my debt?")

        assert isinstance(result, QueryAnalysis)

    def test_raw_query_preserved(self):
        """Should preserve the original query in the result."""
        query = "Help me save for a house"
        result = analyze_query(query)

        assert result.raw_query == query

    def test_empty_query_returns_general_advice(self):
        """Empty query should return general_advice with low confidence."""
        result = analyze_query("")

        assert result.primary_intent == "general_advice"
        assert result.confidence == pytest.approx(0.0)
        assert result.raw_query == ""

    def test_none_query_returns_general_advice(self):
        """None query should return general_advice with low confidence."""
        result = analyze_query(None)

        assert result.primary_intent == "general_advice"
        assert result.confidence == pytest.approx(0.0)

    def test_whitespace_only_query_returns_general_advice(self):
        """Whitespace-only query should return general_advice."""
        result = analyze_query("   \t\n   ")

        assert result.primary_intent == "general_advice"
        assert result.confidence == pytest.approx(0.0)


# =============================================================================
# Tests for analyze_query - intent detection
# =============================================================================


class TestIntentDetection:
    """Tests for intent detection in analyze_query."""

    def test_debt_payoff_intent_detected(self):
        """Debt-related keywords should detect debt_payoff intent."""
        result = analyze_query("How do I pay off my credit card debt?")

        assert result.primary_intent == "debt_payoff"

    def test_savings_intent_detected(self):
        """Savings-related keywords should detect savings intent."""
        result = analyze_query("I want to save more money each month")

        assert result.primary_intent == "savings"

    def test_investment_intent_detected(self):
        """Investment-related keywords should detect investment intent."""
        result = analyze_query("Should I invest in index funds or stocks?")

        assert result.primary_intent == "investment"

    def test_retirement_intent_detected(self):
        """Retirement-related keywords should detect retirement intent."""
        result = analyze_query("Am I saving enough for retirement?")

        assert result.primary_intent == "retirement"

    def test_spending_optimization_intent_detected(self):
        """Spending-related keywords should detect spending_optimization intent."""
        result = analyze_query("Where am I spending too much money?")

        assert result.primary_intent == "spending_optimization"

    def test_emergency_fund_intent_detected(self):
        """Emergency fund keywords should detect emergency_fund intent."""
        result = analyze_query("I need to build an emergency fund with 6 months expenses")

        assert result.primary_intent == "emergency_fund"

    def test_major_purchase_intent_detected(self):
        """Major purchase keywords should detect major_purchase intent."""
        result = analyze_query("I want to save for a down payment on a house")

        assert result.primary_intent == "major_purchase"

    def test_debt_vs_savings_intent_detected(self):
        """Debt vs savings keywords should detect debt_vs_savings intent or be a secondary intent."""
        # "debt vs savings" is a specific keyword phrase, but it may tie with other intents
        result = analyze_query("debt vs savings - which should I prioritize?")

        # debt_vs_savings should be either primary or secondary intent
        all_intents = [result.primary_intent] + result.secondary_intents
        assert "debt_vs_savings" in all_intents

    def test_general_advice_intent_detected(self):
        """General advice keywords should detect general_advice intent."""
        result = analyze_query("What tips do you have for my finances?")

        assert result.primary_intent == "general_advice"

    def test_no_keywords_returns_general_advice(self):
        """Query with no matching keywords should return general_advice."""
        result = analyze_query("xyz abc 123")

        assert result.primary_intent == "general_advice"
        assert result.confidence == pytest.approx(0.2)


# =============================================================================
# Tests for analyze_query - multiple intents
# =============================================================================


class TestMultipleIntents:
    """Tests for multiple intent detection."""

    def test_secondary_intents_detected(self):
        """Should detect secondary intents when multiple are present."""
        # This query has debt (debt_payoff) and save (savings) keywords
        result = analyze_query("Should I pay off my debt or save money?")

        assert result.primary_intent in ["debt_payoff", "savings", "debt_vs_savings"]
        assert len(result.secondary_intents) >= 1

    def test_highest_score_wins(self):
        """Primary intent should be the one with highest keyword score."""
        # "debt" appears multiple times, should score higher
        result = analyze_query("I have credit card debt, student loan debt, and car loan debt")

        assert result.primary_intent == "debt_payoff"

    def test_limits_to_top_3_secondary_intents(self):
        """Should only include top 2 secondary intents (total 3 including primary)."""
        # Complex query with many intents
        result = analyze_query(
            "I want to save money, pay off debt, invest in stocks, and plan for retirement while cutting my spending"
        )

        assert len(result.secondary_intents) <= 2


# =============================================================================
# Tests for analyze_query - confidence scoring
# =============================================================================


class TestConfidenceScoring:
    """Tests for confidence score calculation."""

    def test_single_keyword_low_confidence(self):
        """Single keyword match should have lower confidence."""
        result = analyze_query("debt")

        assert result.confidence == pytest.approx(1 / 3)

    def test_multiple_keywords_higher_confidence(self):
        """Multiple keyword matches should increase confidence."""
        result = analyze_query("I have credit card debt and student loan debt to pay off")

        assert result.confidence > 0.5

    def test_confidence_capped_at_1(self):
        """Confidence should not exceed 1.0."""
        # Query with many debt keywords
        result = analyze_query(
            "I have debt, credit card, student loan, car loan, mortgage, and I want to pay off and be debt free"
        )

        assert result.confidence <= 1.0

    def test_no_match_has_baseline_confidence(self):
        """No keyword match should have baseline confidence of 0.2."""
        result = analyze_query("random words here")

        assert result.confidence == pytest.approx(0.2)


# =============================================================================
# Tests for analyze_query - concern extraction
# =============================================================================


class TestConcernExtraction:
    """Tests for concern extraction in analyze_query."""

    def test_job_security_concern_detected(self):
        """Job security keywords should be detected as concern."""
        result = analyze_query("I'm worried about a potential layoff at work")

        assert "job_security" in result.mentioned_concerns

    def test_debt_burden_concern_detected(self):
        """Debt burden keywords should be detected as concern."""
        result = analyze_query("I feel overwhelmed by my multiple debts")

        assert "debt_burden" in result.mentioned_concerns

    def test_retirement_readiness_concern_detected(self):
        """Retirement readiness keywords should be detected as concern."""
        result = analyze_query("I'm behind on retirement savings and need to catch up")

        assert "retirement_readiness" in result.mentioned_concerns

    def test_healthcare_costs_concern_detected(self):
        """Healthcare cost keywords should be detected as concern."""
        result = analyze_query("I have high medical bills and healthcare costs")

        assert "healthcare_costs" in result.mentioned_concerns

    def test_family_obligations_concern_detected(self):
        """Family obligation keywords should be detected as concern."""
        result = analyze_query("I need to save for my kids' college fund with 529")

        assert "family_obligations" in result.mentioned_concerns

    def test_multiple_concerns_detected(self):
        """Should detect multiple concerns when present."""
        result = analyze_query("I'm worried about layoffs and have medical bills to pay")

        assert "job_security" in result.mentioned_concerns
        assert "healthcare_costs" in result.mentioned_concerns

    def test_no_concerns_returns_empty_list(self):
        """No concern keywords should return empty list."""
        result = analyze_query("How should I invest my money?")

        assert result.mentioned_concerns == []


# =============================================================================
# Tests for analyze_query - timeframe extraction
# =============================================================================


class TestTimeframeExtraction:
    """Tests for timeframe extraction in analyze_query."""

    def test_immediate_timeframe_detected(self):
        """Immediate timeframe keywords should be detected."""
        result = analyze_query("I need help right now, it's urgent")

        assert result.timeframe == "immediate"

    def test_short_term_timeframe_detected(self):
        """Short-term timeframe keywords should be detected."""
        result = analyze_query("I want to save money this year")

        assert result.timeframe == "short_term"

    def test_medium_term_timeframe_detected(self):
        """Medium-term timeframe keywords should be detected."""
        result = analyze_query("I'm planning to buy a house in 3 years")

        assert result.timeframe == "medium_term"

    def test_long_term_timeframe_detected(self):
        """Long-term timeframe keywords should be detected."""
        result = analyze_query("I want to plan for retirement in the future")

        assert result.timeframe == "long_term"

    def test_no_timeframe_returns_unspecified(self):
        """No timeframe keywords should return unspecified."""
        result = analyze_query("How do I budget better?")

        assert result.timeframe == "unspecified"

    def test_first_matching_timeframe_wins(self):
        """When multiple timeframes present, first match wins."""
        # "now" (immediate) comes first in detection order
        result = analyze_query("I need help now for my long term future plans")

        assert result.timeframe == "immediate"


# =============================================================================
# Tests for analyze_query - goal extraction
# =============================================================================


class TestGoalExtraction:
    """Tests for goal extraction via regex patterns."""

    def test_save_for_goal_extracted(self):
        """'Save for X' pattern should extract goal."""
        result = analyze_query("I want to save for a vacation")

        assert "a vacation" in result.mentioned_goals

    def test_buy_goal_extracted(self):
        """'Buy X' pattern should extract goal."""
        result = analyze_query("I want to buy a new car")

        assert "new car" in result.mentioned_goals

    def test_pay_off_goal_extracted(self):
        """'Pay off X' pattern should extract goal."""
        result = analyze_query("I need to pay off my credit card")

        assert "credit card" in result.mentioned_goals

    def test_afford_goal_extracted(self):
        """'Afford X' pattern should extract goal."""
        result = analyze_query("Can I afford a house?")

        assert "house" in result.mentioned_goals

    def test_saving_for_goal_extracted(self):
        """'Saving for X' pattern should extract goal."""
        result = analyze_query("I'm saving for a down payment")

        assert "down payment" in result.mentioned_goals

    def test_multiple_goals_extracted(self):
        """Multiple goals should be extracted."""
        result = analyze_query("I want to save for a house and pay off my student loans")

        assert len(result.mentioned_goals) >= 2

    def test_no_goals_returns_empty_list(self):
        """No goal patterns should return empty list."""
        result = analyze_query("How do I budget better?")

        assert result.mentioned_goals == []


# =============================================================================
# Tests for analyze_query - profile question flags
# =============================================================================


class TestProfileQuestionFlags:
    """Tests for profile question need flags."""

    def test_investment_needs_risk_tolerance(self):
        """Investment intent should set needs_risk_tolerance flag."""
        result = analyze_query("Should I invest in the stock market?")

        assert result.needs_risk_tolerance is True

    def test_retirement_needs_risk_tolerance(self):
        """Retirement intent should set needs_risk_tolerance flag."""
        result = analyze_query("Am I on track for retirement?")

        assert result.needs_risk_tolerance is True

    def test_savings_intent_needs_risk_tolerance(self):
        """Savings intent should set needs_risk_tolerance flag."""
        result = analyze_query("I want to grow my savings in a high yield account")

        assert result.primary_intent == "savings"
        assert result.needs_risk_tolerance is True

    def test_spending_optimization_no_risk_tolerance(self):
        """Spending optimization should not set needs_risk_tolerance."""
        result = analyze_query("Where am I overspending?")

        assert result.needs_risk_tolerance is False

    def test_debt_payoff_needs_financial_philosophy(self):
        """Debt payoff intent should set needs_financial_philosophy flag."""
        result = analyze_query("How do I pay off my debt?")

        assert result.needs_financial_philosophy is True

    def test_secondary_intents_trigger_philosophy(self):
        """Having secondary intents should set needs_financial_philosophy."""
        result = analyze_query("I want to save and invest my money")

        assert result.needs_financial_philosophy is True

    def test_major_purchase_without_goal_needs_clarification(self):
        """Major purchase without mentioned goal should need clarification."""
        # Use a query that triggers major_purchase but doesn't match goal patterns
        result = analyze_query("I'm thinking about making a home purchase soon")

        assert result.primary_intent == "major_purchase"
        # Goal clarification depends on whether goals were extracted - check if no goals extracted
        if not result.mentioned_goals:
            assert result.needs_goal_clarification is True
        else:
            # If the regex extracted a goal, clarification is not needed
            assert result.needs_goal_clarification is False

    def test_major_purchase_with_goal_no_clarification(self):
        """Major purchase with mentioned goal should not need clarification."""
        result = analyze_query("I want to save for a house")

        assert result.needs_goal_clarification is False

    def test_savings_without_timeframe_needs_timeline(self):
        """Savings without timeframe should need timeline clarification."""
        result = analyze_query("I want to save more money")

        assert result.needs_timeline_clarification is True

    def test_savings_with_timeframe_no_timeline(self):
        """Savings with timeframe should not need timeline clarification."""
        result = analyze_query("I want to save more money this year")

        assert result.needs_timeline_clarification is False


# =============================================================================
# Tests for get_intent_description
# =============================================================================


class TestGetIntentDescription:
    """Tests for get_intent_description function."""

    def test_debt_payoff_description(self):
        """Should return description for debt_payoff."""
        description = get_intent_description("debt_payoff")

        assert description == "paying off debt"

    def test_savings_description(self):
        """Should return description for savings."""
        description = get_intent_description("savings")

        assert description == "building savings"

    def test_investment_description(self):
        """Should return description for investment."""
        description = get_intent_description("investment")

        assert description == "investing and growing wealth"

    def test_retirement_description(self):
        """Should return description for retirement."""
        description = get_intent_description("retirement")

        assert description == "retirement planning"

    def test_all_intents_have_descriptions(self):
        """All defined intents should have descriptions."""
        intents = [
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

        for intent in intents:
            description = get_intent_description(intent)
            assert description is not None
            assert len(description) > 0

    def test_unknown_intent_returns_default(self):
        """Unknown intent should return default description."""
        description = get_intent_description("unknown_intent")

        assert description == "financial planning"
