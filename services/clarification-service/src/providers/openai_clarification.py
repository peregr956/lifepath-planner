"""
OpenAI-powered clarification question provider.

This module implements the ClarificationQuestionProvider protocol using ChatGPT
to generate contextual follow-up questions based on budget gaps and the user's
chosen financial framework (e.g., r/personalfinance flowchart, Money Guy Show).

Prompt Version History:
- v1.0: Original rule-focused prompts with strict field ID validation
- v2.0: Analysis-first approach with grouped questions, more conversational tone
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import asdict
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from clarification_provider import ClarificationProviderRequest, ClarificationProviderResponse

from budget_model import UnifiedBudgetModel
from openai import APIError, APITimeoutError, OpenAI
from question_generator import QuestionSpec
from shared.observability.privacy import hash_payload

logger = logging.getLogger(__name__)

# Prompt versioning for A/B testing
PROMPT_VERSION = os.getenv("CLARIFICATION_PROMPT_VERSION", "2.0")
PROMPT_VERSION_NOTES = {
    "1.0": "Original rule-focused prompts with strict field ID validation",
    "2.0": "Analysis-first approach with grouped questions, conversational tone",
}

# JSON schema for OpenAI function calling to ensure structured outputs
# Updated to support analysis phase and grouped questions
QUESTION_SPEC_SCHEMA = {
    "type": "object",
    "properties": {
        "analysis": {
            "type": "object",
            "properties": {
                "normalized_budget_summary": {
                    "type": "string",
                    "description": "A clear, readable summary of the normalized budget with grouped categories and totals.",
                },
                "net_position": {
                    "type": "string",
                    "description": "The calculated net monthly position (surplus or deficit) with the dollar amount.",
                },
                "critical_observations": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Key observations about the budget, especially any inconsistencies (e.g., user asks about surplus but budget shows deficit).",
                },
                "reasoning": {
                    "type": "string",
                    "description": "Explanation of what the numbers suggest and what needs clarification before giving advice.",
                },
            },
            "required": ["normalized_budget_summary", "net_position", "critical_observations", "reasoning"],
            "description": "Initial analysis of the budget before asking questions.",
        },
        "question_groups": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "group_id": {
                        "type": "string",
                        "description": "Section identifier (e.g., 'A', 'B', 'C').",
                    },
                    "group_title": {
                        "type": "string",
                        "description": "Title explaining the purpose of this group (e.g., 'Is There Actually a Surplus?').",
                    },
                    "questions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "question_id": {
                                    "type": "string",
                                    "description": "Unique identifier for this question (snake_case).",
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
                                                "enum": ["toggle", "dropdown", "number_input", "slider", "text_input"],
                                                "description": "UI component type.",
                                            },
                                            "field_id": {
                                                "type": "string",
                                                "description": "Unique field identifier (use descriptive names like 'actual_monthly_surplus', 'emergency_fund_months', etc.).",
                                },
                                "label": {
                                    "type": "string",
                                    "description": "Short label for the input field.",
                                },
                                "binding": {
                                    "type": "string",
                                                "description": "Dot-path into the unified model (e.g., 'preferences.actual_surplus').",
                                },
                                "options": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "For dropdowns: list of valid choices.",
                                },
                                "min": {"type": "number", "description": "Minimum value for number inputs."},
                                "max": {"type": "number", "description": "Maximum value for number inputs."},
                                            "unit": {"type": "string", "description": "Unit label (e.g., '%', 'USD', 'months')."},
                            },
                                        "required": ["component", "field_id", "label"],
                        },
                        "description": "List of UI components that collect this question's answer(s).",
                    },
                },
                "required": ["question_id", "prompt", "components"],
            },
                        "description": "Questions in this group.",
                    },
                },
                "required": ["group_id", "group_title", "questions"],
            },
            "description": "Logically grouped questions with section headers.",
        },
        "next_steps": {
            "type": "string",
            "description": "Brief explanation of what happens after these questions are answered.",
        },
    },
    "required": ["analysis", "question_groups", "next_steps"],
}

SYSTEM_PROMPT = """You are a thoughtful financial advisor helping someone understand their budget and make better financial decisions.

Your approach follows three steps:
1. ANALYZE the budget first - normalize it, calculate totals, and identify any critical observations
2. IDENTIFY what needs clarification before you can give good advice
3. ASK targeted questions organized into logical groups

## Your Analysis Phase

Before asking questions, you must:
- Present a clear summary of the normalized budget with grouped categories
- Calculate and state the net monthly position (surplus or deficit)
- Identify any critical observations, especially inconsistencies (e.g., if someone asks about "surplus" but the budget shows a deficit)
- Explain your reasoning about what the numbers suggest

