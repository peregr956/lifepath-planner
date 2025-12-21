"""
Tests for the OpenAI clarification provider.

These tests mock the OpenAI API to verify prompt construction, response parsing,
and fallback behavior without making real API calls.
"""

from __future__ import annotations

import json
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest

from budget_model import (
    Debt,
    Expense,
    Income,
    Preferences,
    Summary,
    UnifiedBudgetModel,
)
from clarification_provider import ClarificationProviderRequest, ClarificationProviderResponse
from providers.openai_clarification import OpenAIClarificationProvider
from shared.provider_settings import OpenAIConfig, ProviderSettings


@pytest.fixture
def sample_model() -> UnifiedBudgetModel:
    """Create a sample budget model with gaps to trigger clarification questions."""
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
            Expense(id="expense-1", category="Housing", monthly_amount=1500.0, essential=None),
            Expense(id="expense-2", category="Groceries", monthly_amount=400.0, essential=None),
            Expense(id="expense-3", category="Entertainment", monthly_amount=200.0, essential=False),
        ],
        debts=[
            Debt(
                id="debt-1",
                name="Credit Card",
                balance=5000.0,
                interest_rate=18.0,
                min_payment=150.0,
                priority="high",
                approximate=True,
            )
        ],
        preferences=Preferences(
            optimization_focus="balanced",
            protect_essentials=True,
            max_desired_change_per_category=0.25,
        ),
        summary=Summary(total_income=5000.0, total_expenses=2100.0, surplus=2900.0),
    )


@pytest.fixture
def mock_settings() -> ProviderSettings:
    """Create mock provider settings with OpenAI config."""
    return ProviderSettings(
        provider_name="openai",
        timeout_seconds=10.0,
        temperature=0.2,
        max_output_tokens=512,
        openai=OpenAIConfig(
            api_key="test-api-key",
            model="gpt-4o-mini",
            api_base="https://api.openai.com/v1",
        ),
    )


@pytest.fixture
def mock_openai_response() -> Dict[str, Any]:
    """Sample OpenAI function call response with clarification questions."""
    return {
        "questions": [
            {
                "question_id": "question_essential_expenses",
                "prompt": "Which of these categories are essential for your basic needs?",
                "components": [
                    {
                        "component": "toggle",
                        "field_id": "essential_expense-1",
                        "label": "Mark Housing as essential",
                        "binding": "expenses.expense-1.essential",
                    },
                    {
                        "component": "toggle",
                        "field_id": "essential_expense-2",
                        "label": "Mark Groceries as essential",
                        "binding": "expenses.expense-2.essential",
                    },
                ],
            },
            {
                "question_id": "question_debt_details",
                "prompt": "Can you confirm your credit card details?",
                "components": [
                    {
                        "component": "number_input",
                        "field_id": "debt-1_balance",
                        "label": "Current balance",
                        "binding": "debts.debt-1.balance",
                        "min": 0,
                        "unit": "USD",
                    },
                ],
            },
        ]
    }


