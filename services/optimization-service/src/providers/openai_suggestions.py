"""
OpenAI-powered suggestion provider for budget optimization.

This module implements the SuggestionProvider protocol using ChatGPT to generate
personalized financial recommendations based on the user's clarified budget model,
computed summary, and chosen financial ideology (framework).

Prompt Version History:
- v1.0: Original rule-focused prompts with structured suggestions
- v2.0: Analysis-first approach, more creative and personalized, conversational tone
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import asdict

# Inline dataclass definition to avoid circular import issues
from dataclasses import dataclass as _dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from suggestion_provider import SuggestionProviderRequest, SuggestionProviderResponse

from openai import APIError, APITimeoutError, OpenAI
from shared.observability.privacy import hash_payload

# Prompt versioning for A/B testing
PROMPT_VERSION = os.getenv("SUGGESTION_PROMPT_VERSION", "2.0")
PROMPT_VERSION_NOTES = {
    "1.0": "Original rule-focused prompts with structured suggestions",
    "2.0": "Analysis-first approach, more creative and personalized, conversational tone",
}


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
# Updated to include analysis and more detailed suggestions
SUGGESTION_SCHEMA = {
    "type": "object",
    "properties": {
        "analysis": {
            "type": "object",
            "properties": {
                "budget_assessment": {
                    "type": "string",
                    "description": "Brief assessment of the user's current financial position.",
                },
                "key_observations": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Important observations about the budget (positive and negative).",
                },
                "answer_to_question": {
                    "type": "string",
                    "description": "Direct, concise answer to the user's specific question before diving into suggestions.",
                },
            },
            "required": ["budget_assessment", "key_observations", "answer_to_question"],
            "description": "Initial analysis before providing suggestions.",
        },
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "Unique identifier (e.g., 'surplus-allocation', 'debt-acceleration').",
                    },
                    "title": {
                        "type": "string",
                        "description": "Action-oriented headline that directly relates to their question.",
                    },
                    "description": {
                        "type": "string",
                        "description": "Detailed explanation with specific steps on HOW to implement this recommendation.",
                    },
                    "expected_monthly_impact": {
                        "type": "number",
                        "description": "Estimated monthly dollar impact (positive = savings/freed cash). Use 0 if not applicable.",
                    },
                    "rationale": {
                        "type": "string",
                        "description": "Why this makes sense for THEIR specific situation. Reference their question and budget numbers.",
                    },
                    "tradeoffs": {
                        "type": "string",
                        "description": "What they give up, risks to consider, or alternative approaches.",
                    },
                    "timeline": {
                        "type": "string",
                        "description": "When they should do this and how long it takes to see results.",
                    },
                },
                "required": ["id", "title", "description", "expected_monthly_impact", "rationale", "tradeoffs"],
            },
            "description": "Ordered list of suggestions (3-6 items), with most relevant to their question first.",
        },
        "what_comes_next": {
            "type": "string",
            "description": "Brief explanation of what they should do after reviewing these suggestions.",
        },
    },
    "required": ["analysis", "suggestions", "what_comes_next"],
}

SYSTEM_PROMPT = """You are a thoughtful financial advisor helping someone make better decisions with their money.

Your approach:
1. First UNDERSTAND their specific question and situation
2. Provide a DIRECT ANSWER to their question before anything else
3. Then offer ACTIONABLE SUGGESTIONS with specific steps, dollar amounts, and timelines

## Your Response Structure

**Analysis First:**
- Assess their financial position honestly (strengths and concerns)
- Make key observations about their budget
- Directly answer their question in 1-2 sentences

**Then Suggestions:**
- Lead with what's MOST RELEVANT to their question
- Be specific: use their actual numbers, calculate real impacts
- Explain HOW to do things, not just WHAT to do
- Acknowledge tradeoffs honestly

## Be Specific and Helpful

Instead of: "Consider reducing discretionary spending"
Say: "Your dining out ($150/mo) and subscriptions ($30/mo) total $180. Cutting dining to $100 and reviewing subscriptions could free up $60-80/month toward your goal."

