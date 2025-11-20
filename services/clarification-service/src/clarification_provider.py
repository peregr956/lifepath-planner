from __future__ import annotations

"""
Provider abstraction for clarification question generation.

This module defines a JSON-friendly request/response contract plus the Protocol
that concrete implementations (deterministic heuristics, external LLM adapters,
mock fixtures, etc.) must satisfy. Providers are expected to return questions
that downstream services can serialize without knowledge of the underlying
implementation.
"""

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Protocol, runtime_checkable

from budget_model import UnifiedBudgetModel
from question_generator import QuestionSpec, generate_clarification_questions

DEFAULT_MAX_QUESTIONS = 5


@dataclass(slots=True)
class ClarificationProviderRequest:
    """
    Contract for question generation inputs.

    Attributes:
        model: UnifiedBudgetModel whose gaps need clarification.
        max_questions: Upper bound on the number of questions to emit (defaults
            to the deterministic MAX_QUESTIONS constant).
        context: Optional metadata for downstream providers (user locale,
            product surface, etc.). Providers must ignore keys they do not use
            so callers can safely add metadata over time.
    """

    model: UnifiedBudgetModel
    max_questions: int = DEFAULT_MAX_QUESTIONS
    context: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ClarificationProviderResponse:
    """
    Contract for question generation outputs.

    Attributes:
        questions: Ordered collection of question specs. Providers must only
            return QuestionSpec instances so API responses remain deterministic
            and JSON-serializable.
    """

    questions: List[QuestionSpec] = field(default_factory=list)


@runtime_checkable
class ClarificationQuestionProvider(Protocol):
    """
    Pluggable interface for clarification question generators.

    Providers should expose a human-readable `name` attribute (used for logging
    and configuration) plus a single `generate` method that accepts a request
    payload and returns structured clarification questions.
    """

    name: str

    def generate(self, request: ClarificationProviderRequest) -> ClarificationProviderResponse:
        """Produce clarification questions for the provided unified model."""
        ...


class DeterministicClarificationProvider:
    """
    Default provider that wraps the existing rule-based heuristics.

    This adapter ensures the deterministic implementation satisfies the same
    contract as future LLM-backed providers. It delegates to the legacy
    `generate_clarification_questions` helper and handles truncation logic.
    """

    name = "deterministic"

    def generate(self, request: ClarificationProviderRequest) -> ClarificationProviderResponse:
        questions = generate_clarification_questions(request.model)
        limited_questions = questions[: request.max_questions]
        return ClarificationProviderResponse(questions=limited_questions)


class MockClarificationProvider:
    """
    Fixture-driven provider used for tests and offline development.

    Reads a JSON document that mirrors the ClarificationProviderResponse schema
    and replays it verbatim so clients can exercise serialization logic without
    calling a live LLM.
    """

    name = "mock"

    def __init__(self, fixture_path: str | Path | None = None):
        env_override = os.getenv("CLARIFICATION_PROVIDER_FIXTURE")
        candidate = fixture_path or env_override
        if candidate is None:
            candidate = _default_fixture_path()

        self._fixture_path = Path(candidate)
        if not self._fixture_path.exists():
            raise FileNotFoundError(
                f"Mock clarification provider fixture not found at {self._fixture_path}"
            )

    def generate(self, request: ClarificationProviderRequest) -> ClarificationProviderResponse:
        payload = self._load_fixture()
        question_payloads = payload.get("questions", [])
        questions = [_deserialize_question(item) for item in question_payloads]
        return ClarificationProviderResponse(questions=questions[: request.max_questions])

    def _load_fixture(self) -> Dict[str, Any]:
        try:
            return json.loads(self._fixture_path.read_text())
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Mock clarification provider fixture is not valid JSON: {self._fixture_path}"
            ) from exc


def _default_fixture_path() -> Path:
    service_root = Path(__file__).resolve().parents[1]
    return service_root / "tests" / "fixtures" / "mock_clarification_provider.json"


def _deserialize_question(item: Dict[str, Any]) -> QuestionSpec:
    return QuestionSpec(
        question_id=item["question_id"],
        prompt=item["prompt"],
        components=[dict(component) for component in item.get("components", [])],
    )


def build_clarification_provider(name: str | None) -> ClarificationQuestionProvider:
    """
    Factory that instantiates the requested clarification provider.

    Args:
        name: Provider identifier supplied via configuration or env vars.
    """

    normalized = (name or "").strip().lower()
    if normalized in ("", "deterministic"):
        return DeterministicClarificationProvider()
    if normalized == "mock":
        return MockClarificationProvider()

    raise ValueError(f"Unsupported clarification provider '{name}'")