class TestOpenAIClarificationProvider:
    """Test suite for OpenAI clarification provider."""

    def test_provider_generates_questions_from_mock_response(
        self,
        sample_model: UnifiedBudgetModel,
        mock_settings: ProviderSettings,
        mock_openai_response: Dict[str, Any],
    ):
        """Verify provider parses OpenAI function call response correctly."""
        provider = OpenAIClarificationProvider(settings=mock_settings)

        # Mock the OpenAI client
        mock_choice = MagicMock()
        mock_tool_call = MagicMock()
        mock_tool_call.function.arguments = json.dumps(mock_openai_response)
        mock_choice.message.tool_calls = [mock_tool_call]

        mock_completion = MagicMock()
        mock_completion.choices = [mock_choice]

        with patch.object(provider._client.chat.completions, "create", return_value=mock_completion):
            request = ClarificationProviderRequest(model=sample_model, context={"framework": "neutral"})
            response = provider.generate(request)

        assert isinstance(response, ClarificationProviderResponse)
        assert len(response.questions) == 2

        # Check first question structure
        q1 = response.questions[0]
        assert q1.question_id == "question_essential_expenses"
        assert len(q1.components) == 2
        assert q1.components[0]["field_id"] == "essential_expense-1"

    def test_provider_falls_back_on_api_error(
        self,
        sample_model: UnifiedBudgetModel,
        mock_settings: ProviderSettings,
    ):
        """Verify provider falls back to deterministic on OpenAI API errors."""
        from openai import APIStatusError
        from httpx import Response, Request

        provider = OpenAIClarificationProvider(settings=mock_settings)

        # Create a mock response for the APIStatusError
        mock_request = Request("POST", "https://api.openai.com/v1/chat/completions")
        mock_response = Response(429, request=mock_request)

        with patch.object(
            provider._client.chat.completions,
            "create",
            side_effect=APIStatusError("Rate limit exceeded", response=mock_response, body=None),
        ):
            request = ClarificationProviderRequest(model=sample_model, context={})
            response = provider.generate(request)

        # Should return valid response from deterministic fallback
        assert isinstance(response, ClarificationProviderResponse)
        # Deterministic provider should generate at least one question for missing essentials
        assert len(response.questions) >= 1

    def test_provider_falls_back_on_json_parse_error(
        self,
        sample_model: UnifiedBudgetModel,
        mock_settings: ProviderSettings,
    ):
        """Verify provider falls back when OpenAI returns invalid JSON."""
        provider = OpenAIClarificationProvider(settings=mock_settings)

        mock_choice = MagicMock()
        mock_tool_call = MagicMock()
        mock_tool_call.function.arguments = "not valid json {{"
        mock_choice.message.tool_calls = [mock_tool_call]

        mock_completion = MagicMock()
        mock_completion.choices = [mock_choice]

        with patch.object(provider._client.chat.completions, "create", return_value=mock_completion):
            request = ClarificationProviderRequest(model=sample_model, context={})
            response = provider.generate(request)

        assert isinstance(response, ClarificationProviderResponse)

    def test_provider_respects_max_questions(
        self,
        sample_model: UnifiedBudgetModel,
        mock_settings: ProviderSettings,
    ):
        """Verify provider respects max_questions limit."""
        provider = OpenAIClarificationProvider(settings=mock_settings)

        # Response with many questions
        many_questions = {
            "questions": [
                {
                    "question_id": f"question_{i}",
                    "prompt": f"Question {i}?",
                    "components": [
                        {
                            "component": "toggle",
                            "field_id": f"field_{i}",
                            "label": f"Label {i}",
                            "binding": f"path.{i}",
                        }
                    ],
                }
                for i in range(10)
            ]
        }

        mock_choice = MagicMock()
        mock_tool_call = MagicMock()
        mock_tool_call.function.arguments = json.dumps(many_questions)
        mock_choice.message.tool_calls = [mock_tool_call]

        mock_completion = MagicMock()
        mock_completion.choices = [mock_choice]

        with patch.object(provider._client.chat.completions, "create", return_value=mock_completion):
            request = ClarificationProviderRequest(model=sample_model, max_questions=3, context={})
            response = provider.generate(request)

        assert len(response.questions) <= 3

    def test_provider_skips_invalid_components(
        self,
        sample_model: UnifiedBudgetModel,
        mock_settings: ProviderSettings,
    ):
        """Verify provider skips components missing required fields."""
        provider = OpenAIClarificationProvider(settings=mock_settings)

        response_with_invalid = {
            "questions": [
                {
                    "question_id": "valid_question",
                    "prompt": "Valid question?",
                    "components": [
                        {
                            "component": "toggle",
                            "field_id": "valid_field",
                            "label": "Valid label",
                            "binding": "valid.path",
                        },
                        {
                            # Missing required fields
                            "component": "toggle",
                            "field_id": "incomplete_field",
                        },
                    ],
                }
            ]
        }

        mock_choice = MagicMock()
        mock_tool_call = MagicMock()
        mock_tool_call.function.arguments = json.dumps(response_with_invalid)
        mock_choice.message.tool_calls = [mock_tool_call]

        mock_completion = MagicMock()
        mock_completion.choices = [mock_choice]

        with patch.object(provider._client.chat.completions, "create", return_value=mock_completion):
            request = ClarificationProviderRequest(model=sample_model, context={})
            response = provider.generate(request)

        # Should have one question with one valid component
        assert len(response.questions) == 1
        assert len(response.questions[0].components) == 1

    def test_provider_includes_framework_in_prompt(
        self,
        sample_model: UnifiedBudgetModel,
        mock_settings: ProviderSettings,
        mock_openai_response: Dict[str, Any],
    ):
        """Verify framework preference is included in the prompt."""
        provider = OpenAIClarificationProvider(settings=mock_settings)

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
            request = ClarificationProviderRequest(
                model=sample_model,
                context={"framework": "r_personalfinance"},
            )
            provider.generate(request)

        # Check that framework is mentioned in the user message
        user_message = next((m for m in captured_messages if m["role"] == "user"), None)
        assert user_message is not None
        assert "r/personalfinance" in user_message["content"]


class TestOpenAIClarificationProviderWithoutSettings:
    """Test provider behavior when settings are missing."""

    def test_provider_raises_without_client(self, sample_model: UnifiedBudgetModel):
        """Verify provider raises clear error when not configured."""
        provider = OpenAIClarificationProvider(settings=None)

        request = ClarificationProviderRequest(model=sample_model, context={})

        with pytest.raises(RuntimeError, match="OpenAI client not configured"):
            provider.generate(request)