Instead of: "Build an emergency fund"
Say: "Based on your essential expenses of $X, a 3-month emergency fund is $Y. At your current surplus of $Z, you could reach this in N months by..."

## For Common Goals

**Surplus allocation:** Consider their debts (interest rates), savings status, and goals. Don't give a generic answer - tell them specifically what to do with their money based on their situation.

**Debt payoff:** Calculate actual payoff timelines. Compare strategies. Use their real debt numbers.

**Saving for goals:** Calculate how long it takes. Suggest where to keep the money. Be realistic about timelines.

**Retirement:** Consider their age, income, and existing contributions. Reference actual contribution limits and employer matching.

## Personalization

If they've indicated a financial philosophy or risk tolerance, respect it. If they follow r/personalfinance or Money Guy frameworks, align your suggestions accordingly - but always prioritize their specific question first.

## Tone

Be conversational and helpful, like a knowledgeable friend. Explain your reasoning. Acknowledge that personal finance involves tradeoffs and there's rarely one "right" answer.

Never guarantee outcomes. Frame suggestions as ideas to consider. Be honest about uncertainty.

Return structured JSON matching the provided schema."""

USER_PROMPT_TEMPLATE = """This person is asking for financial advice. Their question:

"{user_query}"

Please analyze their budget and provide targeted suggestions that directly address their question.

---

## Their Financial Situation

**Monthly Cash Flow:**
- Income: ${total_income:,.2f}
- Expenses: ${total_expenses:,.2f}
- Net Position: ${surplus:,.2f} ({surplus_status})

{user_profile_section}

---

## Income Details ({income_count} sources)
{income_section}

---

## Expenses ({expense_count} categories)
{expense_section}

---

## Debts ({debt_count} accounts)
{debt_section}
{debt_summary}

---

## Their Preferences
- Focus: {optimization_focus}
- Protect essential expenses: {protect_essentials}
{framework_section}

---

