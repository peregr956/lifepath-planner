"""
Tests for the OpenAI suggestion provider.

These tests mock the OpenAI API to verify prompt construction, response parsing,
and fallback behavior without making real API calls.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest

SERVICE_ROOT = Path(__file__).resolve().parents[1]
SERVICE_SRC = SERVICE_ROOT / "src"
SERVICES_ROOT = SERVICE_ROOT.parent
PROVIDERS_SRC = SERVICE_SRC / "providers"

# Add SERVICE_ROOT first so we can import from src module
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))
if str(SERVICES_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICES_ROOT))
if str(PROVIDERS_SRC) not in sys.path:
    sys.path.insert(0, str(PROVIDERS_SRC))

from src.budget_model import (
    Debt,
    Expense,
    Income,
    Preferences,
    Summary,
    UnifiedBudgetModel,
)
from src.suggestion_provider import SuggestionProviderRequest, SuggestionProviderResponse
from openai_suggestions import OpenAISuggestionProvider
from shared.provider_settings import OpenAIConfig, ProviderSettings


@pytest.fixture
def sample_model() -> UnifiedBudgetModel:
    """Create a sample clarified budget model for suggestion generation."""
    return UnifiedBudgetModel(
        income=[
            Income(
                id="income-1",
                name="Salary",
                monthly_amount=6000.0,
                type="earned",
                stability="stable",
            )
        ],
        expenses=[
            Expense(id="expense-1", category="Housing", monthly_amount=1800.0, essential=True),
            Expense(id="expense-2", category="Groceries", monthly_amount=500.0, essential=True),
            Expense(id="expense-3", category="Subscriptions", monthly_amount=150.0, essential=False),
            Expense(id="expense-4", category="Dining Out", monthly_amount=300.0, essential=False),
        ],
        debts=[
            Debt(
                id="debt-1",
                name="Credit Card",
                balance=8000.0,
                interest_rate=22.0,
                min_payment=200.0,
                priority="high",
                approximate=False,
            ),
            Debt(
                id="debt-2",
                name="Student Loan",
                balance=25000.0,
                interest_rate=5.5,
                min_payment=280.0,
                priority="medium",
                approximate=False,
            ),
        ],
        preferences=Preferences(
            optimization_focus="debt",
            protect_essentials=True,
            max_desired_change_per_category=0.15,
        ),
        summary=Summary(total_income=6000.0, total_expenses=3230.0, surplus=2770.0),
    )


@pytest.fixture
def sample_summary() -> Summary:
    """Pre-computed summary matching sample_model."""
    return Summary(total_income=6000.0, total_expenses=3230.0, surplus=2770.0)


@pytest.fixture
def mock_settings() -> ProviderSettings:
    """Create mock provider settings with OpenAI config."""
    return ProviderSettings(
        provider_name="openai",
        timeout_seconds=15.0,
        temperature=0.3,
        max_output_tokens=1024,
        openai=OpenAIConfig(
            api_key="test-api-key",
            model="gpt-4o-mini",
            api_base="https://api.openai.com/v1",
        ),
    )


@pytest.fixture
def mock_openai_response() -> Dict[str, Any]:
    """Sample OpenAI function call response with budget suggestions."""
    return {
        "suggestions": [
            {
                "id": "debt-credit_card",
                "title": "Accelerate credit card payoff",
                "description": "Apply $500 of your monthly surplus toward your credit card. At 22% APR, this is your highest-cost debt and should be the top priority.",
                "expected_monthly_impact": 500.0,
                "rationale": "Your credit card at 22% APR is costing you significant interest. With a $2,770 surplus, you can aggressively pay this down.",
                "tradeoffs": "Less cash available for other goals, but the interest savings compound quickly.",
            },
            {
                "id": "flex-dining",
                "title": "Reduce dining out expenses",
                "description": "Consider cutting dining out by 15% (~$45/month) and redirecting to debt payoff.",
                "expected_monthly_impact": 45.0,
                "rationale": "Dining out is flexible spending that can be reduced without impacting essentials.",
                "tradeoffs": "May require more meal planning and cooking at home.",
            },
            {
                "id": "emergency-fund",
                "title": "Build emergency fund baseline",
                "description": "Ensure you have at least $3,000 in accessible savings before accelerating debt payoff beyond minimums.",
                "expected_monthly_impact": 0.0,
                "rationale": "An emergency fund prevents new debt when unexpected expenses arise.",
                "tradeoffs": "Slightly delays debt freedom but provides critical financial safety net.",
            },
        ]
    }


class TestOpenAISuggestionProvider:
    """Test suite for OpenAI suggestion provider."""

    def test_provider_generates_suggestions_from_mock_response(
        self,
        sample_model: UnifiedBudgetModel,
        sample_summary: Summary,
        mock_settings: ProviderSettings,
        mock_openai_response: Dict[str, Any],
    ):
        """Verify provider parses OpenAI function call response correctly."""
        provider = OpenAISuggestionProvider(settings=mock_settings)

        mock_choice = MagicMock()
        mock_tool_call = MagicMock()
        mock_tool_call.function.arguments = json.dumps(mock_openai_response)
        mock_choice.message.tool_calls = [mock_tool_call]

        mock_completion = MagicMock()
        mock_completion.choices = [mock_choice]

        with patch.object(provider._client.chat.completions, "create", return_value=mock_completion):
            request = SuggestionProviderRequest(
                model=sample_model,
                summary=sample_summary,
                context={"framework": "r_personalfinance"},
            )
            response = provider.generate(request)

        assert isinstance(response, SuggestionProviderResponse)
        assert len(response.suggestions) == 3

        # Check first suggestion structure
        s1 = response.suggestions[0]
        assert s1.id == "debt-credit_card"
        assert s1.expected_monthly_impact == 500.0
        assert "22%" in s1.description

    def test_provider_falls_back_on_api_error(
        self,
        sample_model: UnifiedBudgetModel,
        sample_summary: Summary,
        mock_settings: ProviderSettings,
    ):
        """Verify provider falls back to deterministic on OpenAI API errors."""
        from openai import APIStatusError
        from httpx import Response, Request

        provider = OpenAISuggestionProvider(settings=mock_settings)

        # Create a mock response for the APIStatusError
        mock_request = Request("POST", "https://api.openai.com/v1/chat/completions")
        mock_response = Response(429, request=mock_request)

        with patch.object(
            provider._client.chat.completions,
            "create",
            side_effect=APIStatusError("Rate limit exceeded", response=mock_response, body=None),
        ):
            request = SuggestionProviderRequest(
                model=sample_model,
                summary=sample_summary,
                context={},
            )
            response = provider.generate(request)

        # Should return valid response from deterministic fallback
        assert isinstance(response, SuggestionProviderResponse)
        # Deterministic should generate debt suggestion for high-interest card
        assert len(response.suggestions) >= 1

    def test_provider_falls_back_on_json_parse_error(
        self,
        sample_model: UnifiedBudgetModel,
        sample_summary: Summary,
        mock_settings: ProviderSettings,
    ):
        """Verify provider falls back when OpenAI returns invalid JSON."""
        provider = OpenAISuggestionProvider(settings=mock_settings)

        mock_choice = MagicMock()
        mock_tool_call = MagicMock()
        mock_tool_call.function.arguments = "invalid json {{"
        mock_choice.message.tool_calls = [mock_tool_call]

        mock_completion = MagicMock()
        mock_completion.choices = [mock_choice]

        with patch.object(provider._client.chat.completions, "create", return_value=mock_completion):
            request = SuggestionProviderRequest(
                model=sample_model,
                summary=sample_summary,
                context={},
            )
            response = provider.generate(request)

        assert isinstance(response, SuggestionProviderResponse)

    def test_provider_validates_suggestion_fields(
        self,
        sample_model: UnifiedBudgetModel,
        sample_summary: Summary,
        mock_settings: ProviderSettings,
    ):
        """Verify provider skips suggestions with missing required fields."""
        provider = OpenAISuggestionProvider(settings=mock_settings)

        response_with_invalid = {
            "suggestions": [
                {
                    "id": "valid-suggestion",
                    "title": "Valid suggestion",
                    "description": "This has all required fields.",
                    "expected_monthly_impact": 100.0,
                    "rationale": "Good reason.",
                    "tradeoffs": "Minor downsides.",
                },
                {
                    # Missing required fields
                    "id": "incomplete",
                    "title": "Missing fields",
                },
                {
                    # Empty title
                    "id": "empty-title",
                    "title": "",
                    "description": "Has description",
                    "expected_monthly_impact": 50.0,
                    "rationale": "Reason",
                    "tradeoffs": "Trade",
                },
            ]
        }

        mock_choice = MagicMock()
        mock_tool_call = MagicMock()
        mock_tool_call.function.arguments = json.dumps(response_with_invalid)
        mock_choice.message.tool_calls = [mock_tool_call]

        mock_completion = MagicMock()
        mock_completion.choices = [mock_choice]

        with patch.object(provider._client.chat.completions, "create", return_value=mock_completion):
            request = SuggestionProviderRequest(
                model=sample_model,
                summary=sample_summary,
                context={},
            )
            response = provider.generate(request)

        # Should only include the one valid suggestion
        assert len(response.suggestions) == 1
        assert response.suggestions[0].id == "valid-suggestion"

    def test_provider_caps_long_strings(
        self,
        sample_model: UnifiedBudgetModel,
        sample_summary: Summary,
        mock_settings: ProviderSettings,
    ):
        """Verify provider caps overly long string fields."""
        provider = OpenAISuggestionProvider(settings=mock_settings)

        response_with_long_strings = {
            "suggestions": [
                {
                    "id": "long-suggestion",
                    "title": "A" * 200,  # Very long title
                    "description": "B" * 1000,  # Very long description
                    "expected_monthly_impact": 100.0,
                    "rationale": "C" * 1000,
                    "tradeoffs": "D" * 1000,
                }
            ]
        }

        mock_choice = MagicMock()
        mock_tool_call = MagicMock()
        mock_tool_call.function.arguments = json.dumps(response_with_long_strings)
        mock_choice.message.tool_calls = [mock_tool_call]

        mock_completion = MagicMock()
        mock_completion.choices = [mock_choice]

        with patch.object(provider._client.chat.completions, "create", return_value=mock_completion):
            request = SuggestionProviderRequest(
                model=sample_model,
                summary=sample_summary,
                context={},
            )
            response = provider.generate(request)

        assert len(response.suggestions) == 1
        s = response.suggestions[0]
        assert len(s.title) <= 100
        assert len(s.description) <= 500
        assert len(s.rationale) <= 500
        assert len(s.tradeoffs) <= 500

    def test_provider_includes_framework_in_prompt(
        self,
        sample_model: UnifiedBudgetModel,
        sample_summary: Summary,
        mock_settings: ProviderSettings,
        mock_openai_response: Dict[str, Any],
    ):
        """Verify framework preference is included in the prompt."""
        provider = OpenAISuggestionProvider(settings=mock_settings)

        captured_messages = []

        def capture_create(**kwargs):
            captured_messages.extend(kwargs.get("messages", []))
            mock_choice = MagicMock()
            mock_tool_call = MagicMock()
            mock_tool_call.function.arguments = json.dumps(mock_openai_response)
            mock_choice.message.tool_calls = [mock_tool_call]
            mock_completion = MagicMock()
            mock_completion.choices = [mock_choice]
            return mock_completion

        with patch.object(provider._client.chat.completions, "create", side_effect=capture_create):
            request = SuggestionProviderRequest(
                model=sample_model,
                summary=sample_summary,
                context={"framework": "money_guy"},
            )
            provider.generate(request)

        user_message = next((m for m in captured_messages if m["role"] == "user"), None)
        assert user_message is not None
        assert "Money Guy" in user_message["content"]


class TestOpenAISuggestionProviderWithoutSettings:
    """Test provider behavior when settings are missing."""

    def test_provider_raises_without_client(
        self,
        sample_model: UnifiedBudgetModel,
        sample_summary: Summary,
    ):
        """Verify provider raises clear error when not configured."""
        provider = OpenAISuggestionProvider(settings=None)

        request = SuggestionProviderRequest(
            model=sample_model,
            summary=sample_summary,
            context={},
        )

        with pytest.raises(RuntimeError, match="OpenAI client not configured"):
            provider.generate(request)

