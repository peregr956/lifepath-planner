"""
OpenAI-powered suggestion provider for budget optimization.

This module implements the SuggestionProvider protocol using ChatGPT to generate
personalized financial recommendations based on the user's clarified budget model,
computed summary, and chosen financial ideology (framework).
"""

from __future__ import annotations

import json
import logging
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, List, Optional

SERVICE_SRC = Path(__file__).resolve().parents[1]
if str(SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(SERVICE_SRC))
SERVICES_ROOT = SERVICE_SRC.parents[1]
if str(SERVICES_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICES_ROOT))

from openai import OpenAI, APIError, APITimeoutError
from observability.privacy import hash_payload

# Inline dataclass definition to avoid circular import issues
from dataclasses import dataclass as _dataclass


@_dataclass
class Suggestion:
    """Budget optimization suggestion (mirrors generate_suggestions.Suggestion)."""
    id: str
    title: str
    description: str
    expected_monthly_impact: float
    rationale: str
    tradeoffs: str


# Import budget model from the service src directory
from budget_model import Summary, UnifiedBudgetModel

logger = logging.getLogger(__name__)

# JSON schema for structured suggestion outputs via function calling
SUGGESTION_SCHEMA = {
    "type": "object",
    "properties": {
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "Unique identifier (e.g., 'debt-credit_card', 'flex-subscriptions').",
                    },
                    "title": {
                        "type": "string",
                        "description": "Short action-oriented headline (under 60 chars).",
                    },
                    "description": {
                        "type": "string",
                        "description": "2-3 sentence explanation of the recommendation.",
                    },
                    "expected_monthly_impact": {
                        "type": "number",
                        "description": "Estimated monthly dollar impact (positive = savings/freed cash).",
                    },
                    "rationale": {
                        "type": "string",
                        "description": "Why this recommendation makes sense for the user's situation.",
                    },
                    "tradeoffs": {
                        "type": "string",
                        "description": "What the user gives up or risks by following this advice.",
                    },
                },
                "required": ["id", "title", "description", "expected_monthly_impact", "rationale", "tradeoffs"],
            },
            "description": "Ordered list of optimization suggestions (3-6 items).",
        },
    },
    "required": ["suggestions"],
}

SYSTEM_PROMPT = """You are a personal finance advisor generating actionable budget optimization suggestions.

Your role is to analyze the user's budget and provide 3-6 specific, realistic recommendations. Focus on:
1. High-interest debt payoff strategies
2. Flexible expense reduction opportunities
3. Savings and investment allocation
4. Emergency fund adequacy
5. Tax-advantaged account optimization

Important guidelines:
- Prioritize based on the user's chosen financial framework
- Be specific with dollar amounts when possible
- Explain tradeoffs honestly
- Focus on sustainable changes, not extreme cuts
- Consider the user's optimization focus preference

Financial frameworks:
- r/personalfinance: Follow the subreddit flowchart priorities (emergency fund → employer match → high-interest debt → max tax-advantaged → taxable investing)
- money_guy: Money Guy Show Financial Order of Operations (emergency fund → employer match → eliminate high-rate debt → max Roth → 15% gross to retirement → max HSA → taxable)
- neutral: General best practices balanced across debt, savings, and lifestyle

CRITICAL: Suggestions should be educational and thought-provoking. Never guarantee outcomes or provide specific investment advice. Frame recommendations as ideas to consider.

Return structured JSON matching the provided function schema exactly."""

USER_PROMPT_TEMPLATE = """Analyze this household budget and generate optimization suggestions.

## Financial Summary
- Total Monthly Income: ${total_income:,.2f}
- Total Monthly Expenses: ${total_expenses:,.2f}
- Monthly Surplus: ${surplus:,.2f}
- Surplus Ratio: {surplus_ratio:.1%} of income

## Income Breakdown ({income_count} sources)
{income_section}

## Expense Breakdown ({expense_count} categories)
{expense_section}

## Debt Profile ({debt_count} accounts)
{debt_section}
Total Monthly Debt Service: ${total_debt_payments:,.2f}

## User Preferences
- Primary Optimization Focus: {optimization_focus}
- Protect Essential Expenses: {protect_essentials}
- Maximum Category Adjustment: {max_change:.0%}

## Financial Framework
{framework_description}

Generate 3-6 prioritized suggestions. Order by impact and alignment with the user's framework preference."""


def _format_income_section(model: UnifiedBudgetModel) -> str:
    if not model.income:
        return "No income sources detected."
    lines = []
    for inc in model.income:
        lines.append(f"- {inc.name}: ${inc.monthly_amount:,.2f}/mo ({inc.type}, {inc.stability})")
    return "\n".join(lines)