Remember: Start by directly answering their question ("{user_query}"), then provide 3-6 specific, actionable suggestions. Use their actual numbers. Be helpful and conversational."""


def _format_income_section(model: UnifiedBudgetModel) -> str:
    if not model.income:
        return "No income sources detected."
    lines = []
    for inc in model.income:
        lines.append(f"- {inc.name}: ${inc.monthly_amount:,.2f}/mo ({inc.type}, {inc.stability})")
    return "\n".join(lines)


def _format_expense_section(model: UnifiedBudgetModel) -> str:
    """Format expenses grouped by essential status with totals."""
    if not model.expenses:
        return "No expenses detected."
    
    # Group by essential vs flexible
    essential = [e for e in model.expenses if e.essential is True]
    flexible = [e for e in model.expenses if e.essential is False]
    unknown = [e for e in model.expenses if e.essential is None]
    
    lines = []
    
    if essential:
        essential_total = sum(abs(e.monthly_amount) for e in essential)
        lines.append(f"**Essential (${essential_total:,.2f}/mo total):**")
    for exp in essential:
            lines.append(f"  - {exp.category}: ${abs(exp.monthly_amount):,.2f}")
    
    if flexible:
        flexible_total = sum(abs(e.monthly_amount) for e in flexible)
        lines.append(f"**Flexible (${flexible_total:,.2f}/mo total):**")
    for exp in flexible:
            lines.append(f"  - {exp.category}: ${abs(exp.monthly_amount):,.2f}")
    
    if unknown:
        unknown_total = sum(abs(e.monthly_amount) for e in unknown)
        lines.append(f"**Unclassified (${unknown_total:,.2f}/mo total):**")
        for exp in unknown:
            lines.append(f"  - {exp.category}: ${abs(exp.monthly_amount):,.2f}")
    
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
    """Build the user prompt with budget context and the user's question."""
    framework = context.get("framework", "neutral")
    total_debt_payments = sum(d.min_payment for d in model.debts)

    # Get user query from context
    user_query = context.get("user_query", "")
    if not user_query:
        user_query = "Help me optimize my budget and improve my financial situation"

    # Build user profile section
    user_profile_section = _build_user_profile_section(context)
    
    # Determine surplus status description
    if summary.surplus > 0:
        surplus_status = f"${summary.surplus:,.2f}/month surplus"
    elif summary.surplus < 0:
        surplus_status = f"${abs(summary.surplus):,.2f}/month deficit"
    else:
        surplus_status = "breaking even"
    
    # Build debt summary
    if model.debts:
        total_debt = sum(d.balance for d in model.debts)
        highest_rate = max((d.interest_rate for d in model.debts), default=0)
        debt_summary = f"**Total Debt: ${total_debt:,.2f} | Monthly Payments: ${total_debt_payments:,.2f} | Highest Rate: {highest_rate}%**"
    else:
        debt_summary = "**No debts - great position for savings!**"
    
    # Build framework section
    if framework != "neutral":
        framework_section = f"- Financial approach: {_get_framework_description(framework)}"
    else:
        framework_section = ""
    
    # Detect goal type and build goal-specific context
    goal_type = _detect_goal_type(user_query)
    goal_context = _build_goal_context(goal_type, model, summary)

    base_prompt = USER_PROMPT_TEMPLATE.format(
        user_query=user_query,
        user_profile_section=user_profile_section,
        total_income=summary.total_income,
        total_expenses=abs(summary.total_expenses),  # Show as positive
        surplus=summary.surplus,
        surplus_status=surplus_status,
        income_count=len(model.income),
        income_section=_format_income_section(model),
        expense_count=len(model.expenses),
        expense_section=_format_expense_section(model),
        debt_count=len(model.debts),
        debt_section=_format_debt_section(model),
        debt_summary=debt_summary,
        optimization_focus=model.preferences.optimization_focus,
        protect_essentials=model.preferences.protect_essentials,
        framework_section=framework_section,
    )
    
    # Append goal-specific context after the base prompt
    if goal_context:
        return base_prompt + "\n" + goal_context
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
            self._temperature = 0.7  # Higher for more creative, personalized responses
            self._max_tokens = 4096  # Increased for analysis + detailed suggestions

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
                "prompt_version": PROMPT_VERSION,
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
        """Convert OpenAI response into validated Suggestion objects.
        
        Handles the new schema with analysis section and is more lenient
        with optional fields.
        """
        suggestions: list[Suggestion] = []
        
        # Log analysis if present (for observability)
        analysis = parsed.get("analysis", {})
        if analysis:
            logger.info(
                {
                    "event": "openai_budget_analysis",
                    "provider": self.name,
                    "has_assessment": bool(analysis.get("budget_assessment")),
                    "observations_count": len(analysis.get("key_observations", [])),
                    "has_answer": bool(analysis.get("answer_to_question")),
                }
            )
        
        raw_suggestions = parsed.get("suggestions", [])

        for item in raw_suggestions:
            try:
                # Require minimum fields - be lenient with others
                if not item.get("title") or not item.get("description"):
                    logger.warning(
                        {
                            "event": "openai_suggestion_skip_missing_title_or_description",
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

                # Generate an ID if missing
                suggestion_id = str(item.get("id", f"suggestion_{len(suggestions) + 1}"))
                
                # Get optional fields with defaults
                rationale = str(item.get("rationale", ""))[:500] if item.get("rationale") else ""
                tradeoffs = str(item.get("tradeoffs", ""))[:500] if item.get("tradeoffs") else ""
                
                # Include timeline in description if present
                description = str(item["description"])
                timeline = item.get("timeline")
                if timeline:
                    description = f"{description}\n\n**Timeline:** {timeline}"

                suggestions.append(
                    Suggestion(
                        id=suggestion_id,
                        title=str(item["title"])[:100],
                        description=description[:800],  # Increased cap for timeline
                        expected_monthly_impact=round(impact, 2),
                        rationale=rationale,
                        tradeoffs=tradeoffs,
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
