"""
OpenAI-powered suggestion provider for budget optimization.

This module implements the SuggestionProvider protocol using ChatGPT to generate
personalized financial recommendations based on the user's clarified budget model,
computed summary, and chosen financial ideology (framework).
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict

# Inline dataclass definition to avoid circular import issues
from dataclasses import dataclass as _dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from suggestion_provider import SuggestionProviderRequest, SuggestionProviderResponse

from openai import APIError, APITimeoutError, OpenAI
from shared.observability.privacy import hash_payload


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

## CRITICAL PRIORITY: USER'S QUESTION COMES FIRST
The user has asked a specific question. Your FIRST 1-2 suggestions MUST directly and specifically address their exact question.
DO NOT start with generic advice (like "build emergency fund" or "cut expenses") unless that directly answers their question.

## GOAL-SPECIFIC GUIDANCE
When the user asks about specific goals, provide targeted advice:

### Down Payment / House Savings:
- Calculate monthly savings needed: (target amount - current savings) / months to goal
- Recommend high-yield savings accounts or money market accounts (NOT investment accounts)
- Suggest dedicated "house fund" separate from other savings
- Discuss the 20% down payment benchmark vs PMI tradeoffs
- Consider closing cost reserves (2-5% of home price)

### Debt Payoff:
- Compare avalanche (highest rate first) vs snowball (smallest balance first)
- Calculate payoff timeline with extra payments
- Discuss balance transfer options for high-rate credit cards
- Consider debt consolidation if multiple high-rate debts

### Retirement Savings:
- Start with employer 401k match (free money)
- Discuss Roth vs Traditional based on current vs expected future tax bracket
- Target 15-20% of gross income as a long-term goal
- Consider IRA contribution limits and catch-up contributions

### Emergency Fund:
- Target 3-6 months of essential expenses
- Recommend high-yield savings account
- Calculate specific dollar target based on their expenses

## STRUCTURE YOUR SUGGESTIONS
1. FIRST suggestion: Directly answers their question with specific action steps
2. SECOND suggestion: Related action that supports their goal
3. REMAINING suggestions: Other relevant optimizations (only if helpful)

## SUGGESTION QUALITY REQUIREMENTS
- Every rationale MUST explicitly reference their question (e.g., "To save for your down payment...")
- Include specific dollar amounts calculated from their budget
- Provide timelines when goals are mentioned
- Explain HOW to implement each suggestion, not just WHAT to do

## DO NOT
- Lead with generic advice like "build emergency fund" unless they asked about it
- Suggest cutting $8 from entertainment when they're asking about saving $50k for a house
- Provide suggestions that don't relate to their question
- Be vague about dollar amounts or timelines

## Profile-aware suggestions:
- If user is conservative → emphasize safety, stability, guaranteed returns
- If user is aggressive → can mention growth-oriented options with appropriate caveats
- If user follows r/personalfinance → follow flowchart priorities
- If user follows money_guy → follow their order of operations

## Financial frameworks:
- r/personalfinance: Follow the subreddit flowchart priorities (emergency fund → employer match → high-interest debt → max tax-advantaged → taxable investing)
- money_guy: Money Guy Show Financial Order of Operations (emergency fund → employer match → eliminate high-rate debt → max Roth → 15% gross to retirement → max HSA → taxable)
- neutral: General best practices balanced across debt, savings, and lifestyle

CRITICAL: Suggestions should be educational and thought-provoking. Never guarantee outcomes or provide specific investment advice. Frame recommendations as ideas to consider.

Return structured JSON matching the provided function schema exactly."""

USER_PROMPT_TEMPLATE = """## USER'S QUESTION (Generate suggestions that answer this)
"{user_query}"

{user_profile_section}

Generate suggestions that directly address their question above.

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

Generate 3-6 prioritized suggestions that answer: "{user_query}"
Lead with suggestions most relevant to their question. Reference their question in your rationale."""


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


def _detect_goal_type(user_query: str) -> str | None:
    """Detect the primary financial goal from the user's query."""
    query_lower = user_query.lower()
    
    # Down payment / house related
    if any(keyword in query_lower for keyword in [
        'down payment', 'house', 'home', 'buy a home', 'buy a house',
        'mortgage', 'first home', 'homeowner', 'property'
    ]):
        return 'down_payment'
    
    # Retirement related
    if any(keyword in query_lower for keyword in [
        'retirement', 'retire', '401k', 'ira', 'roth', 'pension',
        'social security', 'retire early', 'fire'
    ]):
        return 'retirement'
    
    # Debt payoff related
    if any(keyword in query_lower for keyword in [
        'debt', 'pay off', 'payoff', 'credit card', 'student loan',
        'loan', 'debt free', 'eliminate debt', 'pay down'
    ]):
        return 'debt_payoff'
    
    # Emergency fund related
    if any(keyword in query_lower for keyword in [
        'emergency fund', 'emergency savings', 'rainy day',
        'safety net', 'buffer', 'unexpected expenses'
    ]):
        return 'emergency_fund'
    
    # Savings related (generic)
    if any(keyword in query_lower for keyword in [
        'save', 'saving', 'savings', 'save money', 'save more'
    ]):
        return 'savings'
    
    return None