## Your Questions

Organize questions into logical groups with clear section headers. For example:
- "A. Is There Actually a Surplus?" - when budget math doesn't add up
- "B. Savings and Liquidity Context" - emergency fund status, savings goals
- "C. Debt Structure and Interest Rates" - when debt exists
- "D. Near-Term Goals and Constraints" - upcoming expenses, life changes
- "E. Risk Tolerance and Preferences" - for investment-related questions

CRITICAL: Prioritize questions that address the most important issues FIRST. If someone asks about surplus but the budget shows a deficit, ask about that discrepancy before anything else.

## Question Components

Use appropriate UI components:
- toggle: yes/no questions
- dropdown: multiple choice (provide options array)
- number_input: amounts, rates, balances (can include min, max, unit)
- slider: ranges or percentages
- text_input: open-ended when structured input won't work

## Field ID Guidelines

Use descriptive, semantic field IDs that make sense:
- For expense classification: "essential_{category_name}" (e.g., "essential_rent", "essential_groceries")
- For debt details: "{debt_name}_{attribute}" (e.g., "credit_card_interest_rate", "student_loan_balance")
- For new data: descriptive names like "actual_monthly_surplus", "emergency_fund_months", "retirement_account_type"
- For preferences: "optimization_focus", "risk_tolerance", "financial_philosophy"

Be natural with field IDs - they will be mapped to the data model automatically.

## Tone

Be conversational and helpful. Explain WHY you're asking each group of questions. Show that you understand the user's situation and are trying to help them specifically.

Return structured JSON matching the provided function schema."""

USER_PROMPT_TEMPLATE = """This is a user's budget. Their question is:

"{user_query}"

Please:
1. First, analyze and normalize the budget - present it clearly with grouped categories and totals
2. Calculate the net monthly position and note any critical observations
3. Then ask the clarifying questions needed before you can give good advice on their question

---

## Raw Budget Data

### Income ({income_count} sources)
{income_section}

### Expenses ({expense_count} categories)
{expense_section}

### Debts ({debt_count} accounts)
{debt_section}

---

## Calculated Totals
- Total Monthly Income: ${total_income:,.2f}
- Total Monthly Expenses: ${total_expenses:,.2f}  
- Apparent Monthly Surplus/Deficit: ${surplus:,.2f}

{savings_note}

---

{query_analysis_section}

## User's Financial Approach
{framework}

---

Remember: Analyze first, then ask targeted questions organized into logical groups that will help you answer: "{user_query}"

If the numbers don't add up (e.g., user asks about surplus but budget shows deficit), address that discrepancy first."""


def _format_income_section(model: UnifiedBudgetModel) -> str:
    """Format income sources in a clean, readable way."""
    if not model.income:
        return "No income sources detected."
    lines = []
    for inc in model.income:
        stability_note = f" ({inc.stability})" if inc.stability != "stable" else ""
        type_note = f" [{inc.type}]" if inc.type != "earned" else ""
        lines.append(f"- {inc.name}: ${inc.monthly_amount:,.2f}/mo{type_note}{stability_note}")
    return "\n".join(lines)


def _format_expense_section(model: UnifiedBudgetModel) -> str:
    """Format expenses grouped by category type for better readability."""
    if not model.expenses:
        return "No expenses detected."
    
    # Group expenses by essential status
    essential = [e for e in model.expenses if e.essential is True]
    flexible = [e for e in model.expenses if e.essential is False]
    unknown = [e for e in model.expenses if e.essential is None]
    
    lines = []
    
    if essential:
        lines.append("**Essential (protected):**")
        for exp in essential:
            lines.append(f"  - {exp.category}: ${abs(exp.monthly_amount):,.2f}/mo")
    
    if flexible:
        lines.append("**Flexible (can adjust):**")
        for exp in flexible:
            lines.append(f"  - {exp.category}: ${abs(exp.monthly_amount):,.2f}/mo")
    
    if unknown:
        lines.append("**Not yet classified:**")
        for exp in unknown:
            lines.append(f"  - {exp.category}: ${abs(exp.monthly_amount):,.2f}/mo")
    
    return "\n".join(lines)


