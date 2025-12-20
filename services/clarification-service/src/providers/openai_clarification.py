"""
OpenAI-powered clarification question provider.

This module implements the ClarificationQuestionProvider protocol using ChatGPT
to generate contextual follow-up questions based on budget gaps and the user's
chosen financial framework (e.g., r/personalfinance flowchart, Money Guy Show).
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
OPTIMIZATION_SRC = SERVICES_ROOT / "optimization-service" / "src"
if OPTIMIZATION_SRC.exists() and str(OPTIMIZATION_SRC) not in sys.path:
    sys.path.insert(0, str(OPTIMIZATION_SRC))

from openai import OpenAI, APIError, APITimeoutError

from budget_model import UnifiedBudgetModel
from question_generator import QuestionSpec
from observability.privacy import hash_payload

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

SYSTEM_PROMPT = """You are a financial planning assistant that generates clarification questions to help understand a user's budget.

Your role is to identify gaps in the budget data and ask targeted questions to fill them. Focus on:
1. Missing debt details (interest rates, balances, minimum payments, payoff priority)
2. Income classification (net vs gross, stability)  
3. Expense categorization (essential vs flexible)
4. User preferences for optimization (debt payoff, savings, balanced approach)

Important guidelines:
- Ask 4-7 concise, actionable questions maximum
- Use specific UI components: toggle (yes/no), dropdown (choices), number_input (amounts/rates), slider (ranges)
- Field IDs must follow naming conventions: essential_{expense_id}, {debt_id}_balance, {debt_id}_interest_rate, etc.
- Binding paths use dot notation: expenses.{id}.essential, debts.{id}.balance, preferences.optimization_focus
- Skip questions for data that's already complete in the model

If the user has selected a financial framework:
- r/personalfinance: Focus on emergency fund adequacy, employer match, high-interest debt
- money_guy: Follow their financial order of operations (emergency → match → high-rate debt → Roth → etc.)
- neutral: General best practices without framework-specific ordering

Return structured JSON that matches the provided function schema exactly."""

USER_PROMPT_TEMPLATE = """Analyze this budget model and generate clarification questions for missing or uncertain information.

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

Generate questions to fill gaps. Prioritize debt details and essential/flexible classification for expenses marked with essential=null."""


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
        lines.append(f"- {exp.category} [{exp.id}]: ${exp.monthly_amount:,.2f}/mo (essential={essential_str})")
    return "\n".join(lines)


def _format_debt_section(model: UnifiedBudgetModel) -> str:
    if not model.debts:
        return "No debts detected."
    lines = []
    for debt in model.debts:
        lines.append(
            f"- {debt.name} [{debt.id}]: balance=${debt.balance:,.2f}, "
            f"rate={debt.interest_rate}%, min_payment=${debt.min_payment:,.2f}, "
            f"priority={debt.priority}, approximate={debt.approximate}"
        )
    return "\n".join(lines)


def _build_user_prompt(model: UnifiedBudgetModel, context: Dict[str, Any]) -> str:
    framework = context.get("framework", "neutral")
    framework_desc = {
        "r_personalfinance": "r/personalfinance flowchart style - prioritize emergency fund, employer match, high-interest debt, tax-advantaged accounts.",
        "money_guy": "Money Guy Show financial order of operations - granular step sequence for saving, investing, and debt.",
        "neutral": "General best practices without a specific framework.",
    }.get(framework, "General best practices without a specific framework.")

    return USER_PROMPT_TEMPLATE.format(
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
    )


class OpenAIClarificationProvider:
    """
    ChatGPT-backed provider that generates contextual clarification questions.

    Uses function calling to ensure structured outputs that map directly to the
    QuestionSpec dataclass. Falls back to the deterministic provider on errors.
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
            self._temperature = 0.2
            self._max_tokens = 512

    def generate(self, request: "ClarificationProviderRequest") -> "ClarificationProviderResponse":
        from clarification_provider import (
            ClarificationProviderRequest,
            ClarificationProviderResponse,
            DeterministicClarificationProvider,
        )

        if not self._client:
            raise RuntimeError("OpenAI client not configured. Check OPENAI_API_KEY, OPENAI_MODEL, OPENAI_API_BASE.")

        model_dict = asdict(request.model)
        prompt_hash = hash_payload({"system": SYSTEM_PROMPT, "user": _build_user_prompt(request.model, request.context)})

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
            questions = self._parse_questions(parsed, request.max_questions)

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

    def _parse_questions(self, parsed: Dict[str, Any], max_questions: int) -> List[QuestionSpec]:
        """Convert OpenAI response into validated QuestionSpec objects."""
        questions: List[QuestionSpec] = []
        raw_questions = parsed.get("questions", [])

        for item in raw_questions[:max_questions]:
            try:
                question_id = item.get("question_id", "")
                prompt = item.get("prompt", "")
                components = item.get("components", [])

                if not question_id or not prompt:
                    continue

                validated_components = []
                for comp in components:
                    if not all(k in comp for k in ("component", "field_id", "label", "binding")):
                        continue
                    validated_components.append(comp)

                if validated_components:
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