def _format_expense_section(model: UnifiedBudgetModel) -> str:
    if not model.expenses:
        return "No expenses detected."
    # Group by essential vs flexible
    essential = [e for e in model.expenses if e.essential]
    flexible = [e for e in model.expenses if not e.essential]

    lines = ["Essential:"]
    for exp in essential:
        lines.append(f"  - {exp.category}: ${exp.monthly_amount:,.2f}/mo")
    lines.append("Flexible:")
    for exp in flexible:
        lines.append(f"  - {exp.category}: ${exp.monthly_amount:,.2f}/mo")
    return "\n".join(lines)


def _format_debt_section(model: UnifiedBudgetModel) -> str:
    if not model.debts:
        return "No debts detected. Great position for savings focus!"
    lines = []
    for debt in model.debts:
        priority_tag = f"[{debt.priority.upper()} priority]" if debt.priority == "high" else ""
        lines.append(
            f"- {debt.name}: ${debt.balance:,.2f} balance at {debt.interest_rate}% APR, "
            f"min payment ${debt.min_payment:,.2f} {priority_tag}"
        )
    return "\n".join(lines)


def _get_framework_description(framework: str) -> str:
    descriptions = {
        "r_personalfinance": (
            "r/personalfinance flowchart approach:\n"
            "1. Build $1,000 emergency fund\n"
            "2. Capture full employer 401k match\n"
            "3. Pay off high-interest debt (>7%)\n"
            "4. Expand emergency fund to 3-6 months\n"
            "5. Max Roth IRA / tax-advantaged accounts\n"
            "6. Invest remaining in diversified index funds"
        ),
        "money_guy": (
            "Money Guy Show Financial Order of Operations:\n"
            "1. Emergency reserves (one month expenses)\n"
            "2. Employer match on retirement accounts\n"
            "3. High-interest debt elimination (>6%)\n"
            "4. Increase emergency reserves to 3-6 months\n"
            "5. Roth contributions (if eligible)\n"
            "6. Save 15%+ of gross income to retirement\n"
            "7. Max HSA (if eligible)\n"
            "8. Taxable brokerage for wealth building"
        ),
        "neutral": (
            "Balanced approach without a specific framework:\n"
            "- Prioritize based on interest rates and opportunity cost\n"
            "- Maintain 3-6 months emergency fund\n"
            "- Balance debt payoff with retirement savings\n"
            "- Consider both psychological wins and mathematical optimization"
        ),
    }
    return descriptions.get(framework, descriptions["neutral"])


def _build_user_prompt(model: UnifiedBudgetModel, summary: Summary, context: Dict[str, Any]) -> str:
    framework = context.get("framework", "neutral")
    total_debt_payments = sum(d.min_payment for d in model.debts)
    surplus_ratio = summary.surplus / summary.total_income if summary.total_income > 0 else 0

    return USER_PROMPT_TEMPLATE.format(
        total_income=summary.total_income,
        total_expenses=summary.total_expenses,
        surplus=summary.surplus,
        surplus_ratio=surplus_ratio,
        income_count=len(model.income),
        income_section=_format_income_section(model),
        expense_count=len(model.expenses),
        expense_section=_format_expense_section(model),
        debt_count=len(model.debts),
        debt_section=_format_debt_section(model),
        total_debt_payments=total_debt_payments,
        optimization_focus=model.preferences.optimization_focus,
        protect_essentials=model.preferences.protect_essentials,
        max_change=model.preferences.max_desired_change_per_category,
        framework_description=_get_framework_description(framework),
    )


