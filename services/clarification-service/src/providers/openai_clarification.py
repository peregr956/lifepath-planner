"""
OpenAI-powered clarification question provider.

This module implements the ClarificationQuestionProvider protocol using ChatGPT
to generate contextual follow-up questions based on budget gaps and the user's
chosen financial framework (e.g., r/personalfinance flowchart, Money Guy Show).
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from clarification_provider import ClarificationProviderRequest, ClarificationProviderResponse

from budget_model import UnifiedBudgetModel
from openai import APIError, APITimeoutError, OpenAI
from question_generator import QuestionSpec
from shared.observability.privacy import hash_payload

logger = logging.getLogger(__name__)

# JSON schema for OpenAI function calling to ensure structured outputs
QUESTION_SPEC_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question_id": {
                        "type": "string",
                        "description": "Unique identifier for this question (snake_case, e.g., 'question_debt_priority').",
                    },
                    "prompt": {
                        "type": "string",
                        "description": "User-facing question text in plain English.",
                    },
                    "components": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "component": {
                                    "type": "string",
                                    "enum": ["toggle", "dropdown", "number_input", "slider"],
                                    "description": "UI component type.",
                                },
                                "field_id": {
                                    "type": "string",
                                    "description": "Unique field identifier that maps back to the budget model.",
                                },
                                "label": {
                                    "type": "string",
                                    "description": "Short label for the input field.",
                                },
                                "binding": {
                                    "type": "string",
                                    "description": "Dot-path into the unified model (e.g., 'expenses.rent.essential').",
                                },
                                "options": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "For dropdowns: list of valid choices.",
                                },
                                "min": {"type": "number", "description": "Minimum value for number inputs."},
                                "max": {"type": "number", "description": "Maximum value for number inputs."},
                                "unit": {"type": "string", "description": "Unit label (e.g., '%', 'USD')."},
                            },
                            "required": ["component", "field_id", "label", "binding"],
                        },
                        "description": "List of UI components that collect this question's answer(s).",
                    },
                },
                "required": ["question_id", "prompt", "components"],
            },
            "description": "Ordered list of clarification questions.",
        },
    },
    "required": ["questions"],
}

SYSTEM_PROMPT = """You are a financial planning assistant that generates clarification questions to help understand a user's budget and answer their specific question.

CRITICAL: The user has provided a specific question or concern. Your role is to:
1. Generate ONLY the questions needed to answer their specific query
2. Skip questions that aren't relevant to what they're asking about
3. Ask about financial philosophy and risk tolerance ONLY when relevant to their query

Question priorities based on user's query:
- Debt-related query → Focus on debt details (rates, balances) and debt payoff philosophy
- Savings query → Focus on essential vs flexible expenses and savings goals
- Spending query → Focus on essential vs flexible classification
- Investment/retirement query → Ask about risk tolerance and timeline
- General query → Ask broad clarification questions