def _build_goal_context(goal_type: str | None, model: UnifiedBudgetModel, summary: Summary) -> str:
    """Build goal-specific context section for the prompt."""
    if not goal_type:
        return ""
    
    context_lines = ["\n## GOAL-SPECIFIC CONTEXT (Use this to provide targeted advice)"]
    
    surplus = summary.surplus
    monthly_flexible = sum(e.monthly_amount for e in model.expenses if not e.essential)
    
    if goal_type == 'down_payment':
        context_lines.append("The user is asking about saving for a home purchase.")
        context_lines.append(f"- Current monthly surplus available: ${surplus:,.2f}")
        context_lines.append(f"- If they saved entire surplus: ${surplus * 12:,.2f}/year, ${surplus * 24:,.2f} in 2 years")
        context_lines.append("- Recommend: High-yield savings account (4-5% APY currently)")
        context_lines.append("- Typical down payment: 20% to avoid PMI, or 3-5% with FHA/conventional")
        context_lines.append("- Don't forget closing costs: 2-5% of home price")
    
    elif goal_type == 'retirement':
        context_lines.append("The user is asking about retirement savings.")
        income = summary.total_income
        recommended_15 = income * 0.15
        context_lines.append(f"- Current monthly income: ${income:,.2f}")
        context_lines.append(f"- 15% of income (recommended target): ${recommended_15:,.2f}/month")
        context_lines.append("- 2024 401k limit: $23,000 ($30,500 if 50+)")
        context_lines.append("- 2024 IRA limit: $7,000 ($8,000 if 50+)")
    
    elif goal_type == 'debt_payoff':
        context_lines.append("The user is asking about paying off debt.")
        if model.debts:
            total_debt = sum(d.balance for d in model.debts)
            total_min_payments = sum(d.min_payment for d in model.debts)
            highest_rate = max(d.interest_rate for d in model.debts) if model.debts else 0
            context_lines.append(f"- Total debt: ${total_debt:,.2f}")
            context_lines.append(f"- Total minimum payments: ${total_min_payments:,.2f}/month")
            context_lines.append(f"- Highest interest rate: {highest_rate}%")
            context_lines.append(f"- Extra available after minimums: ${surplus:,.2f}/month")
        else:
            context_lines.append("- No debts detected in their budget")
    
    elif goal_type == 'emergency_fund':
        context_lines.append("The user is asking about building an emergency fund.")
        essential_expenses = sum(e.monthly_amount for e in model.expenses if e.essential)
        context_lines.append(f"- Monthly essential expenses: ${essential_expenses:,.2f}")
        context_lines.append(f"- 3-month target: ${essential_expenses * 3:,.2f}")
        context_lines.append(f"- 6-month target: ${essential_expenses * 6:,.2f}")
        if surplus > 0:
            months_to_3mo = (essential_expenses * 3) / surplus if surplus > 0 else float('inf')
            context_lines.append(f"- Time to reach 3-month fund at current surplus: {months_to_3mo:.1f} months")
    
    elif goal_type == 'savings':
        context_lines.append("The user is asking about saving money.")
        context_lines.append(f"- Current monthly surplus: ${surplus:,.2f}")
        context_lines.append(f"- Total flexible expenses: ${abs(monthly_flexible):,.2f}/month")
        context_lines.append("- Areas to review: Subscriptions, dining out, entertainment")
    
    return "\n".join(context_lines)


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


def _build_user_profile_section(context: dict[str, Any]) -> str:
    """Build the user profile section for the prompt."""
    user_profile = context.get("user_profile", {})
    if not user_profile:
        return ""

    lines = ["## User Profile (Personalize based on this)"]

    philosophy = user_profile.get("financial_philosophy")
    if philosophy:
        lines.append(f"- Financial Philosophy: {philosophy}")

    risk = user_profile.get("risk_tolerance")
    if risk:
        lines.append(f"- Risk Tolerance: {risk}")

    goal = user_profile.get("primary_goal")
    if goal:
        lines.append(f"- Primary Goal: {goal}")

    timeline = user_profile.get("goal_timeline")
    if timeline:
        lines.append(f"- Goal Timeline: {timeline}")

    concerns = user_profile.get("financial_concerns")
    if concerns:
        lines.append(f"- Concerns: {', '.join(concerns)}")

    return "\n".join(lines) if len(lines) > 1 else ""


def _build_user_prompt(model: UnifiedBudgetModel, summary: Summary, context: dict[str, Any]) -> str:
    framework = context.get("framework", "neutral")
    total_debt_payments = sum(d.min_payment for d in model.debts)
    surplus_ratio = summary.surplus / summary.total_income if summary.total_income > 0 else 0

    # Get user query from context
    user_query = context.get("user_query", "")
    if not user_query:
        user_query = "Help me optimize my budget and improve my financial situation"

    # Build user profile section
    user_profile_section = _build_user_profile_section(context)
    
    # Detect goal type and build goal-specific context
    goal_type = _detect_goal_type(user_query)
    goal_context = _build_goal_context(goal_type, model, summary)

    base_prompt = USER_PROMPT_TEMPLATE.format(
        user_query=user_query,
        user_profile_section=user_profile_section,
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
    
    # Append goal-specific context after the base prompt
    if goal_context:
        return base_prompt + goal_context
    return base_prompt


class OpenAISuggestionProvider:
    """
    ChatGPT-backed provider that generates personalized budget optimization suggestions.

    Uses function calling to ensure structured outputs that map directly to the
    Suggestion dataclass. Falls back to the deterministic provider on errors.
    """

    name = "openai"

    def __init__(self, settings: Any | None = None):
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
            self._max_tokens = 2048

    def generate(self, request: SuggestionProviderRequest) -> SuggestionProviderResponse:
        # Use try/except to handle different import contexts (test vs runtime)
        try:
            from src.suggestion_provider import (
                DeterministicSuggestionProvider,
                SuggestionProviderRequest,
                SuggestionProviderResponse,
                _log_suggestion_metrics,
            )
        except ImportError:
            from suggestion_provider import (
                SuggestionProviderResponse,
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

    def _parse_suggestions(self, parsed: dict[str, Any]) -> list[Suggestion]:
        """Convert OpenAI response into validated Suggestion objects."""
        suggestions: list[Suggestion] = []
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