class OpenAISuggestionProvider:
    """
    ChatGPT-backed provider that generates personalized budget optimization suggestions.

    Uses function calling to ensure structured outputs that map directly to the
    Suggestion dataclass. Falls back to the deterministic provider on errors.
    """

    name = "openai"

    def __init__(self, settings: Optional[Any] = None):
        self._settings = settings
        if settings and settings.openai:
            self._client = OpenAI(
                api_key=settings.openai.api_key,
                base_url=settings.openai.api_base,
                timeout=settings.timeout_seconds,
            )
            self._model = settings.openai.model
            self._temperature = settings.temperature
            self._max_tokens = settings.max_output_tokens
        else:
            self._client = None
            self._model = None
            self._temperature = 0.3
            self._max_tokens = 1024

    def generate(self, request: "SuggestionProviderRequest") -> "SuggestionProviderResponse":
        # Use try/except to handle different import contexts (test vs runtime)
        try:
            from src.suggestion_provider import (
                SuggestionProviderRequest,
                SuggestionProviderResponse,
                DeterministicSuggestionProvider,
                _log_suggestion_metrics,
            )
        except ImportError:
            from suggestion_provider import (
                SuggestionProviderRequest,
                SuggestionProviderResponse,
                DeterministicSuggestionProvider,
                _log_suggestion_metrics,
            )

        if not self._client:
            raise RuntimeError("OpenAI client not configured. Check OPENAI_API_KEY, OPENAI_MODEL, OPENAI_API_BASE.")

        model_dict = asdict(request.model)
        summary_dict = asdict(request.summary)
        user_prompt = _build_user_prompt(request.model, request.summary, request.context)
        prompt_hash = hash_payload({"system": SYSTEM_PROMPT, "user": user_prompt})

        logger.info(
            {
                "event": "openai_suggestion_request",
                "provider": self.name,
                "model": self._model,
                "prompt_hash": prompt_hash,
                "budget_model_hash": hash_payload(model_dict),
                "summary_hash": hash_payload(summary_dict),
            }
        )

        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                tools=[
                    {
                        "type": "function",
                        "function": {
                            "name": "generate_optimization_suggestions",
                            "description": "Generate structured budget optimization suggestions.",
                            "parameters": SUGGESTION_SCHEMA,
                        },
                    }
                ],
                tool_choice={"type": "function", "function": {"name": "generate_optimization_suggestions"}},
                temperature=self._temperature,
                max_tokens=self._max_tokens,
            )

            tool_calls = response.choices[0].message.tool_calls
            if not tool_calls:
                logger.warning({"event": "openai_no_tool_calls", "provider": self.name})
                return self._fallback_to_deterministic(request)

            arguments = tool_calls[0].function.arguments
            parsed = json.loads(arguments)
            suggestions = self._parse_suggestions(parsed)

            response_hash = hash_payload(parsed)
            logger.info(
                {
                    "event": "openai_suggestion_response",
                    "provider": self.name,
                    "suggestion_count": len(suggestions),
                    "response_hash": response_hash,
                }
            )

            result = SuggestionProviderResponse(suggestions=suggestions)
            _log_suggestion_metrics(self.name, request, suggestions)
            return result

        except (APIError, APITimeoutError) as exc:
            logger.error(
                {
                    "event": "openai_suggestion_error",
                    "provider": self.name,
                    "error_type": type(exc).__name__,
                    "error_message": str(exc),
                }
            )
            return self._fallback_to_deterministic(request)

        except json.JSONDecodeError as exc:
            logger.error(
                {
                    "event": "openai_json_parse_error",
                    "provider": self.name,
                    "error_message": str(exc),
                }
            )
            return self._fallback_to_deterministic(request)

    def _parse_suggestions(self, parsed: Dict[str, Any]) -> List[Suggestion]:
        """Convert OpenAI response into validated Suggestion objects."""
        suggestions: List[Suggestion] = []
        raw_suggestions = parsed.get("suggestions", [])

        for item in raw_suggestions:
            try:
                # Validate required fields
                required_fields = ["id", "title", "description", "expected_monthly_impact", "rationale", "tradeoffs"]
                if not all(field in item for field in required_fields):
                    logger.warning(
                        {
                            "event": "openai_suggestion_skip_missing_fields",
                            "provider": self.name,
                            "item_id": item.get("id", "unknown"),
                        }
                    )
                    continue

                # Validate and sanitize impact value
                impact = item.get("expected_monthly_impact", 0)
                try:
                    impact = float(impact)
                except (TypeError, ValueError):
                    impact = 0.0

                # Validate string fields are non-empty
                if not item.get("title") or not item.get("description"):
                    continue

                suggestions.append(
                    Suggestion(
                        id=str(item["id"]),
                        title=str(item["title"])[:100],  # Cap title length
                        description=str(item["description"])[:500],  # Cap description
                        expected_monthly_impact=round(impact, 2),
                        rationale=str(item["rationale"])[:500],
                        tradeoffs=str(item["tradeoffs"])[:500],
                    )
                )
            except Exception as exc:
                logger.warning(
                    {
                        "event": "openai_suggestion_parse_skip",
                        "provider": self.name,
                        "error_message": str(exc),
                    }
                )
                continue

        return suggestions

    def _fallback_to_deterministic(self, request: Any) -> Any:
        """Fall back to deterministic provider when OpenAI fails."""
        try:
            from src.suggestion_provider import DeterministicSuggestionProvider
        except ImportError:
            from suggestion_provider import DeterministicSuggestionProvider

        logger.info({"event": "openai_fallback_to_deterministic", "provider": self.name})
        fallback = DeterministicSuggestionProvider()
        return fallback.generate(request)