Budget clarification topics (ask only what's relevant):
1. Missing debt details (interest rates, balances, minimum payments)
2. Expense categorization (essential vs flexible)
3. Income classification (net vs gross, stability)
4. Optimization preferences (debt payoff, savings, balanced)

Profile questions (ask only when relevant to user's query):
- Financial philosophy: "financial_philosophy" - Ask when query involves prioritization decisions
- Risk tolerance: "risk_tolerance" - Ask when query involves investing or long-term planning
- Goal timeline: "goal_timeline" - Ask when query mentions a specific goal

Important guidelines:
- Ask 4-7 concise, actionable questions maximum (fewer is better if that answers their query)
- Prioritize questions that directly help answer the user's specific question
- Use specific UI components: toggle (yes/no), dropdown (choices), number_input (amounts/rates), slider (ranges)
- Field IDs MUST follow these EXACT naming conventions:
  * For expense essentials: "essential_{expense_id}" where {expense_id} is the EXACT expense ID from the model
  * For preferences: "optimization_focus", "primary_income_type", "primary_income_stability"
  * For profile: "financial_philosophy", "risk_tolerance", "goal_timeline"
  * For debt fields: "{debt_id}_balance", "{debt_id}_interest_rate", "{debt_id}_min_payment", "{debt_id}_priority"
- CRITICAL: Use the exact IDs shown in the model (e.g., "expense-draft-0-1"), NOT category names
- Each question_id must be unique

If the user has selected a financial framework:
- r/personalfinance: Focus on emergency fund adequacy, employer match, high-interest debt
- money_guy: Follow their financial order of operations
- neutral: General best practices without framework-specific ordering

Return structured JSON that matches the provided function schema exactly."""

USER_PROMPT_TEMPLATE = """## USER'S QUESTION (This is what they need help with)
"{user_query}"

{query_analysis_section}

Generate ONLY the clarification questions needed to answer their specific question above.

## Budget Summary
- Total Monthly Income: ${total_income:,.2f}
- Total Monthly Expenses: ${total_expenses:,.2f}
- Monthly Surplus: ${surplus:,.2f}

## Income Sources ({income_count})
{income_section}

## Expense Categories ({expense_count})
{expense_section}

## Debts ({debt_count})
{debt_section}

## Current Preferences
- Optimization Focus: {optimization_focus}
- Protect Essentials: {protect_essentials}

## User's Financial Framework
{framework}

{valid_field_ids}

REMEMBER: Only ask questions that help answer: "{user_query}"
Skip irrelevant questions. If their question is about debt, focus on debt. If about spending, focus on expenses.
IMPORTANT: Only use field_ids from the VALID FIELD_IDS section above. Any other field_id will be rejected."""


def _format_income_section(model: UnifiedBudgetModel) -> str:
    if not model.income:
        return "No income sources detected."
    lines = []
    for inc in model.income:
        lines.append(f"- {inc.name}: ${inc.monthly_amount:,.2f}/mo (type={inc.type}, stability={inc.stability})")
    return "\n".join(lines)


def _format_expense_section(model: UnifiedBudgetModel) -> str:
    if not model.expenses:
        return "No expenses detected."
    lines = []
    for exp in model.expenses:
        essential_str = "essential" if exp.essential else ("flexible" if exp.essential is False else "unknown")
        lines.append(f"- {exp.category} [ID: {exp.id}]: ${exp.monthly_amount:,.2f}/mo (essential={essential_str})")
        lines.append(f"  → Use field_id 'essential_{exp.id}' to mark this expense as essential/flexible")
    return "\n".join(lines)


def _format_debt_section(model: UnifiedBudgetModel) -> str:
    if not model.debts:
        return "No debts detected."
    lines = []
    for debt in model.debts:
        lines.append(
            f"- {debt.name} [ID: {debt.id}]: balance=${debt.balance:,.2f}, "
            f"rate={debt.interest_rate}%, min_payment=${debt.min_payment:,.2f}, "
            f"priority={debt.priority}, approximate={debt.approximate}"
        )
        lines.append(
            f"  → Use field_ids like '{debt.id}_balance', '{debt.id}_interest_rate', '{debt.id}_min_payment', etc."
        )
    return "\n".join(lines)


def _build_valid_field_ids_section(model: UnifiedBudgetModel) -> str:
    """Generate a list of all valid field_ids that can be used in questions."""
    lines = ["## VALID FIELD_IDS (use ONLY these exact field_ids):"]

    # Expense essentials
    if model.expenses:
        lines.append("\n### Expense Essentials (use 'essential_' prefix):")
        for exp in model.expenses:
            if exp.essential is None:  # Only show if needs clarification
                lines.append(f"  - essential_{exp.id}  (for {exp.category})")

    # Preferences
    lines.append("\n### Preferences:")
    lines.append("  - optimization_focus")
    lines.append("  - primary_income_type")
    lines.append("  - primary_income_stability")

    # Profile fields (for adaptive personalization)
    lines.append("\n### Profile (ask only when relevant to user's query):")
    lines.append("  - financial_philosophy  (r_personalfinance, money_guy, neutral)")
    lines.append("  - risk_tolerance  (conservative, moderate, aggressive)")
    lines.append("  - goal_timeline  (immediate, short_term, medium_term, long_term)")

    # Debts (only if debts exist)
    if model.debts:
        lines.append("\n### Debt Fields (use '{debt_id}_' prefix):")
        for debt in model.debts:
            lines.append(f"  - {debt.id}_balance")
            lines.append(f"  - {debt.id}_interest_rate")
            lines.append(f"  - {debt.id}_min_payment")
            lines.append(f"  - {debt.id}_priority")
            lines.append(f"  - {debt.id}_approximate")

    lines.append("\n⚠️ CRITICAL: Only use field_ids listed above. Do NOT invent new field_ids.")
    return "\n".join(lines)


def _build_query_analysis_section(user_query: str, context: dict[str, Any]) -> str:
    """Build a section describing the analyzed user query for the AI prompt."""
    if not user_query:
        return ""

    # Import query analyzer to get structured analysis
    try:
        from query_analyzer import analyze_query, get_intent_description

        analysis = analyze_query(user_query)

        lines = ["## Query Analysis (Use this to prioritize questions)"]
        lines.append(f"- Primary intent: {analysis.primary_intent} ({get_intent_description(analysis.primary_intent)})")

        if analysis.secondary_intents:
            lines.append(f"- Secondary intents: {', '.join(analysis.secondary_intents)}")

        if analysis.mentioned_goals:
            lines.append(f"- Mentioned goals: {', '.join(analysis.mentioned_goals)}")

        if analysis.mentioned_concerns:
            lines.append(f"- Concerns: {', '.join(analysis.mentioned_concerns)}")

        if analysis.timeframe != "unspecified":
            lines.append(f"- Timeframe: {analysis.timeframe}")

        # Guidance on what profile questions to ask
        profile_guidance = []
        if analysis.needs_financial_philosophy:
            profile_guidance.append("financial_philosophy")
        if analysis.needs_risk_tolerance:
            profile_guidance.append("risk_tolerance")
        if analysis.needs_timeline_clarification:
            profile_guidance.append("goal_timeline")

        if profile_guidance:
            lines.append(f"- Suggested profile questions: {', '.join(profile_guidance)}")

        return "\n".join(lines)
    except ImportError:
        return ""


def _build_user_prompt(model: UnifiedBudgetModel, context: dict[str, Any]) -> str:
    framework = context.get("framework", "neutral")
    framework_desc = {
        "r_personalfinance": "r/personalfinance flowchart style - prioritize emergency fund, employer match, high-interest debt, tax-advantaged accounts.",
        "money_guy": "Money Guy Show financial order of operations - granular step sequence for saving, investing, and debt.",
        "neutral": "General best practices without a specific framework.",
    }.get(framework, "General best practices without a specific framework.")

    # Get user query from context
    user_query = context.get("user_query", "")
    if not user_query:
        user_query = "Help me understand and optimize my budget"

    # Build query analysis section
    query_analysis_section = _build_query_analysis_section(user_query, context)

    valid_field_ids = _build_valid_field_ids_section(model)
    return USER_PROMPT_TEMPLATE.format(
        user_query=user_query,
        query_analysis_section=query_analysis_section,
        total_income=model.summary.total_income,
        total_expenses=model.summary.total_expenses,
        surplus=model.summary.surplus,
        income_count=len(model.income),
        income_section=_format_income_section(model),
        expense_count=len(model.expenses),
        expense_section=_format_expense_section(model),
        debt_count=len(model.debts),
        debt_section=_format_debt_section(model),
        optimization_focus=model.preferences.optimization_focus,
        protect_essentials=model.preferences.protect_essentials,
        framework=framework_desc,
        valid_field_ids=valid_field_ids,
    )


class OpenAIClarificationProvider:
    """
    ChatGPT-backed provider that generates contextual clarification questions.

    Uses function calling to ensure structured outputs that map directly to the
    QuestionSpec dataclass. Falls back to the deterministic provider on errors.
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
            self._temperature = 0.2
            self._max_tokens = 512

    def generate(self, request: ClarificationProviderRequest) -> ClarificationProviderResponse:
        from clarification_provider import (
            ClarificationProviderResponse,
        )

        if not self._client:
            raise RuntimeError("OpenAI client not configured. Check OPENAI_API_KEY, OPENAI_MODEL, OPENAI_API_BASE.")

        model_dict = asdict(request.model)
        prompt_hash = hash_payload(
            {"system": SYSTEM_PROMPT, "user": _build_user_prompt(request.model, request.context)}
        )

        logger.info(
            {
                "event": "openai_clarification_request",
                "provider": self.name,
                "model": self._model,
                "prompt_hash": prompt_hash,
                "model_hash": hash_payload(model_dict),
            }
        )

        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": _build_user_prompt(request.model, request.context)},
                ],
                tools=[
                    {
                        "type": "function",
                        "function": {
                            "name": "generate_clarification_questions",
                            "description": "Generate structured clarification questions for the budget model.",
                            "parameters": QUESTION_SPEC_SCHEMA,
                        },
                    }
                ],
                tool_choice={"type": "function", "function": {"name": "generate_clarification_questions"}},
                temperature=self._temperature,
                max_tokens=self._max_tokens,
            )

            tool_calls = response.choices[0].message.tool_calls
            if not tool_calls:
                logger.warning({"event": "openai_no_tool_calls", "provider": self.name})
                return self._fallback_to_deterministic(request)

            arguments = tool_calls[0].function.arguments
            parsed = json.loads(arguments)
            questions = self._parse_questions(parsed, request.max_questions, request.model)

            response_hash = hash_payload(parsed)
            logger.info(
                {
                    "event": "openai_clarification_response",
                    "provider": self.name,
                    "question_count": len(questions),
                    "response_hash": response_hash,
                }
            )

            return ClarificationProviderResponse(questions=questions)

        except (APIError, APITimeoutError) as exc:
            logger.error(
                {
                    "event": "openai_clarification_error",
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

    def _parse_questions(
        self, parsed: dict[str, Any], max_questions: int, model: UnifiedBudgetModel
    ) -> list[QuestionSpec]:
        """Convert OpenAI response into validated QuestionSpec objects, filtering out invalid field_ids."""
        # Import normalization utilities for validation
        import normalization

        ESSENTIAL_PREFIX = normalization.ESSENTIAL_PREFIX
        SUPPORTED_SIMPLE_FIELD_IDS = normalization.SUPPORTED_SIMPLE_FIELD_IDS
        parse_debt_field_id = normalization.parse_debt_field_id

        questions: list[QuestionSpec] = []
        raw_questions = parsed.get("questions", [])
        seen_question_ids: set[str] = set()

        # Build sets of valid IDs for validation
        expense_ids = {exp.id for exp in model.expenses}
        debt_ids = {debt.id for debt in model.debts}

        for item in raw_questions[:max_questions]:
            try:
                question_id = item.get("question_id", "")
                prompt = item.get("prompt", "")
                components = item.get("components", [])

                if not question_id or not prompt:
                    continue

                # Ensure unique question_ids by appending index if duplicate
                original_question_id = question_id
                counter = 1
                while question_id in seen_question_ids:
                    question_id = f"{original_question_id}_{counter}"
                    counter += 1
                seen_question_ids.add(question_id)

                validated_components = []
                invalid_field_ids = []

                for comp in components:
                    if not all(k in comp for k in ("component", "field_id", "label", "binding")):
                        continue

                    field_id = comp.get("field_id", "").strip()
                    if not field_id:
                        continue

                    # Validate field_id against actual model
                    is_valid = False

                    # Check expense essentials
                    if field_id.startswith(ESSENTIAL_PREFIX):
                        expense_id = field_id[len(ESSENTIAL_PREFIX) :]
                        if expense_id in expense_ids:
                            is_valid = True
                        else:
                            invalid_field_ids.append(f"{field_id} (expense '{expense_id}' not found)")

                    # Check simple field IDs
                    elif field_id in SUPPORTED_SIMPLE_FIELD_IDS:
                        is_valid = True

                    # Check debt fields
                    else:
                        debt_target = parse_debt_field_id(field_id)
                        if debt_target:
                            debt_id, _ = debt_target
                            if debt_id in debt_ids:
                                is_valid = True
                            else:
                                invalid_field_ids.append(f"{field_id} (debt '{debt_id}' not found)")

                    if is_valid:
                        validated_components.append(comp)

                # Only add question if it has at least one valid component
                if validated_components:
                    if invalid_field_ids:
                        logger.warning(
                            {
                                "event": "openai_invalid_field_ids_filtered",
                                "provider": self.name,
                                "question_id": question_id,
                                "invalid_field_ids": invalid_field_ids,
                            }
                        )
                    questions.append(
                        QuestionSpec(
                            question_id=question_id,
                            prompt=prompt,
                            components=validated_components,
                        )
                    )
            except Exception as exc:
                logger.warning(
                    {
                        "event": "openai_question_parse_skip",
                        "provider": self.name,
                        "error_message": str(exc),
                    }
                )
                continue

        return questions

    def _fallback_to_deterministic(self, request: Any) -> Any:
        """Fall back to deterministic provider when OpenAI fails."""
        from clarification_provider import DeterministicClarificationProvider

        logger.info({"event": "openai_fallback_to_deterministic", "provider": self.name})
        fallback = DeterministicClarificationProvider()
        return fallback.generate(request)