def _format_debt_section(model: UnifiedBudgetModel) -> str:
    """Format debts with key details for analysis."""
    if not model.debts:
        return "No debts detected."
    
    lines = []
    total_debt = sum(d.balance for d in model.debts)
    total_min_payments = sum(d.min_payment for d in model.debts)
    
    for debt in model.debts:
        rate_str = f"{debt.interest_rate}% APR" if debt.interest_rate > 0 else "rate unknown"
        balance_str = f"${debt.balance:,.2f}" if debt.balance > 0 else "balance unknown"
        approx_note = " (approximate)" if debt.approximate else ""
        lines.append(f"- {debt.name}: {balance_str} at {rate_str}, min payment ${debt.min_payment:,.2f}/mo{approx_note}")
    
    lines.append(f"\n**Total Debt: ${total_debt:,.2f} | Total Monthly Payments: ${total_min_payments:,.2f}**")
    return "\n".join(lines)


def _build_savings_note(model: UnifiedBudgetModel) -> str:
    """Build a note about savings if detected in expenses."""
    # Look for savings-related expenses (they might be categorized as expenses)
    savings_keywords = ["savings", "emergency", "retirement", "401k", "ira", "investment"]
    savings_items = []
    
        for exp in model.expenses:
        category_lower = exp.category.lower()
        if any(keyword in category_lower for keyword in savings_keywords):
            savings_items.append(f"- {exp.category}: ${abs(exp.monthly_amount):,.2f}/mo")
    
    if savings_items:
        return "**Note:** The following appear to be savings/investments (included in expenses above):\n" + "\n".join(savings_items)
    return ""


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
    """Build the user prompt with budget context and the user's question."""
    framework = context.get("framework", "neutral")
    framework_desc = {
        "r_personalfinance": "Following r/personalfinance flowchart: emergency fund → employer match → high-interest debt → tax-advantaged accounts → investing.",
        "money_guy": "Following Money Guy Show order of operations: emergency fund → employer match → high-rate debt → Roth → 15% to retirement → HSA → taxable.",
        "neutral": "No specific framework - use general best practices balanced across debt, savings, and lifestyle.",
    }.get(framework, "No specific framework - use general best practices.")

    # Get user query from context
    user_query = context.get("user_query", "")
    if not user_query:
        user_query = "Help me understand and optimize my budget"

    # Build query analysis section if available
    query_analysis_section = _build_query_analysis_section(user_query, context)
    if query_analysis_section:
        query_analysis_section = f"## Additional Context\n{query_analysis_section}"

    # Build savings note
    savings_note = _build_savings_note(model)

    return USER_PROMPT_TEMPLATE.format(
        user_query=user_query,
        query_analysis_section=query_analysis_section,
        total_income=model.summary.total_income,
        total_expenses=abs(model.summary.total_expenses),  # Show as positive for readability
        surplus=model.summary.surplus,
        income_count=len(model.income),
        income_section=_format_income_section(model),
        expense_count=len(model.expenses),
        expense_section=_format_expense_section(model),
        debt_count=len(model.debts),
        debt_section=_format_debt_section(model),
        savings_note=savings_note,
        framework=framework_desc,
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
            self._temperature = 0.6  # Higher for more natural responses
            self._max_tokens = 2048  # Increased for analysis + grouped questions

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
                "prompt_version": PROMPT_VERSION,
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
        """Convert OpenAI response into QuestionSpec objects from the new grouped format.
        
        The new format includes:
        - analysis: Initial budget analysis with observations
        - question_groups: Logically grouped questions
        - next_steps: Explanation of what happens next
        
        We flatten the groups into a list while preserving group context in the prompt.
        Field IDs are now more flexibly validated and mapped.
        """
        questions: list[QuestionSpec] = []
        seen_question_ids: set[str] = set()

        # Log the analysis if present (for debugging/observability)
        analysis = parsed.get("analysis", {})
        if analysis:
            logger.info(
                {
                    "event": "openai_budget_analysis",
                    "provider": self.name,
                    "net_position": analysis.get("net_position", "unknown"),
                    "critical_observations_count": len(analysis.get("critical_observations", [])),
                }
            )
        
        # Extract questions from groups
        question_groups = parsed.get("question_groups", [])
        
        # Also support legacy flat format for backward compatibility
        if not question_groups and "questions" in parsed:
            question_groups = [{"group_id": "A", "group_title": "Questions", "questions": parsed["questions"]}]
        
        question_count = 0
        for group in question_groups:
            group_id = group.get("group_id", "")
            group_title = group.get("group_title", "")
            group_questions = group.get("questions", [])
            
            for item in group_questions:
                if question_count >= max_questions:
                    break
                    
            try:
                question_id = item.get("question_id", "")
                prompt = item.get("prompt", "")
                components = item.get("components", [])

                if not question_id or not prompt:
                    continue

                    # Ensure unique question_ids
                original_question_id = question_id
                counter = 1
                while question_id in seen_question_ids:
                    question_id = f"{original_question_id}_{counter}"
                    counter += 1
                seen_question_ids.add(question_id)

                    # Process components with relaxed validation
                validated_components = []
                for comp in components:
                        # Require at minimum: component type, field_id, and label
                        if not all(k in comp for k in ("component", "field_id", "label")):
                        continue

                    field_id = comp.get("field_id", "").strip()
                    if not field_id:
                        continue

                        # Map field_id to a valid format if needed
                        mapped_field_id = self._map_field_id(field_id, model)
                        
                        # Build the validated component
                        validated_comp = {
                            "component": comp["component"],
                            "field_id": mapped_field_id,
                            "label": comp["label"],
                            "binding": comp.get("binding", f"answers.{mapped_field_id}"),
                        }
                        
                        # Copy optional fields
                        if "options" in comp:
                            validated_comp["options"] = comp["options"]
                        if "min" in comp:
                            validated_comp["min"] = comp["min"]
                        if "max" in comp:
                            validated_comp["max"] = comp["max"]
                        if "unit" in comp:
                            validated_comp["unit"] = comp["unit"]
                        
                        validated_components.append(validated_comp)

                    # Add question if it has components
                    if validated_components:
                        # Prepend group context to prompt if available
                        full_prompt = prompt
                        if group_title and group_id:
                            # Store group info but don't modify the prompt display
                            pass
                        
                    questions.append(
                        QuestionSpec(
                            question_id=question_id,
                                prompt=full_prompt,
                            components=validated_components,
                        )
                    )
                        question_count += 1
                        
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
    
    def _map_field_id(self, field_id: str, model: UnifiedBudgetModel) -> str:
        """Map a field_id to a valid format, attempting to fix common variations.
        
        This is more permissive than strict validation - it tries to map
        semantic field IDs to the expected format.
        """
        import normalization
        
        # If it's already a supported simple field ID, use it
        if field_id in normalization.SUPPORTED_SIMPLE_FIELD_IDS:
            return field_id
        
        # Build lookup maps
        expense_by_category = {exp.category.lower().replace(" ", "_"): exp.id for exp in model.expenses}
        expense_ids = {exp.id for exp in model.expenses}
        debt_by_name = {debt.name.lower().replace(" ", "_"): debt.id for debt in model.debts}
        debt_ids = {debt.id for debt in model.debts}
        
        field_lower = field_id.lower()
        
        # Handle essential_* pattern
        if field_lower.startswith("essential_"):
            suffix = field_id[len("essential_"):]
            suffix_lower = suffix.lower().replace(" ", "_")
            
            # Check if suffix is already a valid expense ID
            if suffix in expense_ids:
                return f"essential_{suffix}"
            
            # Try to match by category name
            if suffix_lower in expense_by_category:
                return f"essential_{expense_by_category[suffix_lower]}"
            
            # Fuzzy match
            for cat_name, exp_id in expense_by_category.items():
                if suffix_lower in cat_name or cat_name in suffix_lower:
                    return f"essential_{exp_id}"
        
        # Handle debt field patterns like "credit_card_interest_rate"
        debt_fields = ["balance", "interest_rate", "min_payment", "priority", "approximate"]
        for debt_field in debt_fields:
            if field_lower.endswith(f"_{debt_field}"):
                prefix = field_id[:-(len(debt_field) + 1)]
                prefix_lower = prefix.lower().replace(" ", "_")
                
                # Check if prefix is already a valid debt ID
                if prefix in debt_ids:
                    return f"{prefix}_{debt_field}"
                
                # Try to match by debt name
                if prefix_lower in debt_by_name:
                    return f"{debt_by_name[prefix_lower]}_{debt_field}"
                
                # Fuzzy match
                for debt_name, debt_id in debt_by_name.items():
                    if prefix_lower in debt_name or debt_name in prefix_lower:
                        return f"{debt_id}_{debt_field}"
        
        # If we can't map it, return the original - it might be a new field type
        # that will be handled by the answer processing
        logger.info(
            {
                "event": "field_id_unmapped",
                "provider": self.name,
                "original_field_id": field_id,
            }
        )
        return field_id

    def _fallback_to_deterministic(self, request: Any) -> Any:
        """Fall back to deterministic provider when OpenAI fails."""
        from clarification_provider import DeterministicClarificationProvider

        logger.info({"event": "openai_fallback_to_deterministic", "provider": self.name})
        fallback = DeterministicClarificationProvider()
        return fallback.generate(request)
