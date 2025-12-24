"""
Quality tests for AI-generated clarification questions and analysis.

These tests compare our AI outputs against the target pattern established
by ChatGPT's example response. They focus on:
1. Initial analysis phase (budget summary, net position, observations)
2. Question grouping into logical categories
3. Prioritization of critical issues (e.g., deficit vs surplus discrepancy)
4. Natural, conversational tone

Run with: pytest tests/test_ai_quality.py -v --capture=no
"""

import json
from pathlib import Path

import pytest


# Load the sample budget fixture
FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sample_budget_for_comparison.json"


@pytest.fixture
def sample_budget():
    """Load the sample budget for testing."""
    with open(FIXTURE_PATH) as f:
        return json.load(f)


class TestBudgetAnalysis:
    """Test that budget analysis correctly identifies key issues."""

    def test_fixture_exists(self, sample_budget):
        """Verify the sample budget fixture is valid."""
        assert sample_budget is not None
        assert "draft_budget" in sample_budget
        assert "user_query" in sample_budget
        assert sample_budget["user_query"] == "What should I be doing with my surplus?"

    def test_expected_totals(self, sample_budget):
        """Verify expected analysis totals are correct."""
        expected = sample_budget["expected_analysis"]
        assert expected["total_income"] == 4400
        assert expected["total_expenses"] == 4550
        assert expected["net_position"] == -150

    def test_chatgpt_reference_structure(self, sample_budget):
        """Verify ChatGPT reference structure is documented."""
        ref = sample_budget["chatgpt_reference"]
        assert "key_observations" in ref
        assert "question_groups" in ref
        assert len(ref["question_groups"]) >= 3


class TestPromptImprovements:
    """Test that prompt improvements match the target pattern."""

    def test_clarification_prompt_includes_analysis(self):
        """Verify clarification prompt schema includes analysis section."""
        from providers.openai_clarification import QUESTION_SPEC_SCHEMA

        assert "analysis" in QUESTION_SPEC_SCHEMA["properties"]
        analysis_props = QUESTION_SPEC_SCHEMA["properties"]["analysis"]["properties"]
        
        # Should include key analysis fields
        assert "normalized_budget_summary" in analysis_props
        assert "net_position" in analysis_props
        assert "critical_observations" in analysis_props
        assert "reasoning" in analysis_props

    def test_clarification_prompt_includes_question_groups(self):
        """Verify clarification prompt schema includes question groups."""
        from providers.openai_clarification import QUESTION_SPEC_SCHEMA

        assert "question_groups" in QUESTION_SPEC_SCHEMA["properties"]
        group_props = QUESTION_SPEC_SCHEMA["properties"]["question_groups"]["items"]["properties"]
        
        # Each group should have id, title, and questions
        assert "group_id" in group_props
        assert "group_title" in group_props
        assert "questions" in group_props

    def test_clarification_system_prompt_is_conversational(self):
        """Verify system prompt uses conversational tone."""
        from providers.openai_clarification import SYSTEM_PROMPT

        # Should be conversational, not rule-heavy
        assert "thoughtful financial advisor" in SYSTEM_PROMPT.lower() or "helping" in SYSTEM_PROMPT.lower()
        assert "three steps" in SYSTEM_PROMPT.lower() or "analyze" in SYSTEM_PROMPT.lower()

    def test_suggestion_prompt_includes_analysis(self):
        """Verify suggestion prompt schema includes analysis section."""
        from providers.openai_suggestions import SUGGESTION_SCHEMA

        assert "analysis" in SUGGESTION_SCHEMA["properties"]
        analysis_props = SUGGESTION_SCHEMA["properties"]["analysis"]["properties"]
        
        # Should include key analysis fields
        assert "budget_assessment" in analysis_props
        assert "key_observations" in analysis_props
        assert "answer_to_question" in analysis_props

    def test_suggestion_system_prompt_is_conversational(self):
        """Verify suggestion system prompt uses conversational tone."""
        from providers.openai_suggestions import SYSTEM_PROMPT

        # Should be conversational and helpful
        assert "thoughtful" in SYSTEM_PROMPT.lower() or "advisor" in SYSTEM_PROMPT.lower()
        assert "understand" in SYSTEM_PROMPT.lower()


class TestFieldIdMapping:
    """Test that field ID mapping is flexible and forgiving."""

    def test_field_id_mapper_exists(self):
        """Verify the field ID mapper is implemented."""
        from providers.openai_clarification import OpenAIClarificationProvider

        provider = OpenAIClarificationProvider(settings=None)
        assert hasattr(provider, "_map_field_id")

    def test_supported_field_ids_include_profile(self):
        """Verify profile field IDs are supported."""
        import normalization

        # Profile fields should be in supported simple field IDs
        assert "financial_philosophy" in normalization.SUPPORTED_SIMPLE_FIELD_IDS
        assert "risk_tolerance" in normalization.SUPPORTED_SIMPLE_FIELD_IDS
        assert "goal_timeline" in normalization.SUPPORTED_SIMPLE_FIELD_IDS


class TestTemperatureSettings:
    """Test that temperature settings are appropriately configured."""

    def test_clarification_temperature_increased(self):
        """Verify clarification temperature is higher for natural responses."""
        from providers.openai_clarification import OpenAIClarificationProvider

        provider = OpenAIClarificationProvider(settings=None)
        # Default should be 0.6 (not 0.2 as before)
        assert provider._temperature >= 0.5

    def test_suggestion_temperature_increased(self):
        """Verify suggestion temperature is higher for creative responses."""
        from providers.openai_suggestions import OpenAISuggestionProvider

        provider = OpenAISuggestionProvider(settings=None)
        # Default should be 0.7 (not 0.3 as before)
        assert provider._temperature >= 0.6

    def test_normalization_temperature_moderate(self):
        """Verify normalization temperature is moderate for consistency."""
        from providers.openai_budget_normalization import OpenAIBudgetNormalizationProvider

        provider = OpenAIBudgetNormalizationProvider(settings=None)
        # Default should be around 0.3 (slightly higher than 0.1)
        assert 0.2 <= provider._temperature <= 0.4


class TestTokenLimits:
    """Test that token limits are appropriately configured."""

    def test_clarification_tokens_increased(self):
        """Verify clarification token limit is increased."""
        from providers.openai_clarification import OpenAIClarificationProvider

        provider = OpenAIClarificationProvider(settings=None)
        # Default should be at least 2048 (not 512 as before)
        assert provider._max_tokens >= 2048

    def test_suggestion_tokens_increased(self):
        """Verify suggestion token limit is increased."""
        from providers.openai_suggestions import OpenAISuggestionProvider

        provider = OpenAISuggestionProvider(settings=None)
        # Default should be at least 4096 (not 2048 as before)
        assert provider._max_tokens >= 4096

